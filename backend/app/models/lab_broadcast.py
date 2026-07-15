from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class LabBroadcastItem(Base):
    """One task appearance in a lab/project daily broadcast."""

    __tablename__ = "lab_broadcast_items"
    __table_args__ = (
        UniqueConstraint("broadcast_date", "project_chat_id", "task_id", name="uq_lab_broadcast_date_chat_task"),
        Index("idx_lab_broadcast_chat_date", "project_chat_id", "broadcast_date"),
        Index("idx_lab_broadcast_assignee_date", "assignee_open_id", "broadcast_date"),
    )

    broadcast_item_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    broadcast_date: Mapped[date] = mapped_column(Date, nullable=False)
    project_chat_id: Mapped[int] = mapped_column(ForeignKey("project_chats.project_chat_id", ondelete="CASCADE"), nullable=False)
    project_id: Mapped[int | None] = mapped_column(ForeignKey("projects.project_id", ondelete="CASCADE"), nullable=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.task_id", ondelete="CASCADE"), nullable=False)
    assignee_open_id: Mapped[str | None] = mapped_column(String, nullable=True)
    task_status: Mapped[str] = mapped_column(String, nullable=False)
    due_status: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
