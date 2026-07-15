"""Project chat synchronization through lark-cli.

The CLI already carries the Feishu app identity on this server. We keep a
verbatim raw_json copy for later analysis, and maintain a lightweight topic
aggregate for project freshness.
"""
from __future__ import annotations

import json
import logging
import os
import subprocess
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import Member, Project, ProjectChat, ProjectChatMessage, ProjectChatTopic

log = logging.getLogger(__name__)

LARK_CLI_CANDIDATES = (
    "/usr/local/bin/lark-cli",
    "/home/ubuntu/.npm-global/lib/node_modules/@larksuite/cli/bin/lark-cli",
    "lark-cli",
)
MESSAGE_BACKEND_BASE_TOKEN = "L7hwbIV3gaFoB7sJYDtcxM5Tnmg"
MESSAGE_BACKEND_TABLE_ID = "tbli5tObEB0twhvg"
MESSAGE_BACKEND_VIEW_ID = "vewZ62k7Yr"
MESSAGE_BACKEND_TABLES = (
    {
        "table_id": "tbli5tObEB0twhvg",
        "table_name": "群聊消息汇总后台",
        "view_id": "vewZ62k7Yr",
    },
    {
        "table_id": "tblKCwi2p9dXfUh5",
        "table_name": "群聊消息汇总后台(20260605)",
        "view_id": None,
    },
)


def _lark_cli() -> str:
    for candidate in LARK_CLI_CANDIDATES:
        if candidate == "lark-cli" or os.path.exists(candidate):
            return candidate
    return "lark-cli"


def _parse_lark_time(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        # Feishu OpenAPI commonly returns milliseconds, while some wrappers
        # return seconds. Accept both.
        timestamp = float(value)
        if timestamp > 10_000_000_000:
            timestamp = timestamp / 1000
        return datetime.fromtimestamp(timestamp)
    if not isinstance(value, str):
        return None
    raw = value.strip()
    if not raw:
        return None
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y/%m/%d %H:%M", "%Y/%m/%d %H:%M:%S"):
        try:
            return datetime.strptime(raw, fmt)
        except ValueError:
            pass
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        return None


def _message_backend_time(row: dict[str, Any]) -> datetime | None:
    # The Base "发送时间（具体）" field can drift across midnight for some rows.
    # Prefer the backend row creation time, which is local and stable enough for
    # CloudLab's recent-chat visualization, then fall back to message fields.
    return (
        _parse_lark_time(row.get("创建时间"))
        or _parse_lark_time(row.get("发送时间（具体）"))
        or _parse_lark_time(row.get("发送时间"))
    )


def _stringify_content(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    return json.dumps(value, ensure_ascii=False)


def _topic_key(message: dict[str, Any]) -> str:
    return (
        str(message.get("thread_id") or "")
        or str(message.get("root_id") or "")
        or str(message.get("parent_id") or "")
        or str(message.get("message_id") or "")
    )


def _topic_title(content: str | None, topic_key: str) -> str:
    text = (content or "").strip().replace("\n", " ")
    return text[:80] if text else topic_key


def fetch_chat_messages(
    chat_id: str,
    *,
    page_size: int = 50,
    page_token: str | None = None,
    start: str | None = None,
    end: str | None = None,
    sort: str = "desc",
) -> dict[str, Any]:
    args = [
        _lark_cli(),
        "im",
        "+chat-messages-list",
        "--chat-id",
        chat_id,
        "--page-size",
        str(page_size),
        "--sort",
        sort,
        "--as",
        "bot",
        "--format",
        "json",
    ]
    if page_token:
        args.extend(["--page-token", page_token])
    if start:
        args.extend(["--start", start])
    if end:
        args.extend(["--end", end])
    result = subprocess.run(args, capture_output=True, text=True, timeout=45)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip() or "lark-cli chat messages failed")
    body = json.loads(result.stdout)
    if not body.get("ok"):
        raise RuntimeError(json.dumps(body, ensure_ascii=False)[:500])
    return body.get("data") or {}


def list_bot_chats(
    *,
    page_size: int = 50,
    page_token: str | None = None,
    sort_type: str = "ByActiveTimeDesc",
) -> dict[str, Any]:
    args = [
        _lark_cli(),
        "im",
        "+chat-list",
        "--as",
        "bot",
        "--page-size",
        str(page_size),
        "--sort-type",
        sort_type,
        "--format",
        "json",
    ]
    if page_token:
        args.extend(["--page-token", page_token])
    result = subprocess.run(args, capture_output=True, text=True, timeout=45)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip() or "lark-cli chat list failed")
    body = json.loads(result.stdout)
    if not body.get("ok"):
        raise RuntimeError(json.dumps(body, ensure_ascii=False)[:500])
    return body.get("data") or {}


