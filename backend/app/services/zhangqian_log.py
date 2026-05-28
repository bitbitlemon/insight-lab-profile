"""张迁组论文日志/过程文档外部 Base 拉取与匹配.

Base: Zkb8b0Gdaa0kVissTz0cuZOBnCe / table tblNj1CpbDBRHeLd
字段含 S1-S7 各阶段云文档/附件 + 论文完整日志 + 投稿期刊/DOI 等.
"""
from __future__ import annotations

import asyncio
import re
import time
from typing import Any

from app.config import settings
from app.services.lark import LarkClient

_CACHE: dict[str, Any] = {"ts": 0.0, "records": []}
_CACHE_TTL_SEC = 600  # 10 min
_CACHE_LOCK = asyncio.Lock()

# file_token → tmp_url (原始 batch_get_tmp_download_url) 映射, 给 proxy endpoint 用
FILE_TOKEN_CACHE: dict[str, str] = {}

# 阶段定义 (前端展示顺序). group 用于前端分组渲染, required=True 表示缺失会标红.
# 用户偏好: 这些材料都是需要的, 缺少必须显眼标出.
STAGE_SPEC = [
    # S 系列主流程
    {"key": "S1", "label": "基线模型复现", "field": "【S1】基线模型复现_云文档", "kind": "doc", "group": "S", "required": True},
    {"key": "S2", "label": "创新模型", "field": "【S2】创新模型_云文档", "kind": "doc", "group": "S", "required": True},
    {"key": "S3", "label": "开题报告", "field": "【S3】写开题报告_云文档", "kind": "doc", "group": "S", "required": True},
    {"key": "S5", "label": "写初稿", "field": "【S5】写初稿_附件", "kind": "attachment", "group": "S", "required": True},
    {"key": "S6", "label": "内部返修", "field": "【S6】内部返修_附件", "kind": "attachment", "group": "S", "required": True},
    {"key": "S7_code", "label": "实验代码", "field": "【S7】实验代码_附件", "kind": "attachment", "group": "S", "required": True},
    {"key": "S7_paper", "label": "投稿论文", "field": "【S7】投稿论文_附件", "kind": "attachment", "group": "S", "required": True},
    {"key": "S7_bib", "label": "bib 文件", "field": "【S7】bib文件内容", "kind": "text", "group": "S", "required": True},
    # 返修
    {"key": "REVISION", "label": "返修回复文档", "field": "【返修中】返修回复文档", "kind": "attachment", "group": "REVISION", "required": True},
    # 接收后
    {"key": "ACC_INTERNAL", "label": "内部登记版本", "field": "【接收后】内部登记版本", "kind": "attachment", "group": "ACC", "required": True},
    {"key": "ACC_SUBMIT", "label": "论文投稿截图", "field": "【接收后】论文投稿有关截图", "kind": "attachment", "group": "ACC", "required": True},
    {"key": "ACC_ADVISOR", "label": "指导老师截图", "field": "【接收后】指导老师的指导截图", "kind": "attachment", "group": "ACC", "required": True},
    {"key": "ACC_OTHER", "label": "其他交流截图", "field": "【接收后】本论文的其他交流截图", "kind": "attachment", "group": "ACC", "required": True},
    {"key": "ACC_OPENSRC", "label": "开源地址", "field": "【接收后】开源地址", "kind": "text", "group": "ACC", "required": True},
    # 上线前
    {"key": "ONLINE_EN", "label": "英文 PDF", "field": "【上线前】英文pdf(onlin pdf)", "kind": "attachment", "group": "ONLINE", "required": True},
    {"key": "ONLINE_ZH", "label": "翻译 PDF", "field": "【上线前】翻译pdf(onlin pdf)", "kind": "attachment", "group": "ONLINE", "required": True},
    {"key": "ONLINE_DOI", "label": "DOI", "field": "【上线前】DOI", "kind": "text", "group": "ONLINE", "required": True},
]

