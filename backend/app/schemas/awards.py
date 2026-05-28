from datetime import date, datetime

from pydantic import BaseModel, ConfigDict


class AwardCreate(BaseModel):
    base_record_id: str | None = None
    recipient_open_id: str
    name: str
    level: str
    category: str
    issuer: str
    award_date: date
    amount: float | None = None
    certificate_url: str | None = None
    description: str | None = None
    created_by: str


class AwardUpdate(BaseModel):
    base_record_id: str | None = None
    recipient_open_id: str | None = None
    name: str | None = None
    level: str | None = None
    category: str | None = None
    issuer: str | None = None
    award_date: date | None = None
    amount: float | None = None
    certificate_url: str | None = None
    description: str | None = None
    created_by: str | None = None


class AwardRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    award_id: int
    base_record_id: str | None = None
    recipient_open_id: str
    name: str
    level: str
    category: str
    issuer: str
    award_date: date
    amount: float | None = None
    certificate_url: str | None = None
    description: str | None = None
    created_by: str
    created_at: datetime
    updated_at: datetime
