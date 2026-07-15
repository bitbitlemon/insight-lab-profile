from __future__ import annotations

from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class ApprovalRule(Base):
    """按 项目类别 x 阶段 预设的阶段审批规则: 审批人列表 + 审批方式。

    stage_title 为空表示对该类别所有阶段生效; 精确匹配的规则优先于通配规则。
    """

    __tablename__ = "approval_rules"
    __table_args__ = (
        CheckConstraint("mode IN ('any','all')", name="ck_approval_rules_mode"),
        UniqueConstraint("project_category", "stage_title", name="uq_approval_rules_scope"),
    )

    rule_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_category: Mapped[str] = mapped_column(String, nullable=False)
    stage_title: Mapped[str | None] = mapped_column(String, nullable=True)
    mode: Mapped[str] = mapped_column(String, default="any", nullable=False)
    approver_open_ids: Mapped[str] = mapped_column(Text, nullable=False)  # JSON list[str]
    enabled: Mapped[bool] = mapped_column(default=True, nullable=False)
    created_by: Mapped[str | None] = mapped_column(ForeignKey("members.open_id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )


class ProjectLogApproval(Base):
    """一条审批日志下每个审批人的独立决策记录 (真会签的载体)。"""

    __tablename__ = "project_log_approvals"
    __table_args__ = (
        CheckConstraint(
            "decision IN ('pending','approved','rejected','skipped')",
            name="ck_project_log_approvals_decision",
        ),
        UniqueConstraint("log_id", "approver_open_id", name="uq_project_log_approvals_approver"),
        Index("idx_project_log_approvals_approver", "approver_open_id", "decision"),
    )

    approval_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    log_id: Mapped[int] = mapped_column(
        ForeignKey("project_logs.log_id", ondelete="CASCADE"), nullable=False
    )
    approver_open_id: Mapped[str] = mapped_column(ForeignKey("members.open_id"), nullable=False)
    decision: Mapped[str] = mapped_column(String, default="pending", nullable=False)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
