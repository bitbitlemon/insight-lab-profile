"""smoke: health / JWT refresh / awards / audit / paper_authors + v3 积分路由 + 规则."""
import asyncio
import json
from datetime import date, datetime, time, timedelta

from app.models import AuditLog, CalendarEvent, ClassSchedule, Contribution, Member, Paper, PaperAuthor, PointsLedger, Project, ProjectChatMessage, ProjectChatTopic, ProjectMember, Task
from app.services.auth import create_jwt, decode_jwt, AuthError
from app.services.points_rules import (
    paper_tier_key, paper_pool, grant_points, ip_points,
    classify_award_to_ip, industrial_points, penalty_amount, category_of,
)
import pytest


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200


def test_jwt_refresh_token_kind_check():
    access = create_jwt("ou_test", "admin", "T", kind="access")
    refresh = create_jwt("ou_test", "admin", "T", kind="refresh")
    # access token 不能用作 refresh
    with pytest.raises(AuthError):
        decode_jwt(access, expected_kind="refresh")
    # refresh token 不能用作 access
    with pytest.raises(AuthError):
        decode_jwt(refresh, expected_kind="access")
    payload = decode_jwt(refresh, expected_kind="refresh")
    assert payload["kind"] == "refresh"


def test_awards_crud(client, admin_user):
    # create
    r = client.post("/api/awards", json={
        "recipient_open_id": admin_user.open_id,
        "name": "smoke-award", "level": "国家级", "category": "软著",
        "issuer": "测试发证方", "award_date": "2026-01-15",
        "created_by": admin_user.open_id,
    })
    assert r.status_code == 201, r.text
    award_id = r.json()["award_id"]

    # list 含
    r = client.get("/api/awards")
    assert r.status_code == 200
    assert any(x["award_id"] == award_id for x in r.json()["items"])

    # patch
    r = client.patch(f"/api/awards/{award_id}", json={"description": "smoke desc"})
    assert r.status_code == 200
    assert r.json()["description"] == "smoke desc"

    # delete
    r = client.delete(f"/api/awards/{award_id}")
    assert r.status_code == 204
    r = client.get(f"/api/awards/{award_id}")
    assert r.status_code == 404


def test_audit_auto_for_award_create(client, admin_user, db_session):
    before = db_session.query(AuditLog).filter_by(target_table="awards").count()
    r = client.post("/api/awards", json={
        "recipient_open_id": admin_user.open_id,
        "name": "audit-trace", "level": "行业", "category": "认证",
        "issuer": "X", "award_date": "2026-02-01",
        "created_by": admin_user.open_id,
    })
    assert r.status_code == 201, r.text
    after = db_session.query(AuditLog).filter_by(target_table="awards").count()
    assert after == before + 1
    last = db_session.query(AuditLog).filter_by(target_table="awards").order_by(AuditLog.log_id.desc()).first()
    diff = json.loads(last.diff)
    assert "after" in diff and diff["after"]["name"] == "audit-trace"


def test_paper_authors_add_and_remove(client, admin_user, db_session):
    p = Paper(title="smoke-paper", authors_text="测试作者", venue="测试期刊",
              venue_type="journal", year=2026, status="published",
              created_by=admin_user.open_id)
    db_session.add(p); db_session.commit(); db_session.refresh(p)

    r = client.post(f"/api/papers/{p.paper_id}/authors", json={
        "author_open_id": admin_user.open_id,
        "author_order": 1, "role": ["first", "corresponding"],
    })
    assert r.status_code == 201, r.text
    pa_id = r.json()["paper_author_id"]
    assert r.json()["role"] == ["first", "corresponding"]

    # 重复 → 409
    r = client.post(f"/api/papers/{p.paper_id}/authors", json={
        "author_open_id": admin_user.open_id, "author_order": 2, "role": [],
    })
    assert r.status_code == 409

    r = client.delete(f"/api/papers/{p.paper_id}/authors/{pa_id}")
    assert r.status_code == 204
    assert db_session.get(PaperAuthor, pa_id) is None


def test_lark_people_sync_from_ehr(db_session, monkeypatch):
    from app.services import lark_people_sync

    class FakeLark:
        async def list_child_departments(self, department_id="0", **kwargs):
            return {
                "items": [
                    {"open_department_id": "od_lab", "name": "智能实验室"},
                ],
                "has_more": False,
            }

        async def list_ehr_employees(self, **kwargs):
            return {
                "items": [
                    {
                        "user_id": "ou_people_sync",
                        "system_fields": {
                            "name": "飞书人事成员",
                            "en_name": "People Sync",
                            "email": "people@example.com",
                            "mobile": "13800000000",
                            "department_id": "od_lab",
                            "job": {"name": "研究助理"},
                            "job_level": {"name": "硕士"},
                            "employee_no": "E001",
                            "hire_date": "2026-06-01",
                            "status": 2,
                        },
                    },
                ],
                "has_more": False,
            }

    monkeypatch.setattr(lark_people_sync, "get_lark", lambda: FakeLark(), raising=True)

    result = asyncio.run(lark_people_sync.sync_people_from_lark(db_session, source="ehr"))
    assert result["source"] == "ehr"
    assert result["created"] == 1
    member = db_session.get(Member, "ou_people_sync")
    assert member is not None
    assert member.name == "飞书人事成员"
    assert member.department == "智能实验室"
    assert member.position == "研究助理"
    assert member.email == "people@example.com"
    assert member.status == "active"


