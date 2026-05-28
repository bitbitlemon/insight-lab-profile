from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.config import settings
from app.db import get_db
from app.deps import get_current_user
from app.models import Competition, CompetitionMember, Member, PointsLedger
from app.schemas.common import PageResponse, PointsSummary
from app.schemas.competitions import (
    CompetitionAttachment,
    CompetitionCreate,
    CompetitionMemberInput,
    CompetitionRead,
    CompetitionUpdate,
)
from app.services.points_aggregate import get_points_for_source, get_points_for_sources
from app.services.points_service import try_write_competition
from app.services.points_rules import default_competition_shares, needs_competition_double_review
from app.services.sync import delete_record_from_base, push_record_to_base

router = APIRouter(prefix="/api/competitions", tags=["competitions"])

log = logging.getLogger(__name__)


_COMP_BASE_FIELDS = {
    "name", "organizer", "level", "category", "start_date", "end_date",
    "team_lead_open_id", "award_level", "rank", "score",
    "certificate_url", "project_url", "description", "reflection",
    "created_by",
}


async def _push_comp(
    data: dict[str, Any],
    record_id: str | None = None,
    cert_files: list[CompetitionAttachment] | None = None,
    photo_files: list[CompetitionAttachment] | None = None,
) -> str | None:
    """推到 Base. cert_files/photo_files 传 None 表示不更新, 传 [] 表示清空."""
    if not settings.lark_table_competitions:
        return record_id
    payload = {k: v for k, v in data.items() if k in _COMP_BASE_FIELDS}
    if cert_files is not None:
        payload["比赛证书"] = [{"file_token": f.file_token} for f in cert_files if f.file_token]
    if photo_files is not None:
        payload["比赛照片"] = [{"file_token": f.file_token} for f in photo_files if f.file_token]
    record = await push_record_to_base(settings.lark_table_competitions, payload, record_id=record_id)
    return record.get("record_id") or record_id


def _competition_fields_for_base(c: Competition) -> dict:
    """scheduler 回填用."""
    return {
        "name": c.name or "",
        "organizer": c.organizer or "",
        "level": c.level or "",
        "category": c.category or "",
        "start_date": c.start_date.isoformat() if c.start_date else None,
        "end_date": c.end_date.isoformat() if c.end_date else None,
        "team_lead_open_id": c.team_lead_open_id or "",
        "award_level": c.award_level or "",
        "rank": c.rank or "",
        "score": float(c.score or 0),
        "certificate_url": c.certificate_url or "",
        "project_url": c.project_url or "",
        "description": c.description or "",
        "reflection": c.reflection or "",
    }


async def _delete_comp_base(record_id: str | None) -> None:
    if not record_id or not settings.lark_table_competitions:
        return
    try:
        await delete_record_from_base(settings.lark_table_competitions, record_id)
    except Exception as e:
        log.warning("[competitions] delete base record %s failed: %s", record_id, e)


def _competition_stmt():
    return select(Competition).options(selectinload(Competition.members))


def _parse_attachments_json(raw: str | None) -> list[CompetitionAttachment]:
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except (TypeError, ValueError):
        return []
    if not isinstance(data, list):
        return []
    out: list[CompetitionAttachment] = []
    for item in data:
        if isinstance(item, dict) and item.get("file_token"):
            try:
                out.append(CompetitionAttachment.model_validate(item))
            except Exception:
                continue
    return out


def _serialize_attachments(items: list[CompetitionAttachment] | None) -> str | None:
    if not items:
        return None
    return json.dumps([item.model_dump() for item in items], ensure_ascii=False)


def _to_read(comp: Competition, db: Session | None = None, current_open_id: str | None = None) -> CompetitionRead:
    read = CompetitionRead.model_validate(comp)
    read.cert_files = _parse_attachments_json(comp.cert_files_json)
    read.photo_files = _parse_attachments_json(comp.photo_files_json)
    if db is not None:
        summary = get_points_for_source(db, "competition", comp.comp_id, current_open_id)
        read.points_summary = PointsSummary(**summary)
    return read


