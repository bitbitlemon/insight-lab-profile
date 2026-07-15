from __future__ import annotations

from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models import Member, PermissionAssignment
from app.permissions import PROJECT_BUSINESS_UNITS, member_is_super_admin_for_db

router = APIRouter(prefix="/api/permissions", tags=["permissions"])

PermissionRoleKey = Literal["super_admin", "bu_minister", "bu_deputy", "department_minister", "department_deputy"]
PermissionScopeType = Literal["global", "bu", "department"]

ROLE_LABELS = {
    "super_admin": "超级管理员",
    "bu_minister": "BU部长",
    "bu_deputy": "BU副部长",
    "department_minister": "部门部长",
    "department_deputy": "部门副部长",
}

DEPARTMENT_SCOPE_VALUES = ("科技部", "研发部")


class PermissionAssignmentCreate(BaseModel):
    member_open_id: str
    role_key: PermissionRoleKey
    scope_type: PermissionScopeType
    scope_value: str | None = None


class PermissionAssignmentRead(BaseModel):
    assignment_id: int
    member_open_id: str
    member_name: str | None = None
    member_department: str | None = None
    role_key: PermissionRoleKey
    role_label: str
    scope_type: PermissionScopeType
    scope_value: str | None = None
    active: bool
    assigned_by: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


def _can_manage_permissions(current: Member, db: Session) -> bool:
    return current.role == "admin" or member_is_super_admin_for_db(db, current)


def _validate_scope(payload: PermissionAssignmentCreate) -> None:
    if payload.role_key == "super_admin":
        if payload.scope_type != "global" or payload.scope_value:
            raise HTTPException(400, "超级管理员必须是全局权限")
        return
    if payload.role_key.startswith("bu_"):
        if payload.scope_type != "bu" or payload.scope_value not in PROJECT_BUSINESS_UNITS:
            raise HTTPException(400, "BU权限必须选择有效BU")
        return
    if payload.role_key.startswith("department_"):
        if payload.scope_type != "department" or payload.scope_value not in DEPARTMENT_SCOPE_VALUES:
            raise HTTPException(400, "部门权限必须选择科技部或研发部")


def _serialize(row: PermissionAssignment, member: Member | None = None) -> PermissionAssignmentRead:
    return PermissionAssignmentRead(
        assignment_id=row.assignment_id,
        member_open_id=row.member_open_id,
        member_name=member.name if member else None,
        member_department=member.department if member else None,
        role_key=row.role_key,
        role_label=ROLE_LABELS.get(row.role_key, row.role_key),
        scope_type=row.scope_type,
        scope_value=row.scope_value,
        active=row.active,
        assigned_by=row.assigned_by,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get("/options")
def permission_options(_: Member = Depends(get_current_user)):
    return {
        "business_units": list(PROJECT_BUSINESS_UNITS),
        "departments": list(DEPARTMENT_SCOPE_VALUES),
        "roles": [
            {"role_key": "super_admin", "label": ROLE_LABELS["super_admin"], "scope_type": "global"},
            {"role_key": "bu_minister", "label": ROLE_LABELS["bu_minister"], "scope_type": "bu"},
            {"role_key": "bu_deputy", "label": ROLE_LABELS["bu_deputy"], "scope_type": "bu"},
            {"role_key": "department_minister", "label": "科技部/研发部部长", "scope_type": "department"},
            {"role_key": "department_deputy", "label": "科技部/研发部副部长", "scope_type": "department"},
        ],
    }


@router.get("/assignments", response_model=list[PermissionAssignmentRead])
def list_permission_assignments(
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    if not _can_manage_permissions(current, db):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "仅超级管理员可管理权限")
    rows = db.execute(
        select(PermissionAssignment)
        .where(PermissionAssignment.active.is_(True))
        .order_by(PermissionAssignment.scope_type.asc(), PermissionAssignment.scope_value.asc(), PermissionAssignment.role_key.asc())
    ).scalars().all()
    members = {}
    if rows:
        member_ids = {row.member_open_id for row in rows}
        members = {
            member.open_id: member
            for member in db.execute(select(Member).where(Member.open_id.in_(member_ids))).scalars().all()
        }
    return [_serialize(row, members.get(row.member_open_id)) for row in rows]


@router.post("/assignments", response_model=PermissionAssignmentRead, status_code=201)
def create_permission_assignment(
    payload: PermissionAssignmentCreate,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    if not _can_manage_permissions(current, db):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "仅超级管理员可管理权限")
    _validate_scope(payload)
    member = db.get(Member, payload.member_open_id)
    if not member:
        raise HTTPException(404, "member not found")
    existing = db.execute(
        select(PermissionAssignment)
        .where(PermissionAssignment.member_open_id == payload.member_open_id)
        .where(PermissionAssignment.role_key == payload.role_key)
        .where(PermissionAssignment.scope_type == payload.scope_type)
        .where(PermissionAssignment.scope_value == payload.scope_value)
    ).scalar_one_or_none()
    if existing:
        existing.active = True
        existing.assigned_by = current.open_id
        db.commit()
        db.refresh(existing)
        return _serialize(existing, member)
    row = PermissionAssignment(
        member_open_id=payload.member_open_id,
        role_key=payload.role_key,
        scope_type=payload.scope_type,
        scope_value=payload.scope_value,
        assigned_by=current.open_id,
    )
    db.add(row)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "权限配置已存在") from exc
    db.refresh(row)
    return _serialize(row, member)


@router.delete("/assignments/{assignment_id}", status_code=204)
def delete_permission_assignment(
    assignment_id: int,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    if not _can_manage_permissions(current, db):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "仅超级管理员可管理权限")
    row = db.get(PermissionAssignment, assignment_id)
    if not row or not row.active:
        raise HTTPException(404, "permission assignment not found")
    row.active = False
    row.updated_at = datetime.utcnow()
    db.commit()
