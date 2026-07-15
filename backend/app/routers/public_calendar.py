"""Public read-only class schedule API for service integrations."""
from __future__ import annotations

import json
import secrets
from datetime import date, datetime, timedelta
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.models import CalendarEvent, ClassSchedule, LeaveRequest, Member
from app.services.lark import get_lark

router = APIRouter(prefix="/api/public", tags=["public-calendar"])
bearer = HTTPBearer(auto_error=False)


def require_schedule_api_token(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> None:
    expected = settings.schedule_api_token.strip()
    supplied = credentials.credentials.strip() if credentials else ""
    if not expected or not supplied or not secrets.compare_digest(supplied, expected):
        raise HTTPException(status_code=401, detail="invalid schedule api token")


class PublicClassScheduleRead(BaseModel):
    schedule_id: int
    member_open_id: str
    member_name: str | None = None
    course_name: str
    teacher: str | None = None
    location: str | None = None
    semester: str
    day_of_week: int
    start_time: str
    end_time: str
    week_pattern: str | None = None
    semester_start: date | None = None
    semester_end: date | None = None
    notes: str | None = None
    updated_at: datetime


class PublicBusySlot(BaseModel):
    member_open_id: str
    member_name: str | None = None
    start_at: datetime
    end_at: datetime
    kind: Literal["event", "class", "leave"]
    title: str
    location: str | None = None


class PublicFreeBusyResponse(BaseModel):
    members: list[str]
    range_start: datetime
    range_end: datetime
    busy: list[PublicBusySlot]


def _parse_member_ids(member_open_id: str | None, member_open_ids: str | None) -> list[str]:
    ids = [item.strip() for item in (member_open_ids or "").split(",") if item.strip()]
    if member_open_id:
        ids = [member_open_id.strip()]
    return list(dict.fromkeys(item for item in ids if item))[:200]


def _member_names(db: Session, member_ids: list[str]) -> dict[str, str]:
    if not member_ids:
        return {}
    rows = db.execute(select(Member.open_id, Member.name).where(Member.open_id.in_(member_ids))).all()
    return {open_id: name for open_id, name in rows}


def _schedule_record_id(row: ClassSchedule) -> str:
    marker = "feishu_schedule_record:"
    notes = row.notes or ""
    if marker not in notes:
        return ""
    return notes.split(marker, 1)[1].split(";", 1)[0].strip()


async def _current_schedule_record_ids() -> set[str]:
    app_token = settings.lark_schedule_base_app_token
    table_id = settings.lark_schedule_table_id
    if not app_token or not table_id:
        return set()
    current: set[str] = set()
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
            record_id = str(item.get("record_id") or "").strip()
            if record_id:
                current.add(record_id)
        if not payload.get("has_more"):
            break
        page_token = payload.get("page_token")
        if not page_token:
            break
    return current


@router.get(
    "/class-schedules",
    response_model=list[PublicClassScheduleRead],
    dependencies=[Depends(require_schedule_api_token)],
)
async def list_public_class_schedules(
    member_open_id: str | None = Query(None),
    member_open_ids: str | None = Query(None, description="Comma-separated member open_id values"),
    semester: str | None = Query(None),
    active_only: bool = Query(False),
    current_source_only: bool = Query(True),
    include_notes: bool = Query(False),
    limit: int = Query(10000, ge=1, le=10000),
    db: Session = Depends(get_db),
):
    ids = _parse_member_ids(member_open_id, member_open_ids)
    stmt = select(ClassSchedule)
    if ids:
        stmt = stmt.where(ClassSchedule.member_open_id.in_(ids))
    if semester:
        stmt = stmt.where(ClassSchedule.semester == semester)
    if active_only:
        today = date.today()
        stmt = stmt.where(or_(ClassSchedule.semester_start.is_(None), ClassSchedule.semester_start <= today))
        stmt = stmt.where(or_(ClassSchedule.semester_end.is_(None), ClassSchedule.semester_end >= today))
    stmt = stmt.order_by(
        ClassSchedule.member_open_id.asc(),
        ClassSchedule.day_of_week.asc(),
        ClassSchedule.start_time.asc(),
    )
    rows = db.execute(stmt).scalars().all()
    if current_source_only:
        current_record_ids = await _current_schedule_record_ids()
        rows = [row for row in rows if _schedule_record_id(row) in current_record_ids]
    rows = rows[:limit]
    names = _member_names(db, list(dict.fromkeys(row.member_open_id for row in rows)))
    return [
        PublicClassScheduleRead(
            schedule_id=row.schedule_id,
            member_open_id=row.member_open_id,
            member_name=names.get(row.member_open_id),
            course_name=row.course_name,
            teacher=row.teacher,
            location=row.location,
            semester=row.semester,
            day_of_week=row.day_of_week,
            start_time=row.start_time.strftime("%H:%M"),
            end_time=row.end_time.strftime("%H:%M"),
            week_pattern=row.week_pattern,
            semester_start=row.semester_start,
            semester_end=row.semester_end,
            notes=row.notes if include_notes else None,
            updated_at=row.updated_at,
        )
        for row in rows
    ]


@router.get(
    "/class-schedules/freebusy",
    response_model=PublicFreeBusyResponse,
    dependencies=[Depends(require_schedule_api_token)],
)
async def public_class_schedule_freebusy(
    member_ids: str = Query(..., description="Comma-separated member open_id values"),
    start: datetime = Query(...),
    end: datetime = Query(...),
    current_source_only: bool = Query(True),
    db: Session = Depends(get_db),
):
    start = start.replace(tzinfo=None) if start.tzinfo else start
    end = end.replace(tzinfo=None) if end.tzinfo else end
    if end <= start:
        raise HTTPException(status_code=400, detail="end must be later than start")
    members = list(dict.fromkeys(item.strip() for item in member_ids.split(",") if item.strip()))[:200]
    if not members:
        raise HTTPException(status_code=400, detail="member_ids is required")
    member_set = set(members)
    names = _member_names(db, members)
    busy: list[PublicBusySlot] = []

    event_filters = [CalendarEvent.organizer_open_id.in_(members)]
    event_filters.extend(CalendarEvent.attendees_json.like(f'%"{oid}"%') for oid in members)
    events = db.execute(
        select(CalendarEvent).where(
            CalendarEvent.end_at >= start,
            CalendarEvent.start_at <= end,
            or_(*event_filters),
        )
    ).scalars().all()
    for event in events:
        emitted: set[str] = set()
        if event.organizer_open_id in member_set:
            busy.append(PublicBusySlot(
                member_open_id=event.organizer_open_id,
                member_name=names.get(event.organizer_open_id),
                start_at=event.start_at,
                end_at=event.end_at,
                kind="event",
                title=event.title,
                location=event.location,
            ))
            emitted.add(event.organizer_open_id)
        attendee_ids: set[str] = set()
        if event.attendees_json:
            try:
                attendee_ids = set(json.loads(event.attendees_json) or [])
            except Exception:
                attendee_ids = set()
        for member_id in member_set.intersection(attendee_ids).difference(emitted):
            busy.append(PublicBusySlot(
                member_open_id=member_id,
                member_name=names.get(member_id),
                start_at=event.start_at,
                end_at=event.end_at,
                kind="event",
                title=event.title,
                location=event.location,
            ))

    leaves = db.execute(
        select(LeaveRequest).where(
            LeaveRequest.member_open_id.in_(members),
            LeaveRequest.status == "approved",
            LeaveRequest.end_at >= start,
            LeaveRequest.start_at <= end,
        )
    ).scalars().all()
    for leave in leaves:
        busy.append(PublicBusySlot(
            member_open_id=leave.member_open_id,
            member_name=names.get(leave.member_open_id),
            start_at=leave.start_at,
            end_at=leave.end_at,
            kind="leave",
            title="请假",
        ))

    classes = db.execute(select(ClassSchedule).where(ClassSchedule.member_open_id.in_(members))).scalars().all()
    if current_source_only:
        current_record_ids = await _current_schedule_record_ids()
        classes = [row for row in classes if _schedule_record_id(row) in current_record_ids]
    for row in classes:
        cur = start.date()
        while cur <= end.date():
            if row.day_of_week == cur.isoweekday():
                if (not row.semester_start or cur >= row.semester_start) and (
                    not row.semester_end or cur <= row.semester_end
                ):
                    class_start = datetime.combine(cur, row.start_time)
                    class_end = datetime.combine(cur, row.end_time)
                    if class_end >= start and class_start <= end:
                        busy.append(PublicBusySlot(
                            member_open_id=row.member_open_id,
                            member_name=names.get(row.member_open_id),
                            start_at=class_start,
                            end_at=class_end,
                            kind="class",
                            title=row.course_name,
                            location=row.location,
                        ))
            cur += timedelta(days=1)

    busy.sort(key=lambda item: (item.start_at, item.member_open_id, item.kind))
    return PublicFreeBusyResponse(members=members, range_start=start, range_end=end, busy=busy)
