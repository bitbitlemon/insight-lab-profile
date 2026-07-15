from __future__ import annotations

from app.models import Member

PROJECT_BUSINESS_UNITS = (
    "教育科技",
    "公安政法",
    "安全情报",
    "具身智能",
    "人工智能协会",
)

PROJECT_CATEGORY_LABELS = {
    "paper": "论文项",
    "competition": "竞赛项目",
    "grant": "申报书项目",
    "platform": "平台开发项目",
}

WORKFLOW_STAGE_LABELS = {
    "initiation": "立项确认",
    "design": "方案设计",
    "preparation": "资料/资源准备",
    "execution": "执行推进",
    "review": "阶段评审",
    "delivery": "提交/发布/验收",
    "archive": "复盘归档",
}

DEPARTMENT_PROJECT_CATEGORY_ACCESS = {
    "科技部": {"paper", "competition", "grant"},
    "研发部": {"platform", "grant"},
}

SUPER_ADMIN_NAMES = {"沈洁", "罗起宁", "秦振凯"}

SUPER_ADMIN_OPEN_IDS = {
    "ou_20fec537961e0a66669370b00d0fc52d",  # 罗起宁
    "ou_fa34ee4440459aee67a7c1b3aa3baf0d",  # 罗起宁 (飞书 H5 登录 open_id)
    "ou_c544c4877658cfa1df6cee41939b99c4",  # 秦振凯
}


def member_is_super_admin(member: Member | None) -> bool:
    if member is None:
        return False
    return member.open_id in SUPER_ADMIN_OPEN_IDS or member.name in SUPER_ADMIN_NAMES


def member_has_assignment(db, member: Member | None, role_key: str, scope_type: str | None = None, scope_value: str | None = None) -> bool:
    if member is None:
        return False
    from sqlalchemy import select
    from app.models import PermissionAssignment

    stmt = (
        select(PermissionAssignment.assignment_id)
        .where(PermissionAssignment.member_open_id == member.open_id)
        .where(PermissionAssignment.role_key == role_key)
        .where(PermissionAssignment.active.is_(True))
        .limit(1)
    )
    if scope_type is not None:
        stmt = stmt.where(PermissionAssignment.scope_type == scope_type)
    if scope_value is not None:
        stmt = stmt.where(PermissionAssignment.scope_value == scope_value)
    return db.execute(stmt).first() is not None


def member_is_super_admin_for_db(db, member: Member | None) -> bool:
    return member_is_super_admin(member) or member_has_assignment(db, member, "super_admin", "global")


def member_scope_values(db, member: Member | None, role_keys: set[str], scope_type: str) -> set[str]:
    if member is None:
        return set()
    from sqlalchemy import select
    from app.models import PermissionAssignment

    rows = db.execute(
        select(PermissionAssignment.scope_value)
        .where(PermissionAssignment.member_open_id == member.open_id)
        .where(PermissionAssignment.role_key.in_(role_keys))
        .where(PermissionAssignment.scope_type == scope_type)
        .where(PermissionAssignment.active.is_(True))
    ).scalars().all()
    return {row for row in rows if row}


def business_unit_text_variants(values: set[str]) -> set[str]:
    variants: set[str] = set()
    for value in values:
        normalized = normalize_business_unit(value)
        if not normalized:
            continue
        variants.update({normalized, f"{normalized} BU", f"{normalized}BU", f"{normalized}事业部"})
    return variants


def member_business_unit_scopes(db, member: Member | None) -> set[str]:
    return member_scope_values(db, member, {"bu_minister", "bu_deputy"}, "bu")


def member_department_scopes(db, member: Member | None) -> set[str]:
    return member_scope_values(db, member, {"department_minister", "department_deputy"}, "department")


def member_can_manage_project_scope(db, member: Member | None, project) -> bool:
    if member_is_super_admin_for_db(db, member):
        return True
    project_unit = normalize_business_unit(getattr(project, "department", None))
    if project_unit and project_unit in member_business_unit_scopes(db, member):
        return True
    project_department = getattr(project, "department", None)
    return bool(project_department and project_department in member_department_scopes(db, member))


def normalize_business_unit(value: str | None) -> str | None:
    if not value:
        return None
    text = value.strip()
    for suffix in (" BU", "BU", "事业部"):
        if text.endswith(suffix):
            text = text[: -len(suffix)].strip()
    return text if text in PROJECT_BUSINESS_UNITS else None
