"""任务路由: Task CRUD + 今日待办视图."""
from __future__ import annotations
from datetime import date, datetime, timedelta
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.deps import get_current_user
from app.models import Member, Project, Task
from app.schemas.common import PageResponse
from app.services.lark_im import notify_task_assigned
from app.services.base_writer import mirror_to_base, delete_from_base


def _task_fields_for_base(t: Task) -> dict:
    return {
        "project_id": t.project_id,
        "title": t.title,
        "description": t.description or "",
        "status": t.status,
        "priority": t.priority,
        "assignee_open_id": t.assignee_open_id or "",
        "planned_start_date": t.planned_start_date.isoformat() if t.planned_start_date else None,
        "due_date": t.due_date.isoformat() if t.due_date else None,
    }

router = APIRouter(prefix="/api/tasks", tags=["tasks"])

TStatus = Literal["todo", "in_progress", "done", "blocked", "cancelled"]
TPriority = Literal["low", "medium", "high", "urgent"]


class TaskRead(BaseModel):
    task_id: int
    project_id: int | None
    parent_task_id: int | None
    title: str
    description: str | None
    status: TStatus
    priority: TPriority
    assignee_open_id: str | None
    planned_start_date: date | None
    due_date: date | None
    completed_at: datetime | None
    created_by: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TaskCreate(BaseModel):
    title: str
    description: str | None = None
    project_id: int | None = None
    parent_task_id: int | None = None
    status: TStatus = "todo"
    priority: TPriority = "medium"
    assignee_open_id: str | None = None
    planned_start_date: date | None = None
    due_date: date | None = None


class TaskUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    status: TStatus | None = None
    priority: TPriority | None = None
    assignee_open_id: str | None = None
    planned_start_date: date | None = None
    due_date: date | None = None


@router.get("", response_model=PageResponse[TaskRead])
def list_tasks(
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=500),
    project_id: int | None = Query(None),
    assignee_open_id: str | None = Query(None),
    status: TStatus | None = Query(None),
    db: Session = Depends(get_db),
    _: Member = Depends(get_current_user),
):
    stmt = select(Task)
    count_stmt = select(func.count()).select_from(Task)
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
        items=[TaskRead.model_validate(t) for t in items],
        total=total, page=page, page_size=page_size,
    )


@router.get("/today", response_model=list[TaskRead])
def today_tasks(
    days_ahead: int = Query(3, ge=0, le=14, description="包含未来 N 天到期的任务"),
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    """今日待办: 分配给我的, 未完成的, 已到期或即将到期 (默认 3 天内)."""
    cutoff = date.today() + timedelta(days=days_ahead)
    stmt = (
        select(Task)
        .where(Task.assignee_open_id == current.open_id)
        .where(Task.status.in_(["todo", "in_progress", "blocked"]))
        .where(or_(Task.due_date.is_(None), Task.due_date <= cutoff))
        .order_by(Task.priority.desc(), Task.due_date.asc().nullslast(), Task.task_id.desc())
        .limit(50)
    )
    items = db.execute(stmt).scalars().all()
    return [TaskRead.model_validate(t) for t in items]


@router.post("", response_model=TaskRead, status_code=201)
async def create_task(
    payload: TaskCreate,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    t = Task(**payload.model_dump(), created_by=current.open_id)
    if t.assignee_open_id is None:
        t.assignee_open_id = current.open_id
    db.add(t); db.commit(); db.refresh(t)
    new_rid = await mirror_to_base(
        getattr(settings, "lark_table_tasks", ""),
        _task_fields_for_base(t),
        record_id=t.base_record_id,
    )
    if new_rid:
        t.base_record_id = new_rid
        db.commit()
    if t.assignee_open_id and t.assignee_open_id != current.open_id:
        proj_name = None
        if t.project_id:
            p = db.get(Project, t.project_id)
            proj_name = p.name if p else None
        notify_task_assigned(
            assignee_open_id=t.assignee_open_id, task_title=t.title,
            due_date=str(t.due_date) if t.due_date else None,
            project_name=proj_name, creator_name=current.name,
        )
    return TaskRead.model_validate(t)


@router.patch("/{task_id}", response_model=TaskRead)
async def update_task(
    task_id: int,
    payload: TaskUpdate,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    t = db.get(Task, task_id)
    if not t: raise HTTPException(404, "not found")
    if t.assignee_open_id != current.open_id and t.created_by != current.open_id \
            and current.role not in ("admin", "staff"):
        raise HTTPException(403, "无权编辑")
    old_status = t.status
    old_assignee = t.assignee_open_id
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(t, k, v)
    if payload.status == "done" and old_status != "done":
        t.completed_at = datetime.utcnow()
    db.commit(); db.refresh(t)
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
            and t.assignee_open_id and t.assignee_open_id != current.open_id):
        proj_name = None
        if t.project_id:
            p = db.get(Project, t.project_id)
            proj_name = p.name if p else None
        notify_task_assigned(
            assignee_open_id=t.assignee_open_id, task_title=t.title,
            due_date=str(t.due_date) if t.due_date else None,
            project_name=proj_name, creator_name=current.name,
        )
    return TaskRead.model_validate(t)


@router.delete("/{task_id}", status_code=204)
async def delete_task(
    task_id: int,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    t = db.get(Task, task_id)
    if not t: raise HTTPException(404)
    if t.created_by != current.open_id and t.assignee_open_id != current.open_id \
            and current.role != "admin":
        raise HTTPException(403)
    base_rid = t.base_record_id
    db.delete(t); db.commit()
    await delete_from_base(getattr(settings, "lark_table_tasks", ""), base_rid)
