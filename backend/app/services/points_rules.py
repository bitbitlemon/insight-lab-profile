"""积分规则计算 v3 (按 2026-05-14 两份管理员建议文档补缺口).

v3 在 v2 基础上补 P0:
1. 论文 - 加 EI / 北大核心 / CSSCI / CCF / 投稿未录用
2. 项目申报 (grant) - 国/省/校 × 立项/申报
3. 专利软著 (ip) - 发明授权/申请/实用新型/软著/省部成果认定
4. 产业积分 (industrial) - 1 元 = 1 分, 不缩放
5. 扣分 (penalty) - 延期/造假/缺席, base 为负
6. category 维度: business / industrial / public / penalty 4 类

设计原则 (沿用 v2):
- 论文按篇分池, 作者权重分; 不再 base × 倍率
- 比赛默认分配按队伍大小; 任一成员 0% 或 >60% 触发双审
- 组织贡献 Event A/B/C 分级, participant 类极小
- 职务月度履职评级 A/B/C/D ∈ {1.0, 0.8, 0.5, 0}

v4 在 v3 基础上修「量纲塌陷」(2026-05-22, 实验室负责人拍板):
- 政策: 单一总分池 (科研/开发/公共所有来源相加成一个总分)
- 金额类不再 1 元 = 1 分。industrial 全额 + product_stage 的 launch/operating 金额加成,
  统一走对数压缩曲线 amount_curve_points: f(元) = 100·ln(1+元/3000)/ln(11)
  锚点 3 万元 = 100 分 (≈ 一篇中科院一区), 边际递减, 大额项目领先但不碾压科研
- 待补 (v4 Phase B): 开发团队分池 / 同项目累计金额防拆单 / 易灌水来源 cap

数值调整只改本文件。每条 ledger 都带 calculation_rule_version。
"""
from __future__ import annotations
import math
from typing import Literal

RULES_VERSION = "v4-2026-05-22"

PaperRole = Literal["first", "co_first", "second", "third", "corresponding", "other"]
ContribType = Literal["event", "internal_share", "document", "reflection", "other"]
ContribRole = Literal[
    "organizer", "co_organizer", "speaker", "participant", "contributor", "other"
]
EventTier = Literal["A", "B", "C"]
DutyRating = Literal["A", "B", "C", "D"]


# ============ 论文: 按篇总池 + 作者权重 ============

PAPER_POOL = {
    "sci_1": 100,
    "sci_2": 60,
    "sci_3": 30,
    "sci_4": 15,
    "ei": 35,
    "core_zh": 25,
    "ccf_a_b": 50,
    "ccf_c": 30,
    "other": 5,
}
PAPER_SUBMISSION_POINTS = 2

PAPER_AUTHOR_WEIGHT = {
    "first": 1.0,
    "co_first": 1.0,     # 共一与一作同权重, 共享总池
    "second": 0.6,
    "third": 0.3,
    "other": 0.15,
}
PAPER_CORRESPONDING_BONUS = 0.2  # 通讯 加 0.2; 上限 1.2
PAPER_WEIGHT_CAP = 1.2


def paper_tier_key(venue_level: str | None) -> str:
    import re
    s = venue_level or ""
    if re.search(r"中科院一区", s): return "sci_1"
    if re.search(r"中科院二区", s): return "sci_2"
    if re.search(r"中科院三区", s): return "sci_3"
    if re.search(r"中科院四区", s): return "sci_4"
    if re.search(r"JCR\s*Q1", s, re.I): return "sci_2"
    if re.search(r"JCR\s*Q2", s, re.I): return "sci_3"
    if re.search(r"JCR\s*Q[34]", s, re.I): return "sci_4"
    if re.search(r"CCF[-\s]*[AB]\b", s, re.I): return "ccf_a_b"
    if re.search(r"CCF[-\s]*C\b", s, re.I): return "ccf_c"
    if re.search(r"\bEI\b", s, re.I): return "ei"
    if re.search(r"CSSCI|北大核心", s): return "core_zh"
    return "other"


def paper_pool(venue_level: str | None) -> float:
    return float(PAPER_POOL[paper_tier_key(venue_level)])