def _chat_rows(data: dict[str, Any]) -> list[dict[str, Any]]:
    for key in ("items", "chats", "groups", "chat_list"):
        rows = data.get(key)
        if isinstance(rows, list):
            return [row for row in rows if isinstance(row, dict)]
    return []


def _message_rows(data: dict[str, Any]) -> list[dict[str, Any]]:
    rows = data.get("messages") or data.get("items") or []
    return [row for row in rows if isinstance(row, dict)]


def _chat_id(row: dict[str, Any]) -> str:
    return str(row.get("chat_id") or row.get("chatId") or row.get("id") or "").strip()


def _chat_name(row: dict[str, Any], chat_id: str) -> str:
    return str(row.get("name") or row.get("chat_name") or row.get("chatName") or row.get("title") or chat_id).strip()


def fetch_message_backend_records(
    *,
    limit: int = 120,
    offset: int = 0,
    table_id: str = MESSAGE_BACKEND_TABLE_ID,
    view_id: str | None = MESSAGE_BACKEND_VIEW_ID,
) -> dict[str, Any]:
    args = [
        _lark_cli(),
        "base",
        "+record-list",
        "--base-token",
        MESSAGE_BACKEND_BASE_TOKEN,
        "--table-id",
        table_id,
        "--limit",
        str(limit),
        "--offset",
        str(offset),
        "--as",
        "bot",
        "--format",
        "json",
    ]
    if view_id:
        args.extend(["--view-id", view_id])
    result = subprocess.run(args, capture_output=True, text=True, timeout=45)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip() or "lark-cli message backend failed")
    body = json.loads(result.stdout)
    if not body.get("ok"):
        raise RuntimeError(json.dumps(body, ensure_ascii=False)[:500])
    return body.get("data") or {}


def fetch_message_backend_rows_from_tables(
    *,
    limit: int = 160,
    page_size: int = 200,
    max_pages_per_table: int = 4,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    seen_message_ids: set[str] = set()
    per_table_limit = max(limit, page_size)
    for table in MESSAGE_BACKEND_TABLES:
        table_id = str(table["table_id"])
        table_name = str(table["table_name"])
        view_id = table.get("view_id")
        offset = 0
        table_row_count = 0
        for _ in range(max(1, max_pages_per_table)):
            payload = fetch_message_backend_records(
                limit=min(max(page_size, 1), 500),
                offset=offset,
                table_id=table_id,
                view_id=str(view_id) if view_id else None,
            )
            page_rows = _message_backend_rows(payload, table_id=table_id, table_name=table_name)
            for row in page_rows:
                message_id = _cell_text(row.get("消息id"))
                if message_id and message_id in seen_message_ids:
                    continue
                if message_id:
                    seen_message_ids.add(message_id)
                rows.append(row)
                table_row_count += 1
            if not payload.get("has_more") or table_row_count >= per_table_limit:
                break
            offset += min(max(page_size, 1), 500)
    rows.sort(key=lambda item: _message_backend_time(item) or datetime.min, reverse=True)
    return rows[:limit]


def _clean_message_text(value: Any) -> str:
    raw = _stringify_content(value).strip()
    if not raw:
        return ""
    try:
        payload = json.loads(raw)
    except Exception:
        payload = None
    if isinstance(payload, dict):
        text = payload.get("text")
        if isinstance(text, str):
            raw = text
        elif isinstance(payload.get("content"), list):
            parts: list[str] = []
            for line in payload.get("content") or []:
                if not isinstance(line, list):
                    continue
                for item in line:
                    if isinstance(item, dict) and isinstance(item.get("text"), str):
                        parts.append(item["text"])
            raw = " ".join(parts)
    return " ".join(raw.replace("\n", " ").split())[:80]


def _cell_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, list):
        parts: list[str] = []
        for item in value:
            if isinstance(item, dict):
                parts.append(str(item.get("text") or item.get("name") or item.get("en_name") or item.get("id") or ""))
            else:
                parts.append(str(item))
        return " ".join(part.strip() for part in parts if part and part.strip())
    if isinstance(value, dict):
        return str(value.get("text") or value.get("name") or value.get("id") or "").strip()
    return str(value).strip()


