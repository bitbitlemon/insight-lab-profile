from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict


class MemberCreate(BaseModel):
    open_id: str
    base_record_id: str | None = None
    name: str
    en_name: str | None = None
    email: str | None = None
    mobile: str | None = None
    avatar_url: str | None = None
    role: Literal["student", "teacher", "staff", "admin"]
    department: str | None = None
    position: str | None = None
    title: str | None = None
    signature: str | None = None
    enroll_date: date | None = None
    graduate_date: date | None = None
    research_area: str | None = None
    bio: str | None = None
    status: Literal["active", "on_leave", "graduated", "left"] = "active"
    privacy_level: Literal["public", "internal", "private"] = "internal"


class MemberUpdate(BaseModel):
    base_record_id: str | None = None
    name: str | None = None
    en_name: str | None = None
    email: str | None = None
    mobile: str | None = None
    avatar_url: str | None = None
    role: Literal["student", "teacher", "staff", "admin"] | None = None
    department: str | None = None
    position: str | None = None
    title: str | None = None
    signature: str | None = None
    enroll_date: date | None = None
    graduate_date: date | None = None
    research_area: str | None = None
    bio: str | None = None
    status: Literal["active", "on_leave", "graduated", "left"] | None = None
    privacy_level: Literal["public", "internal", "private"] | None = None


class MemberRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    open_id: str
    base_record_id: str | None = None
    name: str
    en_name: str | None = None
    email: str | None = None
    mobile: str | None = None
    avatar_url: str | None = None
    role: Literal["student", "teacher", "staff", "admin"]
    department: str | None = None
    position: str | None = None
    title: str | None = None
    signature: str | None = None
    enroll_date: date | None = None
    graduate_date: date | None = None
    research_area: str | None = None
    bio: str | None = None
    extra_memberships: str | None = None
    status: Literal["active", "on_leave", "graduated", "left"]
    privacy_level: Literal["public", "internal", "private"]
    created_at: datetime
    updated_at: datetime