def paper_author_weight(role: str | None, is_corresponding: bool = False) -> float:
    base = PAPER_AUTHOR_WEIGHT.get(role or "other", PAPER_AUTHOR_WEIGHT["other"])
    if is_corresponding:
        base += PAPER_CORRESPONDING_BONUS
    return min(base, PAPER_WEIGHT_CAP)


def allocate_paper_points(
    venue_level: str | None,
    authors: list[tuple[str, str | None, bool]],
) -> dict[str, float]:
    """按篇分池.
    authors: [(member_open_id, role, is_corresponding), ...]
    返回 {open_id: final_points}.
    """
    pool = paper_pool(venue_level)
    if pool <= 0 or not authors:
        return {}
    weights = [(oid, paper_author_weight(role, corr)) for oid, role, corr in authors]
    total_w = sum(w for _, w in weights)
    if total_w <= 0:
        return {}
    return {oid: pool * (w / total_w) for oid, w in weights}


# ============ 比赛: 奖项分 × 级别系数 ============

COMP_AWARD_BASE = {
    "特等奖": 100,
    "一等奖": 70,
    "二等奖": 45,
    "三等奖": 25,
    "优秀奖": 8,
    "鼓励奖": 0,
    "参赛奖": 0,
}

COMP_LEVEL_MULT = {
    "国家级": 2.0,
    "省部级": 1.4,
    "省级": 1.4,
    "市厅级": 0.8,
    "市级": 0.8,
    "校级": 0.3,
}

# 队伍大小决定默认分配
def competition_base(award_level: str, level: str) -> float:
    aw = COMP_AWARD_BASE.get(award_level, 0)
    mult = COMP_LEVEL_MULT.get(level, 0.3)
    return float(aw) * mult


def default_competition_shares(members: list[str], team_lead_open_id: str | None) -> dict[str, float]:
    """3+ 人队伍: 负责人 40%, 其他 60% 均分.
    2 人队伍: 负责人 60%, 另一人 40%.
    无负责人: 全员均分.
    """
    if not members: return {}
    if not team_lead_open_id or team_lead_open_id not in members:
        per = 1.0 / len(members)
        return {m: per for m in members}
    if len(members) == 1:
        return {members[0]: 1.0}
    if len(members) == 2:
        other = next(m for m in members if m != team_lead_open_id)
        return {team_lead_open_id: 0.60, other: 0.40}
    others = [m for m in members if m != team_lead_open_id]
    per_other = 0.60 / len(others)
    return {team_lead_open_id: 0.40, **{m: per_other for m in others}}


def needs_competition_double_review(shares: dict[str, float], default_shares: dict[str, float]) -> tuple[bool, str]:
    """判断是否需双审. 返回 (need, reason)."""
    for oid, ratio in shares.items():
        if ratio < 1e-6:
            return True, f"成员 {oid} 分配为 0%"
        if ratio > 0.60 + 1e-6:
            return True, f"成员 {oid} 分配 {ratio*100:.1f}% (>60%)"
        delta = abs(ratio - default_shares.get(oid, 0))
        if delta > 0.20:
            return True, f"成员 {oid} 偏离默认 {delta*100:.1f}% (>20%)"
    return False, ""


# ============ 组织贡献: Event A/B/C + 其他 ============

EVENT_TIER_POINTS: dict[EventTier, dict[str, int]] = {
    "A": {"organizer": 25, "co_organizer": 15, "speaker": 15, "participant": 4, "other": 0},
    "B": {"organizer": 15, "co_organizer": 8, "speaker": 10, "participant": 3, "other": 0},
    "C": {"organizer": 0, "co_organizer": 0, "speaker": 0, "participant": 0, "other": 0},
}

CONTRIB_OTHER_BASE = {
    ("internal_share", "speaker"): 10,
    ("internal_share", "participant"): 2,
    ("internal_share", None): 3,
    ("document", "organizer"): 10,
    ("document", "contributor"): 6,
    ("document", None): 5,
    ("reflection", None): 2,
    ("other", None): 0,
}

QUARTERLY_CAP_PER_MEMBER = 40       # event+share+doc+reflection 个人季度上限
PARTICIPANT_MONTHLY_CAP = 10        # participant 类月度上限
OTHER_QUARTERLY_CAP = 10            # other 类季度上限
REFLECTION_MONTHLY_LIMIT_COUNT = 5  # reflection 月最多 5 条
INTERNAL_SHARE_PARTICIPANT_MONTHLY_LIMIT = 2


