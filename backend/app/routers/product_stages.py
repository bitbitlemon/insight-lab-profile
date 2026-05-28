"""product_stages: 产品研发阶段积分录入 (v3 P1).

stage ∈ init / mvp / internal_qa / launch / operating
launch / operating 阶段可附金额 (1 元 = 1 分 加成).
"""
from __future__ import annotations
from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user, require_admin
from app.models import Member, PointsLedger
from app.services.points_service import write_product_stage_ledger
from app.services.points_rules import DevRole, product_stage_points

router = APIRouter(prefix="/api/product_stages", tags=["product_stages"])

Stage = Literal["init", "mvp", "internal_qa", "launch", "operating"]


class DevMemberSubmit(BaseModel):
    member_open_id: str = Field(..., min_length=1)
    role: DevRole


class ProductStageSubmit(BaseModel):
    members: list[DevMemberSubmit] = Field(..., min_length=1, max_length=20)
    stage: Stage
    product_name: str = Field(..., min_length=1, max_length=200)
    amount_yuan: float | None = Field(None, ge=0, le=1e10, description="launch/operating 才生效")
    occurred_on: date


class DevAllocationOut(BaseModel):
    member_open_id: str
    points: float


class ProductStageSubmitOut(BaseModel):
    ledger_ids: list[int]
    total_points: float
    allocations: list[DevAllocationOut]


@router.get("/preview")
def preview(stage: str, amount_yuan: float | None = None, _: Member = Depends(get_current_user)):
    return {"points": product_stage_points(stage, amount_yuan)}


@router.post("", response_model=ProductStageSubmitOut, status_code=201)
def submit_product_stage(
    payload: ProductStageSubmit,
    db: Session = Depends(get_db),
    user: Member = Depends(require_admin),
):
    pts = product_stage_points(payload.stage, payload.amount_yuan)
    if pts <= 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "无效阶段或积分为 0")
    member_ids = [item.member_open_id for item in payload.members]
    if len(member_ids) != len(set(member_ids)):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "团队成员不能重复")

    next_source_id = (
        db.query(func.max(PointsLedger.source_id)).filter_by(source_type="product_stage").scalar() or 0
    ) + 1
    try:
        write_product_stage_ledger(
            db,
            source_id=next_source_id,
            members=[(item.member_open_id, item.role) for item in payload.members],
            stage=payload.stage,
            amount_yuan=payload.amount_yuan,
            product_name=payload.product_name,
            occurred_on=payload.occurred_on,
            submitted_by=user.open_id,
        )
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, f"写入失败: {e}") from e
    rows = (
        db.query(PointsLedger)
        .filter_by(source_type="product_stage", source_id=next_source_id)
        .order_by(PointsLedger.ledger_id)
        .all()
    )
    if not rows:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "ledger 未写入")
    return ProductStageSubmitOut(
        ledger_ids=[row.ledger_id for row in rows],
        total_points=float(rows[0].base_points),
        allocations=[
            DevAllocationOut(member_open_id=row.member_open_id, points=float(row.final_points))
            for row in rows
        ],
    )
