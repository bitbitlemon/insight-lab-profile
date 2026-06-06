from __future__ import annotations

import json
import subprocess
import uuid
from datetime import datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import case, func, or_, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models import LabDailyReport, LabInteraction, LabMessageConfig, LabOccupancy, LabReservation, LabResource, LabSpace, Member
from app.schemas.common import PageResponse
from app.services.lark_chat_sync import build_recent_chat_clusters, visible_chat_options
from app.services.lark_daily_plan_sync import sync_daily_plan_base
from app.services.lark_im import _lark_cli

router = APIRouter(prefix="/api/lab", tags=["lab"])

SpaceType = Literal["campus", "building", "floor", "zone", "room", "workstation", "virtual"]
SpaceStatus = Literal["active", "inactive", "maintenance", "retired"]
ResourceType = Literal["meeting_room", "workstation", "equipment", "server", "gpu", "storage", "software", "account", "other"]
ResourceStatus = Literal["available", "occupied", "maintenance", "disabled", "retired"]
ReservationStatus = Literal["pending", "approved", "rejected", "cancelled", "completed"]
OccupancyStatus = Literal["present", "working", "meeting", "class", "away", "leave", "offline", "reserved"]
OccupancySource = Literal["manual", "calendar", "class", "leave", "reservation", "device", "system"]
InteractionKind = Literal["flower", "egg", "throw", "hammer", "whip", "water", "paper_airplane", "firework"]


def _is_lab_manager(member: Member) -> bool:
    return member.role in ("admin", "staff") or bool(
        member.title and any(key in member.title for key in ("团长", "政委", "部长"))
    )


def _require_lab_manager(member: Member) -> None:
    if not _is_lab_manager(member):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "lab manager required")


def _json_dumps(value) -> str | None:
    if value is None:
        return None
    return json.dumps(value, ensure_ascii=False)


def _json_loads(value: str | None, fallback):
    if not value:
        return fallback
    try:
        return json.loads(value)
    except Exception:
        return fallback


class LabSpaceRead(BaseModel):
    space_id: int
    parent_space_id: int | None = None
    code: str
    name: str
    space_type: SpaceType
    status: SpaceStatus
    capacity: int
    department: str | None = None
    location_label: str | None = None
    map_x: float | None = None
    map_y: float | None = None
    map_z: float | None = None
    width: float | None = None
    depth: float | None = None
    height: float | None = None
    sort_order: int
    description: str | None = None
    metadata: dict | None = None
    created_by: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class LabSpaceCreate(BaseModel):
    parent_space_id: int | None = None
    code: str = Field(..., min_length=1, max_length=80)
    name: str = Field(..., min_length=1, max_length=120)
    space_type: SpaceType = "room"
    status: SpaceStatus = "active"
    capacity: int = Field(0, ge=0)
    department: str | None = None
    location_label: str | None = None
    map_x: float | None = None
    map_y: float | None = None
    map_z: float | None = None
    width: float | None = Field(None, ge=0)
    depth: float | None = Field(None, ge=0)
    height: float | None = Field(None, ge=0)
    sort_order: int = 0
    description: str | None = None
    metadata: dict | None = None


class LabSpaceUpdate(BaseModel):
    parent_space_id: int | None = None
    name: str | None = Field(None, min_length=1, max_length=120)
    space_type: SpaceType | None = None
    status: SpaceStatus | None = None
    capacity: int | None = Field(None, ge=0)
    department: str | None = None
    location_label: str | None = None
    map_x: float | None = None
    map_y: float | None = None
    map_z: float | None = None
    width: float | None = Field(None, ge=0)
    depth: float | None = Field(None, ge=0)
    height: float | None = Field(None, ge=0)
    sort_order: int | None = None
    description: str | None = None
    metadata: dict | None = None


class LabResourceRead(BaseModel):
    resource_id: int
    space_id: int | None = None
    code: str
    name: str
    resource_type: ResourceType
    status: ResourceStatus
    capacity: int
    owner_department: str | None = None
    manager_open_id: str | None = None
    bookable: bool
    requires_approval: bool
    specs: dict | None = None
    description: str | None = None
    created_by: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class LabResourceCreate(BaseModel):
    space_id: int | None = None
    code: str = Field(..., min_length=1, max_length=80)
    name: str = Field(..., min_length=1, max_length=120)
    resource_type: ResourceType = "other"
    status: ResourceStatus = "available"
    capacity: int = Field(1, ge=0)
    owner_department: str | None = None
    manager_open_id: str | None = None
    bookable: bool = True
    requires_approval: bool = False
    specs: dict | None = None
    description: str | None = None


class LabResourceUpdate(BaseModel):
    space_id: int | None = None
    name: str | None = Field(None, min_length=1, max_length=120)
    resource_type: ResourceType | None = None
    status: ResourceStatus | None = None
    capacity: int | None = Field(None, ge=0)
    owner_department: str | None = None
    manager_open_id: str | None = None
    bookable: bool | None = None
    requires_approval: bool | None = None
    specs: dict | None = None
    description: str | None = None


class LabReservationRead(BaseModel):
    reservation_id: int
    resource_id: int
    space_id: int | None = None
    member_open_id: str
    title: str
    purpose: str | None = None
    start_at: datetime
    end_at: datetime
    status: ReservationStatus
    attendee_open_ids: list[str] = []
    related_project_id: int | None = None
    related_calendar_event_id: int | None = None
    lark_event_id: str | None = None
    approved_by: str | None = None
    approved_at: datetime | None = None
    review_comment: str | None = None
    created_by: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class LabReservationCreate(BaseModel):
    resource_id: int
    member_open_id: str | None = None
    title: str = Field(..., min_length=1, max_length=160)
    purpose: str | None = None
    start_at: datetime
    end_at: datetime
    attendee_open_ids: list[str] = Field(default_factory=list)
    related_project_id: int | None = None

    @field_validator("end_at")
    @classmethod
    def validate_end(cls, value, info):
        start = info.data.get("start_at")
        if start and value <= start:
            raise ValueError("end_at must be after start_at")
        return value


class LabReservationDecision(BaseModel):
    approved: bool
    comment: str | None = None


class LabOccupancyRead(BaseModel):
    occupancy_id: int
    space_id: int
    resource_id: int | None = None
    member_open_id: str | None = None
    status: OccupancyStatus
    source: OccupancySource
    confidence: float
    started_at: datetime
    expected_end_at: datetime | None = None
    expires_at: datetime | None = None
    note: str | None = None
    updated_by: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class LabChatClusterRead(BaseModel):
    cluster_id: str
    chat_id: str
    chat_name: str
    member_open_ids: list[str] = Field(default_factory=list)
    member_names: list[str] = Field(default_factory=list)
    message_count: int = 0
    last_message_at: datetime | None = None
    thoughts: list[str] = Field(default_factory=list)


class LabInteractionSummaryRead(BaseModel):
    member_open_id: str
    flower_count: int = 0
    egg_count: int = 0


class LabInteractionCreate(BaseModel):
    target_open_id: str = Field(..., min_length=1)
    kind: InteractionKind
    note: str | None = Field(None, max_length=240)


class LabInteractionRead(BaseModel):
    interaction_id: int
    target_open_id: str
    actor_open_id: str
    kind: InteractionKind
    note: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class LabDailyReportRead(BaseModel):
    daily_report_id: int
    base_record_id: str
    member_open_id: str | None = None
    member_name: str | None = None
    checkin_at: datetime | None = None
    thinking_start_at: datetime | None = None
    today_content: str | None = None
    yesterday_content: str | None = None
    three_day_content: str | None = None
    today_messages: str | None = None
    daily_summary: str | None = None
    today_thinking: str | None = None
    morning_messages: str | None = None
    afternoon_messages: str | None = None
    weekly_summary: str | None = None
    weekly_report: str | None = None
    synced_at: datetime

    model_config = {"from_attributes": True}


class LabDailySyncRead(BaseModel):
    fetched: int
    created: int
    updated: int


class LabOverviewRead(BaseModel):
    spaces_total: int
    active_spaces: int
    resources_total: int
    bookable_resources: int
    resources_by_status: dict[str, int] = Field(default_factory=dict)
    pending_reservations: int
    todays_reservations: int
    active_occupancy: int
    occupied_member_count: int


class LabMessageConfigRead(BaseModel):
    config_id: int | None = None
    manager_open_id: str
    chat_id: str | None = None
    chat_name: str | None = None
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


class LabMessageConfigPayload(BaseModel):
    chat_id: str = Field(..., min_length=3, max_length=120)
    chat_name: str | None = Field(None, max_length=120)


