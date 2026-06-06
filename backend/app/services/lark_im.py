"""飞书 IM 通知 (bot 身份 P2P 私聊)."""
from __future__ import annotations
import json, logging, os, shutil, subprocess, uuid
from urllib.parse import urlencode

log = logging.getLogger(__name__)
LARK_APP_ID = os.getenv("LARK_APP_ID") or os.getenv("VITE_LARK_APP_ID") or "cli_a9147e9473f81bef"

LARK_CLI_CANDIDATES = (
    "/home/ubuntu/.npm-global/bin/lark-cli",
    "/home/ubuntu/.npm-global/lib/node_modules/@larksuite/cli/bin/lark-cli",
    "lark-cli",
)


def _lark_cli() -> str:
    for candidate in LARK_CLI_CANDIDATES:
        if "/" in candidate:
            if shutil.which(candidate):
                return candidate
        else:
            found = shutil.which(candidate)
            if found:
                return found
    return "lark-cli"


def _app_link(path: str) -> str:
    normalized_path = path if path.startswith("/") else f"/{path}"
    return "https://applink.feishu.cn/client/web_app/open?" + urlencode({
        "appId": LARK_APP_ID,
        "mode": "appCenter",
        "path": normalized_path,
    })


def _receipt_link(kind: str, target_id: int, redirect: str | None = None) -> str:
    query = {"kind": kind, "id": target_id}
    if redirect:
        query["redirect"] = redirect
    return _app_link(f"/notifications/receipt?{urlencode(query)}")


def send_text(open_id: str, text: str, idempotency_key: str | None = None) -> bool:
    """给指定用户私聊发文本消息. 返回是否成功. 失败不抛错."""
    if not (open_id and text):
        return False
    args = [_lark_cli(), "im", "+messages-send",
            "--user-id", open_id, "--text", text,
            "--as", "bot"]
    if idempotency_key:
        args += ["--idempotency-key", idempotency_key]
    try:
        r = subprocess.run(args, capture_output=True, text=True, timeout=20)
        if r.returncode != 0:
            log.warning("lark im send failed to %s via %s: %s", open_id[:12], args[0], r.stderr.strip()[:200])
            return False
        return True
    except Exception as e:
        log.warning("lark im send exception to %s: %s", open_id[:12], e)
        return False


def send_markdown(open_id: str, markdown: str, idempotency_key: str | None = None) -> bool:
    if not (open_id and markdown):
        return False
    args = [_lark_cli(), "im", "+messages-send",
            "--user-id", open_id, "--markdown", markdown,
            "--as", "bot"]
    if idempotency_key:
        args += ["--idempotency-key", idempotency_key]
    try:
        r = subprocess.run(args, capture_output=True, text=True, timeout=20)
        if r.returncode != 0:
            log.warning("lark im md send failed to %s via %s: %s", open_id[:12], args[0], r.stderr.strip()[:200])
            return False
        return True
    except Exception as e:
        log.warning("lark im md send exception to %s: %s", open_id[:12], e)
        return False


def send_card(open_id: str, card: dict, idempotency_key: str | None = None) -> bool:
    """给指定用户私聊发飞书卡片. 返回是否成功. 失败不抛错."""
    if not (open_id and card):
        return False
    args = [
        _lark_cli(), "im", "+messages-send",
        "--user-id", open_id,
        "--msg-type", "interactive",
        "--content", json.dumps(card, ensure_ascii=False),
        "--as", "bot",
    ]
    if idempotency_key:
        args += ["--idempotency-key", idempotency_key]
    try:
        r = subprocess.run(args, capture_output=True, text=True, timeout=20)
        if r.returncode != 0:
            log.warning("lark im card send failed to %s via %s: %s", open_id[:12], args[0], r.stderr.strip()[:300])
            return False
        return True
    except Exception as e:
        log.warning("lark im card send exception to %s: %s", open_id[:12], e)
        return False


def _field(label: str, value: str | None) -> dict:
    return {
        "is_short": True,
        "text": {
            "tag": "lark_md",
            "content": f"**{label}**\n{value or '-'}",
        },
    }


def _action_button(text: str, url: str | None = None, button_type: str = "primary", value: dict | None = None) -> dict:
    button = {
        "tag": "button",
        "text": {"tag": "plain_text", "content": text},
        "type": button_type,
    }
    if url:
        button["url"] = url
    if value:
        button["value"] = value
    return button


