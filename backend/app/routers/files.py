"""通用飞书附件代理 + 上传 — 比赛证书/照片等附件的统一出入口.

代理 (GET /api/files/{ft}/proxy):
- 默认无 bitable extra (适合 drive 普通文件)
- ?table_id=<tbl> 时拼 bitable extra (适合 Base 附件字段)
- 5min 内存 cache (按 file_token+table_id 做 key, 避免不同上下文复用)

上传 (POST /api/files/upload):
- multipart file + (可选) target=competition (默认),走主 Base 作 parent_node
- 走 drive/v1/medias/upload_all, parent_type=bitable_file
- 返回 {file_token, name, size, type}
"""
from __future__ import annotations

import json
import logging
import time

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import RedirectResponse

from app.config import settings
from app.deps import get_current_user, get_current_user_q
from app.models import Member
from app.services.lark import LarkClient, get_lark

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/files", tags=["files"])

_PROXY_URL_CACHE: dict[str, tuple[str, float]] = {}
_PROXY_URL_TTL_SEC = 300.0
_MAX_UPLOAD_BYTES = 20 * 1024 * 1024  # 20MB; 超过需分片接口


def _bitable_extra(table_id: str) -> str:
    return json.dumps({"bitablePerm": {"tableId": table_id, "rev": 0}})


@router.get("/{file_token}/proxy")
async def proxy_generic_file(
    file_token: str,
    table_id: str | None = None,
    app_token: str | None = None,
    _: Member = Depends(get_current_user_q),
):
    """飞书附件通用代理 — 302 redirect 到飞书 CDN.

    传 ?table_id 时按 Bitable 附件取真链. ?app_token 仅用于 cache_key 隔离不同 Base
    的同 file_token (理论不会冲突, 但保险); proxy 本身仅靠 file_token + table_id 取链。
    """
    now = time.time()
    cache_key = f"{file_token}|{table_id or ''}|{app_token or ''}"
    cached = _PROXY_URL_CACHE.get(cache_key)
    if cached and cached[1] > now:
        return RedirectResponse(cached[0], status_code=302)

    client = LarkClient()
    try:
        tok = await client._get_tenant_token()
        params: dict[str, str] = {"file_tokens": file_token}
        if table_id:
            params["extra"] = _bitable_extra(table_id)
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.get(
                "https://open.feishu.cn/open-apis/drive/v1/medias/batch_get_tmp_download_url",
                params=params,
                headers={"Authorization": f"Bearer {tok}"},
            )
        data = r.json()
        if data.get("code") != 0:
            log.warning("batch_get_tmp_download_url failed: %s", data)
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"lark download_url fetch failed: {data.get('msg')}")
        urls = (data.get("data") or {}).get("tmp_download_urls") or []
        if not urls:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "file token not found")
        real_url = urls[0].get("tmp_download_url")
        if not real_url:
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "no tmp_download_url returned")
        _PROXY_URL_CACHE[cache_key] = (real_url, now + _PROXY_URL_TTL_SEC)
        return RedirectResponse(real_url, status_code=302)
    except HTTPException:
        raise
    except Exception as exc:
        log.exception("proxy file failed")
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"proxy failed: {exc}") from exc


@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    target: str = Query("competition"),
    _: Member = Depends(get_current_user),
):
    """上传附件到飞书 Bitable. target=competition 走主 Base (cert/photo 字段共用 parent_node).

    返回: {file_token, name, size, type}
    前端拿到后写入 cert_files / photo_files 数组,提交 PATCH 比赛接口即可。
    """
    TARGET_TO_PARENT = {
        "competition": settings.lark_base_app_token,
        "a_class": "WVwzbzCbQap38esOaz8cy6umnSj",
        "moment": settings.lark_base_app_token,
    }
    parent_node = TARGET_TO_PARENT.get(target)
    if not parent_node:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"unsupported target: {target}")
    body = await file.read()
    size = len(body)
    if size == 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "empty file")
    if size > _MAX_UPLOAD_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, f"file too large (>{_MAX_UPLOAD_BYTES} bytes)")
    name = file.filename or "unnamed"
    content_type = file.content_type or "application/octet-stream"
    lark = get_lark()
    try:
        data = await lark.upload_drive_media(
            file_name=name,
            parent_type="bitable_file",
            parent_node=parent_node,
            size=size,
            file_bytes=body,
            content_type=content_type,
        )
    except Exception as exc:
        log.exception("upload_drive_media failed")
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"feishu upload failed: {exc}") from exc
    file_token = data.get("file_token")
    if not file_token:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "no file_token returned")
    return {
        "file_token": file_token,
        "name": name,
        "size": size,
        "type": content_type,
    }
