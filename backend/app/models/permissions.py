from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class PermissionAssignment(Base):
    __tablename__ = "permission_assignments"
    __table_args__ = (
        CheckConstraint(
            "role_key IN ('super_admin','bu_minister','bu_deputy','department_minister','department_deputy')",
            name="ck_permission_assignments_role",
        ),
        CheckConstraint(
            "scope_type IN ('global','bu','department')",
            name="ck_permission_assignments_scope",
        ),
        UniqueConstraint(
            "member_open_id", "role_key", "scope_type", "scope_value",
            name="uq_permission_assignments_member_role_scope",
        ),
        Index("idx_permission_assignments_member", "member_open_id"),
        Index("idx_permission_assignments_role_scope", "role_key", "scope_type", "scope_value"),
    )

    assignment_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    member_open_id: Mapped[str] = mapped_column(ForeignKey("members.open_id"), nullable=False)
    role_key: Mapped[str] = mapped_column(String, nullable=False)
    scope_type: Mapped[str] = mapped_column(String, default="global", nullable=False)
    scope_value: Mapped[str | None] = mapped_column(String, nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    assigned_by: Mapped[str | None] = mapped_column(ForeignKey("members.open_id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
