"""任务路由: Task CRUD + 今日待办视图."""
from __future__ import annotations
import json
from datetime import date, datetime, time, timedelta
from typing import Literal
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel, field_validator
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.deps import get_current_user
from app.models import AuditLog, Member, Project, ProjectLog, ProjectMember, SystemFeedback, Task, TaskFeedback
from starlette.concurrency import run_in_threadpool

from app.services.lark_task import create_lark_task, delete_lark_task, set_lark_task_completed
from app.permissions import (
    business_unit_text_variants,
    member_business_unit_scopes,
    member_can_manage_project_scope,
    member_department_scopes,
    member_is_super_admin_for_db,
)
from app.schemas.common import PageResponse
from app.services.lark_im import notify_focus_heartbeat, notify_task_assigned, notify_task_completed
from app.services.base_writer import mirror_to_base, delete_from_base


def _task_fields_for_base(t: Task) -> dict:
    return {
        "project_id": t.project_id,
        "title": t.title,
        "description": t.description or "",
        "status": t.status,
        "publication_status": getattr(t, "publication_status", "draft"),
        "priority": t.priority,
        "assignee_open_id": t.assignee_open_id or "",
        "planned_start_date": t.planned_start_date.isoformat() if t.planned_start_date else None,
        "due_date": t.due_date.isoformat() if t.due_date else None,
        "today_todo_date": t.today_todo_date.isoformat() if getattr(t, "today_todo_date", None) else None,
        "thinking": getattr(t, "thinking", None) or "",
        "progress_draft": getattr(t, "progress_draft", None) or "",
        "task_origin": getattr(t, "task_origin", "manual"),
        "received_at": t.received_at.isoformat() if t.received_at else None,
    }


def _format_deadline(value: datetime | None) -> str | None:
    return value.strftime("%Y-%m-%d %H:%M") if value else None


def _create_task_completed_project_log(db: Session, task: Task, actor: Member, project: Project | None) -> None:
    if not task.project_id or not project:
        return
    assignee = db.get(Member, task.assignee_open_id) if task.assignee_open_id else None
    body_lines = [
        f"任务「{task.title}」已完成。",
        f"完成人: {actor.name or actor.open_id}",
    ]
    if assignee and assignee.open_id != actor.open_id:
        body_lines.append(f"任务负责人: {assignee.name or assignee.open_id}")
    if task.due_date:
        body_lines.append(f"原截止时间: {_format_deadline(task.due_date)}")
    if task.description:
        body_lines.append(f"任务说明: {task.description}")
    db.add(
        ProjectLog(
            project_id=project.project_id,
            actor_open_id=actor.open_id,
            kind="note",
            status="recorded",
            title=f"任务完成: {task.title}",
            body="\n".join(body_lines),
        )
    )

router = APIRouter(prefix="/api/tasks", tags=["tasks"])

TStatus = Literal["todo", "in_progress", "done", "blocked", "cancelled"]
TPriority = Literal["low", "medium", "high", "urgent"]


def _coerce_datetime(value):
    if value is None or isinstance(value, datetime):
        return value
    if isinstance(value, date):
        return datetime.combine(value, datetime.min.time())
    if isinstance(value, str) and len(value) == 10:
        return datetime.fromisoformat(f"{value}T00:00:00")
    return value


class TaskRead(BaseModel):
    helper_open_ids: str | None = None
    mentor_open_ids: str | None = None
    lark_task_guid: str | None = None
    task_id: int
    project_id: int | None
    project_name: str | None = None
    project_tags: str | None = None
    parent_task_id: int | None
    title: str
    description: str | None
    status: TStatus
    publication_status: Literal["draft", "published"] = "draft"
    priority: TPriority
    assignee_open_id: str | None
    planned_start_date: datetime | None
    due_date: datetime | None
    today_todo_date: date | None = None
    thinking: str | None = None
    progress_draft: str | None = None
    task_origin: str = "manual"
    received_at: datetime | None
    completed_at: datetime | None
    created_by: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


def _serialize_task(t: Task, db: Session) -> TaskRead:
    item = TaskRead.model_validate(t)
    if t.project_id:
        project = db.get(Project, t.project_id)
        if project:
            item.project_name = project.name
            item.project_tags = project.tags
    return item


def _serialize_tasks(tasks: list[Task], db: Session) -> list[TaskRead]:
    project_ids = {t.project_id for t in tasks if t.project_id is not None}
    projects: dict[int, Project] = {}
    if project_ids:
        rows = db.execute(select(Project).where(Project.project_id.in_(project_ids))).scalars().all()
        projects = {p.project_id: p for p in rows}
    result: list[TaskRead] = []
    for task in tasks:
        item = TaskRead.model_validate(task)
        if task.project_id and (project := projects.get(task.project_id)):
            item.project_name = project.name
            item.project_tags = project.tags
        result.append(item)
    return result


