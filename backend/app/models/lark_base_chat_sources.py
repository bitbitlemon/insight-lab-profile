from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class LarkBaseChatSource(Base):
    __tablename__ = "lark_base_chat_sources"
    __table_args__ = (
        UniqueConstraint("base_token", "table_id", name="uq_lark_base_chat_source_table"),
        Index("idx_lark_base_chat_sources_status", "status"),
        Index("idx_lark_base_chat_sources_updated", "updated_at"),
    )

    source_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str | None] = mapped_column(String, nullable=True)
    base_token: Mapped[str] = mapped_column(String, nullable=False)
    table_id: Mapped[str] = mapped_column(String, nullable=False)
    view_id: Mapped[str | None] = mapped_column(String, nullable=True)
    base_url: Mapped[str] = mapped_column(Text, nullable=False)
    field_map_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String, default="active", nullable=False)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[str | None] = mapped_column(ForeignKey("members.open_id"), nullable=True)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_analyzed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class LarkBaseChatMessage(Base):
    __tablename__ = "lark_base_chat_messages"
    __table_args__ = (
        UniqueConstraint("source_id", "record_id", name="uq_lark_base_chat_message_record"),
        Index("idx_lark_base_chat_messages_status", "import_status"),
        Index("idx_lark_base_chat_messages_project", "matched_project_id"),
        Index("idx_lark_base_chat_messages_time", "message_created_at"),
        Index("idx_lark_base_chat_messages_source_status", "source_id", "import_status"),
    )

    base_chat_message_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    source_id: Mapped[int] = mapped_column(ForeignKey("lark_base_chat_sources.source_id", ondelete="CASCADE"), nullable=False)
    record_id: Mapped[str] = mapped_column(String, nullable=False)
    message_id: Mapped[str | None] = mapped_column(String, nullable=True)
    chat_id: Mapped[str | None] = mapped_column(String, nullable=True)
    chat_name: Mapped[str | None] = mapped_column(String, nullable=True)
    sender_open_id: Mapped[str | None] = mapped_column(String, nullable=True)
    sender_name: Mapped[str | None] = mapped_column(String, nullable=True)
    reply_message_id: Mapped[str | None] = mapped_column(String, nullable=True)
    content: Mapped[str | None] = mapped_column(Text, nullable=True)
    full_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    attachment_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    cloud_doc_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    message_created_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    raw_json: Mapped[str] = mapped_column(Text, nullable=False)
    import_status: Mapped[str] = mapped_column(String, default="new", nullable=False)
    matched_project_id: Mapped[int | None] = mapped_column(ForeignKey("projects.project_id"), nullable=True)
    match_confidence: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    archived_log_id: Mapped[int | None] = mapped_column(ForeignKey("project_logs.log_id"), nullable=True)
    batch_key: Mapped[str | None] = mapped_column(String, nullable=True)
    last_analyzed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