class LabMentionMessagePayload(BaseModel):
    target_open_id: str = Field(..., min_length=3, max_length=120)
    message: str = Field(..., min_length=1, max_length=600)
    chat_id: str | None = Field(None, max_length=120)


class LabMentionMessageRead(BaseModel):
    ok: bool
    chat_id: str
    target_open_id: str
    text: str
    send_as: str
    sender_open_id: str | None = None
    sender_name: str | None = None


class LabVisibleChatRead(BaseModel):
    chat_id: str
    chat_name: str
    member_count: int = 0
    updated_at: datetime | None = None


class LabOccupancyUpsert(BaseModel):
    space_id: int
    resource_id: int | None = None
    member_open_id: str | None = None
    status: OccupancyStatus = "present"
    source: OccupancySource = "manual"
    confidence: float = Field(1.0, ge=0, le=1)
    started_at: datetime | None = None
    expected_end_at: datetime | None = None
    expires_at: datetime | None = None
    note: str | None = None


def _space_read(row: LabSpace) -> LabSpaceRead:
    return LabSpaceRead(
        space_id=row.space_id,
        parent_space_id=row.parent_space_id,
        code=row.code,
        name=row.name,
        space_type=row.space_type,
        status=row.status,
        capacity=row.capacity,
        department=row.department,
        location_label=row.location_label,
        map_x=row.map_x,
        map_y=row.map_y,
        map_z=row.map_z,
        width=row.width,
        depth=row.depth,
        height=row.height,
        sort_order=row.sort_order,
        description=row.description,
        metadata=_json_loads(row.metadata_json, None),
        created_by=row.created_by,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _resource_read(row: LabResource) -> LabResourceRead:
    data = LabResourceRead.model_validate(row)
    return data.model_copy(update={"specs": _json_loads(row.specs_json, None)})


def _reservation_read(row: LabReservation) -> LabReservationRead:
    data = LabReservationRead.model_validate(row)
    return data.model_copy(update={"attendee_open_ids": _json_loads(row.attendee_open_ids_json, [])})


def _check_space(db: Session, space_id: int | None) -> None:
    if space_id is not None and db.get(LabSpace, space_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "space not found")


def _check_resource(db: Session, resource_id: int) -> LabResource:
    resource = db.get(LabResource, resource_id)
    if resource is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "resource not found")
    return resource


def _has_conflict(db: Session, resource_id: int, start_at: datetime, end_at: datetime, exclude_id: int | None = None) -> bool:
    stmt = select(func.count()).select_from(LabReservation).where(
        LabReservation.resource_id == resource_id,
        LabReservation.status.in_(("pending", "approved")),
        LabReservation.start_at < end_at,
        LabReservation.end_at > start_at,
    )
    if exclude_id:
        stmt = stmt.where(LabReservation.reservation_id != exclude_id)
    return db.execute(stmt).scalar_one() > 0


def _config_read(row: LabMessageConfig | None, current: Member) -> LabMessageConfigRead:
    if row is None:
        return LabMessageConfigRead(manager_open_id=current.open_id)
    return LabMessageConfigRead.model_validate(row)


def _lark_cli_user_identity() -> dict[str, str | None]:
    result = subprocess.run([_lark_cli(), "auth", "status"], capture_output=True, text=True, timeout=12)
    if result.returncode != 0:
        raise HTTPException(status.HTTP_409_CONFLICT, "当前服务器没有可用的飞书用户态授权")
    try:
        body = json.loads(result.stdout)
    except json.JSONDecodeError:
        raise HTTPException(status.HTTP_409_CONFLICT, "无法识别当前飞书用户态授权")
    if body.get("identity") != "user" or body.get("tokenStatus") != "valid":
        raise HTTPException(status.HTTP_409_CONFLICT, "当前飞书用户态授权不可用")
    return {
        "open_id": str(body.get("userOpenId") or "").strip() or None,
        "name": str(body.get("userName") or "").strip() or None,
    }


def _require_current_lark_identity(current: Member) -> dict[str, str | None]:
    identity = _lark_cli_user_identity()
    sender_open_id = identity.get("open_id")
    if sender_open_id != current.open_id:
        sender_name = identity.get("name") or sender_open_id or "未知用户"
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"当前飞书 CLI 授权人是 {sender_name}，不是当前登录人 {current.name}；请先以当前登录人授权后再发送",
        )
    return identity