class ChangeLogRead(BaseModel):
    log_id: int
    actor_open_id: str
    actor_name: str | None = None
    action: str
    target_table: str
    target_id: str
    changes: dict
    created_at: datetime


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


def _can_view_task(task: Task, current: Member, db: Session) -> bool:
    if member_is_super_admin_for_db(db, current):
        return True
    if task.created_by == current.open_id or task.assignee_open_id == current.open_id:
        return True
    if task.project_id:
        project = db.get(Project, task.project_id)
        if project and project.owner_open_id == current.open_id:
            return True
        if project and member_can_manage_project_scope(db, current, project):
            return True
        if (
            project
            and project.project_type == "team"
            and current.role in ("admin", "staff")
            and current.department
            and project.department == current.department
        ):
            return True
        membership = db.get(ProjectMember, (task.project_id, current.open_id))
        if membership is not None and membership.left_at is None:
            return True
        return False
    if current.role in ("admin", "staff") and current.department:
        assignee = db.get(Member, task.assignee_open_id) if task.assignee_open_id else None
        creator = db.get(Member, task.created_by) if task.created_by else None
        return bool(
            (assignee and assignee.department == current.department)
            or (creator and creator.department == current.department)
        )
    return False


def _is_project_owner_of_task(task: Task, current: Member, db: Session) -> bool:
    if not task.project_id:
        return False
    project = db.get(Project, task.project_id)
    return bool(project and project.owner_open_id == current.open_id)


def _can_edit_task(task: Task, current: Member, db: Session) -> bool:
    return (
        member_is_super_admin_for_db(db, current)
        or task.assignee_open_id == current.open_id
        or task.created_by == current.open_id
        or _is_project_owner_of_task(task, current, db)
        or (
            task.project_id
            and (scoped_project := db.get(Project, task.project_id))
            and member_can_manage_project_scope(db, current, scoped_project)
        )
        or (current.role in ("admin", "staff") and (
            (
                task.project_id
                and (project := db.get(Project, task.project_id))
                and project.project_type == "team"
                and project.department == current.department
            )
            or (task.assignee_open_id and (assignee := db.get(Member, task.assignee_open_id)) and assignee.department == current.department)
        ))
    )


def _visible_task_condition(current: Member, db: Session):
    if member_is_super_admin_for_db(db, current):
        return True
    member_projects = select(ProjectMember.project_id).where(
        ProjectMember.member_open_id == current.open_id,
        ProjectMember.left_at.is_(None),
    )
    conditions = [
        Task.created_by == current.open_id,
        Task.assignee_open_id == current.open_id,
        Task.project_id.in_(member_projects),
    ]
    if current.role in ("admin", "staff") and current.department:
        same_dept_members = select(Member.open_id).where(Member.department == current.department)
        same_dept_projects = select(Project.project_id).where(
            Project.department == current.department,
            Project.project_type == "team",
        )
        conditions.extend([
            Task.project_id.in_(same_dept_projects),
            and_(Task.project_id.is_(None), Task.created_by.in_(same_dept_members)),
            and_(Task.project_id.is_(None), Task.assignee_open_id.in_(same_dept_members)),
        ])
    scoped_departments = member_department_scopes(db, current)
    scoped_bu_departments = business_unit_text_variants(member_business_unit_scopes(db, current))
    scoped_member_departments = set(scoped_departments) | scoped_bu_departments
    if scoped_member_departments:
        scoped_members = select(Member.open_id).where(Member.department.in_(scoped_member_departments))
        scoped_projects = select(Project.project_id).where(Project.department.in_(scoped_member_departments))
        conditions.extend([
            Task.project_id.in_(scoped_projects),
            and_(Task.project_id.is_(None), Task.created_by.in_(scoped_members)),
            and_(Task.project_id.is_(None), Task.assignee_open_id.in_(scoped_members)),
        ])
    return or_(*conditions)