def _to_read_many(comps: list[Competition], db: Session, current_open_id: str | None) -> list[CompetitionRead]:
    if not comps:
        return []
    summaries = get_points_for_sources(db, "competition", [c.comp_id for c in comps], current_open_id)
    out: list[CompetitionRead] = []
    for comp in comps:
        read = CompetitionRead.model_validate(comp)
        read.cert_files = _parse_attachments_json(comp.cert_files_json)
        read.photo_files = _parse_attachments_json(comp.photo_files_json)
        s = summaries.get(comp.comp_id)
        if s:
            read.points_summary = PointsSummary(**s)
        out.append(read)
    return out


def _is_admin(user: Member) -> bool:
    return user.role == "admin"


def _has_review_permission(current: Member) -> bool:
    return current.role in ("admin", "staff") or bool(current.title and any(k in current.title for k in ("团长", "政委", "部长")))


def _can_edit_competition(comp: Competition, current_user: Member, db: Session) -> bool:
    if _is_admin(current_user) or comp.created_by == current_user.open_id:
        return True
    member_stmt = select(CompetitionMember.comp_id).where(
        CompetitionMember.comp_id == comp.comp_id,
        CompetitionMember.member_open_id == current_user.open_id,
    )
    return db.execute(member_stmt).scalar_one_or_none() is not None


def _normalize_members(
    members: list[CompetitionMemberInput],
    team_lead_open_id: str | None,
) -> tuple[list[CompetitionMemberInput], str | None]:
    deduped: dict[str, CompetitionMemberInput] = {}
    for item in members:
        deduped[item.member_open_id] = item

    normalized = list(deduped.values())
    if team_lead_open_id and team_lead_open_id not in deduped:
        normalized.append(CompetitionMemberInput(member_open_id=team_lead_open_id, member_role="member", share_ratio=0.0))
    if normalized and not team_lead_open_id:
        team_lead_open_id = normalized[0].member_open_id
    return normalized, team_lead_open_id


def _replace_members(db: Session, comp: Competition, members: list[CompetitionMemberInput]) -> None:
    existing_contrib: dict[str, str | None] = {
        m.member_open_id: m.contribution_text for m in comp.members
    }
    db.query(CompetitionMember).filter_by(comp_id=comp.comp_id).delete()
    for item in members:
        contrib = item.contribution_text if item.contribution_text is not None else existing_contrib.get(item.member_open_id)
        db.add(
            CompetitionMember(
                comp_id=comp.comp_id,
                member_open_id=item.member_open_id,
                member_role=item.member_role,
                contribution_text=contrib,
            )
        )
    db.flush()


def _get_competition_share_context(
    db: Session,
    comp: Competition,
) -> tuple[dict[str, float], dict[str, float], str]:
    members = [item.member_open_id for item in comp.members]
    default_shares = default_competition_shares(members, comp.team_lead_open_id)
    ledgers = db.query(PointsLedger).filter_by(source_type="competition", source_id=comp.comp_id).all()
    current_shares = {ledger.member_open_id: ledger.share_ratio for ledger in ledgers}
    if not current_shares:
        current_shares = default_shares.copy()
    for oid, ratio in default_shares.items():
        current_shares.setdefault(oid, ratio)
    _, reason = needs_competition_double_review(current_shares, default_shares)
    if not reason and ledgers:
        try:
            snapshot = json.loads(ledgers[0].source_snapshot_json or "{}")
            _, reason = needs_competition_double_review(snapshot.get("shares") or current_shares, default_shares)
        except json.JSONDecodeError:
            reason = ""
    return current_shares, default_shares, reason


class ReviewPayload(BaseModel):
    approve: bool
    comment: str | None = None


class CompetitionPendingReviewItem(BaseModel):
    comp_id: int
    name: str
    level: str
    award_level: str
    team_lead_open_id: str | None
    current_shares: dict[str, float]
    default_shares: dict[str, float]
    deviation_reason: str
    members: list[dict[str, str]]


