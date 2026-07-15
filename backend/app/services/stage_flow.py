"""七阶段流程状态机: 阶段顺序、模板种子、审批通过后的阶段推进。"""
from __future__ import annotations

import json
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    Project,
    ProjectLog,
    ProjectStageCheck,
    ProjectStageTransition,
    StageChecklistTemplate,
)

SEVEN_STAGES = ["启动阶段", "设计阶段", "验证阶段", "内测阶段", "迭代阶段", "交付阶段", "归档阶段"]

PROJECT_CATEGORIES = ["论文写作", "产品研发", "项目申报", "竞赛筹备"]

# 与前端 stageStandardItems 保持一致的标准检查项 (首次启动时落库, 之后以库为准)
STAGE_STANDARD_ITEMS: dict[str, dict[str, list[str]]] = {
    "论文写作": {
        "启动阶段": ["已确定论文选题方向", "已确认指导人", "已确认核心作者/协作成员", "参考论文清单已建立"],
        "设计阶段": ["方法创新点已说明", "模型/实验结构已画出", "baseline 与对比方法已确定", "实验排期已确认"],
        "验证阶段": ["baseline 实验已跑通", "核心指标已记录", "失败样例或问题已归因", "实验日志/代码版本可追溯"],
        "内测阶段": ["论文初稿已形成", "实验补充清单已完成", "指导人已给出初审意见", "图表和引用完整性已检查"],
        "迭代阶段": ["返修问题已逐条关闭", "补实验结果已回填", "论文修改说明已更新", "版本差异可追溯"],
        "交付阶段": ["投稿论文最终版已确认", "投稿系统/会议链接已填写", "作者顺序与单位已确认", "投稿凭证或截图已留存"],
        "归档阶段": ["代码仓库链接已归档", "实验复现包已整理", "论文模板/经验已沉淀", "关键数据路径已记录"],
    },
    "产品研发": {
        "启动阶段": ["需求负责人已确认", "PRD 初稿已创建", "目标用户/使用场景已明确", "核心成员分工已确认"],
        "设计阶段": ["系统架构图已确认", "UI 原型/设计稿已确认", "接口边界已明确", "关键风险已列出"],
        "验证阶段": ["MVP/demo 已可访问", "核心流程已跑通", "验证反馈已记录", "阻塞问题已有负责人"],
        "内测阶段": ["内测版本已发布", "内测成员名单已确认", "bug 记录已建立", "严重问题已分级"],
        "迭代阶段": ["功能优化项已关闭", "版本变更记录已更新", "回归测试已通过", "上线风险已复核"],
        "交付阶段": ["正式版本已上线", "访问链接/部署地址已填写", "验收人已确认", "上线记录已留存"],
        "归档阶段": ["技术文档已归档", "部署/运维说明已补齐", "知识沉淀已完成", "后续维护人已确认"],
    },
    "项目申报": {
        "启动阶段": ["申报方向已确定", "申报指南/参考项目已收集", "指导人已确认", "申报成员与分工已确认"],
        "设计阶段": ["技术路线已明确", "申报书结构已定稿", "预算/成果指标已初步确认", "材料责任人已分配"],
        "验证阶段": ["可行性分析已完成", "关键数据/案例已核验", "风险与替代方案已补充", "指导人已确认可继续"],
        "内测阶段": ["申报书初稿已完成", "内部评审意见已收集", "附件材料缺口已列出", "修改责任人已明确"],
        "迭代阶段": ["申报书修订版已更新", "评审意见已逐条回应", "附件/证明材料已补齐", "格式合规性已检查"],
        "交付阶段": ["正式提交入口/链接已记录", "提交状态已确认", "提交截图/回执已留存", "最终版材料已归档"],
        "归档阶段": ["经验总结已完成", "申报模板已沉淀", "评审问题已归档", "后续跟进时间点已记录"],
    },
    "竞赛筹备": {
        "启动阶段": ["赛题分析已完成", "是否完成报名已确认", "队长与队员名单已确定", "指导老师/顾问已确认"],
        "设计阶段": ["竞赛方案已确定", "任务分工已确认", "作品形态和评分点已对齐", "关键时间节点已排期"],
        "验证阶段": ["demo 已跑通", "核心亮点已验证", "风险问题已记录", "评测/路演反馈已收集"],
        "内测阶段": ["作品初稿已形成", "PPT 初版已完成", "演示流程已走通", "内部评审意见已记录"],
        "迭代阶段": ["冲刺优化项已关闭", "PPT/作品已更新", "路演稿已打磨", "提交前检查清单已完成"],
        "交付阶段": ["最终提交材料已上传", "提交平台链接/截图已留存", "报名/提交状态已确认", "答辩或展示安排已记录"],
        "归档阶段": ["竞赛复盘已完成", "获奖/排名结果已记录", "作品与 PPT 已归档", "可复用经验已沉淀"],
    },
}


