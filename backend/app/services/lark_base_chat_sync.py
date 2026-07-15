from __future__ import annotations

import hashlib
import json
import logging
import re
import subprocess
from collections import defaultdict
from datetime import datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import LarkBaseChatMessage, LarkBaseChatSource, Member, Project, ProjectLog
from app.services.ai_chat_ingest import (
    ProjectMatch,
    build_log_body,
    build_log_title,
    extract_record,
    infer_log_type,
    infer_stage,
    match_project,
    refine_ai_chat_with_llm,
    summarize_text,
)

LARK_CLI = "/usr/local/bin/lark-cli"
SYNC_CONFIDENCE_THRESHOLD = 0.90
IMPORT_PAGE_SIZE = 200
MAX_ANALYZE_MESSAGES = 24

log = logging.getLogger(__name__)


def parse_lark_base_url(url: str) -> dict[str, str | None]:
    text = (url or "").strip()
    match = re.search(r"https://[^/]+/base/([A-Za-z0-9]+)", text)
    if not match:
        raise ValueError("invalid lark base url")
    base_token = match.group(1)
    table_match = re.search(r"[?&]table=([A-Za-z0-9]+)", text)
    if not table_match:
        raise ValueError("lark base table id is required")
    view_match = re.search(r"[?&]view=([A-Za-z0-9]+)", text)
    return {
        "base_token": base_token,
        "table_id": table_match.group(1),
        "view_id": view_match.group(1) if view_match else None,
    }


def upsert_lark_base_chat_source(
    db: Session,
    *,
    base_url: str,
    created_by: str | None = None,
    name: str | None = None,
) -> LarkBaseChatSource:
    parsed = parse_lark_base_url(base_url)
    source = db.execute(
        select(LarkBaseChatSource).where(
            LarkBaseChatSource.base_token == parsed["base_token"],
            LarkBaseChatSource.table_id == parsed["table_id"],
        )
    ).scalar_one_or_none()
    if not source:
        source = LarkBaseChatSource(
            base_token=str(parsed["base_token"]),
            table_id=str(parsed["table_id"]),
            view_id=str(parsed["view_id"]) if parsed["view_id"] else None,
            base_url=base_url.strip(),
            created_by=created_by,
        )
        db.add(source)
    source.base_url = base_url.strip()
    source.name = (name or source.name or "飞书群聊数据源").strip()
    source.view_id = str(parsed["view_id"]) if parsed["view_id"] else None
    source.status = "active"
    fields = fetch_base_fields(source.base_token, source.table_id)
    source.field_map_json = json.dumps(detect_field_map(fields), ensure_ascii=False)
    source.last_error = None
    db.commit()
    db.refresh(source)
    return source


def fetch_base_fields(base_token: str, table_id: str) -> list[dict[str, Any]]:
    payload = _run_lark_cli([
        "base", "+field-list",
        "--as", "bot",
        "--base-token", base_token,
        "--table-id", table_id,
    ])
    fields = ((payload or {}).get("data") or {}).get("fields") or []
    return [field for field in fields if isinstance(field, dict)]


def detect_field_map(fields: list[dict[str, Any]]) -> dict[str, str]:
    by_name = {str(field.get("name") or "").strip(): field for field in fields}

    def pick(*names: str) -> str | None:
        for name in names:
            if name in by_name:
                return name
        return None

    mapping = {
        "record_message_id": pick("消息id"),
        "sender_open_id": pick("发送人"),
        "sender_name": pick("发送人员", "发送人（文本）", "发送人"),
        "content": pick("消息内容"),
        "full_text": pick("消息详细信息", "全字段拼接", "字段拼接"),
        "chat_id": pick("群id"),
        "chat_name": pick("对应群聊名称", "群"),
        "reply_message_id": pick("回复消息id"),
        "attachment": pick("附件"),
        "sent_at": pick("发送时间（具体）", "发送时间", "创建时间", "发送时间（大概）"),
        "cloud_doc_url": pick("云文档链接提取"),
        "is_project_chat": pick("是否为项目群"),
        "is_base_project": pick("是否属于基地项目"),
        "milestone_flag": pick("里程碑判断"),
    }
    return {key: value for key, value in mapping.items() if value}


