from __future__ import annotations

import json
import re
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy.orm import Session

from app.models import LarkUserStatus, Member
from app.services.lark import get_lark

EMOJI_KEYS = {
    "bisheng", "bizui", "daikouzhao", "fendou", "guzhang", "jizhi", "kafei",
    "kan", "lingguangyishan", "ok", "qingshu", "sikao", "taiyang", "weixiao",
    "xiaoguzhang", "zaijian",
}

KEYWORD_EMOJI = [
    ("专注", "bisheng", "focusing"),
    ("聚焦", "bisheng", "focusing"),
    ("会议", "guzhang", "meeting_room"),
    ("开会", "guzhang", "meeting_room"),
    ("沟通", "guzhang", "meeting_room"),
    ("忙", "fendou", "working"),
    ("工作", "fendou", "working"),
    ("勿扰", "bizui", "working"),
    ("请假", "qingshu", "away"),
    ("外出", "zaijian", "away"),
    ("出差", "zaijian", "away"),
    ("休息", "kafei", "resting"),
    ("咖啡", "kafei", "resting"),
    ("上课", "kan", "classroom"),
    ("课程", "kan", "classroom"),
    ("学习", "kan", "classroom"),
    ("生病", "daikouzhao", "away"),
]

LAB_STATUS_DEFINITIONS = {
    "working": {
        "title": "工作中",
        "emoji_key": "fendou",
        "icon_key": "Typing",
        "color": "BLUE",
        "priority": 1,
    },
    "focusing": {
        "title": "专注中",
        "emoji_key": "bisheng",
        "icon_key": "StatusFlashOfInspiration",
        "color": "INDIGO",
        "priority": 2,
    },
    "resting": {
        "title": "休息中",
        "emoji_key": "kafei",
        "icon_key": "Coffee",
        "color": "YELLOW",
        "priority": 5,
    },
    "classroom": {
        "title": "上课中",
        "emoji_key": "kan",
        "icon_key": "StatusReading",
        "color": "GREEN",
        "priority": 3,
    },
    "meeting_room": {
        "title": "开会中",
        "emoji_key": "guzhang",
        "icon_key": "GeneralInMeetingBusy",
        "color": "PURPLE",
        "priority": 4,
    },
    "away": {
        "title": "外出",
        "emoji_key": "zaijian",
        "icon_key": "GeneralBusinessTrip",
        "color": "ORANGE",
        "priority": 6,
    },
}


def _deep_values(value: Any):
    if isinstance(value, dict):
        for key, item in value.items():
            yield key, item
            yield from _deep_values(item)
    elif isinstance(value, list):
        for item in value:
            yield from _deep_values(item)


def _first_string(payload: dict[str, Any], keys: set[str]) -> str | None:
    for key, value in _deep_values(payload):
        if key in keys and isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _first_timestamp(payload: dict[str, Any], keys: set[str]) -> datetime | None:
    raw = _first_string(payload, keys)
    if not raw:
        return None
    try:
        if raw.isdigit():
            value = int(raw)
            if value > 10_000_000_000:
                value = value // 1000
            return datetime.fromtimestamp(value)
        return datetime.fromisoformat(raw.replace("Z", "+00:00")).replace(tzinfo=None)
    except Exception:
        return None


def _normalize_emoji_key(value: str | None) -> str | None:
    if not value:
        return None
    key = value.rsplit("/", 1)[-1].split(".", 1)[0].strip()
    key = re.sub(r"[^A-Za-z0-9_]+", "", key)
    return key if key in EMOJI_KEYS else None


def _derive_emoji_and_presence(payload: dict[str, Any], title: str | None, status_type: str | None) -> tuple[str, str]:
    raw_key = _first_string(payload, {"emoji_key", "emoji", "icon_key", "icon", "status_icon", "status_emoji"})
    emoji_key = _normalize_emoji_key(raw_key)
    if emoji_key:
        return emoji_key, _presence_from_text(" ".join(filter(None, [title, status_type, emoji_key])))
    text = " ".join(
        str(item)
        for _, item in _deep_values(payload)
        if isinstance(item, str) and len(item) <= 80
    )
    if title:
        text = f"{title} {text}"
    if status_type:
        text = f"{status_type} {text}"
    for keyword, mapped_key, presence in KEYWORD_EMOJI:
        if keyword.lower() in text.lower():
            return mapped_key, presence
    return "weixiao", "auto"


def _presence_from_text(text: str) -> str:
    for keyword, _, presence in KEYWORD_EMOJI:
        if keyword.lower() in text.lower():
            return presence
    return "auto"


