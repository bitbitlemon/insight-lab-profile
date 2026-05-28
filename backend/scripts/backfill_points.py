"""回填积分台账 v2 (按 Codex 评审报告 v2-2026-05-13 规则).

⚠️ 默认 dry-run, --commit 才写库; --reset 先清空.

参数:
  --commit
  --reset
  --duty-months N        同步回填过去 N 个月职务积分 (默认 0)
  --duty-rating A|B|C|D  历史职务的默认评级 (默认 B = 0.8 系数)
  --event-tier A|B|C     event 类组织贡献的默认分级 (默认 C = 0 分, 因为没有审核证据)
"""
from __future__ import annotations
import argparse, json, sys
from datetime import date, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.db import SessionLocal
from app.models import (
    Competition, CompetitionMember, Contribution, Member,
    Paper, PaperAuthor, PointsLedger,
)
from app.services.points_rules import (
    RULES_VERSION,
    allocate_paper_points,
    competition_base, default_competition_shares,
    contribution_base,
    duty_monthly_base, DUTY_RATING_FACTOR,
)


def _settlement_period(d: date) -> str:
    q = (d.month - 1) // 3 + 1
    return f"{d.year}Q{q}"


def _paper_decay(idx: int) -> float:
    """同成员同季度第 N 篇论文的边际递减系数 (N from 1).
    第 1-2 篇 100%, 第 3 篇 85%, 第 4 篇 70%, 第 5+ 50%."""
    if idx <= 2: return 1.0
    if idx == 3: return 0.85
    if idx == 4: return 0.70
    return 0.50


def backfill_papers(db, commit: bool, stats: dict) -> None:
    papers = db.query(Paper).order_by(Paper.publish_date.asc(), Paper.year.asc()).all()
    # 先把所有 (member, paper_date) 的临时计算列出, 按 (member, quarter) 排序后给 decay_factor
    pending: list[dict] = []
    for p in papers:
        authors = db.query(PaperAuthor).filter_by(paper_id=p.paper_id).order_by(PaperAuthor.author_order).all()
        author_tuples = []
        for a in authors:
            role = a.role
            if role == "co": role = "second"
            elif role not in ("first", "co_first", "second", "third", "other", "corresponding"):
                role = "other"
            is_corr = (role == "corresponding")
            if is_corr: role = "second"
            author_tuples.append((a.author_open_id, role, is_corr))
        if not author_tuples: continue
        alloc = allocate_paper_points(p.venue_level, author_tuples)
        occ = p.publish_date or date(p.year, 1, 1)
        for oid, pts in alloc.items():
            if pts <= 0: continue
            pending.append({"oid": oid, "paper": p, "occurred_at": occ,
                            "raw_pts": pts, "period": _settlement_period(occ)})
    # 按 member + quarter + date 排序, 给 decay
    pending.sort(key=lambda x: (x["oid"], x["period"], x["occurred_at"]))
    counter: dict[tuple[str, str], int] = {}
    for row in pending:
        k = (row["oid"], row["period"])
        counter[k] = counter.get(k, 0) + 1
        row["idx"] = counter[k]
        row["decay"] = _paper_decay(row["idx"])
        row["final"] = row["raw_pts"] * row["decay"]
    for row in pending:
        if row["final"] <= 0: continue
        stats["paper"] += 1
        if commit:
            p = row["paper"]
            snap = {"venue_level": p.venue_level, "venue": p.venue, "year": p.year,
                    "status": p.status, "quarter_index": row["idx"]}
            db.add(PointsLedger(
                member_open_id=row["oid"], source_type="paper", source_id=p.paper_id,
                occurred_at=row["occurred_at"],
                base_points=row["raw_pts"], share_ratio=1.0, decay_factor=row["decay"],
                cap_adjustment_factor=1.0, final_points=row["final"],
                reason=f"论文《{p.title[:30]}》 {p.venue_level or ''} 按篇分池 (季内第{row['idx']}篇×{row['decay']:.2f})",
                status="approved", calculation_rule_version=RULES_VERSION,
                source_snapshot_json=json.dumps(snap, ensure_ascii=False),
                submitted_at=datetime.utcnow(), approved_at=datetime.utcnow(),
                settlement_period=row["period"],
            ))


