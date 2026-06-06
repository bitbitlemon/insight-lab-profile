"""组织贡献路由: 心得 / 组织活动 / 内部分享 / 文档 / 其他."""
from __future__ import annotations
from datetime import date, datetime
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.deps import get_current_user
from app.models import Contribution, ContributionComment, Member, PointsLedger
from app.schemas.common import PageResponse
from app.services.points_rules import RULES_VERSION, contribution_base
from app.services.points_service import try_write_contribution
from app.services.sync import push_record_to_base, delete_record_from_base
import asyncio, json, logging

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/contributions", tags=["contributions"])

CONTRIB_TYPE = Literal["event", "internal_share", "document", "reflection", "other"]
CONTRIB_ROLE = Literal[
    "organizer", "co_organizer", "speaker", "participant", "contributor", "other"
]


class ContributionRead(BaseModel):
    contribution_id: int
    member_open_id: str
    type: CONTRIB_TYPE
    title: str
    description: str | None
    occurred_at: date
    role_in_contribution: CONTRIB_ROLE | None
    hours: float | None
    score: int | None
    proof_url: str | None
    tags: str | None
    like_count: int = 0
    comment_count: int = 0
    created_at: datetime

    model_config = {"from_attributes": True}


class ContributionCreate(BaseModel):
    member_open_id: str
    type: CONTRIB_TYPE
    title: str
    description: str | None = None
    occurred_at: date
    role_in_contribution: CONTRIB_ROLE | None = None
    hours: float | None = None
    score: int | None = None
    proof_url: str | None = None
    tags: str | None = None


class ContributionUpdate(BaseModel):
    type: CONTRIB_TYPE | None = None
    title: str | None = None
    description: str | None = None
    occurred_at: date | None = None
    role_in_contribution: CONTRIB_ROLE | None = None
    hours: float | None = None
    score: int | None = None
    proof_url: str | None = None
    tags: str | None = None


class TierPayload(BaseModel):
    tier: Literal["A", "B", "C"]
    comment: str | None = None


class InteractionPayload(BaseModel):
    kind: Literal["like", "comment"] = "like"


class ContributionCommentRead(BaseModel):
    comment_id: int
    contribution_id: int
    author_open_id: str
    content: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ContributionCommentCreate(BaseModel):
    content: str


def _has_review_permission(current: Member) -> bool:
    return current.role in ("admin", "staff") or bool(current.title and any(k in current.title for k in ("团长", "政委", "部长")))


@router.get("", response_model=PageResponse[ContributionRead])
def list_contributions(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    member_open_id: str | None = Query(None),
    type: CONTRIB_TYPE | None = Query(None),
    db: Session = Depends(get_db),
    _: Member = Depends(get_current_user),
):
    stmt = select(Contribution)
    count_stmt = select(func.count()).select_from(Contribution)
    if member_open_id:
        stmt = stmt.where(Contribution.member_open_id == member_open_id)
        count_stmt = count_stmt.where(Contribution.member_open_id == member_open_id)
    if type:
        stmt = stmt.where(Contribution.type == type)
        count_stmt = count_stmt.where(Contribution.type == type)
    stmt = stmt.order_by(Contribution.occurred_at.desc()).offset((page - 1) * page_size).limit(page_size)
    items = db.execute(stmt).scalars().all()
    total = db.execute(count_stmt).scalar_one()
    return PageResponse[ContributionRead](
        items=[ContributionRead.model_validate(c) for c in items],
        total=total, page=page, page_size=page_size,
    )


@router.get("/{contribution_id}", response_model=ContributionRead)
def get_contribution(
    contribution_id: int,
    db: Session = Depends(get_db),
    _: Member = Depends(get_current_user),
):
    row = db.get(Contribution, contribution_id)
    if not row:
        raise HTTPException(404, "贡献记录不存在")
    return ContributionRead.model_validate(row)


