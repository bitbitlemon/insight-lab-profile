"""阶段检查项模板管理: 按 项目类别 x 阶段 维护标准检查项 (管理员)。"""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models import Member, StageChecklistTemplate
from app.permissions import member_is_super_admin_for_db
from app.services.stage_flow import PROJECT_CATEGORIES, SEVEN_STAGES

router = APIRouter(prefix="/api/stage-check-templates", tags=["stage-check-templates"])


class StageTemplateBase(BaseModel):
    project_category: str = Field(min_length=1)
    stage_title: str = Field(min_length=1)
    item_text: str = Field(min_length=1)
    required: bool = True
    sort_order: int = 0
    enabled: bool = True


class StageTemplateRead(StageTemplateBase):
    template_id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


def _can_manage(current: Member, db: Session) -> bool:
    return current.role == "admin" or member_is_super_admin_for_db(db, current)


@router.get("", response_model=list[StageTemplateRead])
def list_stage_templates(
    project_category: str | None = None,
    stage_title: str | None = None,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    stmt = select(StageChecklistTemplate)
    if project_category:
        stmt = stmt.where(StageChecklistTemplate.project_category == project_category)
    if stage_title:
        stmt = stmt.where(StageChecklistTemplate.stage_title == stage_title)
    stmt = stmt.order_by(
        StageChecklistTemplate.project_category,
        StageChecklistTemplate.stage_title,
        StageChecklistTemplate.sort_order,
    )
    return [StageTemplateRead.model_validate(r) for r in db.execute(stmt).scalars().all()]


@router.post("", response_model=StageTemplateRead, status_code=201)
def upsert_stage_template(
    payload: StageTemplateBase,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    if not _can_manage(current, db):
        raise HTTPException(403, "仅管理员可维护检查项模板")
    if payload.project_category not in PROJECT_CATEGORIES:
        raise HTTPException(400, "未知项目类别")
    if payload.stage_title not in SEVEN_STAGES:
        raise HTTPException(400, "未知阶段")
    item_text = payload.item_text.strip()
    if not item_text:
        raise HTTPException(400, "检查项内容不能为空")
    row = db.execute(
        select(StageChecklistTemplate).where(
            StageChecklistTemplate.project_category == payload.project_category,
            StageChecklistTemplate.stage_title == payload.stage_title,
            StageChecklistTemplate.item_text == item_text,
        )
    ).scalar_one_or_none()
    if row is None:
        row = StageChecklistTemplate(
            project_category=payload.project_category,
            stage_title=payload.stage_title,
            item_text=item_text,
        )
        db.add(row)
    row.required = payload.required
    row.sort_order = payload.sort_order
    row.enabled = payload.enabled
    db.commit()
    db.refresh(row)
    return StageTemplateRead.model_validate(row)


@router.delete("/{template_id}", status_code=204)
def delete_stage_template(
    template_id: int,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    if not _can_manage(current, db):
        raise HTTPException(403, "仅管理员可维护检查项模板")
    row = db.get(StageChecklistTemplate, template_id)
    if not row:
        raise HTTPException(404, "template not found")
    db.delete(row)
    db.commit()
