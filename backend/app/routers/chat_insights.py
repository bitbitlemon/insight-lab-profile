"""Chat Insights router: AI 从群聊抽取的待办意图审批 + 触发抽取."""
from __future__ import annotations

import json
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user, require_admin
from app.models import (
    ChatIntentLog,
    Member,
    Project,
    ProjectChat,
    ProjectChatMessage,
    Task,
)
from app.services.chat_intelligence import (
    apply_auto_intents,
    apply_intent,
    extract_intents,
)
from app.services.lark_chat_sync import sync_project_chat

router = APIRouter(prefix="/api/chat-insights", tags=["chat-insights"])


class ChatIntentRead(BaseModel):
    chat_intent_id: int
    project_chat_id: int
    project_id: int
    project_name: str | None = None
    chat_name: str | None = None
    source_message_id: str
    intent_seq: int
    intent_kind: str
    status: str
    confidence: float
    title: str | None = None
    description: str | None = None
    assignee_name_raw: str | None = None
    assignee_open_id: str | None = None
    assignee_name: str | None = None
    due_date: datetime | None = None
    priority: str | None = None
    matched_task_id: int | None = None
    matched_task_title: str | None = None
    reasoning: str | None = None
    model_name: str | None = None
    extracted_at: datetime
    applied_at: datetime | None = None
    applied_task_id: int | None = None
    applied_log_id: int | None = None
    reviewer_open_id: str | None = None
    reviewer_name: str | None = None
    review_note: str | None = None
    source_message_text: str | None = None
    source_sender_name: str | None = None
    source_message_at: datetime | None = None
    source_text: str | None = None

    model_config = {"from_attributes": True, "protected_namespaces": ()}


class ExtractRequest(BaseModel):
    project_chat_id: int
    since_minutes: int | None = 24 * 60
    limit: int = 60
    sync_first: bool = True


class ExtractResponse(BaseModel):
    project_chat_id: int
    synced: dict | None = None
    extracted: dict


class ApproveRequest(BaseModel):
    note: str | None = None
    title_override: str | None = None
    assignee_open_id_override: str | None = None
    due_date_override: datetime | None = None
    priority_override: Literal["low", "medium", "high", "urgent"] | None = None


class RejectRequest(BaseModel):
    note: str | None = None


def _extract_text(content: str | None) -> str:
    if not content:
        return ""
    raw = content.strip()
    try:
        d = json.loads(raw)
    except Exception:
        return raw[:400]
    if isinstance(d, dict) and "text" in d and isinstance(d["text"], str):
        return d["text"][:400]
    return json.dumps(d, ensure_ascii=False)[:400]


def _hydrate(db: Session, row: ChatIntentLog) -> ChatIntentLog:
    return row


def _to_read(db: Session, row: ChatIntentLog) -> ChatIntentRead:
    project = db.get(Project, row.project_id) if row.project_id else None
    chat = db.get(ProjectChat, row.project_chat_id) if row.project_chat_id else None
    msg = db.execute(
        select(ProjectChatMessage).where(
            ProjectChatMessage.project_chat_id == row.project_chat_id,
            ProjectChatMessage.message_id == row.source_message_id,
        )
    ).scalars().first()
    assignee = db.get(Member, row.assignee_open_id) if row.assignee_open_id else None
    reviewer = db.get(Member, row.reviewer_open_id) if row.reviewer_open_id else None
    matched_task = db.get(Task, row.matched_task_id) if row.matched_task_id else None
    return ChatIntentRead(
        chat_intent_id=row.chat_intent_id,
        project_chat_id=row.project_chat_id,
        project_id=row.project_id,
        project_name=project.name if project else None,
        chat_name=chat.chat_name if chat else None,
        source_message_id=row.source_message_id,
        intent_seq=row.intent_seq,
        intent_kind=row.intent_kind,
        status=row.status,
        confidence=row.confidence,
        title=row.title,
        description=row.description,
        assignee_name_raw=row.assignee_name_raw,
        assignee_open_id=row.assignee_open_id,
        assignee_name=assignee.name if assignee else None,
        due_date=row.due_date,
        priority=row.priority,
        matched_task_id=row.matched_task_id,
        matched_task_title=matched_task.title if matched_task else None,
        reasoning=row.reasoning,
        model_name=row.model_name,
        extracted_at=row.extracted_at,
        applied_at=row.applied_at,
        applied_task_id=row.applied_task_id,
        applied_log_id=row.applied_log_id,
        reviewer_open_id=row.reviewer_open_id,
        reviewer_name=reviewer.name if reviewer else None,
        review_note=row.review_note,
        source_message_text=_extract_text(msg.content) if msg else None,
        source_sender_name=msg.sender_name if msg else None,
        source_message_at=msg.message_created_at if msg else None,
        source_text=((msg.content or "")[:500] if msg else None),
    )


@router.get("", response_model=dict)
def list_intents(
    project_id: int | None = Query(None),
    project_chat_id: int | None = Query(None),
    status: str | None = Query(None, description="pending,applied,rejected,auto_applied,cancelled"),
    kind: str | None = Query(None),
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    _: Member = Depends(get_current_user),
):
    q = select(ChatIntentLog).order_by(ChatIntentLog.chat_intent_id.desc())
    if project_id:
        q = q.where(ChatIntentLog.project_id == project_id)
    if project_chat_id:
        q = q.where(ChatIntentLog.project_chat_id == project_chat_id)
    if status:
        statuses = [s.strip() for s in status.split(",") if s.strip()]
        q = q.where(ChatIntentLog.status.in_(statuses))
    if kind:
        q = q.where(ChatIntentLog.intent_kind == kind)
    rows = db.execute(q.limit(limit).offset(offset)).scalars().all()
    items = [_to_read(db, r) for r in rows]
    return {"items": [it.model_dump(mode="json") for it in items]}


