from __future__ import annotations

from sqlalchemy import ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class MeetingParticipant(Base):
    __tablename__ = "meeting_participants"

    note_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("meeting_notes.note_id", ondelete="CASCADE"),
        primary_key=True,
    )
    member_open_id: Mapped[str] = mapped_column(
        ForeignKey("members.open_id"),
        primary_key=True,
    )

    meeting_note: Mapped["MeetingNote"] = relationship("MeetingNote", back_populates="participants")
    member: Mapped["Member"] = relationship("Member", back_populates="meeting_participants")
