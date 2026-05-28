"""请求中间件: body 大小拦截 + 慢请求日志 + 限流器实例。"""
from __future__ import annotations
import logging
import time
from fastapi import Request, status
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.middleware.base import BaseHTTPMiddleware

from .config import settings

log = logging.getLogger(__name__)

limiter = Limiter(key_func=get_remote_address, default_limits=[])


class BodySizeLimitMiddleware(BaseHTTPMiddleware):
    """拒绝 Content-Length > settings.request_max_body_bytes 的请求, 防大 payload 打挂。

    /api/files/upload 走附件上传(图片/PDF), 单独按 settings.upload_max_body_bytes 放宽。
    """
    async def dispatch(self, request: Request, call_next):
        cl = request.headers.get("content-length")
        if cl and cl.isdigit():
            cl_int = int(cl)
            if request.url.path.startswith("/api/files/upload"):
                limit = settings.upload_max_body_bytes
            else:
                limit = settings.request_max_body_bytes
            if cl_int > limit:
                return JSONResponse(
                    {"detail": f"request body too large (>{limit} bytes)"},
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                )
        return await call_next(request)


class SlowRequestLogMiddleware(BaseHTTPMiddleware):
    """记录耗时 > slow_query_threshold_ms 的请求, 暴露到 /tmp/insight_lab_uvicorn.log"""
    async def dispatch(self, request: Request, call_next):
        start = time.perf_counter()
        response = await call_next(request)
        elapsed_ms = (time.perf_counter() - start) * 1000
        if elapsed_ms > settings.slow_query_threshold_ms:
            log.warning(
                "[slow] %.0fms %s %s status=%d",
                elapsed_ms, request.method, request.url.path, response.status_code,
            )
        return response