def handle_lark_user_status_change(db: Session, payload: dict[str, Any]) -> str | None:
    open_id = _first_string(payload, {"open_id", "openId", "openID", "user_open_id"})
    if not open_id:
        user = payload.get("user") if isinstance(payload.get("user"), dict) else {}
        open_id = user.get("open_id") or user.get("openId")
    if not open_id:
        return None
    if not db.get(Member, open_id):
        return None

    title = _first_string(payload, {"title", "name", "status_name", "status_title", "text"})
    status_id = _first_string(payload, {"status_id", "user_status_id", "system_status_id", "statusId"})
    status_type = _first_string(payload, {"status_type", "statusType", "type"})
    end_at = _first_timestamp(payload, {"end_time", "end_at", "endTime", "expire_time", "expireTime"})
    start_at = _first_timestamp(payload, {"start_time", "start_at", "startTime"})
    is_active = not any(
        isinstance(value, str) and value.lower() in {"deleted", "closed", "inactive", "off"}
        for key, value in _deep_values(payload)
        if key in {"action", "status", "state"}
    )
    emoji_key, presence_status = _derive_emoji_and_presence(payload, title, status_type)
    if end_at and end_at <= datetime.utcnow():
        is_active = False

    row = db.get(LarkUserStatus, open_id)
    if not row:
        row = LarkUserStatus(member_open_id=open_id)
        db.add(row)
    row.status_id = status_id
    row.status_type = status_type
    row.title = title or status_type or status_id
    row.emoji_key = emoji_key
    row.emoji_path = f"/emojis/{emoji_key}.png"
    row.presence_status = presence_status
    row.is_active = is_active
    row.start_at = start_at
    row.end_at = end_at
    row.raw_json = json.dumps(payload, ensure_ascii=False)[:12000]
    row.updated_at = datetime.utcnow()
    db.commit()
    return open_id


async def _list_system_statuses() -> list[dict[str, Any]]:
    data = await get_lark()._request(
        "GET",
        "/personal_settings/v1/system_statuses",
        params={"page_size": 50},
    )
    return data.get("items") or []


async def _create_system_status(definition: dict[str, Any]) -> str:
    title = definition["title"]
    payload = {
        "title": title,
        "i18n_title": {"zh_cn": title, "en_us": title, "ja_jp": title},
        "icon_key": definition["icon_key"],
        "color": definition["color"],
        "priority": definition["priority"],
        "sync_setting": {
            "is_open_by_default": True,
            "title": "由实验室档案系统同步",
            "explain": "云实验室状态变化后自动开启。",
        }
    }
    data = await get_lark()._request("POST", "/personal_settings/v1/system_statuses", json=payload)
    system_status = data.get("system_status") or {}
    status_id = system_status.get("system_status_id")
    if not status_id:
        raise RuntimeError(f"创建飞书系统状态失败: {data}")
    return str(status_id)


async def ensure_lab_system_status(status: str) -> str:
    definition = LAB_STATUS_DEFINITIONS[status]
    title = definition["title"]
    items = await _list_system_statuses()
    for item in items:
        zh_title = ((item.get("i18n_title") or {}).get("zh_cn") or "").strip()
        if (item.get("title") or "").strip() == title or zh_title == title:
            return str(item["system_status_id"])
    return await _create_system_status(definition)


async def _close_lab_system_statuses(member_open_id: str) -> None:
    items = await _list_system_statuses()
    managed_titles = {definition["title"] for definition in LAB_STATUS_DEFINITIONS.values()}
    managed_ids = [
        str(item.get("system_status_id"))
        for item in items
        if item.get("system_status_id")
        and (
            (item.get("title") or "").strip() in managed_titles
            or ((item.get("i18n_title") or {}).get("zh_cn") or "").strip() in managed_titles
        )
    ]
    for status_id in managed_ids:
        try:
            await get_lark()._request(
                "POST",
                f"/personal_settings/v1/system_statuses/{status_id}/batch_close",
                params={"user_id_type": "open_id"},
                json={"user_list": [member_open_id]},
            )
        except Exception:
            continue


async def set_lab_presence_status(
    db: Session,
    member_open_id: str,
    status: str,
    duration_hours: int = 12,
) -> LarkUserStatus | None:
    member = db.get(Member, member_open_id)
    if not member:
        return None

    if status == "auto":
        await _close_lab_system_statuses(member_open_id)
        row = db.get(LarkUserStatus, member_open_id)
        if row:
            row.is_active = False
            row.end_at = datetime.utcnow()
            row.updated_at = datetime.utcnow()
            db.commit()
        return row

    if status not in LAB_STATUS_DEFINITIONS:
        raise ValueError(f"unsupported status: {status}")

    definition = LAB_STATUS_DEFINITIONS[status]
    await _close_lab_system_statuses(member_open_id)
    system_status_id = await ensure_lab_system_status(status)
    end_at = datetime.utcnow() + timedelta(hours=duration_hours)
    await get_lark()._request(
        "POST",
        f"/personal_settings/v1/system_statuses/{system_status_id}/batch_open",
        params={"user_id_type": "open_id"},
        json={
            "user_list": [
                {
                    "user_id": member_open_id,
                    "end_time": str(int(end_at.timestamp())),
                }
            ]
        },
    )

    row = db.get(LarkUserStatus, member_open_id)
    if not row:
        row = LarkUserStatus(member_open_id=member_open_id)
        db.add(row)
    row.status_id = system_status_id
    row.status_type = "lab_system_status"
    row.title = definition["title"]
    row.emoji_key = definition["emoji_key"]
    row.emoji_path = f"/emojis/{definition['emoji_key']}.png"
    row.presence_status = status
    row.is_active = True
    row.start_at = datetime.utcnow()
    row.end_at = end_at
    row.raw_json = json.dumps({"source": "cloud_lab", "definition": definition}, ensure_ascii=False)
    row.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return row
