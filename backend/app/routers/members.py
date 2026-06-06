from __future__ import annotations

import logging
from collections import defaultdict
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.deps import get_current_user, require_admin
from app.models import Member, Project, Task
from app.schemas.common import PageResponse
from app.schemas.members import MemberCreate, MemberRead, MemberUpdate
from app.services.lark_people_sync import sync_people_from_lark
from app.services.sync import push_record_to_base

router = APIRouter(prefix="/api/members", tags=["members"])
log = logging.getLogger(__name__)

PRIVILEGED_ROLES = {"admin", "staff"}
SELF_EDIT_FORBIDDEN_FIELDS = {"base_record_id", "role", "department", "position", "status"}
PRIVATE_FIELDS = {"email": None, "mobile": None}
PRIVATE_PROFILE_FIELDS = {"bio": None, "research_area": None}
OPEN_TASK_STATUSES = ("todo", "in_progress", "blocked")


def _is_privileged(user: Member) -> bool:
    return user.role in PRIVILEGED_ROLES or any(
        marker in (user.title or "") for marker in ("团长", "政委", "部长")
    )


def _can_view_workload_detail(target: Member, viewer: Member) -> bool:
    if target.open_id == viewer.open_id or _is_privileged(viewer):
        return True
    return bool(target.department and target.department == viewer.department)


def _task_payload(task: Task, project_names: dict[int, str] | None = None) -> dict:
    project_name = project_names.get(task.project_id) if project_names and task.project_id else None
    return {
        "task_id": task.task_id,
        "project_id": task.project_id,
        "project_name": project_name,
        "title": task.title,
        "description": task.description,
        "status": task.status,
        "priority": task.priority,
        "due_date": task.due_date.isoformat() if task.due_date else None,
        "completed_at": task.completed_at.isoformat() if task.completed_at else None,
        "updated_at": task.updated_at.isoformat() if task.updated_at else None,
    }


def _build_workload_payload(
    member: Member,
    tasks: list[Task],
    project_names: dict[int, str],
    current_user: Member,
) -> dict:
    open_tasks = [task for task in tasks if task.status in OPEN_TASK_STATUSES]
    done_tasks = [task for task in tasks if task.status == "done"]
    overdue_tasks = [
        task for task in open_tasks
        if task.due_date and task.due_date < datetime.utcnow()
    ]
    detail_visible = _can_view_workload_detail(member, current_user)
    active_projects = {
        task.project_id for task in open_tasks
        if task.project_id is not None
    }
    score = min(100, len(open_tasks) * 18 + len(overdue_tasks) * 12 + len(active_projects) * 8)
    capacity = "空闲" if score < 35 else "适中" if score < 70 else "繁忙"

    return {
        "member": {
            "open_id": member.open_id,
            "name": member.name,
            "avatar_url": member.avatar_url,
            "department": member.department,
            "title": member.title,
            "position": member.position,
        },
        "detail_visible": detail_visible,
        "visibility_reason": "same_department_or_manager" if detail_visible else "different_department_summary_only",
        "summary": {
            "total_tasks": len(tasks),
            "open_tasks": len(open_tasks),
            "todo_tasks": sum(1 for task in tasks if task.status == "todo"),
            "in_progress_tasks": sum(1 for task in tasks if task.status == "in_progress"),
            "blocked_tasks": sum(1 for task in tasks if task.status == "blocked"),
            "done_tasks": len(done_tasks),
            "overdue_tasks": len(overdue_tasks),
            "active_project_count": len(active_projects),
            "capacity_score": score,
            "capacity_label": capacity,
        },
        "tasks": [_task_payload(task, project_names) for task in open_tasks[:80]] if detail_visible else [],
        "recent_done_tasks": [_task_payload(task, project_names) for task in done_tasks[:20]] if detail_visible else [],
    }


def _serialize_member(member: Member, viewer: Member) -> MemberRead:
    payload = MemberRead.model_validate(member)
    if member.open_id == viewer.open_id or _is_privileged(viewer):
        return payload
    payload = payload.model_copy(update=PRIVATE_FIELDS)
    if member.privacy_level == "private":
        payload = payload.model_copy(update=PRIVATE_PROFILE_FIELDS)
    return payload


