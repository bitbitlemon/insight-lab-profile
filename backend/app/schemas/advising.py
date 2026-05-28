from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict


class AdvisingCreate(BaseModel):
    base_record_id: str | None = None
    student_open_id: str
    advisor_open_id: str
    role: Literal["primary", "co_advisor", "external"]
    start_date: date
    end_date: date | None = None
    notes: str | None = None


class AdvisingUpdate(BaseModel):
    base_record_id: str | None = None
    student_open_id: str | None = None
    advisor_open_id: str | None = None
    role: Literal["primary", "co_advisor", "external"] | None = None
    start_date: date | None = None
    end_date: date | None = None
    notes: str | None = None


class AdvisingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    advising_id: int
    base_record_id: str | None = None
    student_open_id: str
    advisor_open_id: str
    role: Literal["primary", "co_advisor", "external"]
    start_date: date
    end_date: date | None = None
    notes: str | None = None
    created_at: datetime
