"""请求级审计上下文：actor open_id 和 ip。

由 deps.get_current_user 在每次请求开始时 set；后台任务（scheduler/listener/sync）
不会 set，因此 SQLA event 监听器拿不到 actor 时会跳过审计写入。
"""
from __future__ import annotations
from contextvars import ContextVar

current_actor: ContextVar[str | None] = ContextVar("audit_current_actor", default=None)
current_ip: ContextVar[str | None] = ContextVar("audit_current_ip", default=None)
