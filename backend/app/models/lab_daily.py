from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class LabDailyReport(Base):
    """Daily plan/summary rows synced from the Feishu Base management table."""

    __tablename__ = "lab_daily_reports"
    __table_args__ = (
        UniqueConstraint("base_record_id", name="uq_lab_daily_report_record"),
        Index("idx_lab_daily_member", "member_open_id"),
        Index("idx_lab_daily_checkin", "checkin_at"),
    )

    daily_report_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    base_record_id: Mapped[str] = mapped_column(String, nullable=False)
    member_open_id: Mapped[str | None] = mapped_column(String, nullable=True)
    member_name: Mapped[str | None] = mapped_column(String, nullable=True)
    checkin_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    thinking_start_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    today_content: Mapped[str | None] = mapped_column(Text, nullable=True)
    yesterday_content: Mapped[str | None] = mapped_column(Text, nullable=True)
    three_day_content: Mapped[str | None] = mapped_column(Text, nullable=True)
    today_messages: Mapped[str | None] = mapped_column(Text, nullable=True)
    daily_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    today_thinking: Mapped[str | None] = mapped_column(Text, nullable=True)
    morning_messages: Mapped[str | None] = mapped_column(Text, nullable=True)
    afternoon_messages: Mapped[str | None] = mapped_column(Text, nullable=True)
    weekly_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    weekly_report: Mapped[str | None] = mapped_column(Text, nullable=True)
    raw_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    synced_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
