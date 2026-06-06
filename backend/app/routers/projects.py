"""项目管理路由: Project CRUD + 成员管理 + 完成时触发积分分发."""
from __future__ import annotations
import json
from datetime import date, datetime, timedelta
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, field_validator
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.config import settings
from app.db import get_db
from app.deps import get_current_user
from app.models import (
    Advising, AuditLog, Member, Paper, PaperMilestone, PIPELINE_STAGES,
    PointsLedger, Project, ProjectChat, ProjectChatMessage, ProjectChatTopic,
    ProjectLog, ProjectMember, ProjectRelation, Task,
)
from app.schemas.common import PageResponse
from app.services.points_rules import RULES_VERSION
from app.services.lark_im import notify_project_log, notify_project_member_added, notify_task_assigned
from app.services.base_writer import mirror_to_base, delete_from_base
from app.services.lark_chat_sync import list_chat_topics_preview, search_visible_chats, sync_project_chat

router = APIRouter(prefix="/api/projects", tags=["projects"])

PStatus = Literal["planning", "active", "paused", "completed", "archived"]
PPriority = Literal["low", "medium", "high", "urgent"]
PType = Literal["personal", "team"]
PMRole = Literal["owner", "co_lead", "member", "observer"]
PRelationType = Literal["transformed_to", "derived", "related"]
EQUAL_ACCESS_OPEN_IDS = {
    "ou_20fec537961e0a66669370b00d0fc52d",  # 罗起宁
    "ou_c544c4877658cfa1df6cee41939b99c4",  # 秦振凯
}


def _coerce_datetime(value):
    if value is None or isinstance(value, datetime):
        return value
    if isinstance(value, date):
        return datetime.combine(value, datetime.min.time())
    if isinstance(value, str) and len(value) == 10:
        return datetime.fromisoformat(f"{value}T00:00:00")
    return value


class ProjectMemberRead(BaseModel):
    member_open_id: str
    role: PMRole
    share_ratio: float
    tags: str | None = None
    received_at: datetime | None = None
    joined_at: date
    left_at: date | None
    model_config = {"from_attributes": True}


class ChangeLogRead(BaseModel):
    log_id: int
    actor_open_id: str
    actor_name: str | None = None
    action: str
    target_table: str
    target_id: str
    changes: dict
    created_at: datetime


LogKind = Literal["note", "guidance", "server", "member_change", "paper_stage", "notification"]
LogStatus = Literal["recorded", "pending", "pending_approval", "approved", "rejected", "notified"]
PaperStatus = Literal["published", "accepted", "under_review", "in_progress", "rejected"]
PaperStage = Literal["topic", "research", "experiment", "draft", "submit"]
MilestoneStatus = Literal["pending", "in_progress", "done", "blocked"]


class ProjectLogRead(BaseModel):
    log_id: int
    project_id: int
    actor_open_id: str
    actor_name: str | None = None
    kind: LogKind
    kind_label: str = ""
    status: LogStatus
    status_label: str = ""
    title: str
    body: str | None = None
    target_open_id: str | None = None
    target_name: str | None = None
    approver_open_id: str | None = None
    approver_name: str | None = None
    resource_type: str | None = None
    old_value: str | None = None
    new_value: str | None = None
    paper_id: int | None = None
    paper_stage: str | None = None
    paper_status: str | None = None
    notified_at: datetime | None = None
    approved_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ProjectLogCreate(BaseModel):
    kind: LogKind = "note"
    title: str | None = None
    body: str | None = None
    target_open_id: str | None = None
    resource_type: str | None = None
    old_value: str | None = None
    new_value: str | None = None
    paper_id: int | None = None
    paper_stage: PaperStage | None = None
    paper_status: PaperStatus | None = None
    milestone_status: MilestoneStatus | None = None
    notify_now: bool = True


class ProjectRelationCreate(BaseModel):
    target_project_id: int
    relation_type: PRelationType = "related"
    title: str | None = None
    description: str | None = None


class ProjectRelationRead(BaseModel):
    relation_id: int
    source_project_id: int
    target_project_id: int
    project_id: int
    project_name: str
    project_status: PStatus
    project_type: PType
    tags: str | None = None
    relation_type: PRelationType
    relation_label: str
    direction: Literal["outgoing", "incoming"]
    title: str | None = None
    description: str | None = None
    created_by: str
    created_by_name: str | None = None
    created_at: datetime
    updated_at: datetime


class ProjectLogDecision(BaseModel):
    approved: bool
    comment: str | None = None


class ProjectChatRead(BaseModel):
    project_chat_id: int
    project_id: int
    chat_id: str
    chat_name: str | None = None
    description: str | None = None
    selected_topic_key: str | None = None
    selected_topic_title: str | None = None
    sync_enabled: bool
    last_synced_at: datetime | None = None
    last_message_at: datetime | None = None
    latest_topic_key: str | None = None
    latest_topic_title: str | None = None
    latest_topic_reply_at: datetime | None = None
    created_by: str
    created_at: datetime
    updated_at: datetime
    topic_count: int = 0
    message_count: int = 0
    is_stale: bool = False
    stale_reason: str | None = None

    model_config = {"from_attributes": True}


class ProjectChatTopicRead(BaseModel):
    project_chat_topic_id: int
    project_chat_id: int
    project_id: int
    topic_key: str
    title: str | None = None
    first_message_id: str | None = None
    first_sender_open_id: str | None = None
    last_message_id: str | None = None
    last_reply_at: datetime | None = None
    reply_count: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ProjectChatMessageRead(BaseModel):
    project_chat_message_id: int
    project_chat_id: int
    project_id: int
    chat_id: str
    message_id: str
    topic_key: str
    root_id: str | None = None
    parent_id: str | None = None
    thread_id: str | None = None
    sender_open_id: str | None = None
    sender_name: str | None = None
    sender_type: str | None = None
    msg_type: str | None = None
    content: str | None = None
    deleted: bool
    updated: bool
    message_created_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class LarkVisibleChatRead(BaseModel):
    chat_id: str
    name: str | None = None
    description: str | None = None
    avatar: str | None = None
    chat_mode: str | None = None
    chat_status: str | None = None
    external: bool | None = None
    owner_id: str | None = None
    create_time: str | None = None


class LarkVisibleChatPage(BaseModel):
    chats: list[LarkVisibleChatRead]
    has_more: bool = False
    page_token: str | None = None


class LarkChatTopicPreview(BaseModel):
    topic_key: str
    title: str | None = None
    last_reply_at: datetime | None = None
    reply_count: int = 0
    last_message_id: str | None = None