def contribution_base(type_: str, role: str | None, event_tier: EventTier | None = None) -> float:
    """返回单次该贡献的基础分."""
    if type_ == "event":
        tier = event_tier or "C"  # 没有分级默认 C = 0 分, 等审核才能升级
        table = EVENT_TIER_POINTS.get(tier, EVENT_TIER_POINTS["C"])
        return float(table.get(role or "other", 0))
    return float(CONTRIB_OTHER_BASE.get((type_, role)) or CONTRIB_OTHER_BASE.get((type_, None)) or 0)


# ============ 职务月度 + 履职评级 ============

DUTY_BASE_MONTHLY = {
    "团长": 20,
    "政委": 18,
    "副团长": 15,
    "副政委": 15,
    "部长": 12,
    "首席增长官": 12,
    "首席财务官": 12,
    "总秘书长": 12,
    "总工程师": 12,
    "团长助理": 8,
    "研发顾问": 5,
    "研发专岗": 3,
    "科技专岗": 3,
}

DUTY_RATING_FACTOR = {"A": 1.0, "B": 0.8, "C": 0.5, "D": 0.0}


def duty_monthly_base(title: str | None) -> float:
    if not title: return 0.0
    t = title.strip()
    if t in DUTY_BASE_MONTHLY: return float(DUTY_BASE_MONTHLY[t])
    if "副团长" in t: return float(DUTY_BASE_MONTHLY["副团长"])
    if "副政委" in t: return float(DUTY_BASE_MONTHLY["副政委"])
    if "团长助理" in t: return float(DUTY_BASE_MONTHLY["团长助理"])
    if "团长" in t: return float(DUTY_BASE_MONTHLY["团长"])
    if "政委" in t: return float(DUTY_BASE_MONTHLY["政委"])
    if "部长" in t: return float(DUTY_BASE_MONTHLY["部长"])
    if "首席" in t: return float(DUTY_BASE_MONTHLY["首席增长官"])
    if "研发顾问" in t: return float(DUTY_BASE_MONTHLY["研发顾问"])
    if "专岗" in t: return float(DUTY_BASE_MONTHLY["研发专岗"])
    return 0.0


def duty_monthly_final(title: str | None, rating: DutyRating = "B") -> float:
    """duty_base × 履职系数. 没有明确评级时默认 B=0.8 (保守)."""
    return duty_monthly_base(title) * DUTY_RATING_FACTOR.get(rating, 0.0)


# ============ v3 新增: 项目申报 (grant) ============

GrantLevel = Literal["national", "provincial", "school", "horizontal"]
GrantStatus = Literal["applied", "approved"]  # 申报 vs 立项

GRANT_POINTS: dict[GrantLevel, dict[GrantStatus, float]] = {
    "national":    {"applied": 8,  "approved": 100},
    "provincial":  {"applied": 3,  "approved": 30},
    "school":      {"applied": 1,  "approved": 10},
    "horizontal":  {"applied": 0,  "approved": 0},  # 横向走 industrial 积分
}


def grant_points(level: str, status: str) -> float:
    lvl = (level or "").strip()
    st = (status or "").strip()
    table = GRANT_POINTS.get(lvl)  # type: ignore[arg-type]
    if not table:
        return 0.0
    return float(table.get(st, 0))  # type: ignore[arg-type]


# ============ v3 新增: 专利 / 软著 / 成果 (ip) ============

IpKind = Literal[
    "invention_granted", "invention_applied",
    "utility_granted", "design_granted",
    "software_copyright", "science_award_prov",
]

IP_POINTS: dict[str, float] = {
    "invention_granted": 60,
    "invention_applied": 20,
    "utility_granted": 12,
    "design_granted": 12,
    "software_copyright": 8,
    "science_award_prov": 30,
}


def ip_points(kind: str) -> float:
    return float(IP_POINTS.get((kind or "").strip(), 0))


