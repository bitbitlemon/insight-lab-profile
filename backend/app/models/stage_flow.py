from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class StageChecklistTemplate(Base):
    """按 项目类别 x 阶段 定义的标准检查项模板 (原前端硬编码 stageStandardItems 落库)。"""

    __tablename__ = "stage_checklist_templates"
    __table_args__ = (
        UniqueConstraint("project_category", "stage_title", "item_text", name="uq_stage_templates_item"),
        Index("idx_stage_templates_scope", "project_category", "stage_title"),
    )

    template_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_category: Mapped[str] = mapped_column(String, nullable=False)
    stage_title: Mapped[str] = mapped_column(String, nullable=False)
    item_text: Mapped[str] = mapped_column(String, nullable=False)
    required: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )


class ProjectStageCheck(Base):
    """项目在某阶段对某检查项的完成记录 (checked=是否满足, payload_json=填写内容)。"""

    __tablename__ = "project_stage_checks"
    __table_args__ = (
        UniqueConstraint("project_id", "stage_title", "item_text", name="uq_project_stage_checks_item"),
        Index("idx_project_stage_checks_project", "project_id", "stage_title"),
    )

    check_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.project_id", ondelete="CASCADE"), nullable=False
    )
    stage_title: Mapped[str] = mapped_column(String, nullable=False)
    item_text: Mapped[str] = mapped_column(String, nullable=False)
    checked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    payload_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_by: Mapped[str | None] = mapped_column(ForeignKey("members.open_id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )


class ProjectStageTransition(Base):
    """项目阶段流转历史: 哪个阶段何时被谁推进, 由哪条审批驱动。"""

    __tablename__ = "project_stage_transitions"
    __table_args__ = (
        Index("idx_project_stage_transitions_project", "project_id", "created_at"),
    )

    transition_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.project_id", ondelete="CASCADE"), nullable=False
    )
    from_stage: Mapped[str | None] = mapped_column(String, nullable=True)
    to_stage: Mapped[str | None] = mapped_column(String, nullable=True)
    log_id: Mapped[int | None] = mapped_column(ForeignKey("project_logs.log_id"), nullable=True)
    actor_open_id: Mapped[str | None] = mapped_column(ForeignKey("members.open_id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
