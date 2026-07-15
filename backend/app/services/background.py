import asyncio
import logging
from contextlib import suppress

from ..db import engine
from ..models import (
    AIAssistantConfig,
    AIChatSubmission,
    AppPresence,
    AppUsageDaily,
    ContributionComment,
    LabDailyReport,
    LabInteraction,
    LabMessageConfig,
    LabOccupancy,
    LabReservation,
    LabResource,
    LabSpace,
    LarkBaseChatMessage,
    LarkBaseChatSource,
    LarkDocWatch,
    LarkUserStatus,
    ProjectChat,
    ProjectLog,
    ProjectLogComment,
    ProjectRelation,
    SnakeScore,
    SystemFeedback,
    TaskFeedback,
    ApprovalRule,
    ProjectLogApproval,
    StageChecklistTemplate,
    ProjectStageCheck,
    ProjectStageTransition,
    PermissionAssignment,
)

try:
    from ..models import LabBroadcastItem
except ImportError:
    LabBroadcastItem = None
from .a_class_log import fetch_all as fetch_a_class_all
from .audit import install_audit_listeners
from .listener import start_listener, stop_listener
from .runtime_schema import apply_runtime_schema
from .scheduler import start_scheduler, stop_scheduler
from .zhangqian_log import _fetch_all_records

_log = logging.getLogger(__name__)

# zhangqian 全表缓存 TTL=600s, 提前 120s 续期, 避免用户在窗口边缘踩到 cache miss
_ZHANGQIAN_PREWARM_INTERVAL = 480.0


def initialize_runtime() -> None:
    apply_runtime_schema(engine, {
        "ProjectLog": ProjectLog,
        "ProjectLogComment": ProjectLogComment,
        "ProjectRelation": ProjectRelation,
        "ProjectChat": ProjectChat,
        "AIChatSubmission": AIChatSubmission,
        "LarkDocWatch": LarkDocWatch,
        "LarkBaseChatSource": LarkBaseChatSource,
        "LarkBaseChatMessage": LarkBaseChatMessage,
        "ContributionComment": ContributionComment,
        "AIAssistantConfig": AIAssistantConfig,
        "LarkUserStatus": LarkUserStatus,
        "LabSpace": LabSpace,
        "LabResource": LabResource,
        "LabReservation": LabReservation,
        "LabOccupancy": LabOccupancy,
        "LabInteraction": LabInteraction,
        "LabMessageConfig": LabMessageConfig,
        "LabDailyReport": LabDailyReport,
        "AppPresence": AppPresence,
        "AppUsageDaily": AppUsageDaily,
        "SnakeScore": SnakeScore,
        "TaskFeedback": TaskFeedback,
        "SystemFeedback": SystemFeedback,
        "ApprovalRule": ApprovalRule,
        "ProjectLogApproval": ProjectLogApproval,
        "StageChecklistTemplate": StageChecklistTemplate,
        "ProjectStageCheck": ProjectStageCheck,
        "ProjectStageTransition": ProjectStageTransition,
        "PermissionAssignment": PermissionAssignment,
        "LabBroadcastItem": LabBroadcastItem,
    })
    try:
        from sqlalchemy.orm import Session as _Session
        from ..models import Project as _Project
        from .stage_flow import compute_current_stage_from_logs, seed_stage_templates
        with _Session(engine) as _db:
            seeded = seed_stage_templates(_db)
            if seeded:
                _log.info("stage checklist templates seeded: %d", seeded)
            _stale = _db.query(_Project).filter(_Project.current_stage.is_(None)).all()
            for _proj in _stale:
                _proj.current_stage = compute_current_stage_from_logs(_db, _proj.project_id)
            if _stale:
                _db.commit()
                _log.info("backfilled current_stage for %d projects", len(_stale))
    except Exception:
        # 多 worker 并发种子可能撞唯一约束; 容错跳过, 下次启动自愈
        _log.exception("stage template seed/backfill skipped")
    install_audit_listeners()


async def _prewarm_zhangqian_loop():
    while True:
        try:
            n = len(await _fetch_all_records(force=True))
            _log.info("zhangqian prewarm: %d records cached", n)
        except Exception:
            _log.exception("zhangqian prewarm failed (will retry)")
        await asyncio.sleep(_ZHANGQIAN_PREWARM_INTERVAL)


async def _prewarm_a_class_loop():
    while True:
        try:
            n = len(await fetch_a_class_all(force=True))
            _log.info("a_class prewarm: %d items cached", n)
        except Exception:
            _log.exception("a_class prewarm failed (will retry)")
        await asyncio.sleep(_ZHANGQIAN_PREWARM_INTERVAL)


async def start_background_services() -> list[asyncio.Task]:
    start_scheduler()
    start_listener()
    return [
        asyncio.create_task(_prewarm_zhangqian_loop()),
        asyncio.create_task(_prewarm_a_class_loop()),
    ]


async def stop_background_services(tasks: list[asyncio.Task]) -> None:
    for task in tasks:
        task.cancel()
    for task in tasks:
        with suppress(asyncio.CancelledError):
            await task
    await stop_listener()
    stop_scheduler()
