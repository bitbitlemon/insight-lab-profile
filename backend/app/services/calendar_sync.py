"""飞书 calendar 事件同步: webhook 触发, 拉详情 upsert 到本地 CalendarEvent."""
from __future__ import annotations
import json, logging, subprocess
import re
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.models import CalendarEvent, Member
from app.services.lark_calendar import lark_cli_cmd, list_events as lark_list_events

log = logging.getLogger(__name__)


def _lark_get_event(calendar_id: str, event_id: str) -> dict | None:
    """通过 lark-cli 拉某个事件详情."""
    params = json.dumps({"calendar_id": calendar_id, "event_id": event_id})
    args = [lark_cli_cmd(), "calendar", "events", "get",
            "--params", params, "--as", "bot", "--format", "json"]
    try:
        r = subprocess.run(args, capture_output=True, text=True, timeout=15)
        if r.returncode != 0:
            log.warning("lark get event failed: %s", r.stderr)
            return None
        return json.loads(r.stdout)
    except Exception as e:
        log.warning("lark get event exception: %s", e)
        return None


def _parse_ts(value) -> datetime | None:
    """飞书时间戳字符串或 ISO 字符串解析为 datetime."""
    if not value: return None
    if isinstance(value, dict):
        value = value.get("timestamp") or value.get("date")
    if not value: return None
    s = str(value)
    if s.isdigit():
        return datetime.fromtimestamp(int(s), tz=timezone.utc).replace(tzinfo=None)
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00")).replace(tzinfo=None)
    except Exception:
        return None


def _location_name(value) -> str | None:
    if isinstance(value, dict):
        return value.get("name") or value.get("address") or value.get("display_name")
    return str(value) if value else None


def _event_id(value: dict) -> str | None:
    return value.get("event_id") or value.get("id") or value.get("uid")


def _event_title(value: dict) -> str:
    return value.get("summary") or value.get("title") or value.get("subject") or "(未命名)"


def _event_description(value: dict) -> str | None:
    return value.get("description") or value.get("desc") or value.get("content")


def _event_organizer(value: dict) -> str | None:
    organizer = value.get("organizer")
    if isinstance(organizer, dict):
        return organizer.get("user_id") or organizer.get("open_id") or organizer.get("id")
    return value.get("creator_id") or value.get("organizer_id")


def _event_attendees(value: dict) -> list[str]:
    attendees = value.get("attendees") or value.get("attendee_ids") or []
    result: list[str] = []
    for item in attendees:
        if isinstance(item, str):
            result.append(item)
        elif isinstance(item, dict):
            oid = item.get("user_id") or item.get("open_id") or item.get("id")
            if oid:
                result.append(oid)
    return list(dict.fromkeys(result))


def _extract_related_project_id(*values: str | None) -> int | None:
    text = "\n".join(item for item in values if item)
    match = re.search(r"\bproject:(\d+)\b", text)
    return int(match.group(1)) if match else None


def _upsert_event(
    db: Session,
    event: dict,
    calendar_id: str,
    fallback_organizer_open_id: str,
) -> CalendarEvent | None:
    event_id = _event_id(event)
    start_at = _parse_ts(event.get("start_time") or event.get("start_at") or event.get("start"))
    end_at = _parse_ts(event.get("end_time") or event.get("end_at") or event.get("end"))
    if not (event_id and start_at and end_at):
        return None

    title = _event_title(event)
    description = _event_description(event)
    location = _location_name(event.get("location"))
    organizer_oid = _event_organizer(event) or fallback_organizer_open_id
    if not db.get(Member, organizer_oid):
        organizer_oid = fallback_organizer_open_id
    attendee_oids = _event_attendees(event)
    related_project_id = _extract_related_project_id(title, description, location)

    ev = db.query(CalendarEvent).filter_by(lark_event_id=event_id).first()
    if not ev:
        ev = CalendarEvent(
            lark_event_id=event_id,
            lark_calendar_id=calendar_id,
            event_type="meeting",
            organizer_open_id=organizer_oid,
            sync_status="pulled",
        )
        db.add(ev)

    ev.title = title
    ev.description = description
    ev.location = location
    ev.start_at = start_at
    ev.end_at = end_at
    ev.all_day = bool(event.get("all_day") or event.get("is_all_day"))
    ev.organizer_open_id = organizer_oid
    ev.attendees_json = json.dumps(attendee_oids, ensure_ascii=False) if attendee_oids else None
    ev.lark_calendar_id = calendar_id
    ev.related_project_id = related_project_id
    ev.sync_status = "pulled"
    ev.lark_synced_at = datetime.utcnow()
    return ev


