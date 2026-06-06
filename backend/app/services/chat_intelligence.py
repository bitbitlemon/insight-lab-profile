"""群聊智能提取: 从 ProjectChatMessage 抽取 create_task / complete_task 意图.

流程:
  1. 找未处理的消息 (没有对应 ChatIntentLog 的 source_message_id)
  2. 按 thread_id/topic_key 优先分组; 退化用 10min 时间窗 + 同发送者连续段
  3. 每组带前 N 条上下文喂 DeepSeek, 输出 JSON 列表
  4. 校验: assignee 名 → open_id, 完成动作做 fuzzy task 匹配
  5. 写 ChatIntentLog (status=pending / auto_applied)
  6. 高置信度直接调 apply_intent 落地 Task + ProjectLog
"""
from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timedelta
from difflib import SequenceMatcher
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import (
    ChatIntentLog,
    Member,
    Project,
    ProjectChat,
    ProjectChatMessage,
    ProjectLog,
    Task,
)

log = logging.getLogger(__name__)

CONFIDENCE_AUTO = 0.85
CONFIDENCE_PENDING = 0.5
CONTEXT_WINDOW = 15
GROUP_TIME_WINDOW = timedelta(minutes=10)
MAX_MESSAGES_PER_BATCH = 12


def _extract_text(content: str | None) -> str:
    if not content:
        return ""
    raw = content.strip()
    if not raw:
        return ""
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, ValueError):
        return raw
    if isinstance(data, dict):
        if "text" in data and isinstance(data["text"], str):
            return data["text"]
        if "content" in data and isinstance(data["content"], str):
            return data["content"]
        return json.dumps(data, ensure_ascii=False)[:400]
    return str(data)[:400]


def _clean_html_lite(text: str) -> str:
    return re.sub(r"<[^>]+>", "", text).strip()


def _format_message_brief(msg: ProjectChatMessage) -> dict[str, Any]:
    text = _clean_html_lite(_extract_text(msg.content))
    return {
        "message_id": msg.message_id,
        "ts": msg.message_created_at.isoformat() if msg.message_created_at else None,
        "sender_name": msg.sender_name or "",
        "sender_open_id": msg.sender_open_id or "",
        "text": text[:600],
        "msg_type": msg.msg_type or "text",
        "topic_key": msg.topic_key or "",
    }


def _candidate_members(db: Session) -> list[dict[str, str | None]]:
    rows = db.execute(
        select(Member).where(Member.status.in_(("active", "on_leave"))).order_by(Member.name.asc())
    ).scalars().all()
    return [
        {"open_id": m.open_id, "name": m.name, "en_name": m.en_name, "department": m.department}
        for m in rows
    ]


def _resolve_assignee(name_raw: str | None, members: list[dict[str, str | None]]) -> str | None:
    if not name_raw:
        return None
    target = re.sub(r"[\s@,，、。\-_]", "", name_raw.lower())
    if not target:
        return None
    for m in members:
        for field in ("name", "en_name"):
            v = (m.get(field) or "").lower()
            v = re.sub(r"[\s,，、。\-_]", "", v)
            if v and (v == target or target in v or v in target):
                return m["open_id"]
    return None


def _open_id_to_name(db: Session, open_id: str | None) -> str | None:
    if not open_id:
        return None
    m = db.get(Member, open_id)
    return m.name if m else None


def _active_tasks_brief(db: Session, project_id: int) -> list[dict[str, Any]]:
    rows = db.execute(
        select(Task).where(
            Task.project_id == project_id, Task.status.in_(("todo", "in_progress", "blocked"))
        ).order_by(Task.updated_at.desc()).limit(40)
    ).scalars().all()
    out = []
    for t in rows:
        out.append({
            "task_id": t.task_id,
            "title": t.title,
            "status": t.status,
            "assignee_name": _open_id_to_name(db, t.assignee_open_id),
            "due_date": t.due_date.isoformat() if t.due_date else None,
        })
    return out


def _fuzzy_match_task(title: str, candidates: list[dict[str, Any]]) -> int | None:
    if not title or not candidates:
        return None
    best_id = None
    best_score = 0.0
    for c in candidates:
        score = SequenceMatcher(None, title, c["title"] or "").ratio()
        if score > best_score:
            best_score = score
            best_id = c["task_id"]
    return best_id if best_score >= 0.55 else None


