from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import PointsSummary


class CompetitionMemberRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    comp_id: int
    member_open_id: str
    member_role: Literal["member", "advisor"]
    contribution_text: str | None = None


class CompetitionMemberInput(BaseModel):
    member_open_id: str
    member_role: Literal["member", "advisor"] = "member"
    share_ratio: float = 0.0
    contribution_text: str | None = None


class CompetitionAttachment(BaseModel):
    file_token: str
    name: str | None = None
    size: int | None = None
    type: str | None = None
    url: str | None = None
    source_app_token: str | None = None
    source_table_id: str | None = None


class CompetitionCreate(BaseModel):
    name: str
    organizer: str
    level: str
    category: str | None = None
    start_date: date | None = None
    end_date: date
    team_lead_open_id: str | None = None
    award_level: str
    rank: str | None = None
    description: str | None = None
    members: list[CompetitionMemberInput] = Field(default_factory=list)
    project_id: int | None = None
    cert_files: list[CompetitionAttachment] = Field(default_factory=list)
    photo_files: list[CompetitionAttachment] = Field(default_factory=list)


class CompetitionUpdate(BaseModel):
    name: str | None = None
    organizer: str | None = None
    level: str | None = None
    category: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    team_lead_open_id: str | None = None
    award_level: str | None = None
    rank: str | None = None
    description: str | None = None
    members: list[CompetitionMemberInput] | None = None
    project_id: int | None = None
    cert_files: list[CompetitionAttachment] | None = None
    photo_files: list[CompetitionAttachment] | None = None


class CompetitionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    comp_id: int
    base_record_id: str | None = None
    name: str
    organizer: str
    level: str
    category: str | None = None
    start_date: date | None = None
    end_date: date
    team_lead_open_id: str | None = None
    award_level: str
    rank: str | None = None
    score: float | None = None
    certificate_url: str | None = None
    project_url: str | None = None
    description: str | None = None
    reflection: str | None = None
    created_by: str
    created_at: datetime
    updated_at: datetime
    members: list[CompetitionMemberRead] = Field(default_factory=list)
    cert_files: list[CompetitionAttachment] = Field(default_factory=list)
    photo_files: list[CompetitionAttachment] = Field(default_factory=list)
    points_summary: PointsSummary | None = None