def sync_lark_base_chat_sources(db: Session, *, limit_sources: int = 4) -> dict[str, int]:
    sources = db.execute(
        select(LarkBaseChatSource)
        .where(LarkBaseChatSource.status.in_(("active", "error")))
        .order_by(LarkBaseChatSource.updated_at.asc())
        .limit(limit_sources)
    ).scalars().all()
    scanned = imported = archived = errors = 0
    for source in sources:
        scanned += 1
        try:
            imported += import_lark_base_chat_source(db, source)
            archived += analyze_lark_base_chat_source(db, source)
            source.status = "active"
            source.last_error = None
            source.last_synced_at = datetime.utcnow()
            source.last_analyzed_at = datetime.utcnow()
        except Exception as exc:
            source.status = "error"
            source.last_error = str(exc)[:500]
            errors += 1
            log.exception("lark base chat sync failed source_id=%s", source.source_id)
        finally:
            db.commit()
    return {"sources": scanned, "imported": imported, "archived": archived, "errors": errors}


def sync_lark_base_chat_source(db: Session, source: LarkBaseChatSource) -> dict[str, int]:
    imported = import_lark_base_chat_source(db, source)
    archived = analyze_lark_base_chat_source(db, source)
    source.status = "active"
    source.last_error = None
    source.last_synced_at = datetime.utcnow()
    source.last_analyzed_at = datetime.utcnow()
    db.commit()
    db.refresh(source)
    return {"sources": 1, "imported": imported, "archived": archived, "errors": 0}


def import_lark_base_chat_source(db: Session, source: LarkBaseChatSource) -> int:
    field_map = _load_field_map(source)
    offset = 0
    imported = 0
    while True:
        payload = _run_lark_cli([
            "base", "+record-list",
            "--as", "bot",
            "--base-token", source.base_token,
            "--table-id", source.table_id,
            "--limit", str(IMPORT_PAGE_SIZE),
            "--offset", str(offset),
            *([] if not source.view_id else ["--view-id", source.view_id]),
        ])
        data = ((payload or {}).get("data") or {})
        field_names = data.get("fields") or []
        rows = data.get("data") or []
        record_ids = data.get("record_id_list") or []
        if not rows:
            break
        for idx, row in enumerate(rows):
            row_dict = _row_to_dict(field_names, row)
            record_id = str(record_ids[idx]) if idx < len(record_ids) else f"offset:{offset + idx}"
            if upsert_lark_base_chat_message(db, source, field_map, record_id, row_dict):
                imported += 1
        db.commit()
        if not data.get("has_more"):
            break
        offset += len(rows)
    return imported


def upsert_lark_base_chat_message(
    db: Session,
    source: LarkBaseChatSource,
    field_map: dict[str, str],
    record_id: str,
    row: dict[str, Any],
) -> bool:
    message = db.execute(
        select(LarkBaseChatMessage).where(
            LarkBaseChatMessage.source_id == source.source_id,
            LarkBaseChatMessage.record_id == record_id,
        )
    ).scalar_one_or_none()
    normalized = normalize_base_chat_row(field_map, row)
    raw_json = json.dumps(row, ensure_ascii=False)
    is_new = message is None
    if not message:
        message = LarkBaseChatMessage(source_id=source.source_id, record_id=record_id, raw_json=raw_json)
        db.add(message)
    message.message_id = normalized.get("message_id")
    message.chat_id = normalized.get("chat_id")
    message.chat_name = normalized.get("chat_name")
    message.sender_open_id = normalized.get("sender_open_id")
    message.sender_name = normalized.get("sender_name")
    message.reply_message_id = normalized.get("reply_message_id")
    message.content = normalized.get("content")
    message.full_text = normalized.get("full_text")
    message.attachment_json = normalized.get("attachment_json")
    message.cloud_doc_url = normalized.get("cloud_doc_url")
    message.message_created_at = normalized.get("message_created_at")
    message.raw_json = raw_json
    if is_new:
        message.import_status = "new"
    return is_new


