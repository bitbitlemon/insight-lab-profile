"""积分写入服务: 各 POST 路由 (paper/competition/contribution/duty) 创建实体后调用.

设计原则:
- 写入 status='approved' 适用于无需复核的小贡献; 高价值需要双审的待 admin 升级状态
- 失败不回滚业务实体 (eventual consistency); 只在 logger 报警
- 每次写都带 calculation_rule_version + source_snapshot_json + occurred_at
- 落库后异步双写到飞书多维表格 (lark_table_points_ledger), 失败不阻塞
"""
from __future__ import annotations
import asyncio
import json, logging
from datetime import date, datetime
from collections.abc import Sequence
from sqlalchemy.orm import Session

from app.config import settings
from app.models import (
    Competition, CompetitionMember, Contribution, Member,
    Paper, PaperAuthor, PointsLedger,
)
from app.services.points_rules import (
    RULES_VERSION,
    allocate_paper_points, competition_base, default_competition_shares,
    contribution_base, duty_monthly_base, DUTY_RATING_FACTOR,
    grant_points, ip_points, classify_award_to_ip,
    industrial_points, penalty_amount, category_of,
    product_stage_points, training_points, classify_training_kind,
    allocate_dev_points,
    PAPER_SUBMISSION_POINTS,
)

log = logging.getLogger(__name__)


# ============ Base 双写 (PointsLedger → 飞书多维表格) ============

def ledger_fields_for_base(row: PointsLedger) -> dict:
    """构造 Base 字段 payload. 字段名与 Base 表列名约定一致 (英文 snake_case)."""
    return {
        "member_open_id": row.member_open_id,
        "category": row.category,
        "source_type": row.source_type,
        "source_id": str(row.source_id) if row.source_id is not None else None,
        "occurred_at": int(datetime.combine(row.occurred_at, datetime.min.time()).timestamp() * 1000) if row.occurred_at else None,
        "base_points": float(row.base_points),
        "final_points": float(row.final_points),
        "share_ratio": float(row.share_ratio),
        "decay_factor": float(row.decay_factor),
        "reason": row.reason or "",
        "status": row.status,
        "calculation_rule_version": row.calculation_rule_version or "",
        "settlement_period": row.settlement_period or "",
    }


async def push_pending_ledger_to_base(batch: int = 50) -> dict:
    """扫描 base_record_id IS NULL 的 PointsLedger 行, 批量推 Base.
    返回 {pushed, errors, skipped}. 定时调度调用 (scheduler 每 90s)."""
    table_id = getattr(settings, "lark_table_points_ledger", "")
    if not table_id or not settings.lark_base_app_token:
        return {"pushed": 0, "errors": 0, "skipped": True, "reason": "未配置 LARK_TABLE_POINTS_LEDGER"}

    from app.db import SessionLocal
    from app.services.sync import push_record_to_base

    db = SessionLocal()
    pushed = 0
    errors = 0
    try:
        pending = (
            db.query(PointsLedger)
            .filter(PointsLedger.base_record_id.is_(None))
            .order_by(PointsLedger.ledger_id)
            .limit(batch)
            .all()
        )
        for row in pending:
            try:
                fields = ledger_fields_for_base(row)
                rec = await push_record_to_base(table_id, fields, record_id=None)
                new_rid = rec.get("record_id")
                if new_rid:
                    row.base_record_id = new_rid
                    db.commit()
                    pushed += 1
                else:
                    errors += 1
            except Exception as e:
                errors += 1
                log.warning("ledger %s 推送失败: %s", row.ledger_id, e)
                db.rollback()
        return {"pushed": pushed, "errors": errors, "total_pending": len(pending)}
    finally:
        db.close()


def _settlement_period(d: date) -> str:
    q = (d.month - 1) // 3 + 1
    return f"{d.year}Q{q}"


def _delete_old_ledger(db: Session, source_type: str, source_id: int) -> None:
    db.query(PointsLedger).filter_by(source_type=source_type, source_id=source_id).delete()


