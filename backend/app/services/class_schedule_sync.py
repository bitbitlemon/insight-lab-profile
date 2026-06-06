from __future__ import annotations

import logging
import re
from datetime import date, datetime, time
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import ClassSchedule, Member
from app.services.lark import get_lark

log = logging.getLogger(__name__)

PERIOD_START: dict[int, time] = {
    1: time(8, 30),
    2: time(9, 25),
    3: time(10, 20),
    4: time(10, 55),
    5: time(11, 50),
    6: time(14, 55),
    7: time(16, 0),
    8: time(16, 55),
    9: time(19, 0),
    10: time(19, 55),
    11: time(20, 50),
}

PERIOD_END: dict[int, time] = {
    1: time(9, 15),
    2: time(10, 10),
    3: time(10, 50),
    4: time(11, 40),
    5: time(12, 35),
    6: time(15, 40),
    7: time(16, 45),
    8: time(17, 40),
    9: time(19, 45),
    10: time(20, 40),
    11: time(21, 35),
}


def _norm(value: Any) -> str:
    return str(value or "").strip()


def _int(value: Any, default: int = 0) -> int:
    try:
        return int(float(value))
    except Exception:
        return default


def _date(value: Any) -> date | None:
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        timestamp = float(value)
        if timestamp > 10_000_000_000:
            timestamp = timestamp / 1000
        return datetime.fromtimestamp(timestamp).date()
    text = _norm(value).replace("/", "-")
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(text[:19] if " " in text else text[:10], fmt).date()
        except Exception:
            pass
    return None


def _parse_time_pair(value: Any) -> tuple[time, time] | None:
    text = _norm(value)
    match = re.search(r"(\d{1,2})[:：](\d{2})\s*[-~—至到]\s*(\d{1,2})[:：](\d{2})", text)
    if not match:
        return None
    start_hour, start_minute, end_hour, end_minute = (int(part) for part in match.groups())
    try:
        return time(start_hour, start_minute), time(end_hour, end_minute)
    except ValueError:
        return None


def _build_member_index(members: list[Member]) -> tuple[dict[str, Member], dict[str, list[Member]]]:
    by_student_no: dict[str, Member] = {}
    by_name: dict[str, list[Member]] = {}
    for member in members:
        by_name.setdefault(member.name.strip(), []).append(member)
        blob = " ".join(
            _norm(value)
            for value in (member.extra_memberships, member.bio, member.research_area, member.email, member.mobile)
            if value
        )
        for token in blob.replace(",", " ").replace("，", " ").replace("、", " ").split():
            if token.isdigit() and len(token) >= 8:
                by_student_no[token] = member
    return by_student_no, by_name


def _resolve_member(fields: dict[str, Any], by_student_no: dict[str, Member], by_name: dict[str, list[Member]]) -> Member | None:
    student_no = _norm(fields.get("学号"))
    if student_no and student_no in by_student_no:
        return by_student_no[student_no]
    name = _norm(fields.get("姓名"))
    rows = by_name.get(name) or []
    if len(rows) == 1:
        return rows[0]
    if student_no and rows:
        for row in rows:
            haystack = f"{row.extra_memberships or ''} {row.bio or ''} {row.email or ''} {row.mobile or ''}"
            if student_no in haystack:
                return row
    return None


async def _iter_records() -> list[dict[str, Any]]:
    app_token = settings.lark_schedule_base_app_token
    table_id = settings.lark_schedule_table_id
    if not app_token or not table_id:
        return []
    records: list[dict[str, Any]] = []
    page_token: str | None = None
    while True:
        params: dict[str, Any] = {"page_size": 200}
        if page_token:
            params["page_token"] = page_token
        if settings.lark_schedule_view_id:
            params["view_id"] = settings.lark_schedule_view_id
        payload = await get_lark()._request(
            "GET",
            f"/bitable/v1/apps/{app_token}/tables/{table_id}/records",
            params=params,
        )
        for item in payload.get("items") or []:
            records.append({
                "record_id": item.get("record_id"),
                "fields": item.get("fields") or {},
            })
        if not payload.get("has_more"):
            break
        page_token = payload.get("page_token")
        if not page_token:
            break
    return records


async def sync_class_schedules_from_lark_base(db: Session) -> dict[str, Any]:
    records = await _iter_records()
    members = db.execute(select(Member).where(Member.status == "active")).scalars().all()
    by_student_no, by_name = _build_member_index(members)
    existing_by_record: dict[str, ClassSchedule] = {}
    existing_rows = db.execute(
        select(ClassSchedule).where(ClassSchedule.notes.like("%feishu_schedule_record:%"))
    ).scalars().all()
    for row in existing_rows:
        marker = "feishu_schedule_record:"
        notes = row.notes or ""
        if marker not in notes:
            continue
        record_id = notes.split(marker, 1)[1].split(";", 1)[0].strip()
        if record_id:
            existing_by_record[record_id] = row

    created = 0
    updated = 0
    skipped = 0
    unmatched: set[str] = set()

    for record in records:
        record_id = _norm(record.get("record_id"))
        fields = record.get("fields") or {}
        member = _resolve_member(fields, by_student_no, by_name)
        class_date = _date(fields.get("上课日期"))
        start_period = _int(fields.get("起节"), 1)
        end_period = _int(fields.get("止节"), start_period)
        explicit_times = _parse_time_pair(fields.get("节次范围") or fields.get("上课时间") or fields.get("时间"))
        day_of_week = _int(fields.get("星期"), class_date.isoweekday() if class_date else 1)
        course_name = _norm(fields.get("课程名"))
        if not (record_id and member and class_date and course_name and 1 <= day_of_week <= 7):
            skipped += 1
            if not member:
                unmatched.add(_norm(fields.get("姓名")) or _norm(fields.get("学号")) or record_id)
            continue

        note = (
            f"feishu_schedule_record:{record_id}; "
            f"学号:{_norm(fields.get('学号'))}; 班级:{_norm(fields.get('班级'))}; "
            f"节次:{_norm(fields.get('节次范围'))}; 备注:{_norm(fields.get('备注'))}"
        )
        existing = existing_by_record.get(record_id)
        payload = {
            "member_open_id": member.open_id,
            "course_name": course_name,
            "teacher": _norm(fields.get("教师")) or None,
            "location": _norm(fields.get("教室")) or None,
            "semester": _norm(fields.get("学期")) or "未设置学期",
            "day_of_week": day_of_week,
            "start_time": explicit_times[0] if explicit_times else PERIOD_START.get(start_period, PERIOD_START[1]),
            "end_time": explicit_times[1] if explicit_times else PERIOD_END.get(end_period, PERIOD_END.get(start_period, PERIOD_END[1])),
            "week_pattern": _norm(fields.get("周次")) or None,
            "semester_start": class_date,
            "semester_end": class_date,
            "notes": note,
        }
        if existing:
            for key, value in payload.items():
                setattr(existing, key, value)
            updated += 1
        else:
            db.add(ClassSchedule(**payload))
            created += 1

    db.commit()
    return {
        "ok": True,
        "records": len(records),
        "created": created,
        "updated": updated,
        "skipped": skipped,
        "unmatched": sorted(item for item in unmatched if item)[:50],
    }
