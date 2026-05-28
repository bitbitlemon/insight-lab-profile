"""penalties: 扣分录入 (admin only).

kind ∈ deadline_minor / deadline_major / data_fraud / no_show / violation
custom_amount: admin 可自定 (覆盖预设)
"""
from __future__ import annotations
from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import require_admin
from app.models import Member, PointsLedger
from app.services.points_service import write_penalty_ledger
from app.services.points_rules import penalty_amount

router = APIRouter(prefix="/api/penalties", tags=["penalties"])


class PenaltySubmit(BaseModel):
    member_open_id: str
    kind: Literal["deadline_minor", "deadline_major", "data_fraud", "no_show", "violation"]
    custom_amount: float | None = Field(None, ge=0, le=500, description="自定扣分(正数), 不传走预设")
    reason: str = Field(..., min_length=2, max_length=500)
    occurred_on: date


class PenaltySubmitOut(BaseModel):
    ledger_id: int
    final_points: float


@router.get("/preview")
def preview(kind: str, custom_amount: float | None = None, _: Member = Depends(require_admin)):
    return {"points": penalty_amount(kind, custom_amount)}


@router.post("", response_model=PenaltySubmitOut, status_code=201)
def submit_penalty(
    payload: PenaltySubmit,
    db: Session = Depends(get_db),
    user: Member = Depends(require_admin),
):
    pts = penalty_amount(payload.kind, payload.custom_amount)
    if pts >= 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "扣分量需为负, 检查 kind/custom_amount")
    next_source_id = (db.query(PointsLedger).filter_by(source_type="penalty").count() or 0) + 1
    try:
        write_penalty_ledger(
            db,
            source_id=next_source_id,
            member_open_id=payload.member_open_id,
            kind=payload.kind,
            custom_amount=payload.custom_amount,
            reason=payload.reason,
            occurred_on=payload.occurred_on,
            submitted_by=user.open_id,
        )
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, f"写入失败: {e}") from e
    row = (
        db.query(PointsLedger)
        .filter_by(source_type="penalty", source_id=next_source_id)
        .order_by(PointsLedger.ledger_id.desc())
        .first()
    )
    if row is None:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "ledger 未写入")
    return PenaltySubmitOut(ledger_id=row.ledger_id, final_points=row.final_points)
