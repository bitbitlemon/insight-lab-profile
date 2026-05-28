from datetime import date, datetime

from pydantic import BaseModel, ConfigDict


class TrainingCreate(BaseModel):
    base_record_id: str | None = None
    participant_open_id: str
    name: str
    type: str
    organizer: str | None = None
    start_date: date
    end_date: date | None = None
    location: str | None = None
    hours: float | None = None
    has_certificate: bool = False
    certificate_url: str | None = None
    reflection: str | None = None


class TrainingUpdate(BaseModel):
    base_record_id: str | None = None
    participant_open_id: str | None = None
    name: str | None = None
    type: str | None = None
    organizer: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    location: str | None = None
    hours: float | None = None
    has_certificate: bool | None = None
    certificate_url: str | None = None
    reflection: str | None = None


class TrainingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    training_id: int
    base_record_id: str | None = None
    participant_open_id: str
    name: str
    type: str
    organizer: str | None = None
    start_date: date
    end_date: date | None = None
    location: str | None = None
    hours: float | None = None
    has_certificate: bool
    certificate_url: str | None = None
    reflection: str | None = None
    created_at: datetime
    updated_at: datetime
