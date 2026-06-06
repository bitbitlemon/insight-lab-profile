from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.services.focus_card_actions import handle_focus_card_action, success_toast
from app.services.chat_card_actions import handle_chat_intent_card_action

router = APIRouter(prefix="/api/lark", tags=["lark-callbacks"])


def _deep_get(payload: dict[str, Any], *paths: str) -> Any:
    for path in paths:
        cur: Any = payload
        ok = True
        for part in path.split("."):
            if not isinstance(cur, dict) or part not in cur:
                ok = False
                break
            cur = cur[part]
        if ok:
            return cur
    return None


def _verify_token(payload: dict[str, Any]) -> None:
    expected = settings.lark_verification_token
    if not expected:
        return
    token = _deep_get(payload, "token", "header.token")
    if token != expected:
        raise HTTPException(403, "invalid lark token")


@router.post("/card-callback")
async def lark_card_callback(request: Request, db: Session = Depends(get_db)):
    payload = await request.json()
    if payload.get("type") == "url_verification" and payload.get("challenge"):
        return {"challenge": payload["challenge"]}
    _verify_token(payload)
    # dispatch by value.kind (chat intent cards) before falling back to focus card handler
    _val = _deep_get(payload, "event.action.value", "action.value", "event.value", "value") or {}
    if isinstance(_val, dict) and _val.get("kind") in ("complete_confirm", "quick_done", "morning_ack"):
        try:
            return handle_chat_intent_card_action(payload, db)
        except Exception:
            return success_toast("处理失败, 请稍后重试")
    try:
        return handle_focus_card_action(payload, db)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except LookupError as exc:
        raise HTTPException(404, str(exc))
    except Exception:
        return success_toast("处理失败，请稍后重试")
