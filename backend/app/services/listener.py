"""
飞书事件 WebSocket 监听 (lark-cli event +subscribe subprocess + asyncio readline)

监听: vc.meeting.meeting_ended_v1, calendar.calendar.event_changed_v4, user_status_change
触发: 妙记同步 + 日历事件双向同步
"""
from __future__ import annotations
import asyncio
import json
import logging
from typing import Any
from ..db import SessionLocal
from .minutes_sync import run_meeting_sync
from .calendar_sync import handle_calendar_event_change
from .focus_card_actions import handle_focus_card_action
from .lark_user_status import handle_lark_user_status_change

LARK_CLI = "/home/ubuntu/.npm-global/bin/lark-cli"
EVENT_TYPES = "vc.meeting.meeting_ended_v1,calendar.calendar.event_changed_v4,card.action.trigger,user_status_change"

log = logging.getLogger("listener")

_proc: asyncio.subprocess.Process | None = None
_task: asyncio.Task | None = None


async def _handle_meeting_ended(payload: dict) -> None:
    meeting = payload.get("meeting") or {}
    meeting_id = meeting.get("id") or meeting.get("meeting_id") or payload.get("meeting_id")
    if not meeting_id:
        log.warning("meeting event without id: %s", str(payload)[:200])
        return
    log.info("handling meeting_ended meeting_id=%s", meeting_id)
    db = SessionLocal()
    try:
        result = await asyncio.get_event_loop().run_in_executor(
            None, lambda: run_meeting_sync(db, meeting_id=meeting_id)
        )
        log.info("minute sync result: %s", result)
    except Exception as e:
        log.exception("minute sync failed: %s", e)
    finally:
        db.close()


async def _handle_calendar_changed(payload: dict) -> None:
    log.info("handling calendar event_changed: %s", str(payload)[:200])
    db = SessionLocal()
    try:
        result = await asyncio.get_event_loop().run_in_executor(
            None, lambda: handle_calendar_event_change(db, payload)
        )
        log.info("calendar sync: %s", result)
    except Exception as e:
        log.exception("calendar sync failed: %s", e)
    finally:
        db.close()


async def _handle_card_action(payload: dict) -> None:
    log.info("handling card action: %s", str(payload)[:300])
    db = SessionLocal()
    try:
        result = await asyncio.get_event_loop().run_in_executor(
            None, lambda: handle_focus_card_action({"event": payload}, db)
        )
        log.info("card action result: %s", result)
    except Exception as e:
        log.exception("card action failed: %s", e)
    finally:
        db.close()


async def _handle_user_status_change(payload: dict) -> None:
    log.info("handling user status change: %s", str(payload)[:300])
    db = SessionLocal()
    try:
        result = await asyncio.get_event_loop().run_in_executor(
            None, lambda: handle_lark_user_status_change(db, payload)
        )
        log.info("user status synced open_id=%s", result)
    except Exception as e:
        log.exception("user status sync failed: %s", e)
    finally:
        db.close()


async def _handle_event(event: dict) -> None:
    et = event.get("header", {}).get("event_type") or event.get("event_type")
    if not et:
        return
    payload = event.get("event", {}) or event.get("payload", {})
    if et == "vc.meeting.meeting_ended_v1":
        await _handle_meeting_ended(payload)
    elif et == "calendar.calendar.event_changed_v4":
        await _handle_calendar_changed(payload)
    elif et == "card.action.trigger":
        await _handle_card_action(payload)
    elif et in ("user_status_change", "contact.user_status_change_v1", "contact.user_status.changed_v1"):
        await _handle_user_status_change(payload)
    else:
        log.debug("ignored event_type=%s", et)


async def _listen_loop() -> None:
    global _proc
    while True:
        try:
            _proc = await asyncio.create_subprocess_exec(
                LARK_CLI, "event", "+subscribe",
                "--event-types", EVENT_TYPES,
                "--as", "bot",
                "--quiet", "--force",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            log.info("listener started pid=%s event-types=%s", _proc.pid, EVENT_TYPES)
            assert _proc.stdout is not None
            async for line in _proc.stdout:
                try:
                    event = json.loads(line.decode("utf-8").strip())
                    await _handle_event(event)
                except json.JSONDecodeError:
                    continue
                except Exception as e:
                    log.exception("event handler crashed: %s", e)
            log.warning("lark-cli event subprocess exited, restarting in 5s")
        except Exception as e:
            log.exception("listener crashed: %s, restarting in 10s", e)
        finally:
            if _proc and _proc.returncode is None:
                _proc.terminate()
                try:
                    await asyncio.wait_for(_proc.wait(), timeout=5)
                except asyncio.TimeoutError:
                    _proc.kill()
            _proc = None
        await asyncio.sleep(5)


def start_listener() -> None:
    global _task
    if _task and not _task.done():
        return
    loop = asyncio.get_event_loop()
    _task = loop.create_task(_listen_loop(), name="lark_event_listener")


async def stop_listener() -> None:
    global _task, _proc
    if _proc and _proc.returncode is None:
        _proc.terminate()
        try:
            await asyncio.wait_for(_proc.wait(), timeout=5)
        except asyncio.TimeoutError:
            _proc.kill()
    if _task and not _task.done():
        _task.cancel()
        try:
            await _task
        except asyncio.CancelledError:
            pass