def test_lab_interactions(client, admin_user, db_session):
    target = Member(
        open_id="test_lab_interaction_target",
        name="互动目标",
        role="student",
        department="测试",
        status="active",
        privacy_level="internal",
    )
    db_session.merge(target)
    db_session.commit()

    r = client.get("/api/lab/interactions/summary", params={"member_open_ids": target.open_id})
    assert r.status_code == 200, r.text
    assert r.json() == [{"member_open_id": target.open_id, "flower_count": 0, "egg_count": 0}]

    r = client.post("/api/lab/interactions", json={"target_open_id": target.open_id, "kind": "flower"})
    assert r.status_code == 201, r.text
    assert r.json()["actor_open_id"] == admin_user.open_id

    r = client.post("/api/lab/interactions", json={"target_open_id": target.open_id, "kind": "egg"})
    assert r.status_code == 201, r.text

    r = client.post("/api/lab/interactions", json={"target_open_id": target.open_id, "kind": "throw"})
    assert r.status_code == 201, r.text
    r = client.post("/api/lab/interactions", json={"target_open_id": target.open_id, "kind": "hammer"})
    assert r.status_code == 201, r.text
    r = client.post("/api/lab/interactions", json={"target_open_id": target.open_id, "kind": "whip"})
    assert r.status_code == 201, r.text
    r = client.post("/api/lab/interactions", json={"target_open_id": target.open_id, "kind": "water"})
    assert r.status_code == 201, r.text

    r = client.get("/api/lab/interactions/summary", params={"member_open_ids": target.open_id})
    assert r.status_code == 200, r.text
    assert r.json() == [{"member_open_id": target.open_id, "flower_count": 1, "egg_count": 1}]


def test_task_assignment_sends_lark_notification(client, admin_user, db_session, monkeypatch):
    from app.routers import tasks as tasks_router

    assignee = Member(
        open_id="test_task_assignee", name="测试任务接收人", role="staff",
        department="测试", status="active", privacy_level="internal",
    )
    db_session.merge(assignee)
    db_session.commit()

    calls = []

    def fake_notify(**kwargs):
        calls.append(kwargs)
        return True

    monkeypatch.setattr(tasks_router, "notify_task_assigned", fake_notify, raising=True)

    r = client.post("/api/tasks", json={
        "title": "通知 smoke 任务",
        "assignee_open_id": assignee.open_id,
        "due_date": "2026-06-01 00:00",
    })
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["publication_status"] == "draft"
    assert calls == []

    r = client.post(f"/api/tasks/{body['task_id']}/publish")
    assert r.status_code == 200, r.text
    assert calls == [{
        "assignee_open_id": assignee.open_id,
        "task_title": "通知 smoke 任务",
        "due_date": "2026-06-01 00:00",
        "project_name": None,
        "creator_name": admin_user.name,
        "creator_open_id": admin_user.open_id,
        "task_id": body["task_id"],
    }]


def test_task_receipt_moves_todo_to_in_progress(client, admin_user, db_session, monkeypatch):
    from app.routers import tasks as tasks_router

    monkeypatch.setattr(tasks_router, "notify_task_assigned", lambda **kwargs: True, raising=True)

    r = client.post("/api/tasks", json={
        "title": "确认后开始 smoke 任务",
        "assignee_open_id": admin_user.open_id,
        "status": "todo",
        "due_date": "2026-06-01 00:00",
    })
    assert r.status_code == 201, r.text
    task_id = r.json()["task_id"]
    assert r.json()["status"] == "todo"
    assert r.json()["received_at"] is None

    r = client.post(f"/api/tasks/{task_id}/receipt")
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "in_progress"
    assert r.json()["received_at"] is not None


def test_today_todo_and_chat_thinking_task_flow(client, admin_user):
    r = client.post("/api/tasks", json={
        "title": "今日待办 smoke 任务",
        "assignee_open_id": admin_user.open_id,
        "status": "todo",
        "thinking": "先确认边界，再处理实现",
        "progress_draft": "已完成边界确认",
    })
    assert r.status_code == 201, r.text
    task = r.json()
    assert task["today_todo_date"] is None
    assert task["thinking"] == "先确认边界，再处理实现"

    r = client.post(f"/api/tasks/{task['task_id']}/today", json={"enabled": True})
    assert r.status_code == 200, r.text
    assert r.json()["today_todo_date"] is not None

    r = client.get("/api/tasks/today")
    assert r.status_code == 200, r.text
    assert any(item["task_id"] == task["task_id"] for item in r.json())

    r = client.post("/api/tasks/today/from-thinking", json={
        "text": "梳理需求\n完成原型\n同步风险",
        "assignee_open_id": admin_user.open_id,
    })
    assert r.status_code == 201, r.text
    generated = r.json()
    assert len(generated) == 3
    assert all(item["task_origin"] == "chat_ai" for item in generated)
    assert all(item["today_todo_date"] is not None for item in generated)
    assert all(item["planned_start_date"][:10] == item["due_date"][:10] for item in generated)

    r = client.post(f"/api/tasks/{task['task_id']}/today", json={"enabled": False})
    assert r.status_code == 200, r.text
    assert r.json()["today_todo_date"] is None


def test_project_task_assignee_auto_added_to_project_members(client, admin_user, db_session):
    assignee = Member(
        open_id="test_auto_project_member",
        name="自动项目成员",
        role="student",
        department=admin_user.department,
        status="active",
        privacy_level="internal",
    )
    db_session.merge(assignee)
    project = Project(
        name="任务执行人自动成员 smoke 项目",
        status="active",
        project_type="personal",
        owner_open_id=admin_user.open_id,
        department=admin_user.department,
        created_by=admin_user.open_id,
    )
    db_session.add(project)
    db_session.commit()

    r = client.post("/api/tasks", json={
        "title": "自动补项目成员任务",
        "project_id": project.project_id,
        "assignee_open_id": assignee.open_id,
        "status": "todo",
    })
    assert r.status_code == 201, r.text
    member = db_session.get(ProjectMember, (project.project_id, assignee.open_id))
    assert member is not None
    assert member.left_at is None
    assert member.tags == "任务执行人"
    db_session.refresh(project)
    assert project.project_type == "team"


