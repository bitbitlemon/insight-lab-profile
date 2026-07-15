// 七阶段流程模板与项目类别常量 (从 ProjectManagementPage 拆出)

export type PaperApprovalStepStatus = "done" | "current" | "waiting";

export interface PaperApprovalStep {
  title: string;
  group: string;
  owner: string;
  status: PaperApprovalStepStatus;
  note: string;
  executor?: string;
  approver?: string;
  startedAt?: string;
  completedAt?: string;
  materials?: string[];
}

export interface PaperApprovalSnapshot {
  projectId: number;
  title: string;
  paperTitle: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  currentNode: string;
  currentApprover: string;
  applicant: string;
  department: string;
  guide: string;
  submitted: boolean;
  documentUrl: string;
  summary: string;
  formItems: Array<{ label: string; value: string }>;
  stages: Array<{ title: string; items: string[] }>;
  steps: PaperApprovalStep[];
}

export const projectCategoryValues = ["论文写作", "产品研发", "项目申报", "竞赛筹备"] as const;
export type ProjectCategory = (typeof projectCategoryValues)[number];
export type ProjectCategoryFilter = "all" | ProjectCategory;
export type WorkflowTemplateKey = ProjectCategory | "自定义";
export type ProjectStageTemplate = {
  group: string;
  title: string;
  hours: number;
  review: string;
  materials: readonly string[];
  note: string;
  nodes: string[];
};

export const sevenFlowNodes = [
  {
    group: "启动",
    title: "启动阶段",
    hours: 2,
    review: "确认项目方向、参考材料、指导关系和团队配置",
    materials: ["参考材料", "选题说明", "团队确认"],
    note: "完成启动信息收集，明确项目是否具备进入设计的条件。",
  },
  {
    group: "设计",
    title: "设计阶段",
    hours: 3,
    review: "完成技术、方法、结构或方案设计",
    materials: ["设计方案", "结构说明", "排期计划"],
    note: "把启动阶段的方向拆成可执行方案。",
  },
  {
    group: "验证",
    title: "验证阶段",
    hours: 8,
    review: "通过可行性、实验、demo 或 MVP 验证核心假设",
    materials: ["验证记录", "实验结果", "问题清单"],
    note: "先验证项目核心路径是否可行，再进入完整产出。",
  },
  {
    group: "内测",
    title: "内测阶段",
    hours: 4,
    review: "形成初稿、内测版本或内部评审材料",
    materials: ["初版成果", "内测记录", "评审意见"],
    note: "把验证后的方案做成可评审、可试用、可修改的初版成果。",
  },
  {
    group: "迭代",
    title: "迭代阶段",
    hours: 2,
    review: "根据评审、实验、内测反馈做修订优化",
    materials: ["修改记录", "优化版本", "补充材料"],
    note: "围绕内测反馈和关键问题做集中迭代。",
  },
  {
    group: "交付",
    title: "交付阶段",
    hours: 2,
    review: "完成正式提交、上线、投稿或交付",
    materials: ["最终成果", "提交凭证", "验收记录"],
    note: "把最终成果提交到对应渠道，并保留凭证。",
  },
  {
    group: "归档",
    title: "归档阶段",
    hours: 2,
    review: "沉淀文档、模板、经验和可复用资产",
    materials: ["归档材料", "复盘记录", "模板沉淀"],
    note: "统一收拢成果和经验，方便复用。",
  },
] as const;

export const categoryFlowNote: Record<ProjectCategory, string> = {
  论文写作: "来源：类型化节点体系中的「论文写作」。",
  产品研发: "来源：类型化节点体系中的「产品研发」。",
  项目申报: "来源：类型化节点体系中的「项目申报」。",
  竞赛筹备: "来源：类型化节点体系中的「竞赛筹备」。",
};