def classify_award_to_ip(category: str | None, level: str | None, name: str | None) -> str | None:
    """从 awards 表的 (category, level, name) 推断 IP 类型. 返回 None 表示不算 IP 积分."""
    c = (category or "").strip()
    n = (name or "").strip()
    lv = (level or "").strip()
    if "发明专利" in c or "发明专利" in n:
        if "授权" in n or "授权" in lv: return "invention_granted"
        if "申请" in n or "受理" in n: return "invention_applied"
        return "invention_granted"
    if "实用新型" in c or "实用新型" in n: return "utility_granted"
    if "外观" in c or "外观" in n: return "design_granted"
    if "软件著作权" in c or "软著" in c or "软著" in n: return "software_copyright"
    if "省部级" in lv and ("科技" in c or "成果" in c): return "science_award_prov"
    return None


# ============ v4: 金额对数压缩曲线 (防膨胀) ============
# 科研最高锚点 ~100 分 (一区论文 / 国家级立项)。开发金额若 1 元 = 1 分会无限通胀,
# 单个项目就能碾压全部科研。v4 改用对数曲线: 边际递减, 大额项目仍领先但落在科研同量级。
#   f(元) = 100 · ln(1 + 元 / AMOUNT_CURVE_BASE) / ln(1 + 锚点倍数)
# 锚点: 3 万元 = 100 分 (= 一篇中科院一区)。3万 / 3000 = 10 → 分母 ln(11)。
AMOUNT_CURVE_BASE = 3000.0       # A: 金额曲线基准单位 (元)
AMOUNT_CURVE_ANCHOR_RATIO = 10.0  # 锚点金额 = ANCHOR_RATIO × BASE = 3 万元
_AMOUNT_CURVE_DENOM = math.log(1.0 + AMOUNT_CURVE_ANCHOR_RATIO)  # ln(11)


def amount_curve_points(amount_yuan: float | None) -> float:
    """金额 → 积分 的对数压缩曲线 (v4)。锚点 3 万元 = 100 分。
    示例: 5千≈41 / 1万≈61 / 2万≈85 / 3万=100 / 5万≈120 / 10万≈147。
    """
    if not amount_yuan or amount_yuan <= 0:
        return 0.0
    pts = 100.0 * math.log(1.0 + float(amount_yuan) / AMOUNT_CURVE_BASE) / _AMOUNT_CURVE_DENOM
    return round(pts, 1)


# ============ v4: 产业积分 (industrial) ============
# 走金额对数曲线, 不再 1 元 = 1 分. category='industrial'.

def industrial_points(amount_yuan: float) -> float:
    return amount_curve_points(amount_yuan)


# ============ v3 新增: 产品研发阶段 (product_stage) ============
# 阶段固定分 + 金额加成 (金额走 v4 对数曲线, 仅 launch / operating 支持). category='business'.

ProductStage = Literal["init", "mvp", "internal_qa", "launch", "operating"]

PRODUCT_STAGE_BASE: dict[str, float] = {
    "init": 5,
    "mvp": 10,
    "internal_qa": 15,
    "launch": 30,
    "operating": 60,
}

# 哪些阶段允许把金额 (元) 计入额外积分
PRODUCT_STAGE_AMOUNT_ENABLED = {"launch", "operating"}


def product_stage_points(stage: str, amount_yuan: float | None = None) -> float:
    """阶段固定分 + (可选) 金额加成. amount 仅 launch / operating 生效.
    v4: 金额加成走对数压缩曲线 amount_curve_points, 不再 1 元 = 1 分."""
    base = float(PRODUCT_STAGE_BASE.get((stage or "").strip(), 0))
    if base <= 0:
        return 0.0
    if amount_yuan and stage in PRODUCT_STAGE_AMOUNT_ENABLED and amount_yuan > 0:
        return round(base + amount_curve_points(amount_yuan), 1)
    return base


# ============ v4: 开发团队分池 (产业 / 产品 多人分配) ============
# 开发是项目制, 不照搬论文 author weight。一个开发项目的金额池按角色权重分给团队多人,
# 与论文「总池 + 权重分配」同思想, 但角色语义不同 (负责人/技术/核心/商务/参与/支持)。

DevRole = Literal["owner", "tech_lead", "core", "business_core", "contributor", "support"]

DEV_ROLE_WEIGHT: dict[str, float] = {
    "owner": 1.00,          # 项目负责人: 目标/交付/验收/团队协调
    "tech_lead": 0.90,      # 技术负责人: 架构/关键实现/质量兜底
    "core": 0.70,           # 核心贡献者: 关键模块或主要交付
    "business_core": 0.70,  # 商务核心: 关键客户/合同/回款/需求闭环
    "contributor": 0.35,    # 参与者: 明确任务贡献
    "support": 0.15,        # 支持者: 测试/文档/运营/临时支持
}


