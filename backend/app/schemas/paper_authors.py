from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, field_validator

from .common import parse_json_list
from .members import MemberSummaryRead


class PaperAuthorRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    paper_author_id: int
    base_record_id: str | None = None
    paper_id: int
    author_open_id: str
    author_order: int
    role: list[str]
    affiliation: str | None = None
    contribution_text: str | None = None
    created_at: datetime
    member: MemberSummaryRead | None = None

    @field_validator("role", mode="before")
    @classmethod
    def _parse_role(cls, value):
        return parse_json_list(value)