def test_project_owner_can_delete_any_task_under_project(client, admin_user, db_session, monkeypatch):
    from app.deps import get_current_user
    from app.services.audit_context import current_actor
    import app.main as appmain
    from app.routers import tasks as tasks_router

    owner = Member(
        open_id="test_project_delete_owner",
        name="删除权限项目负责人",
        role="student",
        department=admin_user.department,
        status="active",
        privacy_level="internal",
    )
    assignee = Member(
        open_id="test_project_delete_assignee",
        name="删除权限任务执行人",
        role="student",
        department=admin_user.department,
        status="active",
        privacy_level="internal",
    )
    db_session.merge(owner)
    db_session.merge(assignee)
    project = Project(
        name="负责人删除任务 smoke 项目",
        status="active",
        project_type="personal",
        owner_open_id=owner.open_id,
        department=owner.department,
        created_by=owner.open_id,
    )
    db_session.add(project)
    db_session.commit()
    task = Task(
        project_id=project.project_id,
        title="负责人可删除的他人任务",
        status="todo",
        assignee_open_id=assignee.open_id,
        created_by=assignee.open_id,
    )
    db_session.add(task)
    db_session.commit()
    db_session.refresh(task)
    task_id = task.task_id

    async def _owner_user():
        current_actor.set(owner.open_id)
        return owner

    async def _noop_delete(table_id, record_id):
        return None

    monkeypatch.setattr(tasks_router, "delete_from_base", _noop_delete, raising=True)
    appmain.app.dependency_overrides[get_current_user] = _owner_user
    try:
        r = client.delete(f"/api/tasks/{task_id}")
        assert r.status_code == 204, r.text
        db_session.expire_all()
        assert db_session.get(Task, task_id) is None
    finally:
        async def _admin_user():
            current_actor.set(admin_user.open_id)
            return admin_user
        appmain.app.dependency_overrides[get_current_user] = _admin_user


def test_task_completion_notifies_creator_and_includes_project_label(client, admin_user, db_session, monkeypatch):
    from app.routers import tasks as tasks_router

    creator = Member(
        open_id="test_task_creator", name="测试任务创建人", role="staff",
        department=admin_user.department, status="active", privacy_level="internal",
    )
    db_session.merge(creator)
    project = Project(
        name="任务标签 smoke 项目",
        tags="产业,重点",
        owner_open_id=creator.open_id,
        created_by=creator.open_id,
        department=admin_user.department,
        project_type="team",
    )
    db_session.add(project)
    db_session.commit()
    db_session.refresh(project)

    calls = []
    monkeypatch.setattr(tasks_router, "notify_task_assigned", lambda **kwargs: True, raising=True)
    monkeypatch.setattr(tasks_router, "notify_task_completed", lambda **kwargs: calls.append(kwargs) or True, raising=True)

    task = Task(
        project_id=project.project_id,
        title="完成通知 smoke 任务",
        status="in_progress",
        assignee_open_id=admin_user.open_id,
        created_by=creator.open_id,
        due_date=datetime.utcnow() + timedelta(days=1),
    )
    db_session.add(task)
    db_session.commit()
    db_session.refresh(task)

    r = client.patch(f"/api/tasks/{task.task_id}", json={"status": "done"})
    assert r.status_code == 200, r.text
    assert r.json()["project_name"] == "任务标签 smoke 项目"
    assert r.json()["project_tags"] == "产业,重点"
    assert r.json()["completed_at"] is not None
    assert calls == [{
        "recipient_open_id": creator.open_id,
        "task_title": "完成通知 smoke 任务",
        "completed_by_name": admin_user.name,
        "project_name": "任务标签 smoke 项目",
        "task_id": task.task_id,
    }]


def test_class_schedule_list_hides_ended_courses_by_default(client, admin_user, db_session):
    old_course = ClassSchedule(
        member_open_id=admin_user.open_id,
        course_name="已结课 smoke 课程",
        semester="2026-spring",
        day_of_week=1,
        start_time=time(9, 0),
        end_time=time(10, 0),
        semester_start=date(2026, 1, 1),
        semester_end=date(2026, 1, 31),
    )
    active_course = ClassSchedule(
        member_open_id=admin_user.open_id,
        course_name="进行中 smoke 课程",
        semester="2026-spring",
        day_of_week=1,
        start_time=time(10, 0),
        end_time=time(11, 0),
        semester_start=date(2026, 1, 1),
        semester_end=date(2026, 12, 31),
    )
    db_session.add_all([old_course, active_course])
    db_session.commit()

    r = client.get("/api/calendar/classes", params={"member_open_id": admin_user.open_id})
    assert r.status_code == 200, r.text
    assert {item["course_name"] for item in r.json()} == {"进行中 smoke 课程"}

    r = client.get("/api/calendar/classes", params={"member_open_id": admin_user.open_id, "active_only": False})
    assert r.status_code == 200, r.text
    assert {item["course_name"] for item in r.json()} == {"已结课 smoke 课程", "进行中 smoke 课程"}


def test_calendar_freebusy_accepts_offset_datetime_for_classes(client, admin_user, db_session):
    course = ClassSchedule(
        member_open_id=admin_user.open_id,
        course_name="空闲查询时区 smoke 课程",
        semester="2026-spring",
        day_of_week=4,
        start_time=time(14, 0),
        end_time=time(15, 0),
        semester_start=date(2026, 1, 1),
        semester_end=date(2026, 12, 31),
    )
    db_session.add(course)
    db_session.commit()

    r = client.get("/api/calendar/freebusy", params={
        "member_ids": admin_user.open_id,
        "start": "2026-06-04T13:30:00+08:00",
        "end": "2026-06-04T15:30:00+08:00",
    })
    assert r.status_code == 200, r.text
    assert any(item["kind"] == "class" and item["title"] == "空闲查询时区 smoke 课程" for item in r.json()["busy"])