def _matched_members_from_text(text: str, members_by_name: dict[str, list[Member]], *, limit: int = 12) -> list[Member]:
    if not text:
        return []
    matched: list[Member] = []
    seen: set[str] = set()
    names = sorted((name for name in members_by_name if name), key=len, reverse=True)
    for name in names:
        if len(name) < 2 or name not in text:
            continue
        candidates = members_by_name.get(name) or []
        if len(candidates) != 1:
            continue
        member = candidates[0]
        if member.open_id in seen:
            continue
        seen.add(member.open_id)
        matched.append(member)
        if len(matched) >= limit:
            break
    return matched


def _message_backend_rows(
    data: dict[str, Any],
    *,
    table_id: str | None = None,
    table_name: str | None = None,
) -> list[dict[str, Any]]:
    fields = data.get("fields") or []
    rows = data.get("data") or []
    record_ids = data.get("record_id_list") or []
    normalized: list[dict[str, Any]] = []
    for row_index, row in enumerate(rows):
        if not isinstance(row, list):
            continue
        item = {str(fields[index]): row[index] for index in range(min(len(fields), len(row)))}
        item["_source_table_id"] = table_id
        item["_source_table_name"] = table_name
        if row_index < len(record_ids):
            item["_source_record_id"] = record_ids[row_index]
        normalized.append(item)
    return normalized


