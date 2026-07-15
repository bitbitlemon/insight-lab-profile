"""飞书任务 (Task v2) 同步: 系统内任务的创建/完成/删除同步到飞书任务应用。

设计原则: 尽力而为, 任何失败只记日志绝不阻塞业务; 无凭据/开关关闭时静默跳过。
"""
from __future__ import annotations

import logging
import time
from datetime import date, datetime

import httpx

from app.config import settings

_log = logging.getLogger(__name__)
_BASE = "https://open.feishu.cn/open-apis"
_token_cache: dict[str, object] = {"token": None, "expires_at": 0.0}


def _enabled() -> bool:
    return bool(
        getattr(settings, "lark_task_sync_enabled", False)
        and settings.lark_app_id
        and settings.lark_app_secret
    )


def _tenant_token() -> str | None:
    now = time.time()
    if _token_cache["token"] and now < float(_token_cache["expires_at"]) - 60:
        return str(_token_cache["token"])
    try:
        r = httpx.post(
            f"{_BASE}/auth/v3/tenant_access_token/internal",
            json={"app_id": settings.lark_app_id, "app_secret": settings.lark_app_secret},
            timeout=10,
        )
        data = r.json()
        if data.get("code") != 0:
            _log.warning("lark task: token failed code=%s msg=%s", data.get("code"), data.get("msg"))
            return None
        _token_cache["token"] = data["tenant_access_token"]
        _token_cache["expires_at"] = now + float(data.get("expire", 3600))
        return str(_token_cache["token"])
    except Exception:
        _log.exception("lark task: token request error")
        return None


def _due_payload(due) -> dict | None:
    if not due:
        return None
    if isinstance(due, datetime):
        ts = int(due.timestamp() * 1000)
        return {"timestamp": str(ts), "is_all_day": False}
    if isinstance(due, date):
        ts = int(datetime(due.year, due.month, due.day, 18, 0).timestamp() * 1000)
        return {"timestamp": str(ts), "is_all_day": True}
    return None


def create_lark_task(
    summary: str,
    description: str | None = None,
    due=None,
    assignee_open_id: str | None = None,
    follower_open_ids: list[str] | None = None,
) -> str | None:
    """创建飞书任务, 返回 task guid; 失败/未启用返回 None。"""
    if not _enabled():
        return None
    token = _tenant_token()
    if not token:
        return None
    body: dict = {"summary": summary[:1000]}
    if description:
        body["description"] = description[:3000]
    due_payload = _due_payload(due)
    if due_payload:
        body["due"] = due_payload
    members = []
    if assignee_open_id:
        members.append({"id": assignee_open_id, "type": "user", "role": "assignee"})
    for oid in follower_open_ids or []:
        if oid and oid != assignee_open_id:
            members.append({"id": oid, "type": "user", "role": "follower"})
    if members:
        body["members"] = members
    try:
        r = httpx.post(
            f"{_BASE}/task/v2/tasks",
            params={"user_id_type": "open_id"},
            headers={"Authorization": f"Bearer {token}"},
            json=body,
            timeout=15,
        )
        data = r.json()
        if data.get("code") != 0:
            _log.warning("lark task create failed code=%s msg=%s", data.get("code"), data.get("msg"))
            return None
        guid = (data.get("data") or {}).get("task", {}).get("guid")
        _log.info("lark task created guid=%s summary=%s", guid, summary[:50])
        return guid
    except Exception:
        _log.exception("lark task create error")
        return None


def set_lark_task_completed(guid: str | None, completed: bool) -> bool:
    """同步完成状态: completed=True 标记完成, False 重新打开。"""
    if not guid or not _enabled():
        return False
    token = _tenant_token()
    if not token:
        return False
    completed_at = str(int(time.time() * 1000)) if completed else "0"
    try:
        r = httpx.patch(
            f"{_BASE}/task/v2/tasks/{guid}",
            params={"user_id_type": "open_id"},
            headers={"Authorization": f"Bearer {token}"},
            json={"task": {"completed_at": completed_at}, "update_fields": ["completed_at"]},
            timeout=15,
        )
        data = r.json()
        if data.get("code") != 0:
            _log.warning("lark task complete failed guid=%s code=%s msg=%s", guid, data.get("code"), data.get("msg"))
            return False
        return True
    except Exception:
        _log.exception("lark task complete error guid=%s", guid)
        return False


def delete_lark_task(guid: str | None) -> bool:
    if not guid or not _enabled():
        return False
    token = _tenant_token()
    if not token:
        return False
    try:
        r = httpx.delete(
            f"{_BASE}/task/v2/tasks/{guid}",
            headers={"Authorization": f"Bearer {token}"},
            timeout=15,
        )
        data = r.json()
        if data.get("code") != 0:
            _log.warning("lark task delete failed guid=%s code=%s msg=%s", guid, data.get("code"), data.get("msg"))
            return False
        return True
    except Exception:
        _log.exception("lark task delete error guid=%s", guid)
        return False
