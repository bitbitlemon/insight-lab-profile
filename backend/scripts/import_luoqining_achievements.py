"""一次性导入罗起宁的成果到本地 DB.

来源: Wiki Base SWobbpAMyaTpe9sNZEhcVtb7n1c (2026年A类成果管理)
  - tblHZDjADaKjKeA1 1-竞赛获奖
  - tblAW3PpHDcWoVKh 3-论文数据
  - tblgnjTfY1FY5xuP 4-认证证书 (无匹配, 跳过)
+ 飞书妙记列表 (50 条)

调用前先用 lark-cli 把 JSON 缓存到 /tmp/*.json:
  /tmp/comp_records.json, /tmp/paper_records.json, /tmp/all_minutes.json

执行: cd backend && .venv/bin/python scripts/import_luoqining_achievements.py
"""
from __future__ import annotations
import json
import re
import sys
from datetime import date, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.db import SessionLocal
from app.models import (
    Member, Paper, PaperAuthor, Competition, CompetitionMember, MeetingNote,
)

TARGET_OID = "ou_20fec537961e0a66669370b00d0fc52d"
TARGET_NAME = "罗起宁"


def parse_chinese_date(s) -> date | None:
    if not s: return None
    if isinstance(s, list): s = s[0] if s else None
    if not s: return None
    s = str(s).strip()
    # "2024.05" / "2024.5" / "2024-05-01" / "2024.05.01" / "2024.10"
    m = re.match(r"(\d{4})[.\-/](\d{1,2})(?:[.\-/](\d{1,2}))?", s)
    if m:
        y, mo = int(m.group(1)), int(m.group(2))
        d = int(m.group(3)) if m.group(3) else 1
        try: return date(y, mo, d)
        except ValueError: return date(y, mo, 1)
    return None


def parse_iso_date(s) -> date | None:
    if not s: return None
    if isinstance(s, list): s = s[0] if s else None
    if not s: return None
    try:
        return datetime.fromisoformat(str(s).replace(" ", "T")).date()
    except Exception:
        return None


def flat_str(cell) -> str:
    if cell is None: return ""
    if isinstance(cell, list):
        out = []
        for x in cell:
            if isinstance(x, dict):
                out.append(x.get("name", "") or x.get("text", "") or "")
            else:
                out.append(str(x))
        return " ".join(out).strip()
    if isinstance(cell, dict):
        return cell.get("name", "") or cell.get("text", "") or ""
    return str(cell).strip()


def first_str(cell) -> str:
    """list 取第一个; 其他用 flat_str."""
    if isinstance(cell, list) and cell:
        x = cell[0]
        if isinstance(x, dict): return x.get("name", "") or x.get("text", "") or ""
        return str(x)
    return flat_str(cell)


def extract_users(cell) -> list[dict]:
    """提取 user 类型字段里所有 {id, name}."""
    out = []
    if isinstance(cell, list):
        for x in cell:
            if isinstance(x, dict) and "id" in x:
                out.append({"open_id": x["id"], "name": x.get("name", "")})
    return out


def jcr_to_venue_level(jcr_text: str) -> str:
    """JCR 分区 / 中科院分区 → CCF-A/B/C 不太对应, 用 SCI-1..4 / Q1..Q4."""
    if not jcr_text: return ""
    if "Q1" in jcr_text or "一区" in jcr_text: return "SCI-1"
    if "Q2" in jcr_text or "二区" in jcr_text: return "SCI-2"
    if "Q3" in jcr_text or "三区" in jcr_text: return "SCI-3"
    if "Q4" in jcr_text or "四区" in jcr_text: return "SCI-4"
    return ""


def is_chinese(text: str) -> bool:
    return any("一" <= c <= "鿿" for c in text or "")


def row_has_luo(row) -> bool:
    for cell in row:
        if cell is None: continue
        if isinstance(cell, list):
            for it in cell:
                if isinstance(it, dict) and (it.get("id") == TARGET_OID or it.get("name") == TARGET_NAME):
                    return True
                if isinstance(it, str) and TARGET_NAME in it:
                    return True
        elif isinstance(cell, str) and TARGET_NAME in cell:
            return True
        elif isinstance(cell, dict) and cell.get("id") == TARGET_OID:
            return True
    return False