def test_calendar_event_project_filter_and_lark_sync(client, admin_user, db_session, monkeypatch):
    project = Project(
        name="日历同步 smoke 项目",
        status="active",
        owner_open_id=admin_user.open_id,
        created_by=admin_user.open_id,
    )
    db_session.add(project)
    db_session.commit()
    db_session.refresh(project)

    event = CalendarEvent(
        event_type="meeting",
        title="项目会议",
        start_at=datetime(2026, 6, 4, 10, 0),
        end_at=datetime(2026, 6, 4, 11, 0),
        organizer_open_id=admin_user.open_id,
        related_project_id=project.project_id,
        sync_status="pulled",
    )
    db_session.add(event)
    db_session.commit()

    r = client.get("/api/calendar/events", params={"related_project_id": project.project_id, "event_type": "meeting"})
    assert r.status_code == 200, r.text
    assert r.json()["total"] == 1
    assert r.json()["items"][0]["title"] == "项目会议"

    def fake_sync(db, calendar_id, start, end, fallback_organizer_open_id):
        return {"calendar_id": calendar_id, "fetched": 2, "created": 1, "updated": 1, "skipped": 0}

    monkeypatch.setattr("app.routers.calendar.sync_lark_calendar_events", fake_sync)
    r = client.post("/api/calendar/events/sync-lark", json={"calendar_id": "feishu.cn_test@group.calendar.feishu.cn"})
    assert r.status_code == 200, r.text
    assert r.json()["fetched"] == 2
    assert r.json()["calendar_id"] == "feishu.cn_test@group.calendar.feishu.cn"


def test_contribution_interaction_counts(client, admin_user):
    r = client.post("/api/contributions", json={
        "member_open_id": admin_user.open_id,
        "type": "document",
        "title": "知识互动 smoke 文档",
        "description": "用于验证点赞和互动计数",
        "occurred_at": "2026-06-04",
        "role_in_contribution": "contributor",
        "hours": 1,
        "tags": "任务知识 project:999 task:999",
    })
    assert r.status_code == 201, r.text
    contribution = r.json()
    assert contribution["like_count"] == 0
    assert contribution["comment_count"] == 0

    r = client.post(f"/api/contributions/{contribution['contribution_id']}/interactions", json={"kind": "like"})
    assert r.status_code == 200, r.text
    assert r.json()["like_count"] == 1
    assert r.json()["comment_count"] == 0

    r = client.post(f"/api/contributions/{contribution['contribution_id']}/interactions", json={"kind": "comment"})
    assert r.status_code == 200, r.text
    assert r.json()["like_count"] == 1
    assert r.json()["comment_count"] == 1

    r = client.get(f"/api/contributions/{contribution['contribution_id']}/comments")
    assert r.status_code == 200, r.text
    assert r.json() == []

    r = client.post(f"/api/contributions/{contribution['contribution_id']}/comments", json={"content": "这个知识可以复用"})
    assert r.status_code == 201, r.text
    comment = r.json()
    assert comment["author_open_id"] == admin_user.open_id
    assert comment["content"] == "这个知识可以复用"

    r = client.get(f"/api/contributions/{contribution['contribution_id']}")
    assert r.status_code == 200, r.text
    assert r.json()["comment_count"] == 2

    r = client.get(f"/api/contributions/{contribution['contribution_id']}/comments")
    assert r.status_code == 200, r.text
    assert [item["content"] for item in r.json()] == ["这个知识可以复用"]


def test_ai_assistant_config_crud(client, admin_user):
    payload = {
        "scope": "department",
        "department": "测试部门",
        "name": "测试部门助手",
        "role": "management",
        "prompt": "关注任务阻塞和知识沉淀",
        "workflow": "每日总结任务风险",
        "cadence": "daily",
        "enabled": True,
    }
    r = client.post("/api/ai-assistants", json=payload)
    assert r.status_code == 201, r.text
    assistant = r.json()
    assert assistant["department"] == "测试部门"
    assert assistant["enabled"] is True

    r = client.get("/api/ai-assistants", params={"department": "测试部门"})
    assert r.status_code == 200, r.text
    assert any(item["assistant_id"] == assistant["assistant_id"] for item in r.json())

    r = client.patch(f"/api/ai-assistants/{assistant['assistant_id']}", json={
        **payload,
        "cadence": "weekly",
        "enabled": False,
    })
    assert r.status_code == 200, r.text
    assert r.json()["cadence"] == "weekly"
    assert r.json()["enabled"] is False


def test_lab_daily_reports_sync_from_base(client, admin_user, monkeypatch):
    def fake_fetch_daily_base_records(limit=100, offset=0):
        return {
            "fields": ["人员", "打卡时间", "今日思路", "每日总结", "今日消息汇总"],
            "record_id_list": ["rec_daily_test"],
            "data": [[
                [{"id": admin_user.open_id, "name": admin_user.name}],
                "2026-06-04 09:00:00",
                "今日思路：完成云实验室日报同步",
                "一、今日完成工作\n接入每日计划和总结",
                "测试群：同步日报数据",
            ]],
            "has_more": False,
        }

    monkeypatch.setattr("app.services.lark_daily_plan_sync.fetch_daily_base_records", fake_fetch_daily_base_records)
    r = client.post("/api/lab/daily-reports/sync")
    assert r.status_code == 200, r.text
    assert r.json()["fetched"] == 1

    r = client.get("/api/lab/daily-reports", params={"member_open_id": admin_user.open_id})
    assert r.status_code == 200, r.text
    rows = r.json()
    assert rows[0]["base_record_id"] == "rec_daily_test"
    assert rows[0]["today_thinking"] == "今日思路：完成云实验室日报同步"
    assert rows[0]["daily_summary"].startswith("一、今日完成工作")


