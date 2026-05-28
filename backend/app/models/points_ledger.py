from __future__ import annotations
from datetime import date, datetime
from sqlalchemy import Boolean, CheckConstraint, Date, DateTime, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db import Base


class PointsLedger(Base):
    """积分台账 v2: 含审批 / 申诉 / 封账 / 规则版本 / 快照字段.

    source_type ∈ paper / competition / contribution / duty / adjust
    status ∈ draft / pending_review / approved / rejected / disputed / settled / superseded
    final_points = base_points × share_ratio × decay_factor × cap_adjustment_factor
    """

    __tablename__ = "points_ledger"
    __table_args__ = (
        CheckConstraint(
            "source_type IN ('paper','competition','contribution','duty','adjust',"
            "'grant','ip','industrial','product_stage','penalty','training')",
            name="ck_points_source_type",
        ),
        CheckConstraint(
            "category IN ('business','industrial','public','penalty')",
            name="ck_points_category",
        ),
        CheckConstraint(
            "status IN ('draft','pending_review','approved','rejected','disputed','settled','superseded')",
            name="ck_points_status",
        ),
        Index("idx_points_member", "member_open_id"),
        Index("idx_points_source", "source_type", "source_id"),
        Index("idx_points_date", "occurred_at"),
        Index("idx_points_status", "status"),
        Index("idx_points_period", "settlement_period"),
        Index("idx_points_category", "category"),
    )

    ledger_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    base_record_id: Mapped[str | None] = mapped_column(String, unique=True, nullable=True)
    member_open_id: Mapped[str] = mapped_column(ForeignKey("members.open_id"), nullable=False)
    category: Mapped[str] = mapped_column(String, default="business", nullable=False)
    source_type: Mapped[str] = mapped_column(String, nullable=False)
    source_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    occurred_at: Mapped[date] = mapped_column(Date, nullable=False)
    base_points: Mapped[float] = mapped_column(Float, nullable=False)
    share_ratio: Mapped[float] = mapped_column(Float, default=1.0, nullable=False)
    decay_factor: Mapped[float] = mapped_column(Float, default=1.0, nullable=False)
    cap_adjustment_factor: Mapped[float] = mapped_column(Float, default=1.0, nullable=False)
    final_points: Mapped[float] = mapped_column(Float, nullable=False)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    status: Mapped[str] = mapped_column(String, default="approved", nullable=False)
    calculation_rule_version: Mapped[str | None] = mapped_column(String, nullable=True)
    source_snapshot_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    evidence_urls_json: Mapped[str | None] = mapped_column(Text, nullable=True)

    submitted_by: Mapped[str | None] = mapped_column(ForeignKey("members.open_id"), nullable=True)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    approved_by: Mapped[str | None] = mapped_column(ForeignKey("members.open_id"), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    review_comment: Mapped[str | None] = mapped_column(Text, nullable=True)

    disputed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    disputed_by: Mapped[str | None] = mapped_column(ForeignKey("members.open_id"), nullable=True)
    disputed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    dispute_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    resolution_status: Mapped[str | None] = mapped_column(String, nullable=True)
    resolved_by: Mapped[str | None] = mapped_column(ForeignKey("members.open_id"), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    resolution_note: Mapped[str | None] = mapped_column(Text, nullable=True)

    settlement_period: Mapped[str | None] = mapped_column(String, nullable=True)
    locked_by: Mapped[str | None] = mapped_column(ForeignKey("members.open_id"), nullable=True)
    locked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    supersedes_ledger_id: Mapped[int | None] = mapped_column(Integer, nullable=True)

    created_by: Mapped[str | None] = mapped_column(ForeignKey("members.open_id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    member: Mapped["Member"] = relationship("Member", foreign_keys=[member_open_id])