def _send_chat_text(chat_id: str, text: str, *, identity: Literal["user", "bot"] = "user") -> bool:
    args = [
        _lark_cli(),
        "im",
        "+messages-send",
        "--chat-id",
        chat_id,
        "--text",
        text,
        "--as",
        identity,
        "--idempotency-key",
        f"cloud-lab-{uuid.uuid4().hex[:12]}",
    ]
    try:
        result = subprocess.run(args, capture_output=True, text=True, timeout=20)
        return result.returncode == 0
    except Exception:
        return False


@router.get("/message-config", response_model=LabMessageConfigRead)
def get_message_config(db: Session = Depends(get_db), current: Member = Depends(get_current_user)):
    _require_lab_manager(current)
    row = db.execute(
        select(LabMessageConfig).where(LabMessageConfig.manager_open_id == current.open_id)
    ).scalar_one_or_none()
    return _config_read(row, current)


@router.get("/messages/common-chats", response_model=list[LabVisibleChatRead])
def list_common_chats(
    target_open_id: str = Query(..., min_length=3),
    query: str | None = Query(None),
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    _require_lab_manager(current)
    if db.get(Member, target_open_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "成员不存在")
    _require_current_lark_identity(current)
    try:
        rows = visible_chat_options(member_open_id=target_open_id, query=query, page_size=30, identity="user")
    except Exception:
        rows = []
    return [LabVisibleChatRead(**row) for row in rows]


@router.put("/message-config", response_model=LabMessageConfigRead)
def save_message_config(
    payload: LabMessageConfigPayload,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    _require_lab_manager(current)
    chat_id = payload.chat_id.strip()
    if not chat_id.startswith("oc_"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "群聊 ID 应为 oc_ 开头")
    row = db.execute(
        select(LabMessageConfig).where(LabMessageConfig.manager_open_id == current.open_id)
    ).scalar_one_or_none()
    if row is None:
        row = LabMessageConfig(manager_open_id=current.open_id, chat_id=chat_id)
        db.add(row)
    row.chat_id = chat_id
    row.chat_name = payload.chat_name.strip() if payload.chat_name else None
    db.commit()
    db.refresh(row)
    return _config_read(row, current)


@router.post("/messages/mention", response_model=LabMentionMessageRead)
def send_mention_message(
    payload: LabMentionMessagePayload,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    _require_lab_manager(current)
    config = db.execute(
        select(LabMessageConfig).where(LabMessageConfig.manager_open_id == current.open_id)
    ).scalar_one_or_none()
    chat_id = payload.chat_id.strip() if payload.chat_id else config.chat_id if config else ""
    if not chat_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "请先配置云实验室消息发送群聊")
    target = db.get(Member, payload.target_open_id)
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "成员不存在")
    sender = _require_current_lark_identity(current)
    message = payload.message.strip()
    text = f'<at user_id="{target.open_id}">{target.name}</at> {message}'
    ok = _send_chat_text(chat_id, text, identity="user")
    if not ok:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "飞书群消息发送失败")
    return LabMentionMessageRead(
        ok=True,
        chat_id=chat_id,
        target_open_id=target.open_id,
        text=text,
        send_as="user",
        sender_open_id=sender.get("open_id"),
        sender_name=sender.get("name"),
    )


@router.get("/overview", response_model=LabOverviewRead)
def get_lab_overview(db: Session = Depends(get_db), current: Member = Depends(get_current_user)):
    now = datetime.utcnow()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    tomorrow_start = today_start + timedelta(days=1)

    reservation_scope = []
    if not _is_lab_manager(current):
        reservation_scope.append(LabReservation.member_open_id == current.open_id)

    pending_stmt = select(func.count()).select_from(LabReservation).where(LabReservation.status == "pending", *reservation_scope)
    today_stmt = select(func.count()).select_from(LabReservation).where(
        LabReservation.status.in_(("pending", "approved")),
        LabReservation.start_at < tomorrow_start,
        LabReservation.end_at > today_start,
        *reservation_scope,
    )
    active_occupancy_filter = or_(LabOccupancy.expires_at.is_(None), LabOccupancy.expires_at >= now)
    resources_by_status = {
        status_value: count
        for status_value, count in db.execute(
            select(LabResource.status, func.count()).group_by(LabResource.status)
        ).all()
    }
    occupied_member_count = db.execute(
        select(func.count(func.distinct(LabOccupancy.member_open_id))).where(
            LabOccupancy.member_open_id.is_not(None),
            active_occupancy_filter,
        )
    ).scalar_one()
    return LabOverviewRead(
        spaces_total=db.execute(select(func.count()).select_from(LabSpace)).scalar_one(),
        active_spaces=db.execute(select(func.count()).select_from(LabSpace).where(LabSpace.status == "active")).scalar_one(),
        resources_total=db.execute(select(func.count()).select_from(LabResource)).scalar_one(),
        bookable_resources=db.execute(select(func.count()).select_from(LabResource).where(LabResource.bookable.is_(True))).scalar_one(),
        resources_by_status=resources_by_status,
        pending_reservations=db.execute(pending_stmt).scalar_one(),
        todays_reservations=db.execute(today_stmt).scalar_one(),
        active_occupancy=db.execute(select(func.count()).select_from(LabOccupancy).where(active_occupancy_filter)).scalar_one(),
        occupied_member_count=occupied_member_count,
    )


