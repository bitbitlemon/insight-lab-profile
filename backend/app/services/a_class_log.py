"""2026 年 A 类成果 — 直连飞书 Base 实时读取 (10min 全表缓存 + 后台续期).

源: WVwzbzCbQap38esOaz8cy6umnSj / 表 tbl5hk9UpmisKOxC / 60 条 (自有副本, full_access)
"""
from __future__ import annotations

import asyncio
import json
import time
from typing import Any

from app.services.lark import LarkClient

APP_TOKEN = "WVwzbzCbQap38esOaz8cy6umnSj"
TABLE_ID = "tbl5hk9UpmisKOxC"

_CACHE: dict[str, Any] = {"ts": 0.0, "items": []}
_CACHE_TTL_SEC = 600
_CACHE_LOCK = asyncio.Lock()

# 源中文列名 → 我们的 Pydantic 字段; 多个源列可映射同一目标 (取第一个非空)
COL_MAP = [
    ("项目内容", "project_content"),
    ("正规级别", "level"),
    ("奖项等次", "award_grade"),
    ("主办", "organizer"),
    ("日期", "event_date"),
    ("赛事名称", "event_name"),
    ("责任部门", "department"),
    ("责任人", "responsible_person"),
    ("责任人提取", "responsible_person"),
    ("第一学生", "first_student"),
    ("提取第一学生负责人", "first_student"),
    ("姓名提取", "first_student"),
    ("其他学生提取", "other_students"),
    ("其他学生", "other_students"),
    ("研究分类", "research_category"),
    ("AI 图片理解（豆包）", "ai_image_understanding"),
    ("Kimi 阅读助手 2", "kimi_summary"),
    ("合并字段", "notes"),
]

ATTACHMENT_MAP = {
    "PDF附件": "pdf_files",
    "PDF 转图片": "pdf_files",
    "图片附件": "image_files",
    "附件转图片": "image_files",
    "附件 (1)": "extra_files",
}


def _flatten_text(v: Any) -> str | None:
    if v is None:
        return None
    if isinstance(v, str):
        return v
    if isinstance(v, list):
        parts: list[str] = []
        for x in v:
            if isinstance(x, dict):
                parts.append(x.get("name") or x.get("text") or "")
            else:
                parts.append(str(x))
        s = ",".join(p for p in parts if p)
        return s or None
    if isinstance(v, dict):
        return v.get("text") or v.get("name") or v.get("link") or json.dumps(v, ensure_ascii=False)
    return str(v)


def _parse_attachments(v: Any) -> list[dict]:
    if not isinstance(v, list):
        return []
    out = []
    for x in v:
        if isinstance(x, dict) and x.get("file_token"):
            out.append({
                "file_token": x.get("file_token"),
                "name": x.get("name"),
                "size": x.get("size"),
                "type": x.get("type"),
            })
    return out


def _record_to_item(record: dict, idx: int) -> dict:
    fields = record.get("fields") or {}
    item: dict[str, Any] = {
        "id": idx,
        "base_record_id": record.get("record_id"),
        "pdf_files": [],
        "image_files": [],
        "extra_files": [],
    }
    for src, target in COL_MAP:
        if src not in fields:
            continue
        if item.get(target):
            continue
        v = _flatten_text(fields[src])
        if v:
            item[target] = v
    for src, target in ATTACHMENT_MAP.items():
        if src not in fields:
            continue
        atts = _parse_attachments(fields[src])
        if atts:
            item[target].extend(atts)
    # 默认时间字段 (前端可能要)
    item.setdefault("project_content", None)
    item.setdefault("event_name", None)
    item.setdefault("level", None)
    item.setdefault("award_grade", None)
    item.setdefault("organizer", None)
    item.setdefault("event_date", None)
    item.setdefault("department", None)
    item.setdefault("responsible_person", None)
    item.setdefault("first_student", None)
    item.setdefault("other_students", None)
    item.setdefault("research_category", None)
    item.setdefault("ai_image_understanding", None)
    item.setdefault("kimi_summary", None)
    item.setdefault("notes", None)
    return item


async def fetch_all(force: bool = False) -> list[dict]:
    """全表拉取并转 dict list (10min 缓存)."""
    now = time.time()
    if not force and now - _CACHE["ts"] < _CACHE_TTL_SEC and _CACHE["items"]:
        return _CACHE["items"]
    async with _CACHE_LOCK:
        if not force and now - _CACHE["ts"] < _CACHE_TTL_SEC and _CACHE["items"]:
            return _CACHE["items"]
        client = LarkClient()
        records: list[dict] = []
        page_token: str | None = None
        for _ in range(20):
            resp = await client.list_records(
                APP_TOKEN, TABLE_ID, page_size=100, page_token=page_token,
            )
            records.extend(resp.get("items") or [])
            if not resp.get("has_more"):
                break
            page_token = resp.get("page_token")
            if not page_token:
                break
        items = [_record_to_item(r, idx=i + 1) for i, r in enumerate(records)]
        _CACHE["items"] = items
        _CACHE["ts"] = now
        return items
