from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import CheckConstraint, Date, DateTime, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Member(Base):
    __tablename__ = "members"
    __table_args__ = (
        CheckConstraint("role IN ('student','teacher','staff','admin')", name="ck_members_role"),
        CheckConstraint("status IN ('active','on_leave','graduated','left')", name="ck_members_status"),
        CheckConstraint(
            "privacy_level IN ('public','internal','private')",
            name="ck_members_privacy_level",
        ),
        Index("idx_members_dept", "department"),
        Index("idx_members_role", "role"),
        Index("idx_members_status", "status"),
    )

    open_id: Mapped[str] = mapped_column(String, primary_key=True)
    base_record_id: Mapped[str | None] = mapped_column(String, unique=True, nullable=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    en_name: Mapped[str | None] = mapped_column(String, nullable=True)
    email: Mapped[str | None] = mapped_column(String, nullable=True)
    mobile: Mapped[str | None] = mapped_column(String, nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(String, nullable=True)
    role: Mapped[str] = mapped_column(String, nullable=False)
    department: Mapped[str | None] = mapped_column(String, nullable=True)
    position: Mapped[str | None] = mapped_column(String, nullable=True)
    title: Mapped[str | None] = mapped_column(String, nullable=True)
    signature: Mapped[str | None] = mapped_column(String(50), nullable=True)
    enroll_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    graduate_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    research_area: Mapped[str | None] = mapped_column(Text, nullable=True)
    bio: Mapped[str | None] = mapped_column(Text, nullable=True)
    extra_memberships: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String, default="active", nullable=False)
    privacy_level: Mapped[str] = mapped_column(String, default="internal", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )

    advising_as_student: Mapped[list["Advising"]] = relationship(
        "Advising",
        foreign_keys="Advising.student_open_id",
        back_populates="student",
    )
    advising_as_advisor: Mapped[list["Advising"]] = relationship(
        "Advising",
        foreign_keys="Advising.advisor_open_id",
        back_populates="advisor",
    )
    created_papers: Mapped[list["Paper"]] = relationship(
        "Paper",
        foreign_keys="Paper.created_by",
        back_populates="creator",
    )
    paper_authors: Mapped[list["PaperAuthor"]] = relationship(
        "PaperAuthor",
        back_populates="author",
    )
    led_competitions: Mapped[list["Competition"]] = relationship(
        "Competition",
        foreign_keys="Competition.team_lead_open_id",
        back_populates="team_lead",
    )
    created_competitions: Mapped[list["Competition"]] = relationship(
        "Competition",
        foreign_keys="Competition.created_by",
        back_populates="creator",
    )
    competition_memberships: Mapped[list["CompetitionMember"]] = relationship(
        "CompetitionMember",
        back_populates="member",
    )
    owned_meeting_notes: Mapped[list["MeetingNote"]] = relationship(
        "MeetingNote",
        back_populates="owner",
    )
    meeting_participants: Mapped[list["MeetingParticipant"]] = relationship(
        "MeetingParticipant",
        back_populates="member",
    )
    received_awards: Mapped[list["Award"]] = relationship(
        "Award",
        foreign_keys="Award.recipient_open_id",
        back_populates="recipient",
    )
    created_awards: Mapped[list["Award"]] = relationship(
        "Award",
        foreign_keys="Award.created_by",
        back_populates="creator",
    )
    trainings: Mapped[list["Training"]] = relationship(
        "Training",
        back_populates="participant",
    )
    audit_logs: Mapped[list["AuditLog"]] = relationship(
        "AuditLog",
        back_populates="actor",
    )
