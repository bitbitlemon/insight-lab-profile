"""论文流水线节点路由 (选题/调研/实验/初稿/投稿).

每篇 paper 一次性建 5 节点, 通过 ensure_milestones 幂等保证.
"""
from __future__ import annotations
from datetime import date, datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.deps import get_current_user
from app.models import (
    Member, Paper, PaperMilestone, PIPELINE_STAGES, PIPELINE_STAGE_LABEL,
)
from app.services.base_writer import mirror_to_base


def _milestone_fields_for_base(m: PaperMilestone) -> dict:
    return {
        "paper_id": m.paper_id,
        "stage": m.stage,
        "owner_open_id": m.owner_open_id or "",
        "due_date": m.due_date.isoformat() if m.due_date else None,
        "status": m.status,
        "notes": m.notes or "",
    }

router = APIRouter(prefix="/api/papers", tags=["paper-milestones"])

Stage = Literal["topic", "research", "experiment", "draft", "submit"]
Status = Literal["pending", "in_progress", "done", "blocked"]


class MilestoneRead(BaseModel):
    milestone_id: int
    paper_id: int
    stage: Stage
    stage_label: str
    owner_open_id: str | None
    owner_name: str | None
    due_date: date | None
    status: Status
    completed_at: datetime | None
    notes: str | None
    model_config = {"from_attributes": True}


class MilestoneUpdate(BaseModel):
    owner_open_id: str | None = None
    due_date: date | None = None
    status: Status | None = None
    notes: str | None = None


def _ensure_paper_milestones(db: Session, paper: Paper) -> list[PaperMilestone]:
    """对 paper 检查并补齐 5 节点. 幂等."""
    existing = db.execute(
        select(PaperMilestone).where(PaperMilestone.paper_id == paper.paper_id)
    ).scalars().all()
    have = {m.stage for m in existing}
    added = []
    for stage in PIPELINE_STAGES:
        if stage in have:
            continue
        m = PaperMilestone(
            paper_id=paper.paper_id,
            stage=stage,
            owner_open_id=paper.created_by,  # 默认归属创建者, 后续由用户改派
            status="pending",
        )
        db.add(m)
        added.append(m)
    if added:
        db.commit()
        for m in added:
            db.refresh(m)
    return existing + added


def _serialize(m: PaperMilestone, owner: Member | None) -> MilestoneRead:
    return MilestoneRead(
        milestone_id=m.milestone_id,
        paper_id=m.paper_id,
        stage=m.stage,  # type: ignore[arg-type]
        stage_label=PIPELINE_STAGE_LABEL.get(m.stage, m.stage),
        owner_open_id=m.owner_open_id,
        owner_name=owner.name if owner else None,
        due_date=m.due_date,
        status=m.status,  # type: ignore[arg-type]
        completed_at=m.completed_at,
        notes=m.notes,
    )


@router.get("/{paper_id}/milestones", response_model=list[MilestoneRead])
def list_milestones(paper_id: int, db: Session = Depends(get_db),
                    _: Member = Depends(get_current_user)):
    paper = db.get(Paper, paper_id)
    if not paper:
        raise HTTPException(404, "paper not found")
    mins = _ensure_paper_milestones(db, paper)
    # 按 stage 自然顺序
    mins_sorted = sorted(mins, key=lambda x: PIPELINE_STAGES.index(x.stage))
    out: list[MilestoneRead] = []
    for m in mins_sorted:
        owner = db.get(Member, m.owner_open_id) if m.owner_open_id else None
        out.append(_serialize(m, owner))
    return out


@router.patch("/{paper_id}/milestones/{milestone_id}", response_model=MilestoneRead)
async def update_milestone(
    paper_id: int, milestone_id: int, payload: MilestoneUpdate,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    m = db.get(PaperMilestone, milestone_id)
    if not m or m.paper_id != paper_id:
        raise HTTPException(404, "milestone not found")
    if current.role not in ("admin", "staff") and current.open_id not in (m.owner_open_id, ):
        raise HTTPException(403, "无权修改: 仅 owner 或管理员")
    updates = payload.model_dump(exclude_unset=True)
    if "status" in updates:
        if updates["status"] == "done" and m.status != "done":
            m.completed_at = datetime.utcnow()
        elif updates["status"] != "done":
            m.completed_at = None
    for k, v in updates.items():
        setattr(m, k, v)
    db.commit(); db.refresh(m)
    new_rid = await mirror_to_base(
        getattr(settings, "lark_table_paper_milestones", ""),
        _milestone_fields_for_base(m),
        record_id=m.base_record_id,
    )
    if new_rid and new_rid != m.base_record_id:
        m.base_record_id = new_rid
        db.commit()
    owner = db.get(Member, m.owner_open_id) if m.owner_open_id else None
    return _serialize(m, owner)
