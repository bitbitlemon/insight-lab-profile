from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Date, DateTime, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Award(Base):
    __tablename__ = "awards"
    __table_args__ = (Index("idx_awards_recipient", "recipient_open_id"),)

    award_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    base_record_id: Mapped[str | None] = mapped_column(String, unique=True, nullable=True)
    recipient_open_id: Mapped[str] = mapped_column(ForeignKey("members.open_id"), nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    level: Mapped[str] = mapped_column(String, nullable=False)
    category: Mapped[str] = mapped_column(String, nullable=False)
    issuer: Mapped[str] = mapped_column(String, nullable=False)
    award_date: Mapped[date] = mapped_column(Date, nullable=False)
    amount: Mapped[float | None] = mapped_column(Float, nullable=True)
    certificate_url: Mapped[str | None] = mapped_column(String, nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[str] = mapped_column(ForeignKey("members.open_id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )

    recipient: Mapped["Member"] = relationship(
        "Member",
        foreign_keys=[recipient_open_id],
        back_populates="received_awards",
    )
    creator: Mapped["Member"] = relationship(
        "Member",
        foreign_keys=[created_by],
        back_populates="created_awards",
    )