@router.get("/interactions/summary", response_model=list[LabInteractionSummaryRead])
def list_lab_interaction_summary(
    member_open_ids: str | None = Query(None, description="逗号分隔 open_id; 空则返回全部有互动的成员"),
    db: Session = Depends(get_db),
    _: Member = Depends(get_current_user),
):
    requested = [item.strip() for item in (member_open_ids or "").split(",") if item.strip()]
    stmt = (
        select(
            LabInteraction.target_open_id,
            func.sum(case((LabInteraction.kind == "flower", 1), else_=0)).label("flower_count"),
            func.sum(case((LabInteraction.kind == "egg", 1), else_=0)).label("egg_count"),
        )
        .group_by(LabInteraction.target_open_id)
    )
    if requested:
        stmt = stmt.where(LabInteraction.target_open_id.in_(requested[:500]))
    rows = db.execute(stmt).all()
    by_member = {
        member_open_id: LabInteractionSummaryRead(
            member_open_id=member_open_id,
            flower_count=int(flower_count or 0),
            egg_count=int(egg_count or 0),
        )
        for member_open_id, flower_count, egg_count in rows
    }
    if requested:
        return [
            by_member.get(
                member_id,
                LabInteractionSummaryRead(member_open_id=member_id, flower_count=0, egg_count=0),
            )
            for member_id in requested[:500]
        ]
    return list(by_member.values())


