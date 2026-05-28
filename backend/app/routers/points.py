"""积分读端口: 个人总分 / 明细 / 排行榜.

只读, 不依赖具体 base_points 规则; ledger 已有 final_points 直接聚合.
写入由各业务 router (papers / competitions / contributions) hook 调用积分服务完成.
"""
from __future__ import annotations
from datetime import date, datetime
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user, require_role
from app.models import (
    Competition, CompetitionMember, Contribution, Member, Paper, PaperAuthor, PointsLedger,
)
from app.services.points_service import (
    write_competition_ledger, write_contribution_ledger, write_paper_ledger,
)
from app.services.points_rules import (
    DUTY_RATING_FACTOR, RULES_VERSION, duty_monthly_base,
)
import json as _json

router = APIRouter(prefix="/api/points", tags=["points"])


def _has_review_permission(current: Member) -> bool:
    return current.role in ("admin", "staff") or bool(current.title and any(k in current.title for k in ("团长", "政委", "部长")))


def _ensure_review_permission(current: Member) -> None:
    if not _has_review_permission(current):
        raise HTTPException(403, "无权审批")


class LedgerEntry(BaseModel):
    ledger_id: int
    member_open_id: str
    source_type: str
    source_id: int | None
    occurred_at: date
    base_points: float
    share_ratio: float
    decay_factor: float
    cap_adjustment_factor: float
    final_points: float
    reason: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class PendingLedgerEntry(LedgerEntry):
    member_name: str
    status: str
    approved_by: str | None
    approved_at: datetime | None
    review_comment: str | None
    disputed: bool
    disputed_by: str | None
    disputed_at: datetime | None
    dispute_reason: str | None
    resolution_status: str | None
    resolved_by: str | None
    resolved_at: datetime | None
    resolution_note: str | None


class ReviewPayload(BaseModel):
    comment: str | None = None


class DisputePayload(BaseModel):
    dispute_reason: str | None = None


class ResolvePayload(BaseModel):
    approve: bool
    resolution_note: str | None = None


class PointsBreakdown(BaseModel):
    paper: float = 0
    competition: float = 0
    contribution: float = 0
    duty: float = 0
    adjust: float = 0
    total: float = 0


class MemberPoints(BaseModel):
    member_open_id: str
    name: str
    department: str | None
    title: str | None
    avatar_url: str | None
    breakdown: PointsBreakdown
    entries_count: int


class LeaderboardItem(BaseModel):
    rank: int
    member_open_id: str
    name: str
    department: str | None
    avatar_url: str | None
    total_points: float


@router.get("/members/{open_id}", response_model=MemberPoints)
def member_total(
    open_id: str,
    start: date | None = Query(None),
    end: date | None = Query(None),
    db: Session = Depends(get_db),
    _: Member = Depends(get_current_user),
):
    m = db.get(Member, open_id)
    if not m:
        raise HTTPException(404, "member not found")
    stmt = select(PointsLedger.source_type, func.sum(PointsLedger.final_points)) \
        .where(PointsLedger.member_open_id == open_id) \
        .group_by(PointsLedger.source_type)
    if start: stmt = stmt.where(PointsLedger.occurred_at >= start)
    if end: stmt = stmt.where(PointsLedger.occurred_at <= end)
    rows = db.execute(stmt).all()
    bd = PointsBreakdown()
    for src, total in rows:
        if hasattr(bd, src): setattr(bd, src, float(total or 0))
    bd.total = bd.paper + bd.competition + bd.contribution + bd.duty + bd.adjust
    count = db.execute(
        select(func.count()).select_from(PointsLedger).where(PointsLedger.member_open_id == open_id)
    ).scalar_one()
    return MemberPoints(
        member_open_id=m.open_id, name=m.name, department=m.department,
        title=m.title, avatar_url=m.avatar_url, breakdown=bd, entries_count=int(count),
    )


@router.get("/members/{open_id}/ledger", response_model=list[LedgerEntry])
def member_ledger(
    open_id: str,
    limit: int = Query(100, ge=1, le=500),
    source_type: str | None = Query(None),
    db: Session = Depends(get_db),
    _: Member = Depends(get_current_user),
):
    stmt = select(PointsLedger).where(PointsLedger.member_open_id == open_id)
    if source_type:
        stmt = stmt.where(PointsLedger.source_type == source_type)
    stmt = stmt.order_by(PointsLedger.occurred_at.desc()).limit(limit)
    items = db.execute(stmt).scalars().all()
    return [LedgerEntry.model_validate(it) for it in items]