export const categoryStageNodes: Record<ProjectCategory, string[][]> = {
  论文写作: [
    ["找参考", "找选题", "找指导", "找队友"],
    ["方法创新设计", "模型结构设计"],
    ["baseline实验验证"],
    ["论文初稿", "实验补充"],
    ["论文修改", "补实验"],
    ["投稿论文"],
    ["代码+实验复现包"],
  ],
  产品研发: [
    ["需求分析", "PRD初稿"],
    ["系统架构设计", "UI设计"],
    ["MVP/demo验证"],
    ["内测版本", "bug记录"],
    ["功能优化", "版本迭代"],
    ["正式上线版本"],
    ["技术文档", "知识沉淀"],
  ],
  项目申报: [
    ["找参考", "找选题", "找指导", "找队友"],
    ["技术路线设计", "申报书结构设计"],
    ["可行性分析验证"],
    ["申报书初稿", "内部修改评审"],
    ["申报书修订优化"],
    ["正式提交申报材料"],
    ["经验总结", "模板沉淀"],
  ],
  竞赛筹备: [
    ["赛题分析", "立项+报名", "找队友"],
    ["竞赛方案设计"],
    ["demo验证"],
    ["作品初稿", "PPT制作"],
    ["冲刺优化"],
    ["最终提交材料"],
    ["竞赛复盘"],
  ],
};

export const categoryStageTemplates: Record<ProjectCategory, ProjectStageTemplate[]> = {
  论文写作: sevenFlowNodes.map((stage, index) => ({ ...stage, nodes: categoryStageNodes.论文写作[index] })),
  产品研发: sevenFlowNodes.map((stage, index) => ({ ...stage, nodes: categoryStageNodes.产品研发[index] })),
  项目申报: sevenFlowNodes.map((stage, index) => ({ ...stage, nodes: categoryStageNodes.项目申报[index] })),
  竞赛筹备: sevenFlowNodes.map((stage, index) => ({ ...stage, nodes: categoryStageNodes.竞赛筹备[index] })),
};

export const workflowTemplates: Record<ProjectCategory, Array<{ title: string; hours: number; review: string }>> = {
  产品研发: categoryStageTemplates.产品研发.map((stage) => ({ title: stage.title, hours: stage.hours, review: `${stage.review}：${stage.nodes.join("、")}` })),
  论文写作: categoryStageTemplates.论文写作.map((stage) => ({ title: stage.title, hours: stage.hours, review: `${stage.review}：${stage.nodes.join("、")}` })),
  竞赛筹备: categoryStageTemplates.竞赛筹备.map((stage) => ({ title: stage.title, hours: stage.hours, review: `${stage.review}：${stage.nodes.join("、")}` })),
  项目申报: categoryStageTemplates.项目申报.map((stage) => ({ title: stage.title, hours: stage.hours, review: `${stage.review}：${stage.nodes.join("、")}` })),
};

