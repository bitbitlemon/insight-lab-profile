"""群聊智能卡片: 构造 + 发送 (拉真数据).

两个核心场景:
  1. 实时完成确认 (send_completion_confirm_card): AI 检测到 task 可能完成 -> 发到群里弹卡
  2. 每日 09:30 早通报 (send_morning_broadcast): 列群里所有未完成 task + 收到回执按钮

按钮 value 结构 (供 chat_card_actions.py 处理):
  - {"kind": "complete_confirm", "intent_id": N, "task_id": M, "act": "confirm"|"reject"|"defer"}
  - {"kind": "quick_done", "task_id": M}
  - {"kind": "morning_ack", "task_id": M, "act": "ack"|"in_progress"|"need_help"|"delay"|"refuse"}
"""
from __future__ import annotations

import json
import logging
import subprocess
import uuid
from datetime import datetime, timedelta
from typing import Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    ChatIntentLog,
    Member,
    ProjectChat,
    ProjectChatMessage,
    Task,
)

log = logging.getLogger(__name__)

LARK_CLI = "/home/ubuntu/.npm-global/bin/lark-cli"

# Delivery target (演示阶段固定到 admin 私聊, 不发到协作群).
# 上线时改回发到 chat.chat_id (注释下方 _DELIVER_TO_ADMIN_OPEN_ID 即可).
_DELIVER_TO_ADMIN_OPEN_ID = "ou_20fec537961e0a66669370b00d0fc52d"


def _send_interactive(chat_id: str | None, user_id: str | None, card: dict, idempotency_key: str | None = None) -> str | None:
    """直接调 lark-cli 发 interactive 卡, 返回 message_id (失败返回 None)."""
    if not card or (not chat_id and not user_id):
        return None
    args = [LARK_CLI, "im", "+messages-send", "--msg-type", "interactive",
            "--content", json.dumps(card, ensure_ascii=False), "--as", "bot"]
    if chat_id:
        args += ["--chat-id", chat_id]
    else:
        args += ["--user-id", user_id]
    if idempotency_key:
        args += ["--idempotency-key", idempotency_key]
    try:
        r = subprocess.run(args, capture_output=True, text=True, timeout=20)
        if r.returncode != 0:
            log.warning("chat_card send failed (chat=%s user=%s): %s", chat_id, user_id, r.stderr.strip()[:300])
            return None
        try:
            resp = json.loads(r.stdout)
            return (resp.get("data") or {}).get("message_id") or (resp.get("data") or {}).get("message", {}).get("message_id")
        except Exception:
            return None
    except Exception as e:
        log.warning("chat_card send exception: %s", e)
        return None


def _fmt_due(dt: datetime | None, today: datetime | None = None) -> tuple[str, str]:
    """返回 (text, color). 用于显示截止."""
    if not dt:
        return "无截止", "grey"
    today = today or datetime.utcnow()
    days = (dt.date() - today.date()).days
    if days < 0:
        return f"逾期 {-days} 天", "red"
    if days == 0:
        return "今日截止", "red"
    if days == 1:
        return "明日截止", "orange"
    return f"截止 {dt.month}/{dt.day}", "grey"


def _resolve_name(db: Session, open_id: str | None, cache: dict[str, str] | None = None) -> str:
    if not open_id:
        return "未指派"
    if cache is not None and open_id in cache:
        return cache[open_id]
    m = db.execute(select(Member).where(Member.open_id == open_id)).scalar_one_or_none()
    name = m.name if m else open_id[:10]
    if cache is not None:
        cache[open_id] = name
    return name


