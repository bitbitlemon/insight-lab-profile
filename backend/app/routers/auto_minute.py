"""auto_minute admin 触发端点: 手动按 meeting_id 或 minute_token 触发同步."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..db import get_db
from ..deps import require_admin
from ..models import Member
from ..services.minutes_sync import run_meeting_sync, notify_owners_card

router = APIRouter(prefix="/api/auto_minute", tags=["auto_minute"])


class TriggerRequest(BaseModel):
    meeting_id: str | None = None
    minute_token: str | None = None
    notify: bool = False


@router.post("/trigger")
async def trigger(
    req: TriggerRequest,
    db: Session = Depends(get_db),
    _: Member = Depends(require_admin),
):
    if not (req.meeting_id or req.minute_token):
        raise HTTPException(400, "需要 meeting_id 或 minute_token 之一")
    result = run_meeting_sync(db, meeting_id=req.meeting_id, minute_token=req.minute_token)
    if req.notify and result.get("ok") and result.get("owners"):
        notify = await notify_owners_card(result["owners"], result.get("title", "会议"))
        result["notify"] = notify
    return result
