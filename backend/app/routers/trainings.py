"""trainings: 培训/学习记录 CRUD + Base 写穿透."""
from __future__ import annotations
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.deps import get_current_user
from app.models import Member, Training
from app.schemas.common import PageResponse
from app.schemas.trainings import TrainingCreate, TrainingRead, TrainingUpdate
from app.services.sync import delete_record_from_base, push_record_to_base

router = APIRouter(prefix="/api/trainings", tags=["trainings"])


def _is_admin(user: Member) -> bool:
    return user.role == "admin"


async def _push(data: dict[str, Any], record_id: str | None = None) -> str | None:
    if not settings.lark_table_trainings:
        return record_id
    record = await push_record_to_base(settings.lark_table_trainings, data, record_id=record_id)
    return record.get("record_id") or record_id


def _training_fields_for_base(t: Training) -> dict:
    """scheduler 回填用."""
    return {
        "participant_open_id": t.participant_open_id or "",
        "name": t.name or "",
        "type": t.type or "",
        "organizer": t.organizer or "",
        "start_date": t.start_date.isoformat() if t.start_date else None,
        "end_date": t.end_date.isoformat() if t.end_date else None,
        "location": t.location or "",
        "hours": float(t.hours or 0),
        "has_certificate": bool(t.has_certificate),
        "certificate_url": t.certificate_url or "",
        "reflection": t.reflection or "",
    }


@router.get("", response_model=PageResponse[TrainingRead])
def list_trainings(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    participant_open_id: str | None = None,
    type_filter: str | None = Query(None, alias="type"),
    db: Session = Depends(get_db),
    _: Member = Depends(get_current_user),
):
    stmt = select(Training)
    count_stmt = select(func.count()).select_from(Training)
    for col, val in [(Training.participant_open_id, participant_open_id),
                     (Training.type, type_filter)]:
        if val:
            stmt = stmt.where(col == val)
            count_stmt = count_stmt.where(col == val)
    stmt = stmt.order_by(Training.start_date.desc()).offset((page - 1) * page_size).limit(page_size)
    rows = db.execute(stmt).scalars().all()
    total = db.execute(count_stmt).scalar_one()
    return PageResponse[TrainingRead](items=[TrainingRead.model_validate(r) for r in rows],
                                      total=total, page=page, page_size=page_size)


@router.get("/{training_id}", response_model=TrainingRead)
def get_training(training_id: int, db: Session = Depends(get_db), _: Member = Depends(get_current_user)):
    row = db.get(Training, training_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "training not found")
    return TrainingRead.model_validate(row)


@router.post("", response_model=TrainingRead, status_code=201)
async def create_training(payload: TrainingCreate, db: Session = Depends(get_db),
                          user: Member = Depends(get_current_user)):
    data = payload.model_dump(exclude_unset=True)
    if not _is_admin(user) and data.get("participant_open_id") != user.open_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "can only create training for self")
    try:
        data["base_record_id"] = await _push(data, record_id=data.get("base_record_id"))
        row = Training(**data)
        db.add(row); db.commit(); db.refresh(row)
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "training create conflict") from e
    except Exception as e:
        db.rollback()
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"failed to sync training: {e}") from e
    return TrainingRead.model_validate(row)


@router.patch("/{training_id}", response_model=TrainingRead)
async def update_training(training_id: int, payload: TrainingUpdate,
                          db: Session = Depends(get_db),
                          user: Member = Depends(get_current_user)):
    row = db.get(Training, training_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "training not found")
    if not (_is_admin(user) or row.participant_open_id == user.open_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "participant or admin required")
    update = payload.model_dump(exclude_unset=True)
    if not _is_admin(user):
        update.pop("base_record_id", None); update.pop("participant_open_id", None)
    if not update:
        return TrainingRead.model_validate(row)
    next_state = TrainingRead.model_validate(row).model_dump(); next_state.update(update)
    try:
        next_id = await _push(next_state, record_id=row.base_record_id)
        if next_id:
            row.base_record_id = next_id
        for k, v in update.items():
            setattr(row, k, v)
        db.commit(); db.refresh(row)
    except Exception as e:
        db.rollback()
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"failed to sync training: {e}") from e
    return TrainingRead.model_validate(row)


@router.delete("/{training_id}", status_code=204)
async def delete_training(training_id: int, db: Session = Depends(get_db),
                          user: Member = Depends(get_current_user)):
    row = db.get(Training, training_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "training not found")
    if not (_is_admin(user) or row.participant_open_id == user.open_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "participant or admin required")
    try:
        if row.base_record_id and settings.lark_table_trainings:
            await delete_record_from_base(settings.lark_table_trainings, row.base_record_id)
        db.delete(row); db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"failed to delete training: {e}") from e
