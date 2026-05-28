"""飞书 IM 通知 (bot 身份 P2P 私聊)."""
from __future__ import annotations
import logging, subprocess, uuid

log = logging.getLogger(__name__)


def send_text(open_id: str, text: str, idempotency_key: str | None = None) -> bool:
    """给指定用户私聊发文本消息. 返回是否成功. 失败不抛错."""
    if not (open_id and text):
        return False
    args = ["lark-cli", "im", "+messages-send",
            "--user-id", open_id, "--text", text,
            "--as", "bot"]
    if idempotency_key:
        args += ["--idempotency-key", idempotency_key]
    try:
        r = subprocess.run(args, capture_output=True, text=True, timeout=20)
        if r.returncode != 0:
            log.warning("lark im send failed to %s: %s", open_id[:12], r.stderr.strip()[:200])
            return False
        return True
    except Exception as e:
        log.warning("lark im send exception to %s: %s", open_id[:12], e)
        return False


def send_markdown(open_id: str, markdown: str, idempotency_key: str | None = None) -> bool:
    if not (open_id and markdown):
        return False
    args = ["lark-cli", "im", "+messages-send",
            "--user-id", open_id, "--markdown", markdown,
            "--as", "bot"]
    if idempotency_key:
        args += ["--idempotency-key", idempotency_key]
    try:
        r = subprocess.run(args, capture_output=True, text=True, timeout=20)
        if r.returncode != 0:
            log.warning("lark im md send failed to %s: %s", open_id[:12], r.stderr.strip()[:200])
            return False
        return True
    except Exception as e:
        log.warning("lark im md send exception to %s: %s", open_id[:12], e)
        return False


def notify_task_assigned(assignee_open_id: str, task_title: str, due_date: str | None,
                         project_name: str | None = None, creator_name: str | None = None) -> bool:
    if assignee_open_id == (creator_name or ""):  # self-assigned, no need
        return True
    proj = f" · {project_name}" if project_name else ""
    due = f" · 截止 {due_date}" if due_date else ""
    creator = f"{creator_name} 派的: " if creator_name else "新任务: "
    text = f"📋 {creator}{task_title}{proj}{due}"
    return send_text(assignee_open_id, text, idempotency_key=f"task-assign-{uuid.uuid4().hex[:12]}")


def notify_leave_decided(applicant_open_id: str, approved: bool, leave_type: str,
                         start_at: str, end_at: str, comment: str | None = None,
                         approver_name: str | None = None) -> bool:
    status = "已批准 ✅" if approved else "未通过 ❌"
    type_label = {"sick": "病假", "personal": "事假", "annual": "年假",
                  "business": "公出", "other": "其他"}.get(leave_type, leave_type)
    by = f" by {approver_name}" if approver_name else ""
    extra = f"\n备注: {comment}" if comment else ""
    text = f"📝 你的 {type_label} 申请 {status}{by}\n时间: {start_at[:16]} → {end_at[:16]}{extra}"
    return send_text(applicant_open_id, text, idempotency_key=f"leave-{applicant_open_id[:8]}-{start_at[:10]}")


def notify_project_member_added(member_open_id: str, project_name: str, role: str,
                                added_by_name: str | None = None) -> bool:
    role_label = {"owner": "负责人", "co_lead": "联合负责人", "member": "成员", "observer": "观察员"}.get(role, role)
    by = f"{added_by_name} 邀你加入" if added_by_name else "你被加入"
    text = f"🚀 {by}项目《{project_name}》, 角色: {role_label}"
    return send_text(member_open_id, text, idempotency_key=f"proj-join-{uuid.uuid4().hex[:12]}")


def notify_event_invited(attendee_open_id: str, title: str, start_at: str, end_at: str,
                         location: str | None = None, organizer_name: str | None = None) -> bool:
    by = f"{organizer_name} 邀你参加: " if organizer_name else "新会议邀请: "
    loc = f"\n地点: {location}" if location else ""
    text = f"📅 {by}{title}\n时间: {start_at[:16]} → {end_at[:16]}{loc}"
    return send_text(attendee_open_id, text, idempotency_key=f"event-invite-{uuid.uuid4().hex[:12]}")


def notify_task_due_soon(assignee_open_id: str, task_title: str, due_date: str,
                         project_name: str | None = None) -> bool:
    proj = f" · {project_name}" if project_name else ""
    text = f"⏰ 任务即将到期: {task_title}{proj}\n截止: {due_date}"
    return send_text(assignee_open_id, text, idempotency_key=f"due-{assignee_open_id[:8]}-{due_date}")
