from __future__ import annotations

import json
from collections import defaultdict
from datetime import date, datetime, time, timedelta
from typing import Any

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import require_role
from app.models import CalendarEvent, Member, Project, ProjectChat, ProjectChatMessage, ProjectMember, Task

router = APIRouter(prefix="/api/project-report", tags=["project_report"])


class ReportMetric(BaseModel):
    label: str
    value: int | float | str
    hint: str | None = None


class DepartmentReportRow(BaseModel):
    department: str
    active_members: int
    active_projects: int
    completed_projects: int
    created_projects: int
    open_tasks: int
    in_progress_tasks: int
    completed_tasks: int
    overdue_tasks: int
    blocked_tasks: int
    chat_messages: int
    chat_speakers: int
    meetings: int
    meeting_hours: float
    high_load_members: int
    idle_members: int
    risk_projects: int
    health_score: int


class PersonReportRow(BaseModel):
    member_open_id: str
    member_name: str
    department: str
    owner_projects: int
    participant_projects: int
    open_tasks: int
    in_progress_tasks: int
    completed_tasks: int
    overdue_tasks: int
    blocked_tasks: int
    chat_messages: int
    meetings: int
    meeting_hours: float
    load_score: int
    risk_flags: list[str]


class ProjectRiskRow(BaseModel):
    project_id: int
    name: str
    department: str
    owner_name: str
    status: str
    priority: str
    overdue_tasks: int
    blocked_tasks: int
    last_chat_at: datetime | None
    target_end_date: datetime | None
    reasons: list[str]


class TaskRiskRow(BaseModel):
    task_id: int
    title: str
    project_id: int | None
    project_name: str | None
    assignee_open_id: str | None
    assignee_name: str | None
    department: str
    status: str
    priority: str
    due_date: datetime | None


class ProjectReportSummary(BaseModel):
    start_date: date
    end_date: date
    generated_at: datetime
    metrics: list[ReportMetric]
    departments: list[DepartmentReportRow]
    people: list[PersonReportRow]
    risk_projects: list[ProjectRiskRow]
    overdue_tasks: list[TaskRiskRow]
    briefing: str


def _department(value: str | None) -> str:
    return (value or "未分部门").strip() or "未分部门"


def _range(start: date | None, end: date | None, days: int) -> tuple[datetime, datetime, date, date]:
    end_day = end or datetime.now().date()
    start_day = start or (end_day - timedelta(days=max(1, days) - 1))
    if start_day > end_day:
        start_day, end_day = end_day, start_day
    return (
        datetime.combine(start_day, time.min),
        datetime.combine(end_day, time.max),
        start_day,
        end_day,
    )


def _event_attendees(event: CalendarEvent) -> set[str]:
    result = {event.organizer_open_id}
    if not event.attendees_json:
        return result
    try:
        payload = json.loads(event.attendees_json)
    except Exception:
        return result

    def visit(value: Any) -> None:
        if isinstance(value, str):
            if value.startswith("ou_") or value.startswith("on_") or value.startswith("user_"):
                result.add(value)
            return
        if isinstance(value, list):
            for item in value:
                visit(item)
            return
        if isinstance(value, dict):
            for key in ("open_id", "member_open_id", "id", "user_id"):
                raw = value.get(key)
                if isinstance(raw, str) and raw:
                    result.add(raw)
            for key in ("attendees", "items", "users"):
                if key in value:
                    visit(value[key])

    visit(payload)
    return result


def _hours(event: CalendarEvent, start_at: datetime, end_at: datetime) -> float:
    left = max(event.start_at, start_at)
    right = min(event.end_at, end_at)
    if right <= left:
        return 0.0
    return round((right - left).total_seconds() / 3600, 2)


