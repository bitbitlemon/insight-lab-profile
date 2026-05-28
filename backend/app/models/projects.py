from __future__ import annotations
from datetime import date, datetime
from sqlalchemy import CheckConstraint, Date, DateTime, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db import Base


class Project(Base):
    """项目: 团队工作单元, 可关联论文/比赛/贡献等成果."""

    __tablename__ = "projects"
    __table_args__ = (
        CheckConstraint(
            "status IN ('planning','active','paused','completed','archived')",
            name="ck_projects_status",
        ),
        CheckConstraint(
            "priority IN ('low','medium','high','urgent')",
            name="ck_projects_priority",
        ),
        Index("idx_projects_owner", "owner_open_id"),
        Index("idx_projects_status", "status"),
        Index("idx_projects_department", "department"),
    )

    project_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    base_record_id: Mapped[str | None] = mapped_column(String, unique=True, nullable=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String, default="planning", nullable=False)
    priority: Mapped[str] = mapped_column(String, default="medium", nullable=False)
    owner_open_id: Mapped[str] = mapped_column(ForeignKey("members.open_id"), nullable=False)
    department: Mapped[str | None] = mapped_column(String, nullable=True)
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    target_end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    actual_end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    tags: Mapped[str | None] = mapped_column(Text, nullable=True)
    points_awarded: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_by: Mapped[str] = mapped_column(ForeignKey("members.open_id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False,
    )

    members: Mapped[list["ProjectMember"]] = relationship("ProjectMember", back_populates="project", cascade="all, delete-orphan")
    tasks: Mapped[list["Task"]] = relationship("Task", back_populates="project", cascade="all, delete-orphan")


class ProjectMember(Base):
    __tablename__ = "project_members"
    __table_args__ = (
        CheckConstraint(
            "role IN ('owner','co_lead','member','observer')",
            name="ck_project_members_role",
        ),
        Index("idx_pm_member", "member_open_id"),
    )

    project_id: Mapped[int] = mapped_column(ForeignKey("projects.project_id", ondelete="CASCADE"), primary_key=True)
    member_open_id: Mapped[str] = mapped_column(ForeignKey("members.open_id"), primary_key=True)
    role: Mapped[str] = mapped_column(String, default="member", nullable=False)
    share_ratio: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    joined_at: Mapped[date] = mapped_column(Date, default=date.today, nullable=False)
    left_at: Mapped[date | None] = mapped_column(Date, nullable=True)

    project: Mapped["Project"] = relationship("Project", back_populates="members")


class Task(Base):
    """任务: 可挂在项目下, 也可独立 (project_id=null = 个人待办)."""

    __tablename__ = "tasks"
    __table_args__ = (
        CheckConstraint(
            "status IN ('todo','in_progress','done','blocked','cancelled')",
            name="ck_tasks_status",
        ),
        CheckConstraint(
            "priority IN ('low','medium','high','urgent')",
            name="ck_tasks_priority",
        ),
        Index("idx_tasks_assignee", "assignee_open_id"),
        Index("idx_tasks_project", "project_id"),
        Index("idx_tasks_due", "due_date"),
        Index("idx_tasks_status", "status"),
    )

    task_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    base_record_id: Mapped[str | None] = mapped_column(String, unique=True, nullable=True)
    project_id: Mapped[int | None] = mapped_column(ForeignKey("projects.project_id", ondelete="CASCADE"), nullable=True)
    parent_task_id: Mapped[int | None] = mapped_column(ForeignKey("tasks.task_id"), nullable=True)
    title: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String, default="todo", nullable=False)
    priority: Mapped[str] = mapped_column(String, default="medium", nullable=False)
    assignee_open_id: Mapped[str | None] = mapped_column(ForeignKey("members.open_id"), nullable=True)
    planned_start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_by: Mapped[str] = mapped_column(ForeignKey("members.open_id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False,
    )

    project: Mapped["Project | None"] = relationship("Project", back_populates="tasks")
