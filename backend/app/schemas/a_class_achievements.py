from __future__ import annotations

import json
from typing import Any

from pydantic import BaseModel, Field, field_validator


class AClassAttachment(BaseModel):
    file_token: str
    name: str | None = None
    size: int | None = None
    type: str | None = None


def _parse_attachments(raw: str | None) -> list[AClassAttachment]:
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except (TypeError, ValueError):
        return []
    if not isinstance(data, list):
        return []
    out = []
    for x in data:
        if isinstance(x, dict) and x.get("file_token"):
            out.append(AClassAttachment(**{k: x.get(k) for k in ("file_token", "name", "size", "type")}))
    return out


class AClassAchievementRead(BaseModel):
    id: int
    base_record_id: str
    project_content: str | None = None
    event_name: str | None = None
    level: str | None = None
    award_grade: str | None = None
    organizer: str | None = None
    event_date: str | None = None
    department: str | None = None
    responsible_person: str | None = None
    first_student: str | None = None
    other_students: str | None = None
    research_category: str | None = None
    pdf_files: list[AClassAttachment] = Field(default_factory=list)
    image_files: list[AClassAttachment] = Field(default_factory=list)
    extra_files: list[AClassAttachment] = Field(default_factory=list)
    ai_image_understanding: str | None = None
    kimi_summary: str | None = None
    notes: str | None = None

    @field_validator("pdf_files", "image_files", "extra_files", mode="before")
    @classmethod
    def _coerce_json(cls, v: Any) -> Any:
        if v is None:
            return []
        if isinstance(v, str):
            return [a.model_dump() for a in _parse_attachments(v)]
        return v


class AClassAchievementListResponse(BaseModel):
    items: list[AClassAchievementRead]
    total: int
    research_categories: list[str]
    levels: list[str]
