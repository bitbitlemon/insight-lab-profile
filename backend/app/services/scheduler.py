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


async def _sync_class_schedules_job():
    db = SessionLocal()
    try:
        from .class_schedule_sync import sync_class_schedules_from_lark_base
        await sync_class_schedules_from_lark_base(db)
    except Exception:
        pass
    finally:
        db.close()


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


def _task_overdue_reminder_job():
    """每天提醒逾期未完成任务负责人."""
    from datetime import date, datetime
    from ..models import Project, Task
    from .lark_im import notify_task_overdue

    db = SessionLocal()
    try:
        now = datetime.now()
        rows = db.query(Task).filter(
            Task.assignee_open_id.isnot(None),
            Task.due_date.isnot(None),
            Task.due_date < now,
            Task.status.in_(["todo", "in_progress", "blocked"]),
        ).order_by(Task.due_date.asc()).limit(200).all()
        reminder_date = date.today().isoformat()
        for task in rows:
            project_name = None
            if task.project_id:
                project = db.get(Project, task.project_id)
                project_name = project.name if project else None
            notify_task_overdue(
                assignee_open_id=task.assignee_open_id,
                task_title=task.title,
                due_date=task.due_date.strftime("%Y-%m-%d %H:%M"),
                project_name=project_name,
                task_id=task.task_id,
                reminder_date=reminder_date,
            )
    finally:
        db.close()


def _sync_lark_doc_watches_job():
    """Poll watched Feishu docs; changed docs create a new short project log."""
    from .ai_chat_ingest import sync_lark_doc_watches

    db = SessionLocal()
    try:
        sync_lark_doc_watches(db, limit=20)
    finally:
        db.close()


def _sync_lark_base_chat_sources_job():
    from .lark_base_chat_sync import sync_lark_base_chat_sources

    db = SessionLocal()
    try:
        sync_lark_base_chat_sources(db, limit_sources=3)
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
        _task_overdue_reminder_job,
        CronTrigger(hour=11, minute=43),
        id="task_overdue_reminder", replace_existing=True,
    )
    scheduler.add_job(
        _push_pending_to_base_job,
        IntervalTrigger(seconds=90),
        id="push_pending_to_base", replace_existing=True,
    )
    scheduler.add_job(
        _sync_class_schedules_job,
        IntervalTrigger(minutes=30),
        id="sync_class_schedules_from_lark", replace_existing=True,
    )
    scheduler.add_job(
        _sync_lark_doc_watches_job,
        IntervalTrigger(minutes=15),
        id="sync_lark_doc_watches", replace_existing=True,
    )
    scheduler.add_job(
        _sync_lark_base_chat_sources_job,
        IntervalTrigger(minutes=20),
        id="sync_lark_base_chat_sources", replace_existing=True,
    )
    # 待办通报自动发送先停用；保留卡片构建/回执代码，方便后续手动或重新启用。
    from .chat_cards import sync_and_extract_all_chats
    # 准实时: 每 2 分钟拉群消息 + 抽取意图 + 自动落地 (complete_task 高置信弹校验卡)
    scheduler.add_job(
        sync_and_extract_all_chats,
        IntervalTrigger(minutes=2),
        id="chat_realtime_sync_extract", replace_existing=True,
    )
    scheduler.start()


def stop_scheduler():
    if scheduler.running:
        scheduler.shutdown(wait=False)