def dev_role_weight(role: str | None) -> float:
    return DEV_ROLE_WEIGHT.get((role or "").strip(), DEV_ROLE_WEIGHT["contributor"])


def allocate_dev_points(
    pool: float,
    members: list[tuple[str, str | None]],
) -> dict[str, float]:
    """把开发项目分池 pool 按角色权重分给团队。
    members: [(member_open_id, role), ...]
    返回 {open_id: final_points}。单成员则独得全部 pool。
    """
    if pool <= 0 or not members:
        return {}
    weights = [(oid, dev_role_weight(role)) for oid, role in members]
    total_w = sum(w for _, w in weights)
    if total_w <= 0:
        return {}
    return {oid: round(pool * w / total_w, 1) for oid, w in weights}


# ============ v3 新增: 培训 / 证书 (training) ============
# 入账规则: 行业证书 10 / 学术证书 5 / 一般培训 2; 有证书额外 +0 (kind 已表达).
# category='business'.

TrainingKind = Literal["industry_cert", "academic_cert", "general_training"]

TRAINING_POINTS: dict[str, float] = {
    "industry_cert": 10,
    "academic_cert": 5,
    "general_training": 2,
}


def training_points(kind: str) -> float:
    return float(TRAINING_POINTS.get((kind or "").strip(), 0))


def classify_training_kind(type_: str | None, has_certificate: bool = False) -> str:
    """从 trainings.type + has_certificate 推断 kind.
    type 含 '行业'/'认证'/'职业' 且有证书 → industry_cert
    type 含 '学术'/'学位'/'课程' 且有证书 → academic_cert
    其他 → general_training
    """
    t = (type_ or "").strip()
    if has_certificate:
        if any(k in t for k in ("行业", "认证", "职业", "技能")):
            return "industry_cert"
        if any(k in t for k in ("学术", "学位", "课程", "学校")):
            return "academic_cert"
        return "industry_cert"  # 有证但 type 不明确时按 industry_cert 兜底
    return "general_training"


# ============ v3 新增: 扣分 (penalty) ============
# base_points 为负, final_points 为负. category='penalty'.

PenaltyKind = Literal[
    "deadline_minor", "deadline_major", "data_fraud", "no_show", "violation",
]

PENALTY_PRESETS: dict[str, float] = {
    "deadline_minor": -5,
    "deadline_major": -15,
    "data_fraud": -50,
    "no_show": -3,
    "violation": -10,
}


def penalty_amount(kind: str, custom: float | None = None) -> float:
    """custom 优先 (admin 自定); 否则按预设."""
    if custom is not None:
        return -abs(float(custom))
    return float(PENALTY_PRESETS.get((kind or "").strip(), 0))


# ============ category 推断 ============

CATEGORY_BY_SOURCE = {
    "paper": "business",
    "competition": "business",
    "contribution": "public",
    "duty": "business",
    "adjust": "business",
    "grant": "business",
    "ip": "business",
    "industrial": "industrial",
    "product_stage": "business",
    "penalty": "penalty",
    "training": "business",
}


def category_of(source_type: str) -> str:
    return CATEGORY_BY_SOURCE.get(source_type, "business")


# ============ 工资换算 (季度) ============

QUARTERLY_BASELINE_PER_MEMBER = 24  # B_q: 季度基线分/人, 建议 24~30
QUARTERLY_ADJUST_LOW = 0.90         # C_q 下限
QUARTERLY_ADJUST_HIGH = 1.10        # C_q 上限


def quarterly_point_value(budget_q: float, active_count: int, actual_points: float) -> tuple[float, float]:
    """返回 (V0_q, C_q): 季度点值 + 调节系数."""
    if active_count <= 0:
        return 0.0, 1.0
    target = active_count * QUARTERLY_BASELINE_PER_MEMBER
    v0 = budget_q / target if target > 0 else 0.0
    if actual_points <= 0:
        c = QUARTERLY_ADJUST_HIGH
    else:
        c = max(QUARTERLY_ADJUST_LOW, min(QUARTERLY_ADJUST_HIGH, target / actual_points))
    return v0, c