# ============================================================
# 卡 A: 实时完成确认卡 (含顺手完成区)
# ============================================================
def build_completion_confirm_card(
    db: Session,
    task: Task,
    trigger_messages: list[ProjectChatMessage],
    other_open_tasks: list[Task],
    intent: ChatIntentLog,
    chat_name: str | None = None,
) -> dict:
    name_cache: dict[str, str] = {}
    from app.models import Project
    _proj = db.get(Project, task.project_id) if task.project_id else None
    project_name = _proj.name if _proj else "(无项目)"
    project_id = task.project_id or 0
    assignee = _resolve_name(db, task.assignee_open_id, name_cache)
    due_text, _ = _fmt_due(task.due_date)
    created_at = task.created_at.strftime("%-m/%-d") if task.created_at else "—"

    # 触发对话段
    if trigger_messages:
        msg_lines = []
        for m in trigger_messages[-6:]:
            sender = _resolve_name(db, m.sender_open_id, name_cache)
            ts = m.message_created_at.strftime("%H:%M") if m.message_created_at else "?"
            text = (m.content or "")[:200].replace("\n", " ")
            msg_lines.append(f'<font color="grey">　　**{sender}** ({ts}): {text}</font>')
        trigger_block = "\n".join(msg_lines)
    else:
        trigger_block = '<font color="grey">　　(无对话上下文)</font>'

    # 顺手完成区
    quick_elements: list[dict] = []
    if other_open_tasks:
        digits = "①②③④⑤⑥⑦⑧⑨⑩"
        items: list[tuple[str, Task]] = []
        for idx, t in enumerate(other_open_tasks[:10]):
            num = digits[idx] if idx < len(digits) else f"({idx + 1})"
            items.append((num, t))

        lines = []
        for num, t in items:
            who = "@" + _resolve_name(db, t.assignee_open_id, name_cache)
            due_t, color = _fmt_due(t.due_date)
            lines.append(f'{num} **#{t.task_id}** {t.title} · {who} · <font color="{color}">{due_t}</font>')

        quick_elements = [
            {"tag": "hr"},
            {"tag": "div", "text": {"tag": "lark_md", "content":
                f'<font color="grey">**■ 顺手完成 · 其他未完成的 {len(items)} 条** — 编号 ↔ 下面对应按钮</font>'}},
            {"tag": "div", "text": {"tag": "lark_md", "content": "\n".join(lines)}},
            {"tag": "action", "actions": [
                {"tag": "button",
                 "text": {"tag": "plain_text", "content": f"✓ {num}"},
                 "type": "primary", "size": "small",
                 "value": {"kind": "quick_done", "task_id": t.task_id}}
                for num, t in items
            ]},
        ]

    chat_label = chat_name or "项目群"

    return {
        "config": {"wide_screen_mode": True},
        "header": {
            "template": "green",
            "title": {"tag": "plain_text", "content": "AI 识别到一条待办可能已完成"},
        },
        "elements": [
            {"tag": "div", "text": {"tag": "lark_md", "content":
                f"**Task #{task.task_id} · {task.title}**\n"
                f'<font color="grey">项目: [{project_name}](https://insight-lab.linziqian.top/projects/{project_id}) · 指派 @{assignee} · {due_text} · 创建于 {created_at}</font>'}},
            {"tag": "hr"},
            {"tag": "div", "text": {"tag": "lark_md", "content":
                f'<font color="grey">**触发完成判断的群聊片段** · {chat_label} 刚刚</font>\n{trigger_block}'}},
            {"tag": "action", "actions": [
                {"tag": "button",
                 "text": {"tag": "plain_text", "content": "✓ 确认完成"},
                 "type": "primary",
                 "confirm": {"title": {"tag": "plain_text", "content": "确认"},
                             "text": {"tag": "plain_text", "content": "确认后该任务状态变为「已完成」"}},
                 "value": {"kind": "complete_confirm", "intent_id": intent.chat_intent_id,
                           "task_id": task.task_id, "act": "confirm"}},
                {"tag": "button",
                 "text": {"tag": "plain_text", "content": "✗ 还没完成"},
                 "type": "danger",
                 "value": {"kind": "complete_confirm", "intent_id": intent.chat_intent_id,
                           "task_id": task.task_id, "act": "reject"}},
                {"tag": "button",
                 "text": {"tag": "plain_text", "content": "再看看"},
                 "type": "default",
                 "value": {"kind": "complete_confirm", "intent_id": intent.chat_intent_id,
                           "task_id": task.task_id, "act": "defer"}},
            ]},
            *quick_elements,
            {"tag": "hr"},
            {"tag": "note", "elements": [{"tag": "plain_text", "content":
                "点编号按钮即标该任务完成 (不再弹校验, 适合线下已做完但没在群里说的). 误点可在卡片中心撤销."}]},
        ],
    }


def _fetch_trigger_messages(db: Session, chat: ProjectChat, source_message_id: str, window: int = 4) -> list[ProjectChatMessage]:
    """取触发完成判断那条消息 + 前 window 条上下文 (按时间升序)."""
    pivot = db.execute(
        select(ProjectChatMessage).where(
            ProjectChatMessage.project_chat_id == chat.project_chat_id,
            ProjectChatMessage.message_id == source_message_id,
        )
    ).scalar_one_or_none()
    if not pivot:
        return []
    rows = db.execute(
        select(ProjectChatMessage).where(
            ProjectChatMessage.project_chat_id == chat.project_chat_id,
            ProjectChatMessage.message_created_at <= pivot.message_created_at,
        ).order_by(ProjectChatMessage.message_created_at.desc()).limit(window + 1)
    ).scalars().all()
    rows = sorted(rows, key=lambda x: x.message_created_at or datetime.min)
    return rows


def _fetch_other_open_tasks(db: Session, project_id: int, exclude_task_id: int, limit: int = 10) -> list[Task]:
    """同项目内其他未完成的 task, 按截止日升序."""
    rows = db.execute(
        select(Task).where(
            Task.project_id == project_id,
            Task.status.in_(("todo", "in_progress", "blocked")),
            Task.task_id != exclude_task_id,
        ).order_by(Task.due_date.asc().nulls_last(), Task.task_id.asc()).limit(limit)
    ).scalars().all()
    return list(rows)


