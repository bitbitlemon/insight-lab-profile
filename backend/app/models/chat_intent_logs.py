"""聊天意图日志: 记录每条群消息抽取出的待办意图 + 审批状态."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class ChatIntentLog(Base):
    """群聊意图记录.

    一条 ProjectChatMessage 可能产出 0-N 条 intent. 用 (project_chat_id, source_message_id, intent_seq)
    保证幂等. intent_kind:
      - create_task: 把 payload_json 写成 Task + ProjectLog
      - complete_task: 把已有 Task 标 done + ProjectLog
      - noop: 模型显式判定无意图 (留 trace, 不参与审批)
    status 流转:
      - pending: 等 admin/owner 审批
      - applied: 已落地, applied_task_id / applied_log_id 指向产物
      - rejected: 被拒
      - auto_applied: 高置信度自动落地, 用户可撤销
      - cancelled: 落地后被撤销
    """

    __tablename__ = "chat_intent_logs"
    __table_args__ = (
        UniqueConstraint(
            "project_chat_id", "source_message_id", "intent_seq",
            name="uq_chat_intent_msg_seq",
        ),
        CheckConstraint(
            "intent_kind IN ('create_task','complete_task','noop')",
            name="ck_chat_intent_kind",
        ),
        CheckConstraint(
            "status IN ('pending','applied','rejected','auto_applied','cancelled')",
            name="ck_chat_intent_status",
        ),
        Index("idx_chat_intent_status", "status"),
        Index("idx_chat_intent_project", "project_id", "created_at"),
        Index("idx_chat_intent_chat", "project_chat_id", "created_at"),
    )

    chat_intent_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_chat_id: Mapped[int] = mapped_column(
        ForeignKey("project_chats.project_chat_id", ondelete="CASCADE"), nullable=False
    )
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.project_id", ondelete="CASCADE"), nullable=False
    )
    source_message_id: Mapped[str] = mapped_column(String, nullable=False)
    intent_seq: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    intent_kind: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(String, default="pending", nullable=False)
    confidence: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    title: Mapped[str | None] = mapped_column(String, nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    assignee_name_raw: Mapped[str | None] = mapped_column(String, nullable=True)
    assignee_open_id: Mapped[str | None] = mapped_column(
        ForeignKey("members.open_id"), nullable=True
    )
    due_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    priority: Mapped[str | None] = mapped_column(String, nullable=True)
    matched_task_id: Mapped[int | None] = mapped_column(
        ForeignKey("tasks.task_id", ondelete="SET NULL"), nullable=True
    )
    reasoning: Mapped[str | None] = mapped_column(Text, nullable=True)
    context_window_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    model_name: Mapped[str | None] = mapped_column(String, nullable=True)
    extracted_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    applied_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    applied_task_id: Mapped[int | None] = mapped_column(
        ForeignKey("tasks.task_id", ondelete="SET NULL"), nullable=True
    )
    applied_log_id: Mapped[int | None] = mapped_column(
        ForeignKey("project_logs.log_id", ondelete="SET NULL"), nullable=True
    )
    reviewer_open_id: Mapped[str | None] = mapped_column(
        ForeignKey("members.open_id"), nullable=True
    )
    review_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )
