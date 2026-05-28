"""verify_base_sync: 比对 SQLite 与飞书 Base 的双写一致性。

执行:
    cd /home/ubuntu/insight-lab-profile/backend
    .venv/bin/python scripts/verify_base_sync.py

输出每张已双写表的:
- sqlite_total: 本地行数
- sqlite_with_base_id: 已挂载 base_record_id 的行数 (= 已双写)
- sqlite_orphan: base_record_id IS NULL 的行数 (历史数据, 待回填)
- base_total: Base 上的行数
- base_only: 只在 Base 不在 SQLite 的 record_id 数 (走 Base→SQLite 同步会修复)
- sqlite_only_with_id: 本地有 base_record_id 但 Base 找不到 (脏数据)

仅做只读校验, 不改数据. 失败时整体退出码 1.
"""
from __future__ import annotations
import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import logging
logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)

from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.config import settings
from app.db import SessionLocal
from app.models import (
    Member, Advising, Paper, PaperAuthor, Competition, CompetitionMember,
    MeetingNote, MeetingParticipant, Award, Training, AuditLog,
)
from app.services.sync import fetch_all_records


# 仅列入"模型有 base_record_id"的表
TABLES = [
    ("members", Member, "lark_table_members"),
    ("advising", Advising, "lark_table_advising"),
    ("papers", Paper, "lark_table_papers"),
    ("paper_authors", PaperAuthor, "lark_table_paper_authors"),
    ("competitions", Competition, "lark_table_competitions"),
    ("meeting_notes", MeetingNote, "lark_table_meeting_notes"),
    ("awards", Award, "lark_table_awards"),
    ("trainings", Training, "lark_table_trainings"),
]


def _has_base_id_field(orm_cls: type) -> bool:
    return any(c.name == "base_record_id" for c in orm_cls.__table__.columns)


async def verify_one(db: Session, name: str, orm_cls: type, settings_attr: str) -> dict:
    table_id = getattr(settings, settings_attr, "")
    if not table_id:
        return {"table": name, "skipped": True, "reason": "no_table_id_in_env"}
    if not _has_base_id_field(orm_cls):
        return {"table": name, "skipped": True, "reason": "no_base_record_id_in_model"}

    sqlite_total = db.execute(select(func.count()).select_from(orm_cls)).scalar_one()
    sqlite_with = db.execute(
        select(func.count()).select_from(orm_cls).where(orm_cls.base_record_id.isnot(None))
    ).scalar_one()
    sqlite_orphan = sqlite_total - sqlite_with

    sqlite_ids = set(
        rid for (rid,) in db.execute(
            select(orm_cls.base_record_id).where(orm_cls.base_record_id.isnot(None))
        ).all()
    )

    try:
        records = await fetch_all_records(table_id)
    except Exception as e:
        return {"table": name, "sqlite_total": sqlite_total,
                "sqlite_with_base_id": sqlite_with, "sqlite_orphan": sqlite_orphan,
                "error": f"fetch base failed: {e}"}

    base_ids = {r.get("record_id") for r in records if r.get("record_id")}
    base_total = len(base_ids)
    base_only = len(base_ids - sqlite_ids)
    sqlite_only = len(sqlite_ids - base_ids)

    return {
        "table": name,
        "sqlite_total": sqlite_total,
        "sqlite_with_base_id": sqlite_with,
        "sqlite_orphan": sqlite_orphan,
        "base_total": base_total,
        "base_only": base_only,
        "sqlite_only_with_id": sqlite_only,
    }


def fmt(row: dict) -> str:
    if row.get("skipped"):
        return f"  [SKIP] {row['table']:<20} {row['reason']}"
    if row.get("error"):
        return (
            f"  [ERR ] {row['table']:<20} sqlite={row['sqlite_total']} "
            f"with_id={row['sqlite_with_base_id']} orphan={row['sqlite_orphan']} "
            f"-- {row['error']}"
        )
    drift = row["base_only"] + row["sqlite_only_with_id"]
    tag = "OK   " if drift == 0 and row["sqlite_orphan"] == 0 else "WARN "
    return (
        f"  [{tag}] {row['table']:<20} "
        f"sqlite={row['sqlite_total']:>5} "
        f"with_id={row['sqlite_with_base_id']:>5} "
        f"orphan={row['sqlite_orphan']:>5} "
        f"base={row['base_total']:>5} "
        f"base_only={row['base_only']:>4} "
        f"sqlite_only={row['sqlite_only_with_id']:>4}"
    )


async def main() -> int:
    db: Session = SessionLocal()
    try:
        print(f"verify_base_sync app_token={settings.lark_base_app_token[:8]}…")
        print()
        results = []
        for name, cls, attr in TABLES:
            r = await verify_one(db, name, cls, attr)
            results.append(r)
            print(fmt(r))
        print()
        bad = [r for r in results if not r.get("skipped") and (
            r.get("error") or r.get("base_only") or r.get("sqlite_only_with_id") or r.get("sqlite_orphan")
        )]
        print(f"summary: {len(results) - len(bad)}/{len(results)} clean, {len(bad)} need attention")
        return 1 if any(r.get("error") for r in results) else 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
