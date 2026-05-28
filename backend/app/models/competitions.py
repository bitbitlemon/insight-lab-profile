from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Date, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Competition(Base):
    __tablename__ = "competitions"

    comp_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    base_record_id: Mapped[str | None] = mapped_column(String, unique=True, nullable=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    organizer: Mapped[str] = mapped_column(String, nullable=False)
    level: Mapped[str] = mapped_column(String, nullable=False)
    category: Mapped[str | None] = mapped_column(Text, nullable=True)
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    team_lead_open_id: Mapped[str | None] = mapped_column(ForeignKey("members.open_id"), nullable=True)
    award_level: Mapped[str] = mapped_column(String, nullable=False)
    rank: Mapped[str | None] = mapped_column(String, nullable=True)
    score: Mapped[float | None] = mapped_column(Float, nullable=True)
    certificate_url: Mapped[str | None] = mapped_column(String, nullable=True)
    project_url: Mapped[str | None] = mapped_column(String, nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    reflection: Mapped[str | None] = mapped_column(Text, nullable=True)
    cert_files_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    photo_files_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[str] = mapped_column(ForeignKey("members.open_id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )

    team_lead: Mapped["Member | None"] = relationship(
        "Member",
        foreign_keys=[team_lead_open_id],
        back_populates="led_competitions",
    )
    creator: Mapped["Member"] = relationship(
        "Member",
        foreign_keys=[created_by],
        back_populates="created_competitions",
    )
    members: Mapped[list["CompetitionMember"]] = relationship(
        "CompetitionMember",
        back_populates="competition",
        cascade="all, delete-orphan",
    )
