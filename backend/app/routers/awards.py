"""awards: 奖项/认证证书/软著 CRUD + Base 写穿透."""
from __future__ import annotations
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.deps import get_current_user
from app.models import Award, Member
from app.schemas.awards import AwardCreate, AwardRead, AwardUpdate
from app.schemas.common import PageResponse
from app.services.sync import delete_record_from_base, push_record_to_base
from app.services.points_service import try_write_award_as_ip

router = APIRouter(prefix="/api/awards", tags=["awards"])


def _is_admin(user: Member) -> bool:
    return user.role == "admin"


async def _push(data: dict[str, Any], record_id: str | None = None) -> str | None:
    if not settings.lark_table_awards:
        return record_id
    record = await push_record_to_base(settings.lark_table_awards, data, record_id=record_id)
    return record.get("record_id") or record_id


def _award_fields_for_base(a: Award) -> dict:
    """scheduler 回填用."""
    return {
        "recipient_open_id": a.recipient_open_id or "",
        "name": a.name or "",
        "level": a.level or "",
        "category": a.category or "",
        "issuer": a.issuer or "",
        "award_date": a.award_date.isoformat() if a.award_date else None,
        "amount": float(a.amount or 0),
        "certificate_url": a.certificate_url or "",
        "description": a.description or "",
    }


def _can_edit(award: Award, user: Member) -> bool:
    return _is_admin(user) or award.created_by == user.open_id or award.recipient_open_id == user.open_id


@router.get("", response_model=PageResponse[AwardRead])
def list_awards(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    recipient_open_id: str | None = None,
    category: str | None = None,
    level: str | None = None,
    db: Session = Depends(get_db),
    _: Member = Depends(get_current_user),
):
    stmt = select(Award)
    count_stmt = select(func.count()).select_from(Award)
    for col, val in [
        (Award.recipient_open_id, recipient_open_id),
        (Award.category, category),
        (Award.level, level),
    ]:
        if val:
            stmt = stmt.where(col == val)
            count_stmt = count_stmt.where(col == val)
    stmt = stmt.order_by(Award.award_date.desc()).offset((page - 1) * page_size).limit(page_size)
    rows = db.execute(stmt).scalars().all()
    total = db.execute(count_stmt).scalar_one()
    return PageResponse[AwardRead](items=[AwardRead.model_validate(r) for r in rows],
                                   total=total, page=page, page_size=page_size)


@router.get("/{award_id}", response_model=AwardRead)
def get_award(award_id: int, db: Session = Depends(get_db), _: Member = Depends(get_current_user)):
    row = db.get(Award, award_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "award not found")
    return AwardRead.model_validate(row)


@router.post("", response_model=AwardRead, status_code=201)
async def create_award(
    payload: AwardCreate,
    db: Session = Depends(get_db),
    user: Member = Depends(get_current_user),
):
    data = payload.model_dump(exclude_unset=True)
    data.setdefault("created_by", user.open_id)
    try:
        data["base_record_id"] = await _push(data, record_id=data.get("base_record_id"))
        row = Award(**data)
        db.add(row); db.flush()
        try_write_award_as_ip(
            db, award_id=row.award_id, recipient_open_id=row.recipient_open_id,
            category=row.category, level=row.level, name=row.name,
            award_date=row.award_date, submitted_by=user.open_id,
        )
        db.commit(); db.refresh(row)
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "award create conflict") from e
    except Exception as e:
        db.rollback()
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"failed to sync award: {e}") from e
    return AwardRead.model_validate(row)


@router.patch("/{award_id}", response_model=AwardRead)
async def update_award(
    award_id: int,
    payload: AwardUpdate,
    db: Session = Depends(get_db),
    user: Member = Depends(get_current_user),
):
    row = db.get(Award, award_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "award not found")
    if not _can_edit(row, user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "creator/recipient/admin required")
    update = payload.model_dump(exclude_unset=True)
    if not _is_admin(user):
        update.pop("created_by", None); update.pop("base_record_id", None)
    if not update:
        return AwardRead.model_validate(row)
    next_state = AwardRead.model_validate(row).model_dump()
    next_state.update(update)
    try:
        next_id = await _push(next_state, record_id=row.base_record_id)
        if next_id:
            row.base_record_id = next_id
        for k, v in update.items():
            setattr(row, k, v)
        db.commit(); db.refresh(row)
    except Exception as e:
        db.rollback()
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"failed to sync award: {e}") from e
    return AwardRead.model_validate(row)


@router.delete("/{award_id}", status_code=204)
async def delete_award(
    award_id: int,
    db: Session = Depends(get_db),
    user: Member = Depends(get_current_user),
):
    row = db.get(Award, award_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "award not found")
    if not (_is_admin(user) or row.created_by == user.open_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "creator or admin required")
    try:
        if row.base_record_id and settings.lark_table_awards:
            await delete_record_from_base(settings.lark_table_awards, row.base_record_id)
        db.delete(row); db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"failed to delete award: {e}") from e
