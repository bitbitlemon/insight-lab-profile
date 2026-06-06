from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class LabSpace(Base):
    """云实验室空间节点: 楼层 / 区域 / 房间 / 工位 / 虚拟空间."""

    __tablename__ = "lab_spaces"
    __table_args__ = (
        CheckConstraint(
            "space_type IN ('campus','building','floor','zone','room','workstation','virtual')",
            name="ck_lab_spaces_type",
        ),
        CheckConstraint(
            "status IN ('active','inactive','maintenance','retired')",
            name="ck_lab_spaces_status",
        ),
        Index("idx_lab_spaces_parent", "parent_space_id"),
        Index("idx_lab_spaces_type", "space_type"),
        Index("idx_lab_spaces_status", "status"),
        Index("idx_lab_spaces_department", "department"),
    )

    space_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    parent_space_id: Mapped[int | None] = mapped_column(ForeignKey("lab_spaces.space_id"), nullable=True)
    code: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    space_type: Mapped[str] = mapped_column(String, default="room", nullable=False)
    status: Mapped[str] = mapped_column(String, default="active", nullable=False)
    capacity: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    department: Mapped[str | None] = mapped_column(String, nullable=True)
    location_label: Mapped[str | None] = mapped_column(String, nullable=True)
    map_x: Mapped[float | None] = mapped_column(Float, nullable=True)
    map_y: Mapped[float | None] = mapped_column(Float, nullable=True)
    map_z: Mapped[float | None] = mapped_column(Float, nullable=True)
    width: Mapped[float | None] = mapped_column(Float, nullable=True)
    depth: Mapped[float | None] = mapped_column(Float, nullable=True)
    height: Mapped[float | None] = mapped_column(Float, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    metadata_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[str | None] = mapped_column(ForeignKey("members.open_id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    resources: Mapped[list["LabResource"]] = relationship("LabResource", back_populates="space", cascade="all, delete-orphan")


class LabResource(Base):
    """云实验室资源: 会议室、工位、设备、服务器、GPU、账号等可管理对象."""

    __tablename__ = "lab_resources"
    __table_args__ = (
        CheckConstraint(
            "resource_type IN ('meeting_room','workstation','equipment','server','gpu','storage','software','account','other')",
            name="ck_lab_resources_type",
        ),
        CheckConstraint(
            "status IN ('available','occupied','maintenance','disabled','retired')",
            name="ck_lab_resources_status",
        ),
        Index("idx_lab_resources_space", "space_id"),
        Index("idx_lab_resources_type", "resource_type"),
        Index("idx_lab_resources_status", "status"),
        Index("idx_lab_resources_manager", "manager_open_id"),
    )

    resource_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    space_id: Mapped[int | None] = mapped_column(ForeignKey("lab_spaces.space_id", ondelete="SET NULL"), nullable=True)
    code: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    resource_type: Mapped[str] = mapped_column(String, default="other", nullable=False)
    status: Mapped[str] = mapped_column(String, default="available", nullable=False)
    capacity: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    owner_department: Mapped[str | None] = mapped_column(String, nullable=True)
    manager_open_id: Mapped[str | None] = mapped_column(ForeignKey("members.open_id"), nullable=True)
    bookable: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    requires_approval: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    specs_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[str | None] = mapped_column(ForeignKey("members.open_id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    space: Mapped["LabSpace | None"] = relationship("LabSpace", back_populates="resources")


class LabReservation(Base):
    """资源预约: 会议室/设备/工位等统一预约和审批."""

    __tablename__ = "lab_reservations"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending','approved','rejected','cancelled','completed')",
            name="ck_lab_reservations_status",
        ),
        Index("idx_lab_reservations_resource_time", "resource_id", "start_at", "end_at"),
        Index("idx_lab_reservations_member_time", "member_open_id", "start_at"),
        Index("idx_lab_reservations_status", "status"),
    )

    reservation_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    resource_id: Mapped[int] = mapped_column(ForeignKey("lab_resources.resource_id", ondelete="CASCADE"), nullable=False)
    space_id: Mapped[int | None] = mapped_column(ForeignKey("lab_spaces.space_id", ondelete="SET NULL"), nullable=True)
    member_open_id: Mapped[str] = mapped_column(ForeignKey("members.open_id"), nullable=False)
    title: Mapped[str] = mapped_column(String, nullable=False)
    purpose: Mapped[str | None] = mapped_column(Text, nullable=True)
    start_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    end_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    status: Mapped[str] = mapped_column(String, default="pending", nullable=False)
    attendee_open_ids_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    related_project_id: Mapped[int | None] = mapped_column(ForeignKey("projects.project_id"), nullable=True)
    related_calendar_event_id: Mapped[int | None] = mapped_column(ForeignKey("calendar_events.event_id"), nullable=True)
    lark_event_id: Mapped[str | None] = mapped_column(String, nullable=True)
    approved_by: Mapped[str | None] = mapped_column(ForeignKey("members.open_id"), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    review_comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[str] = mapped_column(ForeignKey("members.open_id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class LabOccupancy(Base):
    """当前/近期占用状态: 人员和资源在空间中的状态镜像."""

    __tablename__ = "lab_occupancy"
    __table_args__ = (
        CheckConstraint(
            "status IN ('present','working','meeting','class','away','leave','offline','reserved')",
            name="ck_lab_occupancy_status",
        ),
        CheckConstraint(
            "source IN ('manual','calendar','class','leave','reservation','device','system')",
            name="ck_lab_occupancy_source",
        ),
        UniqueConstraint("space_id", "member_open_id", "source", name="uq_lab_occupancy_space_member_source"),
        Index("idx_lab_occupancy_space", "space_id"),
        Index("idx_lab_occupancy_resource", "resource_id"),
        Index("idx_lab_occupancy_member", "member_open_id"),
        Index("idx_lab_occupancy_expires", "expires_at"),
    )

    occupancy_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    space_id: Mapped[int] = mapped_column(ForeignKey("lab_spaces.space_id", ondelete="CASCADE"), nullable=False)
    resource_id: Mapped[int | None] = mapped_column(ForeignKey("lab_resources.resource_id", ondelete="SET NULL"), nullable=True)
    member_open_id: Mapped[str | None] = mapped_column(ForeignKey("members.open_id"), nullable=True)
    status: Mapped[str] = mapped_column(String, default="present", nullable=False)
    source: Mapped[str] = mapped_column(String, default="manual", nullable=False)
    confidence: Mapped[float] = mapped_column(Float, default=1.0, nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    expected_end_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_by: Mapped[str | None] = mapped_column(ForeignKey("members.open_id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class LabInteraction(Base):
    """云实验室成员互动: 鲜花 / 鸡蛋投递记录."""

    __tablename__ = "lab_interactions"
    __table_args__ = (
        CheckConstraint("kind IN ('flower','egg','throw')", name="ck_lab_interactions_kind"),
        Index("idx_lab_interactions_target", "target_open_id"),
        Index("idx_lab_interactions_actor", "actor_open_id"),
        Index("idx_lab_interactions_created", "created_at"),
    )

    interaction_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    target_open_id: Mapped[str] = mapped_column(ForeignKey("members.open_id"), nullable=False)
    actor_open_id: Mapped[str] = mapped_column(ForeignKey("members.open_id"), nullable=False)
    kind: Mapped[str] = mapped_column(String, nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