def test_lab_message_config_and_mention_send(client, admin_user, monkeypatch):
    r = client.get("/api/lab/message-config")
    assert r.status_code == 200, r.text
    assert r.json()["manager_open_id"] == admin_user.open_id
    assert r.json()["chat_id"] is None

    r = client.post("/api/lab/messages/mention", json={
        "target_open_id": admin_user.open_id,
        "message": "现在方便同步一下吗",
    })
    assert r.status_code == 400, r.text

    r = client.put("/api/lab/message-config", json={
        "chat_id": "oc_test_cloud_lab",
        "chat_name": "云实验室测试群",
    })
    assert r.status_code == 200, r.text
    assert r.json()["chat_id"] == "oc_test_cloud_lab"

    sent = {}

    def fake_send(chat_id, text, identity="user"):
        sent["chat_id"] = chat_id
        sent["text"] = text
        sent["identity"] = identity
        return True

    monkeypatch.setattr("app.routers.lab._lark_cli_user_identity", lambda: {
        "open_id": admin_user.open_id,
        "name": admin_user.name,
    })
    monkeypatch.setattr("app.routers.lab._send_chat_text", fake_send)
    monkeypatch.setattr("app.routers.lab.visible_chat_options", lambda **kwargs: [{
        "chat_id": "oc_common_chat",
        "chat_name": "共同项目群",
        "member_count": 6,
        "updated_at": None,
    }])

    r = client.get("/api/lab/messages/common-chats", params={"target_open_id": admin_user.open_id})
    assert r.status_code == 200, r.text
    assert r.json()[0]["chat_id"] == "oc_common_chat"

    r = client.post("/api/lab/messages/mention", json={
        "target_open_id": admin_user.open_id,
        "message": "现在方便同步一下吗",
        "chat_id": "oc_common_chat",
    })
    assert r.status_code == 200, r.text
    assert sent["chat_id"] == "oc_common_chat"
    assert sent["identity"] == "user"
    assert r.json()["send_as"] == "user"
    assert r.json()["sender_open_id"] == admin_user.open_id
    assert f'user_id="{admin_user.open_id}"' in sent["text"]
    assert "现在方便同步一下吗" in sent["text"]

    monkeypatch.setattr("app.routers.lab._lark_cli_user_identity", lambda: {
        "open_id": "ou_other_sender",
        "name": "其他授权人",
    })
    r = client.post("/api/lab/messages/mention", json={
        "target_open_id": admin_user.open_id,
        "message": "这条不应该代发",
        "chat_id": "oc_common_chat",
    })
    assert r.status_code == 409, r.text
    assert "不是当前登录人" in r.json()["detail"]


def test_lab_space_resource_reservation_and_occupancy_flow(client, admin_user):
    today_start = datetime.now().replace(hour=9, minute=0, second=0, microsecond=0)
    today_end = today_start + timedelta(hours=1)
    today_conflict_start = today_start + timedelta(minutes=30)
    today_conflict_end = today_start + timedelta(hours=1, minutes=30)
    today_occupancy_start = today_start + timedelta(minutes=15)
    r = client.post("/api/lab/spaces", json={
        "code": "smoke-room-101",
        "name": "Smoke 研发室 101",
        "space_type": "room",
        "capacity": 12,
        "location_label": "A 栋 1F",
        "metadata": {"zone": "east"},
    })
    assert r.status_code == 201, r.text
    space = r.json()
    assert space["metadata"] == {"zone": "east"}

    r = client.post("/api/lab/resources", json={
        "space_id": space["space_id"],
        "code": "smoke-meeting-room",
        "name": "Smoke 会议室",
        "resource_type": "meeting_room",
        "capacity": 8,
        "bookable": True,
        "requires_approval": True,
        "specs": {"screen": True},
    })
    assert r.status_code == 201, r.text
    resource = r.json()
    assert resource["specs"] == {"screen": True}

    reservation_payload = {
        "resource_id": resource["resource_id"],
        "title": "Smoke 周会",
        "purpose": "接口链路验证",
        "start_at": today_start.isoformat(),
        "end_at": today_end.isoformat(),
        "attendee_open_ids": [admin_user.open_id],
    }
    r = client.post("/api/lab/reservations", json=reservation_payload)
    assert r.status_code == 201, r.text
    reservation = r.json()
    assert reservation["status"] == "pending"
    assert reservation["space_id"] == space["space_id"]
    assert reservation["attendee_open_ids"] == [admin_user.open_id]

    r = client.post("/api/lab/reservations", json={
        **reservation_payload,
        "title": "Smoke 冲突预约",
        "start_at": today_conflict_start.isoformat(),
        "end_at": today_conflict_end.isoformat(),
    })
    assert r.status_code == 409

    r = client.patch(f"/api/lab/reservations/{reservation['reservation_id']}/decision", json={
        "approved": True,
        "comment": "smoke approved",
    })
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "approved"
    assert r.json()["review_comment"] == "smoke approved"

    r = client.post("/api/lab/occupancy", json={
        "space_id": space["space_id"],
        "resource_id": resource["resource_id"],
        "status": "meeting",
        "source": "manual",
        "confidence": 0.9,
        "note": "smoke occupancy",
    })
    assert r.status_code == 201, r.text
    occupancy = r.json()
    assert occupancy["member_open_id"] == admin_user.open_id
    assert occupancy["status"] == "meeting"

    r = client.post("/api/lab/occupancy", json={
        "space_id": space["space_id"],
        "status": "working",
        "source": "manual",
        "confidence": 0.8,
        "member_open_id": admin_user.open_id,
        "started_at": today_occupancy_start.isoformat(),
    })
    assert r.status_code == 201, r.text
    assert r.json()["occupancy_id"] == occupancy["occupancy_id"]
    assert r.json()["status"] == "working"
    assert r.json()["started_at"].startswith(today_occupancy_start.isoformat())

    r = client.get("/api/lab/occupancy", params={"space_id": space["space_id"]})
    assert r.status_code == 200
    assert r.json()["total"] >= 1

    r = client.get("/api/lab/overview")
    assert r.status_code == 200, r.text
    overview = r.json()
    assert overview["spaces_total"] >= 1
    assert overview["resources_total"] >= 1
    assert overview["resources_by_status"]["available"] >= 1
    assert overview["pending_reservations"] == 0
    assert overview["todays_reservations"] >= 1
    assert overview["active_occupancy"] >= 1


