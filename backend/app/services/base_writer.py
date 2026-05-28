"""Base 写穿透通用层.

设计目标 (与档案系统六主线对齐, 数据库逐步多维表格化):
- Base 是真理源, SQLite 是本地缓存
- 写路径: push-then-commit. 先写 Base 成功拿到 record_id, 再 mirror 到 SQLite
- Base 写失败: HTTPException 502, 调用方负责回滚 (不要 commit SQLite)
- 配置缺失: 默认 graceful skip (mirror_to_base 返回 None), 调用方决定继不继续
- 强约束: 当 force=True 时, 配置缺失也抛 502, 适用于核心主线表 (积分/项目/任务)

调用模式:
    new_rid = await mirror_to_base(table_id, fields, record_id=row.base_record_id)
    if new_rid:
        row.base_record_id = new_rid
    db.commit()

定时回填模式 (scheduler):
    pushed, errors = await push_pending_for_table(orm_cls, table_id, fields_fn, batch=50)
"""
from __future__ import annotations
import logging
from typing import Callable, TypeVar, Any

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.config import settings
from app.services.sync import push_record_to_base as _raw_push, delete_record_from_base as _raw_delete

log = logging.getLogger(__name__)

T = TypeVar("T")


async def mirror_to_base(
    table_id: str, fields: dict[str, Any],
    record_id: str | None = None,
    force: bool = False,
) -> str | None:
    """写 Base. 配置缺失返回 None (force=True 时抛 502).
    Base 失败统一抛 HTTPException(502)."""
    if not table_id or not settings.lark_base_app_token:
        if force:
            raise HTTPException(502, "Base 未配置, 但本表为关键路径必须双写")
        log.debug("Base 表未配置, mirror 跳过")
        return None
    try:
        rec = await _raw_push(table_id, fields, record_id=record_id)
        return rec.get("record_id") or record_id
    except Exception as e:
        log.warning("Base 写穿透失败: %s", e)
        raise HTTPException(502, f"Base 写穿透失败: {e}") from e


async def delete_from_base(
    table_id: str, record_id: str | None,
    force: bool = False,
) -> None:
    if not record_id:
        return
    if not table_id or not settings.lark_base_app_token:
        if force:
            raise HTTPException(502, "Base 未配置, 但本表为关键路径")
        return
    try:
        await _raw_delete(table_id, record_id)
    except Exception as e:
        log.warning("Base 删除失败 %s: %s", record_id, e)
        if force:
            raise HTTPException(502, f"Base 删除失败: {e}") from e


async def push_pending_for_table(
    orm_cls: type,
    table_id: str,
    fields_fn: Callable[[Any], dict],
    db_factory: Callable[[], Session],
    batch: int = 50,
) -> dict:
    """扫 orm_cls 中 base_record_id IS NULL 的行批量推 Base.
    返回 {pushed, errors, skipped, table}."""
    table_name = getattr(orm_cls, "__tablename__", str(orm_cls))
    if not table_id or not settings.lark_base_app_token:
        return {"pushed": 0, "errors": 0, "skipped": True, "table": table_name}

    db = db_factory()
    pushed = 0
    errors = 0
    try:
        pending = (
            db.query(orm_cls)
            .filter(orm_cls.base_record_id.is_(None))  # type: ignore[attr-defined]
            .limit(batch)
            .all()
        )
        for row in pending:
            try:
                fields = fields_fn(row)
                rec = await _raw_push(table_id, fields, record_id=None)
                new_rid = rec.get("record_id")
                if new_rid:
                    row.base_record_id = new_rid  # type: ignore[attr-defined]
                    db.commit()
                    pushed += 1
                else:
                    errors += 1
            except Exception as e:
                errors += 1
                log.warning("%s ledger 推送失败: %s", table_name, e)
                db.rollback()
        return {"pushed": pushed, "errors": errors, "total_pending": len(pending), "table": table_name}
    finally:
        db.close()