@router.post("/ledger/{ledger_id}/approve")
def approve_ledger(
    ledger_id: int,
    payload: ReviewPayload,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    _ensure_review_permission(current)
    ledger = db.get(PointsLedger, ledger_id)
    if not ledger:
        raise HTTPException(404, "ledger not found")
    ledger.status = "approved"
    ledger.approved_by = current.open_id
    ledger.approved_at = datetime.utcnow()
    ledger.review_comment = payload.comment
    db.commit()
    return {"ok": True}


@router.post("/ledger/{ledger_id}/reject")
def reject_ledger(
    ledger_id: int,
    payload: ReviewPayload,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    _ensure_review_permission(current)
    ledger = db.get(PointsLedger, ledger_id)
    if not ledger:
        raise HTTPException(404, "ledger not found")
    ledger.status = "rejected"
    ledger.approved_by = current.open_id
    ledger.approved_at = datetime.utcnow()
    ledger.review_comment = payload.comment
    db.commit()
    return {"ok": True}


@router.post("/ledger/{ledger_id}/dispute")
def dispute_ledger(
    ledger_id: int,
    payload: DisputePayload,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    ledger = db.get(PointsLedger, ledger_id)
    if not ledger:
        raise HTTPException(404, "ledger not found")
    if ledger.member_open_id != current.open_id and current.role != "admin":
        raise HTTPException(403, "无权申诉")
    ledger.disputed = True
    ledger.disputed_by = current.open_id
    ledger.disputed_at = datetime.utcnow()
    ledger.dispute_reason = payload.dispute_reason
    if ledger.status not in ("rejected", "superseded", "settled"):
        ledger.status = "disputed"
    db.commit()
    return {"ok": True}


@router.post("/ledger/{ledger_id}/resolve")
def resolve_ledger(
    ledger_id: int,
    payload: ResolvePayload,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    _ensure_review_permission(current)
    ledger = db.get(PointsLedger, ledger_id)
    if not ledger:
        raise HTTPException(404, "ledger not found")
    ledger.disputed = False
    ledger.resolution_status = "resolved" if payload.approve else "rejected"
    ledger.resolution_note = payload.resolution_note
    ledger.resolved_by = current.open_id
    ledger.resolved_at = datetime.utcnow()
    ledger.status = "approved" if payload.approve else "rejected"
    if payload.approve:
        ledger.approved_by = current.open_id
        ledger.approved_at = datetime.utcnow()
    db.commit()
    return {"ok": True}


@router.get("/ledger/pending", response_model=list[PendingLedgerEntry])
def list_pending_ledger(
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    _ensure_review_permission(current)
    stmt = (
        select(PointsLedger, Member.name)
        .join(Member, Member.open_id == PointsLedger.member_open_id)
        .where(or_(PointsLedger.status == "pending_review", PointsLedger.disputed.is_(True)))
        .order_by(PointsLedger.disputed.desc(), PointsLedger.occurred_at.desc(), PointsLedger.created_at.desc())
    )
    rows = db.execute(stmt).all()
    return [
        PendingLedgerEntry(**{
            field: member_name if field == "member_name" else getattr(ledger, field)
            for field in PendingLedgerEntry.model_fields
        })
        for ledger, member_name in rows
    ]


@router.post("/recompute")
def recompute(
    reset: bool = Query(False, description="清空所有 ledger 后重做"),
    duty_months: int = Query(0, ge=0, le=24),
    duty_rating: str = Query("B", pattern="^[ABCD]$"),
    db: Session = Depends(get_db),
    _: Member = Depends(require_role("admin")),
):
    """Admin: 全量重算积分台账. ⚠️ reset=True 会删旧再做."""
    if reset:
        db.query(PointsLedger).delete()
    n = {"paper": 0, "competition": 0, "contribution": 0, "duty": 0}
    for p in db.query(Paper).all():
        n["paper"] += write_paper_ledger(db, p)
    for c in db.query(Competition).all():
        n["competition"] += write_competition_ledger(db, c)
    for cb in db.query(Contribution).all():
        n["contribution"] += write_contribution_ledger(db, cb)
    if duty_months > 0:
        from datetime import date
        factor = DUTY_RATING_FACTOR.get(duty_rating, 0.8)
        today = date.today()
        for m in db.query(Member).filter_by(status="active").all():
            per = duty_monthly_base(m.title)
            if per <= 0: continue
            fin = per * factor
            if fin <= 0: continue
            for k in range(duty_months):
                yr, mo = today.year, today.month - k
                while mo <= 0: mo += 12; yr -= 1
                occ = date(yr, mo, 1)
                snap = {"title": m.title, "rating": duty_rating, "factor": factor}
                db.add(PointsLedger(
                    member_open_id=m.open_id, source_type="duty", source_id=None,
                    occurred_at=occ, base_points=per, share_ratio=factor,
                    decay_factor=1.0, cap_adjustment_factor=1.0, final_points=fin,
                    reason=f"{m.title} 月度 {occ.year}-{occ.month:02d} 评级 {duty_rating}",
                    status="approved", calculation_rule_version=RULES_VERSION,
                    source_snapshot_json=_json.dumps(snap, ensure_ascii=False),
                    submitted_at=datetime.utcnow(), approved_at=datetime.utcnow(),
                    settlement_period=f"{occ.year}Q{(occ.month-1)//3+1}",
                ))
                n["duty"] += 1
    db.commit()
    return {"ok": True, "rules_version": RULES_VERSION, **n}


@router.get("/leaderboard", response_model=list[LeaderboardItem])
def leaderboard(
    department: str | None = Query(None),
    start: date | None = Query(None),
    end: date | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    _: Member = Depends(get_current_user),
):
    stmt = (
        select(
            Member.open_id, Member.name, Member.department, Member.avatar_url,
            func.coalesce(func.sum(PointsLedger.final_points), 0).label("total"),
        )
        .outerjoin(PointsLedger, PointsLedger.member_open_id == Member.open_id)
        .group_by(Member.open_id)
        .order_by(func.coalesce(func.sum(PointsLedger.final_points), 0).desc(), Member.name)
    )
    if department:
        stmt = stmt.where(Member.department == department)
    if start:
        stmt = stmt.where((PointsLedger.occurred_at >= start) | (PointsLedger.occurred_at.is_(None)))
    if end:
        stmt = stmt.where((PointsLedger.occurred_at <= end) | (PointsLedger.occurred_at.is_(None)))
    rows = db.execute(stmt.limit(limit)).all()
    return [
        LeaderboardItem(
            rank=i + 1, member_open_id=r.open_id, name=r.name,
            department=r.department, avatar_url=r.avatar_url, total_points=float(r.total or 0),
        )
        for i, r in enumerate(rows)
    ]