async def _push_member(member_data: dict[str, Any], record_id: str | None = None) -> str | None:
    if not settings.lark_table_members:
        return record_id
    record = await push_record_to_base(settings.lark_table_members, member_data, record_id=record_id)
    return record.get("record_id") or record_id


@router.get("", response_model=PageResponse[MemberRead])
def list_members(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    dept: str | None = Query(None),
    department: str | None = Query(None),
    role: str | None = Query(None),
    keyword: str | None = Query(None),
    db: Session = Depends(get_db),
    current_user: Member = Depends(get_current_user),
):
    stmt = select(Member)
    count_stmt = select(func.count()).select_from(Member)

    filters = []
    effective_dept = department or dept
    if effective_dept:
        # 主部门匹配, 或 extra_memberships JSON 文本里包含该部门名 (兼职)
        filters.append(
            or_(
                Member.department == effective_dept,
                Member.extra_memberships.ilike(f'%"department": "{effective_dept}"%'),
            )
        )
    if role:
        filters.append(Member.role == role)
    if keyword:
        pattern = f"%{keyword}%"
        filters.append(
            or_(
                Member.open_id.ilike(pattern),
                Member.name.ilike(pattern),
                Member.en_name.ilike(pattern),
                Member.department.ilike(pattern),
                Member.title.ilike(pattern),
            )
        )

    for condition in filters:
        stmt = stmt.where(condition)
        count_stmt = count_stmt.where(condition)

    stmt = stmt.order_by(Member.name.asc()).offset((page - 1) * page_size).limit(page_size)

    members = db.execute(stmt).scalars().all()
    total = db.execute(count_stmt).scalar_one()
    items = [_serialize_member(member, current_user) for member in members]
    return PageResponse[MemberRead](items=items, total=total, page=page, page_size=page_size)


@router.get("/{open_id}/workload")
def get_member_workload(
    open_id: str,
    db: Session = Depends(get_db),
    current_user: Member = Depends(get_current_user),
):
    member = db.get(Member, open_id)
    if member is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "member not found")

    tasks = db.execute(
        select(Task)
        .where(Task.assignee_open_id == open_id)
        .order_by(Task.due_date.asc().nullslast(), Task.updated_at.desc())
        .limit(300)
    ).scalars().all()
    project_ids = {task.project_id for task in tasks if task.project_id is not None}
    project_names = {}
    if project_ids:
        rows = db.execute(select(Project.project_id, Project.name).where(Project.project_id.in_(project_ids))).all()
        project_names = {project_id: name for project_id, name in rows}
    return _build_workload_payload(member, tasks, project_names, current_user)


@router.get("/workloads/bulk")
def get_member_workloads(
    open_ids: str = Query(..., description="逗号分隔 open_id"),
    db: Session = Depends(get_db),
    current_user: Member = Depends(get_current_user),
):
    requested_ids = [item.strip() for item in open_ids.split(",") if item.strip()]
    if not requested_ids:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "open_ids required")
    requested_ids = list(dict.fromkeys(requested_ids))[:100]
    members = db.execute(select(Member).where(Member.open_id.in_(requested_ids))).scalars().all()
    member_by_id = {member.open_id: member for member in members}
    tasks = db.execute(
        select(Task)
        .where(Task.assignee_open_id.in_(member_by_id.keys()))
        .order_by(Task.assignee_open_id.asc(), Task.due_date.asc().nullslast(), Task.updated_at.desc())
    ).scalars().all()
    tasks_by_member: dict[str, list[Task]] = defaultdict(list)
    for task in tasks:
        if len(tasks_by_member[task.assignee_open_id]) < 300:
            tasks_by_member[task.assignee_open_id].append(task)
    project_ids = {task.project_id for task in tasks if task.project_id is not None}
    project_names = {}
    if project_ids:
        rows = db.execute(select(Project.project_id, Project.name).where(Project.project_id.in_(project_ids))).all()
        project_names = {project_id: name for project_id, name in rows}
    return {
        open_id: _build_workload_payload(member, tasks_by_member.get(open_id, []), project_names, current_user)
        for open_id in requested_ids
        if (member := member_by_id.get(open_id)) is not None
    }


