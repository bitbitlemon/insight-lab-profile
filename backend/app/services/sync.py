"""
Base ↔ SQLite 同步层

策略:
- Base 为真理源
- 读侧: API 走 SQLite (快); 增量 5 min 轮询 + 每晚 03:00 全量校对
- 写侧: API 先写 Base, 成功后镜像到 SQLite (由 routers/services 调用 push_to_base)
  - 飞书 5xx/网络抖动: 1 次 backoff retry 兜底
- 字段命名: Base 字段名 = ORM attr 名 (同名)
- 关联键: base_record_id 唯一映射 Base record_id ↔ 本地行
"""
from __future__ import annotations
import asyncio
import json
import logging
from datetime import datetime, date
from typing import Any
from sqlalchemy import select, inspect
from sqlalchemy.orm import Session
from ..config import settings
from ..models import (
    Member, Advising, Paper, PaperAuthor, Competition, CompetitionMember,
    MeetingNote, MeetingParticipant, Award, Training, AuditLog, SyncState,
    Contribution, PointsLedger, Project, Task, PaperMilestone,
)
from .lark import get_lark, LarkApiError

log = logging.getLogger(__name__)


def _is_retryable(exc: Exception) -> bool:
    """飞书 5xx 或网络相关异常视为可重试"""
    if isinstance(exc, LarkApiError):
        # code 99991xxx 多为限流/网关; HTTP 5xx 也含
        return exc.code >= 0 and (
            exc.code in (1, 99991663, 99991664, 99991671)
            or "timeout" in (exc.msg or "").lower()
            or "5" == str(getattr(exc, "http_status", ""))[0:1]
        )
    # 网络异常
    return any(s in type(exc).__name__.lower() for s in ("timeout", "connect", "network"))


async def _retry_once(coro_factory, op: str):
    """跑一次, 失败若可重试则 backoff 1.5s 再跑一次"""
    try:
        return await coro_factory()
    except Exception as e:
        if not _is_retryable(e):
            raise
        log.warning("[sync] %s 首次失败, 1.5s 后重试: %s", op, e)
        await asyncio.sleep(1.5)
        return await coro_factory()


# Base 字段名 → ORM 列名 (用于 sync_table_from_base 反向映射). 没列出的字段默认同名匹配.
# 适用于 Base 字段是中文 / ORM 字段是英文 JSON 缓存的场景 (例如比赛证书 / 比赛照片).
TABLE_FIELD_MAP: dict[str, dict[str, str]] = {
    "competitions": {
        "比赛证书": "cert_files_json",
        "比赛照片": "photo_files_json",
    },
    "projects": {
        "项目名称": "name",
        "项目描述": "description",
        "项目状态": "status",
        "优先级": "priority",
        "负责人": "owner_open_id",
        "负责人 open_id": "owner_open_id",
        "部门": "department",
        "开始日期": "start_date",
        "目标结束日期": "target_end_date",
        "实际结束日期": "actual_end_date",
        "标签": "tags",
        "积分": "points_awarded",
    },
    "tasks": {
        "所属项目": "project_id",
        "项目 ID": "project_id",
        "任务标题": "title",
        "任务描述": "description",
        "任务状态": "status",
        "优先级": "priority",
        "负责人": "assignee_open_id",
        "负责人 open_id": "assignee_open_id",
        "计划开始时间": "planned_start_date",
        "截止时间": "due_date",
        "今日待办日期": "today_todo_date",
        "今日思路": "thinking",
        "进展草稿": "progress_draft",
        "任务来源": "task_origin",
        "收到时间": "received_at",
    },
}


# 表名 → (ORM 类, settings 字段 attr)
TABLE_MAP: list[tuple[str, type, str]] = [
    ("members", Member, "lark_table_members"),
    ("advising", Advising, "lark_table_advising"),
    ("papers", Paper, "lark_table_papers"),
    ("paper_authors", PaperAuthor, "lark_table_paper_authors"),
    ("competitions", Competition, "lark_table_competitions"),
    ("competition_members", CompetitionMember, "lark_table_competition_members"),
    ("meeting_notes", MeetingNote, "lark_table_meeting_notes"),
    ("meeting_participants", MeetingParticipant, "lark_table_meeting_participants"),
    ("awards", Award, "lark_table_awards"),
    ("trainings", Training, "lark_table_trainings"),
    ("audit_log", AuditLog, "lark_table_audit_log"),
    ("contributions", Contribution, "lark_table_contributions"),
    ("projects", Project, "lark_table_projects"),
    ("tasks", Task, "lark_table_tasks"),
    ("paper_milestones", PaperMilestone, "lark_table_paper_milestones"),
]


# ====================== Base 字段值解析 ======================