def normalize_base_chat_row(field_map: dict[str, str], row: dict[str, Any]) -> dict[str, Any]:
    content = _clean_text(row.get(field_map.get("content", "")))
    full_text = _clean_text(row.get(field_map.get("full_text", "")))
    sender_open_id = _clean_text(row.get(field_map.get("sender_open_id", "")))
    if sender_open_id and not sender_open_id.startswith("ou_"):
        sender_open_id = None
    attachment = row.get(field_map.get("attachment", "")) if field_map.get("attachment") else None
    return {
        "message_id": _clean_text(row.get(field_map.get("record_message_id", ""))),
        "chat_id": _clean_text(row.get(field_map.get("chat_id", ""))),
        "chat_name": _clean_text(row.get(field_map.get("chat_name", ""))),
        "sender_open_id": sender_open_id,
        "sender_name": _clean_text(row.get(field_map.get("sender_name", ""))),
        "reply_message_id": _clean_text(row.get(field_map.get("reply_message_id", ""))),
        "content": content,
        "full_text": full_text or content,
        "attachment_json": json.dumps(attachment, ensure_ascii=False) if attachment not in (None, "") else None,
        "cloud_doc_url": _clean_text(row.get(field_map.get("cloud_doc_url", ""))),
        "message_created_at": _parse_dt(row.get(field_map.get("sent_at", ""))),
    }


def analyze_lark_base_chat_source(db: Session, source: LarkBaseChatSource, *, batch_limit: int = 300) -> int:
    rows = db.execute(
        select(LarkBaseChatMessage)
        .where(
            LarkBaseChatMessage.source_id == source.source_id,
            LarkBaseChatMessage.import_status.in_(("new", "pending_project")),
        )
        .order_by(LarkBaseChatMessage.message_created_at.asc().nullsfirst(), LarkBaseChatMessage.base_chat_message_id.asc())
        .limit(batch_limit)
    ).scalars().all()
    if not rows:
        return 0

    candidate_rows: list[LarkBaseChatMessage] = []
    for row in rows:
        if row.import_status == "pending_project" or _is_project_relevant_candidate(row):
            candidate_rows.append(row)
        else:
            row.import_status = "ignored"
            row.last_analyzed_at = datetime.utcnow()
    if not candidate_rows:
        return 0

    grouped: dict[tuple[str, str, str], list[LarkBaseChatMessage]] = defaultdict(list)
    for row in candidate_rows:
        date_key = (row.message_created_at or row.created_at).strftime("%Y-%m-%d")
        grouped[(row.chat_id or row.chat_name or "unknown", row.sender_open_id or row.sender_name or "unknown", date_key)].append(row)

    archived = 0
    members = db.execute(select(Member).where(Member.status.in_(("active", "on_leave")))).scalars().all()
    for (_chat_key, _sender_key, date_key), items in grouped.items():
        transcript = build_base_chat_transcript(source, items)
        if not transcript.strip():
            for item in items:
                item.import_status = "ignored"
                item.last_analyzed_at = datetime.utcnow()
            continue
        sender_open_id = items[0].sender_open_id
        match = match_project(db, transcript, sender_open_id=sender_open_id)
        refined = refine_ai_chat_with_llm(db, transcript, match, "FeishuBase", sender_open_id=sender_open_id)
        final_project_id = refined.project_id if refined and refined.project_id else (match.project.project_id if match.project else None)
        final_confidence = refined.confidence if refined and refined.project_id else match.confidence
        if not final_project_id or final_confidence < SYNC_CONFIDENCE_THRESHOLD:
            for item in items:
                item.import_status = "pending_project"
                item.matched_project_id = final_project_id
                item.match_confidence = final_confidence
                item.last_analyzed_at = datetime.utcnow()
            continue

        project = db.get(Project, final_project_id)
        if not project:
            for item in items:
                item.import_status = "pending_project"
                item.last_analyzed_at = datetime.utcnow()
            continue
        stage = refined.stage if refined else infer_stage(transcript)
        log_type = refined.log_type if refined else infer_log_type(transcript)
        summary = refined.summary if refined else summarize_text(transcript)
        extracted = extract_record(transcript, members)
        batch_key = _batch_key(source.source_id, items)
        log_row = ProjectLog(
            project_id=project.project_id,
            actor_open_id=_pick_actor_open_id(project, items),
            kind="note",
            status="recorded",
            title=build_log_title("群聊", stage, log_type, summary),
            body=build_log_body(
                transcript,
                summary,
                "群聊",
                stage,
                log_type,
                ProjectMatch(project=project, task=None, confidence=final_confidence, reasons=["lark_base_chat"]),
                extracted,
                "auto_archived",
                refined.sections if refined else None,
            ),
            resource_type="lark_base_chat",
            extra_json=json.dumps({
                "source": "lark_base_chat",
                "source_id": source.source_id,
                "batch_key": batch_key,
                "message_count": len(items),
                "chat_id": items[0].chat_id,
                "chat_name": items[0].chat_name,
                "sender_open_id": items[0].sender_open_id,
                "sender_name": items[0].sender_name,
                "date": date_key,
                "confidence": final_confidence,
                "llm_refined": bool(refined),
                "message_ids": [item.message_id for item in items if item.message_id][:50],
            }, ensure_ascii=False),
        )
        db.add(log_row)
        db.flush()
        for item in items:
            item.import_status = "archived"
            item.matched_project_id = project.project_id
            item.match_confidence = final_confidence
            item.archived_log_id = log_row.log_id
            item.batch_key = batch_key
            item.last_analyzed_at = datetime.utcnow()
        archived += 1
    return archived