GROUP_SPEC = [
    {"key": "S", "label": "主流程材料", "desc": "基线/创新/开题/初稿/内部返修/投稿包"},
    {"key": "REVISION", "label": "返修材料", "desc": "外审返修回复"},
    {"key": "ACC", "label": "接收后材料", "desc": "登记版本 / 投稿与指导截图 / 开源地址"},
    {"key": "ONLINE", "label": "上线前材料", "desc": "英文 PDF / 翻译 PDF / DOI"},
]

_TITLE_NORMALIZE_RE = re.compile(r"[\s\W_]+", re.UNICODE)


def _norm_title(s: str | None) -> str:
    if not s:
        return ""
    return _TITLE_NORMALIZE_RE.sub("", s).lower()


_MD_LINK_RE = re.compile(r"\[([^\]]+)\]\(([^)]+)\)")


def _parse_doc_links(value: Any) -> list[dict]:
    """支持三种形态:
    - 纯字符串(可能含 markdown '[t](u)' 链接 或 纯 URL)
    - 飞书 URL 字段 dict: {"text": "...", "link": "..."}
    - dict / object 列表
    """
    if not value:
        return []
    out: list[dict] = []
    if isinstance(value, dict):
        text = value.get("text") or value.get("link") or ""
        link = value.get("link") or (value.get("text") if isinstance(value.get("text"), str) and value.get("text", "").startswith("http") else "")
        if text or link:
            out.append({"text": str(text).strip(), "url": str(link).strip()})
        return out
    if isinstance(value, list):
        for item in value:
            out.extend(_parse_doc_links(item))
        return out
    if not isinstance(value, str):
        return []
    text = value
    for m in _MD_LINK_RE.finditer(text):
        out.append({"text": m.group(1).strip(), "url": m.group(2).strip()})
    if not out:
        stripped = text.strip()
        out.append({"text": stripped, "url": stripped if stripped.startswith("http") else ""})
    return out


def _parse_attachments(value: Any) -> list[dict]:
    if not value or not isinstance(value, list):
        return []
    out: list[dict] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        ft = item.get("file_token")
        tmp_url = item.get("tmp_url")
        if ft and tmp_url:
            FILE_TOKEN_CACHE[ft] = tmp_url
        out.append({
            "name": item.get("name"),
            "file_token": ft,
            "size": item.get("size"),
            "type": item.get("type"),
            "url": item.get("url"),
            # 注意: 不把 tmp_url 透传给前端 (1h 失效且含 base internal 路径), 前端走 proxy
        })
    return out


def _flatten_text(value: Any) -> str | None:
    """URL/超链接字段 飞书返回可能是 {'link':.., 'text':..} 或字符串; 统一成可显示字符串."""
    if value is None:
        return None
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        return value.get("link") or value.get("text") or None
    if isinstance(value, list) and value:
        first = value[0]
        if isinstance(first, dict):
            return first.get("link") or first.get("text") or None
        if isinstance(first, str):
            return first
    return None


def _users_to_simple(value: Any) -> list[dict]:
    if not value or not isinstance(value, list):
        return []
    out = []
    for u in value:
        if isinstance(u, dict):
            out.append({"open_id": u.get("id"), "name": u.get("name")})
    return out


async def _fetch_all_records(force: bool = False) -> list[dict]:
    """全表拉取(带缓存)."""
    now = time.time()
    if not force and now - _CACHE["ts"] < _CACHE_TTL_SEC and _CACHE["records"]:
        return _CACHE["records"]
    async with _CACHE_LOCK:
        if not force and now - _CACHE["ts"] < _CACHE_TTL_SEC and _CACHE["records"]:
            return _CACHE["records"]
        client = LarkClient()
        all_items: list[dict] = []
        page_token: str | None = None
        for _ in range(20):  # 上限 20 页 (每页 100 → 2000 条)
            resp = await client.list_records(
                settings.lark_zhangqian_log_app_token,
                settings.lark_zhangqian_log_table_id,
                page_size=100,
                page_token=page_token,
            )
            all_items.extend(resp.get("items") or [])
            if not resp.get("has_more"):
                break
            page_token = resp.get("page_token")
            if not page_token:
                break
        _CACHE["records"] = all_items
        _CACHE["ts"] = now
        return all_items


