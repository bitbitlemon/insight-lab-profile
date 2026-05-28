from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.deps import get_current_user
from app.models import Member
from app.schemas.common import PageResponse
from app.schemas.members import MemberCreate, MemberRead, MemberUpdate
from app.services.sync import push_record_to_base

router = APIRouter(prefix="/api/members", tags=["members"])
log = logging.getLogger(__name__)

PRIVILEGED_ROLES = {"admin", "staff"}
SELF_EDIT_FORBIDDEN_FIELDS = {"base_record_id", "role", "department", "position", "status"}
PRIVATE_FIELDS = {"email": None, "mobile": None}
PRIVATE_PROFILE_FIELDS = {"bio": None, "research_area": None}


def _is_privileged(user: Member) -> bool:
    return user.role in PRIVILEGED_ROLES


def _serialize_member(member: Member, viewer: Member) -> MemberRead:
    payload = MemberRead.model_validate(member)
    if member.open_id == viewer.open_id or _is_privileged(viewer):
        return payload
    payload = payload.model_copy(update=PRIVATE_FIELDS)
    if member.privacy_level == "private":
        payload = payload.model_copy(update=PRIVATE_PROFILE_FIELDS)
    return payload


async def _push_member(member_data: dict[str, Any], record_id: str | None = None) -> str | None:
    if not settings.lark_table_members:
        return record_id
    record = await push_record_to_base(settings.lark_table_members, member_data, record_id=record_id)
    return record.get("record_id") or record_id


@router.get("", response_model=PageResponse[MemberRead])
def list_members(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    dept: str | None = Query(None),
    department: str | None = Query(None),
    role: str | None = Query(None),
    keyword: str | None = Query(None),
    db: Session = Depends(get_db),
    current_user: Member = Depends(get_current_user),
):
    stmt = select(Member)
    count_stmt = select(func.count()).select_from(Member)

    filters = []
    effective_dept = department or dept
    if effective_dept:
        # 主部门匹配, 或 extra_memberships JSON 文本里包含该部门名 (兼职)
        filters.append(
            or_(
                Member.department == effective_dept,
                Member.extra_memberships.ilike(f'%"department": "{effective_dept}"%'),
            )
        )
    if role:
        filters.append(Member.role == role)
    if keyword:
        pattern = f"%{keyword}%"
        filters.append(
            or_(
                Member.open_id.ilike(pattern),
                Member.name.ilike(pattern),
                Member.en_name.ilike(pattern),
                Member.department.ilike(pattern),
                Member.title.ilike(pattern),
            )
        )

    for condition in filters:
        stmt = stmt.where(condition)
        count_stmt = count_stmt.where(condition)

    stmt = stmt.order_by(Member.name.asc()).offset((page - 1) * page_size).limit(page_size)

    members = db.execute(stmt).scalars().all()
    total = db.execute(count_stmt).scalar_one()
    items = [_serialize_member(member, current_user) for member in members]
    return PageResponse[MemberRead](items=items, total=total, page=page, page_size=page_size)


@router.get("/{open_id}", response_model=MemberRead)
def get_member(
    open_id: str,
    db: Session = Depends(get_db),
    current_user: Member = Depends(get_current_user),
):
    member = db.get(Member, open_id)
    if member is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "member not found")
    return _serialize_member(member, current_user)


@router.post("", response_model=MemberRead, status_code=status.HTTP_201_CREATED)
async def create_member(
    payload: MemberCreate,
    db: Session = Depends(get_db),
    current_user: Member = Depends(get_current_user),
):
    if not _is_privileged(current_user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "admin or staff required")
    if db.get(Member, payload.open_id) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "member already exists")

    data = payload.model_dump()
    try:
        data["base_record_id"] = await _push_member(data, record_id=data.get("base_record_id"))
        member = Member(**data)
        db.add(member)
        db.commit()
        db.refresh(member)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "member create conflict") from exc
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"failed to sync member: {exc}") from exc
    return MemberRead.model_validate(member)


@router.patch("/{open_id}", response_model=MemberRead)
async def update_member(
    open_id: str,
    payload: MemberUpdate,
    db: Session = Depends(get_db),
    current_user: Member = Depends(get_current_user),
):
    member = db.get(Member, open_id)
    if member is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "member not found")

    is_self = current_user.open_id == open_id
    privileged = _is_privileged(current_user)
    if not is_self and not privileged:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "can only update self")

    update_data = payload.model_dump(exclude_unset=True)
    if not privileged:
        forbidden = SELF_EDIT_FORBIDDEN_FIELDS.intersection(update_data)
        if forbidden:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                f"self update cannot modify: {', '.join(sorted(forbidden))}",
            )

    if not update_data:
        return MemberRead.model_validate(member)

    next_state = MemberRead.model_validate(member).model_dump()
    next_state.update(update_data)

    try:
        try:
            next_record_id = await _push_member(next_state, record_id=member.base_record_id)
            if next_record_id:
                member.base_record_id = next_record_id
        except Exception as exc:
            log.warning("member %s Base 同步推送失败 (本地仍写入): %s", open_id, exc)
        for key, value in update_data.items():
            setattr(member, key, value)
        db.commit()
        db.refresh(member)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "member update conflict") from exc
    except Exception as exc:
        db.rollback()
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"failed to save member: {exc}") from exc
    return MemberRead.model_validate(member)


@router.delete("/{open_id}", response_model=MemberRead)
async def deactivate_member(
    open_id: str,
    db: Session = Depends(get_db),
    current_user: Member = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "admin required")

    member = db.get(Member, open_id)
    if member is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "member not found")

    next_state = MemberRead.model_validate(member).model_dump()
    next_state["status"] = "left"

    try:
        next_record_id = await _push_member(next_state, record_id=member.base_record_id)
        if next_record_id:
            member.base_record_id = next_record_id
        member.status = "left"
        db.commit()
        db.refresh(member)
    except Exception as exc:
        db.rollback()
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"failed to sync member: {exc}") from exc
    return MemberRead.model_validate(member)