def build_message_backend_chat_clusters(
    db: Session,
    *,
    limit: int = 160,
    min_members: int = 1,
    recent_hours: int = 6,
    recent_minutes: int | None = None,
    start_at: datetime | None = None,
    end_at: datetime | None = None,
    latest: bool = False,
) -> list[dict[str, Any]]:
    members = {
        row.open_id: row
        for row in db.query(Member)
        .filter(Member.status.in_(("active", "on_leave")))
        .all()
    }
    members_by_name: dict[str, list[Member]] = {}
    for member in members.values():
        members_by_name.setdefault(member.name.strip(), []).append(member)
    if not members:
        return []

    cutoff = None if latest and start_at is None and end_at is None else (
        start_at or (datetime.now() - timedelta(minutes=max(1, recent_minutes)) if recent_minutes is not None else datetime.now() - timedelta(hours=max(1, recent_hours)))
    )
    upper_bound = end_at
    grouped: dict[str, dict[str, Any]] = {}
    backend_limit = min(max(limit, 1), 400) if latest else max(limit, 1)
    for row in fetch_message_backend_rows_from_tables(limit=backend_limit):
        message_time = _message_backend_time(row)
        if not message_time:
            continue
        if cutoff and message_time < cutoff:
            continue
        if upper_bound and message_time > upper_bound:
            continue
        chat_id = _cell_text(row.get("群id") or row.get("群")) or _cell_text(row.get("对应群聊名称"))
        chat_name = _cell_text(row.get("对应群聊名称") or row.get("群")) or chat_id
        content = _cell_text(row.get("消息内容"))
        sender_open_id = _cell_text(row.get("发送人") or row.get("发送人员"))
        sender_name = _cell_text(row.get("发送人（文本）") or row.get("发送人员") or row.get("发送人"))
        member = members.get(sender_open_id)
        if member is None and sender_name:
            matches = members_by_name.get(sender_name) or []
            if len(matches) == 1:
                member = matches[0]
        related_text = " ".join(
            _cell_text(row.get(key))
            for key in ("消息内容", "字段拼接", "全字段拼接", "消息详细信息", "申请人")
            if row.get(key) is not None
        )
        related_members = _matched_members_from_text(related_text, members_by_name)
        if member and all(item.open_id != member.open_id for item in related_members):
            related_members.insert(0, member)
        if not (chat_id and chat_name and related_members):
            continue
        cluster = grouped.setdefault(
            chat_id,
            {
                "cluster_id": chat_id,
                "chat_id": chat_id,
                "chat_name": chat_name,
                "member_open_ids": [],
                "member_names": [],
                "message_count": 0,
                "last_message_at": None,
                "thoughts": [],
            },
        )
        cluster["message_count"] += 1
        for related_member in related_members:
            if related_member.open_id not in cluster["member_open_ids"]:
                cluster["member_open_ids"].append(related_member.open_id)
                cluster["member_names"].append(related_member.name)
        if message_time and (cluster["last_message_at"] is None or message_time > cluster["last_message_at"]):
            cluster["last_message_at"] = message_time
        if content and len(cluster["thoughts"]) < 5:
            speaker = member.name if member else (related_members[0].name if related_members else "成员")
            listeners = [item.name for item in related_members if not member or item.open_id != member.open_id][:3]
            suffix = f" -> {'、'.join(listeners)}" if listeners else ""
            cluster["thoughts"].append(f"{speaker}{suffix}: {content[:80]}")

    clusters = [item for item in grouped.values() if len(item["member_open_ids"]) >= min_members]
    clusters.sort(key=lambda item: item.get("last_message_at") or datetime.min, reverse=True)
    return clusters


def build_recent_chat_clusters(
    db: Session,
    *,
    max_chats: int = 40,
    chat_page_size: int = 50,
    message_page_size: int = 30,
    min_members: int = 1,
    recent_hours: int = 6,
    recent_minutes: int | None = None,
    start_at: datetime | None = None,
    end_at: datetime | None = None,
    latest: bool = False,
) -> list[dict[str, Any]]:
    try:
        backend_clusters = build_message_backend_chat_clusters(
            db,
            limit=max_chats * message_page_size,
            min_members=min_members,
            recent_hours=recent_hours,
            recent_minutes=recent_minutes,
            start_at=start_at,
            end_at=end_at,
            latest=latest,
        )
        if backend_clusters:
            return backend_clusters[:max_chats]
    except Exception as exc:
        log.warning("message backend chat clusters unavailable: %s", exc)

    members = {
        row.open_id: row
        for row in db.query(Member)
        .filter(Member.status.in_(("active", "on_leave")))
        .all()
    }
    if not members:
        return []
    cutoff = start_at or (datetime.now() - timedelta(minutes=max(1, recent_minutes)) if recent_minutes is not None else datetime.now() - timedelta(hours=max(1, recent_hours)))
    start = str(int(cutoff.timestamp()))
    end = str(int((end_at or datetime.now()).timestamp()))

    chats: list[dict[str, Any]] = []
    page_token: str | None = None
    while len(chats) < max_chats:
        data = list_bot_chats(page_size=min(max(chat_page_size, 1), 100), page_token=page_token)
        chats.extend(_chat_rows(data))
        page_token = data.get("page_token") or data.get("next_page_token")
        if not data.get("has_more") or not page_token:
            break

    clusters: list[dict[str, Any]] = []
    for chat in chats[:max_chats]:
        chat_id = _chat_id(chat)
        if not chat_id:
            continue
        try:
            data = fetch_chat_messages(chat_id, page_size=min(max(message_page_size, 1), 100), start=start, end=end, sort="desc")
        except Exception as exc:
            log.warning("failed to fetch chat messages for %s: %s", chat_id, exc)
            continue
        messages = _message_rows(data)
        member_ids: list[str] = []
        names_by_id: dict[str, str] = {}
        thoughts: list[str] = []
        recent_message_count = 0
        last_message_at: datetime | None = None
        for message in messages:
            if message.get("deleted"):
                continue
            sender = message.get("sender") or {}
            open_id = str(sender.get("id") or sender.get("open_id") or "").strip()
            member = members.get(open_id)
            if not member:
                continue
            message_time = _parse_lark_time(message.get("create_time") or message.get("created_at") or message.get("create_time_ms"))
            if not message_time or message_time < cutoff:
                continue
            if end_at and message_time > end_at:
                continue
            recent_message_count += 1
            if open_id not in names_by_id:
                member_ids.append(open_id)
                names_by_id[open_id] = member.name
            if message_time and (last_message_at is None or message_time > last_message_at):
                last_message_at = message_time
            text = _clean_message_text(message.get("content"))
            if text and len(thoughts) < 5:
                thoughts.append(f"{member.name}: {text}")
        if len(member_ids) < min_members:
            continue
        clusters.append(
            {
                "cluster_id": chat_id,
                "chat_id": chat_id,
                "chat_name": _chat_name(chat, chat_id),
                "member_open_ids": member_ids,
                "member_names": [names_by_id[open_id] for open_id in member_ids],
                "message_count": recent_message_count,
                "last_message_at": last_message_at,
                "thoughts": thoughts,
            }
        )

    clusters.sort(key=lambda item: item.get("last_message_at") or datetime.min, reverse=True)
    return clusters


