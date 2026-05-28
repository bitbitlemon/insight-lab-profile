"""advising: 师生指导关系 CRUD + Base 写穿透 (admin only)."""
from __future__ import annotations
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.deps import get_current_user, require_admin
from app.models import Advising, Member
from app.schemas.advising import AdvisingCreate, AdvisingRead, AdvisingUpdate
from app.schemas.common import PageResponse
from app.services.sync import delete_record_from_base, push_record_to_base

router = APIRouter(prefix="/api/advising", tags=["advising"])


async def _push(data: dict[str, Any], record_id: str | None = None) -> str | None:
    if not settings.lark_table_advising:
        return record_id
    record = await push_record_to_base(settings.lark_table_advising, data, record_id=record_id)
    return record.get("record_id") or record_id


@router.get("", response_model=PageResponse[AdvisingRead])
def list_advising(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    student_open_id: str | None = None,
    advisor_open_id: str | None = None,
    related_open_id: str | None = Query(None, description="同时匹配 student 或 advisor"),
    db: Session = Depends(get_db),
    _: Member = Depends(get_current_user),
):
    stmt = select(Advising)
    count_stmt = select(func.count()).select_from(Advising)
    if related_open_id:
        cond = or_(Advising.student_open_id == related_open_id,
                   Advising.advisor_open_id == related_open_id)
        stmt = stmt.where(cond); count_stmt = count_stmt.where(cond)
    if student_open_id:
        stmt = stmt.where(Advising.student_open_id == student_open_id)
        count_stmt = count_stmt.where(Advising.student_open_id == student_open_id)
    if advisor_open_id:
        stmt = stmt.where(Advising.advisor_open_id == advisor_open_id)
        count_stmt = count_stmt.where(Advising.advisor_open_id == advisor_open_id)
    stmt = stmt.order_by(Advising.start_date.desc()).offset((page - 1) * page_size).limit(page_size)
    rows = db.execute(stmt).scalars().all()
    total = db.execute(count_stmt).scalar_one()
    return PageResponse[AdvisingRead](items=[AdvisingRead.model_validate(r) for r in rows],
                                      total=total, page=page, page_size=page_size)


@router.get("/{advising_id}", response_model=AdvisingRead)
def get_advising(advising_id: int, db: Session = Depends(get_db), _: Member = Depends(get_current_user)):
    row = db.get(Advising, advising_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "advising not found")
    return AdvisingRead.model_validate(row)


@router.post("", response_model=AdvisingRead, status_code=201)
async def create_advising(payload: AdvisingCreate, db: Session = Depends(get_db),
                          _: Member = Depends(require_admin)):
    data = payload.model_dump(exclude_unset=True)
    try:
        data["base_record_id"] = await _push(data, record_id=data.get("base_record_id"))
        row = Advising(**data)
        db.add(row); db.commit(); db.refresh(row)
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "advising conflict") from e
    except Exception as e:
        db.rollback()
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"failed to sync advising: {e}") from e
    return AdvisingRead.model_validate(row)


@router.patch("/{advising_id}", response_model=AdvisingRead)
async def update_advising(advising_id: int, payload: AdvisingUpdate,
                          db: Session = Depends(get_db),
                          _: Member = Depends(require_admin)):
    row = db.get(Advising, advising_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "advising not found")
    update = payload.model_dump(exclude_unset=True)
    if not update:
        return AdvisingRead.model_validate(row)
    next_state = AdvisingRead.model_validate(row).model_dump(); next_state.update(update)
    try:
        next_id = await _push(next_state, record_id=row.base_record_id)
        if next_id:
            row.base_record_id = next_id
        for k, v in update.items():
            setattr(row, k, v)
        db.commit(); db.refresh(row)
    except Exception as e:
        db.rollback()
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"failed to sync advising: {e}") from e
    return AdvisingRead.model_validate(row)


@router.delete("/{advising_id}", status_code=204)
async def delete_advising(advising_id: int, db: Session = Depends(get_db),
                          _: Member = Depends(require_admin)):
    row = db.get(Advising, advising_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "advising not found")
    try:
        if row.base_record_id and settings.lark_table_advising:
            await delete_record_from_base(settings.lark_table_advising, row.base_record_id)
        db.delete(row); db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"failed to delete advising: {e}") from e