def test_project_create_sends_lark_notifications_to_initial_members(client, admin_user, db_session, monkeypatch):
    from app.routers import projects as projects_router

    member = Member(
        open_id="test_project_member", name="测试项目成员", role="staff",
        department="测试", status="active", privacy_level="internal",
    )
    db_session.merge(member)
    db_session.commit()

    calls = []

    def fake_notify(**kwargs):
        calls.append(kwargs)
        return True

    monkeypatch.setattr(projects_router, "notify_project_member_added", fake_notify, raising=True)

    r = client.post("/api/projects", json={
        "name": "通知 smoke 项目",
        "members": [{"member_open_id": member.open_id, "role": "member", "share_ratio": 0.5}],
    })
    assert r.status_code == 201, r.text
    project_id = r.json()["project_id"]
    assert r.json()["publication_status"] == "draft"
    assert calls == []

    r = client.post(f"/api/projects/{project_id}/publish")
    assert r.status_code == 200, r.text
    assert calls == [
        {
            "member_open_id": member.open_id,
            "project_name": "通知 smoke 项目",
            "role": "member",
            "added_by_name": admin_user.name,
            "project_id": project_id,
        },
    ]
    assert db_session.get(ProjectMember, (project_id, admin_user.open_id)) is None

    r = client.patch(f"/api/projects/{project_id}/members/{member.open_id}", json={
        "member_open_id": member.open_id,
        "role": "co_lead",
        "share_ratio": 0.35,
        "tags": "算法,联调",
    })
    assert r.status_code == 200, r.text
    assert r.json()["role"] == "co_lead"
    assert r.json()["share_ratio"] == 0.35
    assert r.json()["tags"] == "算法,联调"


def test_project_type_filter_is_relative_to_executor_membership(client, admin_user, db_session, monkeypatch):
    from app.routers import projects as projects_router

    monkeypatch.setattr(projects_router, "notify_project_member_added", lambda **kwargs: True, raising=True)

    member = Member(
        open_id="test_team_executor", name="测试执行成员", role="staff",
        department=admin_user.department, status="active", privacy_level="internal",
    )
    db_session.merge(member)
    db_session.commit()

    r = client.post("/api/projects", json={
        "name": "监督型团队项目",
        "project_type": "team",
        "members": [{"member_open_id": member.open_id, "share_ratio": 0.0}],
    })
    assert r.status_code == 201, r.text
    team_project_id = r.json()["project_id"]
    assert db_session.get(ProjectMember, (team_project_id, admin_user.open_id)) is None

    r = client.post("/api/projects", json={"name": "需要本人跟进的个人项目", "project_type": "personal"})
    assert r.status_code == 201, r.text
    personal_project_id = r.json()["project_id"]
    assert db_session.get(ProjectMember, (personal_project_id, admin_user.open_id)) is not None

    r = client.get("/api/projects", params={"project_type": "team", "page_size": 100})
    assert r.status_code == 200, r.text
    team_ids = {item["project_id"] for item in r.json()["items"]}
    assert team_project_id in team_ids
    assert personal_project_id not in team_ids

    r = client.get("/api/projects", params={"project_type": "personal", "page_size": 100})
    assert r.status_code == 200, r.text
    personal_ids = {item["project_id"] for item in r.json()["items"]}
    assert personal_project_id in personal_ids
    assert team_project_id not in personal_ids


def test_project_chat_link_and_sync(client, admin_user, db_session, monkeypatch):
    from app.services import lark_chat_sync

    r = client.post("/api/projects", json={"name": "群聊同步 smoke 项目"})
    assert r.status_code == 201, r.text
    project_id = r.json()["project_id"]

    r = client.post(f"/api/projects/{project_id}/chats", json={
        "chat_id": "oc_smoke_chat",
        "chat_name": "同步测试群",
        "selected_topic_key": "omt_smoke_topic",
        "selected_topic_title": "项目话题 A",
    })
    assert r.status_code == 201, r.text
    chat_id = r.json()["project_chat_id"]

    def fake_fetch_thread_messages(*args, **kwargs):
        return {
            "has_more": False,
            "messages": [
                {
                    "message_id": "om_root",
                    "thread_id": "omt_smoke_topic",
                    "content": "项目话题 A",
                    "create_time": "2026-05-29 10:00",
                    "msg_type": "text",
                    "sender": {"id": admin_user.open_id, "name": admin_user.name, "sender_type": "user"},
                },
                {
                    "message_id": "om_reply",
                    "root_id": "om_root",
                    "thread_id": "omt_smoke_topic",
                    "content": "项目话题 A 最新进展",
                    "create_time": "2026-05-29 10:15",
                    "msg_type": "text",
                    "sender": {"id": admin_user.open_id, "name": admin_user.name, "sender_type": "user"},
                },
            ],
        }

    monkeypatch.setattr(lark_chat_sync, "fetch_thread_messages", fake_fetch_thread_messages, raising=True)

    r = client.post(f"/api/projects/{project_id}/chats/{chat_id}/sync", json={"page_size": 50, "max_pages": 1})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["fetched"] == 2
    assert body["inserted"] == 2
    assert body["message_count"] == 2
    assert body["latest_message_at"] is not None

    r = client.get(f"/api/projects/{project_id}/chats/{chat_id}/topics")
    assert r.status_code == 200, r.text
    topics = r.json()
    assert len(topics) == 1
    assert topics[0]["topic_key"] == "omt_smoke_topic"
    assert topics[0]["reply_count"] == 2
    assert topics[0]["last_reply_at"] is not None
    assert db_session.query(ProjectChatMessage).filter_by(project_chat_id=chat_id).count() == 2

    r = client.get(f"/api/projects/{project_id}")
    assert r.status_code == 200, r.text
    assert r.json()["chats"][0]["latest_topic_reply_at"] is not None


