from __future__ import annotations

import re
from typing import Any
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.deps import require_admin
from app.models import Member
from app.services.lark import get_lark

router = APIRouter(prefix="/api/bitable", tags=["bitable"])


class RecordPayload(BaseModel):
    fields: dict[str, Any] = Field(default_factory=dict)


def _app_token_from_url(base_url: str) -> str:
    try:
        parsed = urlparse(base_url.strip())
    except ValueError as exc:
        raise HTTPException(400, "多维表格链接格式不正确") from exc
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise HTTPException(400, "请输入完整的飞书多维表格链接")
    host = parsed.hostname or ""
    if not (host.endswith("feishu.cn") or host.endswith("larksuite.com")):
        raise HTTPException(400, "只支持飞书或 Lark 多维表格链接")
    match = re.search(r"/(?:base|wiki)/([A-Za-z0-9_-]+)", parsed.path)
    if not match:
        raise HTTPException(400, "链接中未找到多维表格 app_token")
    return match.group(1)


def _validate_configured_credentials() -> None:
    from app.config import settings
    if not settings.lark_app_id or not settings.lark_app_secret:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "未配置飞书应用凭证")


async def _call(operation):
    try:
        return await operation()
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"飞书多维表格请求失败: {exc}") from exc


@router.get("/tables")
async def list_tables(base_url: str = Query(...), _: Member = Depends(require_admin)):
    _validate_configured_credentials()
    token = _app_token_from_url(base_url)
    return await _call(lambda: get_lark().list_tables(token, page_size=100))


@router.get("/tables/{table_id}/fields")
async def list_fields(table_id: str, base_url: str = Query(...), _: Member = Depends(require_admin)):
    _validate_configured_credentials()
    token = _app_token_from_url(base_url)
    return await _call(lambda: get_lark().list_fields(token, table_id, page_size=100))


@router.get("/tables/{table_id}/records")
async def list_records(
    table_id: str,
    page_size: int = Query(default=100, ge=1, le=500),
    page_token: str | None = None,
    base_url: str = Query(...),
    _: Member = Depends(require_admin),
):
    _validate_configured_credentials()
    token = _app_token_from_url(base_url)
    return await _call(lambda: get_lark().list_records(token, table_id, page_size=page_size, page_token=page_token))


@router.post("/tables/{table_id}/records")
async def create_record(table_id: str, payload: RecordPayload, base_url: str = Query(...), _: Member = Depends(require_admin)):
    _validate_configured_credentials()
    token = _app_token_from_url(base_url)
    return await _call(lambda: get_lark().create_record(token, table_id, payload.fields))


@router.put("/tables/{table_id}/records/{record_id}")
async def update_record(table_id: str, record_id: str, payload: RecordPayload, base_url: str = Query(...), _: Member = Depends(require_admin)):
    _validate_configured_credentials()
    token = _app_token_from_url(base_url)
    return await _call(lambda: get_lark().update_record(token, table_id, record_id, payload.fields))


@router.delete("/tables/{table_id}/records/{record_id}")
async def delete_record(table_id: str, record_id: str, base_url: str = Query(...), _: Member = Depends(require_admin)):
    _validate_configured_credentials()
    token = _app_token_from_url(base_url)
    return await _call(lambda: get_lark().delete_record(token, table_id, record_id))