def fetch_thread_messages(
    thread_id: str,
    *,
    page_size: int = 100,
    page_token: str | None = None,
    sort: str = "asc",
) -> dict[str, Any]:
    args = [
        _lark_cli(),
        "im",
        "+threads-messages-list",
        "--thread",
        thread_id,
        "--page-size",
        str(page_size),
        "--sort",
        sort,
        "--as",
        "bot",
    ]
    if page_token:
        args.extend(["--page-token", page_token])
    result = subprocess.run(args, capture_output=True, text=True, timeout=45)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip() or "lark-cli thread messages failed")
    body = json.loads(result.stdout)
    if not body.get("ok"):
        raise RuntimeError(json.dumps(body, ensure_ascii=False)[:500])
    return body.get("data") or {}


def search_visible_chats(
    *,
    member_open_id: str,
    query: str | None = None,
    page_size: int = 20,
    page_token: str | None = None,
    identity: str = "bot",
) -> dict[str, Any]:
    args = [
        _lark_cli(),
        "im",
        "+chat-search",
        "--as",
        identity,
        "--member-ids",
        member_open_id,
        "--page-size",
        str(page_size),
        "--sort-by",
        "update_time_desc",
    ]
    if query:
        args.extend(["--query", query])
    if page_token:
        args.extend(["--page-token", page_token])
    result = subprocess.run(args, capture_output=True, text=True, timeout=45)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip() or "lark-cli chat search failed")
    body = json.loads(result.stdout)
    if not body.get("ok"):
        raise RuntimeError(json.dumps(body, ensure_ascii=False)[:500])
    return body.get("data") or {}


def visible_chat_options(
    *,
    member_open_id: str,
    query: str | None = None,
    page_size: int = 20,
    identity: str = "user",
) -> list[dict[str, Any]]:
    data = search_visible_chats(member_open_id=member_open_id, query=query, page_size=page_size, identity=identity)
    rows = _chat_rows(data)
    options: list[dict[str, Any]] = []
    for row in rows:
        chat_id = _chat_id(row)
        if not chat_id:
            continue
        options.append({
            "chat_id": chat_id,
            "chat_name": _chat_name(row, chat_id),
            "member_count": int(row.get("member_count") or row.get("members_count") or 0),
            "updated_at": _parse_lark_time(row.get("update_time") or row.get("updated_at") or row.get("last_message_time")),
        })
    return options


