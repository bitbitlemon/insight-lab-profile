from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Literal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Member
from app.services.lark import get_lark

log = logging.getLogger(__name__)

PeopleSyncSource = Literal["ehr", "contact", "auto"]


@dataclass
class PeopleSyncResult:
    source: str
    total: int = 0
    created: int = 0
    updated: int = 0
    unchanged: int = 0
    marked_left: int = 0
    departments: int = 0
    errors: list[str] | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "source": self.source,
            "total": self.total,
            "created": self.created,
            "updated": self.updated,
            "unchanged": self.unchanged,
            "marked_left": self.marked_left,
            "departments": self.departments,
            "errors": self.errors or [],
        }


def _text(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        value = value.strip()
        return value or None
    if isinstance(value, dict):
        for key in ("name", "text", "value", "display_name"):
            got = _text(value.get(key))
            if got:
                return got
        return None
    if isinstance(value, list):
        parts = [_text(item) for item in value]
        return " / ".join([item for item in parts if item]) or None
    return str(value).strip() or None


def _role_from_person(fields: dict[str, Any]) -> str:
    text = " ".join(
        filter(
            None,
            [
                _text(fields.get("job")),
                _text(fields.get("job_level")),
                _text(fields.get("employee_type")),
                _text(fields.get("employee_form_status")),
            ],
        )
    )
    if any(word in text for word in ("老师", "教师", "教授", "导师", "PI", "研究员")):
        return "teacher"
    if any(word in text for word in ("行政", "助理", "运营", "人事", "HR", "财务", "秘书")):
        return "staff"
    return "student"


def _status_from_ehr(value: Any) -> str:
    raw = str(value or "").strip().lower()
    if raw in ("", "2", "active", "onboarded", "employed", "regular", "probation"):
        return "active"
    if raw in ("leave", "on_leave"):
        return "on_leave"
    return "left"


def _status_from_contact(user: dict[str, Any]) -> str:
    status = user.get("status") or {}
    if isinstance(status, dict) and status.get("is_exited"):
        return "left"
    return "active"


async def _fetch_departments() -> dict[str, str]:
    lark = get_lark()
    departments: dict[str, str] = {}
    token: str | None = None
    while True:
        data = await lark.list_child_departments("0", fetch_child=True, page_token=token)
        for row in data.get("items") or []:
            dept_id = row.get("open_department_id") or row.get("department_id")
            name = _text(row.get("name")) or _text(row.get("i18n_name"))
            if dept_id and name:
                departments[str(dept_id)] = name
        if not data.get("has_more"):
            break
        token = data.get("page_token")
        if not token:
            break
    return departments


async def _fetch_ehr_people(departments: dict[str, str]) -> list[dict[str, Any]]:
    lark = get_lark()
    rows: list[dict[str, Any]] = []
    token: str | None = None
    status = (settings.lark_ehr_employee_status or "").strip() or None
    employee_type = (settings.lark_ehr_employee_type or "").strip() or None
    while True:
        data = await lark.list_ehr_employees(status=status, employee_type=employee_type, page_token=token)
        for item in data.get("items") or []:
            fields = item.get("system_fields") or {}
            open_id = _text(item.get("user_id"))
            if not open_id:
                continue
            dept_id = _text(fields.get("department_id"))
            rows.append({
                "open_id": open_id,
                "name": _text(fields.get("name")) or open_id,
                "en_name": _text(fields.get("en_name")),
                "email": _text(fields.get("email")),
                "mobile": _text(fields.get("mobile")),
                "avatar_url": None,
                "role": _role_from_person(fields),
                "department": departments.get(dept_id or "", dept_id),
                "position": _text(fields.get("job")),
                "title": _text(fields.get("job_level")) or _text(fields.get("employee_no")),
                "enroll_date": _text(fields.get("hire_date")),
                "graduate_date": _text(fields.get("last_day")),
                "extra_memberships": json.dumps({
                    "source": "lark_ehr",
                    "department_id": dept_id,
                    "manager": fields.get("manager"),
                    "employee_no": fields.get("employee_no"),
                    "work_location": fields.get("work_location"),
                    "contract_company": fields.get("contract_company"),
                }, ensure_ascii=False),
                "status": _status_from_ehr(fields.get("status")),
            })
        if not data.get("has_more"):
            break
        token = data.get("page_token")
        if not token:
            break
    return rows


async def _fetch_contact_people(departments: dict[str, str]) -> list[dict[str, Any]]:
    lark = get_lark()
    dept_ids = ["0", *departments.keys()]
    seen: set[str] = set()
    rows: list[dict[str, Any]] = []
    for dept_id in dept_ids:
        token: str | None = None
        while True:
            data = await lark.list_department_users(dept_id, page_token=token)
            for user in data.get("items") or []:
                open_id = _text(user.get("open_id") or user.get("user_id") or user.get("id"))
                if not open_id or open_id in seen:
                    continue
                seen.add(open_id)
                user_dept_ids = user.get("department_ids") or user.get("department_ids_custom") or []
                primary_dept_id = _text(user_dept_ids[0]) if isinstance(user_dept_ids, list) and user_dept_ids else dept_id
                rows.append({
                    "open_id": open_id,
                    "name": _text(user.get("name")) or _text(user.get("nickname")) or open_id,
                    "en_name": _text(user.get("en_name")),
                    "email": _text(user.get("email")) or _text(user.get("enterprise_email")),
                    "mobile": _text(user.get("mobile")),
                    "avatar_url": _text(user.get("avatar", {}).get("avatar_240")) if isinstance(user.get("avatar"), dict) else None,
                    "role": "student",
                    "department": departments.get(primary_dept_id or "", primary_dept_id),
                    "position": _text(user.get("job_title")),
                    "title": _text(user.get("job_title")),
                    "extra_memberships": json.dumps({
                        "source": "lark_contact",
                        "department_ids": user_dept_ids,
                    }, ensure_ascii=False),
                    "status": _status_from_contact(user),
                })
            if not data.get("has_more"):
                break
            token = data.get("page_token")
            if not token:
                break
    return rows


def _parse_date(value: Any):
    text = _text(value)
    if not text:
        return None
    try:
        return datetime.fromisoformat(text[:10]).date()
    except ValueError:
        return None


def _apply_member(db: Session, payload: dict[str, Any]) -> str:
    open_id = payload["open_id"]
    existing = db.get(Member, open_id)
    columns = {
        "name": payload.get("name") or open_id,
        "en_name": payload.get("en_name"),
        "email": payload.get("email"),
        "mobile": payload.get("mobile"),
        "avatar_url": payload.get("avatar_url"),
        "role": payload.get("role") or "student",
        "department": payload.get("department"),
        "position": payload.get("position"),
        "title": payload.get("title"),
        "enroll_date": _parse_date(payload.get("enroll_date")),
        "graduate_date": _parse_date(payload.get("graduate_date")),
        "extra_memberships": payload.get("extra_memberships"),
        "status": payload.get("status") or "active",
        "privacy_level": "internal",
    }
    if existing is None:
        db.add(Member(open_id=open_id, **columns))
        return "created"

    changed = False
    for key, value in columns.items():
        if key == "privacy_level":
            continue
        if key == "role" and existing.role in ("admin", "staff"):
            continue
        if value in (None, "") and key not in ("status",):
            continue
        if getattr(existing, key) != value:
            setattr(existing, key, value)
            changed = True
    return "updated" if changed else "unchanged"


async def sync_people_from_lark(
    db: Session,
    *,
    source: PeopleSyncSource | None = None,
    mark_missing_left: bool | None = None,
) -> dict[str, Any]:
    selected = source or settings.lark_people_sync_default_source or "ehr"
    mark_left = settings.lark_people_sync_mark_missing_left if mark_missing_left is None else mark_missing_left
    errors: list[str] = []
    try:
        departments = await _fetch_departments()
    except Exception as exc:
        departments = {}
        errors.append(f"departments failed: {exc}")

    try:
        if selected == "contact":
            people = await _fetch_contact_people(departments)
            actual_source = "contact"
        else:
            people = await _fetch_ehr_people(departments)
            actual_source = "ehr"
    except Exception as exc:
        if selected != "auto":
            raise
        errors.append(f"ehr failed: {exc}")
        people = await _fetch_contact_people(departments)
        actual_source = "contact"

    result = PeopleSyncResult(source=actual_source, total=len(people), departments=len(departments), errors=errors)
    seen: set[str] = set()
    for person in people:
        seen.add(person["open_id"])
        action = _apply_member(db, person)
        if action == "created":
            result.created += 1
        elif action == "updated":
            result.updated += 1
        else:
            result.unchanged += 1

    if mark_left and seen:
        active_rows = db.execute(select(Member).where(Member.status != "left")).scalars().all()
        for row in active_rows:
            if row.open_id not in seen:
                row.status = "left"
                result.marked_left += 1

    db.commit()
    log.info("lark people sync finished: %s", result.as_dict())
    return result.as_dict()
