from __future__ import annotations

import hashlib
import json
import re
import secrets
import time
from datetime import datetime, timedelta
from typing import Literal
from zoneinfo import ZoneInfo

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.deps import get_current_user
from app.models import Member
from app.services.lark import get_lark

router = APIRouter(prefix="/api/voice", tags=["voice"])


CommandAction = Literal["task", "event", "unknown"]
_jsapi_ticket_cache: dict[str, str | float] = {"ticket": "", "expires_at": 0.0}


class VoiceInterpretRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=500)


class VoiceJsapiConfigRequest(BaseModel):
    url: str = Field(..., min_length=8, max_length=2048)


class VoiceJsapiConfigResponse(BaseModel):
    appId: str
    timestamp: int
    nonceStr: str
    signature: str
    jsApiList: list[str]
    url: str


class VoiceTranscribeRequest(BaseModel):
    audio_base64: str = Field(..., min_length=16, max_length=8_000_000)
    format: Literal["wav", "aac", "mp3", "pcm"] = "wav"


class VoiceTranscribeResponse(BaseModel):
    text: str


class VoiceInterpretResponse(BaseModel):
    action: CommandAction
    confidence: float = 0.0
    title: str
    description: str | None = None
    start_at: str | None = None
    end_at: str | None = None
    due_date: str | None = None
    location: str | None = None
    attendee_open_ids: list[str] = []
    assignee_open_ids: list[str] = []
    priority: Literal["low", "medium", "high", "urgent"] = "medium"
    reason: str | None = None


async def _get_jsapi_ticket() -> str:
    cached = str(_jsapi_ticket_cache.get("ticket") or "")
    expires_at = float(_jsapi_ticket_cache.get("expires_at") or 0)
    if cached and time.time() < expires_at - 60:
        return cached

    data = await get_lark()._request("POST", "/jssdk/ticket/get")
    ticket = str(data.get("ticket") or "")
    if not ticket:
        raise HTTPException(status_code=502, detail="飞书 JSAPI ticket 获取失败")
    expire = int(data.get("expire_in") or data.get("expire") or 7200)
    _jsapi_ticket_cache["ticket"] = ticket
    _jsapi_ticket_cache["expires_at"] = time.time() + expire
    return ticket


def _recognition_text(data: dict) -> str:
    candidates = [
        data.get("text"),
        data.get("result"),
        data.get("recognition_text"),
        data.get("utterance"),
    ]
    speech = data.get("speech")
    if isinstance(speech, dict):
        candidates.extend([speech.get("text"), speech.get("result")])
    for item in candidates:
        if isinstance(item, str) and item.strip():
            return item.strip()
    results = data.get("results") or data.get("segments")
    if isinstance(results, list):
        text = "".join(str(item.get("text") or item.get("result") or "") for item in results if isinstance(item, dict))
        if text.strip():
            return text.strip()
    return ""


@router.post("/jsapi-config", response_model=VoiceJsapiConfigResponse)
async def get_voice_jsapi_config(
    payload: VoiceJsapiConfigRequest,
    _: Member = Depends(get_current_user),
):
    ticket = await _get_jsapi_ticket()
    timestamp = int(time.time() * 1000)
    nonce = secrets.token_hex(8)
    url = payload.url.split("#", 1)[0]
    raw = f"jsapi_ticket={ticket}&noncestr={nonce}&timestamp={timestamp}&url={url}"
    js_api_list = ["authorize", "getRecorderManager", "getFileSystemManager"]
    return VoiceJsapiConfigResponse(
        appId=settings.lark_app_id,
        timestamp=timestamp,
        nonceStr=nonce,
        signature=hashlib.sha1(raw.encode("utf-8")).hexdigest(),
        jsApiList=js_api_list,
        url=url,
    )


@router.post("/transcribe", response_model=VoiceTranscribeResponse)
async def transcribe_voice_audio(
    payload: VoiceTranscribeRequest,
    _: Member = Depends(get_current_user),
):
    try:
        data = await get_lark()._request(
            "POST",
            "/speech_to_text/v1/speech/file_recognize",
            json={
                "speech": {"speech": payload.audio_base64},
                "config": {
                    "file_id": f"voice_{secrets.token_hex(8)}",
                    "format": payload.format,
                    "engine_type": "16k_auto",
                },
            },
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"飞书语音识别失败: {type(exc).__name__}") from exc

    text = _recognition_text(data)
    if not text:
        raise HTTPException(status_code=502, detail="飞书语音识别未返回文字")
    return VoiceTranscribeResponse(text=text)


def _member_candidates(db: Session) -> list[dict[str, str | None]]:
    members = db.execute(
        select(Member).where(Member.status.in_(("active", "on_leave"))).order_by(Member.name.asc())
    ).scalars().all()
    return [
        {
            "open_id": member.open_id,
            "name": member.name,
            "en_name": member.en_name,
            "department": member.department,
        }
        for member in members
    ]


