"""项目管理路由: Project CRUD + 成员管理 + 完成时触发积分分发."""
from __future__ import annotations
import json
from datetime import date, datetime
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.config import settings
from app.db import get_db
from app.deps import get_current_user
from app.models import Member, PointsLedger, Project, ProjectMember, Task
from app.schemas.common import PageResponse
from app.services.points_rules import RULES_VERSION
from app.services.lark_im import notify_project_member_added
from app.services.base_writer import mirror_to_base, delete_from_base

router = APIRouter(prefix="/api/projects", tags=["projects"])

PStatus = Literal["planning", "active", "paused", "completed", "archived"]
PPriority = Literal["low", "medium", "high", "urgent"]
PMRole = Literal["owner", "co_lead", "member", "observer"]


class ProjectMemberRead(BaseModel):
    member_open_id: str
    role: PMRole
    share_ratio: float
    joined_at: date
    left_at: date | None
    model_config = {"from_attributes": True}


class ProjectRead(BaseModel):
    project_id: int
    name: str
    description: str | None
    status: PStatus
    priority: PPriority
    owner_open_id: str
    department: str | None
    start_date: date | None
    target_end_date: date | None
    actual_end_date: date | None
    tags: str | None
    points_awarded: float
    archived_at: datetime | None
    created_by: str
    created_at: datetime
    updated_at: datetime
    members: list[ProjectMemberRead] = []
    days_active: int = 0
    task_count: int = 0
    task_done_count: int = 0

    model_config = {"from_attributes": True}


class ProjectCreate(BaseModel):
    name: str
    description: str | None = None
    status: PStatus = "active"
    priority: PPriority = "medium"
    department: str | None = None
    start_date: date | None = None
    target_end_date: date | None = None
    tags: str | None = None
    points_awarded: float = 0.0
    members: list[dict] = []  # [{"member_open_id":..., "role":..., "share_ratio":...}]


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    status: PStatus | None = None
    priority: PPriority | None = None
    department: str | None = None
    start_date: date | None = None
    target_end_date: date | None = None
    actual_end_date: date | None = None
    tags: str | None = None
    points_awarded: float | None = None


def _serialize(p: Project) -> ProjectRead:
    today = date.today()
    if p.start_date:
        end = p.actual_end_date or today
        days = max(0, (end - p.start_date).days)
    else:
        days = 0
    pr = ProjectRead.model_validate(p)
    pr.days_active = days
    pr.task_count = len(p.tasks)
    pr.task_done_count = sum(1 for t in p.tasks if t.status == "done")
    return pr


@router.get("", response_model=PageResponse[ProjectRead])
def list_projects(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    status: PStatus | None = Query(None),
    department: str | None = Query(None),
    member_open_id: str | None = Query(None),
    db: Session = Depends(get_db),
    _: Member = Depends(get_current_user),
):
    stmt = select(Project).options(selectinload(Project.members), selectinload(Project.tasks))
    count_stmt = select(func.count()).select_from(Project)
    if status:
        stmt = stmt.where(Project.status == status)
        count_stmt = count_stmt.where(Project.status == status)
    if department:
        stmt = stmt.where(Project.department == department)
        count_stmt = count_stmt.where(Project.department == department)
    if member_open_id:
        link = select(ProjectMember.project_id).where(ProjectMember.member_open_id == member_open_id)
        cond = or_(Project.owner_open_id == member_open_id, Project.project_id.in_(link))
        stmt = stmt.where(cond)
        count_stmt = count_stmt.where(cond)
    stmt = stmt.order_by(Project.updated_at.desc()).offset((page - 1) * page_size).limit(page_size)
    items = db.execute(stmt).scalars().all()
    total = db.execute(count_stmt).scalar_one()
    return PageResponse[ProjectRead](
        items=[_serialize(p) for p in items],
        total=total, page=page, page_size=page_size,
    )


