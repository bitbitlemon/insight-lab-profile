"""全局相册 — 跨论文/比赛/贡献聚合所有图片附件,点图可跳源.

- competition: 本地 cert_files_json / photo_files_json (主 Base 镜像)
- paper: 张迁组外部 Base 的 attachment 阶段 (kind=attachment), 10min 整表缓存 (见 zhangqian_log)
"""
from __future__ import annotations

import json
import logging
from typing import Any
from urllib.parse import quote

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.deps import get_current_user
from app.models import Competition, Member, Paper
from app.services.zhangqian_log import (
    _build_stages,
    _fetch_all_records,
    _flatten_text,
    _norm_title,
)

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/gallery", tags=["gallery"])

IMAGE_EXT = {"jpg", "jpeg", "png", "gif", "webp", "bmp", "heic", "heif", "tiff", "svg"}


def _is_image(name: str | None, mime_type: str | None) -> bool:
    if mime_type and mime_type.startswith("image/"):
        return True
    if name and "." in name:
        ext = name.rsplit(".", 1)[1].lower()
        if ext in IMAGE_EXT:
            return True
    return False


def _parse_attachments_json(raw: str | None) -> list[dict]:
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except (TypeError, ValueError):
        return []
    if not isinstance(data, list):
        return []
    return [x for x in data if isinstance(x, dict) and x.get("file_token")]


def _competition_proxy_path(file_token: str) -> str:
    base = f"/api/files/{quote(file_token)}/proxy"
    tbl = settings.lark_table_competitions
    return f"{base}?table_id={tbl}" if tbl else base


def _paper_proxy_path(file_token: str) -> str:
    return f"/api/papers/files/{quote(file_token)}/proxy"


async def _collect_competition_items(db: Session) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    comps = db.execute(select(Competition)).scalars().all()
    for c in comps:
        for raw_field, subtype in (
            ("cert_files_json", "证书"),
            ("photo_files_json", "照片"),
        ):
            for att in _parse_attachments_json(getattr(c, raw_field, None)):
                if not _is_image(att.get("name"), att.get("type")):
                    continue
                ft = att["file_token"]
                items.append({
                    "file_token": ft,
                    "name": att.get("name"),
                    "size": att.get("size"),
                    "type": att.get("type"),
                    "proxy_path": _competition_proxy_path(ft),
                    "source_type": "competition",
                    "source_subtype": subtype,
                    "source_id": c.comp_id,
                    "source_title": c.name,
                    "occurred_at": c.end_date.isoformat() if c.end_date else None,
                })
    return items


async def _collect_paper_items(db: Session) -> list[dict[str, Any]]:
    """从张迁外部 Base 全表(10min 缓存)抓 attachment image, 按 paper.title 反向匹配本地 paper."""
    papers = db.execute(select(Paper)).scalars().all()
    title_to_paper: dict[str, Paper] = {}
    for p in papers:
        if p.title:
            title_to_paper.setdefault(_norm_title(p.title), p)

    items: list[dict[str, Any]] = []
    try:
        records = await _fetch_all_records()
    except Exception:
        log.exception("fetch zhangqian records failed; paper gallery empty")
        return items

    for r in records:
        fields = r.get("fields") or {}
        en = _norm_title(_flatten_text(fields.get("标题")))
        zh = _norm_title(_flatten_text(fields.get("中文标题")))
        paper = title_to_paper.get(en) or title_to_paper.get(zh)
        if paper is None:
            continue
        occurred_at = paper.publish_date.isoformat() if paper.publish_date else (
            paper.created_at.date().isoformat() if paper.created_at else None
        )
        for stage in _build_stages(fields):
            if stage.get("kind") != "attachment":
                continue
            for f in stage.get("files") or []:
                ft = f.get("file_token")
                if not ft:
                    continue
                if not _is_image(f.get("name"), f.get("type")):
                    continue
                items.append({
                    "file_token": ft,
                    "name": f.get("name"),
                    "size": f.get("size"),
                    "type": f.get("type"),
                    "proxy_path": _paper_proxy_path(ft),
                    "source_type": "paper",
                    "source_subtype": stage["label"],
                    "source_id": paper.paper_id,
                    "source_title": paper.title,
                    "occurred_at": occurred_at,
                })
    return items


@router.get("/photos")
async def list_gallery_photos(
    source_type: str | None = Query(None, description="过滤源类型: all | competition | paper"),
    db: Session = Depends(get_db),
    _: Member = Depends(get_current_user),
):
    """聚合所有图片附件, 按 occurred_at desc.

    返回 items[] 每条包含:
    - file_token, name, size, type
    - proxy_path: 前端 GET 这条路径即可拿到 302 真链 (含 source 对应的 table extra)
    - source_type: 'competition' | 'paper'
    - source_subtype: 比赛 '证书'/'照片'; 论文 阶段 label
    - source_id, source_title, occurred_at (ISO date string)
    """
    want = (source_type or "all").lower()
    items: list[dict[str, Any]] = []

    if want in ("all", "competition"):
        items.extend(await _collect_competition_items(db))
    if want in ("all", "paper"):
        items.extend(await _collect_paper_items(db))

    items.sort(key=lambda x: x.get("occurred_at") or "", reverse=True)
    return {"items": items, "total": len(items)}