def _unmarshal_field(value: Any, py_type: type | None) -> Any:
    """
    Base 返回的 fields[k] 转 ORM 字段值。
    Base 的奇葩格式:
    - 文本: [{"type":"text","text":"..."}]
    - URL: [{"type":"url","link":"https://...","text":"..."}]
    - 电话: [{"type":"text","text":"..."}]
    - 单选: 字符串
    - 多选: [{"name":"CV"},{"name":"NLP"}]
    - 日期: 毫秒时间戳 (int)
    - 数字 / 布尔: 原值
    """
    if value is None:
        return None
    if isinstance(value, list):
        if not value:
            return None
        first = value[0]
        # text/url 数组结构
        if isinstance(first, dict):
            # 附件字段: list[{file_token, name, size, type, url, tmp_url}] - 序列化为 JSON 缓存
            if "file_token" in first:
                return json.dumps(
                    [
                        {
                            "file_token": v.get("file_token"),
                            "name": v.get("name"),
                            "size": v.get("size"),
                            "type": v.get("type"),
                            "url": v.get("url"),
                        }
                        for v in value if isinstance(v, dict) and v.get("file_token")
                    ],
                    ensure_ascii=False,
                ) or None
            # 多选 {"name":...}
            if "name" in first and "type" not in first:
                names = [v.get("name", "") for v in value if isinstance(v, dict)]
                return json.dumps(names, ensure_ascii=False)
            # 文本/url 数组
            if first.get("type") == "url":
                return first.get("link") or first.get("text") or ""
            if "text" in first:
                return " ".join(v.get("text", "") for v in value if isinstance(v, dict))
        return json.dumps(value, ensure_ascii=False)
    if isinstance(value, dict):
        return value.get("text") or value.get("name") or json.dumps(value, ensure_ascii=False)
    # 数字时间戳 → datetime/date
    if py_type in (datetime,) and isinstance(value, (int, float)):
        return datetime.fromtimestamp(value / 1000)
    if py_type in (date,) and isinstance(value, (int, float)):
        return datetime.fromtimestamp(value / 1000).date()
    if py_type in (datetime,) and isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        return datetime.fromisoformat(text.replace("Z", "+00:00"))
    if py_type in (date,) and isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        return datetime.fromisoformat(text[:10]).date()
    return value


def _orm_attr_python_type(orm_cls: type, attr: str) -> type | None:
    col = inspect(orm_cls).columns.get(attr)
    if col is None:
        return None
    try:
        return col.type.python_type
    except NotImplementedError:
        return None


def _normalize_project_payload(kwargs: dict[str, Any]) -> dict[str, Any]:
    if not kwargs.get("name"):
        raise ValueError("project name is required")
    owner_open_id = (kwargs.get("owner_open_id") or kwargs.get("created_by") or "").strip()
    if not owner_open_id:
        raise ValueError("project owner_open_id is required")
    kwargs["owner_open_id"] = owner_open_id
    kwargs["created_by"] = kwargs.get("created_by") or owner_open_id
    kwargs["status"] = kwargs.get("status") or "planning"
    kwargs["priority"] = kwargs.get("priority") or "medium"
    kwargs["project_type"] = kwargs.get("project_type") or "team"
    kwargs["publication_status"] = kwargs.get("publication_status") or "published"
    kwargs["points_awarded"] = float(kwargs.get("points_awarded") or 0)
    return kwargs


def _normalize_task_payload(kwargs: dict[str, Any]) -> dict[str, Any]:
    if not kwargs.get("title"):
        raise ValueError("task title is required")
    creator = (kwargs.get("created_by") or kwargs.get("assignee_open_id") or "").strip()
    if not creator:
        raise ValueError("task created_by or assignee_open_id is required")
    kwargs["created_by"] = creator
    kwargs["status"] = kwargs.get("status") or "todo"
    kwargs["priority"] = kwargs.get("priority") or "medium"
    kwargs["publication_status"] = kwargs.get("publication_status") or "published"
    kwargs["task_origin"] = kwargs.get("task_origin") or "base_sync"
    if kwargs.get("project_id") in ("", 0):
        kwargs["project_id"] = None
    return kwargs


def _normalize_sync_payload(table_name: str, kwargs: dict[str, Any]) -> dict[str, Any]:
    if table_name == "projects":
        return _normalize_project_payload(kwargs)
    if table_name == "tasks":
        return _normalize_task_payload(kwargs)
    return kwargs


# ====================== Base → SQLite ======================

async def fetch_all_records(table_id: str) -> list[dict]:
    lark = get_lark()
    items: list[dict] = []
    page_token: str | None = None
    while True:
        data = await lark.list_records(
            settings.lark_base_app_token, table_id,
            page_size=100, page_token=page_token,
        )
        data = data or {}
        items.extend(data.get("items") or [])
        if not data.get("has_more"):
            break
        page_token = data.get("page_token")
        if not page_token:
            break
    return items


