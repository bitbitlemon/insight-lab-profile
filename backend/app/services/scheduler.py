"""APScheduler: 增量 + 全量同步定时任务."""
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.triggers.cron import CronTrigger
from ..config import settings
from ..db import SessionLocal
from .sync import sync_all_from_base
from .points_service import push_pending_ledger_to_base, ledger_fields_for_base
from .base_writer import push_pending_for_table

scheduler = AsyncIOScheduler()


async def _sync_job():
    db = SessionLocal()
    try:
        await sync_all_from_base(db)
    finally:
        db.close()


async def _push_pending_to_base_job():
    """定时扫所有支持双写的 ORM 表, 把 base_record_id IS NULL 的批量推 Base."""
    from app.models import (
        Award, Competition, Contribution, Paper, PaperMilestone,
        PointsLedger, Project, Task, Training,
    )
    from app.config import settings
    from app.routers.projects import _project_fields_for_base  # type: ignore
    from app.routers.tasks import _task_fields_for_base  # type: ignore
    from app.routers.paper_milestones import _milestone_fields_for_base  # type: ignore
    from app.routers.papers import _paper_fields_for_base  # type: ignore
    from app.routers.competitions import _competition_fields_for_base  # type: ignore
    from app.routers.awards import _award_fields_for_base  # type: ignore
    from app.routers.trainings import _training_fields_for_base  # type: ignore

    def _contribution_fields(c):
        return {
            "member_open_id": c.member_open_id,
            "type": c.type,
            "title": c.title,
            "description": c.description or "",
            "occurred_at": c.occurred_at.isoformat() if c.occurred_at else None,
            "role_in_contribution": c.role_in_contribution or "",
            "hours": c.hours,
            "proof_url": c.proof_url or "",
            "tags": c.tags or "",
        }

    try:
        await push_pending_ledger_to_base(batch=50)
    except Exception:
        pass

    push_targets = [
        (Contribution, "lark_table_contributions", _contribution_fields),
        (Project, "lark_table_projects", _project_fields_for_base),
        (Task, "lark_table_tasks", _task_fields_for_base),
        (PaperMilestone, "lark_table_paper_milestones", _milestone_fields_for_base),
        (Paper, "lark_table_papers", _paper_fields_for_base),
        (Competition, "lark_table_competitions", _competition_fields_for_base),
        (Award, "lark_table_awards", _award_fields_for_base),
        (Training, "lark_table_trainings", _training_fields_for_base),
    ]
    for orm_cls, attr, fields_fn in push_targets:
        table_id = getattr(settings, attr, "")
        try:
            await push_pending_for_table(orm_cls, table_id, fields_fn, SessionLocal, batch=50)
        except Exception:
            pass


def _auto_archive_projects():
    """每天扫: completed 项目超过 7 天 → archived."""
    from datetime import date, datetime, timedelta
    from ..models import Project
    db = SessionLocal()
    try:
        cutoff = date.today() - timedelta(days=7)
        rows = db.query(Project).filter(
            Project.status == "completed",
            Project.actual_end_date.isnot(None),
            Project.actual_end_date <= cutoff,
        ).all()
        for p in rows:
            p.status = "archived"
            p.archived_at = datetime.utcnow()
        db.commit()
    finally:
        db.close()


def start_scheduler():
    if scheduler.running:
        return
    scheduler.add_job(
        _sync_job,
        IntervalTrigger(seconds=settings.sync_incremental_interval_sec),
        id="sync_incremental", replace_existing=True,
    )
    scheduler.add_job(
        _sync_job,
        CronTrigger(hour=settings.sync_full_cron_hour, minute=0),
        id="sync_full", replace_existing=True,
    )
    scheduler.add_job(
        _auto_archive_projects,
        CronTrigger(hour=3, minute=30),
        id="auto_archive_projects", replace_existing=True,
    )
    scheduler.add_job(
        _push_pending_to_base_job,
        IntervalTrigger(seconds=90),
        id="push_pending_to_base", replace_existing=True,
    )
    scheduler.start()


def stop_scheduler():
    if scheduler.running:
        scheduler.shutdown(wait=False)
