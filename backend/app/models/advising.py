from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Advising(Base):
    __tablename__ = "advising"
    __table_args__ = (
        CheckConstraint("role IN ('primary','co_advisor','external')", name="ck_advising_role"),
        Index("idx_advising_student", "student_open_id"),
        Index("idx_advising_advisor", "advisor_open_id"),
    )

    advising_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    base_record_id: Mapped[str | None] = mapped_column(String, unique=True, nullable=True)
    student_open_id: Mapped[str] = mapped_column(ForeignKey("members.open_id"), nullable=False)
    advisor_open_id: Mapped[str] = mapped_column(ForeignKey("members.open_id"), nullable=False)
    role: Mapped[str] = mapped_column(String, nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    student: Mapped["Member"] = relationship(
        "Member",
        foreign_keys=[student_open_id],
        back_populates="advising_as_student",
    )
    advisor: Mapped["Member"] = relationship(
        "Member",
        foreign_keys=[advisor_open_id],
        back_populates="advising_as_advisor",
    )