class LarkChatTopicPreviewPage(BaseModel):
    topics: list[LarkChatTopicPreview]
    has_more: bool = False
    page_token: str | None = None


class ProjectRead(BaseModel):
    project_id: int
    name: str
    description: str | None
    status: PStatus
    publication_status: Literal["draft", "published"] = "draft"
    priority: PPriority
    project_type: PType
    my_project_type: PType | None = None
    owner_open_id: str
    department: str | None
    start_date: date | None
    target_end_date: datetime | None
    actual_end_date: datetime | None
    tags: str | None
    points_awarded: float
    archived_at: datetime | None
    created_by: str
    created_at: datetime
    updated_at: datetime
    members: list[ProjectMemberRead] = []
    chats: list[ProjectChatRead] = []
    days_active: int = 0
    task_count: int = 0
    task_done_count: int = 0
    is_abnormal: bool = False
    abnormal_reason: str | None = None
    abnormal_chat_count: int = 0

    model_config = {"from_attributes": True}


class ProjectCreate(BaseModel):
    name: str
    description: str | None = None
    status: PStatus = "active"
    priority: PPriority = "medium"
    project_type: PType | None = None
    department: str | None = None
    start_date: date | None = None
    target_end_date: datetime | None = None
    tags: str | None = None
    points_awarded: float = 0.0
    members: list[dict] = []  # [{"member_open_id":..., "share_ratio":..., "tags":...}]

    @field_validator("target_end_date", mode="before")
    @classmethod
    def coerce_target_end_date(cls, value):
        return _coerce_datetime(value)


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    status: PStatus | None = None
    priority: PPriority | None = None
    project_type: PType | None = None
    department: str | None = None
    start_date: date | None = None
    target_end_date: datetime | None = None
    actual_end_date: datetime | None = None
    tags: str | None = None
    points_awarded: float | None = None

    @field_validator("target_end_date", "actual_end_date", mode="before")
    @classmethod
    def coerce_project_datetimes(cls, value):
        return _coerce_datetime(value)


def _serialize(p: Project, current: Member | None = None) -> ProjectRead:
    today = date.today()
    if p.start_date:
        end = p.actual_end_date.date() if p.actual_end_date else today
        days = max(0, (end - p.start_date).days)
    else:
        days = 0
    pr = ProjectRead.model_validate(p)
    if current:
        pr.my_project_type = "personal" if _active_member_open_ids(p) and current.open_id in _active_member_open_ids(p) else "team"
    pr.days_active = days
    pr.task_count = len(p.tasks)
    pr.task_done_count = sum(1 for t in p.tasks if t.status == "done")
    pr.chats = [_serialize_chat(chat) for chat in getattr(p, "chats", [])]
    stale_chats = [chat for chat in pr.chats if chat.is_stale]
    pr.abnormal_chat_count = len(stale_chats)
    pr.is_abnormal = p.status in ("planning", "active") and bool(stale_chats)
    if pr.is_abnormal:
        first = stale_chats[0]
        pr.abnormal_reason = first.stale_reason or "关联话题超过 48 小时无新回复"
    return pr


def _active_member_open_ids(p: Project) -> set[str]:
    return {m.member_open_id for m in getattr(p, "members", []) if m.left_at is None}


def _serialize_chat(chat: ProjectChat) -> ProjectChatRead:
    item = ProjectChatRead.model_validate(chat)
    item.topic_count = len(getattr(chat, "topics", []) or [])
    item.message_count = len(getattr(chat, "messages", []) or [])
    if chat.selected_topic_key:
        cutoff = datetime.now() - timedelta(hours=48)
        if not chat.latest_topic_reply_at:
            item.is_stale = True
            item.stale_reason = "关联话题暂无同步回复"
        elif chat.latest_topic_reply_at < cutoff:
            item.is_stale = True
            item.stale_reason = "关联话题超过 48 小时无新回复"
    return item


def _is_department_privileged(current: Member) -> bool:
    return current.role in ("admin", "staff")


def _same_department(project: Project, current: Member) -> bool:
    return bool(project.department and current.department and project.department == current.department)


def _has_equal_owner_access(project: Project, current: Member) -> bool:
    return current.open_id in EQUAL_ACCESS_OPEN_IDS and project.owner_open_id in EQUAL_ACCESS_OPEN_IDS


def _has_developer_project_view(current: Member) -> bool:
    return current.open_id in EQUAL_ACCESS_OPEN_IDS


def _can_manage_project(p: Project, current: Member) -> bool:
    return p.owner_open_id == current.open_id or _has_equal_owner_access(p, current) or (
        p.project_type == "team" and _is_department_privileged(current) and _same_department(p, current)
    )


def _can_view_project(p: Project, current: Member, db: Session) -> bool:
    if _has_developer_project_view(current):
        return True
    if _can_manage_project(p, current):
        return True
    membership = db.get(ProjectMember, (p.project_id, current.open_id))
    return membership is not None and membership.left_at is None


def _audit_payload(entry: AuditLog, db: Session) -> ChangeLogRead:
    actor = db.get(Member, entry.actor_open_id)
    try:
        changes = json.loads(entry.diff or "{}")
    except json.JSONDecodeError:
        changes = {}
    return ChangeLogRead(
        log_id=entry.log_id,
        actor_open_id=entry.actor_open_id,
        actor_name=actor.name if actor else None,
        action=entry.action,
        target_table=entry.target_table,
        target_id=entry.target_id,
        changes=changes,
        created_at=entry.created_at,
    )


LOG_KIND_LABEL = {
    "note": "项目记录",
    "guidance": "指导申请",
    "server": "服务器申请",
    "member_change": "人员变动",
    "paper_stage": "论文节点",
    "notification": "通知",
}

LOG_STATUS_LABEL = {
    "recorded": "已记录",
    "pending": "待处理",
    "pending_approval": "待上级审批",
    "approved": "已通过",
    "rejected": "已拒绝",
    "notified": "已通知",
}

RELATION_TYPE_LABEL = {
    "transformed_to": "调整为",
    "derived": "衍生项目",
    "related": "相关项目",
}

PAPER_STAGE_LABEL_LOCAL = {
    "topic": "选题",
    "research": "调研",
    "experiment": "实验",
    "draft": "初稿",
    "submit": "投稿/评审",
}


def _member_name(db: Session, open_id: str | None) -> str | None:
    if not open_id:
        return None
    member = db.get(Member, open_id)
    return member.name if member else open_id


def _serialize_project_log(row: ProjectLog, db: Session) -> ProjectLogRead:
    item = ProjectLogRead.model_validate(row)
    item.actor_name = _member_name(db, row.actor_open_id)
    item.target_name = _member_name(db, row.target_open_id)
    item.approver_name = _member_name(db, row.approver_open_id)
    item.kind_label = LOG_KIND_LABEL.get(row.kind, row.kind)
    item.status_label = LOG_STATUS_LABEL.get(row.status, row.status)
    return item


