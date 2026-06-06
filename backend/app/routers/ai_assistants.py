from __future__ import annotations

from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models import AIAssistantConfig, Member

router = APIRouter(prefix="/api/ai-assistants", tags=["ai-assistants"])

AssistantScope = Literal["global", "department"]
AssistantCadence = Literal["daily", "weekly", "manual"]


class AIAssistantConfigRead(BaseModel):
    assistant_id: int
    scope: AssistantScope
    department: str | None
    name: str
    role: str
    prompt: str
    workflow: str | None
    cadence: AssistantCadence
    enabled: bool
    created_by: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AIAssistantConfigPayload(BaseModel):
    scope: AssistantScope = "global"
    department: str | None = None
    name: str
    role: str = "management"
    prompt: str
    workflow: str | None = None
    cadence: AssistantCadence = "weekly"
    enabled: bool = True


def _can_manage(current: Member) -> bool:
    return current.role in ("admin", "staff")


@router.get("", response_model=list[AIAssistantConfigRead])
def list_ai_assistants(
    scope: AssistantScope | None = Query(None),
    department: str | None = Query(None),
    enabled_only: bool = Query(False),
    db: Session = Depends(get_db),
    _: Member = Depends(get_current_user),
):
    stmt = select(AIAssistantConfig)
    if scope:
        stmt = stmt.where(AIAssistantConfig.scope == scope)
    if department:
        stmt = stmt.where(AIAssistantConfig.department == department)
    if enabled_only:
        stmt = stmt.where(AIAssistantConfig.enabled.is_(True))
    stmt = stmt.order_by(AIAssistantConfig.scope.asc(), AIAssistantConfig.department.asc(), AIAssistantConfig.updated_at.desc())
    return [AIAssistantConfigRead.model_validate(row) for row in db.execute(stmt).scalars().all()]


@router.post("", response_model=AIAssistantConfigRead, status_code=201)
def create_ai_assistant(
    payload: AIAssistantConfigPayload,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    if not _can_manage(current):
        raise HTTPException(403, "无权配置 AI 助手")
    name = payload.name.strip()
    prompt = payload.prompt.strip()
    department = payload.department.strip() if payload.department else None
    if not name:
        raise HTTPException(400, "助手名称不能为空")
    if not prompt:
        raise HTTPException(400, "助手提示词不能为空")
    if payload.scope == "department" and not department:
        raise HTTPException(400, "部门助手必须选择部门")
    if payload.scope == "global":
        department = None
    row = AIAssistantConfig(
        scope=payload.scope,
        department=department,
        name=name,
        role=payload.role.strip() or "management",
        prompt=prompt,
        workflow=payload.workflow.strip() if payload.workflow else None,
        cadence=payload.cadence,
        enabled=payload.enabled,
        created_by=current.open_id,
    )
    db.add(row)
    db.commit(); db.refresh(row)
    return AIAssistantConfigRead.model_validate(row)


@router.patch("/{assistant_id}", response_model=AIAssistantConfigRead)
def update_ai_assistant(
    assistant_id: int,
    payload: AIAssistantConfigPayload,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    if not _can_manage(current):
        raise HTTPException(403, "无权配置 AI 助手")
    row = db.get(AIAssistantConfig, assistant_id)
    if not row:
        raise HTTPException(404, "AI 助手不存在")
    name = payload.name.strip()
    prompt = payload.prompt.strip()
    department = payload.department.strip() if payload.department else None
    if not name:
        raise HTTPException(400, "助手名称不能为空")
    if not prompt:
        raise HTTPException(400, "助手提示词不能为空")
    if payload.scope == "department" and not department:
        raise HTTPException(400, "部门助手必须选择部门")
    if payload.scope == "global":
        department = None
    row.scope = payload.scope
    row.department = department
    row.name = name
    row.role = payload.role.strip() or "management"
    row.prompt = prompt
    row.workflow = payload.workflow.strip() if payload.workflow else None
    row.cadence = payload.cadence
    row.enabled = payload.enabled
    db.commit(); db.refresh(row)
    return AIAssistantConfigRead.model_validate(row)
