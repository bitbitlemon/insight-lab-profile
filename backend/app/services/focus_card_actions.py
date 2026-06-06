from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from app.models import Member, Task
from app.routers.tasks import _write_focus_project_log, _write_task_audit


def _deep_get(payload: dict[str, Any], *paths: str) -> Any:
    for path in paths:
        cur: Any = payload
        ok = True
        for part in path.split("."):
            if not isinstance(cur, dict) or part not in cur:
                ok = False
                break
            cur = cur[part]
        if ok:
            return cur
    return None


def _operator_open_id(payload: dict[str, Any]) -> str | None:
    return _deep_get(
        payload,
        "open_id",
        "operator.open_id",
        "operator.operator_id.open_id",
        "event.operator.open_id",
        "event.operator.operator_id.open_id",
        "event.operator_id.open_id",
        "event.operator.open_id",
    )


def _action_value(payload: dict[str, Any]) -> dict[str, Any]:
    value = _deep_get(payload, "action.value", "event.action.value", "event.action")
    if isinstance(value, dict) and "value" in value and isinstance(value["value"], dict):
        return value["value"]
    return value if isinstance(value, dict) else {}


def _form_value(payload: dict[str, Any]) -> dict[str, Any]:
    value = _deep_get(
        payload,
        "action.form_value",
        "event.action.form_value",
        "form_value",
        "event.form_value",
    )
    return value if isinstance(value, dict) else {}


def success_toast(content: str) -> dict[str, Any]:
    return {"toast": {"type": "success", "content": content}}


def handle_focus_card_action(payload: dict[str, Any], db: Session) -> dict[str, Any]:
    value = _action_value(payload)
    action = str(value.get("action") or "")
    if action not in {"focus_continue", "focus_stop"}:
        return success_toast("已收到")

    try:
        task_id = int(value.get("task_id"))
    except Exception as exc:
        raise ValueError("missing task_id") from exc
    task = db.get(Task, task_id)
    if not task:
        raise LookupError("task not found")

    open_id = _operator_open_id(payload) or task.assignee_open_id or task.created_by
    member = db.get(Member, open_id)
    if not member and task.assignee_open_id:
        member = db.get(Member, task.assignee_open_id)
    if not member:
        raise LookupError("member not found")

    form = _form_value(payload)
    note = str(form.get("focus_note") or value.get("focus_note") or "").strip()
    screenshot = str(
        form.get("focus_screenshot_url")
        or form.get("screenshot_url")
        or value.get("focus_screenshot_url")
        or value.get("screenshot_url")
        or ""
    ).strip()
    elapsed_minutes = max(0, int(value.get("elapsed_minutes") or 0))
    elapsed_seconds = elapsed_minutes * 60
    now_text = datetime.utcnow().isoformat()

    if action == "focus_continue":
        _write_task_audit(db, member, task, "focus_continue", {
            "elapsed_seconds": elapsed_seconds,
            "note": note,
            "screenshot_url": screenshot,
            "confirmed_at": now_text,
        })
        body_lines = [f"已确认继续专注，当前累计约 {elapsed_minutes} 分钟。"]
        if note:
            body_lines.append(f"记录: {note}")
        if screenshot:
            body_lines.append(f"截图: {screenshot}")
        _write_focus_project_log(db, member, task, f"继续专注: {task.title}", "\n".join(body_lines))
        db.commit()
        return success_toast("已确认继续专注")

    _write_task_audit(db, member, task, "focus_stop", {
        "elapsed_seconds": elapsed_seconds,
        "note": note,
        "screenshot_url": screenshot,
        "confirmed_at": now_text,
    })
    body_lines = [f"结束专注，累计约 {elapsed_minutes} 分钟。"]
    if note:
        body_lines.append(f"记录: {note}")
    if screenshot:
        body_lines.append(f"截图: {screenshot}")
    _write_focus_project_log(db, member, task, f"结束专注: {task.title}", "\n".join(body_lines))
    db.commit()
    return success_toast("已结束专注")
