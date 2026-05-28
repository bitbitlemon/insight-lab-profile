from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import PointsSummary


class PaperAuthorRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    paper_author_id: int
    base_record_id: str | None = None
    paper_id: int
    author_open_id: str
    author_order: int
    role: str
    affiliation: str | None = None
    created_at: datetime


class PaperCreate(BaseModel):
    base_record_id: str | None = None
    title: str
    authors_text: str
    venue: str
    venue_type: Literal["journal", "conference", "workshop", "preprint"]
    venue_level: str | None = None
    year: int
    publish_date: date | None = None
    doi: str | None = None
    arxiv_id: str | None = None
    url: str | None = None
    pdf_url: str | None = None
    abstract: str | None = None
    status: Literal["published", "accepted", "under_review", "in_progress", "rejected"]
    keywords: str | None = None
    citation_count: int = 0
    notes: str | None = None
    created_by: str | None = None


class PaperUpdate(BaseModel):
    base_record_id: str | None = None
    title: str | None = None
    authors_text: str | None = None
    venue: str | None = None
    venue_type: Literal["journal", "conference", "workshop", "preprint"] | None = None
    venue_level: str | None = None
    year: int | None = None
    publish_date: date | None = None
    doi: str | None = None
    arxiv_id: str | None = None
    url: str | None = None
    pdf_url: str | None = None
    abstract: str | None = None
    status: Literal["published", "accepted", "under_review", "in_progress", "rejected"] | None = None
    keywords: str | None = None
    citation_count: int | None = None
    notes: str | None = None
    created_by: str | None = None


class PaperRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    paper_id: int
    base_record_id: str | None = None
    title: str
    authors_text: str
    venue: str
    venue_type: Literal["journal", "conference", "workshop", "preprint"]
    venue_level: str | None = None
    year: int
    publish_date: date | None = None
    doi: str | None = None
    arxiv_id: str | None = None
    url: str | None = None
    pdf_url: str | None = None
    abstract: str | None = None
    status: Literal["published", "accepted", "under_review", "in_progress", "rejected"]
    keywords: str | None = None
    citation_count: int
    notes: str | None = None
    created_by: str
    created_at: datetime
    updated_at: datetime
    authors: list[PaperAuthorRead] = Field(default_factory=list)
    points_summary: PointsSummary | None = None
