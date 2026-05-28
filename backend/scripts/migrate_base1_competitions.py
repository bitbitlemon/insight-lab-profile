"""把 Base 1 (SWobbpAMyaTpe9sNZEhcVtb7n1c/tblHZDjADaKjKeA1) 的 60 条比赛获奖
record 完完全全导入到主 Base competitions 表 + 本地 SQLite, 含真迁移附件文件.

步骤:
1. 从 dump 读 60 条 record (含 tmp_url 已签名)
2. 字段映射: 赛事名称/主办/正规级别/奖项等次/日期/第一学生/责任人/其他学生提取 + 附件
3. 附件按 file_token 跨字段去重 → 按 mime/ext 分到 cert_files(pdf/zip) vs photo_files(image)
4. 下载源 file (用已签名的 tmp_url) → 上传到主 Base (parent_type=bitable_file/bitable_image) → 拿新 file_token
5. 创建 Competition + CompetitionMember 本地 + push 主 Base (会同步推 cert_files/photo_files 字段)

不在 members 表的中文名 (其他学生提取) 跳过 (warning)。
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

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import settings  # noqa: E402
from app.db import SessionLocal  # noqa: E402
from app.models import Competition, CompetitionMember, Member  # noqa: E402
from app.services.lark import LarkClient  # noqa: E402
from app.services.sync import push_record_to_base  # noqa: E402
from sqlalchemy import select  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger("migrate")

LEVEL_MAP = {
    "国家级": "国家级",
    "省部级": "省部级",
    "省赛": "省部级",
    "市厅级": "市厅级",
    "校级": "校级",
}
AWARD_MAP = {
    "特等奖": "特等奖",
    "一等奖": "一等奖",
    "二等奖": "二等奖",
    "三等奖": "三等奖",
}

IMAGE_EXT = {"jpg", "jpeg", "png", "gif", "webp", "bmp", "heic", "heif", "tiff", "svg"}


def _is_image(name: str | None, mime_type: str | None) -> bool:
    if mime_type and mime_type.startswith("image/"):
        return True
    if name and "." in name:
        ext = name.rsplit(".", 1)[1].lower()
        if ext in IMAGE_EXT:
            return True
    return False


def _parse_date_text(text: str | None) -> date | None:
    if not text:
        return None
    m = re.match(r"(\d{4})[./\-](\d{1,2})(?:[./\-](\d{1,2}))?", text.strip())
    if not m:
        # fallback: 纯年
        my = re.match(r"^(\d{4})$", text.strip())
        if my:
            return date(int(my.group(1)), 12, 31)
        return None
    y = int(m.group(1))
    mo = int(m.group(2))
    d = int(m.group(3)) if m.group(3) else 0
    if d == 0:
        # 月末
        if mo == 12:
            return date(y, 12, 31)
        return date(y, mo + 1, 1).replace(day=1)
    try:
        return date(y, mo, d)
    except ValueError:
        return None


def _extract_user_ids(value: Any) -> list[tuple[str, str | None]]:
    """从 formula user dict 提取 (open_id, name) list."""
    if not value:
        return []
    if isinstance(value, dict):
        users = value.get("users") or []
        out = []
        for u in users:
            if isinstance(u, dict) and u.get("id"):
                out.append((u["id"], u.get("name") or u.get("enName")))
        return out
    if isinstance(value, list):
        out = []
        for u in value:
            if isinstance(u, dict) and u.get("id"):
                out.append((u["id"], u.get("name") or u.get("enName")))
        return out
    return []


def _extract_attachments(fields: dict) -> tuple[list[dict], list[dict]]:
    """跨多个附件字段去重(file_token), 按 mime/ext 分到 cert vs photo. 返回 (cert_files, photo_files).
    每条 dict 含 source_token, source_tmp_url, source_name, source_size, source_type.
    """
    seen: set[str] = set()
    cert: list[dict] = []
    photo: list[dict] = []
    for key in ("附件 (1)", "图片附件", "PDF附件", "PDF 转图片"):
        items = fields.get(key) or []
        if not isinstance(items, list):
            continue
        for it in items:
            if not isinstance(it, dict):
                continue
            tok = it.get("file_token")
            if not tok or tok in seen:
                continue
            seen.add(tok)
            entry = {
                "source_token": tok,
                "tmp_url": it.get("tmp_url") or it.get("url"),
                "name": it.get("name") or f"file_{tok[:8]}",
                "size": it.get("size"),
                "type": it.get("type"),
            }
            if _is_image(entry["name"], entry["type"]):
                photo.append(entry)
            else:
                cert.append(entry)
    return cert, photo


async def _download_via_tmp_url(client: httpx.AsyncClient, tmp_url: str) -> bytes:
    """tmp_url 已签名, 直接 GET. 注意它是飞书 batch_get_tmp_download_url endpoint, 需要 tenant token."""
    # tmp_url 里包含 file_tokens 参数, 调它返回 JSON 含 tmp_download_url, 然后再 GET 真 URL
    # 但 record 字段里的 tmp_url 已经是 batch_get URL, 我们要走两步
    # 实际上 record 里的 url 才是 download URL, tmp_url 是 batch endpoint
    raise NotImplementedError


async def _resolve_and_download(
    lc: LarkClient,
    httpx_client: httpx.AsyncClient,
    source_app_token: str,
    source_table_id: str,
    file_token: str,
) -> tuple[bytes, str | None]:
    """走 batch_get_tmp_download_url + bitable extra 拿真链, GET 二进制."""
    tok = await lc._get_tenant_token()
    extra = json.dumps({"bitablePerm": {"tableId": source_table_id, "rev": 0}})
    r = await httpx_client.get(
        "https://open.feishu.cn/open-apis/drive/v1/medias/batch_get_tmp_download_url",
        params={"file_tokens": file_token, "extra": extra},
        headers={"Authorization": f"Bearer {tok}"},
    )
    r.raise_for_status()
    data = r.json()
    if data.get("code") != 0:
        raise RuntimeError(f"batch_get failed: {data}")
    urls = (data.get("data") or {}).get("tmp_download_urls") or []
    if not urls:
        raise RuntimeError("empty tmp_download_urls")
    real_url = urls[0].get("tmp_download_url")
    if not real_url:
        raise RuntimeError("no tmp_download_url")
    # GET 真链
    r2 = await httpx_client.get(real_url, timeout=120.0)
    r2.raise_for_status()
    return r2.content, r2.headers.get("content-type")


async def _upload_to_main_base(lc: LarkClient, file_name: str, file_bytes: bytes, mime: str | None, is_image: bool) -> str:
    """上传到主 Base 拿新 file_token. parent_type=bitable_image 适合图片字段, bitable_file 适合附件字段."""
    parent_type = "bitable_file"  # 图片字段也可用 bitable_file (drive 二级文件), 通用
    data = await lc.upload_drive_media(
        file_name=file_name,
        parent_type=parent_type,
        parent_node=settings.lark_base_app_token,
        size=len(file_bytes),
        file_bytes=file_bytes,
        content_type=mime or "application/octet-stream",
    )
    tok = data.get("file_token")
    if not tok:
        raise RuntimeError(f"upload returned no file_token: {data}")
    return tok


async def main(dry_run: bool = False, limit: int | None = None):
    records_path = Path("/tmp/migrate/base1_competitions.json")
    payload = json.load(open(records_path))
    src_app_token = payload["app_token"]
    src_table_id = payload["table_id"]
    items = payload["items"]
    if limit:
        items = items[:limit]
    log.info("loaded %d records (limit=%s)", len(items), limit)

    db = SessionLocal()
    lc = LarkClient()
    httpx_client = httpx.AsyncClient(timeout=120.0)
    try:
        # 已存在 competitions: 用 name+end_date 联合去重
        existing = db.execute(select(Competition)).scalars().all()
        existing_keys = {(c.name, c.end_date) for c in existing}
        log.info("existing local competitions: %d", len(existing))

        members = {m.open_id: m for m in db.execute(select(Member)).scalars().all()}
        name_to_oid: dict[str, str] = {}
        for m in members.values():
            if m.name:
                name_to_oid[m.name] = m.open_id
        log.info("members loaded: %d (by name: %d)", len(members), len(name_to_oid))

        stats = {"created": 0, "skipped_dup": 0, "skipped_no_first": 0, "uploaded": 0, "upload_errors": 0}

        for idx, rec in enumerate(items, 1):
            f = rec.get("fields", {})
            name = f.get("赛事名称") or f.get("项目内容") or "(待补充)"
            organizer = f.get("主办") or "(待补充)"
            level_raw = f.get("正规级别") or ""
            level = LEVEL_MAP.get(level_raw, level_raw or "校级")
            award_raw = f.get("奖项等次") or ""
            award_level = AWARD_MAP.get(award_raw, award_raw or "其他")
            end_date = _parse_date_text(f.get("日期")) or date(datetime.now().year, 12, 31)
            description_parts = []
            for fk in ("项目内容", "AI 图片理解（豆包）", "附件转图片"):
                v = f.get(fk)
                if isinstance(v, str) and v.strip():
                    description_parts.append(f"[{fk}] {v.strip()[:400]}")
            description = "\n\n".join(description_parts) if description_parts else None

            # 责任人 / 第一学生 → team_lead, members
            first_users = _extract_user_ids(f.get("第一学生"))
            adv_users = _extract_user_ids(f.get("责任人"))
            other_text = f.get("其他学生提取") or ""
            other_names = [n.strip() for n in re.split(r"[\s,，、\n]+", other_text) if n.strip()]

            if not first_users:
                stats["skipped_no_first"] += 1
                log.warning("[%d] no 第一学生, skip: %s", idx, name[:40])
                continue

            team_lead_oid = first_users[0][0]
            created_by = team_lead_oid
            if created_by not in members:
                log.warning("[%d] first user %s not in members, fallback skip: %s", idx, first_users[0][1], name[:40])
                stats["skipped_no_first"] += 1
                continue

            # members 列表去重
            member_oids: dict[str, str] = {}  # oid → role
            member_oids[team_lead_oid] = "member"
            for oid, _ in adv_users:
                if oid in members:
                    member_oids.setdefault(oid, "advisor")
            for name_cn in other_names:
                oid = name_to_oid.get(name_cn)
                if oid:
                    member_oids.setdefault(oid, "member")
                else:
                    log.warning("[%d] member '%s' not found, skipped", idx, name_cn)

            key = (name, end_date)
            if key in existing_keys:
                stats["skipped_dup"] += 1
                log.info("[%d] DUP skip: %s @%s", idx, name[:40], end_date)
                continue

            # 处理附件: 下载 + 上传
            cert_src, photo_src = _extract_attachments(f)
            log.info("[%d] %s | cert=%d photo=%d level=%s award=%s", idx, name[:50], len(cert_src), len(photo_src), level, award_level)

            if dry_run:
                stats["created"] += 1
                continue

            new_cert: list[dict] = []
            new_photo: list[dict] = []
            for src_list, dst_list, is_img in [(cert_src, new_cert, False), (photo_src, new_photo, True)]:
                for src in src_list:
                    try:
                        body, mime = await _resolve_and_download(lc, httpx_client, src_app_token, src_table_id, src["source_token"])
                        new_tok = await _upload_to_main_base(lc, src["name"], body, mime or src.get("type"), is_img)
                        dst_list.append({
                            "file_token": new_tok,
                            "name": src["name"],
                            "size": src.get("size") or len(body),
                            "type": mime or src.get("type"),
                            "url": None,
                        })
                        stats["uploaded"] += 1
                    except Exception as e:
                        stats["upload_errors"] += 1
                        log.warning("  upload failed for %s (%s): %s", src["name"], src["source_token"], e)

            cert_files_json = json.dumps(new_cert, ensure_ascii=False) if new_cert else None
            photo_files_json = json.dumps(new_photo, ensure_ascii=False) if new_photo else None

            # push 主 Base
            base_data = {
                "name": name,
                "organizer": organizer,
                "level": level,
                "end_date": end_date.isoformat(),
                "team_lead_open_id": team_lead_oid,
                "award_level": award_level,
                "description": description,
                "created_by": created_by,
            }
            base_record_id = None
            try:
                push_data = dict(base_data)
                push_data["end_date"] = int(datetime.combine(end_date, datetime.min.time()).timestamp() * 1000)
                # 附件字段
                if new_cert:
                    push_data["比赛证书"] = [{"file_token": x["file_token"]} for x in new_cert]
                if new_photo:
                    push_data["比赛照片"] = [{"file_token": x["file_token"]} for x in new_photo]
                rec_res = await push_record_to_base(settings.lark_table_competitions, push_data, record_id=None)
                base_record_id = rec_res.get("record_id")
            except Exception as e:
                log.warning("[%d] push main Base competitions failed: %s; local only", idx, e)

            comp = Competition(
                name=name,
                organizer=organizer,
                level=level,
                end_date=end_date,
                team_lead_open_id=team_lead_oid,
                award_level=award_level,
                description=description,
                created_by=created_by,
                base_record_id=base_record_id,
                cert_files_json=cert_files_json,
                photo_files_json=photo_files_json,
            )
            db.add(comp)
            db.flush()
            existing_keys.add(key)

            for oid, role in member_oids.items():
                cm_role = role if role in ("member", "advisor") else "member"
                db.add(CompetitionMember(comp_id=comp.comp_id, member_open_id=oid, member_role=cm_role))

            stats["created"] += 1
            log.info("  [created comp #%d] cert=%d photo=%d base_rec=%s", comp.comp_id, len(new_cert), len(new_photo), base_record_id or "(local only)")

            # 周期性 commit 防中断丢失
            if idx % 5 == 0:
                db.commit()
                log.info("  -- partial commit at idx=%d --", idx)

        if not dry_run:
            db.commit()
        log.info("=== migration summary ===")
        for k, v in stats.items():
            log.info("  %s: %d", k, v)
    finally:
        db.close()
        await lc.close()
        await httpx_client.aclose()


if __name__ == "__main__":
    dry = "--dry-run" in sys.argv
    limit = None
    for a in sys.argv:
        if a.startswith("--limit="):
            limit = int(a.split("=", 1)[1])
    asyncio.run(main(dry_run=dry, limit=limit))
