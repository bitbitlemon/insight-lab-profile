from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class AIChatSubmission(Base):
    """Raw AI-chat transcript sent to the Feishu bot for project-log archival."""

    __tablename__ = "ai_chat_submissions"
    __table_args__ = (
        Index("idx_ai_chat_submissions_sender", "sender_open_id"),
        Index("idx_ai_chat_submissions_project", "matched_project_id"),
        Index("idx_ai_chat_submissions_status", "status"),
        Index("idx_ai_chat_submissions_created", "created_at"),
    )

    submission_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    sender_open_id: Mapped[str | None] = mapped_column(ForeignKey("members.open_id"), nullable=True)
    message_id: Mapped[str | None] = mapped_column(String, nullable=True)
    chat_id: Mapped[str | None] = mapped_column(String, nullable=True)
    raw_text: Mapped[str] = mapped_column(Text, nullable=False)
    source_ai_name: Mapped[str | None] = mapped_column(String, nullable=True)
    matched_project_id: Mapped[int | None] = mapped_column(ForeignKey("projects.project_id"), nullable=True)
    matched_task_id: Mapped[int | None] = mapped_column(ForeignKey("tasks.task_id"), nullable=True)
    confidence: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    stage: Mapped[str | None] = mapped_column(String, nullable=True)
    log_type: Mapped[str | None] = mapped_column(String, nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    extracted_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String, default="pending", nullable=False)
    applied_log_id: Mapped[int | None] = mapped_column(ForeignKey("project_logs.log_id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
