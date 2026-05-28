"""grants: 项目申报积分录入 (v3).

无独立数据表 (project 表不区分级别), 直接通过本路由把申报/立项写入 ledger.
typical 用法: 管理员/部门负责人提交记录, 自动入 ledger.
"""
from __future__ import annotations
from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user, require_admin
from app.models import Member, PointsLedger
from app.services.points_service import write_grant_ledger
from app.services.points_rules import grant_points

router = APIRouter(prefix="/api/grants", tags=["grants"])


class GrantSubmit(BaseModel):
    member_open_id: str = Field(..., description="积分归属人 open_id")
    level: Literal["national", "provincial", "school", "horizontal"]
    grant_status: Literal["applied", "approved"]
    name: str = Field(..., min_length=1, max_length=200, description="项目名")
    occurred_on: date


class GrantSubmitOut(BaseModel):
    ledger_id: int
    final_points: float
    reason: str


@router.get("/preview")
def preview(level: str, grant_status: str, _: Member = Depends(get_current_user)):
    return {"points": grant_points(level, grant_status)}


@router.post("", response_model=GrantSubmitOut, status_code=201)
def submit_grant(
    payload: GrantSubmit,
    db: Session = Depends(get_db),
    user: Member = Depends(require_admin),
):
    pts = grant_points(payload.level, payload.grant_status)
    if pts <= 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "无效组合或积分为 0")
    next_source_id = (db.query(PointsLedger).filter_by(source_type="grant").count() or 0) + 1
    try:
        write_grant_ledger(
            db,
            source_id=next_source_id,
            member_open_id=payload.member_open_id,
            level=payload.level,
            status=payload.grant_status,
            name=payload.name,
            occurred_on=payload.occurred_on,
            submitted_by=user.open_id,
        )
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, f"写入失败: {e}") from e
    row = (
        db.query(PointsLedger)
        .filter_by(source_type="grant", source_id=next_source_id)
        .order_by(PointsLedger.ledger_id.desc())
        .first()
    )
    if row is None:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "ledger 未写入")
    return GrantSubmitOut(ledger_id=row.ledger_id, final_points=row.final_points, reason=row.reason or "")