@router.get("/{chat_intent_id}", response_model=ChatIntentRead)
def get_intent(
    chat_intent_id: int,
    db: Session = Depends(get_db),
    _: Member = Depends(get_current_user),
):
    row = db.get(ChatIntentLog, chat_intent_id)
    if not row:
        raise HTTPException(404, "intent not found")
    return _to_read(db, row)


@router.post("/{chat_intent_id}/approve", response_model=ChatIntentRead)
def approve_intent(
    chat_intent_id: int,
    body: ApproveRequest,
    db: Session = Depends(get_db),
    user: Member = Depends(require_admin),
):
    row = db.get(ChatIntentLog, chat_intent_id)
    if not row:
        raise HTTPException(404, "intent not found")
    if row.status in ("applied", "auto_applied") and row.applied_task_id:
        raise HTTPException(400, "already applied")
    if row.status in ("rejected", "cancelled"):
        raise HTTPException(400, f"cannot approve from status {row.status}")
    if body.title_override:
        row.title = body.title_override.strip()[:200]
    if body.assignee_open_id_override:
        if not db.get(Member, body.assignee_open_id_override):
            raise HTTPException(400, "assignee not found")
        row.assignee_open_id = body.assignee_open_id_override
    if body.due_date_override is not None:
        row.due_date = body.due_date_override
    if body.priority_override:
        row.priority = body.priority_override
    if body.note:
        row.review_note = body.note[:500]
    row.status = "pending"  # apply_intent 会改成 applied
    db.flush()
    apply_intent(db, row, user.open_id)
    db.refresh(row)
    return _to_read(db, row)


@router.post("/{chat_intent_id}/reject", response_model=ChatIntentRead)
def reject_intent(
    chat_intent_id: int,
    body: RejectRequest,
    db: Session = Depends(get_db),
    user: Member = Depends(require_admin),
):
    row = db.get(ChatIntentLog, chat_intent_id)
    if not row:
        raise HTTPException(404, "intent not found")
    if row.status == "applied":
        raise HTTPException(400, "already applied; cancel instead")
    row.status = "rejected"
    row.reviewer_open_id = user.open_id
    if body.note:
        row.review_note = body.note[:500]
    db.commit()
    return _to_read(db, row)


@router.post("/{chat_intent_id}/cancel", response_model=ChatIntentRead)
def cancel_applied_intent(
    chat_intent_id: int,
    body: RejectRequest,
    db: Session = Depends(get_db),
    user: Member = Depends(require_admin),
):
    row = db.get(ChatIntentLog, chat_intent_id)
    if not row:
        raise HTTPException(404, "intent not found")
    if row.status not in ("applied", "auto_applied"):
        raise HTTPException(400, "only applied/auto_applied can cancel")
    # 撤销: 若是 create_task 且 task 仍 todo, 删除 task; 否则只标 cancelled
    if row.intent_kind == "create_task" and row.applied_task_id:
        task = db.get(Task, row.applied_task_id)
        if task and task.status == "todo" and (task.assignee_open_id == row.assignee_open_id):
            db.delete(task)
    row.status = "cancelled"
    row.reviewer_open_id = user.open_id
    if body.note:
        row.review_note = body.note[:500]
    db.commit()
    return _to_read(db, row)


@router.post("/extract", response_model=ExtractResponse)
def trigger_extract(
    body: ExtractRequest,
    db: Session = Depends(get_db),
    user: Member = Depends(require_admin),
):
    chat = db.get(ProjectChat, body.project_chat_id)
    if not chat:
        raise HTTPException(404, "project_chat not found")
    sync_info = None
    if body.sync_first:
        sync_info = sync_project_chat(db, chat, page_size=50, max_pages=4)
    extracted = extract_intents(
        db, chat, limit=body.limit, since_minutes=body.since_minutes
    )
    apply_auto_intents(db, chat, user.open_id)
    return ExtractResponse(
        project_chat_id=body.project_chat_id,
        synced=sync_info,
        extracted=extracted,
    )


@router.get("/chats/list", response_model=dict)
def list_enabled_chats(
    db: Session = Depends(get_db),
    _: Member = Depends(get_current_user),
):
    rows = db.execute(
        select(ProjectChat).where(ProjectChat.sync_enabled == True)
    ).scalars().all()
    out = []
    for r in rows:
        project = db.get(Project, r.project_id)
        pending = db.execute(
            select(ChatIntentLog).where(
                ChatIntentLog.project_chat_id == r.project_chat_id,
                ChatIntentLog.status == "pending",
            )
        ).scalars().all()
        applied = db.execute(
            select(ChatIntentLog).where(
                ChatIntentLog.project_chat_id == r.project_chat_id,
                ChatIntentLog.status.in_(("applied", "auto_applied")),
            )
        ).scalars().all()
        out.append({
            "project_chat_id": r.project_chat_id,
            "project_id": r.project_id,
            "project_name": project.name if project else None,
            "chat_id": r.chat_id,
            "chat_name": r.chat_name,
            "last_synced_at": r.last_synced_at.isoformat() if r.last_synced_at else None,
            "last_message_at": r.last_message_at.isoformat() if r.last_message_at else None,
            "pending_count": len(pending),
            "applied_count": len(applied),
        })
    return {"items": out}
