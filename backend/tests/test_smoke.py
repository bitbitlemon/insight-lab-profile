"""smoke: health / JWT refresh / awards / audit / paper_authors + v3 积分路由 + 规则."""
import json

from app.models import AuditLog, Member, Paper, PaperAuthor, PointsLedger
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
