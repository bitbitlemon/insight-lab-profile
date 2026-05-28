from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class MeetingNote(Base):
    __tablename__ = "meeting_notes"
    __table_args__ = (
        CheckConstraint("source IN ('manual','auto_minute','imported')", name="ck_meeting_notes_source"),
        CheckConstraint("review_status IN ('draft','submitted')", name="ck_meeting_notes_review_status"),
        CheckConstraint(
            "privacy_level IN ('public','internal','private')",
            name="ck_meeting_notes_privacy_level",
        ),
        Index("idx_mn_owner", "owner_open_id"),
        Index("idx_mn_date", "meeting_date"),
    )

    note_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    base_record_id: Mapped[str | None] = mapped_column(String, unique=True, nullable=True)
    owner_open_id: Mapped[str] = mapped_column(ForeignKey("members.open_id"), nullable=False)
    meeting_title: Mapped[str] = mapped_column(String, nullable=False)
    meeting_date: Mapped[date] = mapped_column(Date, nullable=False)
    meeting_type: Mapped[str] = mapped_column(String, nullable=False)
    external_participants: Mapped[str | None] = mapped_column(Text, nullable=True)
    location: Mapped[str | None] = mapped_column(String, nullable=True)
    lark_minute_token: Mapped[str | None] = mapped_column(String, nullable=True)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    my_reflection: Mapped[str | None] = mapped_column(Text, nullable=True)
    action_items: Mapped[str | None] = mapped_column(Text, nullable=True)
    attachment_urls: Mapped[str | None] = mapped_column(Text, nullable=True)
    tags: Mapped[str | None] = mapped_column(Text, nullable=True)
    source: Mapped[str] = mapped_column(String, nullable=False)
    review_status: Mapped[str] = mapped_column(String, default="draft", nullable=False)
    privacy_level: Mapped[str] = mapped_column(String, default="internal", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )

    owner: Mapped["Member"] = relationship("Member", back_populates="owned_meeting_notes")
    participants: Mapped[list["MeetingParticipant"]] = relationship(
        "MeetingParticipant",
        back_populates="meeting_note",
        cascade="all, delete-orphan",
    )
