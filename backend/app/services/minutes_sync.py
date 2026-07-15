"""
妙记 → 会议心得自动入库

流程:
  meeting_id → vc +recording → minute_token
  minute_token → vc +notes (summary/todos/participants 等 artifacts)
  对每个组内 open_id 匹配的参会人, 创建 auto_minute meeting_note 草稿
  发飞书卡片通知本人补 my_reflection
"""
from __future__ import annotations
import json
import subprocess
import tempfile
from datetime import datetime, date
from pathlib import Path
from typing import Any
from sqlalchemy import select
from sqlalchemy.orm import Session
from ..models import Member, MeetingNote
from ..config import settings
from .lark import get_lark
from ..config import settings

import os as _os
import shutil as _shutil


def _resolve_lark_cli() -> str:
    for candidate in (
        _os.getenv("LARK_CLI_PATH"),
        "/usr/local/bin/lark-cli",
        "/home/ubuntu/.npm-global/bin/lark-cli",
        "/home/ubuntu/.npm-global/lib/node_modules/@larksuite/cli/bin/lark-cli",
    ):
        if candidate and _os.path.exists(candidate):
            return candidate
    return _shutil.which("lark-cli") or "lark-cli"


LARK_CLI = _resolve_lark_cli()


def _run_cli(args: list[str], timeout: int = 60) -> dict:
    """同步跑 lark-cli, 返回 JSON dict."""
    result = subprocess.run(
        [LARK_CLI, *args, "--format", "json"],
        capture_output=True, text=True, timeout=timeout,
    )
    if result.returncode != 0:
        raise RuntimeError(f"lark-cli {' '.join(args)} failed: {result.stderr[:200]}")
    return json.loads(result.stdout) if result.stdout else {}


def resolve_minute_token(meeting_id: str) -> str | None:
    """vc +recording 拿 minute_token"""
    data = _run_cli(["vc", "+recording", "--meeting-ids", meeting_id, "--as", "user"])
    if not data.get("ok"):
        return None
    items = data.get("data", {}).get("items", []) or data.get("data", {}).get("recordings", [])
    for it in items:
        tok = it.get("minute_token") or it.get("token")
        if tok:
            return tok
    return None


def fetch_meeting_notes(minute_token: str, output_dir: str | None = None) -> dict:
    """vc +notes 拉 artifacts. 返回 {summary, todos, transcript, participants_open_ids, title, start_time}"""
    out = output_dir or tempfile.mkdtemp(prefix="insight_minutes_")
    data = _run_cli([
        "vc", "+notes",
        "--minute-tokens", minute_token,
        "--output-dir", out,
        "--overwrite",
        "--as", "user",
    ], timeout=120)

    result = {
        "minute_token": minute_token,
        "title": "",
        "summary": "",
        "todos": "",
        "transcript_path": None,
        "participants_open_ids": [],
        "start_time": None,
    }
    notes_data = data.get("data", {})
    items = notes_data.get("items", []) or notes_data.get("notes", [])
    if items:
        first = items[0]
        result["title"] = first.get("title", "") or first.get("meeting_title", "")
        st = first.get("start_time") or first.get("meeting_start_time")
        if st:
            try:
                result["start_time"] = datetime.fromtimestamp(int(st) / 1000)
            except (ValueError, TypeError):
                pass
        for p in first.get("participants", []) or []:
            oid = p.get("open_id") or p.get("user_id")
            if oid:
                result["participants_open_ids"].append(oid)

    # artifacts 落地在 out/<minute_token>/{summary.md, todos.md, transcript.txt}
    out_path = Path(out) / minute_token
    if out_path.exists():
        for fname, key in [("summary.md", "summary"), ("todos.md", "todos")]:
            f = out_path / fname
            if f.exists():
                result[key] = f.read_text(encoding="utf-8")[:8000]
        trans = out_path / "transcript.txt"
        if trans.exists():
            result["transcript_path"] = str(trans)

    return result


def create_auto_minute_drafts(db: Session, minute_token: str, fetched: dict) -> dict:
    """对每个组内参会人创建 auto_minute draft. 返回 {created: int, skipped: int, owners: [open_id]}"""
    participants = fetched.get("participants_open_ids") or []
    title = fetched.get("title") or "未命名会议"
    summary = fetched.get("summary") or ""
    todos = fetched.get("todos") or ""
    meeting_date = (fetched.get("start_time") or datetime.utcnow()).date()

    created, skipped, owners = 0, 0, []
    for open_id in participants:
        member = db.get(Member, open_id)
        if not member:
            skipped += 1
            continue
        # 去重: (owner, minute_token) 已有则跳过
        existing = db.execute(
            select(MeetingNote).where(
                MeetingNote.owner_open_id == open_id,
                MeetingNote.lark_minute_token == minute_token,
            )
        ).scalar_one_or_none()
        if existing:
            skipped += 1
            continue
        n = MeetingNote(
            owner_open_id=open_id,
            meeting_title=title,
            meeting_date=meeting_date,
            meeting_type="组会",
            summary=summary,
            action_items=todos,
            lark_minute_token=minute_token,
            source="auto_minute",
            review_status="draft",
            privacy_level="internal",
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        db.add(n)
        created += 1
        owners.append(open_id)
    db.commit()
    return {"created": created, "skipped": skipped, "owners": owners}


async def notify_owners_card(owners: list[str], title: str, app_base_url: str = "https://example.invalid") -> dict:
    """对每人发飞书卡片提醒补心得. 返回 {sent, failed}"""
    if not settings.notifications_enabled:
        return {"sent": 0, "failed": 0, "skipped": "notifications_disabled"}
    if not owners:
        return {"sent": 0, "failed": 0}
    lark = get_lark()
    sent, failed = 0, 0
    card = {
        "config": {"wide_screen_mode": True},
        "header": {
            "title": {"tag": "plain_text", "content": "会议心得待补充"},
            "template": "blue",
        },
        "elements": [
            {"tag": "div", "text": {"tag": "lark_md", "content": f"**{title}** 已生成纪要草稿,请补充心得。"}},
            {"tag": "action", "actions": [
                {"tag": "button", "text": {"tag": "plain_text", "content": "去填写"},
                 "type": "primary", "url": app_base_url},
            ]},
        ],
    }
    body_template = {"msg_type": "interactive", "content": json.dumps(card, ensure_ascii=False)}
    for open_id in owners:
        try:
            body = dict(body_template)
            body["receive_id"] = open_id
            await lark._request("POST", "/im/v1/messages",
                                params={"receive_id_type": "open_id"}, json=body)
            sent += 1
        except Exception:
            failed += 1
    return {"sent": sent, "failed": failed}


def run_meeting_sync(db: Session, meeting_id: str | None = None, minute_token: str | None = None) -> dict:
    """主入口: 由 meeting_id 或 minute_token 触发完整同步"""
    if not minute_token and meeting_id:
        minute_token = resolve_minute_token(meeting_id)
    if not minute_token:
        return {"ok": False, "reason": "no_minute_token", "meeting_id": meeting_id}
    fetched = fetch_meeting_notes(minute_token)
    draft = create_auto_minute_drafts(db, minute_token, fetched)
    return {
        "ok": True,
        "minute_token": minute_token,
        "title": fetched.get("title"),
        "participants_count": len(fetched.get("participants_open_ids", [])),
        "drafts_created": draft["created"],
        "drafts_skipped": draft["skipped"],
        "owners": draft["owners"],
    }
