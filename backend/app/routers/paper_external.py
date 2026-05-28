"""论文外部数据 — 张迁组日志/过程文档 Base 关联."""
from __future__ import annotations

import json
import logging
import time
from urllib.parse import parse_qs, urlparse

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.deps import get_current_user, get_current_user_q
from app.models import Member, Paper
from app.services.lark import LarkClient
from app.services.zhangqian_log import FILE_TOKEN_CACHE, get_log_for_paper

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/papers", tags=["papers"])

# file_token → (real_url, expire_ts) 短期缓存。飞书 tmp_download_url 1h 失效,
# 这里设 5min 既能扛住列表页 + 详情页 + iframe 预览的连发请求,
# 又远小于飞书过期窗,不会发出失效链接。
_PROXY_URL_CACHE: dict[str, tuple[str, float]] = {}
_PROXY_URL_TTL_SEC = 300.0


@router.get("/{paper_id}/zhangqian-log")
async def get_zhangqian_log(
    paper_id: int,
    db: Session = Depends(get_db),
    _: Member = Depends(get_current_user),
):
    paper = db.get(Paper, paper_id)
    if paper is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "paper not found")
    try:
        result = await get_log_for_paper(paper.title or "", getattr(paper, "title_zh", None))
    except Exception as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"failed to fetch zhangqian log: {exc}") from exc
    return result


def _extra_for(file_token: str) -> str:
    """从 FILE_TOKEN_CACHE 中提取 extra 参数 (含 bitablePerm), 取不到就构造默认值."""
    tmp_url = FILE_TOKEN_CACHE.get(file_token)
    if tmp_url:
        try:
            qs = parse_qs(urlparse(tmp_url).query)
            extra = qs.get("extra", [None])[0]
            if extra:
                return extra
        except Exception:
            pass
    return json.dumps({"bitablePerm": {"tableId": settings.lark_zhangqian_log_table_id, "rev": 0}})


@router.get("/files/{file_token}/proxy")
async def proxy_paper_file(
    file_token: str,
    _: Member = Depends(get_current_user_q),
):
    """飞书附件代理 — 调 batch_get_tmp_download_url 拿真链, 302 redirect 给浏览器."""
    now = time.time()
    cached = _PROXY_URL_CACHE.get(file_token)
    if cached and cached[1] > now:
        return RedirectResponse(cached[0], status_code=302)

    client = LarkClient()
    try:
        tok = await client._get_tenant_token()
        extra = _extra_for(file_token)
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.get(
                "https://open.feishu.cn/open-apis/drive/v1/medias/batch_get_tmp_download_url",
                params={"file_tokens": file_token, "extra": extra},
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
        _PROXY_URL_CACHE[file_token] = (real_url, now + _PROXY_URL_TTL_SEC)
        return RedirectResponse(real_url, status_code=302)
    except HTTPException:
        raise
    except Exception as exc:
        log.exception("proxy file failed")
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"proxy failed: {exc}") from exc
