"""把 Base 2 (Zkb8b0Gdaa0kVissTz0cuZOBnCe/tblNj1CpbDBRHeLd) 的 51 条论文 records
完完全全导入到主 Base papers 表 + 本地 SQLite.

只迁元数据 (标题/期刊/状态/DOI/作者/分区/摘要), 不迁过程材料附件 (zhangqian_log 仍是 SoT,
论文流水线页直接从 Base 2 拉, 不重复存)。

去重: 标题 normalize 后匹配已有 papers 行 (与 paper_external.py 的 _norm_title 一致)。
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
import sys
from datetime import datetime, date
from pathlib import Path
from typing import Any

# 添加 backend 根到 path 以便 import app.*
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import settings  # noqa: E402
from app.db import SessionLocal  # noqa: E402
from app.models import Member, Paper, PaperAuthor  # noqa: E402
from app.services.lark import LarkClient  # noqa: E402
from app.services.sync import push_record_to_base  # noqa: E402
from sqlalchemy import select  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger("migrate")

SOURCE_APP_TOKEN = "Zkb8b0Gdaa0kVissTz0cuZOBnCe"
SOURCE_TABLE = "tblNj1CpbDBRHeLd"

STATUS_MAP = {
    "已上线": "published",
    "接收": "accepted",
    "已接收": "accepted",
    "已接受": "accepted",
    "同行评审中": "under_review",
    "初审中": "under_review",
    "内部返修": "under_review",
    "二轮返修已提交": "under_review",
    "投稿中": "under_review",
    "返修中": "under_review",
    "创新模型": "in_progress",
    "开题报告": "in_progress",
    "做实验": "in_progress",
    "初稿中": "in_progress",
    "暂时挂起": "in_progress",
    "拒稿": "rejected",
    "被拒": "rejected",
}

_TITLE_NORMALIZE_RE = re.compile(r"[\s\W_]+", re.UNICODE)


def norm_title(s: str | None) -> str:
    if not s:
        return ""
    return _TITLE_NORMALIZE_RE.sub("", s).lower()


def _ts_to_date(value: Any) -> date | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        try:
            return datetime.fromtimestamp(value / 1000).date()
        except Exception:
            return None
    return None


def _ts_to_year(value: Any) -> int | None:
    d = _ts_to_date(value)
    return d.year if d else None


def _pick_status(text: str | None) -> str:
    if not text:
        return "in_progress"
    return STATUS_MAP.get(text.strip(), "in_progress")


def _pick_venue_type(venue: str) -> str:
    v = (venue or "").lower()
    if any(k in v for k in ["conference", "conf.", "workshop", "symposium", "proceedings"]):
        if "workshop" in v:
            return "workshop"
        return "conference"
    if "arxiv" in v or "preprint" in v:
        return "preprint"
    return "journal"


def _pick_venue_level(fields: dict) -> str | None:
    parts = []
    cas = fields.get("中科院分区")
    jcr = fields.get("JCR分区")
    conf = fields.get("会议分区")
    cn_core = fields.get("中文核心期刊分区")
    if cas: parts.append(f"中科院{cas}")
    if jcr: parts.append(str(jcr))
    if conf and conf != "无": parts.append(f"会议{conf}")
    if cn_core: parts.append(str(cn_core))
    return " / ".join(parts) if parts else None


def _flatten_text(v: Any) -> str | None:
    if v is None:
        return None
    if isinstance(v, str):
        return v.strip() or None
    if isinstance(v, list):
        if not v:
            return None
        first = v[0]
        if isinstance(first, dict):
            return first.get("text") or first.get("link") or None
        return str(first)
    if isinstance(v, dict):
        return v.get("text") or v.get("link") or None
    return str(v)


def _pick_authors(fields: dict) -> tuple[list[dict], str]:
    """从主要参与人 + 指导人提取 author list. 返回 (paper_authors_data, authors_text).

    同一 open_id 在 主要参与人 + 指导人 都出现时, 合并 role, 顺序保留首次出现处。
    """
    by_oid: dict[str, dict] = {}
    names: list[str] = []
    order_counter = [1]
    def add(u: dict, default_role: str, is_first_pool: bool):
        oid = u.get("id")
        name = u.get("name") or u.get("en_name")
        if not oid:
            return
        if oid in by_oid:
            # 已存在, 追加 role
            rl = by_oid[oid]["role_list"]
            if default_role not in rl:
                rl.append(default_role)
            return
        # first author = 主要参与人池的第一个
        actual_role = "first_author" if (is_first_pool and not any(x.get("role_list", [""])[0] == "first_author" for x in by_oid.values())) else default_role
        by_oid[oid] = {
            "author_open_id": oid,
            "author_order": order_counter[0],
            "role_list": [actual_role],
            "name": name,
        }
        order_counter[0] += 1
        if name:
            names.append(name)

    for u in (fields.get("主要参与人") or []):
        if isinstance(u, dict):
            add(u, "co_author", is_first_pool=True)
    for u in (fields.get("指导人") or []):
        if isinstance(u, dict):
            add(u, "advisor", is_first_pool=False)

    return list(by_oid.values()), " ".join(names) if names else "(无作者)"


async def main(dry_run: bool = False):
    records_path = Path("/tmp/migrate/base2_papers.json")
    data = json.load(open(records_path))
    items = data["items"]
    log.info("loaded %d records from Base 2", len(items))

    db = SessionLocal()
    lc = LarkClient()
    try:
        # 已存在 paper 标题字典 (norm → Paper)
        existing = db.execute(select(Paper)).scalars().all()
        existing_by_title = {norm_title(p.title): p for p in existing}
        log.info("existing local papers: %d", len(existing))

        # members 字典 (open_id → Member), 用于校验作者存在
        members = {m.open_id: m for m in db.execute(select(Member)).scalars().all()}
        log.info("members loaded: %d", len(members))

        stats = {"created": 0, "updated": 0, "skipped_no_title": 0, "missing_authors": 0, "pushed": 0, "skipped_no_member": 0}

        for rec in items:
            f = rec.get("fields", {})
            title_en = _flatten_text(f.get("标题"))
            title_zh = _flatten_text(f.get("中文标题"))
            title = title_en or title_zh
            if not title:
                stats["skipped_no_title"] += 1
                continue

            doi = _flatten_text(f.get("【上线前】DOI"))
            venue = _flatten_text(f.get("投稿期刊")) or "(待补充)"
            venue_type = _pick_venue_type(venue)
            venue_level = _pick_venue_level(f)
            status = _pick_status(_flatten_text(f.get("目前状态")))
            publish_date = _ts_to_date(f.get("【上线前】发表时间"))
            submit_date = _ts_to_date(f.get("投稿日期"))
            year = (publish_date.year if publish_date else None) or (submit_date.year if submit_date else None) or datetime.now().year
            abstract = _flatten_text(f.get("摘要")) or _flatten_text(f.get("摘要汇总"))
            opensrc = _flatten_text(f.get("【接收后】开源地址"))
            issn = _flatten_text(f.get("【接受后】ISSN字段"))
            notes_parts = []
            if title_zh and title_en and title_zh != title_en:
                notes_parts.append(f"中文标题: {title_zh}")
            if issn:
                notes_parts.append(f"ISSN: {issn}")
            if opensrc:
                notes_parts.append(f"开源: {opensrc}")
            notes = "\n".join(notes_parts) if notes_parts else None

            authors_data, authors_text = _pick_authors(f)
            # 第一个作者作 created_by; 若不在 members 表则跳过
            if not authors_data:
                stats["missing_authors"] += 1
                continue
            first_oid = authors_data[0]["author_open_id"]
            if first_oid not in members:
                log.warning("first author %s (%s) not in members, skip paper '%s'", authors_data[0].get("name"), first_oid, title[:40])
                stats["skipped_no_member"] += 1
                continue
            created_by = first_oid

            # 标题去重
            nt = norm_title(title)
            paper_data = {
                "title": title,
                "authors_text": authors_text,
                "venue": venue,
                "venue_type": venue_type,
                "venue_level": venue_level,
                "year": year,
                "publish_date": publish_date,
                "doi": doi,
                "abstract": abstract,
                "status": status,
                "notes": notes,
            }
            # 过滤掉 author 不在 members 表的 - PaperAuthor FK
            valid_authors = [a for a in authors_data if a["author_open_id"] in members]
            if not valid_authors:
                stats["missing_authors"] += 1
                continue

            if nt in existing_by_title:
                paper = existing_by_title[nt]
                # 仅 update 非空字段, 不覆盖已有非空
                changed = False
                for k, v in paper_data.items():
                    if v is None:
                        continue
                    cur = getattr(paper, k, None)
                    if cur in (None, "", "(待补充)") and v not in (None, "", "(待补充)"):
                        setattr(paper, k, v)
                        changed = True
                if changed:
                    stats["updated"] += 1
                    log.info("updated paper #%d: %s", paper.paper_id, title[:60])
                continue

            # 新建
            if dry_run:
                log.info("[DRY] create paper: %s | venue=%s | status=%s | authors=%d", title[:60], venue, status, len(valid_authors))
                stats["created"] += 1
                continue

            # push 主 Base
            base_record_id = None
            if settings.lark_table_papers:
                try:
                    push_data = {**paper_data, "created_by": created_by}
                    # date 转 ms timestamp
                    if isinstance(push_data.get("publish_date"), date):
                        push_data["publish_date"] = int(datetime.combine(push_data["publish_date"], datetime.min.time()).timestamp() * 1000)
                    rec_res = await push_record_to_base(settings.lark_table_papers, push_data, record_id=None)
                    base_record_id = rec_res.get("record_id")
                    stats["pushed"] += 1
                except Exception as e:
                    log.warning("push main Base failed for '%s': %s; falling back to local only", title[:40], e)

            paper = Paper(
                **paper_data,
                created_by=created_by,
                base_record_id=base_record_id,
            )
            db.add(paper)
            db.flush()
            existing_by_title[nt] = paper

            # paper_authors
            for a in valid_authors:
                pa = PaperAuthor(
                    paper_id=paper.paper_id,
                    author_open_id=a["author_open_id"],
                    author_order=a["author_order"],
                    role=json.dumps(a["role_list"], ensure_ascii=False),
                    affiliation=None,
                )
                db.add(pa)

            stats["created"] += 1
            log.info("created paper #%d: %s (authors=%d)", paper.paper_id, title[:60], len(valid_authors))

        if not dry_run:
            db.commit()
        log.info("=== migration summary ===")
        for k, v in stats.items():
            log.info("  %s: %d", k, v)
    finally:
        db.close()
        await lc.close()


if __name__ == "__main__":
    dry = "--dry-run" in sys.argv
    asyncio.run(main(dry_run=dry))
