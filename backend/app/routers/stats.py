"""看板聚合接口."""
from __future__ import annotations

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models import Member, Project, ProjectChat, ProjectMember, Task

router = APIRouter(prefix="/api/stats", tags=["stats"])


def _department_filter(department: str | None):
    if not department:
        return None
    return or_(
        Member.department == department,
        Member.extra_memberships.ilike(f'%"department": "{department}"%'),
    )


def _status_label(status_: str) -> str:
    return {
        "planning": "规划中",
        "active": "进行中",
        "paused": "已暂停",
        "completed": "已完成",
        "archived": "已归档",
    }.get(status_, status_)


@router.get("/board")
def board_stats(
    db: Session = Depends(get_db),
    current_user: Member = Depends(get_current_user),
) -> dict:
    """返回当前管理者所在部门的项目和任务看板."""
    department = current_user.department
    member_stmt = select(Member).where(Member.status == "active")
    dept_condition = _department_filter(department)
    if dept_condition is not None:
        member_stmt = member_stmt.where(dept_condition)
    members = db.execute(member_stmt.order_by(Member.name.asc())).scalars().all()
    member_ids = [member.open_id for member in members]

    project_filters = []
    if department:
        project_filters.append(Project.department == department)
    if member_ids:
        project_filters.append(Project.owner_open_id.in_(member_ids))
        project_member_project_ids = select(ProjectMember.project_id).where(
            ProjectMember.member_open_id.in_(member_ids),
            ProjectMember.left_at.is_(None),
        )
        project_filters.append(Project.project_id.in_(project_member_project_ids))

    project_stmt = select(Project)
    if project_filters:
        project_stmt = project_stmt.where(or_(*project_filters))
    projects = db.execute(project_stmt.order_by(Project.updated_at.desc())).scalars().unique().all()
    project_ids = [project.project_id for project in projects]

    task_filters = []
    if project_ids:
        task_filters.append(Task.project_id.in_(project_ids))
    if member_ids:
        task_filters.append(Task.assignee_open_id.in_(member_ids))
    task_stmt = select(Task)
    if task_filters:
        task_stmt = task_stmt.where(or_(*task_filters))
    tasks = db.execute(task_stmt.order_by(Task.updated_at.desc())).scalars().all()

    open_projects = [p for p in projects if p.status in ("planning", "active", "paused")]
    active_projects = [p for p in projects if p.status == "active"]
    open_tasks = [t for t in tasks if t.status in ("todo", "in_progress", "blocked")]
    done_tasks = [t for t in tasks if t.status == "done"]
    blocked_tasks = [t for t in tasks if t.status == "blocked"]
    standalone_open_tasks = [t for t in open_tasks if not t.project_id]
    now = datetime.now()
    overdue_tasks = [
        t for t in open_tasks
        if t.due_date and t.due_date < now
    ]
    due_soon_tasks = [
        t for t in open_tasks
        if t.due_date and now <= t.due_date <= now + timedelta(days=3)
    ]
    completion_rate = round((len(done_tasks) / len(tasks)) * 100) if tasks else 0

    cutoff = now - timedelta(hours=48)
    chat_rows = db.execute(
        select(ProjectChat).where(ProjectChat.project_id.in_(project_ids))
        if project_ids else select(ProjectChat).where(False)
    ).scalars().all()
    chat_by_project: dict[int, list[ProjectChat]] = {}
    for chat in chat_rows:
        chat_by_project.setdefault(chat.project_id, []).append(chat)

    abnormal_projects = []
    recently_advanced_projects = []
    no_topic_projects = []
    project_task_counts: dict[int, dict[str, int]] = {}
    for task in tasks:
        if not task.project_id:
            continue
        counts = project_task_counts.setdefault(task.project_id, {"total": 0, "done": 0, "open": 0})
        counts["total"] += 1
        if task.status == "done":
            counts["done"] += 1
        elif task.status in ("todo", "in_progress", "blocked"):
            counts["open"] += 1

    for project in open_projects:
        chats = chat_by_project.get(project.project_id, [])
        selected_chats = [chat for chat in chats if chat.selected_topic_key]
        latest_reply_at = max(
            (chat.latest_topic_reply_at for chat in selected_chats if chat.latest_topic_reply_at),
            default=None,
        )
        stale_chats = [
            chat for chat in selected_chats
            if not chat.latest_topic_reply_at or chat.latest_topic_reply_at < cutoff
        ]
        if not selected_chats:
            no_topic_projects.append(project)
        if stale_chats:
            abnormal_projects.append((project, latest_reply_at, "关联话题超过 48 小时无新回复"))
        if latest_reply_at and latest_reply_at >= cutoff:
            recently_advanced_projects.append((project, latest_reply_at))

    status_counts = {
        status_: db.execute(
            select(func.count()).select_from(Project).where(
                Project.project_id.in_(project_ids) if project_ids else False,
                Project.status == status_,
            )
        ).scalar_one()
        for status_ in ("planning", "active", "paused", "completed", "archived")
    }

    status_distribution = [
        {"status": status_, "label": _status_label(status_), "count": count}
        for status_, count in status_counts.items()
        if count
    ]

    recent_projects = []
    detail_projects = []
    project_name_by_id = {project.project_id: project.name for project in projects}
    project_tags_by_id = {project.project_id: project.tags for project in projects}
    for project in projects:
        chats = chat_by_project.get(project.project_id, [])
        latest_reply_at = max(
            (chat.latest_topic_reply_at for chat in chats if chat.latest_topic_reply_at),
            default=None,
        )
        counts = project_task_counts.get(project.project_id, {"total": 0, "done": 0, "open": 0})
        item = {
            "project_id": project.project_id,
            "name": project.name,
            "status": project.status,
            "priority": project.priority,
            "owner_open_id": project.owner_open_id,
            "updated_at": project.updated_at.isoformat() if project.updated_at else None,
            "latest_topic_reply_at": latest_reply_at.isoformat() if latest_reply_at else None,
            "task_count": counts["total"],
            "task_done_count": counts["done"],
            "open_task_count": counts["open"],
            "is_abnormal": project.status in ("planning", "active") and any(
                chat.selected_topic_key and (
                    not chat.latest_topic_reply_at or chat.latest_topic_reply_at < cutoff
                )
                for chat in chats
            ),
        }
        detail_projects.append(item)
    recent_projects = detail_projects[:8]

    def _task_payload(task: Task) -> dict:
        return {
            "task_id": task.task_id,
            "project_id": task.project_id,
            "project_name": project_name_by_id.get(task.project_id) if task.project_id else None,
            "project_tags": project_tags_by_id.get(task.project_id) if task.project_id else None,
            "title": task.title,
            "status": task.status,
            "assignee_open_id": task.assignee_open_id,
            "due_date": task.due_date.isoformat() if task.due_date else None,
            "priority": task.priority,
        }

    return {
        "scope": {
            "department": department,
            "manager_open_id": current_user.open_id,
            "manager_name": current_user.name,
        },
        "stats": {
            "members": len(members),
            "projects_total": len(projects),
            "active_projects": len(active_projects),
            "open_projects": len(open_projects),
            "open_tasks": len(open_tasks),
            "standalone_open_tasks": len(standalone_open_tasks),
            "blocked_tasks": len(blocked_tasks),
            "overdue_tasks": len(overdue_tasks),
            "due_soon_tasks": len(due_soon_tasks),
            "completed_tasks": len(done_tasks),
            "task_completion_rate": completion_rate,
            "recently_advanced_projects": len(recently_advanced_projects),
            "abnormal_projects": len(abnormal_projects),
            "no_topic_projects": len(no_topic_projects),
        },
        "status_distribution": status_distribution,
        "recent_projects": recent_projects,
        "detail_projects": detail_projects[:100],
        "abnormal_projects": [
            {
                "project_id": project.project_id,
                "name": project.name,
                "status": project.status,
                "latest_topic_reply_at": latest_reply_at.isoformat() if latest_reply_at else None,
                "reason": reason,
            }
            for project, latest_reply_at, reason in abnormal_projects[:6]
        ],
        "recent_tasks": [_task_payload(task) for task in open_tasks[:8]],
        "detail_tasks": [_task_payload(task) for task in open_tasks[:100]],
        "standalone_tasks": [_task_payload(task) for task in standalone_open_tasks[:100]],
        "overdue_tasks": [_task_payload(task) for task in overdue_tasks[:100]],
        "due_soon_tasks": [_task_payload(task) for task in due_soon_tasks[:100]],
        "department_members": [
            {
                "open_id": member.open_id,
                "name": member.name,
                "avatar_url": member.avatar_url,
                "title": member.title,
                "position": member.position,
                "role": member.role,
                "status": member.status,
            }
            for member in members[:20]
        ],
    }