@router.post("/interactions", response_model=LabInteractionRead, status_code=status.HTTP_201_CREATED)
def create_lab_interaction(
    payload: LabInteractionCreate,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    target = db.get(Member, payload.target_open_id)
    if not target:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "target member not found")
    row = LabInteraction(
        target_open_id=target.open_id,
        actor_open_id=current.open_id,
        kind=payload.kind,
        note=payload.note.strip() if payload.note else None,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.get("/chat-clusters", response_model=list[LabChatClusterRead])
def list_chat_clusters(
    max_chats: int = Query(40, ge=1, le=120),
    message_page_size: int = Query(30, ge=5, le=100),
    recent_hours: int = Query(1, ge=1, le=72),
    recent_minutes: int = Query(30, ge=1, le=1440),
    db: Session = Depends(get_db),
    _: Member = Depends(get_current_user),
):
    try:
        rows = build_recent_chat_clusters(
            db,
            max_chats=max_chats,
            message_page_size=message_page_size,
            recent_hours=recent_hours,
            recent_minutes=recent_minutes,
        )
    except Exception:
        return []
    return [LabChatClusterRead(**row) for row in rows]


@router.post("/daily-reports/sync", response_model=LabDailySyncRead)
def sync_lab_daily_reports(db: Session = Depends(get_db), current: Member = Depends(get_current_user)):
    _require_lab_manager(current)
    return LabDailySyncRead(**sync_daily_plan_base(db))


@router.get("/daily-reports", response_model=list[LabDailyReportRead])
def list_lab_daily_reports(
    member_open_id: str | None = Query(None),
    sync: bool = Query(False),
    limit: int = Query(80, ge=1, le=300),
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    if sync and _is_lab_manager(current):
        try:
            sync_daily_plan_base(db)
        except Exception:
            pass
    stmt = select(LabDailyReport)
    if member_open_id:
        stmt = stmt.where(LabDailyReport.member_open_id == member_open_id)
    stmt = stmt.order_by(LabDailyReport.checkin_at.desc().nullslast(), LabDailyReport.synced_at.desc()).limit(limit)
    return [LabDailyReportRead.model_validate(row) for row in db.execute(stmt).scalars().all()]


@router.get("/spaces", response_model=PageResponse[LabSpaceRead])
def list_spaces(
    page: int = Query(1, ge=1),
    page_size: int = Query(200, ge=1, le=500),
    space_type: SpaceType | None = Query(None),
    status_filter: SpaceStatus | None = Query(None, alias="status"),
    parent_space_id: int | None = Query(None),
    keyword: str | None = Query(None),
    db: Session = Depends(get_db),
    _: Member = Depends(get_current_user),
):
    stmt = select(LabSpace)
    count_stmt = select(func.count()).select_from(LabSpace)
    filters = []
    if space_type:
        filters.append(LabSpace.space_type == space_type)
    if status_filter:
        filters.append(LabSpace.status == status_filter)
    if parent_space_id is not None:
        filters.append(LabSpace.parent_space_id == parent_space_id)
    if keyword:
        pattern = f"%{keyword}%"
        filters.append(or_(LabSpace.name.ilike(pattern), LabSpace.code.ilike(pattern), LabSpace.location_label.ilike(pattern)))
    for condition in filters:
        stmt = stmt.where(condition)
        count_stmt = count_stmt.where(condition)
    stmt = stmt.order_by(LabSpace.sort_order.asc(), LabSpace.space_id.asc()).offset((page - 1) * page_size).limit(page_size)
    rows = db.execute(stmt).scalars().all()
    total = db.execute(count_stmt).scalar_one()
    return PageResponse[LabSpaceRead](items=[_space_read(row) for row in rows], total=total, page=page, page_size=page_size)


@router.post("/spaces", response_model=LabSpaceRead, status_code=201)
def create_space(payload: LabSpaceCreate, db: Session = Depends(get_db), current: Member = Depends(get_current_user)):
    _require_lab_manager(current)
    _check_space(db, payload.parent_space_id)
    row = LabSpace(**payload.model_dump(exclude={"metadata"}), metadata_json=_json_dumps(payload.metadata), created_by=current.open_id)
    db.add(row)
    db.commit()
    db.refresh(row)
    return _space_read(row)


@router.patch("/spaces/{space_id}", response_model=LabSpaceRead)
def update_space(space_id: int, payload: LabSpaceUpdate, db: Session = Depends(get_db), current: Member = Depends(get_current_user)):
    _require_lab_manager(current)
    row = db.get(LabSpace, space_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "space not found")
    data = payload.model_dump(exclude_unset=True, exclude={"metadata"})
    if "parent_space_id" in data and data["parent_space_id"] == space_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "space cannot be parent of itself")
    if "parent_space_id" in data:
        _check_space(db, data["parent_space_id"])
    for key, value in data.items():
        setattr(row, key, value)
    if "metadata" in payload.model_fields_set:
        row.metadata_json = _json_dumps(payload.metadata)
    db.commit()
    db.refresh(row)
    return _space_read(row)


@router.get("/resources", response_model=PageResponse[LabResourceRead])
def list_resources(
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=300),
    space_id: int | None = Query(None),
    resource_type: ResourceType | None = Query(None),
    status_filter: ResourceStatus | None = Query(None, alias="status"),
    bookable: bool | None = Query(None),
    keyword: str | None = Query(None),
    db: Session = Depends(get_db),
    _: Member = Depends(get_current_user),
):
    stmt = select(LabResource)
    count_stmt = select(func.count()).select_from(LabResource)
    filters = []
    if space_id is not None:
        filters.append(LabResource.space_id == space_id)
    if resource_type:
        filters.append(LabResource.resource_type == resource_type)
    if status_filter:
        filters.append(LabResource.status == status_filter)
    if bookable is not None:
        filters.append(LabResource.bookable == bookable)
    if keyword:
        pattern = f"%{keyword}%"
        filters.append(or_(LabResource.name.ilike(pattern), LabResource.code.ilike(pattern), LabResource.description.ilike(pattern)))
    for condition in filters:
        stmt = stmt.where(condition)
        count_stmt = count_stmt.where(condition)
    stmt = stmt.order_by(LabResource.resource_id.asc()).offset((page - 1) * page_size).limit(page_size)
    rows = db.execute(stmt).scalars().all()
    total = db.execute(count_stmt).scalar_one()
    return PageResponse[LabResourceRead](items=[_resource_read(row) for row in rows], total=total, page=page, page_size=page_size)