@router.get("/{project_id}", response_model=ProjectRead)
def get_project(
    project_id: int,
    db: Session = Depends(get_db),
    _: Member = Depends(get_current_user),
):
    p = db.execute(
        select(Project).options(selectinload(Project.members), selectinload(Project.tasks))
        .where(Project.project_id == project_id)
    ).scalar_one_or_none()
    if not p:
        raise HTTPException(404, "project not found")
    return _serialize(p)


def _project_fields_for_base(p: Project) -> dict:
    return {
        "name": p.name,
        "description": p.description or "",
        "status": p.status,
        "priority": p.priority,
        "owner_open_id": p.owner_open_id,
        "department": p.department or "",
        "start_date": p.start_date.isoformat() if p.start_date else None,
        "target_end_date": p.target_end_date.isoformat() if p.target_end_date else None,
        "actual_end_date": p.actual_end_date.isoformat() if p.actual_end_date else None,
        "tags": p.tags or "",
        "points_awarded": float(p.points_awarded or 0),
    }


@router.post("", response_model=ProjectRead, status_code=201)
async def create_project(
    payload: ProjectCreate,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    p = Project(
        name=payload.name, description=payload.description,
        status=payload.status, priority=payload.priority,
        owner_open_id=current.open_id, department=payload.department or current.department,
        start_date=payload.start_date or date.today(),
        target_end_date=payload.target_end_date, tags=payload.tags,
        points_awarded=payload.points_awarded, created_by=current.open_id,
    )
    db.add(p); db.flush()
    db.add(ProjectMember(project_id=p.project_id, member_open_id=current.open_id, role="owner", share_ratio=0.0))
    for m in payload.members:
        oid = m.get("member_open_id")
        if not oid or oid == current.open_id: continue
        db.add(ProjectMember(
            project_id=p.project_id, member_open_id=oid,
            role=m.get("role", "member"),
            share_ratio=float(m.get("share_ratio", 0.0)),
        ))
    db.commit(); db.refresh(p)
    # Base 写穿透 (配置缺失时优雅跳过)
    new_rid = await mirror_to_base(
        getattr(settings, "lark_table_projects", ""),
        _project_fields_for_base(p),
        record_id=p.base_record_id,
    )
    if new_rid:
        p.base_record_id = new_rid
        db.commit()
    return _serialize(p)


def _award_project_points(db: Session, p: Project, submitted_by: str | None) -> int:
    """项目完成时按成员 share_ratio 写 PointsLedger.
    注意: PointsLedger.source_type CHECK 约束含 'paper/competition/contribution/duty/adjust',
    用 'adjust' 类型并在 reason 标明 project. (SQLite 不能改 CHECK 约束)
    """
    if p.points_awarded <= 0:
        return 0
    # 清旧的
    db.query(PointsLedger).filter(
        PointsLedger.source_type == "adjust",
        PointsLedger.source_id == p.project_id,
        PointsLedger.reason.like(f"项目《{p.name[:30]}%"),
    ).delete(synchronize_session=False)
    members = db.query(ProjectMember).filter_by(project_id=p.project_id).filter(ProjectMember.left_at.is_(None)).all()
    if not members: return 0
    # 如果总 share_ratio 接近 1, 直接用; 否则均分
    total_share = sum(m.share_ratio for m in members)
    use_default = total_share < 0.999 or total_share > 1.001
    occ = p.actual_end_date or date.today()
    snap = {"project_id": p.project_id, "name": p.name, "points_awarded": p.points_awarded,
            "share_mode": "default_equal" if use_default else "manual"}
    n = 0
    for m in members:
        ratio = (1.0 / len(members)) if use_default else m.share_ratio
        final = p.points_awarded * ratio
        if final <= 0: continue
        db.add(PointsLedger(
            member_open_id=m.member_open_id, source_type="adjust",
            source_id=p.project_id, occurred_at=occ,
            base_points=p.points_awarded, share_ratio=ratio,
            decay_factor=1.0, cap_adjustment_factor=1.0, final_points=final,
            reason=f"项目《{p.name[:30]}》 完成奖励 ({m.role})",
            status="approved", calculation_rule_version=RULES_VERSION,
            source_snapshot_json=json.dumps(snap, ensure_ascii=False),
            submitted_by=submitted_by, submitted_at=datetime.utcnow(),
            approved_at=datetime.utcnow(),
            settlement_period=f"{occ.year}Q{(occ.month-1)//3+1}",
        ))
        n += 1
    return n


@router.patch("/{project_id}", response_model=ProjectRead)
async def update_project(
    project_id: int,
    payload: ProjectUpdate,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    p = db.get(Project, project_id)
    if not p:
        raise HTTPException(404, "not found")
    if p.owner_open_id != current.open_id and current.role not in ("admin", "staff"):
        raise HTTPException(403, "仅 owner / admin / staff 可编辑")
    old_status = p.status
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(p, k, v)
    if payload.status == "completed" and old_status != "completed":
        if not p.actual_end_date:
            p.actual_end_date = date.today()
        _award_project_points(db, p, current.open_id)
    if payload.status == "archived" and not p.archived_at:
        p.archived_at = datetime.utcnow()
    db.commit()
    db.refresh(p)
    new_rid = await mirror_to_base(
        getattr(settings, "lark_table_projects", ""),
        _project_fields_for_base(p),
        record_id=p.base_record_id,
    )
    if new_rid and new_rid != p.base_record_id:
        p.base_record_id = new_rid
        db.commit()
    p = db.execute(
        select(Project).options(selectinload(Project.members), selectinload(Project.tasks))
        .where(Project.project_id == project_id)
    ).scalar_one()
    return _serialize(p)


@router.delete("/{project_id}", status_code=204)
async def delete_project(
    project_id: int,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    p = db.get(Project, project_id)
    if not p:
        raise HTTPException(404, "not found")
    if p.owner_open_id != current.open_id and current.role != "admin":
        raise HTTPException(403, "仅 owner / admin 可删除")
    base_rid = p.base_record_id
    db.query(PointsLedger).filter(
        PointsLedger.source_type == "adjust", PointsLedger.source_id == project_id,
    ).delete(synchronize_session=False)
    db.delete(p); db.commit()
    await delete_from_base(getattr(settings, "lark_table_projects", ""), base_rid)


# ============ 成员管理 ============

class MemberPayload(BaseModel):
    member_open_id: str
    role: PMRole = "member"
    share_ratio: float = 0.0


@router.post("/{project_id}/members", response_model=ProjectMemberRead, status_code=201)
def add_member(
    project_id: int,
    payload: MemberPayload,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    p = db.get(Project, project_id)
    if not p: raise HTTPException(404, "project not found")
    if p.owner_open_id != current.open_id and current.role not in ("admin", "staff"):
        raise HTTPException(403, "仅 owner 可加成员")
    exists = db.get(ProjectMember, (project_id, payload.member_open_id))
    if exists: raise HTTPException(409, "已是成员")
    pm = ProjectMember(project_id=project_id, member_open_id=payload.member_open_id,
                       role=payload.role, share_ratio=payload.share_ratio)
    db.add(pm); db.commit(); db.refresh(pm)
    notify_project_member_added(
        member_open_id=payload.member_open_id, project_name=p.name,
        role=payload.role, added_by_name=current.name,
    )
    return ProjectMemberRead.model_validate(pm)


@router.delete("/{project_id}/members/{member_open_id}", status_code=204)
def remove_member(
    project_id: int, member_open_id: str,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    p = db.get(Project, project_id)
    if not p: raise HTTPException(404, "project not found")
    if p.owner_open_id != current.open_id and current.role not in ("admin", "staff"):
        raise HTTPException(403)
    pm = db.get(ProjectMember, (project_id, member_open_id))
    if not pm: raise HTTPException(404, "member not found")
    pm.left_at = date.today()
    db.commit()
