"""聚合统计接口: 把 BoardPage 进入时的 9 个并发 API 合并为 1 个."""
from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models import (
    Award, Competition, Member, Paper, PaperAuthor, Project, Task,
)

router = APIRouter(prefix="/api/stats", tags=["stats"])


@router.get("/board")
def board_stats(
    db: Session = Depends(get_db),
    _: Member = Depends(get_current_user),
) -> dict:
    """BoardPage 一次性聚合接口."""
    members_total = db.execute(
        select(func.count()).select_from(Member).where(Member.status == "active")
    ).scalar_one()

    papers_total = db.execute(select(func.count()).select_from(Paper)).scalar_one()
    papers_top_tier = db.execute(
        select(func.count()).select_from(Paper).where(
            or_(
                Paper.venue_level.like("%中科院一区%"),
                Paper.venue_level.like("%中科院二区%"),
            )
        )
    ).scalar_one()

    competitions_total = db.execute(select(func.count()).select_from(Competition)).scalar_one()
    competitions_won = db.execute(
        select(func.count()).select_from(Competition).where(
            Competition.award_level.is_not(None),
            Competition.award_level != "",
        )
    ).scalar_one()

    awards_total = db.execute(select(func.count()).select_from(Award)).scalar_one()

    active_projects = db.execute(
        select(func.count()).select_from(Project).where(
            Project.status.in_(("active", "planning", "paused"))
        )
    ).scalar_one()

    open_tasks = db.execute(
        select(func.count()).select_from(Task).where(
            Task.status.in_(("todo", "in_progress"))
        )
    ).scalar_one()

    recent_papers = db.execute(
        select(Paper)
        .order_by(Paper.publish_date.desc().nullslast(), Paper.year.desc())
        .limit(5)
    ).scalars().all()

    recent_projects = db.execute(
        select(Project)
        .where(Project.status == "active")
        .order_by(Project.updated_at.desc())
        .limit(5)
    ).scalars().all()

    today = date.today()
    project_task_counts: dict[int, dict[str, int]] = {}
    if recent_projects:
        pids = [pr.project_id for pr in recent_projects]
        for pid, status_, count in db.execute(
            select(Task.project_id, Task.status, func.count())
            .where(Task.project_id.in_(pids))
            .group_by(Task.project_id, Task.status)
        ).all():
            d = project_task_counts.setdefault(pid, {"total": 0, "done": 0})
            d["total"] += count
            if status_ == "done":
                d["done"] += count

    recent_tasks = db.execute(
        select(Task)
        .where(Task.status == "in_progress")
        .order_by(Task.updated_at.desc())
        .limit(5)
    ).scalars().all()

    return {
        "stats": {
            "members": members_total,
            "papers": papers_total,
            "papers_top_tier": papers_top_tier,
            "competitions": competitions_total,
            "competitions_won": competitions_won,
            "awards": awards_total,
            "active_projects": active_projects,
            "open_tasks": open_tasks,
        },
        "recent_papers": [
            {
                "paper_id": p.paper_id,
                "title": p.title,
                "venue": p.venue,
                "venue_level": p.venue_level,
                "year": p.year,
                "publish_date": p.publish_date.isoformat() if p.publish_date else None,
                "status": p.status,
                "url": p.url,
                "pdf_url": p.pdf_url,
            } for p in recent_papers
        ],
        "recent_projects": [
            {
                "project_id": pr.project_id,
                "name": pr.name,
                "status": pr.status,
                "priority": pr.priority,
                "owner_open_id": pr.owner_open_id,
                "updated_at": pr.updated_at.isoformat() if pr.updated_at else None,
                "days_active": (today - pr.start_date).days if pr.start_date else
                               (today - pr.created_at.date()).days if pr.created_at else 0,
                "task_count": project_task_counts.get(pr.project_id, {}).get("total", 0),
                "task_done_count": project_task_counts.get(pr.project_id, {}).get("done", 0),
            } for pr in recent_projects
        ],
        "recent_tasks": [
            {
                "task_id": t.task_id,
                "project_id": t.project_id,
                "title": t.title,
                "status": t.status,
                "assignee_open_id": t.assignee_open_id,
                "due_date": t.due_date.isoformat() if t.due_date else None,
                "priority": t.priority,
            } for t in recent_tasks
        ],
    }