def notify_task_assigned(assignee_open_id: str, task_title: str, due_date: str | None,
                         project_name: str | None = None, creator_name: str | None = None,
                         creator_open_id: str | None = None, task_id: int | None = None) -> bool:
    card = {
        "config": {"wide_screen_mode": True},
        "header": {
            "template": "blue",
            "title": {"tag": "plain_text", "content": "你有新的任务"},
        },
        "elements": [
            {"tag": "div", "text": {"tag": "lark_md", "content": f"**{task_title}**"}},
            {"tag": "hr"},
            {
                "tag": "div",
                "fields": [
                    _field("发起人", creator_name),
                    _field("截止时间", due_date),
                    _field("所属项目", project_name),
                    _field("类型", "任务指派"),
                ],
            },
            {
                "tag": "action",
                "actions": [
                    _action_button("收到", _receipt_link("task", task_id, "/board"), "primary") if task_id else _action_button("打开任务看板", _app_link("/board")),
                    _action_button("打开任务看板", _app_link("/board"), "default"),
                ],
            },
        ],
    }
    return send_card(assignee_open_id, card, idempotency_key=f"task-assign-{uuid.uuid4().hex[:12]}")


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
                                added_by_name: str | None = None, project_id: int | None = None) -> bool:
    role_label = {"owner": "负责人", "co_lead": "联合负责人", "member": "成员", "observer": "观察员"}.get(role, role)
    card = {
        "config": {"wide_screen_mode": True},
        "header": {
            "template": "green",
            "title": {"tag": "plain_text", "content": "你被加入了项目"},
        },
        "elements": [
            {"tag": "div", "text": {"tag": "lark_md", "content": f"**项目《{project_name}》**"}},
            {"tag": "hr"},
            {
                "tag": "div",
                "fields": [
                    _field("加入人", added_by_name),
                    _field("项目角色", role_label),
                    _field("类型", "项目成员"),
                ],
            },
            {
                "tag": "action",
                "actions": [
                    _action_button("收到", _receipt_link("project", project_id, f"/projects/{project_id}"), "primary") if project_id else _action_button("打开项目列表", _app_link("/projects")),
                    _action_button("打开项目", _app_link(f"/projects/{project_id}") if project_id else _app_link("/projects"), "default"),
                ],
            },
        ],
    }
    return send_card(member_open_id, card, idempotency_key=f"proj-join-{uuid.uuid4().hex[:12]}")


def notify_event_invited(attendee_open_id: str, title: str, start_at: str, end_at: str,
                         location: str | None = None, organizer_name: str | None = None) -> bool:
    by = f"{organizer_name} 邀你参加: " if organizer_name else "新会议邀请: "
    loc = f"\n地点: {location}" if location else ""
    text = f"📅 {by}{title}\n时间: {start_at[:16]} → {end_at[:16]}{loc}"
    return send_text(attendee_open_id, text, idempotency_key=f"event-invite-{uuid.uuid4().hex[:12]}")


def notify_task_due_soon(assignee_open_id: str, task_title: str, due_date: str,
                         project_name: str | None = None) -> bool:
    card = {
        "config": {"wide_screen_mode": True},
        "header": {
            "template": "orange",
            "title": {"tag": "plain_text", "content": "任务即将到期"},
        },
        "elements": [
            {"tag": "div", "text": {"tag": "lark_md", "content": f"**{task_title}**"}},
            {"tag": "hr"},
            {
                "tag": "div",
                "fields": [
                    _field("截止时间", due_date),
                    _field("所属项目", project_name),
                ],
            },
            {
                "tag": "action",
                "actions": [_action_button("打开任务看板", _app_link("/board"))],
            },
        ],
    }
    return send_card(assignee_open_id, card, idempotency_key=f"due-{assignee_open_id[:8]}-{due_date}")


