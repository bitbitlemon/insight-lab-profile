from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, field_validator


class MomentImage(BaseModel):
    file_token: str
    name: str | None = None


class MomentAuthor(BaseModel):
    open_id: str
    name: str
    avatar_url: str | None = None
    title: str | None = None
    position: str | None = None


class MomentCommentRead(BaseModel):
    id: int
    post_id: int
    author: MomentAuthor
    content: str
    created_at: datetime


class MomentPostRead(BaseModel):
    id: int
    author: MomentAuthor
    content: str | None = None
    images: list[MomentImage] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime
    likes_count: int = 0
    comments_count: int = 0
    i_liked: bool = False
    recent_comments: list[MomentCommentRead] = Field(default_factory=list)

    @field_validator("images", mode="before")
    @classmethod
    def _coerce_images(cls, v: Any) -> Any:
        if v is None:
            return []
        return v


class MomentPostCreate(BaseModel):
    content: str | None = Field(None, max_length=2000)
    images: list[MomentImage] = Field(default_factory=list, max_length=9)


class MomentCommentCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=500)


class MomentListResponse(BaseModel):
    items: list[MomentPostRead]
    next_cursor: int | None = None