def test_developer_can_view_all_projects_and_project_tasks(client, db_session):
    from app.deps import get_current_user
    from app.main import app
    from app.services.audit_context import current_actor

    developer = Member(
        open_id="ou_20fec537961e0a66669370b00d0fc52d",
        name="开发者",
        role="admin",
        department="科技部",
        status="active",
        privacy_level="internal",
    )
    owner = Member(
        open_id="test_hidden_project_owner",
        name="项目负责人",
        role="student",
        department="外部部门",
        status="active",
        privacy_level="internal",
    )
    outsider = Member(
        open_id="test_project_outsider",
        name="项目无关人员",
        role="student",
        department="其他部门",
        status="active",
        privacy_level="internal",
    )
    db_session.merge(developer)
    db_session.merge(owner)
    db_session.merge(outsider)
    db_session.flush()
    project = Project(
        name="开发者可见 smoke 项目",
        status="active",
        project_type="personal",
        owner_open_id=owner.open_id,
        department=owner.department,
        created_by=owner.open_id,
    )
    db_session.add(project)
    db_session.flush()
    task = Task(
        project_id=project.project_id,
        title="开发者可见 smoke 任务",
        assignee_open_id=owner.open_id,
        created_by=owner.open_id,
    )
    db_session.add(task)
    db_session.commit()

    async def use_developer():
        current_actor.set(developer.open_id)
        return developer

    async def use_outsider():
        current_actor.set(outsider.open_id)
        return outsider

    previous_override = app.dependency_overrides.get(get_current_user)
    try:
        app.dependency_overrides[get_current_user] = use_developer
        r = client.get("/api/projects", params={"status": "active", "page_size": 200})
        assert r.status_code == 200, r.text
        assert project.project_id in {item["project_id"] for item in r.json()["items"]}

        r = client.get(f"/api/projects/{project.project_id}")
        assert r.status_code == 200, r.text
        assert r.json()["project_id"] == project.project_id

        r = client.get("/api/tasks", params={"project_id": project.project_id})
        assert r.status_code == 200, r.text
        assert task.task_id in {item["task_id"] for item in r.json()["items"]}

        app.dependency_overrides[get_current_user] = use_outsider
        r = client.get(f"/api/projects/{project.project_id}")
        assert r.status_code == 403
    finally:
        if previous_override is None:
            app.dependency_overrides.pop(get_current_user, None)
        else:
            app.dependency_overrides[get_current_user] = previous_override


# ============ v3 积分规则 smoke ============

def test_v3_paper_tier_keys():
    assert paper_tier_key("中科院一区") == "sci_1"
    assert paper_tier_key("JCR Q1") == "sci_2"
    assert paper_tier_key("CCF-A") == "ccf_a_b"
    assert paper_tier_key("CCF C") == "ccf_c"
    assert paper_tier_key("EI") == "ei"
    assert paper_tier_key("北大核心") == "core_zh"
    assert paper_tier_key("CSSCI") == "core_zh"
    assert paper_tier_key("") == "other"
    assert paper_pool("中科院一区") == 100
    assert paper_pool("CCF-A") == 50
    assert paper_pool("EI") == 35


def test_v3_grant_points():
    assert grant_points("national", "approved") == 100
    assert grant_points("national", "applied") == 8
    assert grant_points("provincial", "approved") == 30
    assert grant_points("school", "applied") == 1
    assert grant_points("horizontal", "approved") == 0
    assert grant_points("bogus", "approved") == 0


def test_v3_ip_classify_and_points():
    assert classify_award_to_ip("发明专利", "授权", "X 发明专利授权") == "invention_granted"
    assert classify_award_to_ip("发明专利", None, "Y 发明专利申请受理") == "invention_applied"
    assert classify_award_to_ip("实用新型", None, "Z") == "utility_granted"
    assert classify_award_to_ip("软件著作权", None, "管理系统软著") == "software_copyright"
    assert classify_award_to_ip("华为认证", "行业", "HCIA") is None
    assert ip_points("invention_granted") == 60
    assert ip_points("software_copyright") == 8


def test_v4_industrial_curve_and_penalty():
    # v4: 金额走对数压缩曲线, 锚点 3 万 = 100 分 (不再 1 元 = 1 分)
    assert industrial_points(30000.0) == 100.0
    assert industrial_points(10000.0) == 61.2
    assert industrial_points(0) == 0
    assert industrial_points(-50) == 0
    # 边际递减: 金额翻 5 倍, 积分远不到 5 倍
    assert industrial_points(150000.0) < industrial_points(30000.0) * 2
    assert penalty_amount("deadline_minor") == -5
    assert penalty_amount("data_fraud") == -50
    assert penalty_amount("violation", custom=25) == -25
    assert penalty_amount("bogus") == 0


def test_v3_category_inference():
    assert category_of("paper") == "business"
    assert category_of("competition") == "business"
    assert category_of("contribution") == "public"
    assert category_of("industrial") == "industrial"
    assert category_of("penalty") == "penalty"
    assert category_of("grant") == "business"
    assert category_of("ip") == "business"


def test_v3_grant_submit_writes_ledger(client, admin_user, db_session):
    r = client.post("/api/grants", json={
        "member_open_id": admin_user.open_id,
        "level": "provincial", "grant_status": "approved",
        "name": "广西自科基金-AI 安全研究", "occurred_on": "2026-04-10",
    })
    assert r.status_code == 201, r.text
    ledger_id = r.json()["ledger_id"]
    assert r.json()["final_points"] == 30
    row = db_session.get(PointsLedger, ledger_id)
    assert row is not None
    assert row.source_type == "grant"
    assert row.category == "business"
    assert row.calculation_rule_version.startswith("v4-")