def _processed_ids(db: Session, chat_id: int, message_ids: list[str]) -> set[str]:
    if not message_ids:
        return set()
    rows = db.execute(
        select(ChatIntentLog.source_message_id).where(
            ChatIntentLog.project_chat_id == chat_id,
            ChatIntentLog.source_message_id.in_(message_ids),
        )
    ).all()
    return {r[0] for r in rows}


def _group_messages(messages: list[ProjectChatMessage]) -> list[list[ProjectChatMessage]]:
    """按 topic_key 或时间窗分组. 同 topic 一组; 无 topic 退化用 10min 滑窗."""
    by_topic: dict[str, list[ProjectChatMessage]] = {}
    no_topic: list[ProjectChatMessage] = []
    for m in messages:
        if m.topic_key and m.topic_key != m.message_id:
            by_topic.setdefault(m.topic_key, []).append(m)
        else:
            no_topic.append(m)

    groups: list[list[ProjectChatMessage]] = []
    for tk, ms in by_topic.items():
        ms.sort(key=lambda x: x.message_created_at or datetime.min)
        for i in range(0, len(ms), MAX_MESSAGES_PER_BATCH):
            groups.append(ms[i:i + MAX_MESSAGES_PER_BATCH])

    no_topic.sort(key=lambda x: x.message_created_at or datetime.min)
    current: list[ProjectChatMessage] = []
    for m in no_topic:
        if not current:
            current = [m]
            continue
        prev = current[-1]
        prev_t = prev.message_created_at or datetime.min
        cur_t = m.message_created_at or datetime.min
        if cur_t - prev_t <= GROUP_TIME_WINDOW and len(current) < MAX_MESSAGES_PER_BATCH:
            current.append(m)
        else:
            groups.append(current)
            current = [m]
    if current:
        groups.append(current)
    return groups


def _build_context(
    db: Session,
    chat: ProjectChat,
    group: list[ProjectChatMessage],
) -> list[dict[str, Any]]:
    """取分组里最早一条之前 N 条作为上下文."""
    if not group:
        return []
    first_t = group[0].message_created_at or datetime.utcnow()
    rows = db.execute(
        select(ProjectChatMessage).where(
            ProjectChatMessage.project_chat_id == chat.project_chat_id,
            ProjectChatMessage.message_created_at < first_t,
        ).order_by(ProjectChatMessage.message_created_at.desc()).limit(CONTEXT_WINDOW)
    ).scalars().all()
    rows = sorted(rows, key=lambda x: x.message_created_at or datetime.min)
    return [_format_message_brief(m) for m in rows]


SYSTEM_PROMPT = (
    "你是实验室群聊待办抽取助手. 给定一组连续的群聊消息 (target_messages) 和之前的上下文 "
    "(context_messages), 抽取出明确的待办意图. 只关心两类:\n"
    "  - create_task: 有人明确要做某件事, 或被指派做某事 (含 @某人 派活, 自述将做, '明天我..' 等)\n"
    "  - complete_task: 有人明确完成了一件事 (常见: 【总结】今日... 已完成... 解决了...)\n"
    "其余闲聊/吐槽/无明确动作 → 不产出 intent (返回空 intents).\n\n"
    "重要约束:\n"
    "  - 严格 JSON, 不要 markdown. 无意图返回 {\"intents\": []}\n"
    "  - 同一句话只产一条 intent, 不要拆\n"
    "  - title 精炼 (≤30 字, 名词短语). 例: '优化训练系统打乱题目功能' 而非整段总结\n"
    "  - assignee_name 必须从 candidate_members.name 中选, 写中文名 (如 '潘浩宇'); 找不到给 null\n"
    "  - due_date ISO 日期或 null. '明天' '今天' 按 current_time 推算\n"
    "  - confidence 0-1: 越明确越高 (有明确动词 + 主体 + 对象 → 0.9; 模糊 → 0.5; 闲聊 → 不产出)\n"
    "  - complete_task 必须从 active_tasks 中选 matched_task_id (找不到对应 task → 不产出 complete_task, 改判 create_task 已完成)\n"
    "  - source_message_id 必须是 target_messages 中某条的 message_id, 表示意图来源\n"
    "  - reasoning 一句中文解释 (≤40 字)\n\n"
    "输出 schema:\n"
    "{\n"
    '  "intents": [\n'
    "    {\n"
    '      "kind": "create_task" | "complete_task",\n'
    '      "title": "string",\n'
    '      "description": "string|null",\n'
    '      "assignee_name": "string|null",\n'
    '      "due_date": "YYYY-MM-DD|null",\n'
    '      "priority": "low|medium|high|urgent",\n'
    '      "confidence": 0.0,\n'
    '      "matched_task_id": "int|null",\n'
    '      "source_message_id": "string",\n'
    '      "reasoning": "string"\n'
    "    }\n"
    "  ]\n"
    "}"
)