def write_paper_ledger(db: Session, paper: Paper, submitted_by: str | None = None) -> int:
    """根据 Paper + PaperAuthor 写入积分台账. 重复写时先删旧.

    返回写入条数.

    注意: 没有应用 季度边际递减 (因为单次调用看不到全部历史).
    要应用递减,统一调 backfill_points 或 admin recompute.
    """
    _delete_old_ledger(db, "paper", paper.paper_id)
    authors = db.query(PaperAuthor).filter_by(paper_id=paper.paper_id).order_by(PaperAuthor.author_order).all()
    if not authors: return 0
    author_tuples = []
    for a in authors:
        role = a.role
        if role == "co": role = "second"
        elif role not in ("first", "co_first", "second", "third", "other", "corresponding"):
            role = "other"
        is_corr = (role == "corresponding")
        if is_corr: role = "second"
        author_tuples.append((a.author_open_id, role, is_corr))
    alloc = allocate_paper_points(paper.venue_level, author_tuples)
    occ = paper.publish_date or date(paper.year, 1, 1)
    snap = {"venue_level": paper.venue_level, "venue": paper.venue, "year": paper.year, "status": paper.status}
    n = 0
    for oid, pts in alloc.items():
        if pts <= 0: continue
        db.add(PointsLedger(
            member_open_id=oid, category=category_of("paper"),
            source_type="paper", source_id=paper.paper_id,
            occurred_at=occ,
            base_points=pts, share_ratio=1.0, decay_factor=1.0,
            cap_adjustment_factor=1.0, final_points=pts,
            reason=f"论文《{paper.title[:30]}》 {paper.venue_level or ''} 按篇分池",
            status="approved", calculation_rule_version=RULES_VERSION,
            source_snapshot_json=json.dumps(snap, ensure_ascii=False),
            submitted_by=submitted_by, submitted_at=datetime.utcnow(),
            approved_at=datetime.utcnow(),
            settlement_period=_settlement_period(occ),
        ))
        n += 1
    return n


def write_competition_ledger(
    db: Session, comp: Competition,
    shares: dict[str, float] | None = None,
    submitted_by: str | None = None,
) -> int:
    """写比赛积分. shares 不传则用默认分配."""
    _delete_old_ledger(db, "competition", comp.comp_id)
    members = db.query(CompetitionMember).filter_by(comp_id=comp.comp_id).all()
    oids = [m.member_open_id for m in members]
    if not oids: return 0
    base = competition_base(comp.award_level, comp.level)
    if base <= 0: return 0
    if not shares:
        shares = default_competition_shares(oids, comp.team_lead_open_id)
    snap = {"award_level": comp.award_level, "level": comp.level, "name": comp.name,
            "team_lead": comp.team_lead_open_id, "shares": shares}
    n = 0
    for oid, ratio in shares.items():
        final = base * ratio
        if final <= 0: continue
        db.add(PointsLedger(
            member_open_id=oid, category=category_of("competition"),
            source_type="competition", source_id=comp.comp_id,
            occurred_at=comp.end_date,
            base_points=base, share_ratio=ratio, decay_factor=1.0,
            cap_adjustment_factor=1.0, final_points=final,
            reason=f"《{comp.name[:30]}》 {comp.level}{comp.award_level}",
            status="approved", calculation_rule_version=RULES_VERSION,
            source_snapshot_json=json.dumps(snap, ensure_ascii=False),
            submitted_by=submitted_by, submitted_at=datetime.utcnow(),
            approved_at=datetime.utcnow(),
            settlement_period=_settlement_period(comp.end_date),
        ))
        n += 1
    return n


