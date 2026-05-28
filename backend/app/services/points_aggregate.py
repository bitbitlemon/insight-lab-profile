"""按 source_type+source_id 聚合积分,用于把"积分价值"嵌入到论文/比赛卡片。

只统计 status=approved 的 ledger。返回 total_final_points / my_final_points / member_count。
"""
from __future__ import annotations

import json

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Member, PointsLedger
from app.services.points_rules import COMP_AWARD_BASE, COMP_LEVEL_MULT, PAPER_POOL, paper_tier_key


def _fmt_points(value: float | int | None) -> str:
    v = float(value or 0)
    return f"{v:g}"


def _snapshot(row: PointsLedger) -> dict:
    raw = row.source_snapshot_json
    if not raw:
        return {}
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _rule_basis(row: PointsLedger, source_total: float | None = None) -> str | None:
    snap = _snapshot(row)
    if row.source_type == "competition":
        award = str(snap.get("award_level") or "")
        level = str(snap.get("level") or "")
        award_base = COMP_AWARD_BASE.get(award)
        level_mult = COMP_LEVEL_MULT.get(level, 0.3)
        if award_base is None:
            return f"比赛基础分 {_fmt_points(row.base_points)}：按奖项等级和比赛级别计算。"
        return (
            f"比赛基础分 {_fmt_points(row.base_points)} = "
            f"奖项基础分 {_fmt_points(award_base)}（{award or '未设置奖项'}） x "
            f"级别系数 {_fmt_points(level_mult)}（{level or '未设置级别，默认校级系数 0.3'}）。"
        )
    if row.source_type == "paper":
        venue_level = str(snap.get("venue_level") or "")
        tier = paper_tier_key(venue_level)
        pool = float(source_total or PAPER_POOL.get(tier, 0) or 0)
        member_share = (row.base_points / pool) if pool > 0 else 0
        return (
            f"论文/作品总分池 {_fmt_points(pool)}（{venue_level or '未设置等级，按 other'}）；"
            f"再按作者角色权重分配，本人基础分 {_fmt_points(row.base_points)}"
            f"（约占总分池 {member_share * 100:.1f}%）。"
        )
    return None


def get_points_for_sources(
    db: Session,
    source_type: str,
    source_ids: list[int],
    current_open_id: str | None = None,
) -> dict[int, dict]:
    if not source_ids:
        return {}
    out: dict[int, dict] = {
        sid: {"total_final_points": 0.0, "my_final_points": 0.0, "member_count": 0, "entries": []}
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

    detail_q = (
        select(PointsLedger, Member.name)
        .outerjoin(Member, Member.open_id == PointsLedger.member_open_id)
        .where(
            PointsLedger.source_type == source_type,
            PointsLedger.source_id.in_(source_ids),
            PointsLedger.status == "approved",
        )
        .order_by(PointsLedger.source_id.asc(), PointsLedger.final_points.desc(), PointsLedger.ledger_id.asc())
    )
    source_totals = {sid: data["total_final_points"] for sid, data in out.items()}
    for ledger, member_name in db.execute(detail_q).all():
        if ledger.source_id not in out:
            continue
        out[ledger.source_id]["entries"].append({
            "member_open_id": ledger.member_open_id,
            "member_name": member_name,
            "base_points": float(ledger.base_points or 0),
            "share_ratio": float(ledger.share_ratio or 0),
            "decay_factor": float(ledger.decay_factor or 1),
            "cap_adjustment_factor": float(ledger.cap_adjustment_factor or 1),
            "final_points": float(ledger.final_points or 0),
            "reason": ledger.reason,
            "rule_basis": _rule_basis(ledger, source_totals.get(ledger.source_id)),
        })
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
        "entries": [],
    }
