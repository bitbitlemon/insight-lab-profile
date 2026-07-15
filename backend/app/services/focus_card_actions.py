from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from app.models import Member, ProjectMember, Task
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


def _receipt_card(kind: str, title: str, detail_url: str | None, received_at: datetime) -> dict[str, Any]:
    label = "任务已收到" if kind == "task" else "项目已收到"
    actions: list[dict[str, Any]] = [
        {
            "tag": "button",
            "text": {"tag": "plain_text", "content": "已收到"},
            "type": "default",
        }
    ]
    if detail_url:
        actions.append({
            "tag": "button",
            "text": {"tag": "plain_text", "content": "查看详情"},
            "type": "primary",
            "url": detail_url,
        })
    return {
        "config": {"wide_screen_mode": True},
        "header": {
            "template": "green",
            "title": {"tag": "plain_text", "content": label},
        },
        "elements": [
            {"tag": "div", "text": {"tag": "lark_md", "content": f"**{title or label}**"}},
            {"tag": "div", "text": {"tag": "lark_md", "content": f"确认时间: {received_at.strftime('%Y-%m-%d %H:%M')}"}},
            {"tag": "action", "actions": actions},
        ],
    }


def _receipt_response(kind: str, title: str, detail_url: str | None, received_at: datetime) -> dict[str, Any]:
    return {
        "toast": {"type": "success", "content": "已收到"},
        "card": _receipt_card(kind, title, detail_url, received_at),
    }


def _handle_receipt_ack(payload: dict[str, Any], db: Session, value: dict[str, Any]) -> dict[str, Any]:
    kind = str(value.get("kind") or "")
    try:
        target_id = int(value.get("target_id"))
    except Exception as exc:
        raise ValueError("missing target_id") from exc

    operator_open_id = _operator_open_id(payload)
    if not operator_open_id:
        raise LookupError("operator not found")

    now = datetime.utcnow()
    detail_url = str(value.get("detail_url") or "").strip() or None

    if kind == "task":
        task = db.get(Task, target_id)
        if not task:
            raise LookupError("task not found")
        if task.assignee_open_id and task.assignee_open_id != operator_open_id:
            raise PermissionError("operator is not task assignee")
        if not task.received_at:
            task.received_at = now
        if task.status == "todo":
            task.status = "in_progress"
        db.commit()
        return _receipt_response("task", task.title, detail_url, task.received_at or now)

    if kind == "project":
        pm = db.get(ProjectMember, (target_id, operator_open_id))
        if not pm or pm.left_at:
            raise LookupError("project member not found")
        if not pm.received_at:
            pm.received_at = now
            db.commit()
        title = str(value.get("project_name") or f"项目 {target_id}")
        return _receipt_response("project", title, detail_url, pm.received_at or now)

    raise ValueError("unknown receipt kind")


def handle_focus_card_action(payload: dict[str, Any], db: Session) -> dict[str, Any]:
    value = _action_value(payload)
    action = str(value.get("action") or "")
    if action == "receipt_ack":
        return _handle_receipt_ack(payload, db, value)
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