def build_base_chat_transcript(source: LarkBaseChatSource, items: list[LarkBaseChatMessage]) -> str:
    ordered = sorted(items, key=lambda row: row.message_created_at or row.created_at)[:MAX_ANALYZE_MESSAGES]
    if not ordered:
        return ""
    chat_name = ordered[0].chat_name or ordered[0].chat_id or "未命名群聊"
    sender_name = ordered[0].sender_name or ordered[0].sender_open_id or "未知成员"
    date_label = (ordered[0].message_created_at or ordered[0].created_at).strftime("%Y-%m-%d")
    lines = [
        f"来源: 飞书Base群聊数据",
        f"数据源: {source.name or source.source_id}",
        f"群聊: {chat_name}",
        f"发送人: {sender_name}",
        f"日期: {date_label}",
    ]
    for row in ordered:
        time_label = (row.message_created_at or row.created_at).strftime("%H:%M")
        content = (row.content or row.full_text or "").strip()
        if not content and row.attachment_json:
            content = "发送了附件"
        if row.cloud_doc_url:
            content = f"{content}\n云文档: {row.cloud_doc_url}".strip()
        if not content:
            continue
        lines.append(f"[{time_label}] {row.sender_name or row.sender_open_id or '成员'}: {content}")
    return "\n".join(lines).strip()


def get_lark_base_chat_sources(db: Session) -> list[LarkBaseChatSource]:
    return db.execute(select(LarkBaseChatSource).order_by(LarkBaseChatSource.updated_at.desc())).scalars().all()


def get_lark_base_chat_source_stats(db: Session, source_id: int) -> dict[str, int]:
    rows = db.execute(
        select(LarkBaseChatMessage.import_status, func.count(LarkBaseChatMessage.base_chat_message_id))
        .where(LarkBaseChatMessage.source_id == source_id)
        .group_by(LarkBaseChatMessage.import_status)
    ).all()
    stats = {"new": 0, "pending_project": 0, "archived": 0, "ignored": 0}
    for status, count in rows:
        stats[str(status)] = int(count)
    return stats


