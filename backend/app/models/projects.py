from __future__ import annotations
from datetime import date, datetime
from sqlalchemy import Boolean, CheckConstraint, Date, DateTime, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint
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
        CheckConstraint(
            "project_type IN ('personal','team')",
            name="ck_projects_type",
        ),
        Index("idx_projects_owner", "owner_open_id"),
        Index("idx_projects_status", "status"),
        Index("idx_projects_type", "project_type"),
        Index("idx_projects_department", "department"),
    )

    project_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    base_record_id: Mapped[str | None] = mapped_column(String, unique=True, nullable=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String, default="planning", nullable=False)
    publication_status: Mapped[str] = mapped_column(String, default="draft", nullable=False)
    priority: Mapped[str] = mapped_column(String, default="medium", nullable=False)
    project_type: Mapped[str] = mapped_column(String, default="team", nullable=False)
    owner_open_id: Mapped[str] = mapped_column(ForeignKey("members.open_id"), nullable=False)
    department: Mapped[str | None] = mapped_column(String, nullable=True)
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    target_end_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    actual_end_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
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
    chats: Mapped[list["ProjectChat"]] = relationship("ProjectChat", back_populates="project", cascade="all, delete-orphan")


class ProjectRelation(Base):
    """项目关系: 记录项目调整、衍生和普通关联."""

    __tablename__ = "project_relations"
    __table_args__ = (
        CheckConstraint(
            "relation_type IN ('transformed_to','derived','related')",
            name="ck_project_relations_type",
        ),
        UniqueConstraint(
            "source_project_id", "target_project_id", "relation_type",
            name="uq_project_relations_pair_type",
        ),
        Index("idx_project_relations_source", "source_project_id"),
        Index("idx_project_relations_target", "target_project_id"),
    )

    relation_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    source_project_id: Mapped[int] = mapped_column(ForeignKey("projects.project_id", ondelete="CASCADE"), nullable=False)
    target_project_id: Mapped[int] = mapped_column(ForeignKey("projects.project_id", ondelete="CASCADE"), nullable=False)
    relation_type: Mapped[str] = mapped_column(String, default="related", nullable=False)
    title: Mapped[str | None] = mapped_column(String, nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[str] = mapped_column(ForeignKey("members.open_id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


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
    tags: Mapped[str | None] = mapped_column(Text, nullable=True)
    received_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
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
    publication_status: Mapped[str] = mapped_column(String, default="draft", nullable=False)
    priority: Mapped[str] = mapped_column(String, default="medium", nullable=False)
    assignee_open_id: Mapped[str | None] = mapped_column(ForeignKey("members.open_id"), nullable=True)
    planned_start_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    due_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    today_todo_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    thinking: Mapped[str | None] = mapped_column(Text, nullable=True)
    progress_draft: Mapped[str | None] = mapped_column(Text, nullable=True)
    task_origin: Mapped[str] = mapped_column(String, default="manual", nullable=False)
    received_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_by: Mapped[str] = mapped_column(ForeignKey("members.open_id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False,
    )

    project: Mapped["Project | None"] = relationship("Project", back_populates="tasks")


class ProjectChat(Base):
    """飞书群聊关联: 一个项目可关联多个群聊."""

    __tablename__ = "project_chats"
    __table_args__ = (
        UniqueConstraint("project_id", "chat_id", name="uq_project_chats_project_chat"),
        Index("idx_project_chats_project", "project_id"),
        Index("idx_project_chats_chat", "chat_id"),
    )

    project_chat_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.project_id", ondelete="CASCADE"), nullable=False)
    chat_id: Mapped[str] = mapped_column(String, nullable=False)
    chat_name: Mapped[str | None] = mapped_column(String, nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    selected_topic_key: Mapped[str | None] = mapped_column(String, nullable=True)
    selected_topic_title: Mapped[str | None] = mapped_column(String, nullable=True)
    sync_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_message_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    latest_topic_key: Mapped[str | None] = mapped_column(String, nullable=True)
    latest_topic_title: Mapped[str | None] = mapped_column(String, nullable=True)
    latest_topic_reply_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_by: Mapped[str] = mapped_column(ForeignKey("members.open_id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    project: Mapped["Project"] = relationship("Project", back_populates="chats")
    messages: Mapped[list["ProjectChatMessage"]] = relationship("ProjectChatMessage", back_populates="project_chat", cascade="all, delete-orphan")
    topics: Mapped[list["ProjectChatTopic"]] = relationship("ProjectChatTopic", back_populates="project_chat", cascade="all, delete-orphan")


class ProjectChatMessage(Base):
    """群聊消息镜像: 保留可分析字段和原始 JSON."""

    __tablename__ = "project_chat_messages"
    __table_args__ = (
        UniqueConstraint("project_chat_id", "message_id", name="uq_project_chat_messages_chat_message"),
        Index("idx_pcm_project_time", "project_id", "message_created_at"),
        Index("idx_pcm_chat_time", "project_chat_id", "message_created_at"),
        Index("idx_pcm_topic", "project_chat_id", "topic_key"),
    )

    project_chat_message_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_chat_id: Mapped[int] = mapped_column(ForeignKey("project_chats.project_chat_id", ondelete="CASCADE"), nullable=False)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.project_id", ondelete="CASCADE"), nullable=False)
    chat_id: Mapped[str] = mapped_column(String, nullable=False)
    message_id: Mapped[str] = mapped_column(String, nullable=False)
    topic_key: Mapped[str] = mapped_column(String, nullable=False)
    root_id: Mapped[str | None] = mapped_column(String, nullable=True)
    parent_id: Mapped[str | None] = mapped_column(String, nullable=True)
    thread_id: Mapped[str | None] = mapped_column(String, nullable=True)
    sender_open_id: Mapped[str | None] = mapped_column(String, nullable=True)
    sender_name: Mapped[str | None] = mapped_column(String, nullable=True)
    sender_type: Mapped[str | None] = mapped_column(String, nullable=True)
    msg_type: Mapped[str | None] = mapped_column(String, nullable=True)
    content: Mapped[str | None] = mapped_column(Text, nullable=True)
    raw_json: Mapped[str] = mapped_column(Text, nullable=False)
    deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    updated: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    message_created_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    project_chat: Mapped["ProjectChat"] = relationship("ProjectChat", back_populates="messages")


class ProjectChatTopic(Base):
    """群聊话题聚合: topic_key 通常来自 thread/root/parent, 不存在时退回 message_id."""

    __tablename__ = "project_chat_topics"
    __table_args__ = (
        UniqueConstraint("project_chat_id", "topic_key", name="uq_project_chat_topics_chat_topic"),
        Index("idx_pct_project_reply", "project_id", "last_reply_at"),
    )

    project_chat_topic_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_chat_id: Mapped[int] = mapped_column(ForeignKey("project_chats.project_chat_id", ondelete="CASCADE"), nullable=False)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.project_id", ondelete="CASCADE"), nullable=False)
    topic_key: Mapped[str] = mapped_column(String, nullable=False)
    title: Mapped[str | None] = mapped_column(String, nullable=True)
    first_message_id: Mapped[str | None] = mapped_column(String, nullable=True)
    first_sender_open_id: Mapped[str | None] = mapped_column(String, nullable=True)
    last_message_id: Mapped[str | None] = mapped_column(String, nullable=True)
    last_reply_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    reply_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    project_chat: Mapped["ProjectChat"] = relationship("ProjectChat", back_populates="topics")


class ProjectLog(Base):
    """项目日志/申请: 时间线、指导申请、资源申请和论文节点推进统一记录."""

    __tablename__ = "project_logs"
    __table_args__ = (
        CheckConstraint(
            "kind IN ('note','guidance','server','member_change','paper_stage','notification')",
            name="ck_project_logs_kind",
        ),
        CheckConstraint(
            "status IN ('recorded','pending','pending_approval','approved','rejected','notified')",
            name="ck_project_logs_status",
        ),
        Index("idx_project_logs_project_time", "project_id", "created_at"),
        Index("idx_project_logs_target", "target_open_id"),
        Index("idx_project_logs_approver", "approver_open_id"),
    )

    log_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.project_id", ondelete="CASCADE"), nullable=False)
    actor_open_id: Mapped[str] = mapped_column(ForeignKey("members.open_id"), nullable=False)
    kind: Mapped[str] = mapped_column(String, default="note", nullable=False)
    status: Mapped[str] = mapped_column(String, default="recorded", nullable=False)
    title: Mapped[str] = mapped_column(String, nullable=False)
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    target_open_id: Mapped[str | None] = mapped_column(ForeignKey("members.open_id"), nullable=True)
    approver_open_id: Mapped[str | None] = mapped_column(ForeignKey("members.open_id"), nullable=True)
    resource_type: Mapped[str | None] = mapped_column(String, nullable=True)
    old_value: Mapped[str | None] = mapped_column(String, nullable=True)
    new_value: Mapped[str | None] = mapped_column(String, nullable=True)
    paper_id: Mapped[int | None] = mapped_column(ForeignKey("papers.paper_id"), nullable=True)
    paper_stage: Mapped[str | None] = mapped_column(String, nullable=True)
    paper_status: Mapped[str | None] = mapped_column(String, nullable=True)
    extra_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    notified_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
