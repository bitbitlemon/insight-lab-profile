from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.services.focus_card_actions import handle_focus_card_action, success_toast
from app.services.chat_card_actions import handle_chat_intent_card_action
from app.services.lark_im import send_text
from app.models import Project
from app.services.ai_chat_ingest import (
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

router = APIRouter(prefix="/api/lark", tags=["lark-callbacks"])


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


def _verify_token(payload: dict[str, Any]) -> None:
    expected = settings.lark_verification_token
    if not expected:
        return
    token = _deep_get(payload, "token", "header.token")
    if token != expected:
        raise HTTPException(403, "invalid lark token")


def _is_group_chat_type(chat_type: str | None) -> bool:
    return (chat_type or "").lower() in {"group", "chat"}


def _send_ai_chat_archive_feedback(db: Session, submission) -> None:
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


@router.post("/card-callback")
async def lark_card_callback(request: Request, db: Session = Depends(get_db)):
    payload = await request.json()
    if payload.get("type") == "url_verification" and payload.get("challenge"):
        return {"challenge": payload["challenge"]}
    _verify_token(payload)
    # dispatch by value.kind (chat intent cards) before falling back to focus card handler
    _val = _deep_get(payload, "event.action.value", "action.value", "event.value", "value") or {}
    if isinstance(_val, dict) and _val.get("kind") in ("complete_confirm", "quick_done", "morning_ack"):
        try:
            return handle_chat_intent_card_action(payload, db)
        except Exception:
            return success_toast("处理失败, 请稍后重试")
    try:
        return handle_focus_card_action(payload, db)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except LookupError as exc:
        raise HTTPException(404, str(exc))
    except PermissionError:
        return success_toast("只能由接收人本人确认")
    except Exception:
        return success_toast("处理失败，请稍后重试")


@router.post("/event-callback")
async def lark_event_callback(request: Request, db: Session = Depends(get_db)):
    payload = await request.json()
    if payload.get("type") == "url_verification" and payload.get("challenge"):
        return {"challenge": payload["challenge"]}
    _verify_token(payload)

    event_type = _deep_get(payload, "header.event_type", "event.type", "type") or ""
    message_type = _deep_get(payload, "event.message.message_type", "message.message_type") or ""
    if event_type and event_type not in ("im.message.receive_v1", "message"):
        return {"ok": True, "ignored": event_type}
    if message_type and message_type not in ("text", "file"):
        return {"ok": True, "ignored": message_type}

    text = extract_lark_message_text(payload)
    source_doc_url = None
    sender_open_id = extract_lark_sender_open_id(payload)
    chat_id = extract_lark_chat_id(payload)
    chat_type = extract_lark_chat_type(payload)
    message_id = extract_lark_message_id(payload)
    if _is_group_chat_type(chat_type):
        return {"ok": True, "ignored": "group_message"}
    if not text and message_type == "file":
        attachment = extract_lark_text_file_attachment(payload)
        if not attachment:
            return {"ok": True, "ignored": "unsupported_file"}
        text = download_lark_text_file(attachment)
    if text:
        source_doc_url = extract_lark_doc_url(text)
        if source_doc_url:
            try:
                text = fetch_lark_doc_text(source_doc_url)
            except Exception:
                _send_ai_chat_processing_feedback(
                    chat_id,
                    sender_open_id,
                    "云文档读取失败。请确认小卷有该文档访问权限，或把内容复制到 .md/.txt 后发送。",
                    f"ai-chat-doc-fetch-failed-{message_id or source_doc_url}",
                )
                return {"ok": True, "ignored": "doc_fetch_failed"}
    if not text:
        return {"ok": True, "ignored": "empty_text"}
    try:
        submission = ingest_ai_chat_submission(
            db,
            raw_text=text,
            sender_open_id=sender_open_id,
            message_id=message_id,
            chat_id=chat_id,
            source_doc_url=source_doc_url,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    _send_ai_chat_archive_feedback(db, submission)
    if source_doc_url and not submission.applied_log_id:
        _send_ai_chat_processing_feedback(
            chat_id,
            sender_open_id,
            "已读取云文档，但暂未匹配到项目。请在文档或消息里补充项目名，或加 project:项目ID 后重试。",
            f"ai-chat-doc-unmatched-{submission.submission_id}",
        )
    return {
        "ok": True,
        "submission_id": submission.submission_id,
        "matched_project_id": submission.matched_project_id,
        "confidence": submission.confidence,
        "status": submission.status,
        "applied_log_id": submission.applied_log_id,
    }