@router.get("", response_model=PageResponse[CompetitionRead])
def list_competitions(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    member_open_id: str | None = Query(None),
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    stmt = _competition_stmt()
    count_stmt = select(func.count()).select_from(Competition)
    if member_open_id:
        link = select(CompetitionMember.comp_id).where(CompetitionMember.member_open_id == member_open_id)
        stmt = stmt.where(Competition.comp_id.in_(link))
        count_stmt = count_stmt.where(Competition.comp_id.in_(link))
    stmt = stmt.order_by(Competition.end_date.desc()).offset((page - 1) * page_size).limit(page_size)
    items = db.execute(stmt).scalars().all()
    total = db.execute(count_stmt).scalar_one()
    return PageResponse[CompetitionRead](
        items=_to_read_many(list(items), db, current.open_id),
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=CompetitionRead, status_code=status.HTTP_201_CREATED)
async def create_competition(
    payload: CompetitionCreate,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    comp_data = payload.model_dump(exclude={"members", "project_id", "team_lead_open_id", "cert_files", "photo_files"})
    members, team_lead_open_id = _normalize_members(payload.members, payload.team_lead_open_id)
    cert_files_json = _serialize_attachments(payload.cert_files)
    photo_files_json = _serialize_attachments(payload.photo_files)

    base_data = {
        **comp_data,
        "team_lead_open_id": team_lead_open_id,
        "created_by": current.open_id,
    }
    try:
        base_record_id = await _push_comp(
            base_data,
            record_id=None,
            cert_files=payload.cert_files,
            photo_files=payload.photo_files,
        )
    except Exception as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"failed to sync competition: {exc}") from exc

    comp = Competition(
        **comp_data,
        team_lead_open_id=team_lead_open_id,
        created_by=current.open_id,
        base_record_id=base_record_id,
        cert_files_json=cert_files_json,
        photo_files_json=photo_files_json,
    )

    try:
        db.add(comp)
        db.flush()
        _replace_members(db, comp, members)
        try_write_competition(
            db,
            comp,
            shares={item.member_open_id: item.share_ratio for item in members},
            submitted_by=current.open_id,
        )
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        await _delete_comp_base(base_record_id)
        raise HTTPException(status.HTTP_409_CONFLICT, "competition create conflict") from exc
    except Exception as exc:
        db.rollback()
        await _delete_comp_base(base_record_id)
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc

    comp = db.execute(_competition_stmt().where(Competition.comp_id == comp.comp_id)).scalar_one()
    return _to_read(comp, db, current.open_id)


@router.get("/pending-review", response_model=list[CompetitionPendingReviewItem])
def list_pending_review(
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    if not _has_review_permission(current):
        raise HTTPException(403, "无权查看双审列表")
    competitions = db.execute(_competition_stmt().order_by(Competition.end_date.desc())).scalars().all()
    items: list[CompetitionPendingReviewItem] = []
    for comp in competitions:
        current_shares, default_shares, reason = _get_competition_share_context(db, comp)
        need, deviation_reason = needs_competition_double_review(current_shares, default_shares)
        if not need:
            continue
        items.append(
            CompetitionPendingReviewItem(
                comp_id=comp.comp_id,
                name=comp.name,
                level=comp.level,
                award_level=comp.award_level,
                team_lead_open_id=comp.team_lead_open_id,
                current_shares=current_shares,
                default_shares=default_shares,
                deviation_reason=deviation_reason or reason,
                members=[{"member_open_id": item.member_open_id, "member_role": item.member_role} for item in comp.members],
            )
        )
    return items


@router.get("/{comp_id}", response_model=CompetitionRead)
def get_competition(
    comp_id: int,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    comp = db.execute(_competition_stmt().where(Competition.comp_id == comp_id)).scalar_one_or_none()
    if comp is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "competition not found")
    return _to_read(comp, db, current.open_id)


@router.patch("/{comp_id}", response_model=CompetitionRead)
async def update_competition(
    comp_id: int,
    payload: CompetitionUpdate,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    comp = db.execute(_competition_stmt().where(Competition.comp_id == comp_id)).scalar_one_or_none()
    if comp is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "competition not found")
    if not _can_edit_competition(comp, current, db):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "creator, member or admin required")

    update_data = payload.model_dump(exclude_unset=True, exclude={"members", "project_id", "cert_files", "photo_files"})
    member_inputs = payload.members if "members" in payload.model_fields_set else None
    cert_files_set = "cert_files" in payload.model_fields_set
    photo_files_set = "photo_files" in payload.model_fields_set
    if cert_files_set:
        update_data["cert_files_json"] = _serialize_attachments(payload.cert_files or [])
    if photo_files_set:
        update_data["photo_files_json"] = _serialize_attachments(payload.photo_files or [])

    if not update_data and member_inputs is None:
        return _to_read(comp, db, current.open_id)

    if member_inputs is not None:
        members, team_lead_open_id = _normalize_members(
            member_inputs,
            update_data.get("team_lead_open_id", comp.team_lead_open_id),
        )
        update_data["team_lead_open_id"] = team_lead_open_id
    else:
        members = [CompetitionMemberInput.model_validate(item) for item in comp.members]

    next_state = {col.name: getattr(comp, col.name) for col in comp.__table__.columns}
    next_state.update(update_data)
    push_cert = payload.cert_files if cert_files_set else None
    push_photo = payload.photo_files if photo_files_set else None
    try:
        next_record_id = await _push_comp(
            next_state,
            record_id=comp.base_record_id,
            cert_files=push_cert,
            photo_files=push_photo,
        )
    except Exception as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"failed to sync competition: {exc}") from exc

    try:
        if next_record_id and not comp.base_record_id:
            comp.base_record_id = next_record_id
        for key, value in update_data.items():
            setattr(comp, key, value)
        db.flush()

        if member_inputs is not None:
            _replace_members(db, comp, members)

        try_write_competition(
            db,
            comp,
            shares={item.member_open_id: item.share_ratio for item in members},
            submitted_by=current.open_id,
        )
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "competition update conflict") from exc
    except Exception as exc:
        db.rollback()
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc

    comp = db.execute(_competition_stmt().where(Competition.comp_id == comp_id)).scalar_one()
    return _to_read(comp, db, current.open_id)


