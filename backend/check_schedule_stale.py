from __future__ import annotations

import asyncio
from collections import Counter
from datetime import date
from typing import Any

from sqlalchemy import select

from app.config import settings
from app.db import SessionLocal
from app.models import ClassSchedule, Member
from app.services.class_schedule_sync import _norm
from app.services.lark import get_lark


async def fetch_records(app_token: str, table_id: str, view_id: str | None = None) -> set[str]:
    records: set[str] = set()
    page_token = None
    while True:
        params: dict[str, Any] = {"page_size": 200}
        if page_token:
            params["page_token"] = page_token
        if view_id:
            params["view_id"] = view_id
        payload = await get_lark()._request(
            "GET",
            f"/bitable/v1/apps/{app_token}/tables/{table_id}/records",
            params=params,
        )
        for item in payload.get("items") or []:
            rid = _norm(item.get("record_id"))
            if rid:
                records.add(rid)
        if not payload.get("has_more"):
            break
        page_token = payload.get("page_token")
        if not page_token:
            break
    return records


def marker(row: ClassSchedule) -> str:
    notes = row.notes or ""
    key = "feishu_schedule_record:"
    if key not in notes:
        return ""
    return notes.split(key, 1)[1].split(";", 1)[0].strip()


async def main() -> None:
    current = await fetch_records(
        settings.lark_schedule_base_app_token,
        settings.lark_schedule_table_id,
        settings.lark_schedule_view_id,
    )
    db = SessionLocal()
    try:
        member_names = dict(db.execute(select(Member.open_id, Member.name)).all())
        rows = db.execute(select(ClassSchedule).where(ClassSchedule.notes.like("%feishu_schedule_record:%"))).scalars().all()
        stale = [row for row in rows if marker(row) and marker(row) not in current]
        today = date.today()
        active_stale = [
            row for row in stale
            if (row.semester_start is None or row.semester_start <= today)
            and (row.semester_end is None or row.semester_end >= today)
        ]
        print(f"current_view_records={len(current)}")
        print(f"db_feishu_rows={len(rows)}")
        print(f"stale_rows_not_in_view={len(stale)}")
        print(f"active_stale_rows={len(active_stale)}")
        print(f"stale_semesters={Counter(row.semester for row in stale).most_common()}")
        print(f"active_stale_semesters={Counter(row.semester for row in active_stale).most_common()}")
        print("active_stale_sample")
        for row in active_stale[:40]:
            print(
                f"- id={row.schedule_id} record={marker(row)} member={member_names.get(row.member_open_id, row.member_open_id)} "
                f"{row.semester_start} dow={row.day_of_week} {row.start_time}-{row.end_time} {row.course_name} @{row.location}"
            )
    finally:
        db.close()


if __name__ == "__main__":
    asyncio.run(main())
