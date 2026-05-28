from __future__ import annotations
from datetime import date, datetime
from sqlalchemy import CheckConstraint, Date, DateTime, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db import Base


class Contribution(Base):
    """组织贡献: 心得/活动/分享/文档/其他 — 学生对实验室/团队的非论文非比赛贡献."""

    __tablename__ = "contributions"
    __table_args__ = (
        CheckConstraint(
            "type IN ('event','internal_share','document','reflection','other')",
            name="ck_contributions_type",
        ),
        CheckConstraint(
            "role_in_contribution IN ('organizer','co_organizer','speaker','participant','contributor','other')",
            name="ck_contributions_role",
        ),
        Index("idx_contrib_member", "member_open_id"),
        Index("idx_contrib_type", "type"),
        Index("idx_contrib_date", "occurred_at"),
    )

    contribution_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    base_record_id: Mapped[str | None] = mapped_column(String, unique=True, nullable=True)
    member_open_id: Mapped[str] = mapped_column(ForeignKey("members.open_id"), nullable=False)
    type: Mapped[str] = mapped_column(String, nullable=False)
    title: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    occurred_at: Mapped[date] = mapped_column(Date, nullable=False)
    role_in_contribution: Mapped[str | None] = mapped_column(String, nullable=True)
    hours: Mapped[float | None] = mapped_column(Float, nullable=True)
    score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    proof_url: Mapped[str | None] = mapped_column(String, nullable=True)
    tags: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[str] = mapped_column(ForeignKey("members.open_id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    member: Mapped["Member"] = relationship("Member", foreign_keys=[member_open_id])
    creator: Mapped["Member"] = relationship("Member", foreign_keys=[created_by])
