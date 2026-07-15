from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class LarkDocWatch(Base):
    """Feishu cloud document watched for automatic AI-chat re-archival."""

    __tablename__ = "lark_doc_watches"
    __table_args__ = (
        Index("idx_lark_doc_watches_status", "status"),
        Index("idx_lark_doc_watches_project", "matched_project_id"),
        Index("idx_lark_doc_watches_checked", "last_checked_at"),
    )

    watch_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    doc_url: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    sender_open_id: Mapped[str | None] = mapped_column(ForeignKey("members.open_id"), nullable=True)
    chat_id: Mapped[str | None] = mapped_column(String, nullable=True)
    matched_project_id: Mapped[int | None] = mapped_column(ForeignKey("projects.project_id"), nullable=True)
    matched_task_id: Mapped[int | None] = mapped_column(ForeignKey("tasks.task_id"), nullable=True)
    last_content_hash: Mapped[str | None] = mapped_column(String, nullable=True)
    last_submission_id: Mapped[int | None] = mapped_column(ForeignKey("ai_chat_submissions.submission_id"), nullable=True)
    status: Mapped[str] = mapped_column(String, default="active", nullable=False)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_checked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