@router.post("/sync/lark-people")
async def sync_lark_people(
    source: str | None = Query(None, pattern="^(ehr|contact|auto)$"),
    mark_missing_left: bool | None = Query(None),
    db: Session = Depends(get_db),
    _: Member = Depends(require_admin),
):
    """按飞书人事/通讯录导入组织人员到本地 members。

    默认 source=ehr, 即以飞书人事标准版花名册为主；source=auto 时飞书人事失败会降级到通讯录。
    mark_missing_left 默认跟随配置, 默认 False, 避免应用通讯录权限范围不完整时误标离职。
    """
    try:
        return await sync_people_from_lark(db, source=source, mark_missing_left=mark_missing_left)
    except Exception as exc:
        log.exception("lark people sync failed")
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"failed to sync lark people: {exc}") from exc


@router.get("/{open_id}", response_model=MemberRead)
def get_member(
    open_id: str,
    db: Session = Depends(get_db),
    current_user: Member = Depends(get_current_user),
):
    member = db.get(Member, open_id)
    if member is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "member not found")
    return _serialize_member(member, current_user)


@router.post("", response_model=MemberRead, status_code=status.HTTP_201_CREATED)
async def create_member(
    payload: MemberCreate,
    db: Session = Depends(get_db),
    current_user: Member = Depends(get_current_user),
):
    if not _is_privileged(current_user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "admin or staff required")
    if db.get(Member, payload.open_id) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "member already exists")

    data = payload.model_dump()
    try:
        data["base_record_id"] = await _push_member(data, record_id=data.get("base_record_id"))
        member = Member(**data)
        db.add(member)
        db.commit()
        db.refresh(member)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "member create conflict") from exc
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"failed to sync member: {exc}") from exc
    return MemberRead.model_validate(member)


@router.patch("/{open_id}", response_model=MemberRead)
async def update_member(
    open_id: str,
    payload: MemberUpdate,
    db: Session = Depends(get_db),
    current_user: Member = Depends(get_current_user),
):
    member = db.get(Member, open_id)
    if member is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "member not found")

    is_self = current_user.open_id == open_id
    privileged = _is_privileged(current_user)
    if not is_self and not privileged:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "can only update self")

    update_data = payload.model_dump(exclude_unset=True)
    if not privileged:
        forbidden = SELF_EDIT_FORBIDDEN_FIELDS.intersection(update_data)
        if forbidden:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                f"self update cannot modify: {', '.join(sorted(forbidden))}",
            )

    if not update_data:
        return MemberRead.model_validate(member)

    next_state = MemberRead.model_validate(member).model_dump()
    next_state.update(update_data)

    try:
        try:
            next_record_id = await _push_member(next_state, record_id=member.base_record_id)
            if next_record_id:
                member.base_record_id = next_record_id
        except Exception as exc:
            log.warning("member %s Base 同步推送失败 (本地仍写入): %s", open_id, exc)
        for key, value in update_data.items():
            setattr(member, key, value)
        db.commit()
        db.refresh(member)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "member update conflict") from exc
    except Exception as exc:
        db.rollback()
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"failed to save member: {exc}") from exc
    return MemberRead.model_validate(member)


@router.delete("/{open_id}", response_model=MemberRead)
async def deactivate_member(
    open_id: str,
    db: Session = Depends(get_db),
    current_user: Member = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "admin required")

    member = db.get(Member, open_id)
    if member is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "member not found")

    next_state = MemberRead.model_validate(member).model_dump()
    next_state["status"] = "left"

    try:
        next_record_id = await _push_member(next_state, record_id=member.base_record_id)
        if next_record_id:
            member.base_record_id = next_record_id
        member.status = "left"
        db.commit()
        db.refresh(member)
    except Exception as exc:
        db.rollback()
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"failed to sync member: {exc}") from exc
    return MemberRead.model_validate(member)
