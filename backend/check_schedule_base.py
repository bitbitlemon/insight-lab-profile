from __future__ import annotations

import asyncio
from collections import Counter, defaultdict
from datetime import datetime
from typing import Any

from sqlalchemy import select

from app.config import settings
from app.db import SessionLocal
from app.models import ClassSchedule, Member
from app.services.class_schedule_sync import _date, _int, _norm, _parse_time_pair, _resolve_member, _build_member_index
from app.services.lark import get_lark


async def request(method: str, path: str, **kwargs: Any) -> dict[str, Any]:
    return await get_lark()._request(method, path, **kwargs)


async def fetch_tables(app_token: str) -> list[dict[str, Any]]:
    payload = await request("GET", f"/bitable/v1/apps/{app_token}/tables", params={"page_size": 100})
    return payload.get("items") or []


async def fetch_fields(app_token: str, table_id: str) -> list[dict[str, Any]]:
    payload = await request("GET", f"/bitable/v1/apps/{app_token}/tables/{table_id}/fields", params={"page_size": 100})
    return payload.get("items") or []


async def fetch_views(app_token: str, table_id: str) -> list[dict[str, Any]]:
    payload = await request("GET", f"/bitable/v1/apps/{app_token}/tables/{table_id}/views", params={"page_size": 100})
    return payload.get("items") or []


async def fetch_records(app_token: str, table_id: str, view_id: str | None = None) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    page_token = None
    while True:
        params: dict[str, Any] = {"page_size": 200}
        if page_token:
            params["page_token"] = page_token
        if view_id:
            params["view_id"] = view_id
        payload = await request("GET", f"/bitable/v1/apps/{app_token}/tables/{table_id}/records", params=params)
        records.extend(payload.get("items") or [])
        if not payload.get("has_more"):
            break
        page_token = payload.get("page_token")
        if not page_token:
            break
    return records


def field_text(value: Any) -> str:
    if isinstance(value, list):
        parts = []
        for item in value:
            if isinstance(item, dict):
                parts.append(str(item.get("text") or item.get("name") or item.get("value") or ""))
            else:
                parts.append(str(item))
        return " ".join(part for part in parts if part).strip()
    if isinstance(value, dict):
        return str(value.get("text") or value.get("name") or value.get("value") or value).strip()
    return _norm(value)


async def main() -> None:
    app_token = settings.lark_schedule_base_app_token
    table_id = settings.lark_schedule_table_id
    view_id = settings.lark_schedule_view_id
    print(f"app_token={app_token}")
    print(f"configured_table_id={table_id}")
    print(f"configured_view_id={view_id}")

    tables = await fetch_tables(app_token)
    print("\nTABLES")
    for table in tables:
        mark = " <-- configured" if table.get("table_id") == table_id else ""
        print(f"- {table.get('name')} | {table.get('table_id')}{mark}")

    fields = await fetch_fields(app_token, table_id)
    field_names = [field.get("field_name") for field in fields]
    print("\nFIELDS")
    print(", ".join(str(name) for name in field_names))
    expected = ["姓名", "学号", "上课日期", "课程名", "星期", "起节", "止节", "节次范围", "上课时间", "时间", "教师", "教室", "学期", "周次", "班级", "备注"]
    missing_fields = [name for name in expected if name not in field_names]
    print(f"missing_expected_fields={missing_fields}")

    views = await fetch_views(app_token, table_id)
    print("\nVIEWS")
    for view in views:
        mark = " <-- configured" if view.get("view_id") == view_id else ""
        print(f"- {view.get('view_name')} | {view.get('view_id')}{mark}")

    records = await fetch_records(app_token, table_id, view_id)
    print(f"\nRECORDS in configured view: {len(records)}")

    db = SessionLocal()
    try:
        members = db.execute(select(Member).where(Member.status == "active")).scalars().all()
        by_student_no, by_name = _build_member_index(members)
        existing_markers = set()
        existing_rows = db.execute(select(ClassSchedule).where(ClassSchedule.notes.like("%feishu_schedule_record:%"))).scalars().all()
        for row in existing_rows:
            marker = "feishu_schedule_record:"
            notes = row.notes or ""
            if marker in notes:
                existing_markers.add(notes.split(marker, 1)[1].split(";", 1)[0].strip())
        print(f"existing_synced_class_rows={len(existing_rows)}")

        missing_required: Counter[str] = Counter()
        unmatched: list[tuple[str, str, str, str]] = []
        invalid_rows: list[tuple[str, str]] = []
        duplicate_keys: Counter[tuple[str, str, str, str, str]] = Counter()
        dates: list[Any] = []
        synced_count = 0
        valid_count = 0
        names = Counter()
        semesters = Counter()

        for record in records:
            record_id = _norm(record.get("record_id"))
            fields = record.get("fields") or {}
            member = _resolve_member(fields, by_student_no, by_name)
            class_date = _date(fields.get("上课日期"))
            start_period = _int(fields.get("起节"), 1)
            end_period = _int(fields.get("止节"), start_period)
            explicit_times = _parse_time_pair(fields.get("节次范围") or fields.get("上课时间") or fields.get("时间"))
            day_of_week = _int(fields.get("星期"), class_date.isoweekday() if class_date else 1)
            course_name = field_text(fields.get("课程名"))
            name = field_text(fields.get("姓名"))
            student_no = field_text(fields.get("学号"))
            names[name or "(empty)"] += 1
            semesters[field_text(fields.get("学期")) or "未设置学期"] += 1
            if class_date:
                dates.append(class_date)
            required = {
                "record_id": record_id,
                "member": member.open_id if member else "",
                "上课日期": class_date,
                "课程名": course_name,
                "星期": day_of_week if 1 <= day_of_week <= 7 else None,
            }
            missing = [key for key, value in required.items() if not value]
            if missing:
                for key in missing:
                    missing_required[key] += 1
                if not member:
                    unmatched.append((record_id, name, student_no, course_name))
                invalid_rows.append((record_id, ",".join(missing)))
                continue
            valid_count += 1
            if record_id in existing_markers:
                synced_count += 1
            start = explicit_times[0].strftime("%H:%M") if explicit_times else f"period:{start_period}"
            end = explicit_times[1].strftime("%H:%M") if explicit_times else f"period:{end_period}"
            duplicate_keys[(member.open_id, str(class_date), course_name, start, end)] += 1

        duplicates = [(key, count) for key, count in duplicate_keys.items() if count > 1]
        print("\nSUMMARY")
        print(f"valid_for_sync={valid_count}")
        print(f"invalid_or_skipped={len(invalid_rows)}")
        print(f"already_synced_markers_in_db={synced_count}")
        print(f"missing_required_counts={dict(missing_required)}")
        print(f"duplicate_schedule_keys={len(duplicates)}")
        if dates:
            print(f"date_range={min(dates)}..{max(dates)}")
        print(f"top_semesters={semesters.most_common(10)}")
        print(f"top_names={names.most_common(10)}")

        if unmatched:
            print("\nUNMATCHED MEMBERS sample")
            for item in unmatched[:30]:
                print(f"- record={item[0]} name={item[1]} student_no={item[2]} course={item[3]}")
        if invalid_rows:
            print("\nINVALID ROWS sample")
            for record_id, reason in invalid_rows[:30]:
                print(f"- record={record_id} missing={reason}")
        if duplicates:
            print("\nDUPLICATES sample")
            for key, count in duplicates[:30]:
                print(f"- count={count} key={key}")
    finally:
        db.close()


if __name__ == "__main__":
    asyncio.run(main())
