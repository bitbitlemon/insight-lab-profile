from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class AIAssistantConfig(Base):
    """AI 助手配置：通用助手、部门助手、管理助手等可复用画像."""

    __tablename__ = "ai_assistant_configs"
    __table_args__ = (
        CheckConstraint("scope IN ('global','department')", name="ck_ai_assistant_scope"),
        UniqueConstraint("scope", "department", "name", name="uq_ai_assistant_scope_department_name"),
        Index("idx_ai_assistant_scope", "scope"),
        Index("idx_ai_assistant_department", "department"),
    )

    assistant_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    scope: Mapped[str] = mapped_column(String, nullable=False, default="global")
    department: Mapped[str | None] = mapped_column(String, nullable=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    role: Mapped[str] = mapped_column(String, nullable=False, default="management")
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    workflow: Mapped[str | None] = mapped_column(Text, nullable=True)
    cadence: Mapped[str] = mapped_column(String, nullable=False, default="weekly")
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_by: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