@router.post("/resources", response_model=LabResourceRead, status_code=201)
def create_resource(payload: LabResourceCreate, db: Session = Depends(get_db), current: Member = Depends(get_current_user)):
    _require_lab_manager(current)
    _check_space(db, payload.space_id)
    if payload.manager_open_id and db.get(Member, payload.manager_open_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "manager not found")
    row = LabResource(**payload.model_dump(exclude={"specs"}), specs_json=_json_dumps(payload.specs), created_by=current.open_id)
    db.add(row)
    db.commit()
    db.refresh(row)
    return _resource_read(row)


@router.patch("/resources/{resource_id}", response_model=LabResourceRead)
def update_resource(resource_id: int, payload: LabResourceUpdate, db: Session = Depends(get_db), current: Member = Depends(get_current_user)):
    _require_lab_manager(current)
    row = _check_resource(db, resource_id)
    data = payload.model_dump(exclude_unset=True, exclude={"specs"})
    if "space_id" in data:
        _check_space(db, data["space_id"])
    if data.get("manager_open_id") and db.get(Member, data["manager_open_id"]) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "manager not found")
    for key, value in data.items():
        setattr(row, key, value)
    if "specs" in payload.model_fields_set:
        row.specs_json = _json_dumps(payload.specs)
    db.commit()
    db.refresh(row)
    return _resource_read(row)


@router.get("/reservations", response_model=PageResponse[LabReservationRead])
def list_reservations(
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=300),
    resource_id: int | None = Query(None),
    member_open_id: str | None = Query(None),
    status_filter: ReservationStatus | None = Query(None, alias="status"),
    start: datetime | None = Query(None),
    end: datetime | None = Query(None),
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    stmt = select(LabReservation)
    count_stmt = select(func.count()).select_from(LabReservation)
    filters = []
    if resource_id is not None:
        filters.append(LabReservation.resource_id == resource_id)
    if member_open_id:
        if member_open_id != current.open_id and not _is_lab_manager(current):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "can only view own reservations")
        filters.append(LabReservation.member_open_id == member_open_id)
    elif not _is_lab_manager(current):
        filters.append(LabReservation.member_open_id == current.open_id)
    if status_filter:
        filters.append(LabReservation.status == status_filter)
    if start:
        filters.append(LabReservation.end_at >= start)
    if end:
        filters.append(LabReservation.start_at <= end)
    for condition in filters:
        stmt = stmt.where(condition)
        count_stmt = count_stmt.where(condition)
    stmt = stmt.order_by(LabReservation.start_at.desc()).offset((page - 1) * page_size).limit(page_size)
    rows = db.execute(stmt).scalars().all()
    total = db.execute(count_stmt).scalar_one()
    return PageResponse[LabReservationRead](items=[_reservation_read(row) for row in rows], total=total, page=page, page_size=page_size)