def notify_focus_heartbeat(open_id: str, task_title: str, elapsed_minutes: int, task_id: int | None = None) -> bool:
    card = {
        "config": {"wide_screen_mode": True},
        "header": {
            "template": "turquoise",
            "title": {"tag": "plain_text", "content": "专注状态确认"},
        },
        "elements": [
            {"tag": "div", "text": {"tag": "lark_md", "content": f"**{task_title}**\n已连续专注 {elapsed_minutes} 分钟"}},
            {
                "tag": "input",
                "name": "focus_note",
                "placeholder": {"tag": "plain_text", "content": "输入本轮文本记录"},
            },
            {
                "tag": "input",
                "name": "focus_screenshot_url",
                "placeholder": {"tag": "plain_text", "content": "粘贴截图链接，可选"},
            },
            {
                "tag": "action",
                "actions": [
                    _action_button("确认继续", None, "primary", {
                        "action": "focus_continue",
                        "task_id": task_id,
                        "elapsed_minutes": elapsed_minutes,
                    }),
                    _action_button("结束专注", None, "danger", {
                        "action": "focus_stop",
                        "task_id": task_id,
                        "elapsed_minutes": elapsed_minutes,
                    }),
                ],
            },
        ],
    }
    return send_card(open_id, card, idempotency_key=f"focus-heartbeat-{uuid.uuid4().hex[:12]}")


def notify_task_overdue(assignee_open_id: str, task_title: str, due_date: str,
                        project_name: str | None = None, task_id: int | None = None,
                        reminder_date: str | None = None) -> bool:
    card = {
        "config": {"wide_screen_mode": True},
        "header": {
            "template": "red",
            "title": {"tag": "plain_text", "content": "任务已逾期"},
        },
        "elements": [
            {"tag": "div", "text": {"tag": "lark_md", "content": f"**{task_title}**"}},
            {"tag": "hr"},
            {
                "tag": "div",
                "fields": [
                    _field("截止时间", due_date),
                    _field("所属项目", project_name or "独立任务"),
                ],
            },
            {
                "tag": "action",
                "actions": [
                    _action_button("打开任务看板", _app_link("/board"), "primary"),
                    _action_button("确认并开始", _receipt_link("task", task_id, "/board"), "default") if task_id else _action_button("打开项目列表", _app_link("/projects")),
                ],
            },
        ],
    }
    day = reminder_date or due_date[:10]
    return send_card(assignee_open_id, card, idempotency_key=f"task-overdue-{task_id or assignee_open_id[:8]}-{day}")


def notify_task_completed(recipient_open_id: str, task_title: str, completed_by_name: str | None = None,
                          project_name: str | None = None, task_id: int | None = None) -> bool:
    card = {
        "config": {"wide_screen_mode": True},
        "header": {
            "template": "green",
            "title": {"tag": "plain_text", "content": "任务已完成"},
        },
        "elements": [
            {"tag": "div", "text": {"tag": "lark_md", "content": f"**{task_title}**"}},
            {"tag": "hr"},
            {
                "tag": "div",
                "fields": [
                    _field("完成人", completed_by_name),
                    _field("所属项目", project_name or "独立任务"),
                ],
            },
            {
                "tag": "action",
                "actions": [_action_button("打开任务看板", _app_link("/board"), "primary")],
            },
        ],
    }
    return send_card(recipient_open_id, card, idempotency_key=f"task-done-{task_id or uuid.uuid4().hex[:8]}-{recipient_open_id[:8]}")


def notify_project_log(recipient_open_id: str, *, project_name: str, title: str,
                       body: str | None = None, actor_name: str | None = None,
                       action_label: str = "项目日志", project_id: int | None = None,
                       log_id: int | None = None) -> bool:
    card = {
        "config": {"wide_screen_mode": True},
        "header": {
            "template": "blue",
            "title": {"tag": "plain_text", "content": action_label},
        },
        "elements": [
            {"tag": "div", "text": {"tag": "lark_md", "content": f"**项目《{project_name}》**\n{title}"}},
            {"tag": "hr"},
            {
                "tag": "div",
                "fields": [
                    _field("发起人", actor_name),
                    _field("日志编号", str(log_id) if log_id else None),
                ],
            },
            {"tag": "div", "text": {"tag": "lark_md", "content": body or "-"}},
            {
                "tag": "action",
                "actions": [
                    _action_button("打开项目", _app_link(f"/projects/{project_id}") if project_id else _app_link("/projects"), "primary"),
                ],
            },
        ],
    }
    return send_card(recipient_open_id, card, idempotency_key=f"project-log-{log_id or uuid.uuid4().hex[:12]}-{recipient_open_id[:8]}")
