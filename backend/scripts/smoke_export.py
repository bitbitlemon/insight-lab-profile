"""W6 导出 smoke test: 用临时 in-memory sqlite 验证三个导出函数."""
from __future__ import annotations
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.db import Base
from app.models import (
    Member, Paper, PaperAuthor, Competition, CompetitionMember,
    Award, Training,
)
from app.services.exporters import (
    resume_markdown, members_excel, yearly_report_markdown,
)


def main() -> int:
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    S = sessionmaker(bind=engine)
    db = S()

    m = Member(
        open_id="ou_test_001",
        name="张三",
        en_name="San Zhang",
        email="zhangsan@example.com",
        mobile="13800138000",
        role="student",
        department="信智院",
        title="博士研究生",
        enroll_date=date(2024, 9, 1),
        research_area='["噪声标签学习","视觉表征"]',
        bio="某实验室博士生.",
        status="active",
        privacy_level="internal",
    )
    db.add(m)
    db.flush()

    p = Paper(
        title="Robust Learning under Noisy Labels",
        authors_text="Zhang San, Li Si",
        venue="NeurIPS",
        venue_type="conference",
        venue_level="CCF-A",
        year=2025,
        publish_date=date(2025, 12, 1),
        doi="10.1234/neurips.2025.001",
        status="published",
        created_by=m.open_id,
    )
    db.add(p)
    db.flush()
    db.add(PaperAuthor(paper_id=p.paper_id, author_open_id=m.open_id, author_order=1, role="first"))

    c = Competition(
        name="科学智能大赛 AI4S",
        organizer="上海科学智能研究院",
        level="国家级",
        category="AI",
        start_date=date(2025, 5, 1),
        end_date=date(2025, 9, 30),
        team_lead_open_id=m.open_id,
        award_level="一等奖",
        rank="2/500",
        created_by=m.open_id,
    )
    db.add(c)
    db.flush()
    db.add(CompetitionMember(comp_id=c.comp_id, member_open_id=m.open_id, member_role="member"))

    db.add(Award(
        recipient_open_id=m.open_id,
        name="国家奖学金",
        level="国家级",
        category="学业",
        issuer="教育部",
        award_date=date(2025, 11, 1),
        amount=20000.0,
        created_by=m.open_id,
    ))

    db.add(Training(
        participant_open_id=m.open_id,
        name="ICML 2025 暑期学校",
        type="学术",
        organizer="ICML",
        start_date=date(2025, 7, 1),
        end_date=date(2025, 7, 10),
        hours=40.0,
        has_certificate=True,
    ))
    db.commit()

    print("== resume_markdown ==")
    md = resume_markdown(db, m)
    print(md)
    assert "张三" in md and "NeurIPS" in md and "国家奖学金" in md and "AI4S" in md and "ICML" in md

    print("== yearly_report_markdown(2025) ==")
    yr = yearly_report_markdown(db, 2025)
    print(yr)
    assert "Robust Learning" in yr and "AI4S" in yr and "国家奖学金" in yr

    print("== members_excel ==")
    xlsx = members_excel(db)
    assert len(xlsx) > 200, f"excel too small: {len(xlsx)}"
    out = ROOT / "scripts" / "_smoke_members.xlsx"
    out.write_bytes(xlsx)
    print(f"  bytes={len(xlsx)} written to {out}")

    print("\nSMOKE OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