def _stage_has_content(entry: dict) -> bool:
    if entry["kind"] == "doc":
        return any((l.get("url") or l.get("text")) for l in (entry.get("links") or []))
    if entry["kind"] == "attachment":
        return bool(entry.get("files"))
    return bool(entry.get("text"))


def _build_stages(fields: dict) -> list[dict]:
    out = []
    for spec in STAGE_SPEC:
        raw = fields.get(spec["field"])
        entry: dict = {
            "key": spec["key"],
            "label": spec["label"],
            "kind": spec["kind"],
            "group": spec["group"],
            "required": spec.get("required", True),
        }
        if spec["kind"] == "doc":
            entry["links"] = _parse_doc_links(raw) if raw else []
        elif spec["kind"] == "attachment":
            entry["files"] = _parse_attachments(raw)
        else:
            entry["text"] = _flatten_text(raw)
        entry["has_content"] = _stage_has_content(entry)
        entry["missing"] = entry["required"] and not entry["has_content"]
        out.append(entry)
    return out


def _summarize_stages(stages: list[dict]) -> dict:
    required = [s for s in stages if s.get("required")]
    filled = [s for s in required if s.get("has_content")]
    missing = [s for s in required if not s.get("has_content")]
    by_group: dict[str, dict] = {g["key"]: {**g, "total": 0, "filled": 0, "missing": 0} for g in GROUP_SPEC}
    for s in required:
        g = by_group.get(s.get("group"))
        if not g:
            continue
        g["total"] += 1
        if s.get("has_content"):
            g["filled"] += 1
        else:
            g["missing"] += 1
    return {
        "required_count": len(required),
        "filled_count": len(filled),
        "missing_count": len(missing),
        "missing_keys": [s["key"] for s in missing],
        "groups": list(by_group.values()),
    }


def _record_to_response(record: dict) -> dict:
    fields = record.get("fields") or {}
    status = fields.get("目前状态")
    if isinstance(status, list) and status:
        status_text = status[0]
    elif isinstance(status, dict):
        status_text = status.get("text") or status.get("name")
    else:
        status_text = status if isinstance(status, str) else None
    stages = _build_stages(fields)
    summary = _summarize_stages(stages)
    return {
        "matched": True,
        "record_id": record.get("record_id"),
        "title_en": _flatten_text(fields.get("标题")),
        "title_zh": _flatten_text(fields.get("中文标题")),
        "current_status": status_text,
        "submit_date": _flatten_text(fields.get("投稿日期")),
        "submit_journal": _flatten_text(fields.get("投稿期刊")),
        "publish_date": _flatten_text(fields.get("【上线前】发表时间")),
        "doi": _flatten_text(fields.get("【上线前】DOI")),
        "issn": _flatten_text(fields.get("【接受后】ISSN字段")),
        "opensource_url": _flatten_text(fields.get("【接收后】开源地址")),
        "log_text": _flatten_text(fields.get("论文完整日志")),
        "log_summary": _flatten_text(fields.get("日志汇总")),
        "participants": _users_to_simple(fields.get("主要参与人")),
        "advisor": _users_to_simple(fields.get("指导人")),
        "stages": stages,
        "summary": summary,
    }


async def get_log_for_paper(paper_title: str, paper_title_zh: str | None = None) -> dict:
    """按英文标题(主)/中文标题(回退) normalize 匹配."""
    records = await _fetch_all_records()
    target_en = _norm_title(paper_title)
    target_zh = _norm_title(paper_title_zh) if paper_title_zh else ""
    for r in records:
        f = r.get("fields") or {}
        if target_en and _norm_title(f.get("标题")) == target_en:
            return _record_to_response(r)
        if target_zh and _norm_title(f.get("中文标题")) == target_zh:
            return _record_to_response(r)
    return {
        "matched": False,
        "tried_title_en": paper_title,
        "tried_title_zh": paper_title_zh,
        "total_records": len(records),
    }
