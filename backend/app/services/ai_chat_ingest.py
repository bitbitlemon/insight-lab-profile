from __future__ import annotations

import json
import logging
import os
import re
import subprocess
import hashlib
from dataclasses import dataclass
from datetime import datetime
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import AIChatSubmission, LarkDocWatch, Member, Project, ProjectLog, ProjectMember, Task
from app.services.lark_im import send_text

LARK_CLI = "/usr/local/bin/lark-cli"
LARK_FILE_DOWNLOAD_DIR = Path("/tmp/insight-lab-profile-lark-files")
SUPPORTED_TEXT_FILE_SUFFIXES = {".txt", ".md", ".markdown"}
MAX_TEXT_FILE_BYTES = 1_000_000
MAX_LARK_DOC_TEXT_CHARS = 20_000
LLM_PROJECT_CANDIDATE_LIMIT = 12
LLM_TASK_CANDIDATE_LIMIT = 8
LLM_TEXT_LIMIT = 6000
LLM_TEXT_HEAD_LIMIT = 3200
LLM_TEXT_TAIL_LIMIT = 2200
LLM_SIGNAL_LINE_LIMIT = 18

log = logging.getLogger(__name__)


STAGE_LABELS = {
    "idea": "想法/需求",
    "planning": "规划/拆解",
    "research": "调研",
    "implementation": "实现/实验",
    "integration": "联调/验证",
    "review": "评审/修改",
    "delivery": "交付/提交",
    "reflection": "复盘/沉淀",
}


@dataclass
class ProjectMatch:
    project: Project | None
    task: Task | None
    confidence: float
    reasons: list[str]


@dataclass
class LarkTextFileAttachment:
    file_key: str
    file_name: str
    message_id: str


@dataclass
class RefinedAiChat:
    project_id: int | None
    task_id: int | None
    confidence: float
    stage: str
    log_type: str
    summary: str
    sections: dict[str, list[str]]
    reasoning: str


def extract_lark_message_text(payload: dict[str, Any]) -> str:
    content = _message_content(payload)
    if isinstance(content, dict):
        text = content.get("text") or content.get("content") or ""
        return str(text).strip()
    raw = str(content or "").strip()
    if not raw:
        return ""
    parsed = _loads_json_object(raw)
    if isinstance(parsed, dict):
        return str(parsed.get("text") or parsed.get("content") or "").strip()
    return raw


def extract_lark_text_file_attachment(payload: dict[str, Any]) -> LarkTextFileAttachment | None:
    message_id = extract_lark_message_id(payload)
    content = _message_content(payload)
    parsed = content if isinstance(content, dict) else _loads_json_object(str(content or ""))
    if not isinstance(parsed, dict):
        return None
    file_key = str(
        parsed.get("file_key")
        or parsed.get("fileKey")
        or _deep_get(payload, "event.message.file_key", "message.file_key", "file_key")
        or ""
    ).strip()
    file_name = str(
        parsed.get("file_name")
        or parsed.get("fileName")
        or parsed.get("name")
        or parsed.get("file_name_text")
        or file_key
        or "lark-message-file.txt"
    ).strip()
    if not message_id or not file_key:
        return None
    if Path(file_name).suffix.lower() not in SUPPORTED_TEXT_FILE_SUFFIXES:
        return None
    return LarkTextFileAttachment(file_key=file_key, file_name=file_name, message_id=message_id)


def download_lark_text_file(attachment: LarkTextFileAttachment) -> str:
    LARK_FILE_DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)
    safe_name = _safe_download_name(attachment.file_name)
    output_path = LARK_FILE_DOWNLOAD_DIR / safe_name
    if output_path.exists():
        output_path.unlink()
    result = subprocess.run(
        [
            LARK_CLI,
            "im",
            "+messages-resources-download",
            "--message-id",
            attachment.message_id,
            "--file-key",
            attachment.file_key,
            "--type",
            "file",
            "--output",
            safe_name,
            "--as",
            "bot",
        ],
        cwd=str(LARK_FILE_DOWNLOAD_DIR),
        capture_output=True,
        text=True,
        timeout=45,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip() or "lark file download failed")
    if not output_path.exists():
        raise RuntimeError("lark file download did not create output file")
    if output_path.stat().st_size > MAX_TEXT_FILE_BYTES:
        output_path.unlink(missing_ok=True)
        raise ValueError("uploaded text file is too large")
    try:
        content = output_path.read_text(encoding="utf-8-sig")
    except UnicodeDecodeError:
        content = output_path.read_text(encoding="utf-8", errors="replace")
    finally:
        output_path.unlink(missing_ok=True)
    content = content.strip()
    if not content:
        raise ValueError("uploaded text file is empty")
    return f"文件: {attachment.file_name}\n{content}"


def extract_lark_doc_url(text: str) -> str | None:
    match = re.search(
        r"https://[^\s<>()\"']+?\.feishu\.cn/(?:docx|docs|wiki|doc|mindnotes|base|sheets)/[^\s<>()\"']+",
        text or "",
        flags=re.IGNORECASE,
    )
    if not match:
        return None
    return match.group(0).rstrip("。,.，)")


def fetch_lark_doc_text(doc: str) -> str:
    result = subprocess.run(
        [
            LARK_CLI,
            "docs",
            "+fetch",
            "--doc",
            doc,
            "--as",
            "bot",
            "--format",
            "json",
        ],
        capture_output=True,
        text=True,
        timeout=60,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip() or "lark doc fetch failed")
    try:
        payload = json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise RuntimeError("lark doc fetch returned non-json output") from exc
    if isinstance(payload, dict) and payload.get("ok") is False:
        raise RuntimeError(json.dumps(payload, ensure_ascii=False)[:500])
    body = _extract_lark_doc_body(payload).strip()
    if not body:
        raise ValueError("lark doc has no readable text")
    return f"云文档: {doc}\n{body[:MAX_LARK_DOC_TEXT_CHARS]}"


def extract_lark_sender_open_id(payload: dict[str, Any]) -> str | None:
    value = _deep_get(
        payload,
        "event.sender.sender_id.open_id",
        "event.message.sender.sender_id.open_id",
        "sender.sender_id.open_id",
        "open_id",
    )
    return str(value).strip() if value else None


def extract_lark_message_id(payload: dict[str, Any]) -> str | None:
    value = _deep_get(payload, "event.message.message_id", "message.message_id", "message_id")
    return str(value).strip() if value else None


def extract_lark_chat_id(payload: dict[str, Any]) -> str | None:
    value = _deep_get(payload, "event.message.chat_id", "message.chat_id", "chat_id")
    return str(value).strip() if value else None


def extract_lark_chat_type(payload: dict[str, Any]) -> str | None:
    value = _deep_get(payload, "event.message.chat_type", "message.chat_type", "chat_type")
    return str(value).strip().lower() if value else None