def list_chat_topics_preview(
    chat_id: str,
    *,
    page_size: int = 50,
    page_token: str | None = None,
) -> dict[str, Any]:
    topics: dict[str, dict[str, Any]] = {}
    data = fetch_chat_messages(chat_id, page_size=page_size, page_token=page_token, sort="desc")
    for message in data.get("messages") or []:
        key = str(message.get("thread_id") or message.get("root_id") or "")
        replies = message.get("thread_replies")
        if not key.startswith("omt_"):
            continue
        safe_replies = replies if isinstance(replies, list) and replies else [message]
        reply_times = [
            _parse_lark_time(reply.get("create_time") or reply.get("created_at") or reply.get("create_time_ms"))
            for reply in safe_replies
            if isinstance(reply, dict)
        ]
        valid_reply_times = [item for item in reply_times if item is not None]
        last_reply_at = max(valid_reply_times) if valid_reply_times else _parse_lark_time(message.get("create_time") or message.get("created_at") or message.get("create_time_ms"))
        root_reply = safe_replies[0] if safe_replies and isinstance(safe_replies[0], dict) else message
        content = _stringify_content(root_reply.get("content") or message.get("content"))
        last_reply = max(
            (reply for reply in safe_replies if isinstance(reply, dict)),
            key=lambda reply: _parse_lark_time(reply.get("create_time") or reply.get("created_at") or reply.get("create_time_ms")) or datetime.min,
            default=message,
        )
        topics[key] = {
            "topic_key": key,
            "title": _topic_title(content, key),
            "last_reply_at": last_reply_at,
            "reply_count": len(safe_replies),
            "last_message_id": last_reply.get("message_id") or message.get("message_id"),
        }
    return {
        "topics": sorted(topics.values(), key=lambda item: item.get("last_reply_at") or datetime.min, reverse=True),
        "has_more": bool(data.get("has_more")),
        "page_token": data.get("page_token"),
    }


def _upsert_message(db: Session, chat: ProjectChat, message: dict[str, Any]) -> tuple[bool, datetime | None, str]:
    message_id = str(message.get("message_id") or "").strip()
    if not message_id:
        return False, None, ""
    sender = message.get("sender") or {}
    content = _stringify_content(message.get("content"))
    created_at = _parse_lark_time(message.get("create_time") or message.get("created_at") or message.get("create_time_ms"))
    topic_key = _topic_key(message)
    raw_json = json.dumps(message, ensure_ascii=False, sort_keys=True)

    row = (
        db.query(ProjectChatMessage)
        .filter(ProjectChatMessage.project_chat_id == chat.project_chat_id, ProjectChatMessage.message_id == message_id)
        .first()
    )
    created = row is None
    if row is None:
        row = ProjectChatMessage(
            project_chat_id=chat.project_chat_id,
            project_id=chat.project_id,
            chat_id=chat.chat_id,
            message_id=message_id,
            topic_key=topic_key,
            raw_json=raw_json,
        )
        db.add(row)

    row.topic_key = topic_key
    row.root_id = message.get("root_id")
    row.parent_id = message.get("parent_id")
    row.thread_id = message.get("thread_id")
    row.sender_open_id = sender.get("id")
    row.sender_name = sender.get("name")
    row.sender_type = sender.get("sender_type")
    row.msg_type = message.get("msg_type")
    row.content = content
    row.raw_json = raw_json
    row.deleted = bool(message.get("deleted"))
    row.updated = bool(message.get("updated"))
    row.message_created_at = created_at
    return created, created_at, topic_key