def _serialize_project_relation(row: ProjectRelation, current_project_id: int, related: Project, db: Session) -> ProjectRelationRead:
    return ProjectRelationRead(
        relation_id=row.relation_id,
        source_project_id=row.source_project_id,
        target_project_id=row.target_project_id,
        project_id=related.project_id,
        project_name=related.name,
        project_status=related.status,
        project_type=related.project_type,
        tags=related.tags,
        relation_type=row.relation_type,
        relation_label=RELATION_TYPE_LABEL.get(row.relation_type, row.relation_type),
        direction="outgoing" if row.source_project_id == current_project_id else "incoming",
        title=row.title,
        description=row.description,
        created_by=row.created_by,
        created_by_name=_member_name(db, row.created_by),
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _guidance_approver(db: Session, advisor_open_id: str | None) -> str | None:
    if not advisor_open_id:
        return None
    today = date.today()
    row = db.execute(
        select(Advising)
        .where(Advising.student_open_id == advisor_open_id)
        .where(Advising.role == "primary")
        .where(or_(Advising.end_date.is_(None), Advising.end_date >= today))
        .order_by(Advising.start_date.desc())
        .limit(1)
    ).scalar_one_or_none()
    return row.advisor_open_id if row else None


def _ensure_paper_milestone(db: Session, paper_id: int, stage: str, owner_open_id: str) -> PaperMilestone:
    row = db.execute(
        select(PaperMilestone).where(PaperMilestone.paper_id == paper_id, PaperMilestone.stage == stage)
    ).scalar_one_or_none()
    if row:
        return row
    row = PaperMilestone(paper_id=paper_id, stage=stage, owner_open_id=owner_open_id, status="pending")
    db.add(row)
    db.flush()
    return row


def _apply_paper_transition(db: Session, payload: ProjectLogCreate, current: Member) -> dict:
    changed: dict[str, str | int | None] = {}
    if not payload.paper_id:
        return changed
    paper = db.get(Paper, payload.paper_id)
    if not paper:
        raise HTTPException(400, "paper not found")
    if payload.paper_status and paper.status != payload.paper_status:
        changed["paper_status_before"] = paper.status
        paper.status = payload.paper_status
        changed["paper_status_after"] = payload.paper_status
    if payload.paper_stage:
        if payload.paper_stage not in PIPELINE_STAGES:
            raise HTTPException(400, "invalid paper stage")
        milestone = _ensure_paper_milestone(db, paper.paper_id, payload.paper_stage, current.open_id)
        next_status = payload.milestone_status or "done"
        changed["paper_stage"] = payload.paper_stage
        changed["milestone_status_before"] = milestone.status
        milestone.status = next_status
        if next_status == "done" and not milestone.completed_at:
            milestone.completed_at = datetime.utcnow()
        elif next_status != "done":
            milestone.completed_at = None
        changed["milestone_status_after"] = next_status
    return changed


def _default_log_title(payload: ProjectLogCreate, project: Project, db: Session) -> str:
    if payload.title:
        return payload.title
    if payload.kind == "guidance":
        return f"申请 {_member_name(db, payload.target_open_id) or '指导人'} 指导项目"
    if payload.kind == "server":
        return f"申请服务器资源: {payload.resource_type or '未指定资源'}"
    if payload.kind == "member_change":
        return f"项目人员变动: {payload.old_value or '-'} -> {payload.new_value or '-'}"
    if payload.kind == "paper_stage":
        stage = PAPER_STAGE_LABEL_LOCAL.get(payload.paper_stage or "", payload.paper_stage or "论文节点")
        status = payload.paper_status or payload.milestone_status or ""
        return f"该项目进入{stage}{(' / ' + status) if status else ''}"
    return f"更新项目《{project.name}》日志"


@router.get("", response_model=PageResponse[ProjectRead])
def list_projects(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    status: PStatus | None = Query(None),
    department: str | None = Query(None),
    member_open_id: str | None = Query(None),
    project_type: PType | None = Query(None),
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    stmt = select(Project).options(
        selectinload(Project.members),
        selectinload(Project.tasks),
        selectinload(Project.chats).selectinload(ProjectChat.topics),
        selectinload(Project.chats).selectinload(ProjectChat.messages),
    )
    count_stmt = select(func.count()).select_from(Project)
    member_projects = select(ProjectMember.project_id).where(
        ProjectMember.member_open_id == current.open_id,
        ProjectMember.left_at.is_(None),
    )
    visibility = [
        Project.owner_open_id == current.open_id,
        Project.project_id.in_(member_projects),
    ]
    if current.open_id in EQUAL_ACCESS_OPEN_IDS:
        visibility.append(Project.owner_open_id.in_(EQUAL_ACCESS_OPEN_IDS))
    if _is_department_privileged(current) and current.department:
        visibility.append(and_(Project.department == current.department, Project.project_type == "team"))
    if not _has_developer_project_view(current):
        stmt = stmt.where(or_(*visibility))
        count_stmt = count_stmt.where(or_(*visibility))
    if status:
        stmt = stmt.where(Project.status == status)
        count_stmt = count_stmt.where(Project.status == status)
    if department:
        stmt = stmt.where(Project.department == department)
        count_stmt = count_stmt.where(Project.department == department)
    if project_type:
        target_open_id = member_open_id or current.open_id
        active_member_projects = select(ProjectMember.project_id).where(
            ProjectMember.member_open_id == target_open_id,
            ProjectMember.left_at.is_(None),
        )
        cond = Project.project_id.in_(active_member_projects) if project_type == "personal" else Project.project_id.not_in(active_member_projects)
        stmt = stmt.where(cond)
        count_stmt = count_stmt.where(cond)
    if member_open_id:
        link = select(ProjectMember.project_id).where(ProjectMember.member_open_id == member_open_id)
        cond = or_(Project.owner_open_id == member_open_id, Project.project_id.in_(link))
        stmt = stmt.where(cond)
        count_stmt = count_stmt.where(cond)
    stmt = stmt.order_by(Project.updated_at.desc()).offset((page - 1) * page_size).limit(page_size)
    items = db.execute(stmt).scalars().all()
    total = db.execute(count_stmt).scalar_one()
    return PageResponse[ProjectRead](
        items=[_serialize(p, current) for p in items],
        total=total, page=page, page_size=page_size,
    )


@router.get("/lark/chats", response_model=LarkVisibleChatPage)
def list_visible_lark_chats(
    query: str | None = Query(None),
    page_size: int = Query(20, ge=1, le=100),
    page_token: str | None = Query(None),
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    try:
        data = search_visible_chats(
            member_open_id=current.open_id,
            query=(query or "").strip() or None,
            page_size=page_size,
            page_token=page_token,
        )
    except Exception as exc:
        raise HTTPException(502, f"读取飞书群聊失败: {exc}") from exc
    chats = data.get("chats") or []
    return LarkVisibleChatPage(
        chats=[LarkVisibleChatRead.model_validate(chat) for chat in chats],
        has_more=bool(data.get("has_more")),
        page_token=data.get("page_token"),
    )


@router.get("/lark/chats/{chat_id}/topics", response_model=LarkChatTopicPreviewPage)
def list_lark_chat_topics(
    chat_id: str,
    page_size: int = Query(50, ge=1, le=50),
    page_token: str | None = Query(None),
    _: Member = Depends(get_current_user),
):
    try:
        data = list_chat_topics_preview(chat_id, page_size=page_size, page_token=page_token)
        return LarkChatTopicPreviewPage(
            topics=[LarkChatTopicPreview.model_validate(topic) for topic in data.get("topics", [])],
            has_more=bool(data.get("has_more")),
            page_token=data.get("page_token"),
        )
    except Exception as exc:
        raise HTTPException(502, f"读取飞书话题失败: {exc}") from exc


@router.get("/{project_id}", response_model=ProjectRead)
def get_project(
    project_id: int,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    p = db.execute(
        select(Project).options(
            selectinload(Project.members),
            selectinload(Project.tasks),
            selectinload(Project.chats).selectinload(ProjectChat.topics),
            selectinload(Project.chats).selectinload(ProjectChat.messages),
        )
        .where(Project.project_id == project_id)
    ).scalar_one_or_none()
    if not p:
        raise HTTPException(404, "project not found")
    if not _can_view_project(p, current, db):
        raise HTTPException(403, "无权查看")
    return _serialize(p, current)


@router.get("/{project_id}/audit", response_model=list[ChangeLogRead])
def project_audit_logs(
    project_id: int,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    p = db.get(Project, project_id)
    if not p:
        raise HTTPException(404, "project not found")
    if not _can_view_project(p, current, db):
        raise HTTPException(403, "无权查看")
    rows = db.execute(
        select(AuditLog)
        .where(AuditLog.target_table == "projects", AuditLog.target_id == str(project_id))
        .order_by(AuditLog.created_at.desc())
        .limit(80)
    ).scalars().all()
    return [_audit_payload(row, db) for row in rows]


@router.get("/{project_id}/logs", response_model=list[ProjectLogRead])
def list_project_logs(
    project_id: int,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    p = db.get(Project, project_id)
    if not p:
        raise HTTPException(404, "project not found")
    if not _can_view_project(p, current, db):
        raise HTTPException(403, "无权查看")
    rows = db.execute(
        select(ProjectLog)
        .where(ProjectLog.project_id == project_id)
        .order_by(ProjectLog.created_at.desc(), ProjectLog.log_id.desc())
        .limit(200)
    ).scalars().all()
    return [_serialize_project_log(row, db) for row in rows]


@router.get("/{project_id}/relations", response_model=list[ProjectRelationRead])
def list_project_relations(
    project_id: int,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    p = db.get(Project, project_id)
    if not p:
        raise HTTPException(404, "project not found")
    if not _can_view_project(p, current, db):
        raise HTTPException(403, "无权查看")
    rows = db.execute(
        select(ProjectRelation)
        .where(or_(ProjectRelation.source_project_id == project_id, ProjectRelation.target_project_id == project_id))
        .order_by(ProjectRelation.created_at.desc(), ProjectRelation.relation_id.desc())
    ).scalars().all()
    related_ids = {
        row.target_project_id if row.source_project_id == project_id else row.source_project_id
        for row in rows
    }
    projects = {}
    if related_ids:
        related_rows = db.execute(select(Project).where(Project.project_id.in_(related_ids))).scalars().all()
        projects = {item.project_id: item for item in related_rows}
    result: list[ProjectRelationRead] = []
    for row in rows:
        related_project_id = row.target_project_id if row.source_project_id == project_id else row.source_project_id
        related = projects.get(related_project_id)
        if related and _can_view_project(related, current, db):
            result.append(_serialize_project_relation(row, project_id, related, db))
    return result


@router.post("/{project_id}/relations", response_model=ProjectRelationRead, status_code=201)
def create_project_relation(
    project_id: int,
    payload: ProjectRelationCreate,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    p = db.get(Project, project_id)
    target = db.get(Project, payload.target_project_id)
    if not p or not target:
        raise HTTPException(404, "project not found")
    if p.project_id == target.project_id:
        raise HTTPException(400, "不能关联项目自身")
    if not _can_manage_project(p, current):
        raise HTTPException(403, "仅项目负责人 / 管理员可关联项目")
    if not _can_view_project(target, current, db):
        raise HTTPException(403, "无权查看目标项目")

    exists = db.execute(
        select(ProjectRelation).where(
            ProjectRelation.source_project_id == p.project_id,
            ProjectRelation.target_project_id == target.project_id,
            ProjectRelation.relation_type == payload.relation_type,
        )
    ).scalar_one_or_none()
    if exists:
        raise HTTPException(409, "该项目关系已存在")

    row = ProjectRelation(
        source_project_id=p.project_id,
        target_project_id=target.project_id,
        relation_type=payload.relation_type,
        title=(payload.title or "").strip() or None,
        description=(payload.description or "").strip() or None,
        created_by=current.open_id,
    )
    db.add(row)
    db.flush()
    label = RELATION_TYPE_LABEL.get(payload.relation_type, payload.relation_type)
    body_lines = [f"关联项目: 《{target.name}》", f"关系类型: {label}"]
    if row.title:
        body_lines.append(f"关系说明: {row.title}")
    if row.description:
        body_lines.append(row.description)
    source_body = "\n".join(body_lines)
    target_body = "\n".join([f"来源项目: 《{p.name}》", f"关系类型: {label}"] + ([row.description] if row.description else []))
    db.add(ProjectLog(
        project_id=p.project_id,
        actor_open_id=current.open_id,
        kind="note",
        status="recorded",
        title=f"项目关系建立: {label}",
        body=source_body,
    ))
    db.add(ProjectLog(
        project_id=target.project_id,
        actor_open_id=current.open_id,
        kind="note",
        status="recorded",
        title=f"项目关系建立: 来源项目",
        body=target_body,
    ))
    db.add(AuditLog(
        actor_open_id=current.open_id,
        action="create",
        target_table="project_relations",
        target_id=str(row.relation_id),
        diff=json.dumps({
            "source_project_id": p.project_id,
            "target_project_id": target.project_id,
            "relation_type": payload.relation_type,
            "title": row.title,
        }, ensure_ascii=False),
    ))
    db.commit()
    db.refresh(row)
    return _serialize_project_relation(row, project_id, target, db)


@router.delete("/{project_id}/relations/{relation_id}", status_code=204)
def delete_project_relation(
    project_id: int,
    relation_id: int,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    p = db.get(Project, project_id)
    row = db.get(ProjectRelation, relation_id)
    if not p or not row or project_id not in (row.source_project_id, row.target_project_id):
        raise HTTPException(404, "project relation not found")
    source = db.get(Project, row.source_project_id)
    target = db.get(Project, row.target_project_id)
    manageable = (source and _can_manage_project(source, current)) or (target and _can_manage_project(target, current))
    if not manageable:
        raise HTTPException(403, "仅项目负责人 / 管理员可取消项目关联")
    label = RELATION_TYPE_LABEL.get(row.relation_type, row.relation_type)
    db.add(ProjectLog(
        project_id=project_id,
        actor_open_id=current.open_id,
        kind="note",
        status="recorded",
        title=f"项目关系取消: {label}",
        body=f"已取消关联: 《{(target.name if row.source_project_id == project_id and target else source.name if source else '')}》",
    ))
    db.delete(row)
    db.commit()


@router.post("/{project_id}/logs", response_model=ProjectLogRead, status_code=201)
def create_project_log(
    project_id: int,
    payload: ProjectLogCreate,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    p = db.get(Project, project_id)
    if not p:
        raise HTTPException(404, "project not found")
    if not _can_view_project(p, current, db):
        raise HTTPException(403, "无权查看")

    extra = _apply_paper_transition(db, payload, current)
    approver_open_id = _guidance_approver(db, payload.target_open_id) if payload.kind == "guidance" else None
    status_value = "recorded"
    if payload.kind in ("guidance", "server"):
        status_value = "pending_approval" if approver_open_id else "pending"
    elif payload.notify_now:
        status_value = "notified" if payload.kind == "notification" else status_value

    target_open_id = payload.target_open_id
    if payload.kind == "server" and not target_open_id:
        target_open_id = p.owner_open_id

    row = ProjectLog(
        project_id=project_id,
        actor_open_id=current.open_id,
        kind=payload.kind,
        status=status_value,
        title=_default_log_title(payload, p, db),
        body=payload.body,
        target_open_id=target_open_id,
        approver_open_id=approver_open_id,
        resource_type=payload.resource_type,
        old_value=payload.old_value,
        new_value=payload.new_value,
        paper_id=payload.paper_id,
        paper_stage=payload.paper_stage,
        paper_status=payload.paper_status,
        extra_json=json.dumps(extra, ensure_ascii=False) if extra else None,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    if payload.notify_now:
        recipient = row.approver_open_id or row.target_open_id
        if recipient:
            label = "项目日志"
            if row.status == "pending_approval":
                label = "项目申请待审批"
            elif row.kind == "guidance":
                label = "项目指导申请"
            elif row.kind == "server":
                label = "项目资源申请"
            if notify_project_log(
                recipient,
                project_name=p.name,
                title=row.title,
                body=row.body,
                actor_name=current.name,
                action_label=label,
                project_id=p.project_id,
                log_id=row.log_id,
            ):
                row.notified_at = datetime.utcnow()
                db.commit()
                db.refresh(row)
    return _serialize_project_log(row, db)


@router.post("/{project_id}/logs/{log_id}/notify", response_model=ProjectLogRead)
def notify_project_log_again(
    project_id: int,
    log_id: int,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    p = db.get(Project, project_id)
    row = db.get(ProjectLog, log_id)
    if not p or not row or row.project_id != project_id:
        raise HTTPException(404, "project log not found")
    if not _can_view_project(p, current, db):
        raise HTTPException(403, "无权查看")
    recipient = row.approver_open_id or row.target_open_id or p.owner_open_id
    if not recipient:
        raise HTTPException(409, "没有可通知对象")
    if notify_project_log(
        recipient,
        project_name=p.name,
        title=row.title,
        body=row.body,
        actor_name=current.name,
        action_label="项目日志提醒",
        project_id=p.project_id,
        log_id=row.log_id,
    ):
        row.notified_at = datetime.utcnow()
        if row.status == "recorded":
            row.status = "notified"
        db.commit()
        db.refresh(row)
    return _serialize_project_log(row, db)


@router.post("/{project_id}/logs/{log_id}/decision", response_model=ProjectLogRead)
def decide_project_log(
    project_id: int,
    log_id: int,
    payload: ProjectLogDecision,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    p = db.get(Project, project_id)
    row = db.get(ProjectLog, log_id)
    if not p or not row or row.project_id != project_id:
        raise HTTPException(404, "project log not found")
    if row.approver_open_id != current.open_id and not _can_manage_project(p, current):
        raise HTTPException(403, "无权审批")
    row.status = "approved" if payload.approved else "rejected"
    row.approved_at = datetime.utcnow()
    extra = {}
    if row.extra_json:
        try:
            extra = json.loads(row.extra_json)
        except Exception:
            extra = {}
    if payload.comment:
        extra["decision_comment"] = payload.comment
        row.extra_json = json.dumps(extra, ensure_ascii=False)
    db.commit()
    db.refresh(row)
    if payload.approved and row.target_open_id:
        notify_project_log(
            row.target_open_id,
            project_name=p.name,
            title=row.title,
            body=payload.comment or row.body,
            actor_name=current.name,
            action_label="项目申请已通过",
            project_id=p.project_id,
            log_id=row.log_id,
        )
    return _serialize_project_log(row, db)


def _project_fields_for_base(p: Project) -> dict:
    return {
        "name": p.name,
        "description": p.description or "",
        "status": p.status,
        "priority": p.priority,
        "owner_open_id": p.owner_open_id,
        "department": p.department or "",
        "start_date": p.start_date.isoformat() if p.start_date else None,
        "target_end_date": p.target_end_date.isoformat() if p.target_end_date else None,
        "actual_end_date": p.actual_end_date.isoformat() if p.actual_end_date else None,
        "tags": p.tags or "",
        "points_awarded": float(p.points_awarded or 0),
    }


@router.post("", response_model=ProjectRead, status_code=201)
async def create_project(
    payload: ProjectCreate,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    project_type = payload.project_type or ("team" if payload.members else "personal")
    if project_type == "personal" and payload.members:
        raise HTTPException(400, "个人项目只包含创建者本人；多人协作请改为团队项目")
    p = Project(
        name=payload.name, description=payload.description,
        status=payload.status, priority=payload.priority, project_type=project_type,
        publication_status="draft",
        owner_open_id=current.open_id, department=payload.department or current.department,
        start_date=payload.start_date or date.today(),
        target_end_date=payload.target_end_date, tags=payload.tags,
        points_awarded=payload.points_awarded, created_by=current.open_id,
    )
    db.add(p); db.flush()
    added_members: list[tuple[str, PMRole]] = []
    if project_type == "personal":
        db.add(ProjectMember(project_id=p.project_id, member_open_id=current.open_id, role="owner", share_ratio=0.0))
        added_members.append((current.open_id, "owner"))
    for m in payload.members:
        oid = m.get("member_open_id")
        if not oid or oid == current.open_id: continue
        db.add(ProjectMember(
            project_id=p.project_id, member_open_id=oid,
            role="member",
            share_ratio=float(m.get("share_ratio", 0.0)),
            tags=(m.get("tags") or None),
        ))
        added_members.append((oid, "member"))
    db.commit(); db.refresh(p)
    # Base 写穿透 (配置缺失时优雅跳过)
    new_rid = await mirror_to_base(
        getattr(settings, "lark_table_projects", ""),
        _project_fields_for_base(p),
        record_id=p.base_record_id,
    )
    if new_rid:
        p.base_record_id = new_rid
        db.commit()
    return _serialize(p, current)


@router.post("/{project_id}/publish", response_model=ProjectRead)
def publish_project(
    project_id: int,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    p = db.execute(
        select(Project).options(selectinload(Project.members), selectinload(Project.tasks))
        .where(Project.project_id == project_id)
    ).scalar_one_or_none()
    if not p:
        raise HTTPException(404, "not found")
    if not _can_manage_project(p, current):
        raise HTTPException(403, "仅 owner / admin / staff 可发布")
    already_published = p.publication_status == "published"
    p.publication_status = "published"
    draft_tasks = [task for task in p.tasks if getattr(task, "publication_status", "draft") != "published"]
    for task in draft_tasks:
        task.publication_status = "published"
    if not already_published:
        db.add(
            AuditLog(
                actor_open_id=current.open_id,
                action="update",
                target_table="projects",
                target_id=str(p.project_id),
                diff=json.dumps({"action": "publish", "publication_status": "published"}, ensure_ascii=False),
            )
        )
        db.add(
            ProjectLog(
                project_id=p.project_id,
                actor_open_id=current.open_id,
                kind="notification",
                status="recorded",
                title="项目发布",
                body="项目已确认发布，系统开始通知相关成员和任务负责人。",
            )
        )
    db.commit()
    db.refresh(p)
    if not already_published:
        for member in p.members:
            if member.left_at:
                continue
            notify_project_member_added(
                member_open_id=member.member_open_id,
                project_name=p.name,
                role=member.role,
                added_by_name=current.name,
                project_id=p.project_id,
            )
    for task in draft_tasks:
        if task.assignee_open_id:
            notify_task_assigned(
                assignee_open_id=task.assignee_open_id,
                task_title=task.title,
                due_date=task.due_date.strftime("%Y-%m-%d %H:%M") if task.due_date else None,
                project_name=p.name,
                creator_name=current.name,
                creator_open_id=current.open_id,
                task_id=task.task_id,
            )
    p = db.execute(
        select(Project).options(
            selectinload(Project.members),
            selectinload(Project.tasks),
            selectinload(Project.chats).selectinload(ProjectChat.topics),
            selectinload(Project.chats).selectinload(ProjectChat.messages),
        ).where(Project.project_id == project_id)
    ).scalar_one()
    return _serialize(p, current)


def _award_project_points(db: Session, p: Project, submitted_by: str | None) -> int:
    """项目完成时按成员 share_ratio 写 PointsLedger.
    注意: PointsLedger.source_type CHECK 约束含 'paper/competition/contribution/duty/adjust',
    用 'adjust' 类型并在 reason 标明 project. (SQLite 不能改 CHECK 约束)
    """
    if p.points_awarded <= 0:
        return 0
    # 清旧的
    db.query(PointsLedger).filter(
        PointsLedger.source_type == "adjust",
        PointsLedger.source_id == p.project_id,
        PointsLedger.reason.like(f"项目《{p.name[:30]}%"),
    ).delete(synchronize_session=False)
    members = db.query(ProjectMember).filter_by(project_id=p.project_id).filter(ProjectMember.left_at.is_(None)).all()
    if not members: return 0
    # 如果总 share_ratio 接近 1, 直接用; 否则均分
    total_share = sum(m.share_ratio for m in members)
    use_default = total_share < 0.999 or total_share > 1.001
    occ = p.actual_end_date.date() if p.actual_end_date else date.today()
    snap = {"project_id": p.project_id, "name": p.name, "points_awarded": p.points_awarded,
            "share_mode": "default_equal" if use_default else "manual"}
    n = 0
    for m in members:
        ratio = (1.0 / len(members)) if use_default else m.share_ratio
        final = p.points_awarded * ratio
        if final <= 0: continue
        db.add(PointsLedger(
            member_open_id=m.member_open_id, source_type="adjust",
            source_id=p.project_id, occurred_at=occ,
            base_points=p.points_awarded, share_ratio=ratio,
            decay_factor=1.0, cap_adjustment_factor=1.0, final_points=final,
            reason=f"项目《{p.name[:30]}》 完成奖励 ({m.role})",
            status="approved", calculation_rule_version=RULES_VERSION,
            source_snapshot_json=json.dumps(snap, ensure_ascii=False),
            submitted_by=submitted_by, submitted_at=datetime.utcnow(),
            approved_at=datetime.utcnow(),
            settlement_period=f"{occ.year}Q{(occ.month-1)//3+1}",
        ))
        n += 1
    return n


def _project_update_log_body(changes: dict[str, tuple[object, object]]) -> str:
    labels = {
        "name": "项目名称",
        "description": "项目描述",
        "status": "项目状态",
        "priority": "优先级",
        "project_type": "项目类型",
        "department": "所属部门",
        "start_date": "开始日期",
        "target_end_date": "目标截止日期",
        "actual_end_date": "实际完成日期",
        "archived_at": "归档时间",
        "tags": "标签",
        "points_awarded": "积分",
    }

    def fmt(value: object) -> str:
        if value is None or value == "":
            return "未设置"
        if isinstance(value, (datetime, date)):
            return value.strftime("%Y-%m-%d %H:%M") if isinstance(value, datetime) else value.isoformat()
        return str(value)

    return "\n".join(
        f"{labels.get(field, field)}: {fmt(before)} -> {fmt(after)}"
        for field, (before, after) in changes.items()
    )


@router.patch("/{project_id}", response_model=ProjectRead)
async def update_project(
    project_id: int,
    payload: ProjectUpdate,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    p = db.get(Project, project_id)
    if not p:
        raise HTTPException(404, "not found")
    if not _can_manage_project(p, current):
        raise HTTPException(403, "仅 owner / admin / staff 可编辑")
    old_status = p.status
    data = payload.model_dump(exclude_unset=True)
    tracked_changes: dict[str, tuple[object, object]] = {}
    if data.get("project_type") == "personal":
        has_members = db.execute(
            select(ProjectMember.project_id).where(
                ProjectMember.project_id == project_id,
                ProjectMember.member_open_id != p.owner_open_id,
                ProjectMember.left_at.is_(None),
            ).limit(1)
        ).first()
        if has_members:
            raise HTTPException(400, "已有参与者的项目不能切换为个人项目")
        if not db.get(ProjectMember, (project_id, p.owner_open_id)):
            db.add(ProjectMember(project_id=project_id, member_open_id=p.owner_open_id, role="owner", share_ratio=0.0))
    for k, v in data.items():
        old_value = getattr(p, k)
        if old_value != v:
            tracked_changes[k] = (old_value, v)
        setattr(p, k, v)
    if payload.status == "completed" and old_status != "completed":
        if not p.actual_end_date:
            p.actual_end_date = datetime.utcnow()
        _award_project_points(db, p, current.open_id)
    if payload.status == "archived" and not p.archived_at:
        tracked_changes.setdefault("archived_at", (None, datetime.utcnow()))
        p.archived_at = datetime.utcnow()
    if tracked_changes:
        db.add(
            ProjectLog(
                project_id=p.project_id,
                actor_open_id=current.open_id,
                kind="note",
                status="recorded",
                title="项目调整记录",
                body=_project_update_log_body(tracked_changes),
            )
        )
    db.commit()
    db.refresh(p)
    new_rid = await mirror_to_base(
        getattr(settings, "lark_table_projects", ""),
        _project_fields_for_base(p),
        record_id=p.base_record_id,
    )
    if new_rid and new_rid != p.base_record_id:
        p.base_record_id = new_rid
        db.commit()
    p = db.execute(
        select(Project).options(
            selectinload(Project.members),
            selectinload(Project.tasks),
            selectinload(Project.chats).selectinload(ProjectChat.topics),
            selectinload(Project.chats).selectinload(ProjectChat.messages),
        )
        .where(Project.project_id == project_id)
    ).scalar_one()
    return _serialize(p, current)


@router.delete("/{project_id}", status_code=204)
async def delete_project(
    project_id: int,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    p = db.get(Project, project_id)
    if not p:
        raise HTTPException(404, "not found")
    if not _can_manage_project(p, current):
        raise HTTPException(403, "仅项目负责人 / 同部门管理员可删除")
    base_rid = p.base_record_id
    db.query(PointsLedger).filter(
        PointsLedger.source_type == "adjust", PointsLedger.source_id == project_id,
    ).delete(synchronize_session=False)
    db.delete(p); db.commit()
    await delete_from_base(getattr(settings, "lark_table_projects", ""), base_rid)


# ============ 成员管理 ============

class MemberPayload(BaseModel):
    member_open_id: str
    role: PMRole = "member"
    share_ratio: float = 0.0
    tags: str | None = None


class ProjectChatPayload(BaseModel):
    chat_id: str
    chat_name: str | None = None
    description: str | None = None
    selected_topic_key: str | None = None
    selected_topic_title: str | None = None
    sync_enabled: bool = True


class ProjectChatUpdate(BaseModel):
    chat_name: str | None = None
    description: str | None = None
    selected_topic_key: str | None = None
    selected_topic_title: str | None = None
    sync_enabled: bool | None = None


class ProjectChatSyncPayload(BaseModel):
    page_size: int = 50
    max_pages: int = 2
    start: str | None = None
    end: str | None = None


@router.post("/{project_id}/members", response_model=ProjectMemberRead, status_code=201)
def add_member(
    project_id: int,
    payload: MemberPayload,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    p = db.get(Project, project_id)
    if not p: raise HTTPException(404, "project not found")
    if not _can_manage_project(p, current):
        raise HTTPException(403, "仅 owner 可加成员")
    if p.project_type == "personal":
        p.project_type = "team"
    exists = db.get(ProjectMember, (project_id, payload.member_open_id))
    if exists: raise HTTPException(409, "已是成员")
    pm = ProjectMember(project_id=project_id, member_open_id=payload.member_open_id,
                       role="member", share_ratio=payload.share_ratio, tags=payload.tags)
    db.add(pm); db.commit(); db.refresh(pm)
    notify_project_member_added(
        member_open_id=payload.member_open_id, project_name=p.name,
        role="member", added_by_name=current.name,
        project_id=p.project_id,
    )
    return ProjectMemberRead.model_validate(pm)


@router.post("/{project_id}/members/receipt", response_model=ProjectMemberRead)
def receive_project_member(
    project_id: int,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    pm = db.get(ProjectMember, (project_id, current.open_id))
    if not pm or pm.left_at:
        raise HTTPException(404, "project member not found")
    if not pm.received_at:
        pm.received_at = datetime.utcnow()
        db.commit()
        db.refresh(pm)
    return ProjectMemberRead.model_validate(pm)


@router.post("/{project_id}/members/{member_open_id}/notify", response_model=ProjectMemberRead)
def notify_project_member_again(
    project_id: int,
    member_open_id: str,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    p = db.get(Project, project_id)
    if not p:
        raise HTTPException(404, "project not found")
    if not _can_manage_project(p, current):
        raise HTTPException(403, "仅项目负责人 / 同部门管理员可提醒")
    pm = db.get(ProjectMember, (project_id, member_open_id))
    if not pm or pm.left_at:
        raise HTTPException(404, "project member not found")
    notify_project_member_added(
        member_open_id=pm.member_open_id,
        project_name=p.name,
        role=pm.role,
        added_by_name=current.name,
        project_id=p.project_id,
    )
    return ProjectMemberRead.model_validate(pm)


@router.patch("/{project_id}/members/{member_open_id}", response_model=ProjectMemberRead)
def update_member(
    project_id: int,
    member_open_id: str,
    payload: MemberPayload,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    p = db.get(Project, project_id)
    if not p:
        raise HTTPException(404, "project not found")
    if not _can_manage_project(p, current):
        raise HTTPException(403, "仅项目负责人 / 同部门管理员可编辑成员")
    pm = db.get(ProjectMember, (project_id, member_open_id))
    if not pm or pm.left_at:
        raise HTTPException(404, "project member not found")
    pm.role = payload.role
    pm.share_ratio = payload.share_ratio
    pm.tags = payload.tags
    db.commit()
    db.refresh(pm)
    return ProjectMemberRead.model_validate(pm)


@router.delete("/{project_id}/members/{member_open_id}", status_code=204)
def remove_member(
    project_id: int, member_open_id: str,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    p = db.get(Project, project_id)
    if not p: raise HTTPException(404, "project not found")
    if not _can_manage_project(p, current):
        raise HTTPException(403)
    pm = db.get(ProjectMember, (project_id, member_open_id))
    if not pm: raise HTTPException(404, "member not found")
    pm.left_at = date.today()
    db.commit()


# ============ 飞书群聊关联与同步 ============

def _get_project_for_chat_action(db: Session, project_id: int, current: Member) -> Project:
    p = db.get(Project, project_id)
    if not p:
        raise HTTPException(404, "project not found")
    if not _can_manage_project(p, current):
        raise HTTPException(403, "仅项目负责人 / admin / staff 可管理关联群聊")
    return p


@router.get("/{project_id}/chats", response_model=list[ProjectChatRead])
def list_project_chats(
    project_id: int,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    p = db.get(Project, project_id)
    if not p:
        raise HTTPException(404, "project not found")
    if not _can_view_project(p, current, db):
        raise HTTPException(403, "无权查看")
    chats = (
        db.query(ProjectChat)
        .options(selectinload(ProjectChat.topics), selectinload(ProjectChat.messages))
        .filter(ProjectChat.project_id == project_id)
        .order_by(ProjectChat.updated_at.desc())
        .all()
    )
    return [_serialize_chat(chat) for chat in chats]


@router.post("/{project_id}/chats", response_model=ProjectChatRead, status_code=201)
def add_project_chat(
    project_id: int,
    payload: ProjectChatPayload,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    _get_project_for_chat_action(db, project_id, current)
    chat_id = payload.chat_id.strip()
    if not chat_id:
        raise HTTPException(400, "chat_id is required")
    selected_topic_key = (payload.selected_topic_key or "").strip()
    if not selected_topic_key:
        raise HTTPException(400, "请选择群聊里的话题")
    if not selected_topic_key.startswith("omt_"):
        raise HTTPException(400, "请选择话题 ID，而不是普通消息 ID")
    exists = db.query(ProjectChat).filter_by(project_id=project_id, chat_id=chat_id).first()
    if exists and (exists.selected_topic_key or "") == selected_topic_key:
        raise HTTPException(409, "该话题已关联到项目")
    chat = ProjectChat(
        project_id=project_id,
        chat_id=chat_id,
        chat_name=(payload.chat_name or "").strip() or None,
        description=(payload.description or "").strip() or None,
        selected_topic_key=selected_topic_key,
        selected_topic_title=(payload.selected_topic_title or "").strip() or None,
        sync_enabled=payload.sync_enabled,
        created_by=current.open_id,
    )
    db.add(chat)
    db.commit()
    db.refresh(chat)
    return _serialize_chat(chat)


@router.patch("/{project_id}/chats/{project_chat_id}", response_model=ProjectChatRead)
def update_project_chat(
    project_id: int,
    project_chat_id: int,
    payload: ProjectChatUpdate,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    _get_project_for_chat_action(db, project_id, current)
    chat = db.get(ProjectChat, project_chat_id)
    if not chat or chat.project_id != project_id:
        raise HTTPException(404, "project chat not found")
    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        if isinstance(value, str):
            value = value.strip() or None
        setattr(chat, key, value)
    db.commit()
    db.refresh(chat)
    return _serialize_chat(chat)


@router.delete("/{project_id}/chats/{project_chat_id}", status_code=204)
def delete_project_chat(
    project_id: int,
    project_chat_id: int,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    _get_project_for_chat_action(db, project_id, current)
    chat = db.get(ProjectChat, project_chat_id)
    if not chat or chat.project_id != project_id:
        raise HTTPException(404, "project chat not found")
    db.delete(chat)
    db.commit()


@router.post("/{project_id}/chats/{project_chat_id}/sync")
def sync_project_chat_endpoint(
    project_id: int,
    project_chat_id: int,
    payload: ProjectChatSyncPayload | None = None,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    _get_project_for_chat_action(db, project_id, current)
    chat = db.get(ProjectChat, project_chat_id)
    if not chat or chat.project_id != project_id:
        raise HTTPException(404, "project chat not found")
    if not chat.sync_enabled:
        raise HTTPException(409, "该群聊已关闭同步")
    payload = payload or ProjectChatSyncPayload()
    try:
        return sync_project_chat(
            db,
            chat,
            page_size=max(1, min(payload.page_size, 50)),
            max_pages=max(1, min(payload.max_pages, 20)),
            start=payload.start,
            end=payload.end,
        )
    except Exception as exc:
        raise HTTPException(502, f"同步飞书群聊失败: {exc}") from exc


@router.get("/{project_id}/chats/{project_chat_id}/topics", response_model=list[ProjectChatTopicRead])
def list_project_chat_topics(
    project_id: int,
    project_chat_id: int,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    p = db.get(Project, project_id)
    if not p:
        raise HTTPException(404, "project not found")
    if not _can_view_project(p, current, db):
        raise HTTPException(403, "无权查看")
    return (
        db.query(ProjectChatTopic)
        .filter(ProjectChatTopic.project_id == project_id, ProjectChatTopic.project_chat_id == project_chat_id)
        .order_by(ProjectChatTopic.last_reply_at.desc())
        .limit(200)
        .all()
    )


@router.get("/{project_id}/chats/{project_chat_id}/messages", response_model=PageResponse[ProjectChatMessageRead])
def list_project_chat_messages(
    project_id: int,
    project_chat_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    topic_key: str | None = Query(None),
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    p = db.get(Project, project_id)
    if not p:
        raise HTTPException(404, "project not found")
    if not _can_view_project(p, current, db):
        raise HTTPException(403, "无权查看")
    stmt = db.query(ProjectChatMessage).filter(
        ProjectChatMessage.project_id == project_id,
        ProjectChatMessage.project_chat_id == project_chat_id,
    )
    if topic_key:
        stmt = stmt.filter(ProjectChatMessage.topic_key == topic_key)
    total = stmt.count()
    items = (
        stmt.order_by(ProjectChatMessage.message_created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return PageResponse[ProjectChatMessageRead](items=items, total=total, page=page, page_size=page_size)