def write_contribution_ledger(
    db: Session, contrib: Contribution,
    event_tier: str | None = None,
    submitted_by: str | None = None,
) -> int:
    """写组织贡献积分. event 类需 event_tier (默认 C=0)."""
    _delete_old_ledger(db, "contribution", contrib.contribution_id)
    if contrib.type == "event":
        base = contribution_base("event", contrib.role_in_contribution, event_tier or "C")
    else:
        base = contribution_base(contrib.type, contrib.role_in_contribution)
    if base <= 0: return 0
    snap = {"type": contrib.type, "role": contrib.role_in_contribution,
            "event_tier": event_tier if contrib.type == "event" else None}
    db.add(PointsLedger(
        member_open_id=contrib.member_open_id, category=category_of("contribution"),
        source_type="contribution",
        source_id=contrib.contribution_id, occurred_at=contrib.occurred_at,
        base_points=base, share_ratio=1.0, decay_factor=1.0,
        cap_adjustment_factor=1.0, final_points=base,
        reason=f"{contrib.type}/{contrib.role_in_contribution or '-'} 《{contrib.title[:30]}》",
        status="approved", calculation_rule_version=RULES_VERSION,
        source_snapshot_json=json.dumps(snap, ensure_ascii=False),
        submitted_by=submitted_by, submitted_at=datetime.utcnow(),
        approved_at=datetime.utcnow(),
        settlement_period=_settlement_period(contrib.occurred_at),
    ))
    return 1


# ============ v3 新增写函数 ============

def write_grant_ledger(
    db: Session, *, source_id: int, member_open_id: str,
    level: str, status: str, name: str,
    occurred_on: date, submitted_by: str | None = None,
) -> int:
    """项目申报积分 (国/省/校 × 申报/立项).

    level ∈ national/provincial/school/horizontal
    status ∈ applied/approved
    """
    _delete_old_ledger(db, "grant", source_id)
    pts = grant_points(level, status)
    if pts <= 0:
        return 0
    snap = {"level": level, "status": status, "name": name}
    db.add(PointsLedger(
        member_open_id=member_open_id, category=category_of("grant"),
        source_type="grant", source_id=source_id,
        occurred_at=occurred_on,
        base_points=pts, share_ratio=1.0, decay_factor=1.0,
        cap_adjustment_factor=1.0, final_points=pts,
        reason=f"项目{('立项' if status == 'approved' else '申报')}《{(name or '')[:30]}》 {level}",
        status="approved", calculation_rule_version=RULES_VERSION,
        source_snapshot_json=json.dumps(snap, ensure_ascii=False),
        submitted_by=submitted_by, submitted_at=datetime.utcnow(),
        approved_at=datetime.utcnow(),
        settlement_period=_settlement_period(occurred_on),
    ))
    return 1


def write_ip_ledger(
    db: Session, *, source_id: int, member_open_id: str,
    kind: str, name: str,
    occurred_on: date, submitted_by: str | None = None,
) -> int:
    """专利/软著/成果认定 积分. kind 见 points_rules.IP_POINTS."""
    _delete_old_ledger(db, "ip", source_id)
    pts = ip_points(kind)
    if pts <= 0:
        return 0
    snap = {"kind": kind, "name": name}
    db.add(PointsLedger(
        member_open_id=member_open_id, category=category_of("ip"),
        source_type="ip", source_id=source_id,
        occurred_at=occurred_on,
        base_points=pts, share_ratio=1.0, decay_factor=1.0,
        cap_adjustment_factor=1.0, final_points=pts,
        reason=f"{kind} 《{(name or '')[:30]}》",
        status="approved", calculation_rule_version=RULES_VERSION,
        source_snapshot_json=json.dumps(snap, ensure_ascii=False),
        submitted_by=submitted_by, submitted_at=datetime.utcnow(),
        approved_at=datetime.utcnow(),
        settlement_period=_settlement_period(occurred_on),
    ))
    return 1