export const stageStandardItems: Record<ProjectCategory, Record<string, string[]>> = {
  论文写作: {
    启动阶段: ["已确定论文选题方向", "已确认指导人", "已确认核心作者/协作成员", "参考论文清单已建立"],
    设计阶段: ["方法创新点已说明", "模型/实验结构已画出", "baseline 与对比方法已确定", "实验排期已确认"],
    验证阶段: ["baseline 实验已跑通", "核心指标已记录", "失败样例或问题已归因", "实验日志/代码版本可追溯"],
    内测阶段: ["论文初稿已形成", "实验补充清单已完成", "指导人已给出初审意见", "图表和引用完整性已检查"],
    迭代阶段: ["返修问题已逐条关闭", "补实验结果已回填", "论文修改说明已更新", "版本差异可追溯"],
    交付阶段: ["投稿论文最终版已确认", "投稿系统/会议链接已填写", "作者顺序与单位已确认", "投稿凭证或截图已留存"],
    归档阶段: ["代码仓库链接已归档", "实验复现包已整理", "论文模板/经验已沉淀", "关键数据路径已记录"],
  },
  产品研发: {
    启动阶段: ["需求负责人已确认", "PRD 初稿已创建", "目标用户/使用场景已明确", "核心成员分工已确认"],
    设计阶段: ["系统架构图已确认", "UI 原型/设计稿已确认", "接口边界已明确", "关键风险已列出"],
    验证阶段: ["MVP/demo 已可访问", "核心流程已跑通", "验证反馈已记录", "阻塞问题已有负责人"],
    内测阶段: ["内测版本已发布", "内测成员名单已确认", "bug 记录已建立", "严重问题已分级"],
    迭代阶段: ["功能优化项已关闭", "版本变更记录已更新", "回归测试已通过", "上线风险已复核"],
    交付阶段: ["正式版本已上线", "访问链接/部署地址已填写", "验收人已确认", "上线记录已留存"],
    归档阶段: ["技术文档已归档", "部署/运维说明已补齐", "知识沉淀已完成", "后续维护人已确认"],
  },
  项目申报: {
    启动阶段: ["申报方向已确定", "申报指南/参考项目已收集", "指导人已确认", "申报成员与分工已确认"],
    设计阶段: ["技术路线已明确", "申报书结构已定稿", "预算/成果指标已初步确认", "材料责任人已分配"],
    验证阶段: ["可行性分析已完成", "关键数据/案例已核验", "风险与替代方案已补充", "指导人已确认可继续"],
    内测阶段: ["申报书初稿已完成", "内部评审意见已收集", "附件材料缺口已列出", "修改责任人已明确"],
    迭代阶段: ["申报书修订版已更新", "评审意见已逐条回应", "附件/证明材料已补齐", "格式合规性已检查"],
    交付阶段: ["正式提交入口/链接已记录", "提交状态已确认", "提交截图/回执已留存", "最终版材料已归档"],
    归档阶段: ["经验总结已完成", "申报模板已沉淀", "评审问题已归档", "后续跟进时间点已记录"],
  },
  竞赛筹备: {
    启动阶段: ["赛题分析已完成", "是否完成报名已确认", "队长与队员名单已确定", "指导老师/顾问已确认"],
    设计阶段: ["竞赛方案已确定", "任务分工已确认", "作品形态和评分点已对齐", "关键时间节点已排期"],
    验证阶段: ["demo 已跑通", "核心亮点已验证", "风险问题已记录", "评测/路演反馈已收集"],
    内测阶段: ["作品初稿已形成", "PPT 初版已完成", "演示流程已走通", "内部评审意见已记录"],
    迭代阶段: ["冲刺优化项已关闭", "PPT/作品已更新", "路演稿已打磨", "提交前检查清单已完成"],
    交付阶段: ["最终提交材料已上传", "提交平台链接/截图已留存", "报名/提交状态已确认", "答辩或展示安排已记录"],
    归档阶段: ["竞赛复盘已完成", "获奖/排名结果已记录", "作品与 PPT 已归档", "可复用经验已沉淀"],
  },
};

export const getStageStandardItems = (category: ProjectCategory, stage: ProjectStageTemplate) =>
  stageStandardItems[category][stage.title] || stage.nodes.map((node) => `${node}已确认`);

export const standardApprovalTemplates: Record<ProjectCategory, Array<Omit<PaperApprovalStep, "status" | "startedAt" | "completedAt">>> = {
  论文写作: categoryStageTemplates.论文写作.map((stage) => ({ ...stage, materials: getStageStandardItems("论文写作", stage), owner: "项目负责人", executor: "负责人", approver: "指导人", note: `${stage.note}节点：${stage.nodes.join("、")}。${categoryFlowNote.论文写作}` })),
  产品研发: categoryStageTemplates.产品研发.map((stage) => ({ ...stage, materials: getStageStandardItems("产品研发", stage), owner: "项目负责人", executor: "负责人", approver: "技术负责人", note: `${stage.note}节点：${stage.nodes.join("、")}。${categoryFlowNote.产品研发}` })),
  竞赛筹备: categoryStageTemplates.竞赛筹备.map((stage) => ({ ...stage, materials: getStageStandardItems("竞赛筹备", stage), owner: "队长/项目负责人", executor: "参与人", approver: "指导老师", note: `${stage.note}节点：${stage.nodes.join("、")}。${categoryFlowNote.竞赛筹备}` })),
  项目申报: categoryStageTemplates.项目申报.map((stage) => ({ ...stage, materials: getStageStandardItems("项目申报", stage), owner: "项目负责人", executor: "负责人", approver: "管理者", note: `${stage.note}节点：${stage.nodes.join("、")}。${categoryFlowNote.项目申报}` })),
};

export const legacyProjectCategoryMap: Record<string, ProjectCategory> = {
  科研: "论文写作",
  论文撰写: "论文写作",
  开发: "产品研发",
  平台开发: "产品研发",
  申报: "项目申报",
  竞赛: "竞赛筹备",
  竞赛管理: "竞赛筹备",
};