def _can_assign_task_to(member_open_id: str | None, current: Member, db: Session, project_id: int | None = None) -> bool:
    if not member_open_id or member_open_id == current.open_id:
        return True
    if member_is_super_admin_for_db(db, current):
        return True
    scoped_departments = member_department_scopes(db, current) | business_unit_text_variants(member_business_unit_scopes(db, current))
    member = db.get(Member, member_open_id)
    if not member:
        raise HTTPException(400, "assignee not found")
    if project_id is not None:
        project = db.get(Project, project_id)
        if not project:
            raise HTTPException(400, "project not found")
        target_membership = db.get(ProjectMember, (project_id, member_open_id))
        target_in_project = project.owner_open_id == member_open_id or (target_membership is not None and target_membership.left_at is None)
        current_membership = db.get(ProjectMember, (project_id, current.open_id))
        current_can_manage_project = (
            project.owner_open_id == current.open_id
            or member_can_manage_project_scope(db, current, project)
            or (current_membership is not None and current_membership.left_at is None)
            or (
                project.project_type == "team"
                and current.role in ("admin", "staff")
                and current.department
                and project.department == current.department
            )
        )
        if target_in_project and current_can_manage_project:
            return True
    if member.department in scoped_departments:
        return True
    if current.role in ("admin", "staff") and current.department and member.department == current.department:
        return True
    return False


def _can_create_task_in_project(project_id: int | None, current: Member, db: Session) -> bool:
    if project_id is None:
        return True
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(400, "project not found")
    if member_is_super_admin_for_db(db, current):
        return True
    if member_can_manage_project_scope(db, current, project):
        return True
    if project.owner_open_id == current.open_id:
        return True
    if (
        project.project_type == "team"
        and current.role in ("admin", "staff")
        and current.department
        and project.department == current.department
    ):
        return True
    membership = db.get(ProjectMember, (project_id, current.open_id))
    return membership is not None and membership.left_at is None


class TaskCreate(BaseModel):
    helper_open_ids: str | None = None
    mentor_open_ids: str | None = None
    title: str
    description: str | None = None
    project_id: int | None = None
    parent_task_id: int | None = None
    status: TStatus = "todo"
    priority: TPriority = "medium"
    assignee_open_id: str | None = None
    planned_start_date: datetime | None = None
    due_date: datetime | None = None
    today_todo_date: date | None = None
    thinking: str | None = None
    progress_draft: str | None = None
    task_origin: str = "manual"

    @field_validator("planned_start_date", "due_date", mode="before")
    @classmethod
    def coerce_task_datetimes(cls, value):
        return _coerce_datetime(value)


class TaskUpdate(BaseModel):
    helper_open_ids: str | None = None
    mentor_open_ids: str | None = None
    title: str | None = None
    description: str | None = None
    project_id: int | None = None
    status: TStatus | None = None
    priority: TPriority | None = None
    assignee_open_id: str | None = None
    planned_start_date: datetime | None = None
    due_date: datetime | None = None
    today_todo_date: date | None = None
    thinking: str | None = None
    progress_draft: str | None = None
    task_origin: str | None = None

    @field_validator("planned_start_date", "due_date", mode="before")
    @classmethod
    def coerce_task_update_datetimes(cls, value):
        return _coerce_datetime(value)


class FocusLogPayload(BaseModel):
    elapsed_seconds: int = 0
    note: str | None = None
    screenshot_url: str | None = None


class FocusSummaryRead(BaseModel):
    task_id: int
    total_seconds: int = 0


class TodayTodoPayload(BaseModel):
    enabled: bool = True


class TodayThinkingPayload(BaseModel):
    text: str
    project_id: int | None = None
    assignee_open_id: str | None = None


def _write_task_audit(db: Session, current: Member, task: Task, action: str, changes: dict) -> None:
    db.add(
        AuditLog(
            actor_open_id=current.open_id,
            action="update",
            target_table="tasks",
            target_id=str(task.task_id),
            diff=json.dumps({"action": action, **changes}, ensure_ascii=False),
        )
    )


def _focus_total_seconds(db: Session, task_id: int) -> int:
    rows = db.execute(
        select(AuditLog)
        .where(AuditLog.target_table == "tasks", AuditLog.target_id == str(task_id))
        .order_by(AuditLog.created_at.asc())
    ).scalars().all()
    total = 0
    for row in rows:
        try:
            diff = json.loads(row.diff or "{}")
        except json.JSONDecodeError:
            continue
        action = diff.get("action")
        elapsed = int(diff.get("elapsed_seconds") or 0)
        if action == "focus_stop":
            total += max(0, elapsed)
    return total


def _write_focus_project_log(db: Session, current: Member, task: Task, title: str, body: str) -> None:
    if not task.project_id:
        return
    db.add(
        ProjectLog(
            project_id=task.project_id,
            actor_open_id=current.open_id,
            kind="note",
            status="recorded",
            title=title,
            body=body,
        )
    )


