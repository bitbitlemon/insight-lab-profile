from __future__ import annotations

import json
import subprocess
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy.orm import Session

from app.models import LabDailyReport
from app.services.lark_chat_sync import _lark_cli, _parse_lark_time

DAILY_BASE_TOKEN = "L7hwbIV3gaFoB7sJYDtcxM5Tnmg"
DAILY_TABLE_ID = "tblVFSPPbWKWNp4X"
DAILY_VIEW_ID = "vewNT787aB"


def _cell_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, list):
        parts: list[str] = []
        for item in value:
            if isinstance(item, dict):
                parts.append(str(item.get("text") or item.get("name") or item.get("en_name") or item.get("id") or ""))
            else:
                parts.append(str(item))
        return " ".join(part.strip() for part in parts if part and part.strip())
    if isinstance(value, dict):
        return str(value.get("text") or value.get("name") or value.get("id") or "").strip()
    return str(value).strip()


def _cell_member(value: Any) -> tuple[str | None, str | None]:
    if isinstance(value, list) and value:
        item = value[0]
        if isinstance(item, dict):
            return str(item.get("id") or "").strip() or None, str(item.get("name") or "").strip() or None
    text = _cell_text(value)
    return None, text or None


def _parse_base_time(value: Any) -> datetime | None:
    parsed = _parse_lark_time(value)
    if parsed:
        return parsed
    if isinstance(value, str):
        raw = value.strip()
        try:
            value = float(raw)
        except ValueError:
            marker = "打卡时间："
            if marker in raw:
                return _parse_lark_time(raw.split(marker, 1)[1].split("今日思路", 1)[0].strip())
            return None
    if isinstance(value, (int, float)):
        # Feishu Base numeric date can be Excel serial days.
        if 20_000 < float(value) < 80_000:
            return datetime(1899, 12, 30) + timedelta(days=float(value))
    return None


def _rows_from_base_payload(data: dict[str, Any]) -> list[tuple[str, dict[str, Any]]]:
    fields = data.get("fields") or []
    rows = data.get("data") or []
    record_ids = data.get("record_id_list") or []
    normalized: list[tuple[str, dict[str, Any]]] = []
    for index, row in enumerate(rows):
        if not isinstance(row, list):
            continue
        record_id = str(record_ids[index] if index < len(record_ids) else "").strip()
        if not record_id:
            continue
        item = {str(fields[col]): row[col] for col in range(min(len(fields), len(row)))}
        normalized.append((record_id, item))
    return normalized


def fetch_daily_base_records(*, limit: int = 100, offset: int = 0) -> dict[str, Any]:
    args = [
        _lark_cli(),
        "base",
        "+record-list",
        "--base-token",
        DAILY_BASE_TOKEN,
        "--table-id",
        DAILY_TABLE_ID,
        "--view-id",
        DAILY_VIEW_ID,
        "--limit",
        str(limit),
        "--offset",
        str(offset),
        "--as",
        "bot",
    ]
    result = subprocess.run(args, capture_output=True, text=True, timeout=60)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip() or "lark-cli daily base failed")
    body = json.loads(result.stdout)
    if not body.get("ok"):
        raise RuntimeError(json.dumps(body, ensure_ascii=False)[:500])
    return body.get("data") or {}


def sync_daily_plan_base(db: Session, *, page_size: int = 100, max_pages: int = 20) -> dict[str, int]:
    offset = 0
    created = 0
    updated = 0
    fetched = 0
    now = datetime.utcnow()
    for _ in range(max_pages):
        payload = fetch_daily_base_records(limit=page_size, offset=offset)
        rows = _rows_from_base_payload(payload)
        fetched += len(rows)
        for record_id, fields in rows:
            member_open_id, member_name = _cell_member(fields.get("人员"))
            row = db.query(LabDailyReport).filter(LabDailyReport.base_record_id == record_id).one_or_none()
            if row is None:
                row = LabDailyReport(base_record_id=record_id)
                db.add(row)
                created += 1
            else:
                updated += 1
            row.member_open_id = member_open_id
            row.member_name = member_name
            row.checkin_at = _parse_base_time(fields.get("打卡时间") or fields.get("早间通报"))
            row.thinking_start_at = _parse_base_time(fields.get("今日思路启动时间") or fields.get("早间通报"))
            row.today_content = _cell_text(fields.get("今日开展内容"))
            row.yesterday_content = _cell_text(fields.get("昨日开展内容"))
            row.three_day_content = _cell_text(fields.get("近三日开展内容"))
            row.today_messages = _cell_text(fields.get("今日消息汇总"))
            row.daily_summary = _cell_text(fields.get("每日总结"))
            row.today_thinking = _cell_text(fields.get("今日思路"))
            row.morning_messages = _cell_text(fields.get("今日上午消息汇总"))
            row.afternoon_messages = _cell_text(fields.get("今日下午消息汇总"))
            row.weekly_summary = _cell_text(fields.get("周总结汇总"))
            row.weekly_report = _cell_text(fields.get("周总结"))
            row.raw_json = json.dumps(fields, ensure_ascii=False)
            row.synced_at = now
        db.commit()
        if not payload.get("has_more") or not rows:
            break
        offset += len(rows)
    return {"fetched": fetched, "created": created, "updated": updated}