def ingest_ai_chat_submission(
    db: Session,
    *,
    raw_text: str,
    sender_open_id: str | None,
    message_id: str | None = None,
    chat_id: str | None = None,
    source_doc_url: str | None = None,
) -> AIChatSubmission:
    text = raw_text.strip()
    if not text:
        raise ValueError("empty ai chat transcript")
    members = db.execute(select(Member).where(Member.status.in_(("active", "on_leave")))).scalars().all()
    match = match_project(db, text, sender_open_id=sender_open_id)
    source_ai_name = infer_source_ai(text)
    stage = infer_stage(text)
    log_type = infer_log_type(text)
    extracted = extract_record(text, members)
    summary = summarize_text(text)
    try:
        refined = refine_ai_chat_with_llm(db, text, match, source_ai_name, sender_open_id=sender_open_id)
    except TypeError as exc:
        if "sender_open_id" not in str(exc):
            raise
        refined = refine_ai_chat_with_llm(db, text, match, source_ai_name)
    if refined:
        if refined.project_id and not _has_explicit_project_id(text):
            project = db.get(Project, refined.project_id)
            if project:
                task = db.get(Task, refined.task_id) if refined.task_id else None
                if task and task.project_id != project.project_id:
                    task = None
                match = ProjectMatch(
                    project=project,
                    task=task,
                    confidence=refined.confidence,
                    reasons=["llm_refine"],
                )
        stage = refined.stage or stage
        log_type = refined.log_type or log_type
        summary = refined.summary or summary

    status = "pending"
    if match.project and match.confidence >= 0.82:
        status = "auto_archived"
    elif match.project:
        status = "pending"

    submission = AIChatSubmission(
        sender_open_id=sender_open_id,
        message_id=message_id,
        chat_id=chat_id,
        raw_text=text,
        source_ai_name=source_ai_name,
        matched_project_id=match.project.project_id if match.project else None,
        matched_task_id=match.task.task_id if match.task else None,
        confidence=match.confidence,
        stage=stage,
        log_type=log_type,
        summary=summary,
        extracted_json=json.dumps({**extracted, "match_reasons": match.reasons}, ensure_ascii=False),
        status=status,
    )
    db.add(submission)
    db.flush()

    ai_sections = refined.sections if refined else split_transcript_summary(text)

    if match.project:
        log = ProjectLog(
            project_id=match.project.project_id,
            actor_open_id=sender_open_id or match.project.owner_open_id,
            kind="note",
            status="recorded" if status == "auto_archived" else "pending",
            title=build_log_title(source_ai_name, stage, log_type, summary),
            body=build_log_body(
                text,
                summary,
                source_ai_name,
                stage,
                log_type,
                match,
                extracted,
                status,
                ai_sections,
            ),
            resource_type=f"ai_chat:{log_type or 'note'}",
            extra_json=json.dumps({
                "source": "ai_chat_submission",
                "submission_id": submission.submission_id,
                "source_ai_name": source_ai_name,
                "stage": stage,
                "log_type": log_type,
                "confidence": match.confidence,
                "matched_task_id": match.task.task_id if match.task else None,
                "status": status,
                "extracted": extracted,
                "llm_refined": bool(refined),
                "llm_reasoning": refined.reasoning if refined else None,
            }, ensure_ascii=False),
        )
        db.add(log)
        db.flush()
        generated_tasks = create_ai_followup_tasks(
            db,
            project=match.project,
            log=log,
            sections=ai_sections,
            sender_open_id=sender_open_id,
            matched_task=match.task,
        )
        if generated_tasks:
            extra = json.loads(log.extra_json or "{}")
            extra["generated_tasks"] = generated_tasks
            extracted_extra = extra.get("extracted") or {}
            extracted_extra["generated_task_ids"] = [item["task_id"] for item in generated_tasks]
            extra["extracted"] = extracted_extra
            log.extra_json = json.dumps(extra, ensure_ascii=False)
        submission.applied_log_id = log.log_id
    db.commit()
    db.refresh(submission)
    if source_doc_url:
        upsert_lark_doc_watch(db, source_doc_url, submission)
    return submission


def create_ai_followup_tasks(
    db: Session,
    *,
    project: Project,
    log: ProjectLog,
    sections: dict[str, list[str]],
    sender_open_id: str | None,
    matched_task: Task | None = None,
) -> list[dict[str, Any]]:
    candidates = _followup_task_candidates(sections)
    if not candidates:
        return []
    assignee_open_id = _valid_member_open_id(db, sender_open_id) or _valid_member_open_id(db, project.owner_open_id)
    created_by = assignee_open_id or project.owner_open_id
    existing_titles = {
        _normalize(task.title or "")
        for task in db.execute(
            select(Task)
            .where(Task.project_id == project.project_id, Task.status.in_(("todo", "in_progress", "blocked")))
            .order_by(Task.updated_at.desc())
            .limit(120)
        ).scalars().all()
    }
    generated: list[dict[str, Any]] = []
    for candidate in candidates:
        title = _ai_followup_task_title(candidate["kind"], candidate["text"])
        if not title:
            continue
        normalized = _normalize(title)
        if not normalized or normalized in existing_titles:
            continue
        task = Task(
            project_id=project.project_id,
            parent_task_id=matched_task.task_id if matched_task else None,
            title=title,
            description="\n".join([
                f"来自项目日志 #{log.log_id} 的 AI 提炼。",
                f"类型: {candidate['label']}",
                f"原文: {candidate['text']}",
            ]),
            status="todo",
            priority="high" if candidate["kind"] == "risk" else "medium",
            assignee_open_id=assignee_open_id,
            thinking=f"先确认该项是否仍有效，再补充处理方案。来源日志 #{log.log_id}。",
            task_origin="ai_chat",
            created_by=created_by,
        )
        db.add(task)
        db.flush()
        existing_titles.add(normalized)
        generated.append({
            "task_id": task.task_id,
            "title": task.title,
            "kind": candidate["kind"],
            "label": candidate["label"],
            "source_text": candidate["text"],
            "priority": task.priority,
            "status": task.status,
        })
        if len(generated) >= 6:
            break
    return generated


def _followup_task_candidates(sections: dict[str, list[str]]) -> list[dict[str, str]]:
    candidates: list[dict[str, str]] = []
    seen: set[str] = set()
    for kind, label, values in [
        ("risk", "风险", sections.get("risks") or []),
        ("action", "后续动作", sections.get("actions") or []),
        ("confirmation", "待确认", [value for value in (sections.get("decisions") or []) if _needs_confirmation_task(value)]),
    ]:
        for value in values:
            if not _is_important_unresolved_task_text(kind, value):
                continue
            text = _short_text(_clean_summary_chunk(value), 72)
            key = _normalize(f"{kind}:{text}")
            if not text or key in seen:
                continue
            seen.add(key)
            candidates.append({"kind": kind, "label": label, "text": text})
            if len(candidates) >= 4:
                return candidates
    return candidates


def _needs_confirmation_task(text: str) -> bool:
    value = text or ""
    return any(word in value for word in ("待确认", "需要确认", "未确认", "等待确认", "需确认"))


def _is_important_unresolved_task_text(kind: str, text: str) -> bool:
    value = text or ""
    if not value or _is_resolved_text(value):
        return False
    if kind == "risk":
        return is_strict_risk_text(value) and _has_unresolved_marker(value)
    if kind == "action":
        return is_strict_risk_text(value) and _has_unresolved_marker(value)
    if kind == "confirmation":
        return _needs_confirmation_task(value) and _has_unresolved_marker(value) and is_strict_risk_text(value)
    return False