def send_completion_confirm_card(db: Session, chat: ProjectChat, task: Task, intent: ChatIntentLog) -> str | None:
    """实时弹完成确认卡到群里. 返回 message_id."""
    triggers = _fetch_trigger_messages(db, chat, intent.source_message_id, window=4)
    others = _fetch_other_open_tasks(db, task.project_id, task.task_id, limit=6) if task.project_id else []
    card = build_completion_confirm_card(db, task, triggers, others, intent, chat_name=chat.chat_name)
    msg_id = _send_interactive(None, _DELIVER_TO_ADMIN_OPEN_ID, card,
                               idempotency_key=f"chat-done-{intent.chat_intent_id}-{uuid.uuid4().hex[:6]}")
    return msg_id


# ============================================================
# 卡 B: 每日 09:30 早通报卡
# ============================================================
def build_morning_broadcast_card(
    db: Session,
    chat: ProjectChat,
    open_tasks: list[Task],
    today_due_count: int,
    overdue_count: int,
) -> dict:
    name_cache: dict[str, str] = {}
    today = datetime.utcnow()
    from app.models import Project
    _proj = db.get(Project, chat.project_id) if chat.project_id else None
    project_name = _proj.name if _proj else (chat.chat_name or "项目群")
    project_id = chat.project_id or 0

    if not open_tasks:
        return {
            "config": {"wide_screen_mode": True},
            "header": {"template": "indigo",
                       "title": {"tag": "plain_text", "content": f"[项目] {project_name} · 今日待办通报 · {today.strftime('%-m/%-d')} 09:30"}},
            "elements": [
                {"tag": "div", "text": {"tag": "lark_md", "content":
                    '<font color="green">所有待办都已完成或关闭, 今天没有未完成项. 加油.</font>'}}],
        }

    received_count = sum(1 for t in open_tasks if t.received_at is not None)

    elements: list[dict] = [
        {"tag": "div", "text": {"tag": "lark_md", "content":
            f'**项目**: [{project_name}](https://insight-lab.linziqian.top/projects/{project_id}) · **群**: {chat.chat_name or "未命名"}\n'
            f'<font color="grey">截至 09:30 仍未完成的项目待办 {len(open_tasks)} 条. 各位收到请点对应「我已收到」.</font>'}},
        {"tag": "div", "fields": [
            {"is_short": True, "text": {"tag": "lark_md", "content": f"**未完成**\n{len(open_tasks)} 条"}},
            {"is_short": True, "text": {"tag": "lark_md", "content":
                f'**今日到期**\n<font color="red">{today_due_count} 条</font>' if today_due_count else "**今日到期**\n0 条"}},
            {"is_short": True, "text": {"tag": "lark_md", "content":
                f'**逾期**\n<font color="red">{overdue_count} 条</font>' if overdue_count else "**逾期**\n0 条"}},
            {"is_short": True, "text": {"tag": "lark_md", "content": f"**已收到回执**\n{received_count}/{len(open_tasks)}"}},
        ]},
        {"tag": "hr"},
    ]

    digits = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮"
    for idx, t in enumerate(open_tasks[:15]):
        num = digits[idx] if idx < len(digits) else f"({idx + 1})"
        who = _resolve_name(db, t.assignee_open_id, name_cache)
        due_t, color = _fmt_due(t.due_date, today)
        received_text = "未收到回执" if t.received_at is None else f"✓ 已收到 ({t.received_at.strftime('%-m/%-d %H:%M')})"

        elements.append({"tag": "div", "text": {"tag": "lark_md", "content":
            f'**{num} @{who} · {t.title}**\n'
            f'<font color="{color}">{due_t}</font> · {received_text}'}})

        # 按钮: 没回执 vs 有回执 不同
        if t.received_at is None:
            actions = [
                {"tag": "button", "text": {"tag": "plain_text", "content": f"✓ 我已收到"},
                 "type": "primary", "size": "small",
                 "value": {"kind": "morning_ack", "task_id": t.task_id, "act": "ack"}},
                {"tag": "button", "text": {"tag": "plain_text", "content": "正在做"},
                 "type": "default", "size": "small",
                 "value": {"kind": "morning_ack", "task_id": t.task_id, "act": "in_progress"}},
                {"tag": "button", "text": {"tag": "plain_text", "content": "有困难求支援"},
                 "type": "default", "size": "small",
                 "value": {"kind": "morning_ack", "task_id": t.task_id, "act": "need_help"}},
            ]
        else:
            actions = [
                {"tag": "button", "text": {"tag": "plain_text", "content": "已在做"},
                 "type": "default", "size": "small",
                 "value": {"kind": "morning_ack", "task_id": t.task_id, "act": "in_progress"}},
                {"tag": "button", "text": {"tag": "plain_text", "content": "即将完成"},
                 "type": "primary", "size": "small",
                 "value": {"kind": "morning_ack", "task_id": t.task_id, "act": "near_done"}},
                {"tag": "button", "text": {"tag": "plain_text", "content": "需延期"},
                 "type": "default", "size": "small",
                 "value": {"kind": "morning_ack", "task_id": t.task_id, "act": "delay"}},
            ]
        elements.append({"tag": "action", "actions": actions})

    if len(open_tasks) > 15:
        elements.append({"tag": "div", "text": {"tag": "lark_md", "content":
            f'<font color="grey">…还有 {len(open_tasks) - 15} 条未列出, 见项目中心.</font>'}})

    elements += [
        {"tag": "hr"},
        {"tag": "note", "elements": [{"tag": "plain_text", "content":
            "每日 09:30 自动汇总群里所有「未完成」待办 (含逾期+今日到期+进行中). 点了「我已收到」即记录回执."}]},
    ]

    return {
        "config": {"wide_screen_mode": True},
        "header": {"template": "indigo",
                   "title": {"tag": "plain_text", "content":
                       f"[项目] {project_name} · 今日待办通报 · {today.strftime('%-m/%-d')} 09:30"}},
        "elements": elements,
    }