def list_pending_lark_base_chat_batches(
    db: Session,
    source: LarkBaseChatSource,
    *,
    limit: int = 30,
) -> list[dict[str, Any]]:
    rows = db.execute(
        select(LarkBaseChatMessage)
        .where(
            LarkBaseChatMessage.source_id == source.source_id,
            LarkBaseChatMessage.import_status == "pending_project",
        )
        .order_by(LarkBaseChatMessage.message_created_at.desc().nullslast(), LarkBaseChatMessage.base_chat_message_id.desc())
        .limit(max(40, limit * MAX_ANALYZE_MESSAGES))
    ).scalars().all()
    grouped: dict[str, list[LarkBaseChatMessage]] = defaultdict(list)
    for row in rows:
        grouped[_pending_group_key(row)].append(row)
    out: list[dict[str, Any]] = []
    for group_key, items in grouped.items():
        ordered = sorted(items, key=lambda row: row.message_created_at or row.created_at)
        first = ordered[0]
        suggested_project = db.get(Project, first.matched_project_id) if first.matched_project_id else None
        transcript = build_base_chat_transcript(source, ordered)
        out.append({
            "group_key": group_key,
            "message_count": len(ordered),
            "chat_id": first.chat_id,
            "chat_name": first.chat_name,
            "sender_open_id": first.sender_open_id,
            "sender_name": first.sender_name,
            "date": (first.message_created_at or first.created_at).strftime("%Y-%m-%d"),
            "first_message_at": ordered[0].message_created_at or ordered[0].created_at,
            "last_message_at": ordered[-1].message_created_at or ordered[-1].created_at,
            "suggested_project_id": first.matched_project_id,
            "suggested_project_name": suggested_project.name if suggested_project else None,
            "match_confidence": max((item.match_confidence or 0.0) for item in ordered),
            "cloud_doc_urls": sorted({item.cloud_doc_url for item in ordered if item.cloud_doc_url}),
            "preview": transcript[:800],
            "message_ids": [item.base_chat_message_id for item in ordered],
        })
    out.sort(key=lambda item: item["last_message_at"], reverse=True)
    return out[:limit]


def review_pending_lark_base_chat_batch(
    db: Session,
    source: LarkBaseChatSource,
    *,
    group_key: str,
    action: str,
    project_id: int | None = None,
) -> dict[str, Any]:
    rows = db.execute(
        select(LarkBaseChatMessage)
        .where(
            LarkBaseChatMessage.source_id == source.source_id,
            LarkBaseChatMessage.import_status == "pending_project",
        )
        .order_by(LarkBaseChatMessage.message_created_at.asc().nullsfirst(), LarkBaseChatMessage.base_chat_message_id.asc())
    ).scalars().all()
    items = [row for row in rows if _pending_group_key(row) == group_key]
    if not items:
        raise ValueError("pending batch not found")
    now = datetime.utcnow()
    if action == "ignore":
        for item in items:
            item.import_status = "ignored"
            item.last_analyzed_at = now
        db.commit()
        return {"action": action, "message_count": len(items), "archived_log_id": None}
    if action != "archive":
        raise ValueError("unsupported review action")
    if not project_id:
        raise ValueError("project_id required")
    project = db.get(Project, project_id)
    if not project:
        raise ValueError("project not found")
    transcript = build_base_chat_transcript(source, items)
    sender_open_id = items[0].sender_open_id
    rule_match = ProjectMatch(project=project, task=None, confidence=0.99, reasons=["manual_review"])
    refined = refine_ai_chat_with_llm(db, transcript, rule_match, "FeishuBaseReview", sender_open_id=sender_open_id)
    members = db.execute(select(Member).where(Member.status.in_(("active", "on_leave")))).scalars().all()
    extracted = extract_record(transcript, members)
    stage = refined.stage if refined else infer_stage(transcript)
    log_type = refined.log_type if refined else infer_log_type(transcript)
    summary = refined.summary if refined else summarize_text(transcript)
    batch_key = _batch_key(source.source_id, items)
    log_row = ProjectLog(
        project_id=project.project_id,
        actor_open_id=_pick_actor_open_id(project, items),
        kind="note",
        status="recorded",
        title=build_log_title("群聊", stage, log_type, summary),
        body=build_log_body(
            transcript,
            summary,
            "群聊",
            stage,
            log_type,
            rule_match,
            extracted,
            "manual_review",
            refined.sections if refined else None,
        ),
        resource_type="lark_base_chat",
        extra_json=json.dumps({
            "source": "lark_base_chat",
            "source_id": source.source_id,
            "batch_key": batch_key,
            "message_count": len(items),
            "chat_id": items[0].chat_id,
            "chat_name": items[0].chat_name,
            "sender_open_id": items[0].sender_open_id,
            "sender_name": items[0].sender_name,
            "date": (items[0].message_created_at or items[0].created_at).strftime("%Y-%m-%d"),
            "confidence": max(refined.confidence if refined else 0.95, 0.95),
            "llm_refined": bool(refined),
            "reviewed": True,
            "message_ids": [item.message_id for item in items if item.message_id][:50],
        }, ensure_ascii=False),
    )
    db.add(log_row)
    db.flush()
    for item in items:
        item.import_status = "archived"
        item.matched_project_id = project.project_id
        item.match_confidence = max(refined.confidence if refined else 0.95, 0.95)
        item.archived_log_id = log_row.log_id
        item.batch_key = batch_key
        item.last_analyzed_at = now
    db.commit()
    return {"action": action, "message_count": len(items), "archived_log_id": log_row.log_id}