def rebuild_chat_topics(db: Session, chat: ProjectChat) -> None:
    rows = (
        db.query(ProjectChatMessage)
        .filter(ProjectChatMessage.project_chat_id == chat.project_chat_id)
        .order_by(ProjectChatMessage.topic_key.asc(), ProjectChatMessage.message_created_at.asc())
        .all()
    )
    grouped: dict[str, list[ProjectChatMessage]] = {}
    for row in rows:
        grouped.setdefault(row.topic_key, []).append(row)

    for topic_key, messages in grouped.items():
        ordered = sorted(messages, key=lambda item: item.message_created_at or datetime.min)
        first = ordered[0]
        last = ordered[-1]
        topic = (
            db.query(ProjectChatTopic)
            .filter(ProjectChatTopic.project_chat_id == chat.project_chat_id, ProjectChatTopic.topic_key == topic_key)
            .first()
        )
        if topic is None:
            topic = ProjectChatTopic(project_chat_id=chat.project_chat_id, project_id=chat.project_id, topic_key=topic_key)
            db.add(topic)
        topic.title = topic.title or _topic_title(first.content, topic_key)
        topic.first_message_id = first.message_id
        topic.first_sender_open_id = first.sender_open_id
        topic.last_message_id = last.message_id
        topic.last_reply_at = last.message_created_at
        topic.reply_count = len(messages)

    db.flush()
    latest = (
        db.query(ProjectChatTopic)
        .filter(ProjectChatTopic.project_chat_id == chat.project_chat_id, ProjectChatTopic.last_reply_at.isnot(None))
        .order_by(ProjectChatTopic.last_reply_at.desc())
        .first()
    )
    chat.latest_topic_key = latest.topic_key if latest else None
    chat.latest_topic_title = latest.title if latest else None
    chat.latest_topic_reply_at = latest.last_reply_at if latest else None
    chat.last_message_at = latest.last_reply_at if latest else None

    if latest and latest.last_reply_at:
        project = db.get(Project, chat.project_id)
        if project and latest.last_reply_at > project.updated_at:
            project.updated_at = latest.last_reply_at


def sync_project_chat(
    db: Session,
    chat: ProjectChat,
    *,
    page_size: int = 50,
    max_pages: int = 2,
    start: str | None = None,
    end: str | None = None,
) -> dict[str, Any]:
    page_token: str | None = None
    fetched = 0
    inserted = 0
    latest_time: datetime | None = None
    pages = 0

    if chat.selected_topic_key:
        for _ in range(max(1, max_pages)):
            pages += 1
            data = fetch_thread_messages(chat.selected_topic_key, page_size=min(max(page_size, 1), 500), page_token=page_token, sort="asc")
            messages = data.get("messages") or []
            for message in messages:
                created, message_time, _ = _upsert_message(db, chat, message)
                fetched += 1
                if created:
                    inserted += 1
                if message_time and (latest_time is None or message_time > latest_time):
                    latest_time = message_time
            page_token = data.get("page_token")
            if not data.get("has_more") or not page_token:
                break
    else:
        for _ in range(max(1, max_pages)):
            pages += 1
            data = fetch_chat_messages(chat.chat_id, page_size=page_size, page_token=page_token, start=start, end=end, sort="desc")
            messages = data.get("messages") or []
            for message in messages:
                created, message_time, _ = _upsert_message(db, chat, message)
                fetched += 1
                if created:
                    inserted += 1
                if message_time and (latest_time is None or message_time > latest_time):
                    latest_time = message_time
            page_token = data.get("page_token")
            if not data.get("has_more") or not page_token:
                break

    db.flush()
    rebuild_chat_topics(db, chat)
    chat.last_synced_at = datetime.utcnow()
    db.commit()

    topic_count = db.query(func.count(ProjectChatTopic.project_chat_topic_id)).filter_by(project_chat_id=chat.project_chat_id).scalar() or 0
    message_count = db.query(func.count(ProjectChatMessage.project_chat_message_id)).filter_by(project_chat_id=chat.project_chat_id).scalar() or 0
    log.info("synced project chat %s: fetched=%s inserted=%s", chat.chat_id, fetched, inserted)
    return {
        "project_chat_id": chat.project_chat_id,
        "chat_id": chat.chat_id,
        "pages": pages,
        "fetched": fetched,
        "inserted": inserted,
        "message_count": message_count,
        "topic_count": topic_count,
        "latest_message_at": chat.last_message_at,
        "latest_topic_title": chat.latest_topic_title,
    }