def send_morning_broadcast_for_chat(db: Session, chat: ProjectChat) -> str | None:
    """生成 + 发到该群. 返回 message_id."""
    if not chat.sync_enabled or not chat.project_id:
        return None

    # 拉该项目所有未完成 task
    open_tasks = db.execute(
        select(Task).where(
            Task.project_id == chat.project_id,
            Task.status.in_(("todo", "in_progress", "blocked")),
        ).order_by(Task.due_date.asc().nulls_last(), Task.task_id.asc())
    ).scalars().all()

    today = datetime.utcnow().date()
    today_due = sum(1 for t in open_tasks if t.due_date and t.due_date.date() == today)
    overdue = sum(1 for t in open_tasks if t.due_date and t.due_date.date() < today)

    card = build_morning_broadcast_card(db, chat, list(open_tasks), today_due, overdue)
    return _send_interactive(None, _DELIVER_TO_ADMIN_OPEN_ID, card,
                             idempotency_key=f"chat-morning-{chat.project_chat_id}-{today.isoformat()}")


def send_morning_broadcast_to_all_chats() -> None:
    """cron 入口: 给所有启用同步的 chat 发早通报. 失败一个不影响其他."""
    from app.db import SessionLocal
    db = SessionLocal()
    try:
        chats = db.execute(
            select(ProjectChat).where(ProjectChat.sync_enabled.is_(True))
        ).scalars().all()
        for chat in chats:
            try:
                mid = send_morning_broadcast_for_chat(db, chat)
                log.info("morning broadcast to %s: %s", chat.chat_id, mid or "fail")
            except Exception as e:
                log.warning("morning broadcast failed for %s: %s", chat.chat_id, e)
    finally:
        db.close()


# ============================================================
# 准实时 cron: 每 N 分钟拉一次所有群消息 + 触发抽取 + 自动落地
# ============================================================
_DEFAULT_ACTOR_OPEN_ID = "ou_20fec537961e0a66669370b00d0fc52d"  # 罗起宁 admin

def sync_and_extract_all_chats(since_minutes: int = 30) -> None:
    """cron 入口: 拉新消息 -> 抽取 -> 触发 auto_apply (complete_task 会弹卡).

    since_minutes: 抽取只看最近 N 分钟的消息 (与 cron 间隔配合, 留余量避免边界丢)
    """
    from app.db import SessionLocal
    from app.services.lark_chat_sync import sync_project_chat
    from app.services.chat_intelligence import extract_intents, apply_auto_intents
    db = SessionLocal()
    try:
        chats = db.execute(
            select(ProjectChat).where(ProjectChat.sync_enabled.is_(True))
        ).scalars().all()
        for chat in chats:
            try:
                s = sync_project_chat(db, chat, page_size=50, max_pages=2)
                if s.get("inserted", 0) == 0:
                    continue  # 没有新消息, 跳过抽取
                log.info("realtime sync %s: inserted=%s", chat.chat_id[:18], s.get("inserted"))
                ex = extract_intents(db, chat, limit=30, since_minutes=since_minutes)
                log.info("realtime extract %s: %s", chat.chat_id[:18], ex)
                if ex.get("intents_created", 0) > 0 or ex.get("auto_applied", 0) > 0:
                    apply_auto_intents(db, chat, _DEFAULT_ACTOR_OPEN_ID)
            except Exception as e:
                log.warning("realtime cycle failed for %s: %s", chat.chat_id[:18], e)
    finally:
        db.close()