def write_industrial_ledger(
    db: Session, *, source_id: int | None, members: Sequence[tuple[str, str | None]],
    amount_yuan: float, scene: str,
    note: str | None = None,
    occurred_on: date, submitted_by: str | None = None,
) -> int:
    """产业积分: 金额走 v4 对数压缩曲线. scene 描述场景 (合同/月入/横向/创业)."""
    _delete_old_ledger(db, "industrial", source_id) if source_id else None
    pool = industrial_points(amount_yuan)
    alloc = allocate_dev_points(pool, list(members))
    if pool <= 0 or not alloc:
        return 0
    role_by_member = {oid: role for oid, role in members}
    snap = {
        "amount_yuan": amount_yuan,
        "scene": scene,
        "note": note,
        "members": [{"member_open_id": oid, "role": role} for oid, role in members],
    }
    n = 0
    for oid, pts in alloc.items():
        if pts <= 0:
            continue
        share_ratio = round(pts / pool, 6) if pool else 0.0
        role = role_by_member.get(oid) or "contributor"
        note_part = f"《{note[:30]}》" if note else ""
        db.add(PointsLedger(
            member_open_id=oid, category=category_of("industrial"),
            source_type="industrial", source_id=source_id,
            occurred_at=occurred_on,
            base_points=pool, share_ratio=share_ratio, decay_factor=1.0,
            cap_adjustment_factor=1.0, final_points=pts,
            reason=f"产业积分 {scene}{note_part} 角色 {role} 金额 ¥{amount_yuan:.2f}",
            status="approved", calculation_rule_version=RULES_VERSION,
            source_snapshot_json=json.dumps(snap, ensure_ascii=False),
            submitted_by=submitted_by, submitted_at=datetime.utcnow(),
            approved_at=datetime.utcnow(),
            settlement_period=_settlement_period(occurred_on),
        ))
        n += 1
    return n


def write_penalty_ledger(
    db: Session, *, source_id: int | None, member_open_id: str,
    kind: str, custom_amount: float | None, reason: str,
    occurred_on: date, submitted_by: str | None = None,
) -> int:
    """扣分: base/final 为负."""
    pts = penalty_amount(kind, custom_amount)
    if pts >= 0:
        return 0
    snap = {"kind": kind, "custom_amount": custom_amount, "reason": reason}
    db.add(PointsLedger(
        member_open_id=member_open_id, category=category_of("penalty"),
        source_type="penalty", source_id=source_id,
        occurred_at=occurred_on,
        base_points=pts, share_ratio=1.0, decay_factor=1.0,
        cap_adjustment_factor=1.0, final_points=pts,
        reason=f"扣分 {kind}: {reason[:60]}",
        status="approved", calculation_rule_version=RULES_VERSION,
        source_snapshot_json=json.dumps(snap, ensure_ascii=False),
        submitted_by=submitted_by, submitted_at=datetime.utcnow(),
        approved_at=datetime.utcnow(),
        settlement_period=_settlement_period(occurred_on),
    ))
    return 1


def write_product_stage_ledger(
    db: Session, *, source_id: int | None, members: Sequence[tuple[str, str | None]],
    stage: str, amount_yuan: float | None, product_name: str,
    occurred_on: date, submitted_by: str | None = None,
) -> int:
    """产品研发阶段积分. stage: init/mvp/internal_qa/launch/operating.
    launch / operating 阶段可附 amount_yuan (金额走 v4 对数压缩曲线加成)."""
    _delete_old_ledger(db, "product_stage", source_id) if source_id else None
    pool = product_stage_points(stage, amount_yuan)
    alloc = allocate_dev_points(pool, list(members))
    if pool <= 0 or not alloc:
        return 0
    role_by_member = {oid: role for oid, role in members}
    snap = {
        "stage": stage,
        "amount_yuan": amount_yuan,
        "product_name": product_name,
        "members": [{"member_open_id": oid, "role": role} for oid, role in members],
    }
    amt_part = f" +¥{amount_yuan:.0f}" if (amount_yuan and stage in ("launch", "operating")) else ""
    n = 0
    for oid, pts in alloc.items():
        if pts <= 0:
            continue
        share_ratio = round(pts / pool, 6) if pool else 0.0
        role = role_by_member.get(oid) or "contributor"
        db.add(PointsLedger(
            member_open_id=oid, category=category_of("product_stage"),
            source_type="product_stage", source_id=source_id,
            occurred_at=occurred_on,
            base_points=pool, share_ratio=share_ratio, decay_factor=1.0,
            cap_adjustment_factor=1.0, final_points=pts,
            reason=f"产品研发 {stage}《{(product_name or '')[:30]}》{amt_part} 角色 {role}",
            status="approved", calculation_rule_version=RULES_VERSION,
            source_snapshot_json=json.dumps(snap, ensure_ascii=False),
            submitted_by=submitted_by, submitted_at=datetime.utcnow(),
            approved_at=datetime.utcnow(),
            settlement_period=_settlement_period(occurred_on),
        ))
        n += 1
    return n