def sync_lark_calendar_events(
    db: Session,
    calendar_id: str,
    start_at: datetime,
    end_at: datetime,
    fallback_organizer_open_id: str,
) -> dict:
    """Pull events from a specified Lark calendar into local CalendarEvent mirrors."""
    items = lark_list_events(start_at, end_at, calendar_id=calendar_id)
    created = 0
    updated = 0
    skipped = 0
    for item in items:
        event = item.get("event") if isinstance(item.get("event"), dict) else item
        event_id = _event_id(event)
        existed = bool(event_id and db.query(CalendarEvent).filter_by(lark_event_id=event_id).first())
        row = _upsert_event(db, event, calendar_id, fallback_organizer_open_id)
        if not row:
            skipped += 1
        elif existed:
            updated += 1
        else:
            created += 1
    db.commit()
    return {
        "calendar_id": calendar_id,
        "fetched": len(items),
        "created": created,
        "updated": updated,
        "skipped": skipped,
    }


def handle_calendar_event_change(db: Session, payload: dict) -> str | None:
    """处理 calendar.calendar.event_changed_v4 事件.

    payload 通常含 calendar_id + event_id + change_type (created/updated/deleted).
    """
    calendar_id = payload.get("calendar_id")
    event_id = payload.get("event_id") or payload.get("eventId")
    change = (payload.get("change_type") or payload.get("type") or "").lower()
    if not (calendar_id and event_id):
        return "缺 calendar_id / event_id"

    # 删除事件
    if "delete" in change or "removed" in change:
        ev = db.query(CalendarEvent).filter_by(lark_event_id=event_id).first()
        if ev:
            db.delete(ev); db.commit()
            return f"deleted local mirror of {event_id}"
        return "no local mirror to delete"

    # 拉详情
    detail = _lark_get_event(calendar_id, event_id)
    if not detail or detail.get("code") != 0:
        return f"lark get failed: {detail and detail.get('msg')}"
    event = (detail.get("data") or {}).get("event") or {}
    start_at = _parse_ts(event.get("start_time"))
    end_at = _parse_ts(event.get("end_time"))
    if not (start_at and end_at):
        return "invalid time"

    summary = event.get("summary") or "(未命名)"
    description = event.get("description") or None
    location = (event.get("location") or {}).get("name") if isinstance(event.get("location"), dict) else None
    organizer_oid = _event_organizer(event)
    attendee_oids = _event_attendees(event)

    ev = db.query(CalendarEvent).filter_by(lark_event_id=event_id).first()
    if ev:
        ev.title = summary; ev.description = description; ev.location = location
        ev.start_at = start_at; ev.end_at = end_at
        ev.attendees_json = json.dumps(attendee_oids, ensure_ascii=False)
        ev.related_project_id = _extract_related_project_id(summary, description, location)
        ev.sync_status = "synced"
        ev.lark_synced_at = datetime.utcnow()
        db.commit()
        return f"updated local mirror of {event_id}"

    # 新事件: 创建本地镜像 (来自飞书的外部事件)
    if not organizer_oid:
        # 没有合法 organizer (FK 约束),先跳过
        return f"skip: no organizer for {event_id}"
    new_ev = CalendarEvent(
        lark_event_id=event_id, lark_calendar_id=calendar_id,
        event_type="meeting", title=summary, description=description, location=location,
        start_at=start_at, end_at=end_at, all_day=False,
        organizer_open_id=organizer_oid,
        attendees_json=json.dumps(attendee_oids, ensure_ascii=False) if attendee_oids else None,
        related_project_id=_extract_related_project_id(summary, description, location),
        sync_status="pulled", lark_synced_at=datetime.utcnow(),
    )
    db.add(new_ev); db.commit()
    return f"created local mirror of {event_id}"
