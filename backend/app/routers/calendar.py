"""日历模块路由: 事件 / 课程表 / 请假 / freebusy 空闲查询."""
from __future__ import annotations
import json, logging
from datetime import date, datetime, time, timedelta
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.config import settings
from app.deps import get_current_user
from app.models import CalendarEvent, ClassSchedule, LeaveRequest, LarkUserStatus, Member
from app.schemas.common import PageResponse
from app.services.calendar_sync import sync_lark_calendar_events
from app.services.class_schedule_sync import sync_class_schedules_from_lark_base
from app.services.lark_calendar import create_event as lark_create_event, delete_event as lark_delete_event
from app.services.lark_im import notify_event_invited, notify_leave_decided
from app.services.lark_user_status import set_lab_presence_status

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/calendar", tags=["calendar"])

EvType = Literal["meeting", "class", "leave", "personal", "lab", "other"]
LeaveType = Literal["sick", "personal", "annual", "business", "other"]
LeaveStatus = Literal["pending", "approved", "rejected", "cancelled"]


def _is_schedule_manager(member: Member) -> bool:
    return member.role in ("admin", "staff") or bool(
        member.title and any(key in member.title for key in ("团长", "政委", "部长"))
    )


def _as_naive_query_time(value: datetime) -> datetime:
    # SQLite stores existing calendar/class times as naive local datetimes.
    # Frontend datetime-local values are submitted with an offset, so normalize
    # before Python-side comparisons with expanded class schedule datetimes.
    return value.replace(tzinfo=None) if value.tzinfo else value


# ============ Event 日历事件 ============

class LarkUserStatusRead(BaseModel):
    member_open_id: str
    status_id: str | None = None
    status_type: str | None = None
    title: str | None = None
    emoji_key: str | None = None
    emoji_path: str | None = None
    presence_status: str | None = None
    is_active: bool
    start_at: datetime | None = None
    end_at: datetime | None = None
    updated_at: datetime
    model_config = {"from_attributes": True}


class LarkUserStatusSet(BaseModel):
    status: Literal["auto", "working", "focusing", "resting", "classroom", "meeting_room", "away"]


@router.get("/lark-statuses", response_model=list[LarkUserStatusRead])
def list_lark_user_statuses(
    member_open_ids: str | None = Query(None),
    db: Session = Depends(get_db),
    _: Member = Depends(get_current_user),
):
    now = datetime.utcnow()
    stmt = select(LarkUserStatus).where(LarkUserStatus.is_active.is_(True))
    stmt = stmt.where(or_(LarkUserStatus.end_at.is_(None), LarkUserStatus.end_at > now))
    if member_open_ids:
        ids = [item.strip() for item in member_open_ids.split(",") if item.strip()]
        if ids:
            stmt = stmt.where(LarkUserStatus.member_open_id.in_(ids[:300]))
    rows = db.execute(stmt.order_by(LarkUserStatus.updated_at.desc())).scalars().all()
    return [LarkUserStatusRead.model_validate(row) for row in rows]


@router.post("/lark-statuses/{member_open_id}", response_model=LarkUserStatusRead | None)
async def set_lark_user_status(
    member_open_id: str,
    payload: LarkUserStatusSet,
    db: Session = Depends(get_db),
    current_user: Member = Depends(get_current_user),
):
    can_manage = current_user.open_id in {
        "ou_20fec537961e0a66669370b00d0fc52d",
        "ou_c544c4877658cfa1df6cee41939b99c4",
    }
    if current_user.open_id != member_open_id and not can_manage:
        raise HTTPException(status_code=403, detail="只能修改自己的状态")
    try:
        row = await set_lab_presence_status(db, member_open_id, payload.status)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        log.exception("sync lark user status failed: %s", exc)
        raise HTTPException(status_code=502, detail="飞书状态同步失败") from exc
    if row is None:
        raise HTTPException(status_code=404, detail="member not found")
    if payload.status == "auto" and row and not row.is_active:
        return None
    return LarkUserStatusRead.model_validate(row)

