from __future__ import annotations

from sqlalchemy import CheckConstraint, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class CompetitionMember(Base):
    __tablename__ = "competition_members"
    __table_args__ = (
        CheckConstraint("member_role IN ('member','advisor')", name="ck_competition_members_role"),
        Index("idx_cm_member", "member_open_id"),
    )

    comp_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("competitions.comp_id", ondelete="CASCADE"),
        primary_key=True,
    )
    member_open_id: Mapped[str] = mapped_column(
        ForeignKey("members.open_id"),
        primary_key=True,
    )
    member_role: Mapped[str] = mapped_column(String, primary_key=True, default="member", nullable=False)
    contribution_text: Mapped[str | None] = mapped_column(Text, nullable=True)

    competition: Mapped["Competition"] = relationship("Competition", back_populates="members")
    member: Mapped["Member"] = relationship("Member", back_populates="competition_memberships")
