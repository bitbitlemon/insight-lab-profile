"""pytest fixtures: 隔离的内存 DB + TestClient + 一个 admin user。"""
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

# 先于 app 导入设置 env, 避免污染生产 DB
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("LARK_BASE_APP_TOKEN", "")  # 关闭 Base 写穿透
os.environ.setdefault("JWT_SECRET", "test-secret-do-not-use-in-prod")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.deps import get_current_user
from app.middleware import limiter
from app.models import Member
from app.services.audit import install_audit_listeners
from app.services.audit_context import current_actor


@pytest.fixture(scope="session")
def test_engine():
    # StaticPool 让所有连接共享一个 :memory: 数据库 (否则每个 conn 一份空 DB)
    eng = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(eng)
    install_audit_listeners()
    return eng


@pytest.fixture
def db_session(test_engine):
    Session = sessionmaker(bind=test_engine, autoflush=False, autocommit=False)
    s = Session()
    try:
        yield s
    finally:
        s.rollback()
        s.close()


@pytest.fixture
def admin_user(db_session):
    u = db_session.get(Member, "test_admin_open_id")
    if u is None:
        u = Member(
            open_id="test_admin_open_id", name="测试管理员", role="admin",
            department="测试", status="active", privacy_level="internal",
        )
        db_session.add(u); db_session.commit()
    return u


@pytest.fixture
def client(test_engine, admin_user, monkeypatch):
    # 测试不跑 scheduler / listener (会拉飞书 + WebSocket)
    import app.main as appmain
    monkeypatch.setattr(appmain, "start_scheduler", lambda: None, raising=False)
    monkeypatch.setattr(appmain, "stop_scheduler", lambda: None, raising=False)
    monkeypatch.setattr(appmain, "start_listener", lambda: None, raising=False)
    async def _astop():
        return None
    monkeypatch.setattr(appmain, "stop_listener", _astop, raising=False)

    # 测试时禁用 Base 写穿透 (没有真飞书 token), router 已 import 这两个名字, patch 调用点
    async def _noop_push(table_id, fields, record_id=None):
        return {"record_id": record_id}
    async def _noop_delete(table_id, record_id):
        return None
    for mod in ("app.routers.papers", "app.routers.awards", "app.routers.trainings",
                "app.routers.advising", "app.routers.competitions", "app.routers.members"):
        try:
            m = __import__(mod, fromlist=["*"])
            if hasattr(m, "push_record_to_base"):
                monkeypatch.setattr(m, "push_record_to_base", _noop_push, raising=False)
            if hasattr(m, "delete_record_from_base"):
                monkeypatch.setattr(m, "delete_record_from_base", _noop_delete, raising=False)
        except ImportError:
            pass

    app = appmain.app
    Session = sessionmaker(bind=test_engine, autoflush=False, autocommit=False)

    def _override_db():
        s = Session()
        try:
            yield s
        finally:
            s.close()

    async def _override_user():
        # async dep 直接在请求 task 里跑, ContextVar set 立即对后续 ORM 事件可见
        current_actor.set(admin_user.open_id)
        return admin_user

    app.dependency_overrides[get_db] = _override_db
    app.dependency_overrides[get_current_user] = _override_user
    limiter.enabled = False
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
    limiter.enabled = True