class CalendarEventRead(BaseModel):
    event_id: int
    lark_event_id: str | None
    event_type: EvType
    title: str
    description: str | None
    location: str | None
    start_at: datetime
    end_at: datetime
    all_day: bool
    organizer_open_id: str
    attendees_json: str | None
    sync_status: str
    lark_synced_at: datetime | None
    related_project_id: int | None
    created_at: datetime
    model_config = {"from_attributes": True}


class CalendarEventCreate(BaseModel):
    event_type: EvType = "meeting"
    title: str
    description: str | None = None
    location: str | None = None
    start_at: datetime
    end_at: datetime
    all_day: bool = False
    attendee_open_ids: list[str] = []
    related_project_id: int | None = None
    sync_to_lark: bool = True


class LarkCalendarSyncPayload(BaseModel):
    calendar_id: str = ""
    start: datetime | None = None
    end: datetime | None = None


@router.get("/events", response_model=PageResponse[CalendarEventRead])
def list_events(
    start: datetime | None = Query(None),
    end: datetime | None = Query(None),
    member_open_id: str | None = Query(None),
    event_type: EvType | None = Query(None),
    related_project_id: int | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(200, ge=1, le=500),
    db: Session = Depends(get_db),
    _: Member = Depends(get_current_user),
):
    stmt = select(CalendarEvent)
    count_stmt = select(func.count()).select_from(CalendarEvent)
    if start:
        stmt = stmt.where(CalendarEvent.end_at >= start)
        count_stmt = count_stmt.where(CalendarEvent.end_at >= start)
    if end:
        stmt = stmt.where(CalendarEvent.start_at <= end)
        count_stmt = count_stmt.where(CalendarEvent.start_at <= end)
    if member_open_id:
        cond = or_(
            CalendarEvent.organizer_open_id == member_open_id,
            CalendarEvent.attendees_json.like(f'%"{member_open_id}"%'),
        )
        stmt = stmt.where(cond)
        count_stmt = count_stmt.where(cond)
    if event_type:
        stmt = stmt.where(CalendarEvent.event_type == event_type)
        count_stmt = count_stmt.where(CalendarEvent.event_type == event_type)
    if related_project_id is not None:
        stmt = stmt.where(CalendarEvent.related_project_id == related_project_id)
        count_stmt = count_stmt.where(CalendarEvent.related_project_id == related_project_id)
    stmt = stmt.order_by(CalendarEvent.start_at.asc()).offset((page - 1) * page_size).limit(page_size)
    items = db.execute(stmt).scalars().all()
    total = db.execute(count_stmt).scalar_one()
    return PageResponse[CalendarEventRead](
        items=[CalendarEventRead.model_validate(i) for i in items],
        total=total, page=page, page_size=page_size,
    )