def backfill_competitions(db, commit: bool, stats: dict) -> None:
    comps = db.query(Competition).all()
    for c in comps:
        members = db.query(CompetitionMember).filter_by(comp_id=c.comp_id).all()
        oids = [m.member_open_id for m in members]
        if not oids: continue
        base = competition_base(c.award_level, c.level)
        if base <= 0: continue
        shares = default_competition_shares(oids, c.team_lead_open_id)
        for oid, ratio in shares.items():
            final = base * ratio
            if final <= 0: continue
            stats["competition"] += 1
            if commit:
                snap = {"award_level": c.award_level, "level": c.level, "name": c.name, "team_lead": c.team_lead_open_id}
                db.add(PointsLedger(
                    member_open_id=oid, source_type="competition", source_id=c.comp_id,
                    occurred_at=c.end_date,
                    base_points=base, share_ratio=ratio, decay_factor=1.0,
                    cap_adjustment_factor=1.0, final_points=final,
                    reason=f"《{c.name[:30]}》 {c.level}{c.award_level} 默认按队伍分配",
                    status="approved", calculation_rule_version=RULES_VERSION,
                    source_snapshot_json=json.dumps(snap, ensure_ascii=False),
                    submitted_at=datetime.utcnow(), approved_at=datetime.utcnow(),
                    settlement_period=_settlement_period(c.end_date),
                ))


def backfill_contributions(db, commit: bool, event_tier: str, stats: dict) -> None:
    for cb in db.query(Contribution).all():
        if cb.type == "event":
            base = contribution_base("event", cb.role_in_contribution, event_tier)
        else:
            base = contribution_base(cb.type, cb.role_in_contribution)
        if base <= 0: continue
        stats["contribution"] += 1
        if commit:
            snap = {"type": cb.type, "role": cb.role_in_contribution, "event_tier": event_tier if cb.type == "event" else None}
            db.add(PointsLedger(
                member_open_id=cb.member_open_id, source_type="contribution",
                source_id=cb.contribution_id, occurred_at=cb.occurred_at,
                base_points=base, share_ratio=1.0, decay_factor=1.0,
                cap_adjustment_factor=1.0, final_points=base,
                reason=f"{cb.type}/{cb.role_in_contribution or '-'} 《{cb.title[:30]}》",
                status="approved", calculation_rule_version=RULES_VERSION,
                source_snapshot_json=json.dumps(snap, ensure_ascii=False),
                submitted_at=datetime.utcnow(), approved_at=datetime.utcnow(),
                settlement_period=_settlement_period(cb.occurred_at),
            ))


def backfill_duty(db, commit: bool, months: int, rating: str, stats: dict) -> None:
    factor = DUTY_RATING_FACTOR.get(rating, 0.8)
    today = date.today()
    for m in db.query(Member).filter_by(status="active").all():
        per = duty_monthly_base(m.title)
        if per <= 0: continue
        final_each = per * factor
        if final_each <= 0: continue
        for k in range(months):
            yr, mo = today.year, today.month - k
            while mo <= 0: mo += 12; yr -= 1
            occ = date(yr, mo, 1)
            stats["duty"] += 1
            if commit:
                snap = {"title": m.title, "rating": rating, "factor": factor}
                db.add(PointsLedger(
                    member_open_id=m.open_id, source_type="duty", source_id=None,
                    occurred_at=occ,
                    base_points=per, share_ratio=factor, decay_factor=1.0,
                    cap_adjustment_factor=1.0, final_points=final_each,
                    reason=f"{m.title} 月度 {occ.year}-{occ.month:02d} 履职评级 {rating}",
                    status="approved", calculation_rule_version=RULES_VERSION,
                    source_snapshot_json=json.dumps(snap, ensure_ascii=False),
                    submitted_at=datetime.utcnow(), approved_at=datetime.utcnow(),
                    settlement_period=_settlement_period(occ),
                ))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--commit", action="store_true")
    ap.add_argument("--reset", action="store_true")
    ap.add_argument("--duty-months", type=int, default=0)
    ap.add_argument("--duty-rating", choices=["A","B","C","D"], default="B")
    ap.add_argument("--event-tier", choices=["A","B","C"], default="C")
    args = ap.parse_args()

    db = SessionLocal()
    if args.reset:
        n = db.query(PointsLedger).delete()
        print(f"reset: 删除 {n} 条旧 ledger")
        if args.commit: db.commit()

    stats = {"paper": 0, "competition": 0, "contribution": 0, "duty": 0}
    backfill_papers(db, args.commit, stats)
    backfill_competitions(db, args.commit, stats)
    backfill_contributions(db, args.commit, args.event_tier, stats)
    if args.duty_months > 0:
        backfill_duty(db, args.commit, args.duty_months, args.duty_rating, stats)

    if args.commit:
        db.commit()
        print(f"\nCOMMITTED  paper={stats['paper']} competition={stats['competition']} "
              f"contribution={stats['contribution']} duty={stats['duty']}")
    else:
        print(f"\nDRY-RUN    paper={stats['paper']} competition={stats['competition']} "
              f"contribution={stats['contribution']} duty={stats['duty']}")
        print("加 --commit 才真写入")
    db.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
