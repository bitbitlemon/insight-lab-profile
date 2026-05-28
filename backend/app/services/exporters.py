"""
导出工具: 个人简历 (Markdown) + 全员 Excel.
"""
from __future__ import annotations
import io
import json
from datetime import datetime, date
from sqlalchemy import select
from sqlalchemy.orm import Session
from ..models import (
    Member, Paper, PaperAuthor, Competition, CompetitionMember,
    MeetingNote, Award, Training,
)


def _fmt_date(d: date | datetime | None) -> str:
    if not d:
        return ""
    if isinstance(d, datetime):
        return d.strftime("%Y-%m-%d")
    return d.strftime("%Y-%m-%d") if isinstance(d, date) else str(d)


def _parse_json_list(s: str | None) -> list[str]:
    if not s:
        return []
    try:
        v = json.loads(s)
        return [str(x) for x in v] if isinstance(v, list) else []
    except Exception:
        return []


def resume_markdown(db: Session, member: Member) -> str:
    """生成个人简历 Markdown."""
    lines: list[str] = []
    lines.append(f"# {member.name}" + (f" ({member.en_name})" if member.en_name else ""))
    info_parts = [member.department, member.title, member.role]
    info = " · ".join([p for p in info_parts if p])
    if info:
        lines.append(f"**{info}**")
    contact_parts = [f"邮箱: {member.email}" if member.email else "",
                     f"电话: {member.mobile}" if member.mobile else ""]
    contact = " | ".join([p for p in contact_parts if p])
    if contact:
        lines.append(contact)
    areas = _parse_json_list(member.research_area)
    if areas:
        lines.append(f"**研究方向**: {', '.join(areas)}")
    if member.bio:
        lines.append(f"\n{member.bio}\n")

    # 论文
    papers = db.execute(
        select(Paper).where(
            (Paper.created_by == member.open_id) |
            (Paper.paper_id.in_(select(PaperAuthor.paper_id).where(PaperAuthor.author_open_id == member.open_id)))
        ).order_by(Paper.year.desc())
    ).scalars().all()
    if papers:
        lines.append("\n## 论文\n")
        for p in papers:
            level = f" [{p.venue_level}]" if p.venue_level else ""
            lines.append(f"- **{p.title}** — _{p.venue}_ {p.year}{level} ({p.status})")
            if p.authors_text:
                lines.append(f"  - 作者: {p.authors_text}")
            if p.doi or p.url:
                link = p.url or f"https://doi.org/{p.doi}"
                lines.append(f"  - 链接: {link}")

    # 比赛
    comps = db.execute(
        select(Competition).where(
            Competition.comp_id.in_(
                select(CompetitionMember.comp_id).where(CompetitionMember.member_open_id == member.open_id)
            )
        ).order_by(Competition.end_date.desc())
    ).scalars().all()
    if comps:
        lines.append("\n## 比赛\n")
        for c in comps:
            lines.append(f"- **{c.name}** — {c.organizer} ({_fmt_date(c.end_date)}) · {c.level} {c.award_level}{(' ' + c.rank) if c.rank else ''}")

    # 奖项
    awards = db.execute(
        select(Award).where(Award.recipient_open_id == member.open_id)
        .order_by(Award.award_date.desc())
    ).scalars().all()
    if awards:
        lines.append("\n## 奖项荣誉\n")
        for a in awards:
            amount = f" (¥{a.amount})" if a.amount else ""
            lines.append(f"- **{a.name}** — {a.issuer} ({_fmt_date(a.award_date)}) · {a.level} {a.category}{amount}")

    # 培训
    trainings = db.execute(
        select(Training).where(Training.participant_open_id == member.open_id)
        .order_by(Training.start_date.desc())
    ).scalars().all()
    if trainings:
        lines.append("\n## 培训/活动\n")
        for t in trainings:
            cert = " (有证书)" if t.has_certificate else ""
            hours = f" {t.hours}h" if t.hours else ""
            lines.append(f"- **{t.name}** — {t.organizer or ''} ({_fmt_date(t.start_date)}) · {t.type}{hours}{cert}")

    return "\n".join(lines) + "\n"


def members_excel(db: Session) -> bytes:
    """生成全员 Excel (xlsx 字节流)."""
    from openpyxl import Workbook
    wb = Workbook()
    ws = wb.active
    ws.title = "members"
    headers = ["open_id", "name", "en_name", "email", "mobile", "role", "department",
               "title", "enroll_date", "graduate_date", "research_area", "status", "privacy_level"]
    ws.append(headers)
    members = db.execute(select(Member).order_by(Member.department, Member.name)).scalars().all()
    for m in members:
        ws.append([
            m.open_id, m.name, m.en_name or "", m.email or "", m.mobile or "",
            m.role, m.department or "", m.title or "",
            _fmt_date(m.enroll_date), _fmt_date(m.graduate_date),
            ", ".join(_parse_json_list(m.research_area)),
            m.status, m.privacy_level,
        ])
    # 列宽
    for col_idx, header in enumerate(headers, 1):
        ws.column_dimensions[ws.cell(row=1, column=col_idx).column_letter].width = max(12, len(header) + 2)

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def yearly_report_markdown(db: Session, year: int) -> str:
    """年度报表 Markdown."""
    lines = [f"# 实验室 {year} 年度报告\n"]

    papers = db.execute(select(Paper).where(Paper.year == year)).scalars().all()
    lines.append(f"## 论文 ({len(papers)})\n")
    by_level: dict[str, list[Paper]] = {}
    for p in papers:
        by_level.setdefault(p.venue_level or "其他", []).append(p)
    for level in ["CCF-A", "CCF-B", "CCF-C", "SCI-1", "SCI-2", "其他"]:
        if level in by_level:
            lines.append(f"\n### {level} ({len(by_level[level])})\n")
            for p in by_level[level]:
                lines.append(f"- {p.title} — {p.venue} ({p.status})")

    comps = db.execute(
        select(Competition).where(
            Competition.end_date.between(date(year, 1, 1), date(year, 12, 31))
        )
    ).scalars().all()
    if comps:
        lines.append(f"\n## 比赛获奖 ({len(comps)})\n")
        for c in comps:
            lines.append(f"- {c.name} — {c.award_level} ({_fmt_date(c.end_date)})")

    awards = db.execute(
        select(Award).where(Award.award_date.between(date(year, 1, 1), date(year, 12, 31)))
    ).scalars().all()
    if awards:
        lines.append(f"\n## 奖项荣誉 ({len(awards)})\n")
        for a in awards:
            lines.append(f"- {a.name} — {a.issuer} ({_fmt_date(a.award_date)})")

    return "\n".join(lines) + "\n"