def project_category_from_tags(tags: str | None) -> str | None:
    if not tags:
        return None
    for tag in tags.split(","):
        tag = tag.strip()
        if tag in PROJECT_CATEGORIES:
            return tag
    return None


def next_stage(stage: str | None) -> str | None:
    if stage not in SEVEN_STAGES:
        return None
    idx = SEVEN_STAGES.index(stage)
    return SEVEN_STAGES[idx + 1] if idx + 1 < len(SEVEN_STAGES) else None


def seed_stage_templates(db: Session) -> int:
    """表为空时把标准检查项落库; 已有数据则不动 (以库为准)。返回插入条数。"""
    existing = db.execute(select(StageChecklistTemplate.template_id).limit(1)).first()
    if existing:
        return 0
    count = 0
    for category, stages in STAGE_STANDARD_ITEMS.items():
        for stage_title, items in stages.items():
            for order, item_text in enumerate(items):
                db.add(StageChecklistTemplate(
                    project_category=category,
                    stage_title=stage_title,
                    item_text=item_text,
                    required=True,
                    sort_order=order,
                ))
                count += 1
    db.commit()
    return count


def missing_required_checks(db: Session, project: Project, stage_title: str | None) -> list[str]:
    """返回该项目该阶段还没完成的必填检查项 (没有模板则不强制)。"""
    if not stage_title:
        return []
    category = project_category_from_tags(project.tags)
    if not category:
        return []
    required_items = db.execute(
        select(StageChecklistTemplate.item_text).where(
            StageChecklistTemplate.project_category == category,
            StageChecklistTemplate.stage_title == stage_title,
            StageChecklistTemplate.required.is_(True),
            StageChecklistTemplate.enabled.is_(True),
        ).order_by(StageChecklistTemplate.sort_order)
    ).scalars().all()
    if not required_items:
        return []
    done_items = set(db.execute(
        select(ProjectStageCheck.item_text).where(
            ProjectStageCheck.project_id == project.project_id,
            ProjectStageCheck.stage_title == stage_title,
            ProjectStageCheck.checked.is_(True),
        )
    ).scalars().all())
    return [item for item in required_items if item not in done_items]


def advance_project_stage(db: Session, project: Project, log: ProjectLog, actor_open_id: str | None) -> str | None:
    """阶段审批最终通过后推进项目当前阶段并记录流转。返回新阶段 (无变化返回 None)。"""
    approved_stage = log.old_value
    if approved_stage not in SEVEN_STAGES:
        return None
    to_stage = next_stage(approved_stage)
    new_current = to_stage or approved_stage  # 归档阶段通过后停在归档阶段
    db.add(ProjectStageTransition(
        project_id=project.project_id,
        from_stage=approved_stage,
        to_stage=to_stage,
        log_id=log.log_id,
        actor_open_id=actor_open_id,
    ))
    if project.current_stage != new_current:
        project.current_stage = new_current
        return new_current
    return None


def compute_current_stage_from_logs(db: Session, project_id: int) -> str:
    """按已通过的阶段审批日志推算当前阶段 (用于存量项目回填)。"""
    approved = set(db.execute(
        select(ProjectLog.old_value).where(
            ProjectLog.project_id == project_id,
            ProjectLog.kind == "paper_stage",
            ProjectLog.resource_type == "stage_approval",
            ProjectLog.status == "approved",
        )
    ).scalars().all())
    current = SEVEN_STAGES[0]
    for stage in SEVEN_STAGES:
        if stage in approved:
            nxt = next_stage(stage)
            current = nxt or stage
        else:
            break
    return current
