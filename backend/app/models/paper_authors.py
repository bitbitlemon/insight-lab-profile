from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class PaperAuthor(Base):
    __tablename__ = "paper_authors"
    __table_args__ = (
        UniqueConstraint("paper_id", "author_open_id", name="uq_paper_authors_paper_author"),
        UniqueConstraint("paper_id", "author_order", name="uq_paper_authors_paper_order"),
        Index("idx_pa_author", "author_open_id"),
    )

    paper_author_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    base_record_id: Mapped[str | None] = mapped_column(String, unique=True, nullable=True)
    paper_id: Mapped[int] = mapped_column(
        ForeignKey("papers.paper_id", ondelete="CASCADE"),
        nullable=False,
    )
    author_open_id: Mapped[str] = mapped_column(ForeignKey("members.open_id"), nullable=False)
    author_order: Mapped[int] = mapped_column(Integer, nullable=False)
    role: Mapped[str] = mapped_column(Text, nullable=False)
    affiliation: Mapped[str | None] = mapped_column(String, nullable=True)
    contribution_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    paper: Mapped["Paper"] = relationship("Paper", back_populates="authors")
    author: Mapped["Member"] = relationship("Member", back_populates="paper_authors")
