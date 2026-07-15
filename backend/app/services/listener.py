"""
飞书事件 WebSocket 监听 (lark-cli event +subscribe subprocess + asyncio readline)

监听: vc.meeting.meeting_ended_v1, calendar.calendar.event_changed_v4, user_status_change, im.message.receive_v1,attendance.user_task.updated_v1
触发: 妙记同步 + 日历事件双向同步 + AI 聊天记录归档
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
from .lark_im import send_text
from .ai_chat_ingest import (
    download_lark_text_file,
    extract_lark_doc_url,
    extract_lark_chat_id,
    extract_lark_chat_type,
    extract_lark_text_file_attachment,
    extract_lark_message_id,
    extract_lark_message_text,
    extract_lark_sender_open_id,
    fetch_lark_doc_text,
    ingest_ai_chat_submission,
)
from .lark_user_status import handle_lark_user_status_change
from app.models import Project

import os as _os
import shutil as _shutil

def _resolve_lark_cli() -> str:
    for candidate in (
        _os.getenv("LARK_CLI_PATH"),
        "/usr/local/bin/lark-cli",
        "/home/ubuntu/.npm-global/bin/lark-cli",
        "/home/ubuntu/.npm-global/lib/node_modules/@larksuite/cli/bin/lark-cli",
    ):
        if candidate and _os.path.exists(candidate):
            return candidate
    return _shutil.which("lark-cli") or "lark-cli"

LARK_CLI = _resolve_lark_cli()
EVENT_TYPES = "vc.meeting.meeting_ended_v1,calendar.calendar.event_changed_v4,card.action.trigger,user_status_change,im.message.receive_v1,attendance.user_task.updated_v1"

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


def _looks_like_ai_chat_submission(text: str) -> bool:
    lowered = text.lower()
    english_markers = (
        "chatgpt", "claude", "deepseek", "openai", "gpt-", "qwen", "kimi",
        "ai chat", "ai transcript",
    )
    chinese_markers = (
        "ai聊天", "ai 聊天", "ai对话", "ai 对话", "对话总结", "聊天记录",
        "项目:", "项目：", "project:", "project：", "#项目", "豆包", "通义",
        "千问", "深度求索", "月之暗面",
    )
    return any(marker in lowered for marker in english_markers) or any(marker in text for marker in chinese_markers)


def _is_group_chat_type(chat_type: str | None) -> bool:
    return (chat_type or "").lower() in {"group", "chat"}


def _send_ai_chat_archive_feedback(db, submission) -> None:
    if not submission or not submission.applied_log_id or not submission.matched_project_id:
        return
    project = db.get(Project, submission.matched_project_id)
    project_name = project.name if project else f"项目 {submission.matched_project_id}"
    stage = submission.stage or "未识别节点"
    summary = (submission.summary or "已生成项目日志").strip()
    if len(summary) > 36:
        summary = summary[:35].rstrip() + "…"
    text = "\n".join([
        "已录入项目日志",
        f"项目: {project_name}",
        f"节点: {stage}",
        f"摘要: {summary}",
        f"日志ID: {submission.applied_log_id}",
    ])
    key = f"ai-chat-archive-{submission.submission_id}"
    if submission.sender_open_id:
        send_text(submission.sender_open_id, text, idempotency_key=key)


def _send_ai_chat_processing_feedback(chat_id: str | None, sender_open_id: str | None, text: str, key: str) -> None:
    if sender_open_id:
        send_text(sender_open_id, text, idempotency_key=key)


async def _handle_ai_chat_message(payload: dict) -> None:
    wrapped = {"event": payload}
    sender_open_id = extract_lark_sender_open_id(wrapped)
    chat_id = extract_lark_chat_id(wrapped)
    chat_type = extract_lark_chat_type(wrapped)
    message_id = extract_lark_message_id(wrapped)
    if _is_group_chat_type(chat_type):
        log.info("ignored group im.message.receive_v1,attendance.user_task.updated_v1 for Xiaojuan active archival chat_id=%s", chat_id)
        return
    text = extract_lark_message_text(wrapped)
    source_doc_url = None
    if not text:
        attachment = extract_lark_text_file_attachment(wrapped)
        if attachment:
            try:
                text = await asyncio.get_event_loop().run_in_executor(
                    None, lambda: download_lark_text_file(attachment)
                )
            except Exception as e:
                log.exception("lark text file download failed: %s", e)
                return
    if text:
        source_doc_url = extract_lark_doc_url(text)
        if source_doc_url:
            try:
                text = await asyncio.get_event_loop().run_in_executor(
                    None, lambda: fetch_lark_doc_text(source_doc_url)
                )
            except Exception as e:
                log.exception("lark doc fetch failed: %s", e)
                await asyncio.get_event_loop().run_in_executor(
                    None,
                    lambda: _send_ai_chat_processing_feedback(
                        chat_id,
                        sender_open_id,
                        "云文档读取失败。请确认小卷有该文档访问权限，或把内容复制到 .md/.txt 后发送。",
                        f"ai-chat-doc-fetch-failed-{message_id or source_doc_url}",
                    ),
                )
                return
    if not text:
        return
    if not source_doc_url and not _looks_like_ai_chat_submission(text):
        log.debug("ignored im.message.receive_v1,attendance.user_task.updated_v1 without ai transcript marker")
        return

    db = SessionLocal()
    try:
        result = await asyncio.get_event_loop().run_in_executor(
            None,
            lambda: ingest_ai_chat_submission(
                db,
                raw_text=text,
                sender_open_id=sender_open_id,
                message_id=message_id,
                chat_id=chat_id,
                source_doc_url=source_doc_url,
            ),
        )
        log.info(
            "ai chat submission archived submission_id=%s project_id=%s confidence=%.2f status=%s",
            result.submission_id,
            result.matched_project_id,
            result.confidence,
            result.status,
        )
        await asyncio.get_event_loop().run_in_executor(
            None, lambda: _send_ai_chat_archive_feedback(db, result)
        )
        if source_doc_url and not result.applied_log_id:
            await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: _send_ai_chat_processing_feedback(
                    chat_id,
                    sender_open_id,
                    "已读取云文档，但暂未匹配到项目。请在文档或消息里补充项目名，或加 project:项目ID 后重试。",
                    f"ai-chat-doc-unmatched-{result.submission_id}",
                ),
            )
    except Exception as e:
        log.exception("ai chat submission failed: %s", e)
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
    elif et == "im.message.receive_v1,attendance.user_task.updated_v1":
        await _handle_ai_chat_message(payload)
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