def _call_deepseek(payload: dict[str, Any]) -> dict[str, Any]:
    if not settings.deepseek_api_key:
        raise RuntimeError("DEEPSEEK_API_KEY not configured")
    with httpx.Client(timeout=45) as client:
        r = client.post(
            f"{settings.deepseek_base_url.rstrip('/')}/chat/completions",
            headers={"Authorization": f"Bearer {settings.deepseek_api_key}"},
            json={
                "model": settings.deepseek_model,
                "temperature": 0.1,
                "response_format": {"type": "json_object"},
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
                ],
            },
        )
        r.raise_for_status()
    content = r.json()["choices"][0]["message"]["content"]
    text = content.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    m = re.search(r"\{.*\}", text, flags=re.S)
    if m:
        text = m.group(0)
    return json.loads(text)


def _persist_intents(
    db: Session,
    chat: ProjectChat,
    group: list[ProjectChatMessage],
    context: list[dict[str, Any]],
    raw_intents: list[dict[str, Any]],
    members: list[dict[str, str | None]],
    active_tasks: list[dict[str, Any]],
) -> list[ChatIntentLog]:
    out: list[ChatIntentLog] = []
    target_ids = {m.message_id for m in group}
    context_dump = json.dumps([_format_message_brief(m) for m in group] + context, ensure_ascii=False)[:8000]

    # 给每条 source_message_id 维持 seq 计数
    seq_counter: dict[str, int] = {}
    for item in raw_intents:
        try:
            kind = item.get("kind")
            if kind not in ("create_task", "complete_task"):
                continue
            sid = item.get("source_message_id")
            if sid not in target_ids:
                # 模型可能错引上下文里的 id, 退化为该批最后一条
                sid = group[-1].message_id
            seq_counter[sid] = seq_counter.get(sid, -1) + 1
            seq = seq_counter[sid]
            confidence = float(item.get("confidence") or 0.0)
            if confidence < 0.3:
                continue
            title = (item.get("title") or "").strip()[:200]
            if not title:
                continue
            assignee_raw = item.get("assignee_name")
            assignee_open_id = _resolve_assignee(assignee_raw, members)
            matched_task_id = item.get("matched_task_id")
            if isinstance(matched_task_id, str) and matched_task_id.isdigit():
                matched_task_id = int(matched_task_id)
            if kind == "complete_task" and not matched_task_id:
                matched_task_id = _fuzzy_match_task(title, active_tasks)
            if kind == "complete_task" and not matched_task_id:
                # 明确完成但找不到对应 task → 降为 create+complete 二合一逻辑: 直接记为 create_task 高优先级 done
                # 简化: 跳过此 intent, 改在 source 里转 create_task
                kind = "create_task"
            due_date = None
            if item.get("due_date"):
                try:
                    due_date = datetime.fromisoformat(str(item["due_date"]))
                except ValueError:
                    due_date = None
            priority = item.get("priority")
            if priority not in ("low", "medium", "high", "urgent"):
                priority = "medium"

            # 自动落地阈值; 但 assignee 解析失败 → 强降 pending
            status = "pending"
            if confidence >= CONFIDENCE_AUTO and (kind == "complete_task" or assignee_open_id):
                status = "auto_applied"
            elif confidence < CONFIDENCE_PENDING:
                # 留 trace 但不参与审批
                status = "rejected"

            row = ChatIntentLog(
                project_chat_id=chat.project_chat_id,
                project_id=chat.project_id,
                source_message_id=sid,
                intent_seq=seq,
                intent_kind=kind,
                status=status,
                confidence=confidence,
                title=title,
                description=(item.get("description") or "")[:2000] or None,
                assignee_name_raw=assignee_raw,
                assignee_open_id=assignee_open_id,
                due_date=due_date,
                priority=priority,
                matched_task_id=matched_task_id if isinstance(matched_task_id, int) else None,
                reasoning=(item.get("reasoning") or "")[:500] or None,
                context_window_json=context_dump,
                model_name=settings.deepseek_model,
            )
            db.add(row)
            out.append(row)
        except Exception as exc:
            log.warning("persist intent failed: %s item=%s", exc, str(item)[:200])
    db.flush()
    return out