class CompetitionMemberContributionUpdate(BaseModel):
    contribution_text: str | None = None


@router.patch("/{comp_id}/members/{member_open_id}/contribution", response_model=CompetitionRead)
async def update_competition_member_contribution(
    comp_id: int,
    member_open_id: str,
    payload: CompetitionMemberContributionUpdate,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    """更新比赛成员自描述. 权限: 该成员本人 / 比赛创建者 / admin."""
    comp = db.execute(_competition_stmt().where(Competition.comp_id == comp_id)).scalar_one_or_none()
    if comp is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "competition not found")
    is_self = member_open_id == current.open_id
    if not (is_self or _is_admin(current) or comp.created_by == current.open_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "member self / creator / admin required")
    cm = db.query(CompetitionMember).filter_by(comp_id=comp_id, member_open_id=member_open_id).first()
    if cm is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "competition_member not found")
    cm.contribution_text = payload.contribution_text
    db.commit()
    comp = db.execute(_competition_stmt().where(Competition.comp_id == comp_id)).scalar_one()
    return _to_read(comp, db, current.open_id)


@router.delete("/{comp_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_competition(
    comp_id: int,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    comp = db.execute(_competition_stmt().where(Competition.comp_id == comp_id)).scalar_one_or_none()
    if comp is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "competition not found")
    if not _can_edit_competition(comp, current, db):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "creator, member or admin required")

    base_record_id = comp.base_record_id
    try:
        db.query(PointsLedger).filter_by(source_type="competition", source_id=comp_id).delete()
        db.delete(comp)
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc

    await _delete_comp_base(base_record_id)


@router.post("/{comp_id}/double-review")
def double_review(
    comp_id: int,
    payload: ReviewPayload,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    if not _has_review_permission(current):
        raise HTTPException(403, "无权双审")
    comp = db.execute(_competition_stmt().where(Competition.comp_id == comp_id)).scalar_one_or_none()
    if comp is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "competition not found")
    ledgers = db.query(PointsLedger).filter_by(source_type="competition", source_id=comp_id).all()
    if not ledgers:
        raise HTTPException(404, "competition ledger not found")
    for ledger in ledgers:
        ledger.status = "approved" if payload.approve else "rejected"
        ledger.approved_by = current.open_id
        ledger.approved_at = datetime.utcnow()
        ledger.review_comment = payload.comment
    db.commit()
    return {"ok": True}