@router.post("/events/sync-lark")
def sync_lark_calendar_events_api(
    payload: LarkCalendarSyncPayload,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    if not _is_schedule_manager(current):
        raise HTTPException(403, "仅管理者可同步飞书日历")
    calendar_id = payload.calendar_id.strip()
    if not calendar_id:
        raise HTTPException(400, "calendar_id 不能为空")
    now = datetime.utcnow()
    start = payload.start or (now - timedelta(days=30))
    end = payload.end or (now + timedelta(days=120))
    if end <= start:
        raise HTTPException(400, "结束时间必须晚于开始时间")
    return sync_lark_calendar_events(db, calendar_id, start, end, current.open_id)


@router.post("/events/sync-org-public")
def sync_org_public_calendar_events_api(
    payload: LarkCalendarSyncPayload,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    if not _is_schedule_manager(current):
        raise HTTPException(403, "仅管理者可同步飞书日历")
    calendar_id = settings.lark_org_public_calendar_id.strip()
    if not calendar_id:
        raise HTTPException(400, "未配置组织公共日历 ID")
    now = datetime.utcnow()
    start = payload.start or (now - timedelta(days=30))
    end = payload.end or (now + timedelta(days=120))
    if end <= start:
        raise HTTPException(400, "结束时间必须晚于开始时间")
    result = sync_lark_calendar_events(db, calendar_id, start, end, current.open_id)
    result["calendar_name"] = settings.lark_org_public_calendar_name
    return result


@router.post("/events", response_model=CalendarEventRead, status_code=201)
def create_event_api(
    payload: CalendarEventCreate,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    ev = CalendarEvent(
        event_type=payload.event_type, title=payload.title,
        description=payload.description, location=payload.location,
        start_at=payload.start_at, end_at=payload.end_at,
        all_day=payload.all_day, organizer_open_id=current.open_id,
        attendees_json=json.dumps(payload.attendee_open_ids, ensure_ascii=False) if payload.attendee_open_ids else None,
        related_project_id=payload.related_project_id,
        sync_status="local",
    )
    db.add(ev); db.flush()
    if payload.sync_to_lark:
        res = lark_create_event(
            title=payload.title, start_at=payload.start_at, end_at=payload.end_at,
            description=payload.description, location=payload.location,
            attendee_open_ids=payload.attendee_open_ids or None,
        )
        if res.get("ok") and res.get("event_id"):
            ev.lark_event_id = res["event_id"]
            ev.lark_calendar_id = res.get("calendar_id")
            ev.sync_status = "synced"
            ev.lark_synced_at = datetime.utcnow()
        else:
            ev.sync_status = "sync_failed"
            log.warning("lark calendar create failed: %s", res.get("error"))
    db.commit(); db.refresh(ev)
    for attendee_oid in (payload.attendee_open_ids or []):
        if attendee_oid and attendee_oid != current.open_id:
            notify_event_invited(
                attendee_open_id=attendee_oid,
                title=payload.title,
                start_at=str(payload.start_at),
                end_at=str(payload.end_at),
                location=payload.location,
                organizer_name=current.name,
            )
    return CalendarEventRead.model_validate(ev)


class CalendarEventUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    location: str | None = None
    start_at: datetime | None = None
    end_at: datetime | None = None
    event_type: EvType | None = None


@router.patch("/events/{event_id}", response_model=CalendarEventRead)
def update_event_api(
    event_id: int,
    payload: CalendarEventUpdate,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    ev = db.get(CalendarEvent, event_id)
    if not ev:
        raise HTTPException(404)
    if ev.organizer_open_id != current.open_id and current.role not in ("admin", "staff"):
        raise HTTPException(403, "无权修改")
    for field in ("title", "description", "location", "start_at", "end_at", "event_type"):
        v = getattr(payload, field)
        if v is not None:
            setattr(ev, field, v)
    db.commit(); db.refresh(ev)
    return CalendarEventRead.model_validate(ev)


@router.delete("/events/{event_id}", status_code=204)
def delete_event_api(
    event_id: int,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    ev = db.get(CalendarEvent, event_id)
    if not ev: raise HTTPException(404)
    if ev.organizer_open_id != current.open_id and current.role not in ("admin", "staff"):
        raise HTTPException(403)
    if ev.lark_event_id:
        try:
            lark_delete_event(ev.lark_event_id, ev.lark_calendar_id)
        except Exception as e:
            log.warning("lark delete failed: %s", e)
    db.delete(ev); db.commit()


# ============ ClassSchedule 课程表 ============

class ClassScheduleRead(BaseModel):
    schedule_id: int
    member_open_id: str
    course_name: str
    teacher: str | None
    location: str | None
    semester: str
    day_of_week: int
    start_time: time
    end_time: time
    week_pattern: str | None
    semester_start: date | None
    semester_end: date | None
    notes: str | None
    model_config = {"from_attributes": True}


class ClassScheduleCreate(BaseModel):
    course_name: str
    teacher: str | None = None
    location: str | None = None
    semester: str
    day_of_week: int
    start_time: time
    end_time: time
    week_pattern: str | None = None
    semester_start: date | None = None
    semester_end: date | None = None
    notes: str | None = None


class ClassScheduleBulk(BaseModel):
    items: list[ClassScheduleCreate]


@router.get("/classes", response_model=list[ClassScheduleRead])
def list_classes(
    member_open_id: str | None = Query(None),
    member_open_ids: str | None = Query(None, description="逗号分隔 open_id"),
    semester: str | None = Query(None),
    active_only: bool = Query(True),
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    oids = [item.strip() for item in (member_open_ids or "").split(",") if item.strip()]
    if member_open_id:
        oids = [member_open_id]
    if not oids:
        oids = [current.open_id]
    stmt = select(ClassSchedule).where(ClassSchedule.member_open_id.in_(list(dict.fromkeys(oids))[:100]))
    if semester:
        stmt = stmt.where(ClassSchedule.semester == semester)
    if active_only:
        today = date.today()
        stmt = stmt.where(or_(ClassSchedule.semester_start.is_(None), ClassSchedule.semester_start <= today))
        stmt = stmt.where(or_(ClassSchedule.semester_end.is_(None), ClassSchedule.semester_end >= today))
    stmt = stmt.order_by(ClassSchedule.member_open_id.asc(), ClassSchedule.day_of_week.asc(), ClassSchedule.start_time.asc())
    items = db.execute(stmt).scalars().all()
    return [ClassScheduleRead.model_validate(i) for i in items]


@router.post("/classes", response_model=ClassScheduleRead, status_code=201)
def create_class(
    payload: ClassScheduleCreate,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    c = ClassSchedule(**payload.model_dump(), member_open_id=current.open_id)
    db.add(c); db.commit(); db.refresh(c)
    return ClassScheduleRead.model_validate(c)


@router.post("/classes/bulk", response_model=list[ClassScheduleRead], status_code=201)
def create_classes_bulk(
    payload: ClassScheduleBulk,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    created = []
    for item in payload.items:
        c = ClassSchedule(**item.model_dump(), member_open_id=current.open_id)
        db.add(c)
        created.append(c)
    db.commit()
    for c in created: db.refresh(c)
    return [ClassScheduleRead.model_validate(c) for c in created]


@router.post("/classes/sync-lark")
async def sync_classes_from_lark(
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    if not _is_schedule_manager(current):
        raise HTTPException(403, "仅管理者可同步课表")
    return await sync_class_schedules_from_lark_base(db)


@router.delete("/classes/{schedule_id}", status_code=204)
def delete_class(
    schedule_id: int,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    c = db.get(ClassSchedule, schedule_id)
    if not c: raise HTTPException(404)
    if c.member_open_id != current.open_id and current.role not in ("admin", "staff"):
        raise HTTPException(403)
    db.delete(c); db.commit()


# ============ LeaveRequest 请假 ============

class LeaveRead(BaseModel):
    leave_id: int
    member_open_id: str
    leave_type: LeaveType
    start_at: datetime
    end_at: datetime
    reason: str | None
    status: LeaveStatus
    approved_by: str | None
    approved_at: datetime | None
    review_comment: str | None
    lark_event_id: str | None
    created_at: datetime
    model_config = {"from_attributes": True}


class LeaveCreate(BaseModel):
    leave_type: LeaveType = "personal"
    start_at: datetime
    end_at: datetime
    reason: str | None = None


class LeaveDecide(BaseModel):
    approve: bool
    comment: str | None = None


@router.get("/leaves", response_model=PageResponse[LeaveRead])
def list_leaves(
    member_open_id: str | None = Query(None),
    status: LeaveStatus | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    _: Member = Depends(get_current_user),
):
    stmt = select(LeaveRequest)
    count_stmt = select(func.count()).select_from(LeaveRequest)
    if member_open_id:
        stmt = stmt.where(LeaveRequest.member_open_id == member_open_id)
        count_stmt = count_stmt.where(LeaveRequest.member_open_id == member_open_id)
    if status:
        stmt = stmt.where(LeaveRequest.status == status)
        count_stmt = count_stmt.where(LeaveRequest.status == status)
    stmt = stmt.order_by(LeaveRequest.start_at.desc()).offset((page - 1) * page_size).limit(page_size)
    items = db.execute(stmt).scalars().all()
    total = db.execute(count_stmt).scalar_one()
    return PageResponse[LeaveRead](
        items=[LeaveRead.model_validate(i) for i in items],
        total=total, page=page, page_size=page_size,
    )


@router.post("/leaves", response_model=LeaveRead, status_code=201)
def create_leave(
    payload: LeaveCreate,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    if payload.end_at <= payload.start_at:
        raise HTTPException(400, "结束时间必须晚于开始时间")
    lr = LeaveRequest(
        member_open_id=current.open_id, leave_type=payload.leave_type,
        start_at=payload.start_at, end_at=payload.end_at, reason=payload.reason,
        status="pending",
    )
    db.add(lr); db.commit(); db.refresh(lr)
    return LeaveRead.model_validate(lr)


@router.patch("/leaves/{leave_id}", response_model=LeaveRead)
def decide_leave(
    leave_id: int,
    payload: LeaveDecide,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    lr = db.get(LeaveRequest, leave_id)
    if not lr: raise HTTPException(404)
    if current.role not in ("admin", "staff", "teacher"):
        # 团长 / 政委 / 部长可审批本部门
        target = db.get(Member, lr.member_open_id)
        if current.title and ("团长" in current.title or "政委" in current.title or "部长" in current.title):
            if target and target.department != current.department:
                raise HTTPException(403, "仅可审批本部门请假")
        else:
            raise HTTPException(403, "无审批权限")
    previous_status = lr.status
    lr.status = "approved" if payload.approve else "rejected"
    lr.approved_by = current.open_id
    lr.approved_at = datetime.utcnow()
    lr.review_comment = payload.comment
    if lr.status == "approved" and not lr.calendar_event_id:
        target = db.get(Member, lr.member_open_id)
        type_labels = {"sick": "病假", "personal": "事假", "annual": "年假", "business": "公出", "other": "其他"}
        title = f"{target.name if target else lr.member_open_id} 请假 ({type_labels.get(lr.leave_type, lr.leave_type)})"
        description_parts = [lr.reason or ""]
        if payload.comment:
            description_parts.append(f"审批意见: {payload.comment}")
        description_parts.append(f"审批人: {current.name}")
        res = lark_create_event(
            title=title, start_at=lr.start_at, end_at=lr.end_at,
            description="\n".join(part for part in description_parts if part), attendee_open_ids=[lr.member_open_id],
        )
        ev = CalendarEvent(
            event_type="leave", title=title, description=lr.reason,
            start_at=lr.start_at, end_at=lr.end_at, all_day=False,
            organizer_open_id=lr.member_open_id,
            attendees_json=json.dumps([lr.member_open_id]),
            sync_status="synced" if res.get("ok") else "sync_failed",
            lark_event_id=res.get("event_id"),
            lark_calendar_id=res.get("calendar_id"),
            lark_synced_at=datetime.utcnow() if res.get("ok") else None,
        )
        db.add(ev); db.flush()
        lr.calendar_event_id = ev.event_id
        lr.lark_event_id = res.get("event_id") if res.get("ok") else None
    elif lr.status == "rejected" and previous_status == "approved" and lr.calendar_event_id:
        ev = db.get(CalendarEvent, lr.calendar_event_id)
        if ev:
            if ev.lark_event_id:
                try:
                    lark_delete_event(ev.lark_event_id, ev.lark_calendar_id)
                except Exception as e:
                    log.warning("lark leave delete failed: %s", e)
            db.delete(ev)
        lr.calendar_event_id = None
        lr.lark_event_id = None
    db.commit(); db.refresh(lr)
    notify_leave_decided(
        applicant_open_id=lr.member_open_id,
        approved=(lr.status == "approved"),
        leave_type=lr.leave_type,
        start_at=str(lr.start_at), end_at=str(lr.end_at),
        comment=payload.comment, approver_name=current.name,
    )
    return LeaveRead.model_validate(lr)


# ============ FreeBusy 空闲查询 ============

class BusySlot(BaseModel):
    member_open_id: str
    start_at: datetime
    end_at: datetime
    kind: Literal["event", "class", "leave"]
    title: str


class FreeBusyResponse(BaseModel):
    members: list[str]
    range_start: datetime
    range_end: datetime
    busy: list[BusySlot]


@router.get("/freebusy", response_model=FreeBusyResponse)
def freebusy(
    member_ids: str = Query(..., description="逗号分隔 open_id"),
    start: datetime = Query(...),
    end: datetime = Query(...),
    db: Session = Depends(get_db),
    _: Member = Depends(get_current_user),
):
    start = _as_naive_query_time(start)
    end = _as_naive_query_time(end)
    if start > end:
        raise HTTPException(400, "结束时间必须晚于开始时间")
    members = [m.strip() for m in member_ids.split(",") if m.strip()]
    if not members: raise HTTPException(400, "member_ids 不能为空")
    members = list(dict.fromkeys(members))[:100]
    member_set = set(members)
    busy: list[BusySlot] = []

    # 1. CalendarEvent (作为 organizer 或 attendee)
    event_filters = [CalendarEvent.organizer_open_id.in_(members)]
    event_filters.extend(CalendarEvent.attendees_json.like(f'%"{oid}"%') for oid in members)
    events = db.execute(
        select(CalendarEvent).where(
            CalendarEvent.end_at >= start,
            CalendarEvent.start_at <= end,
            or_(*event_filters),
        )
    ).scalars().all()
    for ev in events:
        emitted: set[str] = set()
        if ev.organizer_open_id in member_set:
            busy.append(BusySlot(
                member_open_id=ev.organizer_open_id, start_at=ev.start_at, end_at=ev.end_at,
                kind="event", title=ev.title,
            ))
            emitted.add(ev.organizer_open_id)
        attendee_ids = set()
        if ev.attendees_json:
            try:
                attendee_ids = set(json.loads(ev.attendees_json) or [])
            except Exception:
                attendee_ids = set()
        for oid in member_set.intersection(attendee_ids).difference(emitted):
            busy.append(BusySlot(
                member_open_id=oid, start_at=ev.start_at, end_at=ev.end_at,
                kind="event", title=ev.title,
            ))

    # 2. LeaveRequest approved
    leaves = db.execute(
        select(LeaveRequest).where(
            LeaveRequest.member_open_id.in_(members),
            LeaveRequest.status == "approved",
            LeaveRequest.end_at >= start, LeaveRequest.start_at <= end,
        )
    ).scalars().all()
    for lr in leaves:
        busy.append(BusySlot(
            member_open_id=lr.member_open_id, start_at=lr.start_at, end_at=lr.end_at,
            kind="leave", title="请假",
        ))

    # 3. ClassSchedule 按周展开
    classes = db.execute(select(ClassSchedule).where(ClassSchedule.member_open_id.in_(members))).scalars().all()
    for c in classes:
        cur = start.date()
        while cur <= end.date():
            dow = cur.isoweekday()
            if c.day_of_week == dow:
                if (not c.semester_start or cur >= c.semester_start) and (not c.semester_end or cur <= c.semester_end):
                    s = datetime.combine(cur, c.start_time)
                    e = datetime.combine(cur, c.end_time)
                    if e >= start and s <= end:
                        busy.append(BusySlot(
                            member_open_id=c.member_open_id, start_at=s, end_at=e,
                            kind="class", title=c.course_name,
                        ))
            cur += timedelta(days=1)
    return FreeBusyResponse(members=members, range_start=start, range_end=end, busy=busy)
