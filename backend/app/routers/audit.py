"""审计日志查询: admin only, 分页 + 多维筛选 + delete undo 还原."""
import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select, inspect as sa_inspect
from sqlalchemy.orm import Session
from ..db import Base, get_db
from ..deps import require_admin
from ..models import AuditLog, Member
from ..schemas.common import PageResponse
from pydantic import BaseModel


class AuditEntry(BaseModel):
    log_id: int
    actor_open_id: str
    action: str
    target_table: str
    target_id: str
    diff: str | None
    ip: str | None
    created_at: datetime
    model_config = {"from_attributes": True}


router = APIRouter(prefix="/api/audit_log", tags=["audit_log"])


@router.get("", response_model=PageResponse[AuditEntry])
def list_audit(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    actor_open_id: str | None = None,
    action: str | None = None,
    target_table: str | None = None,
    target_id: str | None = None,
    db: Session = Depends(get_db),
    _: Member = Depends(require_admin),
):
    stmt = select(AuditLog)
    count_stmt = select(func.count()).select_from(AuditLog)
    for col, val in [
        (AuditLog.actor_open_id, actor_open_id),
        (AuditLog.action, action),
        (AuditLog.target_table, target_table),
        (AuditLog.target_id, target_id),
    ]:
        if val:
            stmt = stmt.where(col == val)
            count_stmt = count_stmt.where(col == val)
    stmt = stmt.order_by(AuditLog.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    rows = db.execute(stmt).scalars().all()
    total = db.execute(count_stmt).scalar_one()
    return PageResponse(
        items=[AuditEntry.model_validate(r) for r in rows],
        total=total, page=page, page_size=page_size,
    )


def _find_model_by_table(table_name: str):
    for cls in Base.registry.mappers:
        m = cls.class_
        if getattr(m, "__tablename__", None) == table_name:
            return m
    return None


@router.post("/{log_id}/undo", status_code=status.HTTP_200_OK)
def undo_audit_entry(
    log_id: int,
    db: Session = Depends(get_db),
    _: Member = Depends(require_admin),
):
    """admin 还原一条 delete 审计 (用 before snapshot 重建行)。

    限制:
    - 只支持 action=delete (update/create 不需要 undo)
    - 必须 diff 含 before snapshot
    - 行存在则 409 (避免覆盖)
    """
    entry = db.get(AuditLog, log_id)
    if entry is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "audit entry not found")
    if entry.action != "delete":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "only delete action can be undone")
    payload = json.loads(entry.diff or "{}")
    before = payload.get("before") or {}
    if not before:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "audit entry missing before snapshot")
    model = _find_model_by_table(entry.target_table)
    if model is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"unknown table: {entry.target_table}")
    pk_cols = [c.key for c in sa_inspect(model).mapper.primary_key]
    pk_values = {k: before.get(k) for k in pk_cols}
    if any(v is None for v in pk_values.values()):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"snapshot missing pk fields: {pk_cols}")
    existing = db.get(model, tuple(pk_values[k] for k in pk_cols) if len(pk_cols) > 1 else pk_values[pk_cols[0]])
    if existing is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "row already exists, cannot undo")
    valid_keys = {c.key for c in sa_inspect(model).mapper.column_attrs}
    kwargs = {k: v for k, v in before.items() if k in valid_keys}
    db.add(model(**kwargs))
    db.commit()
    return {"restored_table": entry.target_table, "restored_pk": pk_values}