def extract_intents(
    db: Session,
    chat: ProjectChat,
    *,
    limit: int = 60,
    since_minutes: int | None = None,
) -> dict[str, Any]:
    """对一个群聊跑一次抽取. 返回统计.

    Args:
      limit: 最多处理多少条未处理消息
      since_minutes: 只看最近 N 分钟内的消息 (None = 全部历史)
    """
    q = select(ProjectChatMessage).where(
        ProjectChatMessage.project_chat_id == chat.project_chat_id,
        ProjectChatMessage.msg_type == "text",
        ProjectChatMessage.deleted == False,
    )
    if since_minutes:
        cutoff = datetime.utcnow() - timedelta(minutes=since_minutes)
        q = q.where(ProjectChatMessage.message_created_at >= cutoff)
    q = q.order_by(ProjectChatMessage.message_created_at.asc()).limit(limit * 3)
    candidates = list(db.execute(q).scalars().all())
    if not candidates:
        return {"processed": 0, "intents": 0, "groups": 0}

    msg_ids = [m.message_id for m in candidates]
    done = _processed_ids(db, chat.project_chat_id, msg_ids)
    new_msgs = [m for m in candidates if m.message_id not in done]
    if not new_msgs:
        return {"processed": 0, "intents": 0, "groups": 0}
    new_msgs = new_msgs[:limit]

    members = _candidate_members(db)
    active_tasks = _active_tasks_brief(db, chat.project_id)
    groups = _group_messages(new_msgs)
    total_intents = 0
    auto_applied = 0
    pending = 0

    for group in groups:
        # 跳过纯系统消息 (只有 @ 引用变更记录的)
        if all(not _clean_html_lite(_extract_text(m.content)).strip() for m in group):
            continue
        context = _build_context(db, chat, group)
        payload = {
            "current_time": datetime.utcnow().isoformat(),
            "project_name": (db.get(Project, chat.project_id) or Project()).name if chat.project_id else "",
            "chat_name": chat.chat_name or chat.chat_id,
            "candidate_members": [{"name": m.get("name"), "department": m.get("department")} for m in members],
            "active_tasks": active_tasks,
            "context_messages": context,
            "target_messages": [_format_message_brief(m) for m in group],
        }
        try:
            response = _call_deepseek(payload)
        except Exception as exc:
            log.warning("deepseek extract failed group=%d: %s", len(group), exc)
            # 给该批每条消息写一条 rejected, 防止下次重试
            for m in group:
                db.add(ChatIntentLog(
                    project_chat_id=chat.project_chat_id,
                    project_id=chat.project_id,
                    source_message_id=m.message_id,
                    intent_seq=0,
                    intent_kind="noop",
                    status="rejected",
                    confidence=0.0,
                    reasoning=f"deepseek_failed: {type(exc).__name__}",
                    model_name=settings.deepseek_model,
                ))
            db.flush()
            continue

        raw_intents = response.get("intents") or []
        rows = _persist_intents(db, chat, group, context, raw_intents, members, active_tasks)
        total_intents += len(rows)
        for r in rows:
            if r.status == "auto_applied":
                auto_applied += 1
            elif r.status == "pending":
                pending += 1

        # 为该批中没产出 intent 的消息也补 noop, 保证幂等不重复跑
        produced_sources = {r.source_message_id for r in rows}
        for m in group:
            if m.message_id in produced_sources:
                continue
            db.add(ChatIntentLog(
                project_chat_id=chat.project_chat_id,
                project_id=chat.project_id,
                source_message_id=m.message_id,
                intent_seq=0,
                intent_kind="noop",
                status="rejected",
                confidence=0.0,
                reasoning="no_intent",
                model_name=settings.deepseek_model,
            ))
        db.flush()

    db.commit()
    return {
        "processed": len(new_msgs),
        "groups": len(groups),
        "intents": total_intents,
        "auto_applied": auto_applied,
        "pending": pending,
    }


