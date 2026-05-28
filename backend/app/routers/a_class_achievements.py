"""2026 年 A 类成果 — 直连飞书源 Base, 10min 缓存 + 后台续期 (见 main.py)."""
from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.deps import get_current_user
from app.models import Member
from app.schemas.a_class_achievements import (
    AClassAchievementListResponse,
    AClassAchievementRead,
)
from app.services.a_class_log import APP_TOKEN, TABLE_ID, fetch_all
from app.services.lark import get_lark

router = APIRouter(prefix="/api/a-class-achievements", tags=["a_class_achievements"])

# kind → 飞书源 Base 字段名
_KIND_TO_LARK_FIELD = {
    "pdf": "PDF附件",
    "image": "图片附件",
    "extra": "附件 (1)",
}


class AttachmentsPatch(BaseModel):
    kind: Literal["pdf", "image", "extra"]
    file_tokens: list[str] = Field(default_factory=list)


@router.get("", response_model=AClassAchievementListResponse)
async def list_a_class(
    research_category: str | None = Query(None, description="筛选研究分类"),
    level: str | None = Query(None, description="筛选正规级别"),
    _: Member = Depends(get_current_user),
):
    items = await fetch_all()
    rcs = sorted({i["research_category"] for i in items if i.get("research_category")})
    lvs = sorted({i["level"] for i in items if i.get("level")})

    filtered = items
    if research_category:
        filtered = [i for i in filtered if i.get("research_category") == research_category]
    if level:
        filtered = [i for i in filtered if i.get("level") == level]

    filtered = sorted(filtered, key=lambda x: x.get("event_date") or "", reverse=True)
    return AClassAchievementListResponse(
        items=[AClassAchievementRead.model_validate(i) for i in filtered],
        total=len(filtered),
        research_categories=rcs,
        levels=lvs,
    )


@router.get("/{item_id}", response_model=AClassAchievementRead)
async def get_a_class(item_id: int, _: Member = Depends(get_current_user)):
    items = await fetch_all()
    for i in items:
        if i["id"] == item_id:
            return AClassAchievementRead.model_validate(i)
    raise HTTPException(status.HTTP_404_NOT_FOUND, "not found")


@router.patch("/by-record/{base_record_id}/attachments", response_model=AClassAchievementRead)
async def patch_attachments(
    base_record_id: str,
    payload: AttachmentsPatch,
    _: Member = Depends(get_current_user),
):
    """全量覆盖某 kind 的附件列表; 写回飞书源 Base + 强制刷缓存."""
    field_name = _KIND_TO_LARK_FIELD[payload.kind]
    fields_to_push = {field_name: [{"file_token": ft} for ft in payload.file_tokens]}
    lark = get_lark()
    try:
        await lark.update_record(APP_TOKEN, TABLE_ID, base_record_id, fields_to_push)
    except Exception as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"feishu update_record failed: {exc}") from exc

    items = await fetch_all(force=True)
    for i in items:
        if i["base_record_id"] == base_record_id:
            return AClassAchievementRead.model_validate(i)
    raise HTTPException(status.HTTP_404_NOT_FOUND, "record not found after refresh")
