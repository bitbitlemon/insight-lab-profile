from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Training(Base):
    __tablename__ = "trainings"
    __table_args__ = (Index("idx_trainings_participant", "participant_open_id"),)

    training_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    base_record_id: Mapped[str | None] = mapped_column(String, unique=True, nullable=True)
    participant_open_id: Mapped[str] = mapped_column(ForeignKey("members.open_id"), nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    type: Mapped[str] = mapped_column(String, nullable=False)
    organizer: Mapped[str | None] = mapped_column(String, nullable=True)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    location: Mapped[str | None] = mapped_column(String, nullable=True)
    hours: Mapped[float | None] = mapped_column(Float, nullable=True)
    has_certificate: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    certificate_url: Mapped[str | None] = mapped_column(String, nullable=True)
    reflection: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )

    participant: Mapped["Member"] = relationship("Member", back_populates="trainings")