def _extract_json(content: str) -> dict:
    text = content.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    match = re.search(r"\{.*\}", text, flags=re.S)
    if match:
        text = match.group(0)
    return json.loads(text)


def _fallback_interpret(text: str, members: list[dict[str, str | None]]) -> VoiceInterpretResponse:
    compact = re.sub(r"[\s,，、。.;；:：/\\|()（）【】\[\]{}<>《》\"'“”‘’-]", "", text.lower())
    matched = []
    for member in members:
        names = [member.get("name"), member.get("en_name")]
        if any(name and re.sub(r"[\s,，、。.;；:：/\\|()（）【】\[\]{}<>《》\"'“”‘’-]", "", name.lower()) in compact for name in names):
            matched.append(member["open_id"])
    now = datetime.now(ZoneInfo("Asia/Shanghai"))
    start = now.replace(minute=0, second=0, microsecond=0) + timedelta(hours=2)
    hour_match = re.search(r"(\d{1,2})\s*(?:点|:|：)(\d{1,2})?", text)
    if "明天" in text:
        start += timedelta(days=1)
    elif "后天" in text:
        start += timedelta(days=2)
    if hour_match:
        hour = int(hour_match.group(1))
        minute = int(hour_match.group(2) or 0)
        if ("下午" in text or "晚上" in text) and hour < 12:
            hour += 12
        start = start.replace(hour=min(23, hour), minute=min(59, minute))
    if any(word in text for word in ("会", "会议", "开会", "日程", "约")):
        return VoiceInterpretResponse(
            action="event",
            confidence=0.55,
            title="语音会议",
            description=f"语音创建: {text}",
            start_at=start.isoformat(),
            end_at=(start + timedelta(hours=1)).isoformat(),
            location="云实验室会议室",
            attendee_open_ids=[open_id for open_id in matched if open_id],
            reason="fallback",
        )
    return VoiceInterpretResponse(
        action="task",
        confidence=0.45,
        title=text[:40] or "语音任务",
        description=f"语音创建: {text}",
        due_date=start.isoformat(),
        assignee_open_ids=[open_id for open_id in matched if open_id],
        reason="fallback",
    )


@router.post("/interpret", response_model=VoiceInterpretResponse)
async def interpret_voice_command(
    payload: VoiceInterpretRequest,
    db: Session = Depends(get_db),
    _: Member = Depends(get_current_user),
):
    text = payload.text.strip()
    members = _member_candidates(db)
    if not settings.deepseek_api_key:
        return _fallback_interpret(text, members)

    now = datetime.now(ZoneInfo("Asia/Shanghai"))
    prompt = {
        "current_time": now.isoformat(),
        "timezone": "Asia/Shanghai",
        "command": text,
        "members": members,
        "rules": [
            "判断用户意图: task=布置/派发/跟进任务; event=开会/约人/日程/提醒到日历; unknown=无法判断。",
            "必须只返回 JSON, 不要 markdown。",
            "成员必须从 members 中选择, 输出 open_id。不要编造成员。",
            "相对日期按 current_time 解释。今晚/今天晚上九点 = 今天 21:00。",
            "event 必须给 start_at/end_at, ISO 8601 带 +08:00 时区; 默认会议 1 小时。",
            "task 给 due_date; 无明确时间时默认今天 18:00 或当前时间后 4 小时中较晚者。",
        ],
        "schema": {
            "action": "task|event|unknown",
            "confidence": 0.0,
            "title": "string",
            "description": "string|null",
            "start_at": "string|null",
            "end_at": "string|null",
            "due_date": "string|null",
            "location": "string|null",
            "attendee_open_ids": ["open_id"],
            "assignee_open_ids": ["open_id"],
            "priority": "low|medium|high|urgent",
            "reason": "string|null",
        },
    }
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(
                f"{settings.deepseek_base_url.rstrip('/')}/chat/completions",
                headers={"Authorization": f"Bearer {settings.deepseek_api_key}"},
                json={
                    "model": settings.deepseek_model,
                    "temperature": 0.1,
                    "response_format": {"type": "json_object"},
                    "messages": [
                        {"role": "system", "content": "你是实验室语音指令解析器, 只输出符合 schema 的 JSON。"},
                        {"role": "user", "content": json.dumps(prompt, ensure_ascii=False)},
                    ],
                },
            )
            response.raise_for_status()
        content = response.json()["choices"][0]["message"]["content"]
        data = _extract_json(content)
        known = {member["open_id"] for member in members}
        data["attendee_open_ids"] = [open_id for open_id in data.get("attendee_open_ids", []) if open_id in known]
        data["assignee_open_ids"] = [open_id for open_id in data.get("assignee_open_ids", []) if open_id in known]
        return VoiceInterpretResponse.model_validate(data)
    except Exception as exc:
        fallback = _fallback_interpret(text, members)
        fallback.reason = f"deepseek_failed: {type(exc).__name__}"
        return fallback