def apply_intent(db: Session, intent: ChatIntentLog, actor_open_id: str) -> ChatIntentLog:
    """把一条 intent 落地为 Task 或更新已有 Task + 写 ProjectLog."""
    if intent.status in ("applied", "auto_applied", "cancelled"):
        # auto_applied 也复用此函数完成实际落地 (status 已是 auto_applied)
        if intent.applied_task_id:
            return intent
    project = db.get(Project, intent.project_id)

    if intent.intent_kind == "create_task":
        task = Task(
            project_id=intent.project_id,
            title=intent.title or "(no title)",
            description=intent.description,
            priority=intent.priority or "medium",
            assignee_open_id=intent.assignee_open_id,
            due_date=intent.due_date,
            created_by=actor_open_id,
            status="todo",
        )
        db.add(task)
        db.flush()
        plog = ProjectLog(
            project_id=intent.project_id,
            actor_open_id=actor_open_id,
            kind="note",
            status="recorded",
            title=f"群聊抽取: 新任务「{task.title}」",
            body=(f"AI 从群聊抽取: {intent.reasoning or ''}\n"
                  f"指派: {intent.assignee_name_raw or '未指派'}\n"
                  f"置信度: {intent.confidence:.2f}\n"
                  f"来源消息: {intent.source_message_id}"),
        )
        db.add(plog)
        db.flush()
        intent.applied_task_id = task.task_id
        intent.applied_log_id = plog.log_id

    elif intent.intent_kind == "complete_task" and intent.matched_task_id:
        task = db.get(Task, intent.matched_task_id)
        if task and task.status != "done":
            task.status = "done"
            task.completed_at = datetime.utcnow()
        plog = ProjectLog(
            project_id=intent.project_id,
            actor_open_id=actor_open_id,
            kind="note",
            status="recorded",
            title=f"群聊抽取: 任务完成「{intent.title}」",
            body=(f"AI 从群聊抽取: {intent.reasoning or ''}\n"
                  f"置信度: {intent.confidence:.2f}\n"
                  f"来源消息: {intent.source_message_id}"),
        )
        db.add(plog)
        db.flush()
        intent.applied_task_id = intent.matched_task_id
        intent.applied_log_id = plog.log_id

    if intent.status != "auto_applied":
        intent.status = "applied"
    intent.applied_at = datetime.utcnow()
    intent.reviewer_open_id = actor_open_id
    db.commit()
    return intent


def apply_auto_intents(db: Session, chat: ProjectChat, actor_open_id: str) -> int:
    """把当前 chat 下所有 status=auto_applied 但还没落地的意图执行.

    create_task: 直接落地 (建任务).
    complete_task: 不直接落地, 发实时校验卡到群里, 等用户点确认.
    """
    rows = db.execute(
        select(ChatIntentLog).where(
            ChatIntentLog.project_chat_id == chat.project_chat_id,
            ChatIntentLog.status == "auto_applied",
            ChatIntentLog.applied_task_id.is_(None),
        )
    ).scalars().all()
    n = 0
    for r in rows:
        try:
            if r.intent_kind == "complete_task":
                # 改派给 chat_cards 发卡, 等用户点确认才真完成
                from .chat_cards import send_completion_confirm_card
                from app.models import Task
                if r.matched_task_id:
                    task = db.get(Task, r.matched_task_id)
                    if task:
                        send_completion_confirm_card(db, chat, task, r)
                # 不计入 n, 保持 status=auto_applied 直到用户点确认才 -> applied
                continue
            apply_intent(db, r, actor_open_id)
            n += 1
        except Exception as exc:
            log.warning("auto apply failed intent=%s: %s", r.chat_intent_id, exc)
    return n
