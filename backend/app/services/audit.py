"""审计日志：手动 log_action + SQLA event 自动埋点。

- log_action: 显式调用（保留供 export 等非 ORM 操作记录用）
- install_audit_listeners: 在 12 个 TRACKED_MODELS 上挂 after_insert/after_update/after_delete,
  通过 conn.execute 直插 audit_log 表避免 session 递归。无 actor (后台任务) 时跳过。
"""
from __future__ import annotations
import json
import logging
from datetime import datetime, date
from typing import Any

from sqlalchemy import event, inspect as sa_inspect
from sqlalchemy.engine import Connection
from sqlalchemy.orm import Session

from .audit_context import current_actor, current_ip
from ..models import (
    AuditLog,
    Member, Paper, Competition, Project, Task, Award, Training,
    MeetingNote, Advising, PointsLedger, CalendarEvent, LeaveRequest,
)

log = logging.getLogger(__name__)

TRACKED_MODELS = [
    Member, Paper, Competition, Project, Task, Award, Training,
    MeetingNote, Advising, PointsLedger, CalendarEvent, LeaveRequest,
]


def _serializable(value: Any) -> Any:
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value


def _diff(before: dict | None, after: dict | None) -> str:
    payload: dict[str, Any] = {}
    if before is None and after is not None:
        payload["after"] = after
    elif after is None and before is not None:
        payload["before"] = before
    elif before and after:
        keys = set(before.keys()) | set(after.keys())
        delta = {k: {"before": before.get(k), "after": after.get(k)}
                 for k in keys if before.get(k) != after.get(k)}
        payload["delta"] = delta
    return json.dumps(payload, ensure_ascii=False, default=str)[:8000]


def log_action(
    db: Session,
    actor_open_id: str,
    action: str,
    target_table: str,
    target_id: str,
    before: dict | None = None,
    after: dict | None = None,
    ip: str | None = None,
) -> None:
    if action not in ("create", "update", "delete", "export"):
        raise ValueError(f"invalid action: {action}")
    entry = AuditLog(
        actor_open_id=actor_open_id,
        action=action,
        target_table=target_table,
        target_id=str(target_id),
        diff=_diff(before, after),
        ip=ip,
        created_at=datetime.utcnow(),
    )
    db.add(entry)
    db.commit()


def _snapshot(target) -> dict:
    mapper = sa_inspect(target).mapper
    return {col.key: _serializable(getattr(target, col.key)) for col in mapper.column_attrs}


def _diff_changes(target) -> tuple[dict, dict]:
    """update 时从 SQLA 历史拿前后值，仅保留有变化的字段。"""
    state = sa_inspect(target)
    before, after = {}, {}
    for attr in state.mapper.column_attrs:
        hist = state.attrs[attr.key].history
        if not hist.has_changes():
            continue
        before[attr.key] = _serializable(hist.deleted[0] if hist.deleted else None)
        after[attr.key] = _serializable(hist.added[0] if hist.added else getattr(target, attr.key))
    return before, after


def _target_id(target) -> str:
    pk_cols = sa_inspect(target).mapper.primary_key
    parts = [getattr(target, col.key) for col in pk_cols]
    if len(parts) == 1:
        return str(parts[0])
    return ",".join(str(x) for x in parts)


def _insert_audit(
    conn: Connection,
    *,
    action: str,
    target_table: str,
    target_id: str,
    before: dict | None,
    after: dict | None,
) -> None:
    actor = current_actor.get()
    if not actor:
        return
    try:
        conn.execute(
            AuditLog.__table__.insert().values(
                actor_open_id=actor,
                action=action,
                target_table=target_table,
                target_id=str(target_id),
                diff=_diff(before, after),
                ip=current_ip.get(),
                created_at=datetime.utcnow(),
            )
        )
    except Exception:
        log.exception("audit insert failed for %s/%s/%s", action, target_table, target_id)


def _on_insert(mapper, connection, target):
    _insert_audit(
        connection,
        action="create",
        target_table=target.__tablename__,
        target_id=_target_id(target),
        before=None,
        after=_snapshot(target),
    )


def _on_update(mapper, connection, target):
    before, after = _diff_changes(target)
    if not before and not after:
        return
    _insert_audit(
        connection,
        action="update",
        target_table=target.__tablename__,
        target_id=_target_id(target),
        before=before,
        after=after,
    )


def _on_delete(mapper, connection, target):
    _insert_audit(
        connection,
        action="delete",
        target_table=target.__tablename__,
        target_id=_target_id(target),
        before=_snapshot(target),
        after=None,
    )


_installed = False


def install_audit_listeners() -> None:
    """注册所有 TRACKED_MODELS 的 ORM 事件钩子。幂等。"""
    global _installed
    if _installed:
        return
    for model in TRACKED_MODELS:
        event.listen(model, "after_insert", _on_insert)
        event.listen(model, "after_update", _on_update)
        event.listen(model, "after_delete", _on_delete)
    _installed = True
    log.info("audit listeners installed for %d models", len(TRACKED_MODELS))