async def sync_table_from_base(db: Session, table_name: str, orm_cls: type, settings_attr: str) -> dict:
    table_id = getattr(settings, settings_attr, "")
    if not table_id:
        return {"table": table_name, "skipped": True, "reason": "no_table_id"}
    if not settings.lark_base_app_token:
        return {"table": table_name, "skipped": True, "reason": "no_base_token"}

    records = await fetch_all_records(table_id)
    orm_columns = {c.name for c in inspect(orm_cls).columns}
    field_map = TABLE_FIELD_MAP.get(table_name, {})
    upserts = 0; errors = 0

    for rec in records:
        record_id = rec.get("record_id")
        fields = rec.get("fields", {})
        kwargs: dict[str, Any] = {"base_record_id": record_id}
        for k, v in fields.items():
            orm_key = field_map.get(k, k)
            if orm_key not in orm_columns:
                continue
            try:
                kwargs[orm_key] = _unmarshal_field(v, _orm_attr_python_type(orm_cls, orm_key))
            except Exception:
                errors += 1
        try:
            kwargs = _normalize_sync_payload(table_name, kwargs)
        except Exception:
            log.exception("[sync] %s record %s normalize failed", table_name, record_id)
            errors += 1
            continue
        try:
            with db.begin_nested():
                existing = db.execute(select(orm_cls).where(orm_cls.base_record_id == record_id)).scalar_one_or_none()
                if existing:
                    for k, v in kwargs.items():
                        if k != "base_record_id":
                            setattr(existing, k, v)
                else:
                    db.add(orm_cls(**kwargs))
                db.flush()
            upserts += 1
        except Exception:
            log.exception("[sync] %s record %s upsert failed", table_name, record_id)
            errors += 1
    db.commit()

    state = db.get(SyncState, table_name)
    if state is None:
        state = SyncState(table_name=table_name, last_sync_at=datetime.utcnow(), rows_synced=upserts)
        db.add(state)
    else:
        state.last_sync_at = datetime.utcnow()
        state.rows_synced = upserts
        state.last_error = None if errors == 0 else f"{errors} field errors"
    db.commit()

    return {"table": table_name, "upserts": upserts, "errors": errors, "total": len(records)}


async def sync_all_from_base(db: Session) -> list[dict]:
    results = []
    for name, cls, attr in TABLE_MAP:
        if not hasattr(cls, "base_record_id"):
            continue
        try:
            r = await sync_table_from_base(db, name, cls, attr)
        except Exception as e:
            r = {"table": name, "error": str(e)}
        results.append(r)
    return results


async def sync_projects_from_base(db: Session) -> list[dict]:
    """同步项目中心所需数据，供上线前或管理员手动刷新使用。"""
    targets = [
        ("projects", Project, "lark_table_projects"),
        ("tasks", Task, "lark_table_tasks"),
    ]
    results = []
    for name, cls, attr in targets:
        try:
            results.append(await sync_table_from_base(db, name, cls, attr))
        except Exception as e:
            results.append({"table": name, "error": str(e)})
    return results


# ====================== SQLite → Base (写穿透) ======================

def _marshal_field(value: Any) -> Any:
    """ORM 值 → Base 写入格式 (简化, 多数字段透传)"""
    if value is None:
        return None
    if isinstance(value, datetime):
        return int(value.timestamp() * 1000)
    if isinstance(value, date):
        return int(datetime.combine(value, datetime.min.time()).timestamp() * 1000)
    if isinstance(value, str):
        # 试试 JSON list (multi-select 字段)
        if value.startswith("[") and value.endswith("]"):
            try:
                arr = json.loads(value)
                if isinstance(arr, list) and all(isinstance(x, str) for x in arr):
                    return arr
            except Exception:
                pass
    return value


async def push_record_to_base(table_id: str, fields: dict[str, Any], record_id: str | None = None) -> dict:
    """新建/更新 Base 记录。返回 record_id (新增时新生成, 更新时同传入)。失败 1 次 backoff 重试。"""
    if not settings.lark_base_app_token:
        raise RuntimeError("LARK_BASE_APP_TOKEN 未配置")
    payload = {k: _marshal_field(v) for k, v in fields.items() if v is not None}
    lark = get_lark()
    op = f"push {table_id} record_id={record_id}"
    if record_id:
        data = await _retry_once(
            lambda: lark.update_record(settings.lark_base_app_token, table_id, record_id, payload), op,
        )
    else:
        data = await _retry_once(
            lambda: lark.create_record(settings.lark_base_app_token, table_id, payload), op,
        )
    return data.get("record", {})


async def delete_record_from_base(table_id: str, record_id: str) -> None:
    if not settings.lark_base_app_token:
        raise RuntimeError("LARK_BASE_APP_TOKEN 未配置")
    lark = get_lark()
    await _retry_once(
        lambda: lark.delete_record(settings.lark_base_app_token, table_id, record_id),
        f"delete {table_id}/{record_id}",
    )