def main() -> int:
    db = SessionLocal()
    member = db.query(Member).filter_by(open_id=TARGET_OID).first()
    if not member:
        print(f"ERR: 找不到 Member {TARGET_OID}"); return 2

    stats = {"competitions": 0, "papers": 0, "minutes": 0, "skipped": 0}

    # ============ 1. 竞赛获奖 ============
    print("\n=== 导入 竞赛获奖 ===")
    d = json.load(open("/tmp/comp_records.json"))["data"]
    idx = {n: i for i, n in enumerate(d["fields"])}
    for rid, row in zip(d["record_id_list"], d["data"]):
        if not row_has_luo(row): continue
        exist = db.query(Competition).filter_by(base_record_id=rid).first()
        if exist:
            stats["skipped"] += 1
            print(f"  [skip] {first_str(row[idx['赛事名称']])} already imported")
            continue
        name = first_str(row[idx["赛事名称"]]) or "未命名比赛"
        organizer = first_str(row[idx["主办"]]) or "未知"
        level = first_str(row[idx["正规级别"]]) or "校级"
        award_level = first_str(row[idx["奖项等次"]]) or "未知"
        category = flat_str(row[idx["研究分类"]]) or None
        end_d = parse_chinese_date(row[idx["日期"]])
        first_stu = first_str(row[idx["提取第一学生负责人"]])
        other_stu = first_str(row[idx["其他学生提取"]])
        c = Competition(
            base_record_id=rid,
            name=name,
            organizer=organizer,
            level=level,
            category=category,
            end_date=end_d or date(2024, 1, 1),
            award_level=award_level,
            description=f"第一学生: {first_stu} | 其他: {other_stu}",
            created_by=TARGET_OID,
        )
        db.add(c)
        db.flush()
        db.add(CompetitionMember(comp_id=c.comp_id, member_open_id=TARGET_OID, member_role="member"))
        stats["competitions"] += 1
        print(f"  + {name} | {award_level} ({level}) {end_d}")

    # ============ 2. 论文数据 ============
    print("\n=== 导入 论文数据 ===")
    d = json.load(open("/tmp/paper_records.json"))["data"]
    idx = {n: i for i, n in enumerate(d["fields"])}
    seen_titles: set[str] = set()
    for rid, row in zip(d["record_id_list"], d["data"]):
        if not row_has_luo(row): continue
        exist = db.query(Paper).filter_by(base_record_id=rid).first()
        if exist:
            stats["skipped"] += 1
            continue
        title_zh = first_str(row[idx["论文名称（中文）"]])
        title_en = first_str(row[idx["论文名称（英文）"]])
        title = title_zh if title_zh and is_chinese(title_zh) else (title_en or title_zh or "未命名论文")
        if title in seen_titles:
            stats["skipped"] += 1
            print(f"  [dedup] {title}")
            continue
        seen_titles.add(title)
        venue = first_str(row[idx["录用期刊"]]) or "未知"
        pdate = parse_iso_date(row[idx["发表时间"]])
        year = pdate.year if pdate else 2025
        doi = first_str(row[idx["DOI"]]) or None
        status_raw = first_str(row[idx["状态"]])
        status_map = {"已上网": "published", "已录用": "accepted", "投出": "submitted"}
        status = status_map.get(status_raw, "submitted")
        jcr_text = first_str(row[idx.get("期刊JCR分区", -1)]) if "期刊JCR分区" in idx else ""
        cas_text = first_str(row[idx.get("期刊中科院分区", -1)]) if "期刊中科院分区" in idx else ""
        venue_level = jcr_to_venue_level(jcr_text or cas_text) or None
        # 期刊类型
        venue_type_raw = first_str(row[idx.get("期刊类型", -1)]) if "期刊类型" in idx else ""
        venue_type = "journal" if venue_type_raw or venue else "conference"
        # authors_text
        owner = row[idx["负责人"]]
        owner_users = extract_users(owner)
        related = first_str(row[idx["【完善】指导的相关学生"]]) if "【完善】指导的相关学生" in idx else ""
        authors_parts = []
        for u in owner_users:
            authors_parts.append(u["name"])
        if related: authors_parts.append(f"({related})")
        authors_text = ", ".join([p for p in authors_parts if p]) or TARGET_NAME

        p = Paper(
            base_record_id=rid,
            title=title,
            authors_text=authors_text,
            venue=venue,
            venue_type=venue_type,
            venue_level=venue_level,
            year=year,
            publish_date=pdate,
            doi=doi,
            status=status,
            created_by=TARGET_OID,
        )
        db.add(p)
        db.flush()
        db.add(PaperAuthor(
            paper_id=p.paper_id,
            author_open_id=TARGET_OID,
            author_order=1,
            role="first" if any(u["open_id"] == TARGET_OID for u in owner_users) else "co",
        ))
        stats["papers"] += 1
        print(f"  + [{year}] {title[:40]} | {venue} | {status}")

    # ============ 3. 妙记 ============
    print("\n=== 导入 妙记 (MeetingNote) ===")
    items = json.load(open("/tmp/all_minutes.json"))
    for it in items:
        token = it.get("token")
        if not token: continue
        exist = db.query(MeetingNote).filter_by(lark_minute_token=token).first()
        if exist:
            stats["skipped"] += 1
            continue
        di = it.get("display_info", "")
        first_line = di.split("\n")[0].strip()
        meeting_title = first_line or "未命名妙记"
        desc = it.get("meta_data", {}).get("description", "")
        # 解析时间 "开始时间: 2026.05.08 17:20:57"
        m_time = re.search(r"开始时间[:：]\s*([\d.\-]+)", desc)
        meeting_date = parse_chinese_date(m_time.group(1) if m_time else "") or date(2025, 1, 1)
        # 解析 owner
        m_owner = re.search(r"所有者[:：]\s*([^\s]+)", desc)
        owner_name = m_owner.group(1) if m_owner else ""
        owner_oid = TARGET_OID if owner_name == TARGET_NAME else TARGET_OID  # 数据库只有 罗起宁
        summary = di.replace("&lt;b&gt;", "").replace("&lt;/b&gt;", "").strip() or "(由飞书妙记自动生成)"
        n = MeetingNote(
            owner_open_id=owner_oid,
            meeting_title=meeting_title,
            meeting_date=meeting_date,
            meeting_type="lab_internal",
            lark_minute_token=token,
            summary=summary,
            source="imported",
            review_status="draft",
            privacy_level="internal",
        )
        db.add(n)
        stats["minutes"] += 1
        print(f"  + {meeting_date} {meeting_title[:30]} (token={token})")

    db.commit()
    db.close()
    print("\n=== 汇总 ===")
    for k, v in stats.items():
        print(f"  {k}: {v}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