def _ensure_task_assignee_project_member(db: Session, task: Task) -> None:
    if not task.project_id or not task.assignee_open_id:
        return
    project = db.get(Project, task.project_id)
    if not project:
        return
    if project.project_type == "personal":
        project.project_type = "team"
    member = db.get(Member, task.assignee_open_id)
    if not member:
        return
    existing = db.get(ProjectMember, (task.project_id, task.assignee_open_id))
    if existing:
        if existing.left_at is not None:
            existing.left_at = None
        return
    db.add(ProjectMember(
        project_id=task.project_id,
        member_open_id=task.assignee_open_id,
        role="member",
        share_ratio=0.0,
        tags="任务执行人",
    ))



class TaskFeedbackPayload(BaseModel):
    content: str


class SystemFeedbackPayload(BaseModel):
    content: str
    page_url: str | None = None


class TaskFeedbackRead(BaseModel):
    feedback_id: int
    task_id: int
    project_id: int | None = None
    reporter_open_id: str
    reporter_name: str | None = None
    content: str
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class SystemFeedbackRead(BaseModel):
    feedback_id: int
    reporter_open_id: str
    reporter_name: str | None = None
    content: str
    page_url: str | None = None
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


def _serialize_task_feedback(row: TaskFeedback, db: Session) -> TaskFeedbackRead:
    item = TaskFeedbackRead.model_validate(row)
    reporter = db.get(Member, row.reporter_open_id)
    item.reporter_name = reporter.name if reporter else None
    return item


def _serialize_system_feedback(row: SystemFeedback, db: Session) -> SystemFeedbackRead:
    item = SystemFeedbackRead.model_validate(row)
    reporter = db.get(Member, row.reporter_open_id)
    item.reporter_name = reporter.name if reporter else None
    return item

@router.get("", response_model=PageResponse[TaskRead])
def list_tasks(
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=500),
    project_id: int | None = Query(None),
    assignee_open_id: str | None = Query(None),
    status: TStatus | None = Query(None),
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    stmt = select(Task)
    count_stmt = select(func.count()).select_from(Task)
    visibility = _visible_task_condition(current, db)
    stmt = stmt.where(visibility)
    count_stmt = count_stmt.where(visibility)
    if project_id is not None:
        stmt = stmt.where(Task.project_id == project_id)
        count_stmt = count_stmt.where(Task.project_id == project_id)
    if assignee_open_id:
        stmt = stmt.where(Task.assignee_open_id == assignee_open_id)
        count_stmt = count_stmt.where(Task.assignee_open_id == assignee_open_id)
    if status:
        stmt = stmt.where(Task.status == status)
        count_stmt = count_stmt.where(Task.status == status)
    stmt = stmt.order_by(Task.due_date.asc().nullslast(), Task.priority.desc(), Task.task_id.desc())\
        .offset((page - 1) * page_size).limit(page_size)
    items = db.execute(stmt).scalars().all()
    total = db.execute(count_stmt).scalar_one()
    return PageResponse[TaskRead](
        items=_serialize_tasks(list(items), db),
        total=total, page=page, page_size=page_size,
    )


