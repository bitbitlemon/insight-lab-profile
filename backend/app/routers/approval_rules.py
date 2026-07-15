"""阶段审批规则: 按 项目类别 x 阶段 预设审批人与审批方式 (any=或签 / all=会签)。"""
from __future__ import annotations

import json
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models import ApprovalRule, Member
from app.permissions import member_is_super_admin_for_db

router = APIRouter(prefix="/api/approval-rules", tags=["approval-rules"])

ApprovalMode = Literal["any", "all"]


class ApprovalRuleBase(BaseModel):
    project_category: str = Field(min_length=1)
    stage_title: str | None = None
    mode: ApprovalMode = "any"
    approver_open_ids: list[str] = Field(min_length=1)
    enabled: bool = True


class ApprovalRuleCreate(ApprovalRuleBase):
    pass


class ApprovalRuleRead(ApprovalRuleBase):
    rule_id: int
    approver_names: list[str | None] = []
    created_by: str | None = None
    created_at: datetime
    updated_at: datetime


def _can_manage_rules(current: Member, db: Session) -> bool:
    return current.role == "admin" or member_is_super_admin_for_db(db, current)


def _serialize(row: ApprovalRule, db: Session) -> ApprovalRuleRead:
    open_ids: list[str] = json.loads(row.approver_open_ids or "[]")
    names = []
    for oid in open_ids:
        m = db.get(Member, oid)
        names.append(m.name if m else None)
    return ApprovalRuleRead(
        rule_id=row.rule_id,
        project_category=row.project_category,
        stage_title=row.stage_title,
        mode=row.mode,
        approver_open_ids=open_ids,
        approver_names=names,
        enabled=row.enabled,
        created_by=row.created_by,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get("", response_model=list[ApprovalRuleRead])
def list_approval_rules(db: Session = Depends(get_db), current: Member = Depends(get_current_user)):
    rows = db.execute(
        select(ApprovalRule).order_by(ApprovalRule.project_category, ApprovalRule.stage_title)
    ).scalars().all()
    return [_serialize(r, db) for r in rows]


@router.post("", response_model=ApprovalRuleRead, status_code=201)
def upsert_approval_rule(
    payload: ApprovalRuleCreate,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    if not _can_manage_rules(current, db):
        raise HTTPException(403, "仅管理员可配置审批规则")
    for oid in payload.approver_open_ids:
        if not db.get(Member, oid):
            raise HTTPException(400, f"审批人不存在: {oid}")
    stage_title = (payload.stage_title or "").strip() or None
    row = db.execute(
        select(ApprovalRule).where(
            ApprovalRule.project_category == payload.project_category,
            ApprovalRule.stage_title.is_(None) if stage_title is None else ApprovalRule.stage_title == stage_title,
        )
    ).scalar_one_or_none()
    if row is None:
        row = ApprovalRule(project_category=payload.project_category, stage_title=stage_title, created_by=current.open_id)
        db.add(row)
    row.mode = payload.mode
    row.approver_open_ids = json.dumps(payload.approver_open_ids, ensure_ascii=False)
    row.enabled = payload.enabled
    db.commit()
    db.refresh(row)
    return _serialize(row, db)


@router.delete("/{rule_id}", status_code=204)
def delete_approval_rule(rule_id: int, db: Session = Depends(get_db), current: Member = Depends(get_current_user)):
    if not _can_manage_rules(current, db):
        raise HTTPException(403, "仅管理员可配置审批规则")
    row = db.get(ApprovalRule, rule_id)
    if not row:
        raise HTTPException(404, "rule not found")
    db.delete(row)
    db.commit()


def resolve_stage_approval_rule(db: Session, project_tags: str | None, stage_title: str | None) -> ApprovalRule | None:
    """按项目 tags 中的类别 + 阶段名解析规则; 精确阶段优先, 其次类别级通配。"""
    if not project_tags:
        return None
    tags = {t.strip() for t in project_tags.split(",") if t.strip()}
    rows = db.execute(
        select(ApprovalRule).where(ApprovalRule.enabled.is_(True), ApprovalRule.project_category.in_(tags))
    ).scalars().all()
    exact = [r for r in rows if r.stage_title and stage_title and r.stage_title == stage_title]
    if exact:
        return exact[0]
    wildcard = [r for r in rows if r.stage_title is None]
    return wildcard[0] if wildcard else None
