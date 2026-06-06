from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class AppUsageDaily(Base):
    __tablename__ = "app_usage_daily"
    __table_args__ = (
        UniqueConstraint("usage_date", "member_open_id", "app_key", name="uq_app_usage_daily_member_app"),
        Index("idx_app_usage_daily_date", "usage_date"),
        Index("idx_app_usage_daily_member", "member_open_id"),
        Index("idx_app_usage_daily_app", "app_key"),
    )

    usage_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    usage_date: Mapped[date] = mapped_column(Date, nullable=False)
    member_open_id: Mapped[str] = mapped_column(ForeignKey("members.open_id"), nullable=False)
    app_key: Mapped[str] = mapped_column(String, default="app", nullable=False)
    first_seen_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    heartbeat_count: Mapped[int] = mapped_column(Integer, default=1, nullable=False)


class AppPresence(Base):
    __tablename__ = "app_presence"
    __table_args__ = (
        UniqueConstraint("member_open_id", "page", name="uq_app_presence_member_page"),
        Index("idx_app_presence_page_seen", "page", "last_seen_at"),
        Index("idx_app_presence_member", "member_open_id"),
    )

    presence_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    member_open_id: Mapped[str] = mapped_column(ForeignKey("members.open_id"), nullable=False)
    page: Mapped[str] = mapped_column(String, nullable=False)
    first_seen_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    user_agent: Mapped[str | None] = mapped_column(String, nullable=True)
    ip: Mapped[str | None] = mapped_column(String, nullable=True)


class SnakeScore(Base):
    __tablename__ = "snake_scores"
    __table_args__ = (
        Index("idx_snake_scores_score", "score"),
        Index("idx_snake_scores_member", "member_open_id"),
        Index("idx_snake_scores_created", "created_at"),
    )

    score_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    member_open_id: Mapped[str] = mapped_column(ForeignKey("members.open_id"), nullable=False)
    score: Mapped[int] = mapped_column(Integer, nullable=False)
    duration_seconds: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