def test_v3_industrial_submit_writes_ledger(client, admin_user, db_session):
    teammate = Member(
        open_id="test_dev_teammate", name="测试开发成员", role="staff",
        department="测试", status="active", privacy_level="internal",
    )
    db_session.merge(teammate)
    db_session.commit()

    r = client.post("/api/industrial", json={
        "members": [
            {"member_open_id": admin_user.open_id, "role": "owner"},
            {"member_open_id": teammate.open_id, "role": "support"},
        ],
        "amount_yuan": 50000.0, "scene": "contract",
        "occurred_on": "2026-04-15",
    })
    assert r.status_code == 201, r.text
    body = r.json()
    assert len(body["ledger_ids"]) == 2
    assert body["total_points"] == 119.8
    rows = [db_session.get(PointsLedger, ledger_id) for ledger_id in body["ledger_ids"]]
    assert all(row is not None for row in rows)
    assert {row.member_open_id for row in rows} == {admin_user.open_id, teammate.open_id}
    assert {row.source_id for row in rows} == {rows[0].source_id}
    assert all(row.category == "industrial" for row in rows)
    # v4: 5 万元走对数曲线 ≈ 119.8 分 (不再 = 50000)
    assert sorted([row.final_points for row in rows]) == [15.6, 104.2]
    assert all(row.source_type == "industrial" for row in rows)


def test_v4_industrial_project_key_counts_increment_only(client, admin_user, db_session):
    teammate = Member(
        open_id="test_dev_teammate_increment", name="测试开发成员增量", role="staff",
        department="测试", status="active", privacy_level="internal",
    )
    db_session.merge(teammate)
    db_session.commit()

    base_payload = {
        "members": [
            {"member_open_id": admin_user.open_id, "role": "owner"},
            {"member_open_id": teammate.open_id, "role": "support"},
        ],
        "scene": "contract",
        "occurred_on": "2026-04-15",
        "project_key": "contract-smoke-2026",
    }

    first = client.post("/api/industrial", json={**base_payload, "amount_yuan": 20000.0})
    assert first.status_code == 201, first.text
    assert first.json()["total_points"] == 84.9

    second = client.post("/api/industrial", json={**base_payload, "amount_yuan": 30000.0})
    assert second.status_code == 201, second.text
    body = second.json()
    # 同项目累计 2 万 + 3 万 = 5 万, 第二次只给 f(5万)-f(2万), 防止拆单拿 f(2万)+f(3万)
    assert body["total_points"] == 34.9
    rows = [db_session.get(PointsLedger, ledger_id) for ledger_id in body["ledger_ids"]]
    snapshots = [json.loads(row.source_snapshot_json) for row in rows]
    assert {snap["project_key"] for snap in snapshots} == {"contract-smoke-2026"}
    assert {snap["cumulative_amount_before"] for snap in snapshots} == {20000.0}
    assert {snap["cumulative_amount_after"] for snap in snapshots} == {50000.0}
    assert sorted([row.final_points for row in rows]) == [4.6, 30.3]


def test_v3_penalty_submit_writes_negative_ledger(client, admin_user, db_session):
    r = client.post("/api/penalties", json={
        "member_open_id": admin_user.open_id,
        "kind": "data_fraud",
        "reason": "smoke 测试用例: 模拟数据造假认定",
        "occurred_on": "2026-04-20",
    })
    assert r.status_code == 201, r.text
    row = db_session.get(PointsLedger, r.json()["ledger_id"])
    assert row.category == "penalty"
    assert row.final_points == -50
    assert row.base_points == -50


def test_competitions_double_write_to_base(client, admin_user, db_session, monkeypatch):
    """POST/DELETE /api/competitions 双写到 Base, 校验 base_record_id 落表."""
    from app.models import Competition
    from app.routers import competitions as comp_router

    pushed: list[tuple[str, str | None]] = []
    deleted: list[str] = []

    async def fake_push(table_id, fields, record_id=None):
        pushed.append((table_id, record_id))
        return {"record_id": record_id or "rec_smoke_comp_001"}

    async def fake_delete(table_id, record_id):
        deleted.append(record_id)

    monkeypatch.setattr(comp_router, "push_record_to_base", fake_push, raising=True)
    monkeypatch.setattr(comp_router, "delete_record_from_base", fake_delete, raising=True)
    monkeypatch.setattr(comp_router.settings, "lark_table_competitions", "tbl_test_comp", raising=False)

    r = client.post("/api/competitions", json={
        "name": "smoke-comp", "organizer": "测试主办方",
        "level": "国家级", "award_level": "一等奖",
        "end_date": "2026-04-30",
        "members": [],
        "team_lead_open_id": admin_user.open_id,
    })
    assert r.status_code == 201, r.text
    comp_id = r.json()["comp_id"]
    assert pushed and pushed[0][0] == "tbl_test_comp"

    row = db_session.get(Competition, comp_id)
    assert row is not None and row.base_record_id == "rec_smoke_comp_001"

    r = client.delete(f"/api/competitions/{comp_id}")
    assert r.status_code == 204
    assert "rec_smoke_comp_001" in deleted


def test_v3_award_softcopy_writes_ip_ledger(client, admin_user, db_session):
    before = db_session.query(PointsLedger).filter_by(source_type="ip").count()
    r = client.post("/api/awards", json={
        "recipient_open_id": admin_user.open_id,
        "name": "学生档案管理系统软著",
        "level": "国家级", "category": "软件著作权",
        "issuer": "国家版权局", "award_date": "2026-03-15",
        "created_by": admin_user.open_id,
    })
    assert r.status_code == 201, r.text
    after = db_session.query(PointsLedger).filter_by(source_type="ip").count()
    assert after == before + 1
    last = (
        db_session.query(PointsLedger)
        .filter_by(source_type="ip")
        .order_by(PointsLedger.ledger_id.desc())
        .first()
    )
    assert last.final_points == 8  # software_copyright
    assert last.category == "business"