@router.get("/today", response_model=list[TaskRead])
def today_tasks(
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    """今日待办: 显式加入今天的任务。第二天会自然清空，未完成任务仍保留在普通任务列表。"""
    stmt = (
        select(Task)
        .where(_visible_task_condition(current, db))
        .where(Task.today_todo_date == date.today())
        .where(Task.status.in_(["todo", "in_progress", "blocked"]))
        .order_by(Task.priority.desc(), Task.due_date.asc().nullslast(), Task.task_id.desc())
        .limit(200)
    )
    items = db.execute(stmt).scalars().all()
    return _serialize_tasks(list(items), db)


@router.post("/{task_id}/today", response_model=TaskRead)
def mark_today_todo(
    task_id: int,
    payload: TodayTodoPayload,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    t = db.get(Task, task_id)
    if not t:
        raise HTTPException(404, "not found")
    if not _can_view_task(t, current, db):
        raise HTTPException(403, "无权查看")
    if not _can_edit_task(t, current, db):
        raise HTTPException(403, "无权编辑")
    t.today_todo_date = date.today() if payload.enabled else None
    _write_task_audit(db, current, t, "today_todo", {"enabled": payload.enabled, "today_todo_date": t.today_todo_date.isoformat() if t.today_todo_date else None})
    db.commit(); db.refresh(t)
    return _serialize_task(t, db)


def _thinking_lines_to_titles(text: str) -> list[str]:
    cleaned = text.replace("；", "\n").replace("。", "\n").replace("、", "\n")
    rows = []
    for line in cleaned.splitlines():
        title = line.strip(" -\t0123456789.、")
        if len(title) >= 2:
            rows.append(title[:80])
    return rows[:8]


@router.post("/today/from-thinking", response_model=list[TaskRead], status_code=201)
async def create_today_tasks_from_thinking(
    payload: TodayThinkingPayload,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    text = payload.text.strip()
    if not text:
        raise HTTPException(400, "今日思路不能为空")
    assignee_open_id = payload.assignee_open_id or current.open_id
    if not _can_assign_task_to(assignee_open_id, current, db):
        raise HTTPException(403, "无权分配给该成员")
    if payload.project_id is not None and not _can_create_task_in_project(payload.project_id, current, db):
        raise HTTPException(403, "无权在该项目创建任务")
    titles = _thinking_lines_to_titles(text) or [text[:80]]
    today_start = datetime.combine(date.today(), time.min)
    today_end = datetime.combine(date.today(), time.max.replace(microsecond=0))
    created: list[Task] = []
    for title in titles:
        t = Task(
            title=title,
            description=f"由群聊今日思路识别生成。\n原始思路: {text}",
            project_id=payload.project_id,
            status="todo",
            priority="medium",
            assignee_open_id=assignee_open_id,
            planned_start_date=today_start,
            due_date=today_end,
            today_todo_date=date.today(),
            thinking=text,
            task_origin="chat_ai",
            created_by=current.open_id,
        )
        db.add(t)
        created.append(t)
    db.flush()
    for t in created:
        _ensure_task_assignee_project_member(db, t)
    db.commit()
    for t in created:
        db.refresh(t)
        new_rid = await mirror_to_base(
            getattr(settings, "lark_table_tasks", ""),
            _task_fields_for_base(t),
            record_id=t.base_record_id,
        )
        if new_rid:
            t.base_record_id = new_rid
    db.commit()
    return [_serialize_task(t, db) for t in created]


@router.get("/{task_id}", response_model=TaskRead)
def get_task(
    task_id: int,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    t = db.get(Task, task_id)
    if not t:
        raise HTTPException(404, "not found")
    if not _can_view_task(t, current, db):
        raise HTTPException(403, "无权查看")
    return _serialize_task(t, db)


@router.post("", response_model=TaskRead, status_code=201)
async def create_task(
    payload: TaskCreate,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    if not _can_create_task_in_project(payload.project_id, current, db):
        raise HTTPException(403, "无权在该项目创建任务")
    if not _can_assign_task_to(payload.assignee_open_id, current, db, payload.project_id):
        raise HTTPException(403, "无权分配给该成员")
    t = Task(**payload.model_dump(), created_by=current.open_id)
    if t.assignee_open_id is None:
        t.assignee_open_id = current.open_id
    db.add(t)
    db.flush()
    _ensure_task_assignee_project_member(db, t)
    db.commit(); db.refresh(t)
    guid = await run_in_threadpool(
        create_lark_task,
        t.title,
        getattr(t, "description", None),
        t.due_date,
        t.assignee_open_id,
    )
    if guid:
        t.lark_task_guid = guid
        db.commit()
    new_rid = await mirror_to_base(
        getattr(settings, "lark_table_tasks", ""),
        _task_fields_for_base(t),
        record_id=t.base_record_id,
    )
    if new_rid:
        t.base_record_id = new_rid
        db.commit()
    if t.assignee_open_id and t.publication_status == "published":
        proj_name = None
        if t.project_id:
            p = db.get(Project, t.project_id)
            proj_name = p.name if p else None
        notify_task_assigned(
            assignee_open_id=t.assignee_open_id, task_title=t.title,
            due_date=_format_deadline(t.due_date),
            project_name=proj_name, creator_name=current.name,
            creator_open_id=current.open_id,
            task_id=t.task_id,
        )
    return _serialize_task(t, db)


@router.patch("/{task_id}", response_model=TaskRead)
async def update_task(
    task_id: int,
    payload: TaskUpdate,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    t = db.get(Task, task_id)
    if not t: raise HTTPException(404, "not found")
    if not _can_view_task(t, current, db):
        raise HTTPException(403, "无权查看")
    can_edit = _can_edit_task(t, current, db)
    if not can_edit:
        raise HTTPException(403, "无权编辑")
    if "project_id" in payload.model_fields_set and payload.project_id != t.project_id:
        if not _can_create_task_in_project(payload.project_id, current, db):
            raise HTTPException(403, "无权移动到该项目")
    target_project_id = payload.project_id if "project_id" in payload.model_fields_set else t.project_id
    if payload.assignee_open_id is not None and not _can_assign_task_to(payload.assignee_open_id, current, db, target_project_id):
        raise HTTPException(403, "无权分配给该成员")
    old_status = t.status
    old_assignee = t.assignee_open_id
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(t, k, v)
    if payload.status == "done" and old_status != "done":
        t.completed_at = datetime.utcnow()
    elif payload.status is not None and payload.status != "done" and old_status == "done":
        t.completed_at = None
    _ensure_task_assignee_project_member(db, t)
    db.commit(); db.refresh(t)
    if t.lark_task_guid and payload.status is not None and (payload.status == "done") != (old_status == "done"):
        await run_in_threadpool(set_lark_task_completed, t.lark_task_guid, payload.status == "done")
    elif t.lark_task_guid is None and payload.assignee_open_id is not None and t.assignee_open_id:
        guid = await run_in_threadpool(create_lark_task, t.title, None, t.due_date, t.assignee_open_id)
        if guid:
            t.lark_task_guid = guid
            db.commit()
    new_rid = await mirror_to_base(
        getattr(settings, "lark_table_tasks", ""),
        _task_fields_for_base(t),
        record_id=t.base_record_id,
    )
    if new_rid and new_rid != t.base_record_id:
        t.base_record_id = new_rid
        db.commit()
    # 重新分派 → 通知新 assignee
    if (payload.assignee_open_id is not None and t.assignee_open_id != old_assignee
            and t.assignee_open_id and t.publication_status == "published"):
        proj_name = None
        if t.project_id:
            p = db.get(Project, t.project_id)
            proj_name = p.name if p else None
        notify_task_assigned(
            assignee_open_id=t.assignee_open_id, task_title=t.title,
            due_date=_format_deadline(t.due_date),
            project_name=proj_name, creator_name=current.name,
            creator_open_id=current.open_id,
            task_id=t.task_id,
        )
    if payload.status == "done" and old_status != "done":
        proj = db.get(Project, t.project_id) if t.project_id else None
        _create_task_completed_project_log(db, t, current, proj)
        db.commit()
        recipients = {t.created_by}
        if proj:
            recipients.add(proj.owner_open_id)
        recipients.discard(current.open_id)
        for open_id in recipients:
            if open_id:
                notify_task_completed(
                    recipient_open_id=open_id,
                    task_title=t.title,
                    completed_by_name=current.name,
                    project_name=proj.name if proj else None,
                    task_id=t.task_id,
                )
    return _serialize_task(t, db)


@router.get("/{task_id}/audit", response_model=list[ChangeLogRead])
def task_audit_logs(
    task_id: int,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    t = db.get(Task, task_id)
    if not t:
        raise HTTPException(404, "not found")
    if not _can_view_task(t, current, db):
        raise HTTPException(403, "无权查看")
    rows = db.execute(
        select(AuditLog)
        .where(AuditLog.target_table == "tasks", AuditLog.target_id == str(task_id))
        .order_by(AuditLog.created_at.desc())
        .limit(80)
    ).scalars().all()
    return [_audit_payload(row, db) for row in rows]


@router.get("/{task_id}/focus/summary", response_model=FocusSummaryRead)
def task_focus_summary(
    task_id: int,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    t = db.get(Task, task_id)
    if not t:
        raise HTTPException(404, "not found")
    if not _can_view_task(t, current, db):
        raise HTTPException(403, "无权查看")
    return FocusSummaryRead(task_id=task_id, total_seconds=_focus_total_seconds(db, task_id))


@router.post("/{task_id}/focus/start")
def start_task_focus(
    task_id: int,
    payload: FocusLogPayload | None = None,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    t = db.get(Task, task_id)
    if not t:
        raise HTTPException(404, "not found")
    if not _can_view_task(t, current, db):
        raise HTTPException(403, "无权查看")
    if t.assignee_open_id not in (None, current.open_id) and t.created_by != current.open_id and current.role not in ("admin", "staff"):
        raise HTTPException(403, "只能为自己的任务开始专注")
    note = (payload.note if payload else None) or ""
    _write_task_audit(db, current, t, "focus_start", {"note": note})
    _write_focus_project_log(db, current, t, f"开始专注: {t.title}", note or "开始专注计时。")
    db.commit()
    return {"ok": True}


@router.post("/{task_id}/focus/test-card")
def test_task_focus_card(
    task_id: int,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    if not member_is_super_admin_for_db(db, current):
        raise HTTPException(403, "仅开发者可发送测试卡片")
    t = db.get(Task, task_id)
    if not t:
        raise HTTPException(404, "not found")
    if not _can_view_task(t, current, db):
        raise HTTPException(403, "无权查看")
    notify_focus_heartbeat(current.open_id, t.title, max(40, round(_focus_total_seconds(db, task_id) / 60)), t.task_id)
    _write_task_audit(db, current, t, "focus_test_card", {"target_open_id": current.open_id})
    db.commit()
    return {"ok": True}


@router.post("/{task_id}/focus/heartbeat")
def heartbeat_task_focus(
    task_id: int,
    payload: FocusLogPayload,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    t = db.get(Task, task_id)
    if not t:
        raise HTTPException(404, "not found")
    if not _can_view_task(t, current, db):
        raise HTTPException(403, "无权查看")
    elapsed_minutes = max(1, round((payload.elapsed_seconds or 0) / 60))
    note = (payload.note or "").strip()
    notify_focus_heartbeat(current.open_id, t.title, elapsed_minutes, t.task_id)
    _write_task_audit(db, current, t, "focus_heartbeat", {
        "elapsed_seconds": payload.elapsed_seconds,
        "note": note,
        "screenshot_url": payload.screenshot_url,
    })
    body_lines = [f"已专注 {elapsed_minutes} 分钟。"]
    if note:
        body_lines.append(f"记录: {note}")
    if payload.screenshot_url:
        body_lines.append(f"截图: {payload.screenshot_url}")
    _write_focus_project_log(db, current, t, f"专注心跳: {t.title}", "\n".join(body_lines))
    db.commit()
    return {"ok": True}


@router.post("/{task_id}/focus/log")
def log_task_focus(
    task_id: int,
    payload: FocusLogPayload,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    t = db.get(Task, task_id)
    if not t:
        raise HTTPException(404, "not found")
    if not _can_view_task(t, current, db):
        raise HTTPException(403, "无权查看")
    elapsed_minutes = max(0, round((payload.elapsed_seconds or 0) / 60))
    note = (payload.note or "").strip()
    screenshot = (payload.screenshot_url or "").strip()
    if not note and not screenshot:
        raise HTTPException(400, "请填写文本记录或截图链接")
    _write_task_audit(db, current, t, "focus_log", {
        "elapsed_seconds": payload.elapsed_seconds,
        "note": note,
        "screenshot_url": screenshot,
    })
    body_lines = [f"累计专注 {elapsed_minutes} 分钟。"]
    if note:
        body_lines.append(f"记录: {note}")
    if screenshot:
        body_lines.append(f"截图: {screenshot}")
    _write_focus_project_log(db, current, t, f"专注记录: {t.title}", "\n".join(body_lines))
    db.commit()
    return {"ok": True}


@router.post("/{task_id}/focus/stop")
def stop_task_focus(
    task_id: int,
    payload: FocusLogPayload,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    t = db.get(Task, task_id)
    if not t:
        raise HTTPException(404, "not found")
    if not _can_view_task(t, current, db):
        raise HTTPException(403, "无权查看")
    elapsed_minutes = max(0, round((payload.elapsed_seconds or 0) / 60))
    note = (payload.note or "").strip()
    screenshot = (payload.screenshot_url or "").strip()
    _write_task_audit(db, current, t, "focus_stop", {
        "elapsed_seconds": payload.elapsed_seconds,
        "note": note,
        "screenshot_url": screenshot,
    })
    body_lines = [f"结束专注，累计 {elapsed_minutes} 分钟。"]
    if note:
        body_lines.append(f"记录: {note}")
    if screenshot:
        body_lines.append(f"截图: {screenshot}")
    _write_focus_project_log(db, current, t, f"结束专注: {t.title}", "\n".join(body_lines))
    db.commit()
    return {"ok": True}


@router.post("/{task_id}/publish", response_model=TaskRead)
def publish_task(
    task_id: int,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    t = db.get(Task, task_id)
    if not t:
        raise HTTPException(404, "not found")
    if not _can_view_task(t, current, db):
        raise HTTPException(403, "无权查看")
    can_publish = (
        member_is_super_admin_for_db(db, current)
        or t.created_by == current.open_id
        or (current.role in ("admin", "staff") and (
            (
                t.project_id
                and (project := db.get(Project, t.project_id))
                and project.project_type == "team"
                and project.department == current.department
            )
            or (t.assignee_open_id and (assignee := db.get(Member, t.assignee_open_id)) and assignee.department == current.department)
        ))
    )
    if not can_publish:
        raise HTTPException(403, "无权发布")
    already_published = t.publication_status == "published"
    t.publication_status = "published"
    if not already_published:
        _write_task_audit(db, current, t, "publish", {"publication_status": "published"})
    db.commit()
    db.refresh(t)
    if not already_published and t.assignee_open_id:
        proj_name = None
        if t.project_id:
            p = db.get(Project, t.project_id)
            proj_name = p.name if p else None
        notify_task_assigned(
            assignee_open_id=t.assignee_open_id,
            task_title=t.title,
            due_date=_format_deadline(t.due_date),
            project_name=proj_name,
            creator_name=current.name,
            creator_open_id=current.open_id,
            task_id=t.task_id,
        )
    return _serialize_task(t, db)


@router.post("/{task_id}/receipt", response_model=TaskRead)
async def receive_task(
    task_id: int,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    t = db.get(Task, task_id)
    if not t:
        raise HTTPException(404, "not found")
    if t.assignee_open_id != current.open_id and current.role not in ("admin", "staff"):
        raise HTTPException(403, "仅任务负责人可确认收到")
    if not t.received_at:
        t.received_at = datetime.utcnow()
    if t.status == "todo":
        t.status = "in_progress"
    if t.received_at or t.status == "in_progress":
        db.commit()
        db.refresh(t)
        new_rid = await mirror_to_base(
            getattr(settings, "lark_table_tasks", ""),
            _task_fields_for_base(t),
            record_id=t.base_record_id,
        )
        if new_rid and new_rid != t.base_record_id:
            t.base_record_id = new_rid
            db.commit()
    return _serialize_task(t, db)


@router.post("/{task_id}/notify", response_model=TaskRead)
def notify_task_again(
    task_id: int,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    t = db.get(Task, task_id)
    if not t:
        raise HTTPException(404, "not found")
    if not _can_view_task(t, current, db):
        raise HTTPException(403, "无权查看")
    can_notify = (
        member_is_super_admin_for_db(db, current)
        or t.created_by == current.open_id
        or t.assignee_open_id == current.open_id
        or (current.role in ("admin", "staff") and (
            (
                t.project_id
                and (project := db.get(Project, t.project_id))
                and project.project_type == "team"
                and project.department == current.department
            )
            or (t.assignee_open_id and (assignee := db.get(Member, t.assignee_open_id)) and assignee.department == current.department)
        ))
    )
    if not can_notify:
        raise HTTPException(403, "无权提醒")
    if not t.assignee_open_id:
        raise HTTPException(409, "任务未设置负责人")
    proj_name = None
    if t.project_id:
        p = db.get(Project, t.project_id)
        proj_name = p.name if p else None
    notify_task_assigned(
        assignee_open_id=t.assignee_open_id,
        task_title=t.title,
        due_date=_format_deadline(t.due_date),
        project_name=proj_name,
        creator_name=current.name,
        creator_open_id=current.open_id,
        task_id=t.task_id,
    )
    return _serialize_task(t, db)


@router.post("/feedback", response_model=SystemFeedbackRead, status_code=201)
def create_system_feedback(
    payload: SystemFeedbackPayload,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    content = payload.content.strip()
    if not content:
        raise HTTPException(400, "请填写反馈内容")
    row = SystemFeedback(
        reporter_open_id=current.open_id,
        content=content,
        page_url=(payload.page_url or "").strip() or None,
        status="open",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _serialize_system_feedback(row, db)


@router.post("/{task_id}/feedback", response_model=TaskFeedbackRead, status_code=201)
def create_task_feedback(
    task_id: int,
    payload: TaskFeedbackPayload,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    t = db.get(Task, task_id)
    if not t:
        raise HTTPException(404, "not found")
    if not _can_view_task(t, current, db):
        raise HTTPException(403, "无权查看")
    content = payload.content.strip()
    if not content:
        raise HTTPException(400, "请填写反馈内容")
    row = TaskFeedback(
        task_id=t.task_id,
        project_id=t.project_id,
        reporter_open_id=current.open_id,
        content=content,
        status="open",
    )
    db.add(row)
    _write_task_audit(db, current, t, "feedback_create", {"feedback": content})
    if t.project_id:
        _write_focus_project_log(db, current, t, f"任务反馈: {t.title}", f"反馈人: {current.name or current.open_id}\n问题: {content}")
    db.commit()
    db.refresh(row)
    return _serialize_task_feedback(row, db)


@router.delete("/{task_id}", status_code=204)
async def delete_task(
    task_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    t = db.get(Task, task_id)
    if not t: raise HTTPException(404)
    if not _can_view_task(t, current, db):
        raise HTTPException(403)
    if (
        not member_is_super_admin_for_db(db, current)
        and t.created_by != current.open_id
        and t.assignee_open_id != current.open_id
        and not _is_project_owner_of_task(t, current, db)
    ):
        can_delete_via_department = (
            current.role in ("admin", "staff")
            and t.project_id
            and (project := db.get(Project, t.project_id))
            and project.project_type == "team"
            and project.department == current.department
        )
        if not can_delete_via_department:
            raise HTTPException(403)
    base_rid = t.base_record_id
    lark_task_guid = t.lark_task_guid
    db.delete(t)
    db.commit()
    if lark_task_guid:
        background_tasks.add_task(run_in_threadpool, delete_lark_task, lark_task_guid)
    if base_rid:
        background_tasks.add_task(delete_from_base, getattr(settings, "lark_table_tasks", ""), base_rid)
