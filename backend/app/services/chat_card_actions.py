"""卡片回调处理: 接收 lark card.action.trigger, 按 value.kind 路由写 DB.

支持的 kind:
  - complete_confirm: 用户对"AI 检测完成"卡的决策 (confirm/reject/defer)
  - quick_done:       顺手完成区某条任务一键完成
  - morning_ack:      早通报卡某条任务的回执操作 (ack/in_progress/need_help/near_done/delay)

每次处理后返回 toast dict 给飞书显示, 同时尝试 update_card 把按钮变灰/换文案 (best effort).
"""
from __future__ import annotations

import json
import logging
import subprocess
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ChatIntentLog, Task

log = logging.getLogger(__name__)

LARK_CLI = "/home/ubuntu/.npm-global/bin/lark-cli"


def _toast(text: str, type_: str = "info") -> dict:
    """飞书 toast 响应格式."""
    return {"toast": {"type": type_, "content": text, "i18n": {"zh_cn": text}}}


def _deep_get(payload: dict, *paths: str) -> Any:
    for path in paths:
        cur: Any = payload
        ok = True
        for key in path.split("."):
            if isinstance(cur, dict) and key in cur:
                cur = cur[key]
            else:
                ok = False
                break
        if ok:
            return cur
    return None


def _extract_action(payload: dict) -> tuple[dict, str | None, str | None]:
    """从 card.action.trigger payload 抓 (value, operator_open_id, message_id)."""
    value = _deep_get(payload, "event.action.value", "action.value", "event.value", "value") or {}
    if not isinstance(value, dict):
        try:
            value = json.loads(value) if isinstance(value, str) else {}
        except Exception:
            value = {}
    operator = _deep_get(payload, "event.operator.open_id", "operator.open_id", "event.operator.tenant_key.open_id")
    msg_id = _deep_get(payload, "event.context.open_message_id", "context.open_message_id", "event.open_message_id")
    return value, operator, msg_id


def handle_chat_intent_card_action(payload: dict, db: Session) -> dict:
    """主入口: dispatch 到具体动作."""
    value, operator, _msg_id = _extract_action(payload)
    kind = value.get("kind")

    if kind == "complete_confirm":
        return _handle_complete_confirm(db, value, operator)
    if kind == "quick_done":
        return _handle_quick_done(db, value, operator)
    if kind == "morning_ack":
        return _handle_morning_ack(db, value, operator)

    log.info("chat_card_action unknown kind=%s value=%s", kind, value)
    return _toast("未识别的操作", "warning")


def _handle_complete_confirm(db: Session, value: dict, operator: str | None) -> dict:
    intent_id = value.get("intent_id")
    task_id = value.get("task_id")
    act = value.get("act")
    if not intent_id or not task_id or act not in ("confirm", "reject", "defer"):
        return _toast("参数不完整", "warning")

    intent = db.execute(select(ChatIntentLog).where(ChatIntentLog.chat_intent_id == intent_id)).scalar_one_or_none()
    task = db.execute(select(Task).where(Task.task_id == task_id)).scalar_one_or_none()
    if not task:
        return _toast("任务不存在", "error")

    now = datetime.utcnow()
    if act == "confirm":
        task.status = "done"
        task.completed_at = now
        if intent:
            intent.status = "applied"
            intent.applied_at = now
            intent.applied_task_id = task.task_id
        db.commit()
        return _toast(f"已确认完成: {task.title[:30]}", "success")

    if act == "reject":
        # 任务继续 in_progress, intent 标 rejected
        if task.status == "done":
            task.status = "in_progress"
            task.completed_at = None
        if intent:
            intent.status = "rejected"
        db.commit()
        return _toast("已撤回, 任务回到进行中", "info")

    # defer: 不动 DB, 只反馈
    return _toast("已记下, 稍后再问你", "info")


def _handle_quick_done(db: Session, value: dict, operator: str | None) -> dict:
    task_id = value.get("task_id")
    if not task_id:
        return _toast("参数不完整", "warning")
    task = db.execute(select(Task).where(Task.task_id == task_id)).scalar_one_or_none()
    if not task:
        return _toast("任务不存在", "error")
    if task.status == "done":
        return _toast(f"#{task_id} 已是完成状态", "info")
    task.status = "done"
    task.completed_at = datetime.utcnow()
    db.commit()
    return _toast(f"已完成: #{task_id} {task.title[:24]}", "success")


def _handle_morning_ack(db: Session, value: dict, operator: str | None) -> dict:
    task_id = value.get("task_id")
    act = value.get("act")
    if not task_id or not act:
        return _toast("参数不完整", "warning")
    task = db.execute(select(Task).where(Task.task_id == task_id)).scalar_one_or_none()
    if not task:
        return _toast("任务不存在", "error")

    now = datetime.utcnow()
    if act == "ack":
        if task.received_at is None:
            task.received_at = now
        if task.status == "todo":
            task.status = "in_progress"
        db.commit()
        return _toast("已收到, 已记录回执", "success")

    if act == "in_progress":
        if task.received_at is None:
            task.received_at = now
        task.status = "in_progress"
        db.commit()
        return _toast("已标记为进行中", "info")

    if act == "near_done":
        if task.received_at is None:
            task.received_at = now
        task.status = "in_progress"
        db.commit()
        return _toast("已记录: 即将完成", "success")

    if act == "need_help":
        if task.received_at is None:
            task.received_at = now
        task.status = "blocked"
        db.commit()
        return _toast("已标记为阻塞 + 求支援, admin 会看到", "warning")

    if act == "delay":
        if task.received_at is None:
            task.received_at = now
        db.commit()
        return _toast("已记录延期诉求, 请在系统里调整截止", "info")

    if act == "refuse":
        # AI 弄错了, 直接 cancel 这个任务
        task.status = "cancelled"
        db.commit()
        return _toast("已取消该任务", "info")

    return _toast(f"未识别动作: {act}", "warning")