@router.post("", response_model=ContributionRead, status_code=201)
async def create_contribution(
    payload: ContributionCreate,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    target = db.query(Member).filter_by(open_id=payload.member_open_id).first()
    if not target:
        raise HTTPException(404, "member not found")
    if payload.member_open_id != current.open_id and current.role not in ("admin", "staff"):
        raise HTTPException(403, "无权代他人录入")
    c = Contribution(**payload.model_dump(), created_by=current.open_id)
    db.add(c); db.flush()
    try_write_contribution(db, c, event_tier=None, submitted_by=current.open_id)
    db.commit(); db.refresh(c)
    # Base 双写 (失败不阻塞)
    table_id = getattr(settings, "lark_table_contributions", "")
    if table_id and settings.lark_base_app_token:
        try:
            fields = {
                "member_open_id": c.member_open_id,
                "type": c.type,
                "title": c.title,
                "description": c.description,
                "occurred_at": c.occurred_at.isoformat() if c.occurred_at else None,
                "role_in_contribution": c.role_in_contribution,
                "hours": c.hours,
                "proof_url": c.proof_url,
                "tags": c.tags,
            }
            rec = await push_record_to_base(table_id, fields, record_id=c.base_record_id)
            if rec.get("record_id"):
                c.base_record_id = rec["record_id"]
                db.commit()
        except Exception as e:
            log.warning("contributions Base 推送失败: %s", e)
    return ContributionRead.model_validate(c)


@router.patch("/{contribution_id}", response_model=ContributionRead)
async def update_contribution(
    contribution_id: int,
    payload: ContributionUpdate,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    c = db.get(Contribution, contribution_id)
    if not c:
        raise HTTPException(404, "贡献记录不存在")
    if c.created_by != current.open_id and c.member_open_id != current.open_id and current.role != "admin":
        raise HTTPException(403, "无权编辑")
    update_data = payload.model_dump(exclude_unset=True)
    if not update_data:
        return ContributionRead.model_validate(c)
    for key, value in update_data.items():
        setattr(c, key, value)
    db.commit(); db.refresh(c)
    # Base 双写 (失败不阻塞)
    table_id = getattr(settings, "lark_table_contributions", "")
    if table_id and settings.lark_base_app_token:
        try:
            fields = {
                "member_open_id": c.member_open_id,
                "type": c.type,
                "title": c.title,
                "description": c.description,
                "occurred_at": c.occurred_at.isoformat() if c.occurred_at else None,
                "role_in_contribution": c.role_in_contribution,
                "hours": c.hours,
                "proof_url": c.proof_url,
                "tags": c.tags,
            }
            rec = await push_record_to_base(table_id, fields, record_id=c.base_record_id)
            if rec.get("record_id") and not c.base_record_id:
                c.base_record_id = rec["record_id"]
                db.commit()
        except Exception as e:
            log.warning("contributions Base 更新推送失败: %s", e)
    return ContributionRead.model_validate(c)


@router.post("/{contribution_id}/interactions", response_model=ContributionRead)
def record_contribution_interaction(
    contribution_id: int,
    payload: InteractionPayload,
    db: Session = Depends(get_db),
    _: Member = Depends(get_current_user),
):
    c = db.get(Contribution, contribution_id)
    if not c:
        raise HTTPException(404, "贡献记录不存在")
    if payload.kind == "like":
        c.like_count = (c.like_count or 0) + 1
    else:
        c.comment_count = (c.comment_count or 0) + 1
    db.commit(); db.refresh(c)
    return ContributionRead.model_validate(c)


@router.get("/{contribution_id}/comments", response_model=list[ContributionCommentRead])
def list_contribution_comments(
    contribution_id: int,
    db: Session = Depends(get_db),
    _: Member = Depends(get_current_user),
):
    contribution = db.get(Contribution, contribution_id)
    if not contribution:
        raise HTTPException(404, "贡献记录不存在")
    rows = db.execute(
        select(ContributionComment)
        .where(ContributionComment.contribution_id == contribution_id)
        .order_by(ContributionComment.created_at.asc())
    ).scalars().all()
    return [ContributionCommentRead.model_validate(row) for row in rows]


@router.post("/{contribution_id}/comments", response_model=ContributionCommentRead, status_code=201)
def create_contribution_comment(
    contribution_id: int,
    payload: ContributionCommentCreate,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    content = payload.content.strip()
    if not content:
        raise HTTPException(400, "评论内容不能为空")
    contribution = db.get(Contribution, contribution_id)
    if not contribution:
        raise HTTPException(404, "贡献记录不存在")
    row = ContributionComment(
        contribution_id=contribution_id,
        author_open_id=current.open_id,
        content=content,
    )
    contribution.comment_count = (contribution.comment_count or 0) + 1
    db.add(row)
    db.commit(); db.refresh(row)
    return ContributionCommentRead.model_validate(row)


@router.delete("/{contribution_id}", status_code=204)
async def delete_contribution(
    contribution_id: int,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    c = db.get(Contribution, contribution_id)
    if not c:
        raise HTTPException(404, "not found")
    if c.created_by != current.open_id and c.member_open_id != current.open_id and current.role != "admin":
        raise HTTPException(403, "无权删除")
    # 先记下 base_record_id 再删本地
    base_rid = c.base_record_id
    db.query(PointsLedger).filter_by(source_type="contribution", source_id=c.contribution_id).delete()
    db.delete(c); db.commit()
    table_id = getattr(settings, "lark_table_contributions", "")
    if base_rid and table_id and settings.lark_base_app_token:
        try:
            await delete_record_from_base(table_id, base_rid)
        except Exception as e:
            log.warning("contributions Base 删除失败: %s", e)


@router.post("/{contribution_id}/tier")
def upgrade_event_tier(
    contribution_id: int,
    payload: TierPayload,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    if not _has_review_permission(current):
        raise HTTPException(403, "无权升级活动等级")
    contribution = db.get(Contribution, contribution_id)
    if not contribution:
        raise HTTPException(404, "contribution not found")
    if contribution.type != "event":
        raise HTTPException(400, "only event contribution supports tier review")

    ledger = db.query(PointsLedger).filter_by(source_type="contribution", source_id=contribution_id).first()
    now = datetime.utcnow()
    new_base = contribution_base("event", contribution.role_in_contribution, payload.tier)
    tier_note = f"tier={payload.tier} 升级 by {current.name or current.open_id}"
    if payload.comment:
        tier_note = f"{tier_note}; {payload.comment}"

    snapshot = {
        "type": contribution.type,
        "role": contribution.role_in_contribution,
        "event_tier": payload.tier,
    }

    if ledger is None:
        ledger = PointsLedger(
            member_open_id=contribution.member_open_id,
            source_type="contribution",
            source_id=contribution.contribution_id,
            occurred_at=contribution.occurred_at,
            base_points=float(new_base),
            share_ratio=1.0,
            decay_factor=1.0,
            cap_adjustment_factor=1.0,
            final_points=float(new_base),
            reason=f"event/{contribution.role_in_contribution or '-'} 《{contribution.title[:30]}》 {tier_note}",
            status="approved",
            calculation_rule_version=RULES_VERSION,
            source_snapshot_json=json.dumps(snapshot, ensure_ascii=False),
            submitted_by=contribution.created_by,
            submitted_at=now,
            approved_by=current.open_id,
            approved_at=now,
            review_comment=payload.comment,
            settlement_period=f"{contribution.occurred_at.year}Q{(contribution.occurred_at.month - 1) // 3 + 1}",
            created_by=current.open_id,
        )
        db.add(ledger)
    else:
        ledger.base_points = float(new_base)
        ledger.final_points = float(new_base) * ledger.share_ratio * ledger.decay_factor * ledger.cap_adjustment_factor
        ledger.reason = f"event/{contribution.role_in_contribution or '-'} 《{contribution.title[:30]}》 {tier_note}"
        ledger.status = "approved"
        ledger.calculation_rule_version = RULES_VERSION
        ledger.source_snapshot_json = json.dumps(snapshot, ensure_ascii=False)
        ledger.approved_by = current.open_id
        ledger.approved_at = now
        ledger.review_comment = payload.comment

    db.commit()
    return {"ok": True, "tier": payload.tier, "base_points": float(new_base)}
