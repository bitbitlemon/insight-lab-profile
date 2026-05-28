from __future__ import annotations
from datetime import date, datetime
from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db import Base


PIPELINE_STAGES = ("topic", "research", "experiment", "draft", "submit")
PIPELINE_STAGE_LABEL = {
    "topic": "选题",
    "research": "调研",
    "experiment": "实验",
    "draft": "初稿",
    "submit": "投稿",
}


class PaperMilestone(Base):
    """论文流水线节点: 选题/调研/实验/初稿/投稿. 每篇论文 5 个节点."""

    __tablename__ = "paper_milestones"
    __table_args__ = (
        CheckConstraint(
            "stage IN ('topic','research','experiment','draft','submit')",
            name="ck_paper_milestone_stage",
        ),
        CheckConstraint(
            "status IN ('pending','in_progress','done','blocked')",
            name="ck_paper_milestone_status",
        ),
        UniqueConstraint("paper_id", "stage", name="uq_paper_milestone_stage"),
        Index("idx_milestone_paper", "paper_id"),
        Index("idx_milestone_owner", "owner_open_id"),
        Index("idx_milestone_status", "status"),
    )

    milestone_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    base_record_id: Mapped[str | None] = mapped_column(String, unique=True, nullable=True)
    paper_id: Mapped[int] = mapped_column(ForeignKey("papers.paper_id", ondelete="CASCADE"), nullable=False)
    stage: Mapped[str] = mapped_column(String, nullable=False)
    owner_open_id: Mapped[str | None] = mapped_column(ForeignKey("members.open_id"), nullable=True)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String, default="pending", nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    paper: Mapped["Paper"] = relationship("Paper", foreign_keys=[paper_id])
    owner: Mapped["Member"] = relationship("Member", foreign_keys=[owner_open_id])