@router.post("/reservations", response_model=LabReservationRead, status_code=201)
def create_reservation(payload: LabReservationCreate, db: Session = Depends(get_db), current: Member = Depends(get_current_user)):
    resource = _check_resource(db, payload.resource_id)
    if not resource.bookable:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "resource is not bookable")
    member_open_id = payload.member_open_id or current.open_id
    if member_open_id != current.open_id and not _is_lab_manager(current):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "cannot reserve for others")
    if db.get(Member, member_open_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "member not found")
    if _has_conflict(db, resource.resource_id, payload.start_at, payload.end_at):
        raise HTTPException(status.HTTP_409_CONFLICT, "resource reservation time conflict")
    row = LabReservation(
        resource_id=resource.resource_id,
        space_id=resource.space_id,
        member_open_id=member_open_id,
        title=payload.title,
        purpose=payload.purpose,
        start_at=payload.start_at,
        end_at=payload.end_at,
        status="pending" if resource.requires_approval else "approved",
        attendee_open_ids_json=_json_dumps(payload.attendee_open_ids),
        related_project_id=payload.related_project_id,
        created_by=current.open_id,
        approved_by=None if resource.requires_approval else current.open_id,
        approved_at=None if resource.requires_approval else datetime.utcnow(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _reservation_read(row)


@router.patch("/reservations/{reservation_id}/decision", response_model=LabReservationRead)
def decide_reservation(
    reservation_id: int,
    payload: LabReservationDecision,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    _require_lab_manager(current)
    row = db.get(LabReservation, reservation_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "reservation not found")
    if row.status not in ("pending", "approved"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "reservation cannot be decided")
    if payload.approved and _has_conflict(db, row.resource_id, row.start_at, row.end_at, exclude_id=row.reservation_id):
        raise HTTPException(status.HTTP_409_CONFLICT, "resource reservation time conflict")
    row.status = "approved" if payload.approved else "rejected"
    row.approved_by = current.open_id
    row.approved_at = datetime.utcnow()
    row.review_comment = payload.comment
    db.commit()
    db.refresh(row)
    return _reservation_read(row)


@router.patch("/reservations/{reservation_id}/cancel", response_model=LabReservationRead)
def cancel_reservation(reservation_id: int, db: Session = Depends(get_db), current: Member = Depends(get_current_user)):
    row = db.get(LabReservation, reservation_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "reservation not found")
    if row.member_open_id != current.open_id and row.created_by != current.open_id and not _is_lab_manager(current):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "cannot cancel this reservation")
    if row.status in ("completed", "cancelled"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "reservation already closed")
    row.status = "cancelled"
    db.commit()
    db.refresh(row)
    return _reservation_read(row)


@router.get("/occupancy", response_model=PageResponse[LabOccupancyRead])
def list_occupancy(
    page: int = Query(1, ge=1),
    page_size: int = Query(200, ge=1, le=500),
    space_id: int | None = Query(None),
    member_open_id: str | None = Query(None),
    status_filter: OccupancyStatus | None = Query(None, alias="status"),
    active_only: bool = Query(True),
    db: Session = Depends(get_db),
    _: Member = Depends(get_current_user),
):
    now = datetime.utcnow()
    stmt = select(LabOccupancy)
    count_stmt = select(func.count()).select_from(LabOccupancy)
    filters = []
    if space_id is not None:
        filters.append(LabOccupancy.space_id == space_id)
    if member_open_id:
        filters.append(LabOccupancy.member_open_id == member_open_id)
    if status_filter:
        filters.append(LabOccupancy.status == status_filter)
    if active_only:
        filters.append(or_(LabOccupancy.expires_at.is_(None), LabOccupancy.expires_at >= now))
    for condition in filters:
        stmt = stmt.where(condition)
        count_stmt = count_stmt.where(condition)
    stmt = stmt.order_by(LabOccupancy.updated_at.desc()).offset((page - 1) * page_size).limit(page_size)
    rows = db.execute(stmt).scalars().all()
    total = db.execute(count_stmt).scalar_one()
    return PageResponse[LabOccupancyRead](items=[LabOccupancyRead.model_validate(row) for row in rows], total=total, page=page, page_size=page_size)


@router.post("/occupancy", response_model=LabOccupancyRead, status_code=201)
def upsert_occupancy(payload: LabOccupancyUpsert, db: Session = Depends(get_db), current: Member = Depends(get_current_user)):
    _check_space(db, payload.space_id)
    if payload.resource_id is not None:
        _check_resource(db, payload.resource_id)
    member_open_id = payload.member_open_id or current.open_id
    if member_open_id != current.open_id and not _is_lab_manager(current):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "cannot update occupancy for others")
    if member_open_id and db.get(Member, member_open_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "member not found")
    row = db.execute(
        select(LabOccupancy).where(
            LabOccupancy.space_id == payload.space_id,
            LabOccupancy.member_open_id == member_open_id,
            LabOccupancy.source == payload.source,
        )
    ).scalar_one_or_none()
    data = payload.model_dump(exclude_unset=True, exclude={"member_open_id", "started_at"})
    if row is None:
        row = LabOccupancy(**data, member_open_id=member_open_id, started_at=payload.started_at or datetime.utcnow(), updated_by=current.open_id)
        db.add(row)
    else:
        for key, value in data.items():
            setattr(row, key, value)
        row.member_open_id = member_open_id
        row.updated_by = current.open_id
        if "started_at" in payload.model_fields_set:
            row.started_at = payload.started_at or datetime.utcnow()
        else:
            row.started_at = row.started_at or datetime.utcnow()
    db.commit()
    db.refresh(row)
    return LabOccupancyRead.model_validate(row)
