from __future__ import annotations
from datetime import date, datetime, time
from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Index, Integer, String, Text, Time
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db import Base


class CalendarEvent(Base):
    """日历事件: 会议 / 实验室活动 / 私人 / 课程 / 请假 (镜像).

    与飞书日历可双向同步: lark_event_id 不为空表示已同步.
    """

    __tablename__ = "calendar_events"
    __table_args__ = (
        CheckConstraint(
            "event_type IN ('meeting','class','leave','personal','lab','other')",
            name="ck_calendar_events_type",
        ),
        CheckConstraint(
            "sync_status IN ('local','synced','sync_failed','pulled')",
            name="ck_calendar_events_sync_status",
        ),
        Index("idx_cal_organizer", "organizer_open_id"),
        Index("idx_cal_time", "start_at", "end_at"),
        Index("idx_cal_lark_id", "lark_event_id"),
    )

    event_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    lark_event_id: Mapped[str | None] = mapped_column(String, unique=True, nullable=True)
    lark_calendar_id: Mapped[str | None] = mapped_column(String, nullable=True)
    event_type: Mapped[str] = mapped_column(String, default="meeting", nullable=False)
    title: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    location: Mapped[str | None] = mapped_column(String, nullable=True)
    start_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    end_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    all_day: Mapped[bool] = mapped_column(default=False, nullable=False)
    organizer_open_id: Mapped[str] = mapped_column(ForeignKey("members.open_id"), nullable=False)
    attendees_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    sync_status: Mapped[str] = mapped_column(String, default="local", nullable=False)
    lark_synced_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    related_project_id: Mapped[int | None] = mapped_column(ForeignKey("projects.project_id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False,
    )


class ClassSchedule(Base):
    """学生课程表: 每条 = 一节课, 按周重复."""

    __tablename__ = "class_schedules"
    __table_args__ = (
        CheckConstraint("day_of_week BETWEEN 1 AND 7", name="ck_class_dow"),
        Index("idx_class_member", "member_open_id"),
        Index("idx_class_semester", "semester"),
    )

    schedule_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    member_open_id: Mapped[str] = mapped_column(ForeignKey("members.open_id"), nullable=False)
    course_name: Mapped[str] = mapped_column(String, nullable=False)
    teacher: Mapped[str | None] = mapped_column(String, nullable=True)
    location: Mapped[str | None] = mapped_column(String, nullable=True)
    semester: Mapped[str] = mapped_column(String, nullable=False)
    day_of_week: Mapped[int] = mapped_column(Integer, nullable=False)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)
    week_pattern: Mapped[str | None] = mapped_column(String, nullable=True)
    semester_start: Mapped[date | None] = mapped_column(Date, nullable=True)
    semester_end: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False,
    )


class LarkUserStatus(Base):
    """飞书个人状态缓存: 长连接事件写入, 云实验室读取."""

    __tablename__ = "lark_user_statuses"
    __table_args__ = (
        Index("idx_lark_user_status_active", "is_active", "end_at"),
        Index("idx_lark_user_status_updated", "updated_at"),
    )

    member_open_id: Mapped[str] = mapped_column(ForeignKey("members.open_id"), primary_key=True)
    status_id: Mapped[str | None] = mapped_column(String, nullable=True)
    status_type: Mapped[str | None] = mapped_column(String, nullable=True)
    title: Mapped[str | None] = mapped_column(String, nullable=True)
    emoji_key: Mapped[str | None] = mapped_column(String, nullable=True)
    emoji_path: Mapped[str | None] = mapped_column(String, nullable=True)
    presence_status: Mapped[str | None] = mapped_column(String, nullable=True)
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)
    start_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    end_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    raw_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class LeaveRequest(Base):
    """请假申请: 通过审批后会创建飞书 OOO 日程并写本地 CalendarEvent."""

    __tablename__ = "leave_requests"
    __table_args__ = (
        CheckConstraint(
            "leave_type IN ('sick','personal','annual','business','other')",
            name="ck_leave_type",
        ),
        CheckConstraint(
            "status IN ('pending','approved','rejected','cancelled')",
            name="ck_leave_status",
        ),
        Index("idx_leave_member", "member_open_id"),
        Index("idx_leave_status", "status"),
        Index("idx_leave_time", "start_at", "end_at"),
    )

    leave_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    member_open_id: Mapped[str] = mapped_column(ForeignKey("members.open_id"), nullable=False)
    leave_type: Mapped[str] = mapped_column(String, default="personal", nullable=False)
    start_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    end_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String, default="pending", nullable=False)
    approved_by: Mapped[str | None] = mapped_column(ForeignKey("members.open_id"), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    review_comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    lark_event_id: Mapped[str | None] = mapped_column(String, nullable=True)
    calendar_event_id: Mapped[int | None] = mapped_column(ForeignKey("calendar_events.event_id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False,
    )