def _batch_key(source_id: int, items: list[LarkBaseChatMessage]) -> str:
    material = "|".join(str(item.message_id or item.record_id) for item in items)
    return hashlib.sha1(f"{source_id}:{material}".encode("utf-8")).hexdigest()[:20]


def _pending_group_key(row: LarkBaseChatMessage) -> str:
    occurred = row.message_created_at or row.created_at
    date_key = occurred.strftime("%Y-%m-%d")
    return "|".join([
        row.chat_id or row.chat_name or "unknown",
        row.sender_open_id or row.sender_name or "unknown",
        date_key,
    ])


def _pick_actor_open_id(project: Project, items: list[LarkBaseChatMessage]) -> str:
    return project.owner_open_id


def _load_field_map(source: LarkBaseChatSource) -> dict[str, str]:
    try:
        data = json.loads(source.field_map_json or "{}")
    except json.JSONDecodeError:
        data = {}
    if data:
        return {str(key): str(value) for key, value in data.items() if value}
    return detect_field_map(fetch_base_fields(source.base_token, source.table_id))


def _row_to_dict(field_names: list[str], row: Any) -> dict[str, Any]:
    if isinstance(row, dict):
        return {str(key): value for key, value in row.items()}
    if not isinstance(row, list):
        return {}
    out: dict[str, Any] = {}
    for idx, field_name in enumerate(field_names):
        out[str(field_name)] = row[idx] if idx < len(row) else None
    return out


def _run_lark_cli(args: list[str]) -> dict[str, Any]:
    result = subprocess.run([LARK_CLI, *args], capture_output=True, text=True, timeout=90)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip() or "lark-cli failed")
    try:
        payload = json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise RuntimeError("lark-cli returned non-json output") from exc
    if isinstance(payload, dict) and payload.get("ok") is False:
        raise RuntimeError(json.dumps(payload, ensure_ascii=False)[:500])
    return payload


def _parse_dt(value: Any) -> datetime | None:
    if not value:
        return None
    text = str(value).strip()
    if not text:
        return None
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y/%m/%d %H:%M", "%a %b %d %H:%M:%S %Y", "%Y-%m-%d %H:%M"):
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            continue
    return None


def _clean_text(value: Any) -> str | None:
    if value in (None, ""):
        return None
    text = str(value).strip()
    if not text:
        return None
    return re.sub(r"\s+", " ", text)


def _is_project_relevant_candidate(row: LarkBaseChatMessage) -> bool:
    text = ((row.content or "") + "\n" + (row.full_text or "")).strip()
    chat_name = row.chat_name or ""
    if row.cloud_doc_url:
        return True
    if len(text) >= 24 and any(
        keyword in text
        for keyword in (
            "总结", "项目", "申报", "进展", "文档", "需求", "任务", "里程碑", "联调", "测试",
            "论文", "系统", "平台", "接口", "PPT", "交付", "上线", "实验", "训练", "bug",
        )
    ):
        return True
    if any(keyword in chat_name for keyword in ("项目", "申报", "系统", "平台", "AI", "基地", "实验室")) and len(text) >= 8:
        return True
    if text.startswith("【总结】") or text.startswith("总结") or text.startswith("今日总结"):
        return True
    return False