def _is_resolved_text(text: str) -> bool:
    value = text or ""
    lower = value.lower()
    return any(word in value for word in (
        "已解决", "已经解决", "已修复", "已经修复", "已完成", "完成验证", "验证通过",
        "已验证", "已处理", "处理完", "已优化", "已经优化", "已上线", "不再需要",
    )) or any(word in lower for word in ("resolved", "fixed", "done", "verified"))


def _has_unresolved_marker(text: str) -> bool:
    value = text or ""
    lower = value.lower()
    return any(word in value for word in (
        "未解决", "未修复", "未完成", "未处理", "待处理", "待修复", "待确认", "需要处理",
        "需要修复", "需要补充", "需要确认", "还没", "仍需", "尚未", "阻塞", "卡住",
        "卡死", "无法", "不能", "不可用", "失败", "报错", "错误", "异常", "超时",
        "延期", "延误", "回滚", "紧急",
    )) or any(word in lower for word in ("todo", "blocked", "blocker", "unresolved", "pending", "failed", "timeout", "error"))


def _ai_followup_task_title(kind: str, text: str) -> str:
    prefix = {"risk": "处理风险", "action": "跟进", "confirmation": "确认"}.get(kind, "跟进")
    clean = _task_title_text(text, kind=kind)
    if not clean:
        return ""
    return _short_text(f"{prefix}: {clean}", 42)