def write_training_ledger(
    db: Session, *, source_id: int, member_open_id: str,
    training_type: str | None, has_certificate: bool, name: str,
    occurred_on: date, submitted_by: str | None = None,
) -> int:
    """培训/证书积分. 自动从 type + has_certificate 推 kind."""
    _delete_old_ledger(db, "training", source_id)
    kind = classify_training_kind(training_type, has_certificate)
    pts = training_points(kind)
    if pts <= 0:
        return 0
    snap = {"kind": kind, "type": training_type, "has_certificate": has_certificate, "name": name}
    db.add(PointsLedger(
        member_open_id=member_open_id, category=category_of("training"),
        source_type="training", source_id=source_id,
        occurred_at=occurred_on,
        base_points=pts, share_ratio=1.0, decay_factor=1.0,
        cap_adjustment_factor=1.0, final_points=pts,
        reason=f"培训{kind}《{(name or '')[:30]}》",
        status="approved", calculation_rule_version=RULES_VERSION,
        source_snapshot_json=json.dumps(snap, ensure_ascii=False),
        submitted_by=submitted_by, submitted_at=datetime.utcnow(),
        approved_at=datetime.utcnow(),
        settlement_period=_settlement_period(occurred_on),
    ))
    return 1


def try_write_product_stage(db: Session, **kw) -> None:
    try:
        write_product_stage_ledger(db, **kw); db.flush()
    except Exception as e:
        log.warning("write_product_stage_ledger failed: %s", e)


def try_write_training(db: Session, **kw) -> None:
    try:
        write_training_ledger(db, **kw); db.flush()
    except Exception as e:
        log.warning("write_training_ledger failed: %s", e)


def try_write_grant(db: Session, **kw) -> None:
    try:
        write_grant_ledger(db, **kw); db.flush()
    except Exception as e:
        log.warning("write_grant_ledger failed: %s", e)


def try_write_ip(db: Session, **kw) -> None:
    try:
        write_ip_ledger(db, **kw); db.flush()
    except Exception as e:
        log.warning("write_ip_ledger failed: %s", e)


def try_write_industrial(db: Session, **kw) -> None:
    try:
        write_industrial_ledger(db, **kw); db.flush()
    except Exception as e:
        log.warning("write_industrial_ledger failed: %s", e)


def try_write_penalty(db: Session, **kw) -> None:
    try:
        write_penalty_ledger(db, **kw); db.flush()
    except Exception as e:
        log.warning("write_penalty_ledger failed: %s", e)


def try_write_award_as_ip(
    db: Session, award_id: int, recipient_open_id: str,
    category: str | None, level: str | None, name: str,
    award_date: date, submitted_by: str | None = None,
) -> None:
    """awards 表创建时尝试转 IP 积分. 不能识别为 IP 时不写."""
    kind = classify_award_to_ip(category, level, name)
    if not kind:
        return
    try_write_ip(
        db,
        source_id=award_id, member_open_id=recipient_open_id,
        kind=kind, name=name, occurred_on=award_date,
        submitted_by=submitted_by,
    )


def try_write_paper(db: Session, paper: Paper, submitted_by: str | None = None) -> None:
    """Hook 给路由用 — 失败不抛错."""
    try:
        write_paper_ledger(db, paper, submitted_by)
        db.flush()
    except Exception as e:
        log.warning("write_paper_ledger failed: %s", e)


def try_write_competition(db: Session, comp: Competition, shares: dict | None = None, submitted_by: str | None = None) -> None:
    try:
        write_competition_ledger(db, comp, shares, submitted_by)
        db.flush()
    except Exception as e:
        log.warning("write_competition_ledger failed: %s", e)


def try_write_contribution(db: Session, contrib: Contribution, event_tier: str | None = None, submitted_by: str | None = None) -> None:
    try:
        write_contribution_ledger(db, contrib, event_tier, submitted_by)
        db.flush()
    except Exception as e:
        log.warning("write_contribution_ledger failed: %s", e)
