"""industrial: 产业积分录入.

scene ∈ contract / monthly_revenue / horizontal / startup
"""
from __future__ import annotations
from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import require_admin
from app.models import Member, PointsLedger
from app.services.points_service import write_industrial_ledger
from app.services.points_rules import DevRole, amount_curve_points

router = APIRouter(prefix="/api/industrial", tags=["industrial"])


class DevMemberSubmit(BaseModel):
    member_open_id: str = Field(..., min_length=1)
    role: DevRole


class IndustrialSubmit(BaseModel):
    members: list[DevMemberSubmit] = Field(..., min_length=1, max_length=20)
    amount_yuan: float = Field(..., gt=0, le=1e10)
    scene: Literal["contract", "monthly_revenue", "horizontal", "startup"]
    occurred_on: date
    note: str | None = Field(None, max_length=200)


class DevAllocationOut(BaseModel):
    member_open_id: str
    points: float


class IndustrialSubmitOut(BaseModel):
    ledger_ids: list[int]
    total_points: float
    allocations: list[DevAllocationOut]


@router.get("/preview")
def preview(amount_yuan: float, _: Member = Depends(require_admin)):
    """产业积分预估: 金额走 v4 对数压缩曲线 (锚点 3 万 = 100 分)。"""
    return {"points": amount_curve_points(amount_yuan)}


@router.post("", response_model=IndustrialSubmitOut, status_code=201)
def submit_industrial(
    payload: IndustrialSubmit,
    db: Session = Depends(get_db),
    user: Member = Depends(require_admin),
):
    member_ids = [item.member_open_id for item in payload.members]
    if len(member_ids) != len(set(member_ids)):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "团队成员不能重复")

    next_source_id = (
        db.query(func.max(PointsLedger.source_id)).filter_by(source_type="industrial").scalar() or 0
    ) + 1
    try:
        write_industrial_ledger(
            db,
            source_id=next_source_id,
            members=[(item.member_open_id, item.role) for item in payload.members],
            amount_yuan=payload.amount_yuan,
            scene=payload.scene,
            occurred_on=payload.occurred_on,
            note=payload.note,
            submitted_by=user.open_id,
        )
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, f"写入失败: {e}") from e
    rows = (
        db.query(PointsLedger)
        .filter_by(source_type="industrial", source_id=next_source_id)
        .order_by(PointsLedger.ledger_id)
        .all()
    )
    if not rows:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "ledger 未写入")
    return IndustrialSubmitOut(
        ledger_ids=[row.ledger_id for row in rows],
        total_points=float(rows[0].base_points),
        allocations=[
            DevAllocationOut(member_open_id=row.member_open_id, points=float(row.final_points))
            for row in rows
        ],
    )
