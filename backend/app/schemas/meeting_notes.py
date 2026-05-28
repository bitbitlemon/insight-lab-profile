from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class MeetingParticipantRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    note_id: int
    member_open_id: str


class MeetingNoteCreate(BaseModel):
    base_record_id: str | None = None
    owner_open_id: str | None = None
    meeting_title: str
    meeting_date: date
    meeting_type: str
    external_participants: str | None = None
    location: str | None = None
    lark_minute_token: str | None = None
    summary: str
    my_reflection: str | None = None
    action_items: str | None = None
    attachment_urls: str | None = None
    tags: str | None = None
    source: Literal["manual", "auto_minute", "imported"]
    review_status: Literal["draft", "submitted"] = "draft"
    privacy_level: Literal["public", "internal", "private"] = "internal"


class MeetingNoteUpdate(BaseModel):
    base_record_id: str | None = None
    owner_open_id: str | None = None
    meeting_title: str | None = None
    meeting_date: date | None = None
    meeting_type: str | None = None
    external_participants: str | None = None
    location: str | None = None
    lark_minute_token: str | None = None
    summary: str | None = None
    my_reflection: str | None = None
    action_items: str | None = None
    attachment_urls: str | None = None
    tags: str | None = None
    source: Literal["manual", "auto_minute", "imported"] | None = None
    review_status: Literal["draft", "submitted"] | None = None
    privacy_level: Literal["public", "internal", "private"] | None = None


class MeetingNoteRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    note_id: int
    base_record_id: str | None = None
    owner_open_id: str
    meeting_title: str
    meeting_date: date
    meeting_type: str
    external_participants: str | None = None
    location: str | None = None
    lark_minute_token: str | None = None
    summary: str
    my_reflection: str | None = None
    action_items: str | None = None
    attachment_urls: str | None = None
    tags: str | None = None
    source: Literal["manual", "auto_minute", "imported"]
    review_status: Literal["draft", "submitted"]
    privacy_level: Literal["public", "internal", "private"]
    created_at: datetime
    updated_at: datetime
    participants: list[MeetingParticipantRead] = Field(default_factory=list)
