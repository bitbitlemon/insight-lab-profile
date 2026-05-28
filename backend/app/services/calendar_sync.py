"""飞书 calendar 事件同步: webhook 触发, 拉详情 upsert 到本地 CalendarEvent."""
from __future__ import annotations
import json, logging, subprocess
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.models import CalendarEvent

log = logging.getLogger(__name__)


def _lark_get_event(calendar_id: str, event_id: str) -> dict | None:
    """通过 lark-cli 拉某个事件详情."""
    params = json.dumps({"calendar_id": calendar_id, "event_id": event_id})
    args = ["lark-cli", "calendar", "events", "get",
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
    organizer_oid = event.get("creator_id") or event.get("organizer", {}).get("user_id") if isinstance(event.get("organizer"), dict) else event.get("creator_id")
    attendees = event.get("attendees") or []
    attendee_oids = [a.get("user_id") for a in attendees if a.get("user_id")]

    ev = db.query(CalendarEvent).filter_by(lark_event_id=event_id).first()
    if ev:
        ev.title = summary; ev.description = description; ev.location = location
        ev.start_at = start_at; ev.end_at = end_at
        ev.attendees_json = json.dumps(attendee_oids, ensure_ascii=False)
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
        sync_status="pulled", lark_synced_at=datetime.utcnow(),
    )
    db.add(new_ev); db.commit()
    return f"created local mirror of {event_id}"
