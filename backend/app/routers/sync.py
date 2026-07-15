"""同步路由: admin 可手动触发全量同步, 查看同步状态."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ..db import get_db
from ..deps import require_admin
from ..models import Member, SyncState
from ..services.sync import sync_all_from_base, sync_projects_from_base

router = APIRouter(prefix="/api/sync", tags=["sync"])


@router.post("/all")
async def trigger_full_sync(db: Session = Depends(get_db), _: Member = Depends(require_admin)):
    """admin 手动全量同步 Base → SQLite"""
    results = await sync_all_from_base(db)
    return {"results": results}


@router.post("/projects")
async def trigger_projects_sync(db: Session = Depends(get_db), _: Member = Depends(require_admin)):
    """admin 手动同步项目中心数据: projects + tasks。"""
    results = await sync_projects_from_base(db)
    return {"results": results}


@router.get("/state")
def get_sync_state(db: Session = Depends(get_db), _: Member = Depends(require_admin)):
    rows = db.query(SyncState).all()
    return {
        "states": [
            {
                "table_name": r.table_name,
                "last_sync_at": r.last_sync_at,
                "rows_synced": r.rows_synced,
                "last_error": r.last_error,
            }
            for r in rows
        ]
    }
