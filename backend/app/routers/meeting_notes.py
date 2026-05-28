from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.config import settings
from app.db import get_db
from app.deps import get_current_user
from app.models import MeetingNote, Member
from app.schemas.common import PageResponse
from app.schemas.meeting_notes import MeetingNoteCreate, MeetingNoteRead, MeetingNoteUpdate
from app.services.sync import delete_record_from_base, push_record_to_base

router = APIRouter(prefix="/api/meeting_notes", tags=["meeting_notes"])


def _is_admin(user: Member) -> bool:
    return user.role == "admin"


def _note_stmt():
    return select(MeetingNote).options(selectinload(MeetingNote.participants))


async def _push_meeting_note(note_data: dict[str, Any], record_id: str | None = None) -> str | None:
    if not settings.lark_table_meeting_notes:
        return record_id
    record = await push_record_to_base(settings.lark_table_meeting_notes, note_data, record_id=record_id)
    return record.get("record_id") or record_id


def _note_visible(note: MeetingNote, current_user: Member) -> bool:
    return (
        _is_admin(current_user)
        or note.owner_open_id == current_user.open_id
        or note.privacy_level == "public"
    )


@router.get("", response_model=PageResponse[MeetingNoteRead])
def list_meeting_notes(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: Member = Depends(get_current_user),
):
    stmt = _note_stmt()
    count_stmt = select(func.count()).select_from(MeetingNote)

    if not _is_admin(current_user):
        visibility_filter = or_(
            MeetingNote.owner_open_id == current_user.open_id,
            MeetingNote.privacy_level == "public",
        )
        stmt = stmt.where(visibility_filter)
        count_stmt = count_stmt.where(visibility_filter)

    stmt = stmt.order_by(MeetingNote.meeting_date.desc(), MeetingNote.created_at.desc()).offset(
        (page - 1) * page_size
    ).limit(page_size)

    notes = db.execute(stmt).scalars().all()
    total = db.execute(count_stmt).scalar_one()
    items = [MeetingNoteRead.model_validate(note) for note in notes]
    return PageResponse[MeetingNoteRead](items=items, total=total, page=page, page_size=page_size)


@router.get("/{note_id}", response_model=MeetingNoteRead)
def get_meeting_note(
    note_id: int,
    db: Session = Depends(get_db),
    current_user: Member = Depends(get_current_user),
):
    note = db.execute(_note_stmt().where(MeetingNote.note_id == note_id)).scalar_one_or_none()
    if note is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "meeting note not found")
    if not _note_visible(note, current_user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "meeting note not visible")
    return MeetingNoteRead.model_validate(note)


@router.post("", response_model=MeetingNoteRead, status_code=status.HTTP_201_CREATED)
async def create_meeting_note(
    payload: MeetingNoteCreate,
    db: Session = Depends(get_db),
    current_user: Member = Depends(get_current_user),
):
    data = payload.model_dump(exclude_unset=True)
    data["owner_open_id"] = current_user.open_id

    try:
        data["base_record_id"] = await _push_meeting_note(data, record_id=data.get("base_record_id"))
        note = MeetingNote(**data)
        db.add(note)
        db.commit()
        db.refresh(note)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "meeting note create conflict") from exc
    except Exception as exc:
        db.rollback()
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"failed to sync meeting note: {exc}") from exc

    note = db.execute(_note_stmt().where(MeetingNote.note_id == note.note_id)).scalar_one()
    return MeetingNoteRead.model_validate(note)


@router.patch("/{note_id}", response_model=MeetingNoteRead)
async def update_meeting_note(
    note_id: int,
    payload: MeetingNoteUpdate,
    db: Session = Depends(get_db),
    current_user: Member = Depends(get_current_user),
):
    note = db.execute(_note_stmt().where(MeetingNote.note_id == note_id)).scalar_one_or_none()
    if note is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "meeting note not found")
    if note.owner_open_id != current_user.open_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "only owner can update meeting note")

    update_data = payload.model_dump(exclude_unset=True)
    update_data.pop("owner_open_id", None)
    update_data.pop("base_record_id", None)
    if not update_data:
        return MeetingNoteRead.model_validate(note)

    if note.source == "auto_minute" and note.review_status == "draft" and "review_status" not in update_data:
        update_data["review_status"] = "submitted"

    next_state = MeetingNoteRead.model_validate(note).model_dump()
    next_state.update(update_data)
    next_state.pop("participants", None)

    try:
        next_record_id = await _push_meeting_note(next_state, record_id=note.base_record_id)
        if next_record_id:
            note.base_record_id = next_record_id
        for key, value in update_data.items():
            setattr(note, key, value)
        db.commit()
        db.refresh(note)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "meeting note update conflict") from exc
    except Exception as exc:
        db.rollback()
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"failed to sync meeting note: {exc}") from exc

    note = db.execute(_note_stmt().where(MeetingNote.note_id == note_id)).scalar_one()
    return MeetingNoteRead.model_validate(note)


@router.delete("/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_meeting_note(
    note_id: int,
    db: Session = Depends(get_db),
    current_user: Member = Depends(get_current_user),
):
    note = db.execute(_note_stmt().where(MeetingNote.note_id == note_id)).scalar_one_or_none()
    if note is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "meeting note not found")
    if not (_is_admin(current_user) or note.owner_open_id == current_user.open_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "owner or admin required")

    try:
        if note.base_record_id and settings.lark_table_meeting_notes:
            await delete_record_from_base(settings.lark_table_meeting_notes, note.base_record_id)
        db.delete(note)
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"failed to delete meeting note: {exc}") from exc
