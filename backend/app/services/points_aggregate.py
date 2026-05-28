"""按 source_type+source_id 聚合积分,用于把"积分价值"嵌入到论文/比赛卡片。

只统计 status=approved 的 ledger。返回 total_final_points / my_final_points / member_count。
"""
from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import PointsLedger


def get_points_for_sources(
    db: Session,
    source_type: str,
    source_ids: list[int],
    current_open_id: str | None = None,
) -> dict[int, dict]:
    if not source_ids:
        return {}
    out: dict[int, dict] = {
        sid: {"total_final_points": 0.0, "my_final_points": 0.0, "member_count": 0}
        for sid in source_ids
    }
    q = (
        select(
            PointsLedger.source_id,
            func.coalesce(func.sum(PointsLedger.final_points), 0.0).label("total"),
            func.count(func.distinct(PointsLedger.member_open_id)).label("member_count"),
        )
        .where(
            PointsLedger.source_type == source_type,
            PointsLedger.source_id.in_(source_ids),
            PointsLedger.status == "approved",
        )
        .group_by(PointsLedger.source_id)
    )
    for sid, total, member_count in db.execute(q).all():
        out[sid]["total_final_points"] = float(total or 0)
        out[sid]["member_count"] = int(member_count or 0)
    if current_open_id:
        q2 = (
            select(
                PointsLedger.source_id,
                func.coalesce(func.sum(PointsLedger.final_points), 0.0).label("mine"),
            )
            .where(
                PointsLedger.source_type == source_type,
                PointsLedger.source_id.in_(source_ids),
                PointsLedger.member_open_id == current_open_id,
                PointsLedger.status == "approved",
            )
            .group_by(PointsLedger.source_id)
        )
        for sid, mine in db.execute(q2).all():
            out[sid]["my_final_points"] = float(mine or 0)
    return out


def get_points_for_source(
    db: Session,
    source_type: str,
    source_id: int,
    current_open_id: str | None = None,
) -> dict:
    return get_points_for_sources(db, source_type, [source_id], current_open_id).get(source_id) or {
        "total_final_points": 0.0,
        "my_final_points": 0.0,
        "member_count": 0,
    }