def _health_score(row: dict[str, Any], active_members: int) -> int:
    completed = int(row["completed_tasks"])
    open_tasks = int(row["open_tasks"])
    overdue = int(row["overdue_tasks"])
    blocked = int(row["blocked_tasks"])
    messages = int(row["chat_messages"])
    high_load = int(row["high_load_members"])
    idle = int(row["idle_members"])
    completion_rate = completed / max(1, completed + open_tasks)
    risk_penalty = min(35, overdue * 4 + blocked * 6)
    communication = min(20, messages // 10)
    load_penalty = min(20, max(0, high_load - max(1, active_members // 5)) * 4 + idle * 2)
    return max(0, min(100, round(45 * completion_rate + communication + 35 - risk_penalty - load_penalty)))


@router.get("/summary", response_model=ProjectReportSummary)
def project_report_summary(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    days: int = Query(7, ge=1, le=90),
    db: Session = Depends(get_db),
    _: Member = Depends(require_role("admin", "staff")),
):
    start_at, end_at, start_day, end_day = _range(start_date, end_date, days)
    now = datetime.now()

    members = db.execute(select(Member).where(Member.status.in_(("active", "on_leave")))).scalars().all()
    member_by_id = {member.open_id: member for member in members}
    member_dept = {member.open_id: _department(member.department) for member in members}
    member_name = {member.open_id: member.name for member in members}

    projects = db.execute(select(Project)).scalars().all()
    project_by_id = {project.project_id: project for project in projects}
    project_dept = {
        project.project_id: _department(project.department or member_dept.get(project.owner_open_id))
        for project in projects
    }
    project_owner_name = {
        project.project_id: member_name.get(project.owner_open_id, project.owner_open_id)
        for project in projects
    }

    dept_rows: dict[str, dict[str, Any]] = defaultdict(lambda: {
        "active_members": 0,
        "active_projects": 0,
        "completed_projects": 0,
        "created_projects": 0,
        "open_tasks": 0,
        "in_progress_tasks": 0,
        "completed_tasks": 0,
        "overdue_tasks": 0,
        "blocked_tasks": 0,
        "chat_messages": 0,
        "speakers": set(),
        "meetings": 0,
        "meeting_hours": 0.0,
        "high_load_members": 0,
        "idle_members": 0,
        "risk_projects": 0,
    })
    person_rows: dict[str, dict[str, Any]] = {}
    for member in members:
        dept = member_dept[member.open_id]
        dept_rows[dept]["active_members"] += 1
        person_rows[member.open_id] = {
            "member_open_id": member.open_id,
            "member_name": member.name,
            "department": dept,
            "owner_projects": 0,
            "participant_projects": 0,
            "open_tasks": 0,
            "in_progress_tasks": 0,
            "completed_tasks": 0,
            "overdue_tasks": 0,
            "blocked_tasks": 0,
            "chat_messages": 0,
            "meetings": 0,
            "meeting_hours": 0.0,
            "risk_flags": set(),
        }

    for project in projects:
        dept = project_dept[project.project_id]
        if project.status in ("planning", "active", "paused"):
            dept_rows[dept]["active_projects"] += 1
        if project.status == "completed" and project.actual_end_date and start_at <= project.actual_end_date <= end_at:
            dept_rows[dept]["completed_projects"] += 1
        if start_at <= project.created_at <= end_at:
            dept_rows[dept]["created_projects"] += 1
        if project.owner_open_id in person_rows:
            person_rows[project.owner_open_id]["owner_projects"] += 1

    memberships = db.execute(select(ProjectMember).where(ProjectMember.left_at.is_(None))).scalars().all()
    participant_project_ids: dict[str, set[int]] = defaultdict(set)
    for item in memberships:
        participant_project_ids[item.member_open_id].add(item.project_id)
    for open_id, ids in participant_project_ids.items():
        if open_id in person_rows:
            person_rows[open_id]["participant_projects"] = len(ids)

    tasks = db.execute(select(Task)).scalars().all()
    task_by_project: dict[int, list[Task]] = defaultdict(list)
    for task in tasks:
        if task.project_id:
            task_by_project[task.project_id].append(task)
        assignee = task.assignee_open_id
        project = project_by_id.get(task.project_id) if task.project_id else None
        dept = _department(member_dept.get(assignee or "") or (project_dept.get(project.project_id) if project else None))
        if task.status in ("todo", "in_progress", "blocked"):
            dept_rows[dept]["open_tasks"] += 1
            if assignee in person_rows:
                person_rows[assignee]["open_tasks"] += 1
        if task.status == "in_progress":
            dept_rows[dept]["in_progress_tasks"] += 1
            if assignee in person_rows:
                person_rows[assignee]["in_progress_tasks"] += 1
        if task.status == "done" and task.completed_at and start_at <= task.completed_at <= end_at:
            dept_rows[dept]["completed_tasks"] += 1
            if assignee in person_rows:
                person_rows[assignee]["completed_tasks"] += 1
        if task.status == "blocked":
            dept_rows[dept]["blocked_tasks"] += 1
            if assignee in person_rows:
                person_rows[assignee]["blocked_tasks"] += 1
                person_rows[assignee]["risk_flags"].add("有阻塞任务")
        if task.status in ("todo", "in_progress", "blocked") and task.due_date and task.due_date < now:
            dept_rows[dept]["overdue_tasks"] += 1
            if assignee in person_rows:
                person_rows[assignee]["overdue_tasks"] += 1
                person_rows[assignee]["risk_flags"].add("有逾期任务")

    messages = db.execute(
        select(ProjectChatMessage).where(
            ProjectChatMessage.message_created_at >= start_at,
            ProjectChatMessage.message_created_at <= end_at,
            ProjectChatMessage.deleted.is_(False),
        )
    ).scalars().all()
    for message in messages:
        dept = project_dept.get(message.project_id, "未分部门")
        dept_rows[dept]["chat_messages"] += 1
        if message.sender_open_id:
            dept_rows[dept]["speakers"].add(message.sender_open_id)
            if message.sender_open_id in person_rows:
                person_rows[message.sender_open_id]["chat_messages"] += 1

    events = db.execute(
        select(CalendarEvent).where(
            CalendarEvent.event_type == "meeting",
            CalendarEvent.start_at <= end_at,
            CalendarEvent.end_at >= start_at,
        )
    ).scalars().all()
    for event in events:
        attendees = _event_attendees(event)
        event_hours = _hours(event, start_at, end_at)
        dept = _department(project_dept.get(event.related_project_id) if event.related_project_id else member_dept.get(event.organizer_open_id))
        dept_rows[dept]["meetings"] += 1
        dept_rows[dept]["meeting_hours"] += event_hours
        for open_id in attendees:
            if open_id in person_rows:
                person_rows[open_id]["meetings"] += 1
                person_rows[open_id]["meeting_hours"] += event_hours

    risk_projects: list[ProjectRiskRow] = []
    stale_cutoff = now - timedelta(hours=48)
    chats = db.execute(select(ProjectChat)).scalars().all()
    chats_by_project: dict[int, list[ProjectChat]] = defaultdict(list)
    for chat in chats:
        chats_by_project[chat.project_id].append(chat)

    for project in projects:
        if project.status not in ("planning", "active", "paused"):
            continue
        project_tasks = task_by_project.get(project.project_id, [])
        overdue_count = sum(1 for task in project_tasks if task.status in ("todo", "in_progress", "blocked") and task.due_date and task.due_date < now)
        blocked_count = sum(1 for task in project_tasks if task.status == "blocked")
        project_chats = chats_by_project.get(project.project_id, [])
        last_chat_at = max((chat.last_message_at or chat.latest_topic_reply_at for chat in project_chats if chat.last_message_at or chat.latest_topic_reply_at), default=None)
        reasons: list[str] = []
        if overdue_count:
            reasons.append(f"{overdue_count} 个逾期任务")
        if blocked_count:
            reasons.append(f"{blocked_count} 个阻塞任务")
        if project.target_end_date and project.target_end_date < now:
            reasons.append("项目目标时间已过")
        if not project_chats:
            reasons.append("未关联项目群")
        elif not last_chat_at or last_chat_at < stale_cutoff:
            reasons.append("项目群 48 小时无新消息")
        if not reasons:
            continue
        dept = project_dept[project.project_id]
        dept_rows[dept]["risk_projects"] += 1
        if project.owner_open_id in person_rows:
            person_rows[project.owner_open_id]["risk_flags"].add("负责风险项目")
        risk_projects.append(ProjectRiskRow(
            project_id=project.project_id,
            name=project.name,
            department=dept,
            owner_name=project_owner_name[project.project_id],
            status=project.status,
            priority=project.priority,
            overdue_tasks=overdue_count,
            blocked_tasks=blocked_count,
            last_chat_at=last_chat_at,
            target_end_date=project.target_end_date,
            reasons=reasons,
        ))

    overdue_tasks = [
        TaskRiskRow(
            task_id=task.task_id,
            title=task.title,
            project_id=task.project_id,
            project_name=project_by_id[task.project_id].name if task.project_id and task.project_id in project_by_id else None,
            assignee_open_id=task.assignee_open_id,
            assignee_name=member_name.get(task.assignee_open_id or ""),
            department=_department(member_dept.get(task.assignee_open_id or "") or (project_dept.get(task.project_id) if task.project_id else None)),
            status=task.status,
            priority=task.priority,
            due_date=task.due_date,
        )
        for task in tasks
        if task.status in ("todo", "in_progress", "blocked") and task.due_date and task.due_date < now
    ]
    overdue_tasks.sort(key=lambda item: item.due_date or datetime.min)

    for open_id, row in person_rows.items():
        open_tasks = int(row["open_tasks"])
        in_progress = int(row["in_progress_tasks"])
        if open_tasks >= 6 or in_progress >= 4:
            row["risk_flags"].add("高并行负载")
        if open_tasks == 0 and int(row["owner_projects"]) == 0 and int(row["participant_projects"]) == 0:
            row["risk_flags"].add("当前无项目任务")
        dept_rows[row["department"]]["high_load_members"] += 1 if open_tasks >= 6 or in_progress >= 4 else 0
        dept_rows[row["department"]]["idle_members"] += 1 if open_tasks == 0 and int(row["owner_projects"]) == 0 and int(row["participant_projects"]) == 0 else 0

    department_payload = []
    for dept, row in dept_rows.items():
        active_members = int(row["active_members"])
        department_payload.append(DepartmentReportRow(
            department=dept,
            active_members=active_members,
            active_projects=int(row["active_projects"]),
            completed_projects=int(row["completed_projects"]),
            created_projects=int(row["created_projects"]),
            open_tasks=int(row["open_tasks"]),
            in_progress_tasks=int(row["in_progress_tasks"]),
            completed_tasks=int(row["completed_tasks"]),
            overdue_tasks=int(row["overdue_tasks"]),
            blocked_tasks=int(row["blocked_tasks"]),
            chat_messages=int(row["chat_messages"]),
            chat_speakers=len(row["speakers"]),
            meetings=int(row["meetings"]),
            meeting_hours=round(float(row["meeting_hours"]), 1),
            high_load_members=int(row["high_load_members"]),
            idle_members=int(row["idle_members"]),
            risk_projects=int(row["risk_projects"]),
            health_score=_health_score(row, active_members),
        ))
    department_payload.sort(key=lambda item: (item.risk_projects, item.overdue_tasks, -item.completed_tasks), reverse=True)

    people_payload = []
    for row in person_rows.values():
        load_score = min(100, int(row["open_tasks"]) * 12 + int(row["in_progress_tasks"]) * 8 + int(row["meetings"]) * 3)
        people_payload.append(PersonReportRow(
            member_open_id=row["member_open_id"],
            member_name=row["member_name"],
            department=row["department"],
            owner_projects=int(row["owner_projects"]),
            participant_projects=int(row["participant_projects"]),
            open_tasks=int(row["open_tasks"]),
            in_progress_tasks=int(row["in_progress_tasks"]),
            completed_tasks=int(row["completed_tasks"]),
            overdue_tasks=int(row["overdue_tasks"]),
            blocked_tasks=int(row["blocked_tasks"]),
            chat_messages=int(row["chat_messages"]),
            meetings=int(row["meetings"]),
            meeting_hours=round(float(row["meeting_hours"]), 1),
            load_score=load_score,
            risk_flags=sorted(row["risk_flags"]),
        ))
    people_payload.sort(key=lambda item: (item.overdue_tasks, item.blocked_tasks, item.open_tasks, item.chat_messages), reverse=True)

    total_active_projects = sum(item.active_projects for item in department_payload)
    total_completed_tasks = sum(item.completed_tasks for item in department_payload)
    total_overdue_tasks = sum(item.overdue_tasks for item in department_payload)
    total_messages = sum(item.chat_messages for item in department_payload)
    total_meetings = sum(item.meetings for item in department_payload)
    total_risk_projects = len(risk_projects)
    top_dept = max(department_payload, key=lambda item: item.completed_tasks, default=None)
    risk_dept = max(department_payload, key=lambda item: item.risk_projects, default=None)
    briefing = (
        f"{start_day} 至 {end_day}，当前进行中项目 {total_active_projects} 个，"
        f"完成任务 {total_completed_tasks} 个，逾期任务 {total_overdue_tasks} 个，"
        f"项目群消息 {total_messages} 条，会议 {total_meetings} 场，风险项目 {total_risk_projects} 个。"
    )
    if top_dept and top_dept.completed_tasks:
        briefing += f" 任务完成最多的是 {top_dept.department}（{top_dept.completed_tasks} 个）。"
    if risk_dept and risk_dept.risk_projects:
        briefing += f" 风险项目主要集中在 {risk_dept.department}（{risk_dept.risk_projects} 个）。"

    return ProjectReportSummary(
        start_date=start_day,
        end_date=end_day,
        generated_at=datetime.now(),
        metrics=[
            ReportMetric(label="进行中项目", value=total_active_projects),
            ReportMetric(label="完成任务", value=total_completed_tasks, hint="按 completed_at 落在筛选范围内统计"),
            ReportMetric(label="逾期任务", value=total_overdue_tasks),
            ReportMetric(label="风险项目", value=total_risk_projects),
            ReportMetric(label="项目群消息", value=total_messages),
            ReportMetric(label="会议数", value=total_meetings),
        ],
        departments=department_payload,
        people=people_payload,
        risk_projects=risk_projects[:80],
        overdue_tasks=overdue_tasks[:100],
        briefing=briefing,
    )