def _task_title_text(text: str, kind: str = "action") -> str:
    cleaned = re.sub(r"<[^>]+>", " ", text or "")
    cleaned = re.sub(r"https?://[^\s]+", " ", cleaned)
    cleaned = re.sub(r"//[^\s]+", " ", cleaned)
    cleaned = re.sub(r"#+\s*", " ", cleaned)
    cleaned = re.sub(r"`([^`]+)`", r"\1", cleaned)
    cleaned = re.sub(r"\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}", " ", cleaned)
    cleaned = re.sub(r"(?:ou|oc|om|cli)_[a-zA-Z0-9_]+", " ", cleaned)
    cleaned = re.sub(r"[\u4e00-\u9fa5A-Za-z0-9_]{1,12}[:：]\s*", " ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" -:：;；，,。")
    lower = cleaned.lower()
    if not cleaned or len(cleaned) < 6 or re.fullmatch(r"[\d\s<>{}\[\]().,，。:：;；…a-zA-Z_-]+", cleaned):
        return ""
    summary_rules: list[tuple[tuple[str, ...], str]] = [
        (("登录失效", "卡死"), "修复登录失效后的卡死问题"),
        (("上传", "超时"), "修复训练图片上传超时问题"),
        (("字段错误",), "修复训练开始字段错误"),
        (("批注", "补充"), "确认论文批注并补充修改意见"),
        (("流程连接符",), "检查并修正文档流程连接符"),
        (("流程串联",), "修正文档流程串联表达"),
        (("词—词—词",), "检查并修正文档连接符格式"),
        (("PowerShell", "临时脚本"), "改用脚本处理文档格式替换"),
        (("旧版本待删",), "归档旧版本文件"),
        (("LibreOffice", "渲染"), "完成文档渲染版面检查"),
        (("历史日志", "人工清理"), "清理历史自动生成任务"),
        (("自动生成策略", "过细"), "优化 AI 任务生成粒度"),
        (("批量确认", "AI生成任务"), "增加 AI 生成任务批量确认"),
        (("AI提炼", "自动转任务"), "确认 AI 提炼转任务规则"),
        (("风险", "待确认", "后续动作", "日志正文"), "将 AI 提炼事项自动转为可处理任务"),
        (("小卷", "归档", "群聊边界"), "完善小卷归档和群聊边界"),
        (("群聊", "后台静默项目证据源"), "明确群聊只作为后台证据源"),
        (("小卷私聊", "主动录入入口"), "明确小卷私聊作为主动归档入口"),
        (("纯知识沉淀", "普通进展", "不自动转任务"), "明确普通进展不自动生成任务"),
        (("负责人分配",), "优化项目负责人分配逻辑"),
        (("复位物品",), "评估是否增加复位物品按钮"),
        (("开发类项目", "需求确认"), "确认开发类项目流程节点显示"),
        (("direct effect",), "调整论文 direct effect 表述"),
        (("正式扩写版.docx",), "整理申报文档根目录文件"),
        (("身份证", "自动建号"), "验证训练系统账号匹配和建号逻辑"),
        (("云实验室", "提示"), "优化云实验室提示文案"),
        (("小卷更新测评邀请",), "收集小卷更新测评反馈"),
        (("沈洁", "黄坤"), "补录缺失成员信息"),
        (("基础规范", "文字层面"), "补充论文基础规范修改意见"),
        (("编码很古老",), "评估旧代码质量问题"),
    ]
    for words, summary in summary_rules:
        if all(word.lower() in lower or word in cleaned for word in words):
            return summary
    if any(marker in cleaned for marker in ("我没", "登方乔的", "ccm_open_type", "<f", "1 <")):
        return ""
    if kind == "confirmation" and any(word in cleaned for word in ("是否", "能否", "合适", "确认")):
        return _short_text(cleaned, 30)
    if any(word in cleaned for word in ("完成", "修复", "优化", "增加", "补充", "整理", "验证", "确认", "清理", "处理")):
        return _short_text(cleaned, 30)
    return _short_text(cleaned, 24) if len(cleaned) >= 10 else ""


def _valid_member_open_id(db: Session, open_id: str | None) -> str | None:
    if not open_id:
        return None
    return open_id if db.get(Member, open_id) else None


def upsert_lark_doc_watch(db: Session, doc_url: str, submission: AIChatSubmission) -> LarkDocWatch | None:
    if not submission.matched_project_id:
        return None
    watch = db.execute(select(LarkDocWatch).where(LarkDocWatch.doc_url == doc_url)).scalar_one_or_none()
    if not watch:
        watch = LarkDocWatch(doc_url=doc_url)
        db.add(watch)
    watch.sender_open_id = submission.sender_open_id
    watch.chat_id = submission.chat_id
    watch.matched_project_id = submission.matched_project_id
    watch.matched_task_id = submission.matched_task_id
    watch.last_content_hash = _content_hash(submission.raw_text)
    watch.last_submission_id = submission.submission_id
    watch.status = "active"
    watch.last_error = None
    watch.last_checked_at = datetime.utcnow()
    db.commit()
    db.refresh(watch)
    return watch


def sync_lark_doc_watches(db: Session, *, limit: int = 20) -> dict[str, int]:
    watches = db.execute(
        select(LarkDocWatch)
        .where(LarkDocWatch.status.in_(("active", "error")))
        .order_by(LarkDocWatch.updated_at.asc())
        .limit(limit)
    ).scalars().all()
    checked = updated = errors = 0
    for watch in watches:
        checked += 1
        try:
            text = fetch_lark_doc_text(watch.doc_url)
            content_hash = _content_hash(text)
            watch.last_checked_at = datetime.utcnow()
            if content_hash == watch.last_content_hash:
                watch.status = "active"
                watch.last_error = None
                continue
            previous_submission = db.get(AIChatSubmission, watch.last_submission_id) if watch.last_submission_id else None
            delta_text = build_incremental_doc_submission(
                previous_text=previous_submission.raw_text if previous_submission else None,
                current_text=text,
                project_id=watch.matched_project_id,
            )
            if not delta_text:
                watch.last_content_hash = content_hash
                watch.status = "active"
                watch.last_error = None
                continue
            submission = ingest_ai_chat_submission(
                db,
                raw_text=delta_text,
                sender_open_id=watch.sender_open_id,
                message_id=f"lark_doc_watch:{watch.watch_id}",
                chat_id=watch.chat_id,
                source_doc_url=watch.doc_url,
            )
            watch.last_content_hash = content_hash
            watch.last_submission_id = submission.submission_id
            watch.matched_project_id = submission.matched_project_id or watch.matched_project_id
            watch.matched_task_id = submission.matched_task_id or watch.matched_task_id
            watch.status = "active"
            watch.last_error = None
            updated += 1
            _send_archive_feedback(db, submission)
        except Exception as exc:
            watch.status = "error"
            watch.last_error = str(exc)[:500]
            watch.last_checked_at = datetime.utcnow()
            errors += 1
        finally:
            db.commit()
    return {"checked": checked, "updated": updated, "errors": errors}


def _send_archive_feedback(db: Session, submission: AIChatSubmission) -> None:
    if not submission or not submission.applied_log_id or not submission.matched_project_id:
        return
    project = db.get(Project, submission.matched_project_id)
    project_name = project.name if project else f"项目 {submission.matched_project_id}"
    stage = submission.stage or "未识别节点"
    summary = _short_text(submission.summary or "已生成项目日志", 36)
    text = "\n".join([
        "已录入项目日志",
        f"项目: {project_name}",
        f"节点: {stage}",
        f"摘要: {summary}",
        f"日志ID: {submission.applied_log_id}",
    ])
    key = f"ai-chat-archive-{submission.submission_id}"
    if submission.sender_open_id:
        send_text(submission.sender_open_id, text, idempotency_key=key)


def refine_ai_chat_with_llm(
    db: Session,
    text: str,
    rule_match: ProjectMatch,
    source_ai_name: str | None,
    sender_open_id: str | None = None,
) -> RefinedAiChat | None:
    if not settings.deepseek_api_key:
        return None
    candidates = _llm_project_candidates(db, text, rule_match, sender_open_id=sender_open_id)
    if not candidates:
        return None
    payload = {
        "current_time": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "source_ai_name": source_ai_name,
        "sender_context": _sender_project_context(db, sender_open_id),
        "rule_match": {
            "project_id": rule_match.project.project_id if rule_match.project else None,
            "task_id": rule_match.task.task_id if rule_match.task else None,
            "confidence": rule_match.confidence,
            "reasons": rule_match.reasons,
        },
        "explicit_project_id_locked": _has_explicit_project_id(text),
        "candidate_projects": candidates,
        "transcript": _build_llm_transcript(text),
    }
    try:
        data = _call_deepseek_ai_chat_refine(payload)
        return _parse_refined_ai_chat(data, candidates)
    except Exception as exc:
        log.warning("ai chat llm refine failed: %s", exc)
        return None


AI_CHAT_REFINE_SYSTEM_PROMPT = (
    "你是实验室项目日志归档助手。给定一段 AI 聊天记录和候选项目/任务，完成二次精炼。\n"
    "要求：\n"
    "1. project_id 必须从 candidate_projects 中选择；无法判断则给 null。\n"
    "2. 如果 explicit_project_id_locked=true，不要改 rule_match.project_id。\n"
    "3. task_id 必须从所选项目的 tasks 中选择；无法判断则 null。\n"
    "4. 只输出严格 JSON，不要 markdown。\n"
    "5. summary <= 45 字；每个 sections 数组最多 2 条；每条 <= 40 字。\n"
    "6. sections 只记录重要过程，不要复制原文，不要长段解释。\n"
    "7. stage 只能是 idea/planning/research/implementation/integration/review/delivery/reflection。\n"
    "8. log_type 只能是 progress/decision/risk/knowledge/reflection。\n"
    "9. 先理解文档/对话在说什么业务，再判断归属，不要只靠关键词字面命中。\n"
    "10. sender_context 里的项目是发件人负责或参与的项目，应优先考虑，但不是强制。\n"
    "11. transcript 可能包含 head/tail/signals，要综合判断，不要只看开头。\n"
    "输出 schema: {\"project_id\":int|null,\"task_id\":int|null,\"confidence\":0.0,"
    "\"stage\":\"implementation\",\"log_type\":\"progress\",\"summary\":\"string\","
    "\"sections\":{\"progress\":[],\"decisions\":[],\"risks\":[],\"actions\":[],\"knowledge\":[]},"
    "\"reasoning\":\"<=30字\"}"
)


def _call_deepseek_ai_chat_refine(payload: dict[str, Any]) -> dict[str, Any]:
    with httpx.Client(timeout=45) as client:
        response = client.post(
            f"{settings.deepseek_base_url.rstrip('/')}/chat/completions",
            headers={"Authorization": f"Bearer {settings.deepseek_api_key}"},
            json={
                "model": settings.deepseek_model,
                "temperature": 0.1,
                "response_format": {"type": "json_object"},
                "messages": [
                    {"role": "system", "content": AI_CHAT_REFINE_SYSTEM_PROMPT},
                    {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
                ],
            },
        )
        response.raise_for_status()
    content = response.json()["choices"][0]["message"]["content"]
    text = content.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    match = re.search(r"\{.*\}", text, flags=re.S)
    if match:
        text = match.group(0)
    return json.loads(text)


def match_project(db: Session, text: str, sender_open_id: str | None = None) -> ProjectMatch:
    explicit = re.search(r"(?:project|项目)\s*[:：#]\s*(\d+)", text, flags=re.IGNORECASE)
    if explicit:
        project = db.get(Project, int(explicit.group(1)))
        if project:
            task = _best_task_for_project(db, project.project_id, text)
            return ProjectMatch(project=project, task=task, confidence=0.98, reasons=["explicit_project_id"])

    projects = db.execute(
        select(Project).where(Project.status.in_(("planning", "active", "paused"))).order_by(Project.updated_at.desc()).limit(200)
    ).scalars().all()
    best_project: Project | None = None
    best_score = 0.0
    best_reasons: list[str] = []
    normalized_text = _normalize(text)
    sender_project_ids = _sender_project_ids(db, sender_open_id)
    for project in projects:
        score = 0.0
        reasons: list[str] = []
        project_name = project.name or ""
        if project_name and project_name in text:
            score += 0.55
            reasons.append("project_name")
        score += 0.2 * SequenceMatcher(None, _normalize(project_name), normalized_text[: max(40, len(_normalize(project_name)))]).ratio()
        tags = [tag.strip() for tag in (project.tags or "").split(",") if tag.strip()]
        matched_tags = [tag for tag in tags if tag and tag in text]
        if matched_tags:
            score += min(0.2, 0.06 * len(matched_tags))
            reasons.append("project_tags")
        if project.description:
            tokens = _keywords(project.description)
            hits = [token for token in tokens if token in text]
            if hits:
                score += min(0.18, 0.04 * len(hits))
                reasons.append("project_description")
        task = _best_task_for_project(db, project.project_id, text)
        if task:
            score += 0.25
            reasons.append("task_title")
        if project.project_id in sender_project_ids:
            score += 0.22
            reasons.append("sender_project")
        if score > best_score:
            best_project = project
            best_score = score
            best_reasons = reasons
    minimum_score = 0.28 if "sender_project" in best_reasons else 0.35
    if not best_project or best_score < minimum_score:
        return ProjectMatch(project=None, task=None, confidence=min(best_score, 0.34), reasons=best_reasons)
    return ProjectMatch(
        project=best_project,
        task=_best_task_for_project(db, best_project.project_id, text),
        confidence=min(best_score, 0.95),
        reasons=best_reasons,
    )


def _llm_project_candidates(
    db: Session,
    text: str,
    rule_match: ProjectMatch,
    sender_open_id: str | None = None,
) -> list[dict[str, Any]]:
    projects = db.execute(
        select(Project).where(Project.status.in_(("planning", "active", "paused"))).order_by(Project.updated_at.desc()).limit(80)
    ).scalars().all()
    scored: list[tuple[float, Project]] = []
    normalized = _normalize(text)
    sender_project_ids = _sender_project_ids(db, sender_open_id)
    for project in projects:
        score = 0.0
        if rule_match.project and project.project_id == rule_match.project.project_id:
            score += 1.0
        if project.name and project.name in text:
            score += 0.6
        score += 0.18 * SequenceMatcher(None, _normalize(project.name or ""), normalized[:80]).ratio()
        tags = [tag.strip() for tag in (project.tags or "").split(",") if tag.strip()]
        score += min(0.24, 0.06 * len([tag for tag in tags if tag in text]))
        for token in _keywords(project.description or ""):
            if token in text:
                score += 0.03
        if _best_task_for_project(db, project.project_id, text):
            score += 0.25
        if project.project_id in sender_project_ids:
            score += 0.28
        if score > 0.08:
            scored.append((score, project))
    scored.sort(key=lambda item: item[0], reverse=True)
    out: list[dict[str, Any]] = []
    seen: set[int] = set()
    sender_projects = {project.project_id: project for project in projects if project.project_id in sender_project_ids}
    for project_id in sorted(sender_projects):
        project = sender_projects[project_id]
        if project.project_id in seen:
            continue
        seen.add(project.project_id)
        out.append({
            "project_id": project.project_id,
            "name": project.name,
            "status": project.status,
            "tags": project.tags,
            "description": _short_text(project.description or "", 160),
            "tasks": _llm_task_candidates(db, project.project_id),
        })
    for _, project in scored[:LLM_PROJECT_CANDIDATE_LIMIT]:
        if project.project_id in seen:
            continue
        seen.add(project.project_id)
        out.append({
            "project_id": project.project_id,
            "name": project.name,
            "status": project.status,
            "tags": project.tags,
            "description": _short_text(project.description or "", 160),
            "tasks": _llm_task_candidates(db, project.project_id),
        })
    if rule_match.project and rule_match.project.project_id not in seen:
        project = rule_match.project
        out.insert(0, {
            "project_id": project.project_id,
            "name": project.name,
            "status": project.status,
            "tags": project.tags,
            "description": _short_text(project.description or "", 160),
            "tasks": _llm_task_candidates(db, project.project_id),
        })
    return out[:LLM_PROJECT_CANDIDATE_LIMIT]


def _llm_task_candidates(db: Session, project_id: int) -> list[dict[str, Any]]:
    tasks = db.execute(
        select(Task).where(Task.project_id == project_id).order_by(Task.updated_at.desc()).limit(LLM_TASK_CANDIDATE_LIMIT)
    ).scalars().all()
    return [
        {
            "task_id": task.task_id,
            "title": task.title,
            "status": task.status,
            "due_date": task.due_date.isoformat() if task.due_date else None,
        }
        for task in tasks
    ]


def _sender_project_ids(db: Session, sender_open_id: str | None) -> set[int]:
    if not sender_open_id:
        return set()
    owned = db.execute(
        select(Project.project_id).where(
            Project.owner_open_id == sender_open_id,
            Project.status.in_(("planning", "active", "paused")),
        )
    ).scalars().all()
    joined = db.execute(
        select(ProjectMember.project_id).where(ProjectMember.member_open_id == sender_open_id)
    ).scalars().all()
    return {int(project_id) for project_id in [*owned, *joined] if project_id is not None}


def _sender_project_context(db: Session, sender_open_id: str | None) -> list[dict[str, Any]]:
    if not sender_open_id:
        return []
    project_ids = _sender_project_ids(db, sender_open_id)
    if not project_ids:
        return []
    projects = db.execute(
        select(Project)
        .where(Project.project_id.in_(project_ids))
        .order_by(Project.updated_at.desc())
        .limit(12)
    ).scalars().all()
    return [
        {
            "project_id": project.project_id,
            "name": project.name,
            "status": project.status,
            "tags": project.tags,
            "description": _short_text(project.description or "", 140),
        }
        for project in projects
    ]


def _build_llm_transcript(text: str) -> dict[str, Any]:
    compact = (text or "").strip()
    if len(compact) <= LLM_TEXT_LIMIT:
        return {
            "excerpt": compact,
            "head": compact,
            "tail": compact,
            "signals": _signal_lines(compact),
        }
    head = compact[:LLM_TEXT_HEAD_LIMIT].strip()
    tail = compact[-LLM_TEXT_TAIL_LIMIT :].strip()
    signal_lines = _signal_lines(compact)
    excerpt = "\n\n".join(
        part for part in [
            "[HEAD]\n" + head if head else "",
            "[SIGNALS]\n" + "\n".join(signal_lines) if signal_lines else "",
            "[TAIL]\n" + tail if tail else "",
        ]
        if part
    )
    return {
        "excerpt": excerpt[: max(LLM_TEXT_LIMIT, len(excerpt))],
        "head": head,
        "tail": tail,
        "signals": signal_lines,
    }


def _signal_lines(text: str) -> list[str]:
    lines: list[str] = []
    seen: set[str] = set()
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if len(line) < 6:
            continue
        lower = line.lower()
        if not any(
            needle in lower or needle in line
            for needle in (
                "project:",
                "项目",
                "任务",
                "阶段",
                "里程碑",
                "决定",
                "确认",
                "完成",
                "上线",
                "交付",
                "联调",
                "测试",
                "申报",
                "附件",
                "客户",
                "接口",
                "文档",
            )
        ):
            continue
        normalized = re.sub(r"\s+", " ", line)
        if normalized in seen:
            continue
        seen.add(normalized)
        lines.append(normalized[:160])
        if len(lines) >= LLM_SIGNAL_LINE_LIMIT:
            break
    return lines


def _parse_refined_ai_chat(data: dict[str, Any], candidates: list[dict[str, Any]]) -> RefinedAiChat | None:
    candidate_project_ids = {int(item["project_id"]) for item in candidates if item.get("project_id") is not None}
    candidate_task_ids: set[int] = set()
    for project in candidates:
        for task in project.get("tasks") or []:
            if task.get("task_id") is not None:
                candidate_task_ids.add(int(task["task_id"]))
    project_id = _optional_int(data.get("project_id"))
    if project_id is not None and project_id not in candidate_project_ids:
        project_id = None
    task_id = _optional_int(data.get("task_id"))
    if task_id is not None and task_id not in candidate_task_ids:
        task_id = None
    stage = str(data.get("stage") or "implementation")
    if stage not in STAGE_LABELS:
        stage = "implementation"
    log_type = str(data.get("log_type") or "progress")
    if log_type not in {"progress", "decision", "risk", "knowledge", "reflection"}:
        log_type = "progress"
    raw_sections = data.get("sections") if isinstance(data.get("sections"), dict) else {}
    sections = {
        "progress": _short_list(raw_sections.get("progress")),
        "decisions": _short_list(raw_sections.get("decisions")),
        "risks": [item for item in _short_list(raw_sections.get("risks")) if is_strict_risk_text(item)],
        "actions": _short_list(raw_sections.get("actions")),
        "knowledge": _short_list(raw_sections.get("knowledge")),
    }
    if log_type == "risk" and not sections["risks"]:
        log_type = "progress"
    summary = _short_text(str(data.get("summary") or ""), 64)
    if not summary and any(sections.values()):
        summary = next(item for values in sections.values() for item in values if item)
    if not summary:
        return None
    confidence = max(0.0, min(float(data.get("confidence") or 0.0), 0.99))
    return RefinedAiChat(
        project_id=project_id,
        task_id=task_id,
        confidence=confidence,
        stage=stage,
        log_type=log_type,
        summary=summary,
        sections=sections,
        reasoning=_short_text(str(data.get("reasoning") or ""), 40),
    )


def _optional_int(value: Any) -> int | None:
    if value in (None, ""):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _short_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    out: list[str] = []
    for item in value[:2]:
        text = _short_text(str(item or ""), 52)
        if text:
            out.append(text)
    return out


def _content_hash(text: str) -> str:
    return hashlib.sha256((text or "").encode("utf-8")).hexdigest()


def build_incremental_doc_submission(
    *,
    previous_text: str | None,
    current_text: str,
    project_id: int | None = None,
) -> str | None:
    current_header, current_body = _split_doc_submission(current_text)
    current_body = current_body.strip()
    if not current_body:
        return None
    if not previous_text:
        return current_text.strip()

    _, previous_body = _split_doc_submission(previous_text)
    previous_body = previous_body.strip()
    if not previous_body:
        return current_text.strip()
    if current_body == previous_body:
        return None

    delta_body = ""
    if current_body.startswith(previous_body):
        delta_body = current_body[len(previous_body):].strip()
    else:
        delta_lines = _added_lines(previous_body, current_body)
        delta_body = "\n".join(delta_lines).strip()
    if not delta_body:
        return None

    lines: list[str] = []
    if current_header:
        lines.append(current_header)
    if project_id and not _has_explicit_project_id(delta_body):
        lines.append(f"project:{project_id}")
    lines.append("增量更新:")
    lines.append(delta_body)
    return "\n".join(line for line in lines if line).strip()


def infer_source_ai(text: str) -> str | None:
    checks = [
        ("ChatGPT", ("chatgpt", "openai", "gpt-")),
        ("Claude", ("claude", "anthropic")),
        ("DeepSeek", ("deepseek", "深度求索")),
        ("豆包", ("豆包", "doubao")),
        ("通义千问", ("通义", "qwen", "千问")),
        ("Kimi", ("kimi", "月之暗面")),
    ]
    lower = text.lower()
    for name, needles in checks:
        if any(needle.lower() in lower or needle in text for needle in needles):
            return name
    return None


def infer_stage(text: str) -> str:
    rules = [
        ("reflection", ("复盘", "沉淀", "经验", "教训")),
        ("delivery", ("提交", "交付", "上线", "发布", "验收", "完成稿")),
        ("review", ("评审", "修改意见", "review", "审稿", "审核")),
        ("integration", ("联调", "验证", "测试", "接口", "沙箱", "环境")),
        ("implementation", ("实现", "实验", "训练", "代码", "开发", "bug", "修复")),
        ("research", ("调研", "文献", "方案对比", "资料", "论文")),
        ("planning", ("拆解", "计划", "排期", "任务", "里程碑")),
        ("idea", ("想法", "需求", "客户提出", "灵感")),
    ]
    lower = text.lower()
    for stage, words in rules:
        if any(word.lower() in lower or word in text for word in words):
            return stage
    return "implementation"


def infer_log_type(text: str) -> str:
    if is_strict_risk_text(text):
        return "risk"
    rules = [
        ("decision", ("决定", "确认", "采用", "不采用", "定为", "方案")),
        ("reflection", ("复盘", "经验", "教训", "沉淀")),
        ("knowledge", ("知识", "文档", "模板", "可复用", "坑点")),
        ("progress", ("完成", "推进", "实现", "已", "今天")),
    ]
    lower = text.lower()
    for kind, words in rules:
        if any(word.lower() in lower or word in text for word in words):
            return kind
    return "progress"


def extract_record(text: str, members: list[Member]) -> dict[str, Any]:
    mentioned = []
    for member in members:
        if member.name and member.name in text:
            mentioned.append(member.open_id)
        elif member.en_name and member.en_name.lower() in text.lower():
            mentioned.append(member.open_id)
    time_points = extract_time_points(text)
    stage_markers = extract_stage_markers(text)
    return {
        "mentioned_open_ids": sorted(set(mentioned)),
        "has_risk": infer_log_type(text) == "risk",
        "has_decision": infer_log_type(text) == "decision",
        "has_knowledge": infer_log_type(text) in ("knowledge", "reflection"),
        "has_action": any(word in text for word in ("需要", "明天", "后续", "待", "TODO", "todo", "跟进", "确认")),
        "time_points": time_points,
        "duration_hint": extract_duration_hint(text),
        "stage_markers": stage_markers,
    }


def summarize_text(text: str) -> str:
    cleaned = re.sub(r"\s+", " ", text).strip()
    for sep in ("总结：", "总结:", "结论：", "结论:"):
        if sep in cleaned:
            cleaned = cleaned.split(sep, 1)[1].strip()
            break
    return _short_text(cleaned, 64)


def build_log_title(source_ai_name: str | None, stage: str, log_type: str, summary: str) -> str:
    prefix = "AI聊天归档"
    if source_ai_name:
        prefix = f"{source_ai_name}聊天归档"
    label = STAGE_LABELS.get(stage, stage)
    clean_summary = _log_summary_text(summary, {"progress": [], "decisions": [], "risks": [], "actions": [], "knowledge": []})
    title = _short_text(clean_summary, 24) if clean_summary else label
    return f"{prefix}: {label} - {title}"


def build_log_body(
    text: str,
    summary: str,
    source_ai_name: str | None,
    stage: str,
    log_type: str,
    match: ProjectMatch,
    extracted: dict[str, Any],
    status: str,
    refined_sections: dict[str, list[str]] | None = None,
) -> str:
    sections = refined_sections or split_transcript_summary(text)
    log_time = datetime.now().strftime("%Y-%m-%d %H:%M")
    lines = [
        f"{log_time} | {STAGE_LABELS.get(stage, stage)} | {source_ai_name or 'AI'}",
        f"摘要: {_short_text(_log_summary_text(summary or text, sections), 64)}",
    ]
    if extracted.get("time_points"):
        lines.append("时间节点:")
        lines.extend(f"- {_short_text(item, 40)}" for item in extracted["time_points"][:3])
    if extracted.get("duration_hint"):
        lines.append(f"持续时间: {_short_text(str(extracted['duration_hint']), 32)}")
    if extracted.get("stage_markers"):
        lines.append("阶段线索:")
        lines.extend(f"- {_short_text(item, 40)}" for item in extracted["stage_markers"][:2])
    for title, key, values in (
        ("进展", "progress", sections["progress"]),
        ("决策", "decision", sections["decisions"]),
        ("风险/问题", "risk", sections["risks"]),
        ("后续动作", "action", sections["actions"]),
        ("知识沉淀", "knowledge", sections["knowledge"]),
    ):
        items = _log_section_items(key, values)
        if items:
            lines.append(f"{title}:")
            lines.extend(f"- {item}" for item in items[:3])
    return "\n".join(lines)


def _log_summary_text(summary: str, sections: dict[str, list[str]]) -> str:
    for kind, values in (
        ("risk", sections.get("risks") or []),
        ("progress", sections.get("progress") or []),
        ("decision", sections.get("decisions") or []),
        ("action", sections.get("actions") or []),
    ):
        for value in values:
            item = _task_title_text(value, kind=kind)
            if item:
                return item
    cleaned = _task_title_text(summary, kind="progress")
    if cleaned:
        return cleaned
    return _short_text(_strip_log_noise(summary), 64)


def _log_section_items(kind: str, values: list[str]) -> list[str]:
    items: list[str] = []
    seen: set[str] = set()
    for value in values:
        if kind == "risk" and not is_strict_risk_text(value):
            continue
        if kind == "risk" and _is_resolved_text(value):
            continue
        item = _task_title_text(value, kind=kind)
        if not item:
            item = _short_text(_strip_log_noise(value), 48)
        key = _normalize(item)
        if not item or not key or key in seen:
            continue
        seen.add(key)
        items.append(_short_text(item, 52))
    return items


def _strip_log_noise(text: str) -> str:
    cleaned = re.sub(r"<[^>]+>", " ", text or "")
    cleaned = re.sub(r"https?://[^\s]+", " ", cleaned)
    cleaned = re.sub(r"//[^\s]+", " ", cleaned)
    cleaned = re.sub(r"\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}", " ", cleaned)
    cleaned = re.sub(r"(?:ou|oc|om|omt|cli)_[a-zA-Z0-9_]+", " ", cleaned)
    cleaned = re.sub(r"[\u4e00-\u9fa5A-Za-z0-9_]{1,12}[:：]\s*", " ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" -:：;；，,。")
    return cleaned


def split_transcript_summary(text: str) -> dict[str, list[str]]:
    body = _strip_submission_prefix(text)
    chunks = _split_sentences(body)
    sections: dict[str, list[str]] = {
        "progress": [],
        "decisions": [],
        "risks": [],
        "actions": [],
        "knowledge": [],
    }
    for chunk in chunks:
        targets = _classify_summary_chunk(chunk)
        for target in targets:
            _append_unique(sections[target], _clean_summary_chunk(chunk))
    if not any(sections.values()) and body:
        sections["progress"].append(summarize_text(body))
    return sections


def _classify_summary_chunk(chunk: str) -> list[str]:
    lower = chunk.lower()
    targets: list[str] = []
    if is_strict_risk_text(chunk):
        targets.append("risks")
    if any(word in chunk for word in ("需要", "明天", "后续", "待", "跟进", "TODO", "todo")):
        targets.append("actions")
    if any(word in chunk for word in ("决定", "确认", "采用", "不采用", "定为", "方案")):
        targets.append("decisions")
    if any(word in chunk for word in ("知识", "文档", "模板", "可复用", "坑点", "经验", "教训", "沉淀")):
        targets.append("knowledge")
    if any(word in chunk for word in ("完成", "推进", "实现", "分析", "验证", "测试", "联调", "今天")) or any(
        word in lower for word in ("done", "fixed", "implemented", "tested")
    ):
        targets.append("progress")
    return targets


def is_strict_risk_text(text: str) -> bool:
    value = text or ""
    lower = value.lower()
    hard_words = (
        "阻塞", "卡住", "卡死", "无法", "不能", "不可用", "失败", "报错", "错误", "异常", "崩溃",
        "超时", "丢失", "泄露", "安全漏洞", "漏洞", "延期", "延误", "回滚", "中断",
        "不可恢复", "高风险", "严重", "紧急", "blocked", "blocker", "failed", "failure",
        "error", "timeout", "unavailable", "crash", "critical", "security", "leak",
    )
    if any(word in lower or word in value for word in hard_words):
        return True
    if "风险" in value and any(word in value for word in ("高", "明显", "较大", "主要", "严重", "需要处理", "需处理", "可能导致", "会导致")):
        return True
    if any(phrase in value for phrase in ("存在风险", "有风险", "风险是", "风险在于")) and any(
        word in value for word in ("延期", "失败", "不可用", "阻塞", "安全", "数据", "丢失", "无法", "不能")
    ):
        return True
    return False


def _strip_submission_prefix(text: str) -> str:
    cleaned = re.sub(r"(?:project|项目)\s*[:：#]\s*\d+", "", text, flags=re.IGNORECASE).strip()
    cleaned = re.sub(
        r"^(?:ChatGPT|Claude|DeepSeek|OpenAI|豆包|通义千问|Kimi)?\s*(?:AI\s*)?(?:聊天|对话)?(?:记录|总结)?\s*[：:]\s*",
        "",
        cleaned,
        flags=re.IGNORECASE,
    ).strip()
    return cleaned


def _split_sentences(text: str) -> list[str]:
    normalized = re.sub(r"\s+", " ", text).strip()
    if not normalized:
        return []
    parts = re.split(r"(?<=[。！？!?；;])\s*|[\n\r]+", normalized)
    return [part.strip(" -•\t") for part in parts if part.strip(" -•\t")]


def _clean_summary_chunk(chunk: str) -> str:
    cleaned = chunk.strip()
    cleaned = re.sub(r"^[0-9一二三四五六七八九十]+[、.)）]\s*", "", cleaned)
    return _short_text(cleaned, 52)


def _short_text(text: str, limit: int) -> str:
    cleaned = re.sub(r"\s+", " ", (text or "")).strip()
    if len(cleaned) <= limit:
        return cleaned
    return cleaned[: max(1, limit - 1)].rstrip() + "…"


def _append_unique(items: list[str], item: str) -> None:
    if item and item not in items:
        items.append(item)


def _best_task_for_project(db: Session, project_id: int, text: str) -> Task | None:
    tasks = db.execute(
        select(Task).where(Task.project_id == project_id).order_by(Task.updated_at.desc()).limit(80)
    ).scalars().all()
    best: Task | None = None
    best_score = 0.0
    normalized_text = _normalize(text)
    for task in tasks:
        title = task.title or ""
        if title and title in text:
            return task
        title_tokens = _keywords(title)
        if title_tokens:
            hits = [token for token in title_tokens if token in text]
            if hits and len(hits) / max(1, len(title_tokens)) >= 0.4:
                return task
        score = SequenceMatcher(None, _normalize(title), normalized_text[: max(40, len(_normalize(title)))]).ratio()
        if score > best_score:
            best_score = score
            best = task
    return best if best_score >= 0.55 else None


def _keywords(text: str) -> list[str]:
    return [token for token in re.split(r"[\s,，。；;、/|#:_：\-（）()]+", text) if len(token) >= 2][:20]


def _normalize(text: str) -> str:
    return re.sub(r"[\s,，。；;、/|#:_：\-（）()]+", "", (text or "").lower())


def _has_explicit_project_id(text: str) -> bool:
    return bool(re.search(r"(?:project|项目)\s*[:：#]\s*\d+", text, flags=re.IGNORECASE))


def extract_time_points(text: str) -> list[str]:
    patterns = [
        r"\b\d{4}[/-]\d{1,2}[/-]\d{1,2}(?:\s+\d{1,2}:\d{2})?\b",
        r"\b\d{1,2}[/-]\d{1,2}(?:\s+\d{1,2}:\d{2})?\b",
        r"\d{1,2}月\d{1,2}日(?:\s*\d{1,2}:\d{2})?",
        r"(?:今天|昨日|昨天|今早|今晚|明天|本周|下周)",
    ]
    out: list[str] = []
    seen: set[str] = set()
    for pattern in patterns:
        for match in re.findall(pattern, text):
            value = re.sub(r"\s+", " ", str(match).strip())
            if not value or value in seen:
                continue
            seen.add(value)
            out.append(value)
            if len(out) >= 4:
                return out
    return out


def extract_duration_hint(text: str) -> str | None:
    patterns = [
        r"(?:持续|耗时|历时|用时)\s*([0-9一二三四五六七八九十两半]+(?:\.\d+)?)\s*(分钟|小时|天|周|个月|月)",
        r"\b([0-9]+(?:\.\d+)?)\s*(min|mins|minute|minutes|h|hr|hour|hours|day|days|week|weeks|month|months)\b",
    ]
    for pattern in patterns:
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if match:
            groups = [g for g in match.groups() if g]
            return "".join(groups)
    range_match = re.search(
        r"(\d{4}[/-]\d{1,2}[/-]\d{1,2}|\d{1,2}月\d{1,2}日)\s*(?:至|到|-|—)\s*(\d{4}[/-]\d{1,2}[/-]\d{1,2}|\d{1,2}月\d{1,2}日)",
        text,
    )
    if range_match:
        return f"{range_match.group(1)}-{range_match.group(2)}"
    return None


def extract_stage_markers(text: str) -> list[str]:
    markers: list[str] = []
    seen: set[str] = set()
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if len(line) < 4:
            continue
        if not any(word in line for word in ("阶段", "里程碑", "完成", "开始", "截止", "联调", "评审", "交付", "上线")):
            continue
        normalized = re.sub(r"\s+", " ", line)
        if normalized in seen:
            continue
        seen.add(normalized)
        markers.append(normalized[:80])
        if len(markers) >= 3:
            break
    return markers


def _split_doc_submission(text: str) -> tuple[str | None, str]:
    lines = [line.rstrip() for line in (text or "").splitlines()]
    if not lines:
        return None, ""
    first = lines[0].strip()
    if first.startswith("云文档:"):
        return first, "\n".join(lines[1:]).strip()
    return None, "\n".join(lines).strip()


def _added_lines(previous_body: str, current_body: str) -> list[str]:
    previous_lines = [line.strip() for line in previous_body.splitlines() if line.strip()]
    current_lines = [line.strip() for line in current_body.splitlines() if line.strip()]
    matcher = SequenceMatcher(None, previous_lines, current_lines)
    added: list[str] = []
    for tag, _i1, _i2, j1, j2 in matcher.get_opcodes():
        if tag in {"insert", "replace"}:
            for line in current_lines[j1:j2]:
                if line not in added:
                    added.append(line)
    return added


def _message_content(payload: dict[str, Any]) -> Any:
    return _deep_get(payload, "event.message.content", "event.message.content.text", "message.content")


def _loads_json_object(raw: str) -> Any:
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None


def _safe_download_name(file_name: str) -> str:
    suffix = Path(file_name).suffix.lower()
    if suffix not in SUPPORTED_TEXT_FILE_SUFFIXES:
        raise ValueError("unsupported uploaded file type")
    stem = Path(file_name).stem or "lark-message-file"
    safe_stem = re.sub(r"[^A-Za-z0-9._-]+", "_", stem).strip("._-") or "lark-message-file"
    return f"{safe_stem}_{os.getpid()}{suffix}"


def _extract_lark_doc_body(payload: Any) -> str:
    direct_body = _deep_get(payload, "data.markdown", "data.content", "data.text", "data.plain_text")
    direct_title = _deep_get(payload, "data.title", "title")
    if isinstance(direct_body, str) and direct_body.strip():
        parts = []
        if isinstance(direct_title, str) and direct_title.strip():
            parts.append(direct_title.strip())
        parts.append(direct_body.strip())
        return _clean_lark_doc_text("\n\n".join(parts))

    lines = _collect_lark_doc_text(payload)
    return _clean_lark_doc_text("\n".join(lines))


def _clean_lark_doc_text(text: str) -> str:
    cleaned = text.replace("\r\n", "\n").replace("\r", "\n")
    cleaned = re.sub(r"<details[^>]*>.*?</details>", "\n", cleaned, flags=re.IGNORECASE | re.DOTALL)
    cleaned = re.sub(r"</?(?:quote-container|summary|details|blockquote|section|div|span)[^>]*>", "\n", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"!\[[^\]]*]\([^)]+\)", "\n", cleaned)
    cleaned = re.sub(r"\[([^\]]+)]\([^)]+\)", r"\1", cleaned)

    filtered_lines: list[str] = []
    skip_prefixes = (
        "previous messages",
        "stream err",
        "c:/users",
        "/home/",
        "ran ",
        "chunk id:",
        "wall time:",
        "process exited with code",
        "original token count:",
        "output:",
    )
    for raw_line in cleaned.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        lower = line.lower()
        if lower.startswith(skip_prefixes):
            continue
        if line in {"```", "'''"}:
            continue
        filtered_lines.append(line)

    compact = "\n".join(filtered_lines)
    compact = re.sub(r"\n{3,}", "\n\n", compact)
    return compact.strip()


def _collect_lark_doc_text(payload: Any) -> list[str]:
    lines: list[str] = []
    seen: set[str] = set()

    def add(value: Any) -> None:
        if not isinstance(value, str):
            return
        text = re.sub(r"\s+", " ", value).strip()
        if len(text) < 2 or text in seen:
            return
        seen.add(text)
        lines.append(text)

    def walk(value: Any, key: str = "") -> None:
        if isinstance(value, dict):
            for k, v in value.items():
                if k in {"text", "content", "title", "plain_text", "markdown"}:
                    add(v)
                elif k not in {"owner_id", "token", "obj_token", "url", "revision_id", "block_id"}:
                    walk(v, k)
        elif isinstance(value, list):
            for item in value:
                walk(item, key)

    walk(payload)
    return lines[:300]


def _deep_get(payload: dict[str, Any], *paths: str) -> Any:
    for path in paths:
        cur: Any = payload
        ok = True
        for part in path.split("."):
            if not isinstance(cur, dict) or part not in cur:
                ok = False
                break
            cur = cur[part]
        if ok:
            return cur
    return None
