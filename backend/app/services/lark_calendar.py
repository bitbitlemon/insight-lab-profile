"""飞书日历服务: 通过 lark-cli 子进程调用 (避免维护 user_access_token 复杂性).

调用约束:
- 创建/列日程默认用 bot identity (tenant_access_token); 飞书会创建在应用日历下
- 若需以用户身份发起, lark-cli auth login 用 --as user 已就绪

返回 ok / lark_event_id / error 三元组.
"""
from __future__ import annotations
import json, logging, shutil, subprocess
from datetime import datetime
from typing import Iterable

from app.config import settings

log = logging.getLogger(__name__)


def lark_cli_cmd() -> str:
    """Return the lark-cli executable path used by calendar sync jobs."""
    configured = (getattr(settings, "lark_cli_path", "") or "").strip()
    if configured:
        return configured
    return shutil.which("lark-cli") or "lark-cli"


def _run(args: list[str], timeout: int = 30) -> dict:
    try:
        r = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
        if r.returncode != 0:
            return {"ok": False, "error": r.stderr.strip() or r.stdout.strip() or "non-zero exit"}
        try:
            parsed = json.loads(r.stdout) if r.stdout.strip() else {}
            if isinstance(parsed, dict):
                parsed.setdefault("ok", True)
                return parsed
            return {"ok": True, "data": parsed}
        except Exception:
            return {"ok": True, "raw": r.stdout}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def create_event(
    title: str, start_at: datetime, end_at: datetime,
    description: str | None = None, location: str | None = None,
    attendee_open_ids: Iterable[str] | None = None,
) -> dict:
    """飞书 bot 身份创建日程并邀请参会者. 返回 {ok, event_id, calendar_id, error?}.

    用 bot 写到 app primary 日历, attendee 收到邀请后事件自动出现在其个人日历.
    """
    args = [lark_cli_cmd(), "calendar", "+create",
            "--summary", title,
            "--start", start_at.isoformat(),
            "--end", end_at.isoformat()]
    if description:
        args += ["--description", description]
    if attendee_open_ids:
        ids = [oid for oid in attendee_open_ids if oid]
        if ids:
            args += ["--attendee-ids", ",".join(ids)]
    args += ["--as", "bot"]
    res = _run(args)
    if not res.get("ok"):
        return {"ok": False, "error": res.get("error") or "create failed"}
    data = res.get("data") or {}
    event = (data.get("event") or {}) if isinstance(data, dict) else {}
    event_id = (
        event.get("event_id")
        or (data.get("event_id") if isinstance(data, dict) else None)
        or res.get("event_id")
    )
    calendar_id = (
        event.get("calendar_id")
        or (data.get("calendar_id") if isinstance(data, dict) else None)
        or res.get("calendar_id")
    )
    return {
        "ok": True,
        "event_id": event_id,
        "calendar_id": calendar_id,
    }


APP_PRIMARY_CALENDAR_ID = "feishu.cn_7HWuqeoj2aN6eAqzMAdC1b@group.calendar.feishu.cn"


def delete_event(event_id: str, calendar_id: str | None = None) -> dict:
    cid = calendar_id or APP_PRIMARY_CALENDAR_ID
    params = json.dumps({"calendar_id": cid, "event_id": event_id})
    args = [lark_cli_cmd(), "calendar", "events", "delete",
            "--params", params, "--as", "bot", "--format", "json"]
    res = _run(args)
    return res if isinstance(res, dict) else {"ok": False, "error": "unknown"}


def list_events(
    start_at: datetime, end_at: datetime,
    calendar_id: str | None = None,
) -> list[dict]:
    """拉 app primary 日历事件. 返回原始飞书格式 list."""
    args = [lark_cli_cmd(), "calendar", "+agenda",
            "--start", start_at.isoformat(), "--end", end_at.isoformat(),
            "--as", "bot", "--format", "json"]
    if calendar_id:
        args += ["--calendar-id", calendar_id]
    res = _run(args)
    if not res.get("ok"):
        log.warning("list_events failed: %s", res.get("error"))
        return []
    data = res.get("data") or {}
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        return data.get("items") or []
    return []
