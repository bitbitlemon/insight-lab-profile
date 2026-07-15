import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Dialog, Selector, Toast } from "antd-mobile";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  listCalendarEvents,
  listLarkUserStatuses,
  type CalendarEvent,
  type LarkUserStatus,
} from "../api/calendar";
import {
  createContributionComment,
  listContributionComments,
  listContributions,
  recordContributionInteraction,
  type Contribution,
  type ContributionComment,
} from "../api/contributions";
import { createMeetingNote, listMeetingNotes } from "../api/meeting_notes";
import { listMembers } from "../api/members";
import {
  addProjectChat,
  addProjectMember,
  deleteProject,
  getProject,
  listLarkChatTopics,
  listProjectChatMessages,
  listProjectLogs,
  listProjectRelations,
  listProjects,
  listVisibleLarkChats,
  removeProjectMember,
  syncProjectChat,
  updateProject,
  updateProjectMember,
} from "../api/projects";
import {
  createTask,
  deleteTask,
  getTaskFocusSummary,
  heartbeatTaskFocus,
  listTaskAuditLogs,
  listTasks,
  startTaskFocus,
  stopTaskFocus,
  updateTask,
} from "../api/tasks";
import { MemberAvatarLink } from "../components/MemberProfileLink";
import { SectionEmpty, SectionLoading } from "../components/ui";
import { useAuth } from "../hooks/useAuth";
import type {
  ChangeLogEntry,
  LarkChatTopicPreview,
  LarkVisibleChat,
  Member,
  MeetingNote,
  PMRole,
  Project,
  ProjectChatMessage,
  ProjectLog,
  ProjectMember,
  ProjectPriority,
  ProjectRelation,
  ProjectStatus,
  ProjectType,
  Task,
  TaskStatus,
} from "../types/api";

type ProjectTabKey = "planning" | "active" | "completed" | "archived";
type WorkMode = "projects" | "tasks";
type ProjectViewKey = "table" | "kanban" | "gantt";
type TaskFilter = "open" | "todo" | "in_progress" | "blocked" | "done" | "cancelled" | "all";
type PaperApprovalStepStatus = "done" | "current" | "waiting";
type GuidanceStatus = "pending" | "viewed" | "replied" | "resolved";

interface PaperGuidanceRecord {
  id: string;
  problemType: string;
  evidence: string[];
  target: string;
  deadline: string;
  status: GuidanceStatus;
  suggestion: string;
  createdBy: string;
  createdAt: string;
}

interface PaperApprovalStep {
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
  guidance?: PaperGuidanceRecord[];
}

interface PaperApprovalSnapshot {
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

const equalAccessOpenIds = new Set(["ou_20fec537961e0a66669370b00d0fc52d", "ou_c544c4877658cfa1df6cee41939b99c4"]);

const projectStatusStyle: Record<ProjectStatus, { label: string; bg: string; fg: string }> = {
  planning: { label: "筹备中", bg: "#E8F3FF", fg: "#1D4ED8" },
  active: { label: "进行中", bg: "#E8FFEA", fg: "#15803D" },
  paused: { label: "进行中", bg: "#E8FFEA", fg: "#15803D" },
  completed: { label: "已完成", bg: "#F0FDF4", fg: "#15803D" },
  archived: { label: "已归档", bg: "#F4F3FF", fg: "#5B21B6" },
};

const priorityStyle: Record<ProjectPriority, { label: string; bg: string; fg: string }> = {
  urgent: { label: "紧急", bg: "#FEE2E2", fg: "#991B1B" },
  high: { label: "高", bg: "#FFF7E6", fg: "#B45309" },
  medium: { label: "中", bg: "#E8F3FF", fg: "#1D4ED8" },
  low: { label: "低", bg: "#F2F3F5", fg: "#4E5969" },
};

const taskStatusStyle: Record<TaskStatus, { label: string; bg: string; fg: string }> = {
  todo: { label: "待办", bg: "#F2F3F5", fg: "#4E5969" },
  in_progress: { label: "进行中", bg: "#E8F3FF", fg: "#1D4ED8" },
  done: { label: "已完成", bg: "#E8FFEA", fg: "#15803D" },
  blocked: { label: "受阻", bg: "#FEE2E2", fg: "#991B1B" },
  cancelled: { label: "已取消", bg: "#F7F8FA", fg: "#8F959E" },
};

const guidanceStatusStyle: Record<GuidanceStatus, { label: string; bg: string; fg: string }> = {
  pending: { label: "待确认", bg: "#FFF7E6", fg: "#B45309" },
  viewed: { label: "已查看", bg: "#E8F3FF", fg: "#1D4ED8" },
  replied: { label: "已反馈", bg: "#F4F3FF", fg: "#5B21B6" },
  resolved: { label: "已解决", bg: "#E8FFEA", fg: "#15803D" },
};

const guidanceProblemTypes = ["进度滞后", "材料质量不足", "方向偏差", "协作不清", "执行记录缺失"];
const guidanceEvidenceOptions = ["日报", "项目群聊", "审批材料", "会议记录"];

const projectTypeStyle: Record<ProjectType, { label: string; bg: string; fg: string }> = {
  team: { label: "团队项目", bg: "#E8F7FF", fg: "#075985" },
  personal: { label: "个人项目", bg: "#F2F3F5", fg: "#4E5969" },
};

const projectCategoryValues = ["论文写作", "产品研发", "项目申报", "竞赛筹备"] as const;
type ProjectCategory = (typeof projectCategoryValues)[number];
type ProjectCategoryFilter = "all" | ProjectCategory;
type WorkflowTemplateKey = ProjectCategory | "自定义";
type ProjectStageTemplate = {
  group: string;
  title: string;
  hours: number;
  review: string;
  materials: readonly string[];
  note: string;
  nodes: string[];
};

const sevenFlowNodes = [
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

const categoryFlowNote: Record<ProjectCategory, string> = {
  论文写作: "来源：类型化节点体系中的「论文写作」。",
  产品研发: "来源：类型化节点体系中的「产品研发」。",
  项目申报: "来源：类型化节点体系中的「项目申报」。",
  竞赛筹备: "来源：类型化节点体系中的「竞赛筹备」。",
};

const categoryStageNodes: Record<ProjectCategory, string[][]> = {
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

const categoryStageTemplates: Record<ProjectCategory, ProjectStageTemplate[]> = {
  论文写作: sevenFlowNodes.map((stage, index) => ({ ...stage, nodes: categoryStageNodes.论文写作[index] })),
  产品研发: sevenFlowNodes.map((stage, index) => ({ ...stage, nodes: categoryStageNodes.产品研发[index] })),
  项目申报: sevenFlowNodes.map((stage, index) => ({ ...stage, nodes: categoryStageNodes.项目申报[index] })),
  竞赛筹备: sevenFlowNodes.map((stage, index) => ({ ...stage, nodes: categoryStageNodes.竞赛筹备[index] })),
};

const workflowTemplates: Record<ProjectCategory, Array<{ title: string; hours: number; review: string }>> = {
  产品研发: categoryStageTemplates.产品研发.map((stage) => ({ title: stage.title, hours: stage.hours, review: `${stage.review}：${stage.nodes.join("、")}` })),
  论文写作: categoryStageTemplates.论文写作.map((stage) => ({ title: stage.title, hours: stage.hours, review: `${stage.review}：${stage.nodes.join("、")}` })),
  竞赛筹备: categoryStageTemplates.竞赛筹备.map((stage) => ({ title: stage.title, hours: stage.hours, review: `${stage.review}：${stage.nodes.join("、")}` })),
  项目申报: categoryStageTemplates.项目申报.map((stage) => ({ title: stage.title, hours: stage.hours, review: `${stage.review}：${stage.nodes.join("、")}` })),
};

const standardApprovalTemplates: Record<ProjectCategory, Array<Omit<PaperApprovalStep, "status" | "startedAt" | "completedAt">>> = {
  论文写作: categoryStageTemplates.论文写作.map((stage) => ({ ...stage, materials: [...stage.materials, ...stage.nodes], owner: "项目负责人", executor: "负责人", approver: "指导人", note: `${stage.note}节点：${stage.nodes.join("、")}。${categoryFlowNote.论文写作}` })),
  产品研发: categoryStageTemplates.产品研发.map((stage) => ({ ...stage, materials: [...stage.materials, ...stage.nodes], owner: "项目负责人", executor: "负责人", approver: "技术负责人", note: `${stage.note}节点：${stage.nodes.join("、")}。${categoryFlowNote.产品研发}` })),
  竞赛筹备: categoryStageTemplates.竞赛筹备.map((stage) => ({ ...stage, materials: [...stage.materials, ...stage.nodes], owner: "队长/项目负责人", executor: "参与人", approver: "指导老师", note: `${stage.note}节点：${stage.nodes.join("、")}。${categoryFlowNote.竞赛筹备}` })),
  项目申报: categoryStageTemplates.项目申报.map((stage) => ({ ...stage, materials: [...stage.materials, ...stage.nodes], owner: "项目负责人", executor: "负责人", approver: "管理者", note: `${stage.note}节点：${stage.nodes.join("、")}。${categoryFlowNote.项目申报}` })),
};

const legacyProjectCategoryMap: Record<string, ProjectCategory> = {
  科研: "论文写作",
  论文撰写: "论文写作",
  开发: "产品研发",
  平台开发: "产品研发",
  申报: "项目申报",
  竞赛: "竞赛筹备",
  竞赛管理: "竞赛筹备",
};

const workflowNodesToText = (nodes: Array<{ title: string; hours: number; review: string }>) =>
  nodes.map((node) => `${node.title} | ${node.hours} | ${node.review}`).join("\n");

const defaultWorkflowText = (template: WorkflowTemplateKey) =>
  template === "自定义" ? "" : workflowNodesToText(workflowTemplates[template]);

const taskFilters: Array<{ label: string; value: TaskFilter }> = [
  { label: "待推进", value: "open" },
  { label: "待办", value: "todo" },
  { label: "进行中", value: "in_progress" },
  { label: "受阻", value: "blocked" },
  { label: "已完成", value: "done" },
  { label: "全部", value: "all" },
];

const paperApprovalSnapshots: PaperApprovalSnapshot[] = [
  {
    projectId: -104,
    title: "论文全流程审批",
    paperTitle: "测试",
    status: "PENDING",
    currentNode: "指导人审批",
    currentApprover: "罗凯宇",
    applicant: "罗起宁",
    department: "科技部",
    guide: "罗凯宇",
    submitted: false,
    documentUrl: "https://insight-lab.feishu.cn/wiki/CWi2wc7gSiyeCAkQiQac9Qt8nGc",
    summary: "来自飞书文档《论文审批流程》与当前审批实例：论文先经过调研材料提交和直接指导人评审，通过后进入开题报告审批；开题通过后进入初稿内审，包含直接指导人、审稿人复审和老师终审。",
    formItems: [
      { label: "论文标题", value: "测试" },
      { label: "负责人", value: "罗起宁" },
      { label: "部门", value: "科技部" },
      { label: "指导人", value: "罗凯宇" },
      { label: "论文是否投出", value: "否" },
      { label: "调研报告", value: "1" },
      { label: "创新思路文档", value: "1" },
    ],
    stages: [
      {
        title: "调研阶段",
        items: [
          "负责人提交负责人、所属 BU、调研报告飞书云文档链接。",
          "直接指导人一轮评审；通过后进入开题报告审批，不通过则退回修改并再次提交。",
        ],
      },
      {
        title: "开题报告阶段",
        items: [
          "负责人提交开题报告文档链接、创新模型代码 Gitee 地址等材料。",
          "直接指导人初审后邀请 1-2 位审稿人评审；作者需提交修改说明和回复。",
          "审稿人同意开题后，进入论文初稿写作阶段。",
        ],
      },
      {
        title: "论文初稿内审阶段",
        items: [
          "提交初稿附件，材料不完整直接退回补充。",
          "直接指导人审稿后邀请 3 位审稿人内审，作者提交回复信和修改稿。",
          "复审通过后进入老师终审；老师同意后方可投稿或提交后续材料。",
        ],
      },
    ],
    steps: [
      { group: "未投出", title: "调研材料提交", owner: "负责人", status: "done", executor: "罗起宁", approver: "系统记录", startedAt: "2026-06-21T09:30:00+08:00", completedAt: "2026-06-21T10:05:00+08:00", materials: ["论文标题", "负责人/部门/指导人", "调研报告", "创新思路文档"], note: "负责人提交论文标题、负责人、部门、指导人、调研报告等字段。" },
      {
        group: "未投出",
        title: "调研一审",
        owner: "直接指导人",
        status: "current",
        executor: "罗起宁",
        approver: "罗凯宇",
        startedAt: "2026-06-21T10:05:00+08:00",
        materials: ["调研报告", "创新思路文档"],
        note: "当前审批实例停留在指导人审批，等待罗凯宇处理。",
        guidance: [
          {
            id: "guide-research-1",
            problemType: "执行记录缺失",
            evidence: ["日报", "项目群聊", "审批材料"],
            target: "罗起宁",
            deadline: "2026-06-24",
            status: "pending",
            suggestion: "调研报告已经提交，但日报里对创新点拆解和下一步验证计划记录偏少。建议补一版“问题-证据-实验验证”表，并在群里同步本周要验证的两个关键假设。",
            createdBy: "管理者",
            createdAt: "2026-06-23T14:20:00+08:00",
          },
        ],
      },
      { group: "未投出", title: "创新实验提交", owner: "负责人", status: "waiting", executor: "罗起宁", approver: "罗凯宇", materials: ["实验代码", "创新思路"], note: "提交实验代码和创新思路材料。" },
      { group: "未投出", title: "创新实验审核", owner: "指导人/代码审核人", status: "waiting", executor: "代码审核人", approver: "罗凯宇", materials: ["Gitee 仓库", "复现实验说明"], note: "指导人邀请审核人，对创新实验材料进行复现或审核。" },
      { group: "未投出", title: "开题材料提交", owner: "负责人", status: "waiting", executor: "罗起宁", approver: "罗凯宇", materials: ["开题报告"], note: "提交开题报告飞书云文档链接。" },
      { group: "未投出", title: "开题一审", owner: "直接指导人", status: "waiting", executor: "罗起宁", approver: "罗凯宇", materials: ["开题报告", "实验代码"], note: "直接指导人审批开题材料。" },
      { group: "未投出", title: "开题二审", owner: "开题审稿人", status: "waiting", executor: "开题审稿人", approver: "1-2 位开题审稿人", materials: ["开题报告", "评审意见"], note: "指导人邀请 1-2 位开题审稿人审批。" },
      { group: "未投出", title: "初稿材料提交", owner: "负责人", status: "waiting", executor: "罗起宁", approver: "罗凯宇", materials: ["初稿 PDF"], note: "提交初稿 PDF 等材料。" },
      { group: "未投出", title: "论文一审", owner: "直接指导人", status: "waiting", executor: "罗起宁", approver: "罗凯宇", materials: ["初稿 PDF", "修改说明"], note: "负责人提交初稿材料，直接指导人负责审批。" },
      { group: "未投出", title: "论文二审", owner: "直接指导人", status: "waiting", executor: "罗起宁", approver: "罗凯宇", materials: ["初稿 PDF", "审稿意见字段"], note: "直接指导人继续审批，确认是否进入论文审稿人评审。" },
      { group: "未投出", title: "论文三审", owner: "论文审稿人", status: "waiting", executor: "论文审稿人", approver: "3 位或以上审稿人", materials: ["评分", "审稿意见", "返修建议"], note: "论文审稿人审批，并填写评分与审稿意见。" },
      { group: "未投出", title: "论文审核", owner: "检查人", status: "waiting", executor: "检查人", approver: "检查人", materials: ["修改后手稿", "回复信"], note: "负责人提交返修材料后，由检查人检查完整性。" },
      { group: "未投出", title: "论文终审", owner: "秦老师", status: "waiting", executor: "罗起宁", approver: "秦老师", materials: ["终审稿件", "审稿记录"], note: "秦老师负责最后审批。" },
      { group: "未投出", title: "投稿材料提交", owner: "负责人", status: "waiting", executor: "罗起宁", approver: "系统记录", materials: ["投出稿件", "投稿会议/期刊", "论文语言"], note: "提交投稿稿件、投出期刊/会议、论文语言等材料。" },
      { group: "已投出", title: "拒稿重投", owner: "负责人", status: "waiting", executor: "罗起宁", approver: "审稿链路", materials: ["拒稿理由", "重投稿件", "重投会议/期刊"], note: "拒稿后提交拒稿理由、重投稿件、重投会议/期刊等材料。" },
      { group: "已投出", title: "重投一审", owner: "审稿链路", status: "waiting", executor: "罗起宁", approver: "直接指导人/检查人/秦老师", materials: ["重投材料", "审核记录"], note: "重投后再次进入论文一审、二审、审核、终审链路。" },
      { group: "已投出", title: "外部返修", owner: "负责人", status: "waiting", executor: "罗起宁", approver: "审稿链路", materials: ["外部返修后的稿件", "外部返修其他材料"], note: "外部返修后提交返修稿件和其他材料。" },
      { group: "已投出", title: "返修终审", owner: "审稿链路", status: "waiting", executor: "罗起宁", approver: "直接指导人/检查人/秦老师", materials: ["返修稿件", "最终确认"], note: "外部返修后进入论文一审、审核、终审。" },
    ],
  },
];

const tabItems: Array<{ key: ProjectTabKey; title: string }> = [
  { key: "planning", title: "筹备中" },
  { key: "active", title: "进行中" },
  { key: "completed", title: "已完成" },
  { key: "archived", title: "已归档" },
];

const statusesForTab: Record<ProjectTabKey, ProjectStatus[]> = {
  planning: ["planning"],
  active: ["active", "paused"],
  completed: ["completed"],
  archived: ["archived"],
};

const projectViewItems: Array<{ key: ProjectViewKey; title: string }> = [
  { key: "table", title: "表格视图" },
  { key: "kanban", title: "看板节点流" },
  { key: "gantt", title: "甘特里程碑" },
];

const nowIso = new Date().toISOString();
const shouldUseDemoData = import.meta.env.DEV && import.meta.env.VITE_SHOW_DEMO_DATA === "true";
const addDaysIso = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(18, 0, 0, 0);
  return date.toISOString();
};

const sampleMembers: Member[] = [
  {
    open_id: "sample_owner",
    name: "周清",
    role: "staff",
    department: "产品与工程",
    position: "项目负责人",
    title: "项目负责人",
    status: "active",
    privacy_level: "internal",
    created_at: nowIso,
    updated_at: nowIso,
  },
  {
    open_id: "sample_fe",
    name: "林悦",
    role: "student",
    department: "前端组",
    position: "前端开发",
    title: "前端开发",
    status: "active",
    privacy_level: "internal",
    created_at: nowIso,
    updated_at: nowIso,
  },
  {
    open_id: "sample_algo",
    name: "陈岚",
    role: "student",
    department: "算法组",
    position: "算法研究",
    title: "算法研究",
    status: "active",
    privacy_level: "internal",
    created_at: nowIso,
    updated_at: nowIso,
  },
  {
    open_id: "ou_20fec537961e0a66669370b00d0fc52d",
    name: "罗起宁",
    role: "staff",
    department: "科技部",
    position: "论文负责人",
    title: "论文负责人",
    status: "active",
    privacy_level: "internal",
    created_at: nowIso,
    updated_at: nowIso,
  },
  {
    open_id: "ou_fa03a8a212504ef323f28d22edf96204",
    name: "罗凯宇",
    role: "staff",
    department: "安全情报 BU",
    position: "直接指导人",
    title: "直接指导人",
    status: "active",
    privacy_level: "internal",
    created_at: nowIso,
    updated_at: nowIso,
  },
];

const sampleProjectMembers: ProjectMember[] = [
  { member_open_id: "sample_owner", role: "owner", share_ratio: 50, tags: "统筹", received_at: nowIso, joined_at: nowIso, left_at: null },
  { member_open_id: "sample_fe", role: "member", share_ratio: 30, tags: "前端", received_at: nowIso, joined_at: nowIso, left_at: null },
  { member_open_id: "sample_algo", role: "member", share_ratio: 20, tags: "算法", received_at: nowIso, joined_at: nowIso, left_at: null },
];

const sampleProjects: Project[] = [
  {
    project_id: -104,
    name: "论文：测试",
    description: "论文全流程审批样例，结合飞书文档《论文审批流程》和当前审批实例，用于在项目下查看论文从调研、开题到初稿内审的推进状态。",
    status: "active",
    priority: "high",
    project_type: "team",
    my_project_type: "team",
    owner_open_id: "ou_20fec537961e0a66669370b00d0fc52d",
    department: "科技部",
    start_date: addDaysIso(0),
    target_end_date: addDaysIso(35),
    actual_end_date: null,
    tags: "科研 论文 审批",
    points_awarded: 0,
    archived_at: null,
    created_by: "ou_20fec537961e0a66669370b00d0fc52d",
    created_at: nowIso,
    updated_at: nowIso,
    members: [
      { member_open_id: "ou_20fec537961e0a66669370b00d0fc52d", role: "owner", share_ratio: 60, tags: "负责人", received_at: nowIso, joined_at: nowIso, left_at: null },
      { member_open_id: "ou_fa03a8a212504ef323f28d22edf96204", role: "co_lead", share_ratio: 40, tags: "指导人 当前审批人", received_at: nowIso, joined_at: nowIso, left_at: null },
    ],
    chats: [],
    days_active: 1,
    task_count: 6,
    task_done_count: 1,
    is_abnormal: false,
    abnormal_reason: null,
    abnormal_chat_count: 0,
  },
  {
    project_id: -101,
    name: "实验室项目管理台优化",
    description: "重构项目列表的信息密度、筛选路径和任务展开体验，用于本地预览验收。",
    status: "active",
    priority: "high",
    project_type: "team",
    my_project_type: "team",
    owner_open_id: "sample_owner",
    department: "产品与工程",
    start_date: addDaysIso(-12),
    target_end_date: addDaysIso(10),
    actual_end_date: null,
    tags: "开发 前端 工作台",
    points_awarded: 0,
    archived_at: null,
    created_by: "sample_owner",
    created_at: addDaysIso(-12),
    updated_at: addDaysIso(-1),
    members: sampleProjectMembers,
    chats: [],
    days_active: 12,
    task_count: 5,
    task_done_count: 2,
    is_abnormal: false,
    abnormal_reason: null,
    abnormal_chat_count: 0,
  },
  {
    project_id: -102,
    name: "科研成果材料整理",
    description: "把近期论文、会议纪要和实验记录整理成可检索的项目材料。",
    status: "planning",
    priority: "medium",
    project_type: "team",
    my_project_type: "team",
    owner_open_id: "sample_algo",
    department: "算法组",
    start_date: addDaysIso(-3),
    target_end_date: addDaysIso(21),
    actual_end_date: null,
    tags: "科研 材料",
    points_awarded: 0,
    archived_at: null,
    created_by: "sample_algo",
    created_at: addDaysIso(-3),
    updated_at: nowIso,
    members: sampleProjectMembers.slice(0, 2),
    chats: [],
    days_active: 3,
    task_count: 4,
    task_done_count: 0,
    is_abnormal: true,
    abnormal_reason: "尚未拆出已完成任务",
    abnormal_chat_count: 0,
  },
  {
    project_id: -103,
    name: "竞赛报名与材料提交",
    description: "完成参赛队伍信息确认、材料汇总和最终提交。",
    status: "completed",
    priority: "medium",
    project_type: "team",
    my_project_type: "team",
    owner_open_id: "sample_fe",
    department: "竞赛组",
    start_date: addDaysIso(-30),
    target_end_date: addDaysIso(-2),
    actual_end_date: addDaysIso(-1),
    tags: "竞赛 材料",
    points_awarded: 12,
    archived_at: null,
    created_by: "sample_fe",
    created_at: addDaysIso(-30),
    updated_at: addDaysIso(-1),
    members: sampleProjectMembers,
    chats: [],
    days_active: 29,
    task_count: 3,
    task_done_count: 3,
    is_abnormal: false,
    abnormal_reason: null,
    abnormal_chat_count: 0,
  },
  {
    project_id: -105,
    name: "省级科研项目申报",
    description: "围绕申报指南完成方向确认、申报书撰写、附件材料审核和提交归档。",
    status: "active",
    priority: "high",
    project_type: "team",
    my_project_type: "team",
    owner_open_id: "sample_owner",
    department: "申报组",
    start_date: addDaysIso(-6),
    target_end_date: addDaysIso(18),
    actual_end_date: null,
    tags: "申报 材料 内审",
    points_awarded: 0,
    archived_at: null,
    created_by: "sample_owner",
    created_at: addDaysIso(-6),
    updated_at: addDaysIso(-1),
    members: sampleProjectMembers,
    chats: [],
    days_active: 6,
    task_count: 5,
    task_done_count: 1,
    is_abnormal: false,
    abnormal_reason: null,
    abnormal_chat_count: 0,
  },
];

const sampleTasks: Task[] = [
  {
    task_id: -1041,
    project_id: -104,
    project_name: "论文：测试",
    project_tags: "科研 论文 审批",
    parent_task_id: null,
    title: "发起论文全流程审批",
    description: "提交论文标题、负责人、部门、指导人、调研报告和创新思路文档。",
    status: "done",
    priority: "high",
    assignee_open_id: "ou_20fec537961e0a66669370b00d0fc52d",
    planned_start_date: nowIso,
    due_date: nowIso,
    thinking: "以飞书审批实例作为流程起点。",
    progress_draft: "审批已发起，当前进入指导人审批。",
    completed_at: nowIso,
    created_by: "ou_20fec537961e0a66669370b00d0fc52d",
    created_at: nowIso,
    updated_at: nowIso,
  },
  {
    task_id: -1042,
    project_id: -104,
    project_name: "论文：测试",
    project_tags: "科研 论文 审批",
    parent_task_id: null,
    title: "指导人审批调研材料",
    description: "直接指导人评审调研报告和创新思路，决定是否进入开题报告审批。",
    status: "in_progress",
    priority: "high",
    assignee_open_id: "ou_fa03a8a212504ef323f28d22edf96204",
    planned_start_date: nowIso,
    due_date: addDaysIso(2),
    thinking: "当前审批节点来自飞书实例 current_nodes：指导人审批。",
    progress_draft: "等待罗凯宇审批。",
    completed_at: null,
    created_by: "ou_20fec537961e0a66669370b00d0fc52d",
    created_at: nowIso,
    updated_at: nowIso,
  },
  {
    task_id: -1043,
    project_id: -104,
    project_name: "论文：测试",
    project_tags: "科研 论文 审批",
    parent_task_id: null,
    title: "提交开题报告与模型代码",
    description: "通过调研审批后，提交开题报告飞书文档链接和 Gitee 代码。",
    status: "todo",
    priority: "medium",
    assignee_open_id: "ou_20fec537961e0a66669370b00d0fc52d",
    planned_start_date: null,
    due_date: addDaysIso(7),
    thinking: "等待指导人审批通过后启动。",
    progress_draft: null,
    completed_at: null,
    created_by: "ou_20fec537961e0a66669370b00d0fc52d",
    created_at: nowIso,
    updated_at: nowIso,
  },
  {
    task_id: -1044,
    project_id: -104,
    project_name: "论文：测试",
    project_tags: "科研 论文 审批",
    parent_task_id: null,
    title: "开题二轮评审与作者回复",
    description: "邀请 1-2 位评审人审稿，负责人按意见修改并提交回复。",
    status: "todo",
    priority: "medium",
    assignee_open_id: "ou_fa03a8a212504ef323f28d22edf96204",
    planned_start_date: null,
    due_date: addDaysIso(14),
    thinking: "开题材料通过初审后再分配评审人。",
    progress_draft: null,
    completed_at: null,
    created_by: "ou_20fec537961e0a66669370b00d0fc52d",
    created_at: nowIso,
    updated_at: nowIso,
  },
  {
    task_id: -1045,
    project_id: -104,
    project_name: "论文：测试",
    project_tags: "科研 论文 审批",
    parent_task_id: null,
    title: "论文初稿内审",
    description: "提交初稿附件，完成直接指导人审稿、三位审稿人内审、作者返修和复审评分。",
    status: "todo",
    priority: "medium",
    assignee_open_id: "ou_20fec537961e0a66669370b00d0fc52d",
    planned_start_date: null,
    due_date: addDaysIso(26),
    thinking: "开题同意后进入初稿写作和内审。",
    progress_draft: null,
    completed_at: null,
    created_by: "ou_20fec537961e0a66669370b00d0fc52d",
    created_at: nowIso,
    updated_at: nowIso,
  },
  {
    task_id: -1046,
    project_id: -104,
    project_name: "论文：测试",
    project_tags: "科研 论文 审批",
    parent_task_id: null,
    title: "老师终审与投稿",
    description: "通过内审后提交老师终审，老师同意后进行投稿或提交后续材料。",
    status: "todo",
    priority: "medium",
    assignee_open_id: "ou_fa03a8a212504ef323f28d22edf96204",
    planned_start_date: null,
    due_date: addDaysIso(35),
    thinking: "终审通过后标记论文投出。",
    progress_draft: null,
    completed_at: null,
    created_by: "ou_20fec537961e0a66669370b00d0fc52d",
    created_at: nowIso,
    updated_at: nowIso,
  },
  {
    task_id: -1001,
    project_id: -101,
    project_name: "实验室项目管理台优化",
    project_tags: "开发 前端 工作台",
    parent_task_id: null,
    title: "梳理项目管理页面信息架构",
    description: "确认项目、任务、成员、进度指标在首屏中的优先级。",
    status: "done",
    priority: "high",
    assignee_open_id: "sample_owner",
    planned_start_date: addDaysIso(-10),
    due_date: addDaysIso(-8),
    thinking: "先保留真实数据表，再移除干扰模块。",
    progress_draft: "已完成页面结构梳理。",
    completed_at: addDaysIso(-8),
    created_by: "sample_owner",
    created_at: addDaysIso(-10),
    updated_at: addDaysIso(-8),
  },
  {
    task_id: -1002,
    project_id: -101,
    project_name: "实验室项目管理台优化",
    project_tags: "开发 前端 工作台",
    parent_task_id: null,
    title: "补齐本地样例数据",
    description: "无后台时展示项目、任务、负责人、状态和进度。",
    status: "in_progress",
    priority: "high",
    assignee_open_id: "sample_fe",
    planned_start_date: addDaysIso(-1),
    due_date: addDaysIso(2),
    thinking: "用前端 fallback 数据，不影响真实接口。",
    progress_draft: "正在接入样例项目和任务。",
    completed_at: null,
    created_by: "sample_owner",
    created_at: addDaysIso(-1),
    updated_at: nowIso,
  },
  {
    task_id: -1003,
    project_id: -101,
    project_name: "实验室项目管理台优化",
    project_tags: "开发 前端 工作台",
    parent_task_id: null,
    title: "检查移动端表格滚动体验",
    description: "确认窄屏下筛选和列表不会挤压错位。",
    status: "todo",
    priority: "medium",
    assignee_open_id: "sample_fe",
    planned_start_date: null,
    due_date: addDaysIso(5),
    thinking: null,
    progress_draft: null,
    completed_at: null,
    created_by: "sample_owner",
    created_at: nowIso,
    updated_at: nowIso,
  },
  {
    task_id: -1004,
    project_id: -102,
    project_name: "科研成果材料整理",
    project_tags: "科研 材料",
    parent_task_id: null,
    title: "确定材料字段和分类标签",
    description: "定义论文、会议纪要、实验记录的最小字段集合。",
    status: "blocked",
    priority: "medium",
    assignee_open_id: "sample_algo",
    planned_start_date: addDaysIso(-2),
    due_date: addDaysIso(-1),
    thinking: "需要先确认后续检索维度。",
    progress_draft: "等待负责人确认字段口径。",
    completed_at: null,
    created_by: "sample_algo",
    created_at: addDaysIso(-2),
    updated_at: nowIso,
  },
  {
    task_id: -1005,
    project_id: -103,
    project_name: "竞赛报名与材料提交",
    project_tags: "竞赛 材料",
    parent_task_id: null,
    title: "提交报名材料",
    description: "完成队伍信息、附件和确认截图归档。",
    status: "done",
    priority: "medium",
    assignee_open_id: "sample_fe",
    planned_start_date: addDaysIso(-5),
    due_date: addDaysIso(-2),
    thinking: "按清单逐项核对。",
    progress_draft: "材料已提交并归档。",
    completed_at: addDaysIso(-1),
    created_by: "sample_fe",
    created_at: addDaysIso(-5),
    updated_at: addDaysIso(-1),
  },
];

const projectMatchesMember = (project: Project, memberOpenId?: string) =>
  !memberOpenId
  || project.owner_open_id === memberOpenId
  || project.members.some((member) => member.member_open_id === memberOpenId && !member.left_at);

const taskMatchesMember = (task: Task, memberOpenId?: string) =>
  !memberOpenId || task.assignee_open_id === memberOpenId || task.created_by === memberOpenId;

const splitProjectTags = (value?: string | null) =>
  (value || "")
    .split(/[,\s，、#]+/)
    .map((tag) => tag.trim())
    .filter(Boolean);

const getProjectCategory = (project: Project): ProjectCategoryFilter => {
  for (const tag of splitProjectTags(project.tags)) {
    if (projectCategoryValues.includes(tag as ProjectCategory)) return tag as ProjectCategory;
    if (legacyProjectCategoryMap[tag]) return legacyProjectCategoryMap[tag];
  }
  return "all";
};

const getProjectCustomTags = (value?: string | null) =>
  splitProjectTags(value)
    .filter((tag) => !projectCategoryValues.includes(tag as ProjectCategory) && !legacyProjectCategoryMap[tag])
    .join(" ");

const combineProjectTags = (category: ProjectCategoryFilter, customTags: string) => {
  const tags = splitProjectTags(customTags);
  if (category !== "all") tags.unshift(category);
  return Array.from(new Set(tags)).join(" ") || null;
};

const taskProjectLabel = (task: Task) => task.project_name || "独立任务";

const getPaperApprovalSnapshot = (projectId: number) =>
  paperApprovalSnapshots.find((snapshot) => snapshot.projectId === projectId);

const getStandardApprovalSnapshot = (project: Project): PaperApprovalSnapshot | undefined => {
  const category = getProjectCategory(project);
  if (category === "all") return undefined;
  const template = standardApprovalTemplates[category];
  const doneCount = Math.min(project.task_done_count || 0, template.length);
  const hasCurrent = project.status !== "completed" && doneCount < template.length;
  const steps: PaperApprovalStep[] = template.map((step, index) => {
    const status: PaperApprovalStepStatus = index < doneCount ? "done" : index === doneCount && hasCurrent ? "current" : "waiting";
    return {
      ...step,
      status,
      executor: step.executor === "负责人" ? (project.owner_open_id ? "项目负责人" : step.executor) : step.executor,
      startedAt: status === "done" || status === "current" ? addDaysIso(index * 2 - doneCount * 2) : undefined,
      completedAt: status === "done" ? addDaysIso(index * 2 - doneCount * 2 + 1) : undefined,
    };
  });
  const currentStep = steps.find((step) => step.status === "current") || steps[steps.length - 1];
  return {
    projectId: project.project_id,
    title: `${category}标准审批流程`,
    paperTitle: project.name,
    status: project.status === "completed" ? "APPROVED" : "PENDING",
    currentNode: currentStep.title,
    currentApprover: currentStep.approver || currentStep.owner,
    applicant: "项目负责人",
    department: project.department || "未设置",
    guide: currentStep.approver || currentStep.owner,
    submitted: doneCount > 0,
    documentUrl: "",
    summary: `${category}项目会自动关联该方向的标准节点与审批流程；创建或编辑项目时选择分类后，列表下方会展示对应进度。`,
    formItems: [
      { label: "项目分类", value: category },
      { label: "项目名称", value: project.name },
      { label: "所属部门", value: project.department || "未设置" },
      { label: "当前节点", value: currentStep.title },
    ],
    stages: template.map((step) => ({
      title: step.title,
      items: [
        `节点：${(categoryStageTemplates[category].find((stage) => stage.title === step.title)?.nodes || []).join("、")}`,
        `标准材料：${(step.materials || []).slice(0, 3).join("、") || "待补充"}`,
      ],
    })),
    steps,
  };
};

const getProjectApprovalSnapshot = (project: Project) =>
  getPaperApprovalSnapshot(project.project_id) || getStandardApprovalSnapshot(project);

const getPaperApprovalProgress = (snapshot: PaperApprovalSnapshot) => {
  const doneCount = snapshot.steps.filter((step) => step.status === "done").length;
  const currentWeight = snapshot.steps.some((step) => step.status === "current") ? 0.5 : 0;
  return Math.round(((doneCount + currentWeight) / snapshot.steps.length) * 100);
};

const mergePinnedSamples = <T extends { project_id: number }>(items: T[], samples: T[]) => {
  if (!shouldUseDemoData) return items;
  const seen = new Set<number>();
  return [...samples, ...items].filter((item) => {
    if (seen.has(item.project_id)) return false;
    seen.add(item.project_id);
    return true;
  });
};

const mergePinnedTasks = (items: Task[], samples: Task[]) => {
  if (!shouldUseDemoData) return items;
  const seen = new Set<number>();
  return [...samples, ...items].filter((item) => {
    if (seen.has(item.task_id)) return false;
    seen.add(item.task_id);
    return true;
  });
};

const formatDate = (value?: string | null): string => {
  if (!value) return "未设置";
  const normalized = value.replace("T", " ");
  return normalized.length >= 16 ? normalized.slice(0, 16) : normalized;
};

const formatShortDate = (value?: string | null): string => {
  if (!value) return "待定";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return `${date.getMonth() + 1}/${date.getDate()}`;
};

const daysBetween = (start?: string | null, end?: string | null): number | null => {
  if (!start) return null;
  const startMs = new Date(start).getTime();
  const endMs = end ? new Date(end).getTime() : Date.now();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
  return Math.max(0, Math.ceil((endMs - startMs) / 86400000));
};

const approvalStepDateLabel = (step: PaperApprovalStep) => {
  if (step.completedAt) return `完成 ${formatShortDate(step.completedAt)}`;
  if (step.status === "current") return `停留 ${formatShortDate(step.startedAt)}`;
  return "待流转";
};

const approvalLineDaysLabel = (step: PaperApprovalStep, next?: PaperApprovalStep) => {
  if (step.status === "current") {
    const days = daysBetween(step.startedAt, null);
    return days === null ? "停留中" : `停留${days}天`;
  }
  if (step.completedAt && next?.startedAt) {
    const days = daysBetween(step.completedAt, next.startedAt);
    return days === null ? "" : `${days}天`;
  }
  if (step.completedAt && next?.status === "current") {
    const days = daysBetween(step.completedAt, next.startedAt);
    return days === null ? "" : `${days}天`;
  }
  return "";
};

const toDateInputValue = (value?: string | null): string => {
  if (!value) return "";
  return value.slice(0, 10);
};

const formatMinutes = (value: number): string => {
  const minutes = Math.max(0, Math.round(value));
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} 小时 ${rest} 分钟` : `${hours} 小时`;
};

const extractMeetingUrls = (note: MeetingNote): string[] => {
  const text = [
    note.attachment_urls,
    note.summary,
    note.action_items,
    note.my_reflection,
    note.location,
  ].filter(Boolean).join("\n");
  return Array.from(new Set(text.match(/https?:\/\/[^\s，,。)）\]]+/g) || []))
    .filter((url) => /larksuite|feishu|meeting|vc\.feishu|minutes/i.test(url));
};

const parseMeetingDurationMinutes = (note: MeetingNote): number | null => {
  const text = [
    note.meeting_title,
    note.summary,
    note.action_items,
    note.my_reflection,
    note.tags,
  ].filter(Boolean).join(" ");
  const hourMatch = text.match(/(?:时长|会议时长|duration)[:：]?\s*(\d+(?:\.\d+)?)\s*(?:小时|h|hour)/i);
  if (hourMatch) return Math.round(Number(hourMatch[1]) * 60);
  const minuteMatch = text.match(/(?:时长|会议时长|duration)[:：]?\s*(\d+)\s*(?:分钟|分|min|minute)/i);
  if (minuteMatch) return Number(minuteMatch[1]);
  const mixedMatch = text.match(/(\d+)\s*(?:小时|h)\s*(\d+)?\s*(?:分钟|分|min)?/i);
  if (mixedMatch) return Number(mixedMatch[1]) * 60 + Number(mixedMatch[2] || 0);
  return null;
};

const extractCalendarEventUrls = (event: CalendarEvent): string[] => {
  const text = [event.description, event.location].filter(Boolean).join("\n");
  return Array.from(new Set(text.match(/https?:\/\/[^\s，,。)）\]]+/g) || []))
    .filter((url) => /larksuite|feishu|meeting|vc\.feishu|minutes/i.test(url));
};

const calendarEventDurationMinutes = (event: CalendarEvent): number => {
  const start = new Date(event.start_at).getTime();
  const end = new Date(event.end_at).getTime();
  return Number.isFinite(start) && Number.isFinite(end) && end > start ? Math.round((end - start) / 60000) : 0;
};

const larkStatusLabel = (status?: LarkUserStatus) => {
  if (!status) return "未同步";
  if (status.title) return status.title;
  const labelMap: Record<string, string> = {
    working: "工作中",
    focusing: "专注中",
    resting: "休息中",
    classroom: "上课中",
    meeting_room: "会议中",
    away: "离开",
    auto: "自动",
  };
  return status.presence_status ? labelMap[status.presence_status] || status.presence_status : "在线";
};

const taskSimilarityTokens = (task: Task) =>
  Array.from(new Set(
    `${task.title} ${task.description || ""} ${task.project_name || ""} ${task.project_tags || ""}`
      .toLowerCase()
      .split(/[\s,，、。；;:：/\\|()[\]{}#_-]+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2),
  ));

const projectSimilarityTokens = (project: Project) =>
  Array.from(new Set(
    `${project.name} ${project.description || ""}`
      .toLowerCase()
      .split(/[\s,，、。；;:：/\\|()[\]{}#_-]+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2),
  ));

const projectContentSimilarityTokens = (project: Project, relatedTasks: Task[] = []) =>
  Array.from(new Set([
    ...projectSimilarityTokens(project),
    ...relatedTasks.flatMap((task) => taskSimilarityTokens({ ...task, project_tags: "" })),
  ]));

const fetchAllMembers = async (): Promise<Member[]> => {
  const firstPage = await listMembers({ page: 1, page_size: 100 });
  const totalPages = Math.ceil(firstPage.total / firstPage.page_size);
  if (totalPages <= 1) return firstPage.items;
  const rest = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, index) => listMembers({ page: index + 2, page_size: firstPage.page_size })),
  );
  return firstPage.items.concat(rest.flatMap((page) => page.items));
};

const projectPanelStyles = `
  .pm-workbench {
    min-height: calc(100vh - 56px);
    background:
      linear-gradient(180deg, #F5F7FB 0, #F7F8FA 220px),
      #F7F8FA;
    color: #1F2329;
    font-family: Inter, Arial, "PingFang SC", "Microsoft YaHei", sans-serif;
  }
  .pm-topbar {
    position: sticky;
    top: 0;
    z-index: 20;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 0 18px;
    background: rgba(255,255,255,0.96);
    border-bottom: 1px solid #E5E6EB;
    backdrop-filter: blur(10px);
  }
  .pm-brand {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  .pm-mark {
    width: 22px;
    height: 22px;
    border-radius: 5px;
    background: linear-gradient(135deg, #3370FF, #14B8A6);
    color: #FFFFFF;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 800;
    flex: 0 0 auto;
  }
  .pm-title {
    font-size: 15px;
    font-weight: 700;
    color: #1F2329;
    white-space: nowrap;
  }
  .pm-breadcrumb {
    color: #646A73;
    font-size: 12px;
    white-space: nowrap;
  }
  .pm-module-tabs {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    height: 30px;
    padding: 2px;
    border: 1px solid #E5E6EB;
    border-radius: 6px;
    background: #F7F8FA;
  }
  .pm-tab-btn,
  .pm-tool-btn,
  .pm-icon-btn,
  .pm-row-action {
    border: 1px solid #E5E6EB;
    background: #FFFFFF;
    color: #1F2329;
    border-radius: 5px;
    height: 28px;
    padding: 0 10px;
    font-size: 13px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease;
  }
  .pm-tool-btn:hover,
  .pm-row-action:hover {
    border-color: #BACEFD;
    background: #F7FAFF;
    color: #1D4ED8;
  }
  .pm-tab-btn {
    border-color: transparent;
    background: transparent;
    color: #646A73;
  }
  .pm-tab-btn[data-active="true"] {
    background: #FFFFFF;
    border-color: #E5E6EB;
    color: #3370FF;
    font-weight: 700;
  }
  .pm-primary-btn {
    height: 30px;
    border: 1px solid #3370FF;
    border-radius: 5px;
    background: #3370FF;
    color: #FFFFFF;
    padding: 0 12px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease;
  }
  .pm-primary-btn:hover {
    background: #1D4ED8;
    box-shadow: 0 6px 14px rgba(51,112,255,0.18);
    transform: translateY(-1px);
  }
  .pm-unified-search {
    position: relative;
    width: 300px;
  }
  .pm-search {
    width: 100%;
    height: 30px;
    border: 1px solid #E5E6EB;
    border-radius: 5px;
    background: rgba(255,255,255,0.88);
    color: #1F2329;
    padding: 0 32px 0 10px;
    font-size: 13px;
    outline: none;
    box-sizing: border-box;
  }
  .pm-select {
    width: 180px;
    height: 30px;
    border: 1px solid #E5E6EB;
    border-radius: 5px;
    background: #FFFFFF;
    color: #1F2329;
    padding: 0 8px;
    font-size: 13px;
    outline: none;
  }
  .pm-search:focus {
    border-color: #3370FF;
    box-shadow: 0 0 0 2px rgba(51,112,255,0.08);
  }
  .pm-search-clear {
    position: absolute;
    right: 5px;
    top: 4px;
    width: 22px;
    height: 22px;
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: #8F959E;
    cursor: pointer;
  }
  .pm-search-clear:hover {
    background: #F2F3F5;
    color: #1F2329;
  }
  .pm-people-popover {
    position: absolute;
    z-index: 40;
    top: 36px;
    left: 0;
    width: 340px;
    max-height: 320px;
    overflow-y: auto;
    border: 1px solid #DDE4EE;
    border-radius: 10px;
    background: #FFFFFF;
    box-shadow: 0 18px 42px rgba(31,35,41,0.16);
    padding: 8px;
  }
  .pm-people-popover-title {
    color: #646A73;
    font-size: 12px;
    font-weight: 800;
    padding: 4px 6px 8px;
  }
  .pm-people-option {
    width: 100%;
    border: 0;
    border-radius: 8px;
    background: transparent;
    padding: 8px;
    display: flex;
    align-items: center;
    gap: 9px;
    text-align: left;
    cursor: pointer;
  }
  .pm-people-option:hover {
    background: #F0F6FF;
  }
  .pm-people-avatar {
    width: 30px;
    height: 30px;
    border-radius: 999px;
    background: #EEF4FF;
    color: #3370FF;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    font-weight: 900;
    flex: 0 0 auto;
  }
  .pm-people-main {
    min-width: 0;
  }
  .pm-people-name {
    color: #1F2329;
    font-size: 13px;
    font-weight: 850;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pm-people-meta {
    margin-top: 3px;
    color: #8F959E;
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pm-layout {
    display: grid;
    grid-template-columns: 220px minmax(0, 1fr);
    min-height: calc(100vh - 48px);
  }
  .pm-sidebar {
    position: sticky;
    top: 48px;
    align-self: start;
    height: calc(100vh - 48px);
    overflow-y: auto;
    background: linear-gradient(180deg, #FBFCFF 0%, #F6F8FC 100%);
    border-right: 1px solid #E5E6EB;
    padding: 14px 10px;
    overscroll-behavior: contain;
  }
  .pm-sidebar-section {
    margin-bottom: 18px;
  }
  .pm-sidebar-title {
    padding: 0 9px 7px;
    color: #6B7280;
    font-size: 13px;
    font-weight: 850;
  }
  .pm-nav-item {
    width: 100%;
    min-height: 38px;
    border: 1px solid transparent;
    border-radius: 8px;
    background: rgba(255,255,255,0.56);
    color: #1F2329;
    padding: 0 9px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-size: 14px;
    font-weight: 650;
    cursor: pointer;
    position: relative;
    margin-bottom: 5px;
  }
  .pm-nav-item:hover {
    background: #FFFFFF;
    border-color: #DDE6F6;
  }
  .pm-nav-item[data-active="true"] {
    background: #EEF5FF;
    border-color: #BACEFD;
    color: #3370FF;
    font-weight: 850;
    box-shadow: 0 6px 16px rgba(51,112,255,0.08);
  }
  .pm-nav-item[data-active="true"]::before {
    content: "";
    position: absolute;
    left: 0;
    top: 8px;
    bottom: 8px;
    width: 3px;
    border-radius: 999px;
    background: #3370FF;
  }
  .pm-nav-count {
    color: #7B8494;
    font-size: 12px;
    font-weight: 800;
  }
  .pm-nav-label {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
  }
  .pm-nav-icon {
    width: 22px;
    height: 22px;
    border-radius: 7px;
    background: #EEF4FF;
    color: #3370FF;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    flex: 0 0 auto;
  }
  .pm-sidebar-metric {
    padding: 8px;
    border: 1px solid #E8EAED;
    border-radius: 6px;
    background: #FAFAFA;
    margin-top: 8px;
  }
  .pm-sidebar-metric-row {
    display: flex;
    justify-content: space-between;
    color: #646A73;
    font-size: 12px;
    margin-bottom: 6px;
  }
  .pm-progress {
    height: 5px;
    border-radius: 999px;
    background: #E5E6EB;
    overflow: hidden;
  }
  .pm-progress > span {
    display: block;
    height: 100%;
    background: #3370FF;
  }
  .pm-approval-progress > span {
    background: #14B8A6;
  }
  .pm-approval-inline {
    min-width: 0;
  }
  .pm-approval-inline-sub {
    margin-top: 4px;
    color: #646A73;
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pm-main {
    min-width: 0;
    padding: 14px 16px 22px;
    background: #F3F6FB;
  }
  .pm-metric-card {
    border: 1px solid #D8E2F0;
    border-radius: 10px;
    background: linear-gradient(180deg, #FFFFFF 0%, #F9FBFF 100%);
    box-shadow: 0 10px 28px rgba(31,35,41,0.04);
  }
  .pm-toolbar {
    min-height: 44px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    background: #FFFFFF;
    border: 1px solid #DDE3EC;
    border-radius: 6px 6px 0 0;
    padding: 8px 10px;
  }
  .pm-toolbar-left,
  .pm-toolbar-right {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .pm-view-title {
    color: #1F2329;
    font-size: 16px;
    font-weight: 800;
  }
  .pm-muted {
    color: #646A73;
    font-size: 12px;
  }
  .pm-selector {
    --border-radius: 5px;
    --checked-color: #3370FF;
    max-width: 520px;
  }
  .pm-selector .adm-selector-item {
    min-height: 28px;
    border-radius: 5px;
    font-size: 12px;
    padding: 4px 9px;
  }
  .pm-content {
    background: #F7F9FC;
    border: 1px solid #D8E2F0;
    border-top: 0;
    border-radius: 0 0 10px 10px;
    min-height: 520px;
    overflow: hidden;
    box-shadow: 0 8px 22px rgba(31,35,41,0.04);
  }
  .pm-summary-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 10px;
    margin: 10px 0;
  }
  .pm-cockpit {
    display: grid;
    gap: 12px;
    margin-bottom: 14px;
  }
  .pm-cockpit-hero {
    border-radius: 12px;
    background: linear-gradient(120deg, #172642, #2B1D49);
    color: #FFFFFF;
    padding: 18px;
  }
  .pm-cockpit-kicker {
    color: rgba(255,255,255,0.72);
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.8px;
  }
  .pm-cockpit-title {
    margin-top: 6px;
    font-size: 22px;
    font-weight: 900;
  }
  .pm-cockpit-sub {
    margin-top: 6px;
    color: rgba(255,255,255,0.76);
    font-size: 13px;
  }
  .pm-identity-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
    margin-top: 14px;
  }
  .pm-identity-item {
    border-radius: 8px;
    background: rgba(255,255,255,0.12);
    padding: 9px 10px;
    min-width: 0;
  }
  .pm-identity-item small {
    display: block;
    color: rgba(255,255,255,0.66);
    font-size: 11px;
  }
  .pm-identity-item b {
    display: block;
    margin-top: 3px;
    color: rgba(255,255,255,0.94);
    font-size: 13px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pm-identity-switch {
    display: inline-flex;
    gap: 6px;
    border-radius: 8px;
    background: rgba(255,255,255,0.12);
    padding: 4px;
    margin-top: 12px;
  }
  .pm-identity-switch button {
    height: 28px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: rgba(255,255,255,0.78);
    padding: 0 10px;
    font-size: 12px;
    font-weight: 800;
    cursor: pointer;
  }
  .pm-identity-switch button[data-active="true"] {
    background: #FFFFFF;
    color: #1D4ED8;
  }
  .pm-cockpit-grid {
    display: grid;
    grid-template-columns: 1.05fr 0.95fr;
    gap: 12px;
  }
  .pm-cockpit-panel {
    border: 1px solid #DDE6F6;
    border-radius: 10px;
    background: linear-gradient(180deg, #FFFFFF 0%, #F7FAFF 100%);
    padding: 14px;
    min-width: 0;
  }
  .pm-cockpit-panel h3 {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    margin: 0 0 10px;
    color: #1F2329;
    font-size: 14px;
  }
  .pm-cockpit-panel h3 span {
    color: #8F959E;
    font-size: 12px;
    font-weight: 600;
  }
  .pm-brief-list {
    display: grid;
    gap: 8px;
  }
  .pm-brief-item {
    display: grid;
    grid-template-columns: 8px minmax(0, 1fr) auto;
    gap: 9px;
    align-items: start;
    border: 1px solid #F0F2F5;
    border-radius: 8px;
    background: #FAFBFC;
    padding: 9px;
  }
  .pm-brief-dot {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    margin-top: 5px;
  }
  .pm-brief-title {
    color: #1F2329;
    font-size: 13px;
    font-weight: 800;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pm-brief-desc {
    margin-top: 2px;
    color: #646A73;
    font-size: 12px;
    line-height: 1.45;
    overflow-wrap: anywhere;
  }
  .pm-cockpit-metrics {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 9px;
  }
  .pm-cockpit-metric {
    border-radius: 10px;
    background: #EEF5FF;
    padding: 12px;
  }
  .pm-cockpit-metric small {
    color: #646A73;
    font-size: 12px;
  }
  .pm-cockpit-metric b {
    display: block;
    margin-top: 4px;
    color: #111827;
    font-size: 24px;
  }
  .pm-line-health {
    display: grid;
    gap: 7px;
    margin-top: 12px;
  }
  .pm-line-health-row {
    display: grid;
    grid-template-columns: 52px minmax(0, 1fr) 34px;
    gap: 8px;
    align-items: center;
    color: #646A73;
    font-size: 12px;
  }
  .pm-line-health-bar {
    height: 7px;
    border-radius: 999px;
    background: #EEF0F4;
    overflow: hidden;
  }
  .pm-line-health-bar i {
    display: block;
    height: 100%;
    border-radius: inherit;
  }
  .pm-view-switch {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .pm-view-switch button {
    height: 28px;
    border: 1px solid #E5E6EB;
    border-radius: 6px;
    background: #FFFFFF;
    color: #4E5969;
    padding: 0 10px;
    font-size: 12px;
    cursor: pointer;
  }
  .pm-view-switch button[data-active="true"] {
    border-color: #3370FF;
    background: #F0F6FF;
    color: #3370FF;
    font-weight: 800;
  }
  .pm-category-select {
    height: 30px;
    min-width: 128px;
    border: 1px solid #E5E6EB;
    border-radius: 6px;
    background: #FFFFFF;
    color: #1F2329;
    padding: 0 30px 0 10px;
    font-size: 12px;
    font-weight: 800;
    outline: none;
  }
  .pm-category-select:focus {
    border-color: #3370FF;
    box-shadow: 0 0 0 3px rgba(51,112,255,0.12);
  }
  .pm-view-panel {
    padding: 12px;
  }
  .pm-board-grid {
    display: grid;
    grid-template-columns: repeat(7, minmax(180px, 1fr));
    gap: 12px;
    min-width: 1320px;
  }
  .pm-board-column {
    border: 1px solid #DDE6F6;
    border-radius: 10px;
    background: #F0F6FF;
    min-height: 280px;
    padding: 10px;
  }
  .pm-board-head {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    color: #1F2329;
    font-size: 13px;
    font-weight: 850;
    margin-bottom: 9px;
  }
  .pm-board-card {
    width: 100%;
    border: 1px solid #E5E6EB;
    border-radius: 8px;
    background: #FFFFFF;
    padding: 9px;
    margin-bottom: 8px;
    text-align: left;
    cursor: pointer;
  }
  .pm-board-card b {
    display: block;
    color: #1F2329;
    font-size: 13px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pm-board-card small {
    display: block;
    margin-top: 5px;
    color: #646A73;
    font-size: 12px;
  }
  .pm-gantt-sheet {
    min-width: 1080px;
    border: 1px solid #D4E0F0;
    border-radius: 10px;
    background: #FFFFFF;
    overflow: hidden;
  }
  .pm-gantt-head,
  .pm-gantt-row {
    display: grid;
    grid-template-columns: 260px 108px 96px 96px 1fr;
    align-items: center;
  }
  .pm-gantt-head {
    min-height: 38px;
    background: #F7F9FC;
    border-bottom: 1px solid #E5E6EB;
    color: #646A73;
    font-size: 12px;
    font-weight: 850;
  }
  .pm-gantt-head > span,
  .pm-gantt-cell {
    min-width: 0;
    padding: 8px 10px;
    border-right: 1px solid #EEF0F4;
  }
  .pm-gantt-row {
    min-height: 46px;
    border-bottom: 1px solid #F0F2F5;
    background: #FFFFFF;
    cursor: pointer;
  }
  .pm-gantt-row:hover {
    background: #F7FAFF;
  }
  .pm-gantt-name {
    min-width: 0;
    color: #1F2329;
    font-size: 13px;
    font-weight: 800;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pm-gantt-days {
    display: grid;
    height: 100%;
  }
  .pm-gantt-day {
    display: flex;
    align-items: center;
    justify-content: center;
    border-right: 1px solid #EEF0F4;
    color: #646A73;
    font-size: 12px;
    white-space: nowrap;
  }
  .pm-gantt-track {
    position: relative;
    height: 100%;
    min-height: 46px;
    background-image: linear-gradient(to right, #EEF0F4 1px, transparent 1px);
    background-size: 44px 100%;
  }
  .pm-gantt-bar {
    position: absolute;
    top: 13px;
    display: block;
    height: 20px;
    min-width: 24px;
    border-radius: 5px;
    background: linear-gradient(90deg, #3370FF, #14B8A6);
    box-shadow: 0 4px 10px rgba(51,112,255,0.22);
  }
  .pm-gantt-bar[data-status="planning"] {
    background: linear-gradient(90deg, #8FC0FF, #3370FF);
  }
  .pm-gantt-bar[data-status="completed"],
  .pm-gantt-bar[data-status="archived"] {
    background: linear-gradient(90deg, #34C759, #14B8A6);
  }
  .pm-metric-card {
    padding: 12px;
  }
  .pm-metric-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(92px, 1fr));
    gap: 8px;
  }
  .pm-metric-item {
    border: 1px solid #EEF0F4;
    border-radius: 7px;
    background: #FAFBFC;
    padding: 9px;
  }
  .pm-metric-number {
    color: #1F2329;
    font-size: 18px;
    line-height: 1.1;
    font-weight: 850;
  }
  .pm-metric-number[data-tone="good"] {
    color: #15803D;
  }
  .pm-metric-number[data-tone="warn"] {
    color: #B45309;
  }
  .pm-metric-number[data-tone="danger"] {
    color: #B91C1C;
  }
  .pm-status-overview-grid {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 8px;
    grid-column: 1 / -1;
  }
  .pm-status-card {
    border: 1px solid #DDE6F6;
    border-radius: 10px;
    background: #F8FBFF;
    padding: 9px;
    min-width: 0;
  }
  .pm-status-card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 7px;
  }
  .pm-status-card-title {
    color: #646A73;
    font-size: 12px;
    font-weight: 800;
  }
  .pm-status-card-count {
    color: #1F2329;
    font-size: 18px;
    line-height: 1;
    font-weight: 900;
  }
  .pm-status-project-list {
    display: grid;
    gap: 4px;
    max-height: 168px;
    overflow-y: auto;
    padding-right: 2px;
    scrollbar-width: thin;
    overscroll-behavior: contain;
  }
  .pm-status-project-name {
    width: 100%;
    border: 0;
    border-radius: 4px;
    background: #FFFFFF;
    color: #1F2329;
    padding: 4px 6px;
    font-size: 12px;
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
    font-family: inherit;
  }
  .pm-status-project-name:hover,
  .pm-status-project-name:focus-visible {
    color: #3370FF;
    background: #F0F6FF;
    outline: none;
  }
  .pm-status-card-empty {
    color: #A8ABB2;
    font-size: 12px;
    padding: 4px 0;
  }
  .pm-table-scroll {
    width: 100%;
    overflow-x: auto;
  }
  .pm-project-list {
    display: grid;
    gap: 14px;
    padding: 12px;
    background: #F4F6FA;
  }
  .pm-project-card {
    border: 1px solid #D6E1EF;
    border-radius: 10px;
    background: linear-gradient(180deg, #FFFFFF 0%, #FBFDFF 100%);
    box-shadow: 0 8px 20px rgba(31,35,41,0.06);
    overflow: hidden;
    scroll-margin-top: 76px;
    transition: border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
  }
  .pm-project-card[data-highlight="true"] {
    border-color: #3370FF;
    box-shadow: 0 0 0 3px rgba(51,112,255,0.16), 0 8px 20px rgba(31,35,41,0.06);
    background: #F8FBFF;
  }
  .pm-project-card-head {
    display: grid;
    grid-template-columns: minmax(220px, 1.35fr) minmax(110px, 0.52fr) minmax(90px, 0.45fr) minmax(80px, 0.42fr) minmax(150px, 0.74fr) minmax(60px, 0.3fr) minmax(110px, 0.55fr) minmax(60px, 0.3fr);
    gap: 10px;
    align-items: center;
    min-width: 820px;
    padding: 10px 12px;
  }
  .pm-project-card-labels {
    display: grid;
    grid-template-columns: minmax(220px, 1.35fr) minmax(110px, 0.52fr) minmax(90px, 0.45fr) minmax(80px, 0.42fr) minmax(150px, 0.74fr) minmax(60px, 0.3fr) minmax(110px, 0.55fr) minmax(60px, 0.3fr);
    gap: 10px;
    min-width: 820px;
    padding: 8px 12px;
    color: #646A73;
    font-size: 11px;
    font-weight: 800;
    border-bottom: 1px solid #E5E6EB;
    background: #F7F8FA;
  }
  .pm-project-card-cell {
    min-width: 0;
    color: #1F2329;
    font-size: 12px;
  }
  .pm-project-card-cell-action {
    display: flex;
    justify-content: flex-end;
    align-items: center;
  }
  .pm-project-card-label-action {
    text-align: right;
  }
  .pm-project-card:hover {
    border-color: #C8D6EA;
    box-shadow: 0 10px 24px rgba(31,35,41,0.08);
  }
  .pm-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }
  .pm-table th {
    height: 32px;
    padding: 0 9px;
    border-bottom: 1px solid #E5E6EB;
    background: #F7F8FA;
    color: #646A73;
    font-size: 11px;
    font-weight: 700;
    text-align: left;
  }
  .pm-table td {
    height: 40px;
    padding: 6px 9px;
    border-bottom: 1px solid #E8EAED;
    color: #1F2329;
    font-size: 12px;
    vertical-align: middle;
  }
  .pm-table tr:hover td {
    background: #F7FAFF;
  }
  .pm-table tr[data-expanded="true"] td {
    background: #F7FAFF;
  }
  .pm-project-table tbody tr.pm-project-main-row td {
    background: #FFFFFF;
    border-top: 12px solid #F4F6FA;
    border-bottom: 1px solid #E6EAF2;
  }
  .pm-project-table tbody tr.pm-project-main-row td:first-child {
    border-left: 1px solid #E1E7F0;
    border-radius: 8px 0 0 0;
  }
  .pm-project-table tbody tr.pm-project-main-row td:last-child {
    border-right: 1px solid #E1E7F0;
    border-radius: 0 8px 0 0;
  }
  .pm-project-table tbody tr.pm-project-main-row[data-has-approval="false"] td {
    border-bottom: 1px solid #E1E7F0;
  }
  .pm-project-table tbody tr.pm-project-main-row[data-has-approval="false"] td:first-child {
    border-radius: 8px 0 0 8px;
  }
  .pm-project-table tbody tr.pm-project-main-row[data-has-approval="false"] td:last-child {
    border-radius: 0 8px 8px 0;
  }
  .pm-project-table tbody tr.pm-project-main-row:hover td {
    background: #FBFCFF;
  }
  .pm-approval-board-row {
    background: #F3F7FF;
    padding: 8px 10px 10px;
    border-top: 1px solid #E8EEF8;
  }
  .pm-approval-board-row:hover {
    background: #F3F7FF;
  }
  .pm-stage-node-map {
    background: #FFFFFF;
    border-top: 1px solid #EEF3FB;
    padding: 9px 10px 10px;
  }
  .pm-stage-node-map-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 8px;
    color: #646A73;
    font-size: 11px;
  }
  .pm-stage-node-map-head span {
    color: #1F2329;
    font-weight: 850;
  }
  .pm-stage-node-map-head b {
    color: #3370FF;
    font-size: 11px;
  }
  .pm-stage-node-grid {
    display: grid;
    grid-template-columns: repeat(7, minmax(132px, 1fr));
    gap: 7px;
    overflow-x: auto;
  }
  .pm-stage-node-item {
    min-width: 132px;
    border: 1px solid #E8EEF8;
    border-radius: 7px;
    background: #FAFCFF;
    padding: 7px;
  }
  .pm-stage-node-title {
    color: #1D4ED8;
    font-size: 11px;
    line-height: 1.25;
    font-weight: 850;
    margin-bottom: 5px;
  }
  .pm-stage-node-list {
    color: #4E5969;
    font-size: 11px;
    line-height: 1.45;
    word-break: break-word;
  }
  .pm-approval-board {
    max-width: none;
    margin: 0;
    border: 1px solid #D8E4F8;
    border-radius: 8px;
    background: #FFFFFF;
    padding: 8px 10px;
    box-shadow: 0 4px 14px rgba(31,35,41,0.04);
    cursor: pointer;
  }
  .pm-approval-board-head {
    display: flex;
    align-items: center;
    gap: 5px;
    color: #646A73;
    font-size: 11px;
    margin-bottom: 7px;
    flex-wrap: wrap;
    padding-bottom: 7px;
    border-bottom: 1px solid #EEF3FB;
  }
  .pm-approval-board-head > span:first-child {
    color: #1F2329;
    font-weight: 800;
  }
  .pm-approval-board-head b {
    color: #1D4ED8;
    font-size: 12px;
  }
  .pm-approval-node-flow {
    display: flex;
    align-items: flex-start;
    gap: 0;
    margin-top: 0;
    overflow-x: auto;
    padding: 3px 0 5px;
    background: #FAFCFF;
    border-radius: 6px;
  }
  .pm-approval-node-wrap {
    position: relative;
    display: grid;
    justify-items: center;
    gap: 4px;
    width: 76px;
    flex: 0 0 76px;
    border: 0;
    background: transparent;
    padding: 0;
    cursor: pointer;
  }
  .pm-approval-node-wrap:hover .pm-approval-node {
    transform: translateY(-1px);
    box-shadow: 0 3px 8px rgba(31,35,41,0.12);
  }
  .pm-approval-node {
    width: 18px;
    height: 18px;
    border-radius: 999px;
    border: 2px solid #32C15B;
    background: #EAFBE8;
    color: #168A35;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 9px;
    font-weight: 850;
    box-sizing: border-box;
    transition: transform 0.12s ease, box-shadow 0.12s ease;
  }
  .pm-approval-node-wrap[data-status="current"] .pm-approval-node {
    border-color: #3370FF;
    background: #3370FF;
    color: #FFFFFF;
    box-shadow: 0 0 0 3px rgba(51,112,255,0.12);
  }
  .pm-approval-node-wrap[data-selected="true"] .pm-approval-node {
    outline: 2px solid rgba(51,112,255,0.28);
    outline-offset: 2px;
  }
  .pm-approval-node-wrap[data-status="waiting"] .pm-approval-node {
    border-color: #C6CBD2;
    color: #8F959E;
    background: #FFFFFF;
  }
  .pm-approval-node-label {
    width: 74px;
    color: #1F2329;
    font-size: 9px;
    line-height: 1.25;
    text-align: center;
    word-break: keep-all;
  }
  .pm-approval-node-date {
    color: #8F959E;
    font-size: 9px;
    line-height: 1.1;
    height: 11px;
    max-width: 74px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pm-approval-node-wrap[data-status="done"] .pm-approval-node-date {
    color: #15803D;
  }
  .pm-approval-node-wrap[data-status="current"] .pm-approval-node-date {
    color: #1D4ED8;
    font-weight: 700;
  }
  .pm-approval-line {
    height: 2px;
    width: 24px;
    flex: 0 0 24px;
    margin-top: 19px;
    background: #BFC6D1;
    position: relative;
  }
  .pm-approval-line span {
    position: absolute;
    left: 50%;
    top: -15px;
    transform: translateX(-50%);
    color: #8F959E;
    font-size: 9px;
    line-height: 1;
    white-space: nowrap;
  }
  .pm-approval-line::after {
    content: "";
    position: absolute;
    right: -1px;
    top: -3px;
    width: 6px;
    height: 6px;
    border-top: 2px solid #C6CBD2;
    border-right: 2px solid #C6CBD2;
    transform: rotate(45deg);
  }
  .pm-approval-line[data-active="true"] {
    background: #74C989;
  }
  .pm-approval-line[data-active="true"]::after {
    border-color: #74C989;
  }
  .pm-approval-line[data-active="true"] span {
    color: #15803D;
  }
  .pm-approval-node-wrap[data-status="done"] .pm-approval-node-label {
    color: #15803D;
    font-weight: 700;
  }
  .pm-approval-node-wrap[data-status="current"] .pm-approval-node-label {
    color: #1D4ED8;
    font-weight: 850;
  }
  .pm-approval-node-group {
    color: #8F959E;
    font-size: 9px;
    line-height: 1.1;
    height: 11px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 74px;
  }
  .pm-approval-dialog {
    display: grid;
    gap: 12px;
    text-align: left;
  }
  .pm-approval-dialog-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  .pm-approval-dialog-grid div,
  .pm-approval-dialog-section {
    border: 1px solid #E8EAED;
    border-radius: 6px;
    background: #FAFBFC;
    padding: 8px;
  }
  .pm-approval-dialog span {
    display: block;
    color: #8F959E;
    font-size: 12px;
    margin-bottom: 3px;
  }
  .pm-approval-dialog b {
    display: block;
    color: #1F2329;
    font-size: 13px;
    line-height: 1.45;
    overflow-wrap: anywhere;
  }
  .pm-approval-dialog p {
    margin: 0;
    color: #1F2329;
    font-size: 13px;
    line-height: 1.55;
  }
  .pm-approval-node-panel {
    margin-top: 10px;
    border: 1px solid #C9D8F0;
    border-radius: 7px;
    background: #FBFCFF;
    padding: 10px;
    box-shadow: inset 3px 0 0 #3370FF;
  }
  .pm-approval-panel-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 10px;
    padding-bottom: 8px;
    border-bottom: 1px solid #E5ECF8;
  }
  .pm-approval-panel-title {
    color: #1F2329;
    font-size: 13px;
    font-weight: 850;
  }
  .pm-approval-panel-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    flex-wrap: wrap;
  }
  .pm-approval-panel-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
    margin-bottom: 8px;
  }
  .pm-approval-panel-grid div {
    border: 1px solid #EEF0F4;
    border-radius: 6px;
    background: #FAFBFC;
    padding: 7px;
    min-width: 0;
  }
  .pm-approval-panel-grid span,
  .pm-approval-panel-box > .pm-muted {
    color: #8F959E;
    font-size: 11px;
  }
  .pm-approval-panel-grid b {
    display: block;
    margin-top: 2px;
    color: #1F2329;
    font-size: 12px;
    overflow-wrap: anywhere;
  }
  .pm-approval-panel-split {
    display: grid;
    grid-template-columns: minmax(240px, 0.82fr) minmax(320px, 1.18fr);
    gap: 10px;
  }
  .pm-approval-panel-box {
    border: 1px solid #E0E7F2;
    border-radius: 6px;
    background: #FFFFFF;
    padding: 9px;
  }
  .pm-approval-material-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .pm-approval-material-list label {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-height: 24px;
    border: 1px solid #E5E6EB;
    border-radius: 999px;
    background: #FFFFFF;
    padding: 0 8px;
    color: #1F2329;
    font-size: 12px;
  }
  .pm-approval-material-table {
    display: grid;
    gap: 8px;
  }
  .pm-approval-material-row {
    display: grid;
    grid-template-columns: minmax(160px, 0.8fr) minmax(240px, 1fr) 96px;
    gap: 8px;
    align-items: center;
    border: 1px solid #EEF0F4;
    border-radius: 6px;
    background: #FAFBFC;
    padding: 8px;
  }
  .pm-approval-material-name {
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
  }
  .pm-approval-material-name span {
    width: 18px;
    height: 18px;
    border-radius: 999px;
    background: #E8F3FF;
    color: #1D4ED8;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-weight: 800;
    flex: 0 0 auto;
  }
  .pm-approval-material-name b {
    color: #1F2329;
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pm-upload-btn {
    height: 30px;
    border: 1px solid #BACEFD;
    border-radius: 5px;
    background: #F7FAFF;
    color: #1D4ED8;
    font-size: 12px;
    font-weight: 700;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    overflow: hidden;
  }
  .pm-upload-btn input {
    display: none;
  }
  .pm-material-readonly {
    min-height: 36px;
    border: 1px solid #E5E6EB;
    border-radius: 6px;
    background: #FAFAFA;
    color: #646A73;
    padding: 8px 10px;
    font-size: 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .pm-material-readonly a {
    color: #1D4ED8;
    font-weight: 700;
    text-decoration: none;
  }
  .pm-guidance-box {
    margin-top: 10px;
    border: 1px solid #E4D7FF;
    border-radius: 6px;
    background: #FCFAFF;
    padding: 9px;
  }
  .pm-guidance-head,
  .pm-guidance-record-top,
  .pm-guidance-record-meta,
  .pm-guidance-evidence-tags {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .pm-guidance-head {
    justify-content: space-between;
    margin-bottom: 8px;
    padding-bottom: 8px;
    border-bottom: 1px solid #EFE7FF;
  }
  .pm-guidance-evidence-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    margin-bottom: 8px;
  }
  .pm-guidance-evidence-card {
    border: 1px solid #EEE7FA;
    border-radius: 6px;
    background: #FFFFFF;
    padding: 8px;
    min-width: 0;
  }
  .pm-guidance-evidence-card span,
  .pm-guidance-record-meta {
    color: #8F959E;
    font-size: 11px;
  }
  .pm-guidance-evidence-card b {
    display: block;
    margin-top: 3px;
    color: #1F2329;
    font-size: 12px;
    line-height: 1.45;
  }
  .pm-guidance-form {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
    margin-bottom: 9px;
  }
  .pm-guidance-checks {
    grid-column: 1 / -1;
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
  }
  .pm-guidance-checks label {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 28px;
    border: 1px solid #E5E6EB;
    border-radius: 999px;
    background: #FFFFFF;
    padding: 0 9px;
    color: #4E5969;
    font-size: 12px;
  }
  .pm-guidance-textarea {
    grid-column: 1 / 4;
    min-height: 64px;
    resize: vertical;
  }
  .pm-guidance-save {
    min-height: 64px;
    align-self: stretch;
  }
  .pm-guidance-record-list {
    display: grid;
    gap: 8px;
  }
  .pm-guidance-record {
    border: 1px solid #EEE7FA;
    border-radius: 6px;
    background: #FFFFFF;
    padding: 8px;
  }
  .pm-guidance-record-top {
    justify-content: space-between;
  }
  .pm-guidance-record-top b {
    color: #1F2329;
    font-size: 12px;
  }
  .pm-guidance-record p {
    margin: 6px 0;
    color: #1F2329;
    font-size: 12px;
    line-height: 1.55;
  }
  .pm-guidance-evidence-tags {
    margin-top: 6px;
  }
  .pm-guidance-evidence-tags span {
    border-radius: 999px;
    background: #F4F3FF;
    color: #5B21B6;
    padding: 3px 7px;
    font-size: 11px;
    font-weight: 700;
  }
  .pm-kv-line {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    border-top: 1px solid #F0F2F5;
    padding: 8px 0;
    color: #1F2329;
    font-size: 12px;
  }
  .pm-kv-line span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pm-kv-line b {
    color: #3370FF;
    white-space: nowrap;
  }
  .pm-name-cell {
    min-width: 0;
  }
  .pm-name-main {
    color: #1F2329;
    font-size: 13px;
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pm-name-sub {
    margin-top: 2px;
    color: #8F959E;
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pm-tag {
    display: inline-flex;
    align-items: center;
    height: 20px;
    border-radius: 999px;
    padding: 0 8px;
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
  }
  .pm-assignee {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
  .pm-assignee-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pm-row-action {
    height: 26px;
    color: #646A73;
    padding: 0 8px;
  }
  .pm-row-action-danger {
    color: #C2410C;
  }
  .pm-row-action-danger:hover {
    border-color: #FCA5A5;
    background: #FFF1F0;
  }
  .pm-inline-editor {
    padding: 14px;
    background: #F4F6FA;
    border-bottom: 1px solid #E5E6EB;
  }
  .pm-detail-shell {
    display: grid;
    gap: 12px;
  }
  .pm-detail-head {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 12px;
    align-items: center;
    background: #FFFFFF;
    border: 1px solid #E1E6F0;
    border-radius: 8px;
    padding: 12px;
  }
  .pm-detail-title {
    color: #1F2329;
    font-size: 16px;
    font-weight: 850;
    line-height: 1.35;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pm-detail-subtitle {
    margin-top: 4px;
    color: #646A73;
    font-size: 12px;
    line-height: 1.5;
  }
  .pm-detail-badges {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
    flex-wrap: wrap;
  }
  .pm-detail-section {
    background: #FFFFFF;
    border: 1px solid #E1E6F0;
    border-radius: 8px;
    overflow: hidden;
  }
  .pm-detail-section-head {
    min-height: 38px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 9px 12px;
    background: #FAFBFC;
    border-bottom: 1px solid #E8EAED;
  }
  .pm-detail-section-title {
    color: #1F2329;
    font-size: 13px;
    font-weight: 850;
  }
  .pm-detail-section-body {
    padding: 12px;
  }
  .pm-approval-section {
    border-color: #BACEFD;
  }
  .pm-approval-status-strip {
    display: grid;
    grid-template-columns: minmax(180px, 1.2fr) minmax(150px, 1fr) minmax(120px, 0.8fr) auto;
    gap: 10px;
    align-items: center;
    border: 1px solid #D8E3FF;
    border-radius: 7px;
    background: #F7FAFF;
    padding: 10px 12px;
  }
  .pm-approval-status-strip div {
    min-width: 0;
  }
  .pm-approval-status-strip span:not(.pm-tag) {
    display: block;
    color: #646A73;
    font-size: 12px;
    margin-bottom: 3px;
  }
  .pm-approval-status-strip b {
    display: block;
    color: #1F2329;
    font-size: 13px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pm-approval-hero {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 220px;
    gap: 14px;
    align-items: stretch;
    padding-bottom: 12px;
    border-bottom: 1px solid #E8EAED;
  }
  .pm-approval-kicker {
    color: #3370FF;
    font-size: 12px;
    font-weight: 800;
    margin-bottom: 4px;
  }
  .pm-approval-title {
    color: #1F2329;
    font-size: 20px;
    line-height: 1.3;
    font-weight: 900;
  }
  .pm-approval-desc {
    margin-top: 8px;
    color: #4E5969;
    font-size: 13px;
    line-height: 1.7;
  }
  .pm-approval-current {
    border: 1px solid #D8E3FF;
    border-radius: 7px;
    background: #F7FAFF;
    padding: 12px;
    display: grid;
    gap: 7px;
    align-content: start;
  }
  .pm-approval-current b {
    color: #1F2329;
    font-size: 16px;
  }
  .pm-approval-current span:not(.pm-tag) {
    color: #646A73;
    font-size: 12px;
  }
  .pm-approval-stepper {
    display: grid;
    grid-template-columns: repeat(6, minmax(150px, 1fr));
    gap: 8px;
    margin-top: 10px;
    overflow-x: auto;
    padding-bottom: 4px;
  }
  .pm-approval-step {
    min-width: 150px;
    border: 1px solid #E5E6EB;
    border-radius: 7px;
    background: #FFFFFF;
    padding: 10px;
    display: grid;
    grid-template-columns: 24px minmax(0, 1fr);
    gap: 8px;
  }
  .pm-approval-step[data-status="current"] {
    border-color: #3370FF;
    box-shadow: 0 8px 20px rgba(51,112,255,0.12);
  }
  .pm-approval-step-index {
    width: 24px;
    height: 24px;
    border-radius: 999px;
    background: #F2F3F5;
    color: #646A73;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 850;
  }
  .pm-approval-step[data-status="done"] .pm-approval-step-index {
    background: #DCFCE7;
    color: #15803D;
  }
  .pm-approval-step[data-status="current"] .pm-approval-step-index {
    background: #3370FF;
    color: #FFFFFF;
  }
  .pm-approval-step-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    margin-bottom: 6px;
  }
  .pm-approval-step-head b {
    color: #1F2329;
    font-size: 13px;
  }
  .pm-approval-step p {
    margin: 6px 0 0;
    color: #4E5969;
    font-size: 12px;
    line-height: 1.6;
  }
  .pm-approval-grid {
    display: grid;
    grid-template-columns: minmax(280px, 0.8fr) minmax(320px, 1.2fr);
    gap: 12px;
    margin-top: 12px;
  }
  .pm-approval-card {
    border: 1px solid #E8EAED;
    border-radius: 7px;
    background: #FAFBFC;
    padding: 12px;
  }
  .pm-approval-fields {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  .pm-approval-fields div {
    min-width: 0;
    border-bottom: 1px solid #EEF0F4;
    padding-bottom: 7px;
  }
  .pm-approval-fields span {
    display: block;
    color: #8F959E;
    font-size: 12px;
    margin-bottom: 3px;
  }
  .pm-approval-fields b {
    display: block;
    color: #1F2329;
    font-size: 13px;
    overflow-wrap: anywhere;
  }
  .pm-approval-stage-list {
    display: grid;
    gap: 10px;
  }
  .pm-approval-stage-list b {
    color: #1F2329;
    font-size: 13px;
  }
  .pm-approval-stage-list p {
    margin: 5px 0 0;
    color: #4E5969;
    font-size: 12px;
    line-height: 1.65;
  }
  .pm-inline-grid {
    display: grid;
    grid-template-columns: minmax(260px, 1fr) 320px;
    gap: 12px;
    align-items: start;
  }
  .pm-detail-grid {
    display: grid;
    grid-template-columns: minmax(320px, 1fr) minmax(320px, 0.92fr);
    gap: 12px;
    align-items: stretch;
  }
  .pm-inline-panel {
    background: #FFFFFF;
    border: 1px solid #E5E6EB;
    border-radius: 6px;
    padding: 10px;
  }
  .pm-inline-label {
    color: #646A73;
    font-size: 12px;
    font-weight: 700;
    margin: 0 0 6px;
  }
  .pm-section-title {
    color: #1F2329;
    font-size: 13px;
    font-weight: 800;
    margin: 0 0 8px;
  }
  .pm-inline-field {
    width: 100%;
    min-height: 30px;
    border: 1px solid #E5E6EB;
    border-radius: 5px;
    background: #FFFFFF;
    color: #1F2329;
    padding: 6px 8px;
    font-size: 13px;
    outline: none;
    box-sizing: border-box;
  }
  .pm-inline-textarea {
    min-height: 74px;
    resize: vertical;
    line-height: 1.5;
  }
  .pm-inline-fields {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
  .pm-inline-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 10px;
  }
  .pm-task-panel {
    display: grid;
    gap: 0;
  }
  .pm-task-table-head,
  .pm-task-table-row {
    display: grid;
    grid-template-columns: minmax(220px, 1fr) 86px 86px minmax(120px, 0.55fr) 76px;
    gap: 10px;
    align-items: center;
  }
  .pm-task-table-head {
    color: #646A73;
    font-size: 12px;
    font-weight: 800;
    padding: 8px 0;
    border-bottom: 1px solid #E8EAED;
  }
  .pm-task-table-row {
    min-height: 42px;
    padding: 8px 0;
    border-bottom: 1px solid #F2F3F5;
    font-size: 12px;
    cursor: pointer;
  }
  .pm-task-table-row:hover,
  .pm-task-table-row[data-expanded="true"] {
    background: #F7FAFF;
  }
  .pm-task-group {
    border-bottom: 1px solid #E5E6EB;
  }
  .pm-task-group-head {
    height: 38px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 0 10px;
    background: #FAFAFA;
    border-bottom: 1px solid #E8EAED;
  }
  .pm-task-group-title {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    font-size: 13px;
    font-weight: 800;
    color: #1F2329;
  }
  .pm-empty-wrap {
    padding: 58px 16px;
  }
  @media (max-width: 900px) {
    .pm-workbench {
      min-height: 100vh;
    }
    .pm-layout {
      grid-template-columns: 1fr;
    }
    .pm-sidebar {
      position: static;
      height: auto;
      overflow: visible;
      border-right: 0;
      border-bottom: 1px solid #E5E6EB;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 10px;
    }
    .pm-topbar {
      position: static;
      height: auto;
      min-height: 48px;
      flex-wrap: wrap;
      padding: 8px 12px;
      gap: 8px;
    }
    .pm-brand {
      width: 100%;
    }
    .pm-module-tabs {
      flex: 1 1 auto;
    }
    .pm-toolbar-right {
      width: 100%;
    }
    .pm-primary-btn,
    .pm-tool-btn {
      flex: 1 1 120px;
    }
    .pm-unified-search,
    .pm-search {
      width: 100%;
    }
    .pm-people-popover {
      width: min(340px, calc(100vw - 24px));
    }
    .pm-select {
      width: 100%;
    }
    .pm-main {
      padding: 10px;
    }
    .pm-summary-grid {
      grid-template-columns: 1fr;
    }
    .pm-status-overview-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .pm-detail-head {
      grid-template-columns: 1fr;
      align-items: start;
    }
    .pm-detail-badges {
      justify-content: flex-start;
    }
    .pm-detail-grid {
      grid-template-columns: 1fr;
    }
    .pm-approval-hero,
    .pm-approval-status-strip,
    .pm-approval-grid {
      grid-template-columns: 1fr;
    }
    .pm-approval-stepper {
      grid-template-columns: repeat(6, 180px);
    }
    .pm-approval-panel-grid,
    .pm-approval-panel-split {
      grid-template-columns: 1fr;
    }
    .pm-approval-material-row,
    .pm-guidance-evidence-grid,
    .pm-guidance-form {
      grid-template-columns: 1fr;
    }
    .pm-guidance-textarea {
      grid-column: 1;
    }
    .pm-task-panel {
      overflow-x: auto;
    }
    .pm-task-table-head,
    .pm-task-table-row {
      min-width: 680px;
    }
    .pm-toolbar {
      align-items: stretch;
      flex-direction: column;
      border-radius: 6px;
    }
    .pm-toolbar-left,
    .pm-toolbar-right {
      width: 100%;
    }
    .pm-content {
      border-top: 1px solid #E5E6EB;
      border-radius: 6px;
      min-height: 420px;
      margin-top: 8px;
    }
    .pm-view-switch {
      width: 100%;
    }
    .pm-view-switch button {
      flex: 1 1 92px;
    }
    .pm-board-grid {
      grid-template-columns: repeat(4, 220px);
    }
    .pm-gantt-sheet {
      min-width: 960px;
    }
    .pm-approval-board {
      max-width: none;
      overflow-x: auto;
      padding-bottom: 4px;
    }
    .pm-approval-node-flow {
      min-width: 520px;
    }
    .pm-table {
      min-width: 820px;
    }
    .pm-inline-grid {
      grid-template-columns: 1fr;
    }
    .pm-table th,
    .pm-table td {
      height: 40px;
      padding: 6px 8px;
      font-size: 12px;
    }
    .pm-sidebar {
      padding: 8px;
    }
    .pm-cockpit-grid {
      grid-template-columns: 1fr;
    }
    .pm-identity-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .pm-cockpit-hero {
      border-radius: 10px;
      padding: 14px;
    }
    .pm-cockpit-title {
      font-size: 19px;
    }
    .pm-brief-item {
      grid-template-columns: 8px minmax(0, 1fr);
    }
    .pm-brief-item .pm-row-action {
      grid-column: 2;
      justify-self: start;
    }
    .pm-sidebar-section {
      margin-bottom: 0;
    }
    .pm-sidebar-section:nth-of-type(n+3) {
      display: none;
    }
  }
  @media (max-width: 560px) {
    .pm-breadcrumb {
      display: none;
    }
    .pm-module-tabs {
      width: 100%;
    }
    .pm-tab-btn {
      flex: 1 1 0;
    }
    .pm-metric-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .pm-inline-fields {
      grid-template-columns: 1fr;
    }
    .pm-approval-fields {
      grid-template-columns: 1fr;
    }
  }
`;

const ProjectListPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { me } = useAuth();
  const focusTimerRef = useRef<Record<number, number>>({});
  const memberOpenIdFilter = searchParams.get("member_open_id") || undefined;
  const [workMode, setWorkMode] = useState<WorkMode>("projects");
  const [projectView, setProjectView] = useState<ProjectViewKey>("table");
  const [activeKey, setActiveKey] = useState<ProjectTabKey>("active");
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectHistory, setProjectHistory] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [historyTasks, setHistoryTasks] = useState<Task[]>([]);
  const [taskFilter, setTaskFilter] = useState<TaskFilter>("open");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [projectTypeFilter, setProjectTypeFilter] = useState<"all" | ProjectType>("all");
  const [projectCategoryFilter, setProjectCategoryFilter] = useState<ProjectCategoryFilter>("all");
  const [query, setQuery] = useState("");
  const [memberFilterOpenId, setMemberFilterOpenId] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [memberMap, setMemberMap] = useState<Record<string, Member>>({});
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deletingTaskId, setDeletingTaskId] = useState<number | null>(null);
  const [highlightProjectId, setHighlightProjectId] = useState<number | null>(null);
  const [expandedProjectId, setExpandedProjectId] = useState<number | null>(null);
  const [expandedTaskId, setExpandedTaskId] = useState<number | null>(null);
  const [expandedProjectTaskId, setExpandedProjectTaskId] = useState<number | null>(null);
  const [savingProjectId, setSavingProjectId] = useState<number | null>(null);
  const [savingProjectMemberKey, setSavingProjectMemberKey] = useState<string | null>(null);
  const [savingTaskId, setSavingTaskId] = useState<number | null>(null);
  const [generatingWorkflowId, setGeneratingWorkflowId] = useState<number | null>(null);
  const [expandedProjects, setExpandedProjects] = useState<Record<number, Project>>({});
  const [projectDetailLoadingId, setProjectDetailLoadingId] = useState<number | null>(null);
  const [projectTasks, setProjectTasks] = useState<Record<number, Task[]>>({});
  const [projectRelations, setProjectRelations] = useState<Record<number, ProjectRelation[]>>({});
  const [projectLogs, setProjectLogs] = useState<Record<number, ProjectLog[]>>({});
  const [projectKnowledge, setProjectKnowledge] = useState<Record<number, Contribution[]>>({});
  const [projectKnowledgeLoadingId, setProjectKnowledgeLoadingId] = useState<number | null>(null);
  const [projectMeetings, setProjectMeetings] = useState<Record<number, MeetingNote[]>>({});
  const [projectCalendarEvents, setProjectCalendarEvents] = useState<Record<number, CalendarEvent[]>>({});
  const [projectMeetingsLoadingId, setProjectMeetingsLoadingId] = useState<number | null>(null);
  const [expandedMeetingProjectIds, setExpandedMeetingProjectIds] = useState<Record<number, boolean>>({});
  const [meetingLinkDrafts, setMeetingLinkDrafts] = useState<Record<number, { title: string; url: string; durationMinutes: string }>>({});
  const [savingMeetingProjectId, setSavingMeetingProjectId] = useState<number | null>(null);
  const [larkStatuses, setLarkStatuses] = useState<Record<string, LarkUserStatus>>({});
  const [larkStatusLoadingProjectId, setLarkStatusLoadingProjectId] = useState<number | null>(null);
  const [likingKnowledgeId, setLikingKnowledgeId] = useState<number | null>(null);
  const [knowledgeComments, setKnowledgeComments] = useState<Record<number, ContributionComment[]>>({});
  const [knowledgeCommentDrafts, setKnowledgeCommentDrafts] = useState<Record<number, string>>({});
  const [loadingKnowledgeCommentsId, setLoadingKnowledgeCommentsId] = useState<number | null>(null);
  const [savingKnowledgeCommentId, setSavingKnowledgeCommentId] = useState<number | null>(null);
  const [taskLogs, setTaskLogs] = useState<Record<number, ChangeLogEntry[]>>({});
  const [taskLogsLoadingId, setTaskLogsLoadingId] = useState<number | null>(null);
  const [focusSummaries, setFocusSummaries] = useState<Record<number, number>>({});
  const [focusSessions, setFocusSessions] = useState<Record<number, { startedAt: string; expectedMinutes: number }>>({});
  const [savingFocusId, setSavingFocusId] = useState<number | null>(null);
  const [expandedFinishTaskIds, setExpandedFinishTaskIds] = useState<Record<number, boolean>>({});
  const [chatQuery, setChatQuery] = useState("");
  const [visibleChats, setVisibleChats] = useState<Record<number, LarkVisibleChat[]>>({});
  const [chatSearchingId, setChatSearchingId] = useState<number | null>(null);
  const [visibleChatTopics, setVisibleChatTopics] = useState<Record<string, LarkChatTopicPreview[]>>({});
  const [topicLoadingKey, setTopicLoadingKey] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<Record<number, ProjectChatMessage[]>>({});
  const [messageLoadingId, setMessageLoadingId] = useState<number | null>(null);
  const [syncingChatId, setSyncingChatId] = useState<number | null>(null);
  const [projectDraft, setProjectDraft] = useState({
    name: "",
    description: "",
    status: "active" as ProjectStatus,
    priority: "medium" as ProjectPriority,
    project_type: "team" as ProjectType,
    department: "",
    category: "论文写作" as ProjectCategoryFilter,
    tags: "",
    start_date: "",
    target_end_date: "",
    actual_end_date: "",
    points_awarded: "",
  });
  const [taskDraft, setTaskDraft] = useState({
    title: "",
    description: "",
    status: "todo" as TaskStatus,
    priority: "medium" as ProjectPriority,
    assignee_open_id: "",
    thinking: "",
    progress_draft: "",
  });
  const [focusDraft, setFocusDraft] = useState({
    expectedMinutes: "60",
    reminderMinutes: "60",
    startThinking: "",
    actualMinutes: "",
    goalAchieved: "yes" as "yes" | "partly" | "no",
    finishReflection: "",
    saveAsKnowledge: true,
    knowledgeTitle: "",
  });
  const [workflowDraft, setWorkflowDraft] = useState({
    template: "产品研发" as WorkflowTemplateKey,
    assignee_open_id: "",
    reviewer: "",
    customNodes: "",
  });
  const [projectMemberDrafts, setProjectMemberDrafts] = useState<Record<string, { role: PMRole; share_ratio: string; tags: string }>>({});
  const [projectMemberAddDrafts, setProjectMemberAddDrafts] = useState<Record<number, string>>({});
  const [selectedApprovalStepKey, setSelectedApprovalStepKey] = useState<string | null>(null);
  const [identityViewMode, setIdentityViewMode] = useState<"manager" | "employee">("manager");
  const [guidanceDrafts, setGuidanceDrafts] = useState<Record<string, {
    problemType: string;
    evidence: string[];
    target: string;
    deadline: string;
    suggestion: string;
    status: GuidanceStatus;
  }>>({});
  const [guidanceExtraRecords, setGuidanceExtraRecords] = useState<Record<string, PaperGuidanceRecord[]>>({});

  useEffect(() => {
    return () => {
      Object.values(focusTimerRef.current).forEach((timerId) => window.clearTimeout(timerId));
    };
  }, []);

  const isManager = me?.role === "admin" || me?.role === "staff";

  const canDeleteProject = (project: Project): boolean => {
    if (!me) return false;
    return (
      me.open_id === project.owner_open_id
      || (equalAccessOpenIds.has(me.open_id) && equalAccessOpenIds.has(project.owner_open_id))
      || (project.project_type === "team" && isManager)
    );
  };

  const scrollProjectIntoView = (project: Project) => {
    setWorkMode("projects");
    if (project.status === "planning") {
      setActiveKey("planning");
    } else if (project.status === "completed") {
      setActiveKey("completed");
    } else if (project.status === "archived") {
      setActiveKey("archived");
    } else {
      setActiveKey("active");
    }
    setHighlightProjectId(project.project_id);
    window.setTimeout(() => {
      document.getElementById(`project-card-${project.project_id}`)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 80);
    window.setTimeout(() => {
      setHighlightProjectId((current) => (current === project.project_id ? null : current));
    }, 1800);
  };

  const canDeleteTask = (task: Task): boolean => {
    if (!me) return false;
    const project = task.project_id ? expandedProjects[task.project_id] || projects.find((item) => item.project_id === task.project_id) : null;
    return (
      task.created_by === me.open_id
      || task.assignee_open_id === me.open_id
      || project?.owner_open_id === me.open_id
      || isManager
    );
  };

  const projectMemberDraftKey = (projectId: number, memberOpenId: string) => `${projectId}:${memberOpenId}`;

  const setProjectMemberDraftFromDetail = (projectId: number, members: ProjectMember[] = []) => {
    setProjectMemberDrafts((prev) => {
      const next = { ...prev };
      members.filter((member) => !member.left_at).forEach((member) => {
        next[projectMemberDraftKey(projectId, member.member_open_id)] = {
          role: member.role,
          share_ratio: String(member.share_ratio ?? 0),
          tags: member.tags || "",
        };
      });
      return next;
    });
  };

  const saveProjectMemberInline = async (projectId: number, member: ProjectMember) => {
    const key = projectMemberDraftKey(projectId, member.member_open_id);
    const draft = projectMemberDrafts[key] || { role: member.role, share_ratio: String(member.share_ratio ?? 0), tags: member.tags || "" };
    setSavingProjectMemberKey(key);
    try {
      await updateProjectMember(projectId, member.member_open_id, {
        member_open_id: member.member_open_id,
        role: draft.role,
        share_ratio: Number(draft.share_ratio) || 0,
        tags: draft.tags.trim() || null,
      });
      const detail = await getProject(projectId);
      setExpandedProjects((prev) => ({ ...prev, [projectId]: detail }));
      setProjectMemberDraftFromDetail(projectId, detail.members || []);
      Toast.show({ icon: "success", content: "成员已更新" });
    } catch {
      Toast.show({ icon: "fail", content: "成员保存失败" });
    } finally {
      setSavingProjectMemberKey(null);
    }
  };

  const removeProjectMemberInline = async (projectId: number, memberOpenId: string) => {
    const confirmed = await Dialog.confirm({ content: "确认移出该项目成员？" });
    if (!confirmed) return;
    const key = projectMemberDraftKey(projectId, memberOpenId);
    setSavingProjectMemberKey(key);
    try {
      await removeProjectMember(projectId, memberOpenId);
      const detail = await getProject(projectId);
      setExpandedProjects((prev) => ({ ...prev, [projectId]: detail }));
      setProjectMemberDraftFromDetail(projectId, detail.members || []);
      Toast.show({ icon: "success", content: "成员已移出" });
    } catch {
      Toast.show({ icon: "fail", content: "移出失败" });
    } finally {
      setSavingProjectMemberKey(null);
    }
  };

  const addProjectMemberInline = async (projectId: number) => {
    const memberOpenId = projectMemberAddDrafts[projectId];
    if (!memberOpenId) {
      Toast.show({ icon: "fail", content: "请选择成员" });
      return;
    }
    const key = projectMemberDraftKey(projectId, memberOpenId);
    setSavingProjectMemberKey(key);
    try {
      await addProjectMember(projectId, {
        member_open_id: memberOpenId,
        role: "member",
        share_ratio: 0,
        tags: "手动添加",
      });
      const detail = await getProject(projectId);
      setExpandedProjects((prev) => ({ ...prev, [projectId]: detail }));
      setProjectMemberDraftFromDetail(projectId, detail.members || []);
      setProjectMemberAddDrafts((prev) => ({ ...prev, [projectId]: "" }));
      Toast.show({ icon: "success", content: "成员已添加" });
    } catch {
      Toast.show({ icon: "fail", content: "添加失败，可能已经是成员" });
    } finally {
      setSavingProjectMemberKey(null);
    }
  };

  const resetFocusDraft = () => {
    setFocusDraft({
      expectedMinutes: "60",
      reminderMinutes: "60",
      startThinking: "",
      actualMinutes: "",
      goalAchieved: "yes",
      finishReflection: "",
      saveAsKnowledge: true,
      knowledgeTitle: "",
    });
  };

  const loadTaskLogs = (taskId: number) => {
    setTaskLogsLoadingId(taskId);
    listTaskAuditLogs(taskId)
      .then((logs) => setTaskLogs((prev) => ({ ...prev, [taskId]: logs })))
      .catch(() => setTaskLogs((prev) => ({ ...prev, [taskId]: [] })))
      .finally(() => setTaskLogsLoadingId((prev) => (prev === taskId ? null : prev)));
  };

  const loadTaskFocusSummary = (taskId: number) => {
    getTaskFocusSummary(taskId)
      .then((summary) => setFocusSummaries((prev) => ({ ...prev, [taskId]: summary.total_seconds })))
      .catch(() => setFocusSummaries((prev) => ({ ...prev, [taskId]: 0 })));
  };

  const loadProjectFocusSummaries = (tasksForProject: Task[]) => {
    const missingTasks = tasksForProject.filter((task) => focusSummaries[task.task_id] === undefined);
    if (missingTasks.length === 0) return;
    Promise.all(
      missingTasks.map((task) =>
        getTaskFocusSummary(task.task_id)
          .then((summary) => [task.task_id, summary.total_seconds] as const)
          .catch(() => [task.task_id, 0] as const),
      ),
    ).then((entries) => {
      setFocusSummaries((prev) => {
        const next = { ...prev };
        entries.forEach(([taskId, seconds]) => {
          next[taskId] = seconds;
        });
        return next;
      });
    });
  };

  const loadProjectKnowledge = (projectId: number) => {
    setProjectKnowledgeLoadingId(projectId);
    listContributions({ type: "document", page_size: 200 })
      .then((page) => {
        const marker = `project:${projectId}`;
        setProjectKnowledge((prev) => ({
          ...prev,
          [projectId]: page.items.filter((item) => splitProjectTags(item.tags).includes(marker)),
        }));
      })
      .catch(() => setProjectKnowledge((prev) => ({ ...prev, [projectId]: [] })))
      .finally(() => setProjectKnowledgeLoadingId((prev) => (prev === projectId ? null : prev)));
  };

  const loadProjectMeetings = (projectId: number) => {
    setProjectMeetingsLoadingId(projectId);
    listMeetingNotes({ page: 1, page_size: 100 })
      .then((page) => {
        const marker = `project:${projectId}`;
        setProjectMeetings((prev) => ({
          ...prev,
          [projectId]: page.items.filter((note) => splitProjectTags(note.tags).includes(marker)),
        }));
      })
      .catch(() => setProjectMeetings((prev) => ({ ...prev, [projectId]: [] })))
      .finally(() => setProjectMeetingsLoadingId((prev) => (prev === projectId ? null : prev)));
  };

  const loadProjectCalendarEvents = (projectId: number) => {
    const now = new Date();
    const start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const end = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000).toISOString();
    listCalendarEvents({ start, end, event_type: "meeting", related_project_id: projectId, page_size: 500 })
      .then((page) => setProjectCalendarEvents((prev) => ({ ...prev, [projectId]: page.items })))
      .catch(() => setProjectCalendarEvents((prev) => ({ ...prev, [projectId]: [] })));
  };

  const loadProjectLarkStatuses = (projectId: number, tasksForProject: Task[]) => {
    const ids = Array.from(new Set(
      tasksForProject.flatMap((task) => [task.assignee_open_id, task.created_by]).filter((id): id is string => Boolean(id)),
    ));
    if (ids.length === 0) return;
    setLarkStatusLoadingProjectId(projectId);
    listLarkUserStatuses({ member_open_ids: ids })
      .then((rows) => {
        setLarkStatuses((prev) => {
          const next = { ...prev };
          rows.forEach((row) => {
            next[row.member_open_id] = row;
          });
          return next;
        });
      })
      .catch(() => undefined)
      .finally(() => setLarkStatusLoadingProjectId((prev) => (prev === projectId ? null : prev)));
  };

  const loadTaskLarkStatuses = (tasksForStatus: Task[]) => {
    const ids = Array.from(new Set(
      tasksForStatus
        .filter((task) => task.status === "in_progress")
        .flatMap((task) => [task.assignee_open_id, task.created_by])
        .filter((id): id is string => Boolean(id)),
    ));
    if (ids.length === 0) return;
    listLarkUserStatuses({ member_open_ids: ids })
      .then((rows) => {
        setLarkStatuses((prev) => {
          const next = { ...prev };
          rows.forEach((row) => {
            next[row.member_open_id] = row;
          });
          return next;
        });
      })
      .catch(() => undefined);
  };

  const saveProjectMeetingLink = async (project: Project) => {
    const draft = meetingLinkDrafts[project.project_id] || { title: "", url: "", durationMinutes: "" };
    const url = draft.url.trim();
    if (!url) {
      Toast.show({ icon: "fail", content: "请填写会议链接" });
      return;
    }
    const duration = Number(draft.durationMinutes || 0);
    const title = draft.title.trim() || `${project.name} 会议`;
    setSavingMeetingProjectId(project.project_id);
    try {
      const note = await createMeetingNote({
        meeting_title: title,
        meeting_date: new Date().toISOString().slice(0, 10),
        meeting_type: "飞书会议",
        location: url,
        summary: `项目：${project.name}\n会议链接：${url}${duration > 0 ? `\n时长 ${duration} 分钟` : ""}`,
        attachment_urls: url,
        tags: `project:${project.project_id}`,
        source: "manual",
        review_status: "submitted",
        privacy_level: "internal",
      });
      setProjectMeetings((prev) => ({ ...prev, [project.project_id]: [note, ...(prev[project.project_id] || [])] }));
      setMeetingLinkDrafts((prev) => ({ ...prev, [project.project_id]: { title: "", url: "", durationMinutes: "" } }));
      Toast.show({ icon: "success", content: "会议链接已保存" });
    } catch {
      Toast.show({ icon: "fail", content: "会议链接保存失败" });
    } finally {
      setSavingMeetingProjectId(null);
    }
  };

  const likeProjectKnowledge = async (projectId: number, contributionId: number) => {
    setLikingKnowledgeId(contributionId);
    try {
      const updated = await recordContributionInteraction(contributionId, "like");
      setProjectKnowledge((prev) => ({
        ...prev,
        [projectId]: (prev[projectId] || []).map((item) => (item.contribution_id === updated.contribution_id ? updated : item)),
      }));
    } catch {
      Toast.show({ icon: "fail", content: "点赞失败" });
    } finally {
      setLikingKnowledgeId(null);
    }
  };

  const toggleKnowledgeComments = async (contributionId: number) => {
    if (knowledgeComments[contributionId]) {
      setKnowledgeComments((prev) => {
        const next = { ...prev };
        delete next[contributionId];
        return next;
      });
      return;
    }
    setLoadingKnowledgeCommentsId(contributionId);
    try {
      const comments = await listContributionComments(contributionId);
      setKnowledgeComments((prev) => ({ ...prev, [contributionId]: comments }));
    } catch {
      Toast.show({ icon: "fail", content: "评论加载失败" });
    } finally {
      setLoadingKnowledgeCommentsId(null);
    }
  };

  const submitKnowledgeComment = async (projectId: number, contributionId: number) => {
    const content = (knowledgeCommentDrafts[contributionId] || "").trim();
    if (!content) {
      Toast.show({ icon: "fail", content: "请填写评论内容" });
      return;
    }
    setSavingKnowledgeCommentId(contributionId);
    try {
      const comment = await createContributionComment(contributionId, content);
      setKnowledgeComments((prev) => ({ ...prev, [contributionId]: [...(prev[contributionId] || []), comment] }));
      setKnowledgeCommentDrafts((prev) => ({ ...prev, [contributionId]: "" }));
      setProjectKnowledge((prev) => ({
        ...prev,
        [projectId]: (prev[projectId] || []).map((item) =>
          item.contribution_id === contributionId ? { ...item, comment_count: (item.comment_count || 0) + 1 } : item,
        ),
      }));
    } catch {
      Toast.show({ icon: "fail", content: "评论失败" });
    } finally {
      setSavingKnowledgeCommentId(null);
    }
  };

  const getTaskRecommendations = (task: Task) => {
    const combined = [...historyTasks, ...tasks, ...Object.values(projectTasks).flat()];
    const seen = new Set<number>();
    const tokens = taskSimilarityTokens(task);
    const tokenSet = new Set(tokens);
    return combined
      .filter((candidate) => {
        if (candidate.task_id === task.task_id || seen.has(candidate.task_id)) return false;
        seen.add(candidate.task_id);
        return candidate.status === "done" || Boolean(candidate.completed_at) || candidate.project_id === task.project_id;
      })
      .map((candidate) => {
        const candidateTokens = taskSimilarityTokens(candidate);
        const sharedTokens = candidateTokens.filter((token) => tokenSet.has(token));
        const sameProject = Boolean(task.project_id && candidate.project_id === task.project_id);
        const sameAssignee = Boolean(task.assignee_open_id && candidate.assignee_open_id === task.assignee_open_id);
        const sameCategory = splitProjectTags(task.project_tags).some((tag) => splitProjectTags(candidate.project_tags).includes(tag));
        const score =
          sharedTokens.length
          + (sameProject ? 2 : 0)
          + (sameAssignee ? 0.8 : 0)
          + (sameCategory ? 1 : 0)
          + (candidate.status === "done" ? 0.6 : 0);
        return { task: candidate, score, sharedTokens };
      })
      .filter((item) => item.score >= 1.2)
      .sort((left, right) => right.score - left.score || (right.task.updated_at || "").localeCompare(left.task.updated_at || ""))
      .slice(0, 4);
  };

  const loadRecommendationFocusSummaries = (task: Task) => {
    getTaskRecommendations(task).forEach(({ task: candidate }) => {
      if (focusSummaries[candidate.task_id] === undefined) loadTaskFocusSummary(candidate.task_id);
    });
  };

  const getProjectRecommendations = (project: Project) => {
    const combinedProjects = [...projectHistory, ...projects, ...Object.values(expandedProjects)];
    const seenProjects = new Set<number>();
    const allKnownTasks = [...historyTasks, ...tasks, ...Object.values(projectTasks).flat()];
    const currentProjectTasks = allKnownTasks.filter((task) => task.project_id === project.project_id);
    const tokenSet = new Set(projectContentSimilarityTokens(project, currentProjectTasks));
    return combinedProjects
      .filter((candidate) => {
        if (candidate.project_id === project.project_id || seenProjects.has(candidate.project_id)) return false;
        seenProjects.add(candidate.project_id);
        return true;
      })
      .map((candidate) => {
        const relatedTasks = allKnownTasks
          .filter((task) => task.project_id === candidate.project_id)
          .sort((left, right) => (left.planned_start_date || left.created_at || "").localeCompare(right.planned_start_date || right.created_at || ""));
        const candidateTokens = projectContentSimilarityTokens(candidate, relatedTasks);
        const sharedTokens = candidateTokens.filter((token) => tokenSet.has(token));
        const participants = Array.from(new Set([
          candidate.owner_open_id,
          ...relatedTasks.map((task) => task.assignee_open_id || task.created_by).filter((openId): openId is string => Boolean(openId)),
        ].filter(Boolean)));
        const score =
          sharedTokens.length
          + Math.min(relatedTasks.length, 5) * 0.15
          + (candidate.status === "completed" || candidate.status === "archived" ? 0.2 : 0);
        return { project: candidate, score, sharedTokens, relatedTasks, participants };
      })
      .filter((item) => item.score >= 1)
      .sort((left, right) => right.score - left.score || (right.project.updated_at || "").localeCompare(left.project.updated_at || ""))
      .slice(0, 12);
  };

  const renderProjectRecommendationCard = (
    item: ReturnType<typeof getProjectRecommendations>[number],
    project: Project,
  ) => (
    <div key={item.project.project_id} style={{ border: "1px solid #E5E6EB", borderRadius: 6, background: "#FFFFFF", padding: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 850, color: "#1F2329", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.project.name}</div>
          <div className="pm-muted" style={{ marginTop: 4 }}>
            负责人：{memberMap[item.project.owner_open_id]?.name || item.project.owner_open_id || "未设置"} · {projectStatusStyle[item.project.status].label} · {item.relatedTasks.length || item.project.task_count} 个节点
          </div>
        </div>
        <span className="pm-tag" style={{ background: "#FFF7E6", color: "#B45309" }}>建议交流</span>
      </div>
      <div className="pm-muted" style={{ marginTop: 6 }}>
        参与人：{item.participants.slice(0, 3).map((openId) => memberMap[openId]?.name || openId).join("、") || "未记录"}
      </div>
      <div className="pm-muted" style={{ marginTop: 4 }}>
        匹配：{item.sharedTokens.slice(0, 4).join("、") || "同类型/同标签"}
      </div>
      {item.relatedTasks.length ? (
        <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4 }}>
          {item.relatedTasks.slice(0, 3).map((task) => (
            <span key={task.task_id} className="pm-tag" style={{ background: "#F2F3F5", color: "#4E5969" }}>
              {task.title.replace(/^\d+[.、]\s*/, "").slice(0, 12)}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );

  const openProjectInline = (project: Project) => {
    if (expandedProjectId === project.project_id) {
      setExpandedProjectId(null);
      return;
    }
    setExpandedProjectId(project.project_id);
    const category = getProjectCategory(project);
    setProjectDraft({
      name: project.name,
      description: project.description || "",
      status: project.status,
      priority: project.priority,
      project_type: project.project_type || "team",
      department: project.department || "",
      category,
      tags: getProjectCustomTags(project.tags),
      start_date: toDateInputValue(project.start_date),
      target_end_date: toDateInputValue(project.target_end_date),
      actual_end_date: toDateInputValue(project.actual_end_date),
      points_awarded: project.points_awarded ? String(project.points_awarded) : "",
    });
    setWorkflowDraft((prev) => ({
      ...prev,
      template: category === "all" ? "产品研发" : category,
      assignee_open_id: project.owner_open_id || "",
      reviewer: memberMap[project.owner_open_id]?.name || "项目负责人审核",
      customNodes: defaultWorkflowText(category === "all" ? "产品研发" : category),
    }));
    const isSampleProject = project.project_id < 0;
    if (isSampleProject) {
      const detailTasks = sampleTasks.filter((task) => task.project_id === project.project_id);
      setExpandedProjects((prev) => ({ ...prev, [project.project_id]: project }));
      setProjectTasks((prev) => ({ ...prev, [project.project_id]: detailTasks }));
      setProjectRelations((prev) => ({ ...prev, [project.project_id]: [] }));
      setProjectLogs((prev) => ({ ...prev, [project.project_id]: [] }));
      setProjectKnowledge((prev) => ({ ...prev, [project.project_id]: [] }));
      setProjectMeetings((prev) => ({ ...prev, [project.project_id]: [] }));
      setProjectCalendarEvents((prev) => ({ ...prev, [project.project_id]: [] }));
      setProjectMemberDraftFromDetail(project.project_id, project.members || []);
      return;
    }
    if (!expandedProjects[project.project_id]) {
      setProjectDetailLoadingId(project.project_id);
      Promise.all([
        getProject(project.project_id),
        listTasks({ project_id: project.project_id, page_size: 200 }),
        listProjectRelations(project.project_id),
        listProjectLogs(project.project_id),
      ])
        .then(([detail, taskPage, relations, logs]) => {
          setExpandedProjects((prev) => ({ ...prev, [project.project_id]: detail }));
          setProjectTasks((prev) => ({ ...prev, [project.project_id]: taskPage.items }));
          setProjectRelations((prev) => ({ ...prev, [project.project_id]: relations }));
          setProjectLogs((prev) => ({ ...prev, [project.project_id]: logs }));
          setProjectMemberDraftFromDetail(project.project_id, detail.members || []);
          loadProjectFocusSummaries(taskPage.items);
          loadProjectLarkStatuses(project.project_id, taskPage.items);
        })
        .catch(() => {
          Toast.show({ icon: "fail", content: "项目详情加载失败" });
        })
        .finally(() => setProjectDetailLoadingId((prev) => (prev === project.project_id ? null : prev)));
    }
    if (!projectKnowledge[project.project_id]) loadProjectKnowledge(project.project_id);
    if (!projectMeetings[project.project_id]) loadProjectMeetings(project.project_id);
    if (!projectCalendarEvents[project.project_id]) loadProjectCalendarEvents(project.project_id);
    if (expandedProjects[project.project_id]?.members?.length) setProjectMemberDraftFromDetail(project.project_id, expandedProjects[project.project_id].members || []);
    if (projectTasks[project.project_id]?.length) loadProjectFocusSummaries(projectTasks[project.project_id]);
    if (projectTasks[project.project_id]?.length) loadProjectLarkStatuses(project.project_id, projectTasks[project.project_id]);
  };

  const openTaskInline = (task: Task) => {
    if (expandedTaskId === task.task_id) {
      setExpandedTaskId(null);
      return;
    }
    setExpandedTaskId(task.task_id);
    setTaskDraft({
      title: task.title,
      description: task.description || "",
      status: task.status,
      priority: task.priority,
      assignee_open_id: task.assignee_open_id || "",
      thinking: task.thinking || "",
      progress_draft: task.progress_draft || "",
    });
    resetFocusDraft();
    setFocusDraft((prev) => ({ ...prev, startThinking: task.thinking || "" }));
    if (!taskLogs[task.task_id]) loadTaskLogs(task.task_id);
    loadTaskFocusSummary(task.task_id);
    loadRecommendationFocusSummaries(task);
  };

  const openProjectTaskInline = (task: Task) => {
    if (expandedProjectTaskId === task.task_id) {
      setExpandedProjectTaskId(null);
      return;
    }
    setExpandedProjectTaskId(task.task_id);
    setTaskDraft({
      title: task.title,
      description: task.description || "",
      status: task.status,
      priority: task.priority,
      assignee_open_id: task.assignee_open_id || "",
      thinking: task.thinking || "",
      progress_draft: task.progress_draft || "",
    });
    resetFocusDraft();
    setFocusDraft((prev) => ({ ...prev, startThinking: task.thinking || "" }));
    if (!taskLogs[task.task_id]) loadTaskLogs(task.task_id);
    loadTaskFocusSummary(task.task_id);
    loadRecommendationFocusSummaries(task);
  };

  const searchVisibleChats = async (projectId: number) => {
    setChatSearchingId(projectId);
    try {
      const page = await listVisibleLarkChats({ query: chatQuery.trim() || undefined, page_size: 12 });
      setVisibleChats((prev) => ({ ...prev, [projectId]: page.chats }));
    } catch {
      Toast.show({ icon: "fail", content: "群聊搜索失败" });
    } finally {
      setChatSearchingId(null);
    }
  };

  const loadVisibleChatTopics = async (chat: LarkVisibleChat) => {
    const key = chat.chat_id;
    setTopicLoadingKey(key);
    try {
      const page = await listLarkChatTopics(chat.chat_id, { page_size: 10 });
      setVisibleChatTopics((prev) => ({ ...prev, [key]: page.topics }));
    } catch {
      Toast.show({ icon: "fail", content: "话题加载失败" });
    } finally {
      setTopicLoadingKey(null);
    }
  };

  const associateTopic = async (projectId: number, chat: LarkVisibleChat, topic: LarkChatTopicPreview) => {
    try {
      const created = await addProjectChat(projectId, {
        chat_id: chat.chat_id,
        chat_name: chat.name || null,
        description: chat.description || null,
        selected_topic_key: topic.topic_key,
        selected_topic_title: topic.title || topic.topic_key,
        sync_enabled: true,
      });
      const detail = expandedProjects[projectId];
      if (detail) {
        setExpandedProjects((prev) => ({
          ...prev,
          [projectId]: { ...detail, chats: [created, ...(detail.chats || [])] },
        }));
      }
      await syncProjectChat(projectId, created.project_chat_id, { page_size: 50, max_pages: 10 });
      const refreshed = await getProject(projectId);
      setExpandedProjects((prev) => ({ ...prev, [projectId]: refreshed }));
      setVisibleChats((prev) => ({ ...prev, [projectId]: [] }));
      setVisibleChatTopics((prev) => {
        const next = { ...prev };
        delete next[chat.chat_id];
        return next;
      });
      setChatQuery("");
      Toast.show({ icon: "success", content: "话题已关联并同步" });
    } catch {
      Toast.show({ icon: "fail", content: "关联失败" });
    }
  };

  const syncChat = async (projectId: number, projectChatId: number) => {
    setSyncingChatId(projectChatId);
    try {
      await syncProjectChat(projectId, projectChatId, { page_size: 50, max_pages: 10 });
      const detail = await getProject(projectId);
      setExpandedProjects((prev) => ({ ...prev, [projectId]: detail }));
      Toast.show({ icon: "success", content: "已同步群聊" });
    } catch {
      Toast.show({ icon: "fail", content: "同步失败" });
    } finally {
      setSyncingChatId(null);
    }
  };

  const toggleChatMessages = async (projectId: number, projectChatId: number, topicKey?: string | null) => {
    if (chatMessages[projectChatId]) {
      setChatMessages((prev) => {
        const next = { ...prev };
        delete next[projectChatId];
        return next;
      });
      return;
    }
    setMessageLoadingId(projectChatId);
    try {
      const page = await listProjectChatMessages(projectId, projectChatId, { page: 1, page_size: 80, topic_key: topicKey || undefined });
      setChatMessages((prev) => ({ ...prev, [projectChatId]: page.items }));
    } catch {
      Toast.show({ icon: "fail", content: "消息加载失败" });
    } finally {
      setMessageLoadingId(null);
    }
  };

  const saveProjectInline = async (project: Project) => {
    const name = projectDraft.name.trim();
    if (!name) {
      Toast.show({ icon: "fail", content: "请填写项目名称" });
      return;
    }
    setSavingProjectId(project.project_id);
    try {
      const updated = await updateProject(project.project_id, {
        name,
        description: projectDraft.description.trim() || null,
        status: projectDraft.status,
        priority: projectDraft.priority,
        project_type: projectDraft.project_type,
        department: projectDraft.department.trim() || null,
        tags: combineProjectTags(projectDraft.category, projectDraft.tags),
        start_date: projectDraft.start_date.trim() || null,
        target_end_date: projectDraft.target_end_date.trim() || null,
        actual_end_date: projectDraft.actual_end_date.trim() || null,
        points_awarded: projectDraft.points_awarded.trim() ? Number(projectDraft.points_awarded) : 0,
      });
      setProjects((prev) => prev.map((item) => (item.project_id === updated.project_id ? updated : item)));
      setExpandedProjects((prev) => ({ ...prev, [updated.project_id]: { ...(prev[updated.project_id] || updated), ...updated } }));
      Toast.show({ icon: "success", content: "项目已保存" });
    } catch {
      Toast.show({ icon: "fail", content: "保存失败" });
    } finally {
      setSavingProjectId(null);
    }
  };

  const applyTaskUpdate = (updated: Task) => {
    setTasks((prev) => prev.map((item) => (item.task_id === updated.task_id ? updated : item)));
    if (updated.project_id) {
      setProjectTasks((prev) => ({
        ...prev,
        [updated.project_id as number]: (prev[updated.project_id as number] || []).map((item) => (item.task_id === updated.task_id ? updated : item)),
      }));
    }
  };

  const parseWorkflowNodes = () => {
    const source = workflowDraft.customNodes.trim()
      || (workflowDraft.template === "自定义" ? "" : defaultWorkflowText(workflowDraft.template));
    const nodes = source
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, index) => {
        const [titlePart, hoursPart, reviewPart] = line.split("|").map((part) => part.trim());
        return {
          title: titlePart || `自定义节点 ${index + 1}`,
          hours: Math.max(1, Number(hoursPart) || 2),
          review: reviewPart || "负责人审核",
        };
      });
    return nodes.length ? nodes : [{ title: "自定义启动节点", hours: 2, review: "负责人审核" }];
  };

  const workflowNodeLines = () => {
    const source = workflowDraft.customNodes.trim()
      || (workflowDraft.template === "自定义" ? "" : defaultWorkflowText(workflowDraft.template));
    const lines = source.split("\n").map((line) => line.trim()).filter(Boolean);
    return lines.length ? lines : ["自定义启动节点 | 2 | 负责人审核"];
  };

  const updateWorkflowNodeLine = (index: number, field: "title" | "hours" | "review", value: string) => {
    const lines = workflowNodeLines();
    const parts = (lines[index] || "").split("|").map((part) => part.trim());
    const nextParts = [parts[0] || "", parts[1] || "2", parts[2] || "负责人审核"];
    const fieldIndex = field === "title" ? 0 : field === "hours" ? 1 : 2;
    nextParts[fieldIndex] = value;
    lines[index] = nextParts.join(" | ");
    setWorkflowDraft((prev) => ({ ...prev, customNodes: lines.join("\n") }));
  };

  const addWorkflowNodeLine = () => {
    const lines = workflowNodeLines();
    lines.push(`新增节点 ${lines.length + 1} | 2 | 负责人审核`);
    setWorkflowDraft((prev) => ({ ...prev, customNodes: lines.join("\n") }));
  };

  const removeWorkflowNodeLine = (index: number) => {
    const lines = workflowNodeLines().filter((_, lineIndex) => lineIndex !== index);
    setWorkflowDraft((prev) => ({ ...prev, customNodes: lines.join("\n") }));
  };

  const generateProjectWorkflow = async (project: Project) => {
    const nodes = parseWorkflowNodes();
    const assigneeOpenId = workflowDraft.assignee_open_id || project.owner_open_id || me?.open_id || null;
    const reviewer = workflowDraft.reviewer.trim() || "项目负责人审核";
    const now = new Date();
    let cursor = new Date(now);
    setGeneratingWorkflowId(project.project_id);
    try {
      const updatedProject = await updateProject(project.project_id, {
        name: projectDraft.name.trim() || project.name,
        description: projectDraft.description.trim() || project.description || null,
        status: "active",
        priority: projectDraft.priority,
        project_type: projectDraft.project_type,
        department: projectDraft.department.trim() || null,
        tags: combineProjectTags(projectDraft.category, projectDraft.tags),
        start_date: now.toISOString(),
        target_end_date: projectDraft.target_end_date.trim() || null,
        actual_end_date: null,
        points_awarded: projectDraft.points_awarded.trim() ? Number(projectDraft.points_awarded) : 0,
      });
      const createdTasks: Task[] = [];
      for (const [index, node] of nodes.entries()) {
        const startAt = new Date(cursor);
        cursor = new Date(cursor.getTime() + node.hours * 60 * 60 * 1000);
        const task = await createTask({
          title: `${index + 1}. ${node.title}`,
          project_id: project.project_id,
          status: index === 0 ? "in_progress" : "todo",
          priority: index === 0 ? "high" : "medium",
          assignee_open_id: assigneeOpenId,
          planned_start_date: startAt.toISOString(),
          due_date: cursor.toISOString(),
          description: [
            `流程模板: ${workflowDraft.template}`,
            `预计耗时: ${formatMinutes(node.hours * 60)}`,
            `审核要求: ${node.review}`,
            `审核人/说明: ${reviewer}`,
            "完成后请补充复盘和下一步计划。",
          ].join("\n"),
        });
        createdTasks.push(task);
      }
      setProjects((prev) => prev.map((item) => (item.project_id === updatedProject.project_id ? updatedProject : item)));
      setExpandedProjects((prev) => ({ ...prev, [updatedProject.project_id]: { ...(prev[updatedProject.project_id] || updatedProject), ...updatedProject } }));
      setProjectTasks((prev) => ({ ...prev, [project.project_id]: [...createdTasks, ...(prev[project.project_id] || [])] }));
      setProjectDraft((prev) => ({ ...prev, status: "active", start_date: toDateInputValue(now.toISOString()), actual_end_date: "" }));
      Toast.show({ icon: "success", content: `已启动项目并生成 ${createdTasks.length} 个任务` });
    } catch {
      Toast.show({ icon: "fail", content: "项目流程生成失败" });
    } finally {
      setGeneratingWorkflowId(null);
    }
  };

  const saveTaskInline = async (task: Task) => {
    const title = taskDraft.title.trim();
    if (!title) {
      Toast.show({ icon: "fail", content: "请填写任务标题" });
      return;
    }
    setSavingTaskId(task.task_id);
    try {
      const updated = await updateTask(task.task_id, {
        title,
        description: taskDraft.description.trim() || null,
        status: taskDraft.status,
        priority: taskDraft.priority,
        assignee_open_id: taskDraft.assignee_open_id || null,
        thinking: taskDraft.thinking.trim() || null,
        progress_draft: taskDraft.progress_draft.trim() || null,
      });
      applyTaskUpdate(updated);
      Toast.show({ icon: "success", content: "任务已保存" });
    } catch {
      Toast.show({ icon: "fail", content: "保存失败" });
    } finally {
      setSavingTaskId(null);
    }
  };

  const startTaskWork = async (task: Task) => {
    const expectedMinutes = Math.max(1, Number(focusDraft.expectedMinutes) || 60);
    const reminderMinutes = Math.max(1, Number(focusDraft.reminderMinutes) || expectedMinutes);
    const startedAt = new Date();
    const expectedEndAt = new Date(startedAt.getTime() + expectedMinutes * 60 * 1000);
    const note = [
      `启动思路: ${focusDraft.startThinking.trim() || "未填写"}`,
      `预计时长: ${formatMinutes(expectedMinutes)}`,
      `提醒时间: ${formatMinutes(reminderMinutes)}后`,
      `预计完成: ${formatDate(expectedEndAt.toISOString())}`,
    ].join("\n");
    setSavingFocusId(task.task_id);
    try {
      await startTaskFocus(task.task_id, { note });
      const updated = await updateTask(task.task_id, {
        status: "in_progress",
        planned_start_date: startedAt.toISOString(),
        due_date: task.due_date || expectedEndAt.toISOString(),
        thinking: focusDraft.startThinking.trim() || task.thinking || null,
      });
      applyTaskUpdate(updated);
      setFocusSessions((prev) => ({ ...prev, [task.task_id]: { startedAt: startedAt.toISOString(), expectedMinutes } }));
      if (focusTimerRef.current[task.task_id]) window.clearTimeout(focusTimerRef.current[task.task_id]);
      focusTimerRef.current[task.task_id] = window.setTimeout(() => {
        void heartbeatTaskFocus(task.task_id, {
          elapsed_seconds: reminderMinutes * 60,
          note: `到达提醒时间。请确认是否仍按启动思路推进: ${focusDraft.startThinking.trim() || "未填写"}`,
        }).then(() => {
          Toast.show({ icon: "success", content: `「${task.title}」已发送专注提醒` });
          loadTaskLogs(task.task_id);
        }).catch(() => {
          Toast.show({ icon: "fail", content: "专注提醒发送失败" });
        });
      }, reminderMinutes * 60 * 1000);
      loadTaskLogs(task.task_id);
      Toast.show({ icon: "success", content: "任务已启动" });
    } catch {
      Toast.show({ icon: "fail", content: "启动任务失败" });
    } finally {
      setSavingFocusId(null);
    }
  };


  const handleDeleteProject = (project: Project) => {
    Dialog.confirm({
      title: "删除项目",
      content: `确认删除「${project.name}」? 项目下的任务/成员关联会一起移除, 此操作不可撤销.`,
      confirmText: "删除",
      cancelText: "取消",
      onConfirm: async () => {
        setDeletingId(project.project_id);
        try {
          await deleteProject(project.project_id);
          setProjects((prev) => prev.filter((item) => item.project_id !== project.project_id));
          Toast.show({ icon: "success", content: "已删除" });
        } catch (err) {
          const status = (err as { response?: { status?: number } })?.response?.status;
          if (status === 404) {
            setProjects((prev) => prev.filter((item) => item.project_id !== project.project_id));
            Toast.show({ icon: "fail", content: "项目不存在，已从列表移除" });
            return;
          }
          const msg = status === 403 ? "无权删除该项目" : "删除失败";
          Toast.show({ icon: "fail", content: msg });
        } finally {
          setDeletingId(null);
        }
      },
    });
  };

  const handleDeleteTask = (task: Task) => {
    Dialog.confirm({
      title: "删除任务",
      content: `确认删除任务「${task.title}」? 此操作不可撤销.`,
      confirmText: "删除",
      cancelText: "取消",
      onConfirm: async () => {
        setDeletingTaskId(task.task_id);
        try {
          await deleteTask(task.task_id);
          setTasks((prev) => prev.filter((item) => item.task_id !== task.task_id));
          Toast.show({ icon: "success", content: "任务已删除" });
        } catch (err) {
          const msg = (err as { response?: { status?: number } })?.response?.status === 403 ? "无权删除该任务" : "删除失败";
          Toast.show({ icon: "fail", content: msg });
        } finally {
          setDeletingTaskId(null);
        }
      },
    });
  };

  useEffect(() => {
    fetchAllMembers()
      .then((members) => {
        setMemberMap([...sampleMembers, ...members].reduce<Record<string, Member>>((acc, member) => {
          acc[member.open_id] = member;
          return acc;
        }, {}));
      })
      .catch(() => {
        setMemberMap(sampleMembers.reduce<Record<string, Member>>((acc, member) => {
          acc[member.open_id] = member;
          return acc;
        }, {}));
      });
  }, []);

  useEffect(() => {
    let active = true;
    listTasks({ page_size: 500 })
      .then((page) => {
        if (active) setHistoryTasks(page.items.length ? page.items : (shouldUseDemoData ? sampleTasks : []));
      })
      .catch(() => {
        if (active) setHistoryTasks(shouldUseDemoData ? sampleTasks : []);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const statuses: ProjectStatus[] = ["planning", "active", "paused", "completed", "archived"];
    Promise.all(
      statuses.map((status) =>
        listProjects({ status, page_size: 100 })
          .catch(() => ({ items: [], total: 0, page: 1, page_size: 100 })),
      ),
    ).then((responses) => {
      if (!active) return;
      const seen = new Set<number>();
      const items = responses.flatMap((response) => response.items);
      setProjectHistory(
        mergePinnedSamples(items, sampleProjects)
          .filter((project) => seen.has(project.project_id) ? false : (seen.add(project.project_id), true)),
      );
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (workMode !== "projects") return undefined;
    let active = true;
    setLoading(true);
    Promise.all(statusesForTab[activeKey].map((status) =>
      listProjects({
        status,
        page_size: 100,
        project_type: projectTypeFilter === "all" ? undefined : projectTypeFilter,
        member_open_id: memberOpenIdFilter,
      }).catch(() => ({ items: [], total: 0, page: 1, page_size: 100 })),
    ))
      .then((responses) => {
        if (!active) return;
        const seen = new Set<number>();
        const responseItems = responses.flatMap((response) => response.items);
        const fallbackItems = shouldUseDemoData
          ? sampleProjects.filter((project) =>
            statusesForTab[activeKey].includes(project.status)
            && (projectTypeFilter === "all" || project.project_type === projectTypeFilter)
            && projectMatchesMember(project, memberOpenIdFilter),
          )
          : [];
        const unique = mergePinnedSamples(responseItems, fallbackItems)
          .filter((project) => seen.has(project.project_id) ? false : (seen.add(project.project_id), true))
          .sort((left, right) => (right.updated_at || "").localeCompare(left.updated_at || ""));
        setProjects(unique);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [activeKey, isManager, memberOpenIdFilter, projectTypeFilter, workMode]);

  useEffect(() => {
    if (workMode !== "tasks") return undefined;
    let active = true;
    setLoading(true);
    const request = Promise.all((taskFilter === "open"
        ? ["todo", "in_progress", "blocked"] as TaskStatus[]
        : taskFilter === "all"
          ? []
          : [taskFilter as TaskStatus]
      ).length
        ? (taskFilter === "open"
            ? ["todo", "in_progress", "blocked"] as TaskStatus[]
            : [taskFilter as TaskStatus]
          ).map((status) => listTasks({ status, assignee_open_id: memberOpenIdFilter, page_size: 200 }))
        : [listTasks({ assignee_open_id: memberOpenIdFilter, page_size: 300 })]);
    request.then((responses) => {
        if (!active) return;
        const seen = new Set<number>();
        const requestedStatuses = taskFilter === "open"
          ? ["todo", "in_progress", "blocked"] as TaskStatus[]
          : taskFilter === "all"
            ? []
            : [taskFilter as TaskStatus];
        const responseItems = responses.flatMap((response) => response.items);
        const fallbackItems = shouldUseDemoData
          ? sampleTasks.filter((task) =>
            (requestedStatuses.length === 0 || requestedStatuses.includes(task.status))
            && taskMatchesMember(task, memberOpenIdFilter),
          )
          : [];
        const unique = mergePinnedTasks(responseItems, fallbackItems)
          .filter((task) => seen.has(task.task_id) ? false : (seen.add(task.task_id), true))
          .sort((left, right) => {
            const dueCompare = (left.due_date || "9999").localeCompare(right.due_date || "9999");
            return dueCompare || (right.updated_at || "").localeCompare(left.updated_at || "");
          });
        setTasks(unique);
        loadProjectFocusSummaries(unique);
        loadTaskLarkStatuses(unique);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [memberOpenIdFilter, taskFilter, workMode]);

  const getProgress = (project: Project) => {
    if (project.task_count > 0) {
      return Math.max(0, Math.min(100, Math.round((project.task_done_count / project.task_count) * 100)));
    }
    return Math.max(8, Math.min(100, Math.round((project.days_active / 30) * 100)));
  };

  const queryText = query.trim().toLowerCase();
  const textQuery = memberFilterOpenId ? "" : queryText;
  const peopleSuggestions = useMemo(() => {
    if (!queryText || memberFilterOpenId) return [];
    return Object.values(memberMap)
      .filter((member) => member.status !== "left")
      .filter((member) => {
        const haystack = `${member.name || ""} ${member.department || ""} ${member.position || ""} ${member.title || ""} ${member.email || ""} ${member.mobile || ""}`.toLowerCase();
        return haystack.includes(queryText);
      })
      .sort((left, right) => (left.name || "").localeCompare(right.name || "", "zh-Hans-CN"))
      .slice(0, 8);
  }, [memberFilterOpenId, memberMap, queryText]);

  const filteredProjects = useMemo(() => {
    return projects
      .filter((project) => projectCategoryFilter === "all" || getProjectCategory(project) === projectCategoryFilter)
      .filter((project) => {
        if (!memberFilterOpenId) return true;
        return project.owner_open_id === memberFilterOpenId
          || project.created_by === memberFilterOpenId
          || (project.members || []).some((member) => member.member_open_id === memberFilterOpenId);
      })
      .filter((project) => {
        if (!textQuery) return true;
        return `${project.name} ${project.description || ""} ${project.department || ""} ${project.tags || ""}`.toLowerCase().includes(textQuery);
      });
  }, [memberFilterOpenId, projectCategoryFilter, projects, textQuery]);

  const taskAssigneeOptions = useMemo(() => {
    const ids = Array.from(new Set(tasks.map((task) => task.assignee_open_id).filter((id): id is string => Boolean(id))));
    return ids
      .map((openId) => ({ openId, name: memberMap[openId]?.name || openId }))
      .sort((left, right) => left.name.localeCompare(right.name, "zh-Hans-CN"));
  }, [memberMap, tasks]);

  const memberOptions = useMemo(() => {
    return Object.values(memberMap)
      .map((member) => ({ openId: member.open_id, name: member.name || member.open_id }))
      .sort((left, right) => left.name.localeCompare(right.name, "zh-Hans-CN"));
  }, [memberMap]);

  const departmentOptions = useMemo(() => {
    return Array.from(new Set([
      ...Object.values(memberMap).map((member) => member.department || "").filter(Boolean),
      ...projects.map((project) => project.department || "").filter(Boolean),
      projectDraft.department,
    ].filter(Boolean)))
      .sort((left, right) => left.localeCompare(right, "zh-Hans-CN"));
  }, [memberMap, projectDraft.department, projects]);

  const filteredTasks = useMemo(() => {
    return tasks
      .filter((task) => assigneeFilter === "all" || (assigneeFilter === "__unassigned__" ? !task.assignee_open_id : task.assignee_open_id === assigneeFilter))
      .filter((task) => {
        if (!memberFilterOpenId) return true;
        return task.assignee_open_id === memberFilterOpenId || task.created_by === memberFilterOpenId;
      })
      .filter((task) => {
        if (!textQuery) return true;
        return `${task.title} ${task.description || ""} ${task.project_name || ""}`.toLowerCase().includes(textQuery);
      });
  }, [assigneeFilter, memberFilterOpenId, tasks, textQuery]);

  const taskGroups = useMemo(() => {
    if (!isManager) return [{ key: "all", title: "我的任务", subtitle: "", tasks: filteredTasks }];
    const groups = new Map<string, Task[]>();
    filteredTasks.forEach((task) => {
      const key = task.assignee_open_id || "__unassigned__";
      const groupTasks = groups.get(key) || [];
      groupTasks.push(task);
      groups.set(key, groupTasks);
    });
    return Array.from(groups.entries())
      .map(([key, groupTasks]) => {
        const member = key === "__unassigned__" ? undefined : memberMap[key];
        return {
          key,
          title: key === "__unassigned__" ? "未分配负责人" : member?.name || key,
          subtitle: key === "__unassigned__" ? "未设置负责人" : member?.department || member?.position || "",
          tasks: groupTasks,
        };
      })
      .sort((left, right) => {
        if (left.key === "__unassigned__") return 1;
        if (right.key === "__unassigned__") return -1;
        return left.title.localeCompare(right.title, "zh-Hans-CN");
      });
  }, [filteredTasks, isManager, memberMap]);

  const planningProjects = filteredProjects.filter((project) => project.status === "planning");
  const activeProjects = filteredProjects.filter((project) => project.status === "active");
  const completedProjects = filteredProjects.filter((project) => project.status === "completed");
  const archivedProjects = filteredProjects.filter((project) => project.status === "archived");
  const projectStatusOverview = [
    { key: "all", label: "全部项目", projects: filteredProjects, tone: { bg: "#E8F3FF", fg: "#1D4ED8" } },
    { key: "planning", label: "筹备中", projects: planningProjects, tone: projectStatusStyle.planning },
    { key: "active", label: "进行中", projects: activeProjects, tone: projectStatusStyle.active },
    { key: "completed", label: "已完成", projects: completedProjects, tone: projectStatusStyle.completed },
    { key: "archived", label: "已归档", projects: archivedProjects, tone: projectStatusStyle.archived },
  ];
  const nowMs = Date.now();
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);
  const weekEnd = new Date(todayEnd);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const openFilteredTasks = filteredTasks.filter((task) => !["done", "cancelled"].includes(task.status));
  const dueTodayTasks = openFilteredTasks.filter((task) => task.due_date && new Date(task.due_date).getTime() <= todayEnd.getTime());
  const dueThisWeekTasks = openFilteredTasks.filter((task) => task.due_date && new Date(task.due_date).getTime() <= weekEnd.getTime());
  const overdueFilteredTasks = openFilteredTasks.filter((task) => task.due_date && new Date(task.due_date).getTime() < nowMs);
  const blockedFilteredTasks = openFilteredTasks.filter((task) => task.status === "blocked");
  const staleProjects = filteredProjects.filter((project) => project.is_abnormal);
  const categoryHealth = projectCategoryValues.map((category) => {
    const categoryProjects = filteredProjects.filter((project) => getProjectCategory(project) === category);
    const activeCount = categoryProjects.filter((project) => project.status === "active").length;
    const score = categoryProjects.length ? Math.round((activeCount / categoryProjects.length) * 100) : 0;
    return {
      category,
      count: categoryProjects.length,
      score,
      color: score >= 75 ? "#34C759" : score >= 45 ? "#FF9F0A" : "#F5483B",
    };
  });
  const cockpitBriefs = [
    ...overdueFilteredTasks.slice(0, 2).map((task) => ({
      tone: "#F5483B",
      label: "逾期",
      title: task.title,
      desc: `${task.project_name || "未关联项目"} · 截止 ${formatShortDate(task.due_date)}`,
    })),
    ...blockedFilteredTasks.slice(0, 2).map((task) => ({
      tone: "#F5483B",
      label: "受阻",
      title: task.title,
      desc: task.progress_draft || task.description || "需要负责人补充卡点说明",
    })),
    ...staleProjects.slice(0, 2).map((project) => ({
      tone: "#FF9F0A",
      label: "沉寂",
      title: project.name,
      desc: project.abnormal_reason || "群聊或项目动态需要关注",
    })),
  ].slice(0, 5);
  const viewRoleLabel = identityViewMode === "manager" ? (me?.role === "teacher" ? "指导者" : "管理员") : "员工";
  const memberStatusLabel = me?.status === "active" ? "在用" : me?.status === "on_leave" ? "暂离" : me?.status === "graduated" ? "已毕业" : me?.status === "left" ? "已离开" : "未知";
  const projectTimelineRows = filteredProjects.map((project) => {
    const start = project.start_date ? new Date(project.start_date).getTime() : new Date(project.created_at || nowIso).getTime();
    const end = project.actual_end_date || project.target_end_date || project.updated_at || nowIso;
    const endMs = Math.max(start + 86400000, new Date(end).getTime());
    return { project, start, end: endMs };
  });
  const rawTimelineStart = projectTimelineRows.length ? Math.min(...projectTimelineRows.map((item) => item.start)) : Date.now();
  const rawTimelineEnd = projectTimelineRows.length ? Math.max(...projectTimelineRows.map((item) => item.end)) : Date.now() + 86400000;
  const timelineStartDate = new Date(rawTimelineStart);
  timelineStartDate.setHours(0, 0, 0, 0);
  const timelineEndDate = new Date(rawTimelineEnd);
  timelineEndDate.setHours(23, 59, 59, 999);
  const timelineStart = timelineStartDate.getTime();
  const timelineEnd = timelineEndDate.getTime();
  const timelineSpan = Math.max(86400000, timelineEnd - timelineStart);
  const ganttDayCount = Math.max(1, Math.ceil(timelineSpan / 86400000));
  const ganttDays = Array.from({ length: ganttDayCount }, (_, index) => {
    const date = new Date(timelineStart + index * 86400000);
    return {
      key: date.toISOString().slice(0, 10),
      label: `${date.getMonth() + 1}/${date.getDate()}`,
    };
  });
  const renderTag = (label: string, tone: { bg: string; fg: string }) => (
    <span className="pm-tag" style={{ background: tone.bg, color: tone.fg }}>{label}</span>
  );

  const renderAssignee = (openId?: string | null) => {
    if (!openId) return <span className="pm-muted">未分配</span>;
    const member = memberMap[openId];
    return (
      <span className="pm-assignee">
        <MemberAvatarLink openId={openId} viewerOpenId={me?.open_id} src={member?.avatar_url} name={member?.name || openId} size={24} />
        <span className="pm-assignee-name">{member?.name || openId}</span>
      </span>
    );
  };

  const renderTaskAssigneeStatus = (task: Task) => {
    const assignee = renderAssignee(task.assignee_open_id);
    if (task.status !== "in_progress" || !task.assignee_open_id) return assignee;
    const status = larkStatuses[task.assignee_open_id];
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        {assignee}
        <span className="pm-tag" style={{ background: status?.is_active ? "#E8FFEA" : "#F2F3F5", color: status?.is_active ? "#15803D" : "#646A73" }}>
          {larkStatusLabel(status)}
        </span>
      </span>
    );
  };

  const renderPaperApprovalInline = (snapshot: PaperApprovalSnapshot) => {
    const progress = getPaperApprovalProgress(snapshot);
    return (
      <div className="pm-approval-inline">
        <div className="pm-sidebar-metric-row" style={{ marginBottom: 4 }}>
          <span>{snapshot.currentNode}</span>
          <span>{progress}%</span>
        </div>
        <div className="pm-progress pm-approval-progress"><span style={{ width: `${progress}%` }} /></div>
        <div className="pm-approval-inline-sub">待 {snapshot.currentApprover} 审批</div>
      </div>
    );
  };

  const approvalStepKey = (projectId: number, index: number) => `${projectId}:${index}`;

  const defaultGuidanceDraft = (step: PaperApprovalStep) => ({
    problemType: "执行记录缺失",
    evidence: ["日报", "项目群聊"],
    target: step.executor || snapshotApplicantName(step) || "",
    deadline: "2026-06-24",
    suggestion: "",
    status: "pending" as GuidanceStatus,
  });

  const snapshotApplicantName = (step: PaperApprovalStep) => step.executor || step.approver || "";

  const updateGuidanceDraft = (
    key: string,
    step: PaperApprovalStep,
    patch: Partial<{
      problemType: string;
      evidence: string[];
      target: string;
      deadline: string;
      suggestion: string;
      status: GuidanceStatus;
    }>,
  ) => {
    setGuidanceDrafts((prev) => ({
      ...prev,
      [key]: { ...(prev[key] || defaultGuidanceDraft(step)), ...patch },
    }));
  };

  const saveGuidanceRecord = (key: string, step: PaperApprovalStep) => {
    const draft = guidanceDrafts[key] || defaultGuidanceDraft(step);
    if (!draft.suggestion.trim()) {
      Toast.show({ content: "请先填写过程记录" });
      return;
    }
    const record: PaperGuidanceRecord = {
      id: `local-${Date.now()}`,
      problemType: draft.problemType,
      evidence: draft.evidence,
      target: draft.target || step.executor || "待定",
      deadline: draft.deadline,
      status: draft.status,
      suggestion: draft.suggestion.trim(),
      createdBy: "当前管理者",
      createdAt: new Date().toISOString(),
    };
    setGuidanceExtraRecords((prev) => ({ ...prev, [key]: [record, ...(prev[key] || [])] }));
    setGuidanceDrafts((prev) => ({ ...prev, [key]: { ...defaultGuidanceDraft(step), suggestion: "" } }));
    Toast.show({ content: "已添加过程记录（前端演示）" });
  };

  const renderApprovalStepPanel = (project: Project, snapshot: PaperApprovalSnapshot) => {
    const projectId = project.project_id;
    if (!selectedApprovalStepKey?.startsWith(`${projectId}:`)) return null;
    const selectedIndex = Number(selectedApprovalStepKey.split(":")[1]);
    const stepIndex = selectedIndex >= 0 ? selectedIndex : 0;
    const step = snapshot.steps[stepIndex];
    const panelKey = approvalStepKey(projectId, stepIndex);
    const guidanceRecords = [...(guidanceExtraRecords[panelKey] || []), ...(step.guidance || [])];
    const knownProjectTasks = [
      ...tasks,
      ...(projectTasks[projectId] || []),
    ].filter((task, index, list) => task.project_id === projectId && list.findIndex((item) => item.task_id === task.task_id) === index);
    const employeeProjectTasks = knownProjectTasks.filter((task) => task.created_by === me?.open_id || task.assignee_open_id === me?.open_id);
    return (
      <div className="pm-approval-node-panel">
        <div className="pm-approval-panel-head">
          <div>
            <div className="pm-approval-panel-title">{stepIndex + 1}. {step.title}</div>
            <div className="pm-muted">{step.group} · {step.status === "done" ? "已完成" : step.status === "current" ? "进行中" : "待流转"}</div>
          </div>
          <div className="pm-approval-panel-actions">
            <div className="pm-muted">{identityViewMode === "employee" ? "员工视角：提交材料和查看自己的任务" : "管理员/指导者视角：查看过程记录"}</div>
            {renderTag(step.status === "done" ? "已完成" : step.status === "current" ? "进行中" : "待流转", step.status === "done" ? { bg: "#E8FFEA", fg: "#15803D" } : step.status === "current" ? { bg: "#E8F3FF", fg: "#1D4ED8" } : { bg: "#F2F3F5", fg: "#646A73" })}
          </div>
        </div>
        <div className="pm-approval-panel-grid">
          <div><span>执行人</span><b>{step.executor || "待定"}</b></div>
          <div><span>审批人</span><b>{step.approver || step.owner}</b></div>
          <div><span>开始时间</span><b>{formatDate(step.startedAt)}</b></div>
          <div><span>完成时间</span><b>{step.completedAt ? formatDate(step.completedAt) : step.status === "current" ? "审批中" : "待流转"}</b></div>
        </div>
        <div className="pm-approval-panel-box">
          <div className="pm-section-title">阶段性标准材料</div>
          <div className="pm-approval-material-table">
            {(step.materials || ["待补充"]).map((item, materialIndex) => (
              <div key={`${item}-${materialIndex}`} className="pm-approval-material-row">
                <div className="pm-approval-material-name">
                  <span>{materialIndex + 1}</span>
                  <b>{item}</b>
                </div>
                {identityViewMode === "employee" ? (
                  <>
                    <input className="pm-inline-field" placeholder="粘贴飞书云文档链接" />
                    <label className="pm-upload-btn">
                      <input type="file" />
                      <span>上传文件</span>
                    </label>
                  </>
                ) : (
                  <div className="pm-material-readonly" style={{ gridColumn: "span 2" }}>
                    <span>{step.status === "done" ? "已提交材料，等待后端材料库关联" : "暂无提交链接"}</span>
                    <span>{step.status === "done" ? "已归档" : "未提交"}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="pm-muted" style={{ marginTop: 8 }}>{step.note}</div>
        </div>
        {identityViewMode === "employee" ? (
          <div className="pm-approval-panel-box">
            <div className="pm-guidance-head">
              <div>
                <div className="pm-section-title">我参与的任务</div>
                <div className="pm-muted">显示当前项目里由我创建或分配给我的任务。</div>
              </div>
              <button className="pm-row-action" type="button" onClick={() => navigate(`/tasks/new?project_id=${projectId}&assignee_open_id=${me?.open_id || ""}`)}>新建任务</button>
            </div>
            {employeeProjectTasks.length === 0 ? <div className="pm-muted">暂无和当前身份关联的任务</div> : null}
            {employeeProjectTasks.slice(0, 5).map((task) => (
              <div key={task.task_id} className="pm-kv-line">
                <span>{task.title}</span>
                <b>{taskStatusStyle[task.status]?.label || task.status}</b>
              </div>
            ))}
          </div>
        ) : null}
        <div className="pm-guidance-box">
          <div className="pm-guidance-head">
            <div>
              <div className="pm-section-title">过程记录</div>
              <div className="pm-muted">日报、群聊、任务、过程材料和过程记录集中放到独立页面。</div>
            </div>
            {renderTag(`${guidanceRecords.length} 条记录`, { bg: "#F4F3FF", fg: "#5B21B6" })}
          </div>
          <button
            className="pm-primary pm-guidance-save"
            type="button"
            onClick={() => navigate(`/projects/${projectId}/guidance?step=${stepIndex}`)}
          >
            进入过程记录页
          </button>
        </div>
      </div>
    );
  };

  const renderPaperApprovalBoard = (project: Project, snapshot: PaperApprovalSnapshot) => {
    const progress = getPaperApprovalProgress(snapshot);
    const currentIndex = Math.max(1, snapshot.steps.findIndex((step) => step.status === "current") + 1);
    return (
      <div className="pm-approval-board-row">
        <div className="pm-approval-board">
          <div className="pm-approval-board-head">
              <span>{snapshot.title}</span>
              {renderTag("审批中", { bg: "#E8F3FF", fg: "#1D4ED8" })}
              <b>{progress}%</b>
              <span>{currentIndex}/{snapshot.steps.length} · {snapshot.currentNode} · {snapshot.currentApprover}</span>
            </div>
          <div className="pm-approval-node-flow">
            {snapshot.steps.map((step, index) => (
              <Fragment key={step.title}>
                <button
                  className="pm-approval-node-wrap"
                  type="button"
                  data-status={step.status}
                  data-selected={selectedApprovalStepKey === approvalStepKey(project.project_id, index)}
                  onClick={(event) => {
                    event.stopPropagation();
                    const key = approvalStepKey(project.project_id, index);
                    setSelectedApprovalStepKey((prev) => prev === key ? null : key);
                  }}
                >
                  <div className="pm-approval-node-group">{step.group}</div>
                  <div className="pm-approval-node">{index + 1}</div>
                  <div className="pm-approval-node-label">{step.title}</div>
                  <div className="pm-approval-node-date">{approvalStepDateLabel(step)}</div>
                </button>
                {index < snapshot.steps.length - 1 ? (
                  <div className="pm-approval-line" data-active={step.status === "done" ? "true" : undefined}>
                    <span>{approvalLineDaysLabel(step, snapshot.steps[index + 1])}</span>
                  </div>
                ) : null}
              </Fragment>
            ))}
          </div>
          {renderApprovalStepPanel(project, snapshot)}
        </div>
      </div>
    );
  };

  const renderProjectStageNodeMap = (project: Project) => {
    const category = getProjectCategory(project);
    if (category === "all") return null;
    const stages = categoryStageTemplates[category];
    return (
      <div className="pm-stage-node-map">
        <div className="pm-stage-node-map-head">
          <span>{category}阶段节点</span>
          <b>{stages.length} 个阶段</b>
        </div>
        <div className="pm-stage-node-grid">
          {stages.map((stage, index) => (
            <div key={`${project.project_id}-${stage.title}`} className="pm-stage-node-item">
              <div className="pm-stage-node-title">{index + 1}. {stage.title}</div>
              <div className="pm-stage-node-list">{stage.nodes.join(" / ")}</div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderProjectRows = () => (
    <div className="pm-project-list">
      <div className="pm-table-scroll" style={{ margin: "-12px -12px 0" }}>
        <div className="pm-project-card-labels">
          <span>项目</span>
          <span>负责人</span>
          <span>状态</span>
          <span>优先级</span>
          <span>进度</span>
          <span>任务</span>
          <span>更新</span>
          <span className="pm-project-card-label-action">操作</span>
        </div>
      </div>
      {filteredProjects.map((project) => {
          const projectType = projectTypeStyle[project.my_project_type || project.project_type || "team"];
          const category = getProjectCategory(project);
          const progress = getProgress(project);
          const owner = memberMap[project.owner_open_id];
          const canEdit = canDeleteProject(project);
          const approvalSnapshot = getProjectApprovalSnapshot(project);
          return (
            <div
              key={project.project_id}
              id={`project-card-${project.project_id}`}
              className="pm-project-card"
              data-highlight={highlightProjectId === project.project_id ? "true" : undefined}
            >
              <div className="pm-table-scroll">
                <div className="pm-project-card-head">
                  <div className="pm-project-card-cell">
                    <div className="pm-name-cell">
                      <div className="pm-name-main">{project.name}</div>
                      <div className="pm-name-sub">
                        {renderTag(projectType.label, projectType)}
                        {category !== "all" ? <span style={{ marginLeft: 6 }}>{renderTag(category, { bg: "#F0FDF4", fg: "#15803D" })}</span> : null}
                        {project.is_abnormal ? <span style={{ marginLeft: 6 }}>{renderTag("异常", { bg: "#FEE2E2", fg: "#B91C1C" })}</span> : null}
                      </div>
                    </div>
                  </div>
                  <div className="pm-project-card-cell">{renderAssignee(project.owner_open_id || owner?.open_id)}</div>
                  <div className="pm-project-card-cell">{renderTag(projectStatusStyle[project.status].label, projectStatusStyle[project.status])}</div>
                  <div className="pm-project-card-cell">{renderTag(priorityStyle[project.priority].label, priorityStyle[project.priority])}</div>
                  <div className="pm-project-card-cell">
                    {approvalSnapshot ? renderPaperApprovalInline(approvalSnapshot) : (
                      <>
                        <div className="pm-sidebar-metric-row" style={{ marginBottom: 4 }}>
                          <span>{progress}%</span>
                          <span>{project.task_done_count}/{project.task_count}</span>
                        </div>
                        <div className="pm-progress"><span style={{ width: `${progress}%` }} /></div>
                      </>
                    )}
                  </div>
                  <div className="pm-project-card-cell">{project.task_count}</div>
                  <div className="pm-project-card-cell pm-muted">{formatDate(project.updated_at)}</div>
                  <div className="pm-project-card-cell pm-project-card-cell-action" onClick={(event) => event.stopPropagation()}>
                    <button
                      className="pm-row-action pm-row-action-danger"
                      type="button"
                      disabled={deletingId === project.project_id}
                      title={canEdit ? "删除项目" : "当前账号可能无权删除，点击后以后端校验为准"}
                      onClick={() => {
                        handleDeleteProject(project);
                      }}
                    >
                      删除
                    </button>
                  </div>
                </div>
              </div>
              {renderProjectStageNodeMap(project)}
              {approvalSnapshot ? renderPaperApprovalBoard(project, approvalSnapshot) : null}
            </div>
          );
      })}
    </div>
  );

  const renderProjectKanban = () => (
    <div className="pm-view-panel">
      <div className="pm-table-scroll">
        <div className="pm-board-grid">
          {sevenFlowNodes.map((flowNode, flowIndex) => {
            const statusProjects = filteredProjects.filter((project) => {
              const snapshot = getProjectApprovalSnapshot(project);
              if (!snapshot) return flowIndex === 0;
              const current = snapshot.steps.findIndex((step) => step.status === "current");
              const doneCount = snapshot.steps.filter((step) => step.status === "done").length;
              const projectFlowIndex = project.status === "completed" || project.status === "archived"
                ? snapshot.steps.length - 1
                : current >= 0
                  ? current
                  : Math.min(doneCount, snapshot.steps.length - 1);
              return projectFlowIndex === flowIndex;
            });
            return (
              <section key={flowNode.title} className="pm-board-column">
                <div className="pm-board-head">
                  <span>{flowIndex + 1}. {flowNode.title}</span>
                  <span>{statusProjects.length}</span>
                </div>
                {statusProjects.length === 0 ? <div className="pm-muted">暂无项目</div> : null}
                {statusProjects.map((project) => {
                  const category = getProjectCategory(project);
                  const stageNodes = category !== "all" ? categoryStageTemplates[category][flowIndex]?.nodes || [] : [];
                  const participants = project.members
                    .filter((member) => !member.left_at && member.role !== "owner")
                    .map((member) => memberMap[member.member_open_id]?.name || member.member_open_id);
                  return (
                    <button key={project.project_id} className="pm-board-card" type="button" onClick={() => scrollProjectIntoView(project)}>
                      <b>{project.name}</b>
                      <small>负责人：{memberMap[project.owner_open_id]?.name || project.owner_open_id || "未设置"} · {getProgress(project)}%</small>
                      {stageNodes.length ? <small>节点：{stageNodes.join(" / ")}</small> : null}
                      <small>参与人：{participants.slice(0, 3).join("、") || "待补充"}</small>
                      <div className="pm-progress" style={{ marginTop: 8 }}><span style={{ width: `${getProgress(project)}%` }} /></div>
                    </button>
                  );
                })}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );

  const renderProjectGantt = () => (
    <div className="pm-view-panel">
      <div className="pm-table-scroll">
        <div className="pm-gantt-sheet">
          <div className="pm-gantt-head">
            <span>项目名称</span>
            <span>负责人</span>
            <span>状态</span>
            <span>截止时间</span>
            <div className="pm-gantt-days" style={{ gridTemplateColumns: `repeat(${ganttDays.length}, 44px)` }}>
              {ganttDays.map((day) => <span key={day.key} className="pm-gantt-day">{day.label}</span>)}
            </div>
          </div>
          {projectTimelineRows.map(({ project, start, end }) => {
            const dayLeft = Math.max(0, Math.floor((start - timelineStart) / 86400000));
            const dayWidth = Math.max(1, Math.ceil((end - Math.max(start, timelineStart)) / 86400000));
            return (
              <div key={project.project_id} className="pm-gantt-row" role="button" tabIndex={0} onClick={() => scrollProjectIntoView(project)} onKeyDown={(event) => {
                if (event.key === "Enter") scrollProjectIntoView(project);
              }}>
                <div className="pm-gantt-cell pm-gantt-name">{project.name}</div>
                <div className="pm-gantt-cell">{memberMap[project.owner_open_id]?.name || project.owner_open_id || "未设置"}</div>
                <div className="pm-gantt-cell">{projectStatusStyle[project.status].label}</div>
                <div className="pm-gantt-cell">{formatDate(project.target_end_date || project.actual_end_date)}</div>
                <div className="pm-gantt-track" style={{ width: `${ganttDays.length * 44}px` }}>
                  <span
                    className="pm-gantt-bar"
                    data-status={project.status}
                    style={{ left: `${dayLeft * 44 + 6}px`, width: `${Math.min(dayWidth, ganttDays.length - dayLeft) * 44 - 12}px` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  const renderProjectView = () => {
    if (projectView === "kanban") return renderProjectKanban();
    if (projectView === "gantt") return renderProjectGantt();
    return renderProjectRows();
  };

  const renderTaskRows = (groupTasks: Task[]) => (
    <div className="pm-table-scroll">
    <table className="pm-table">
      <colgroup>
        <col style={{ width: "34%" }} />
        <col style={{ width: "18%" }} />
        <col style={{ width: "10%" }} />
        <col style={{ width: "9%" }} />
        <col style={{ width: "13%" }} />
        <col style={{ width: "10%" }} />
        <col style={{ width: "6%" }} />
      </colgroup>
      <thead>
        <tr>
          <th>任务</th>
          <th>项目</th>
          <th>状态</th>
          <th>优先级</th>
          <th>截止</th>
          <th>负责人</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        {groupTasks.map((task) => {
          const isOverdue = task.due_date && new Date(task.due_date).getTime() < Date.now() && !["done", "cancelled"].includes(task.status);
          const canEdit = canDeleteTask(task);
          const logs = taskLogs[task.task_id] || [];
          return (
            <Fragment key={task.task_id}>
            <tr onClick={() => openTaskInline(task)} style={{ cursor: "pointer", background: expandedTaskId === task.task_id ? "#F7F8FA" : undefined }}>
              <td>
                <div className="pm-name-cell">
                  <div className="pm-name-main" style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span>{task.title}</span>
                    {!(task.thinking || "").trim() ? renderTag("缺思路", { bg: "#FEE2E2", fg: "#991B1B" }) : null}
                    {task.task_origin === "chat_ai" ? renderTag("群聊识别", { bg: "#E8F3FF", fg: "#1D4ED8" }) : null}
                  </div>
                  <div className="pm-name-sub">{task.description || `#${task.task_id}`}</div>
                </div>
              </td>
              <td>{taskProjectLabel(task)}</td>
              <td>{renderTag(taskStatusStyle[task.status].label, taskStatusStyle[task.status])}</td>
              <td>{renderTag(priorityStyle[task.priority].label, priorityStyle[task.priority])}</td>
              <td>
                <span style={{ color: isOverdue ? "#B91C1C" : "#1F2329" }}>{formatDate(task.due_date)}</span>
              </td>
              <td>{renderTaskAssigneeStatus(task)}</td>
              <td onClick={(event) => event.stopPropagation()}>
                {canDeleteTask(task) ? (
                  <button
                    className="pm-row-action pm-row-action-danger"
                    type="button"
                    disabled={deletingTaskId === task.task_id}
                    onClick={() => handleDeleteTask(task)}
                  >
                    删除
                  </button>
                ) : null}
              </td>
            </tr>
            {expandedTaskId === task.task_id ? (
              <tr>
                <td colSpan={7} style={{ padding: 0 }}>
                  <div
                    className="pm-inline-editor"
                    onClick={(event) => {
                      if (event.target === event.currentTarget) setExpandedTaskId(null);
                    }}
                  >
                    <div className="pm-inline-grid">
                      <div className="pm-inline-panel">
                        <div className="pm-inline-label">任务标题</div>
                        <input className="pm-inline-field" value={taskDraft.title} disabled={!canEdit} onChange={(event) => setTaskDraft((prev) => ({ ...prev, title: event.target.value }))} />
                        <div className="pm-inline-label" style={{ marginTop: 10 }}>任务描述</div>
                        <textarea className="pm-inline-field pm-inline-textarea" value={taskDraft.description} disabled={!canEdit} onChange={(event) => setTaskDraft((prev) => ({ ...prev, description: event.target.value }))} />
                        <div className="pm-inline-label" style={{ marginTop: 10 }}>任务思路</div>
                        <textarea className="pm-inline-field pm-inline-textarea" value={taskDraft.thinking} disabled={!canEdit} placeholder="今天准备怎么做、先验证什么、需要谁配合" onChange={(event) => setTaskDraft((prev) => ({ ...prev, thinking: event.target.value }))} />
                        <div className="pm-inline-actions">
                          {canEdit ? (
                            <button className="pm-primary-btn" type="button" disabled={savingTaskId === task.task_id} onClick={() => void saveTaskInline(task)}>
                              保存任务
                            </button>
                          ) : null}
                        </div>
                        <div style={{ marginTop: 10 }}>
                          <div className="pm-section-title">任务变更日志</div>
                          {taskLogsLoadingId === task.task_id ? <div className="pm-muted">正在加载日志...</div> : null}
                          {taskLogsLoadingId !== task.task_id && logs.length === 0 ? <div className="pm-muted">暂无日志</div> : null}
                          {logs.slice(0, 6).map((log) => (
                            <div key={log.log_id} style={{ padding: "6px 0", borderTop: "1px solid #F2F3F5", color: "#646A73", fontSize: 12 }}>
                              {formatDate(log.created_at)} · {log.actor_name || log.actor_open_id} · {log.action}
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="pm-inline-panel">
                        <div className="pm-inline-fields">
                          <div>
                            <div className="pm-inline-label">状态</div>
                            <select className="pm-inline-field" value={taskDraft.status} disabled={!canEdit} onChange={(event) => setTaskDraft((prev) => ({ ...prev, status: event.target.value as TaskStatus }))}>
                              <option value="todo">待办</option>
                              <option value="in_progress">进行中</option>
                              <option value="done">已完成</option>
                              <option value="blocked">受阻</option>
                              <option value="cancelled">已取消</option>
                            </select>
                          </div>
                          <div>
                            <div className="pm-inline-label">优先级</div>
                            <select className="pm-inline-field" value={taskDraft.priority} disabled={!canEdit} onChange={(event) => setTaskDraft((prev) => ({ ...prev, priority: event.target.value as ProjectPriority }))}>
                              <option value="low">低</option>
                              <option value="medium">中</option>
                              <option value="high">高</option>
                              <option value="urgent">紧急</option>
                            </select>
                          </div>
                          <div>
                            <div className="pm-inline-label">负责人</div>
                            <select className="pm-inline-field" value={taskDraft.assignee_open_id} disabled={!canEdit} onChange={(event) => setTaskDraft((prev) => ({ ...prev, assignee_open_id: event.target.value }))}>
                              <option value="">未分配</option>
                              {memberOptions.map((member) => (
                                <option key={member.openId} value={member.openId}>{member.name}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div style={{ marginTop: 10, color: "#646A73", fontSize: 12, lineHeight: 1.7 }}>
                          <div>项目：{taskProjectLabel(task)}</div>
                          <div>截止：{formatDate(task.due_date)}</div>
                          <div>负责人：{task.assignee_open_id ? memberMap[task.assignee_open_id]?.name || task.assignee_open_id : "未分配"}</div>
                          <div>创建：{formatDate(task.created_at)}</div>
                          <div>更新：{formatDate(task.updated_at)}</div>
                          <div>完成：{formatDate(task.completed_at)}</div>
                          <div>回执：{task.received_at ? formatDate(task.received_at) : "未收到"}</div>
                        </div>
                        <div className="pm-inline-label" style={{ marginTop: 10 }}>进度暂存 / 过程总结</div>
                        <textarea className="pm-inline-field pm-inline-textarea" value={taskDraft.progress_draft} disabled={!canEdit} placeholder="随手保存当前进展、卡点、经验和下一步" onChange={(event) => setTaskDraft((prev) => ({ ...prev, progress_draft: event.target.value }))} />
                      </div>
                    </div>
                  </div>
                </td>
              </tr>
            ) : null}
            </Fragment>
          );
        })}
      </tbody>
    </table>
    </div>
  );

  return (
    <div className="pm-workbench">
      <style>{projectPanelStyles}</style>
      <div className="pm-topbar">
        <div className="pm-brand">
          <span className="pm-mark">卷</span>
          <span className="pm-title">项目管理</span>
          <span className="pm-breadcrumb">工作台 / {workMode === "projects" ? "项目" : "任务"}</span>
        </div>
        <div className="pm-module-tabs">
          <button className="pm-tab-btn" type="button" data-active={workMode === "projects"} onClick={() => setWorkMode("projects")}>项目</button>
          <button className="pm-tab-btn" type="button" data-active={workMode === "tasks"} onClick={() => setWorkMode("tasks")}>任务</button>
        </div>
        <div className="pm-toolbar-right">
          <div className="pm-unified-search">
            <input
              className="pm-search"
              value={query}
              placeholder="搜索项目 / 任务 / 人员"
              onFocus={() => setSearchFocused(true)}
              onBlur={() => window.setTimeout(() => setSearchFocused(false), 120)}
              onChange={(event) => {
                setQuery(event.target.value);
                setMemberFilterOpenId("");
              }}
            />
            {query ? (
              <button
                className="pm-search-clear"
                type="button"
                aria-label="清空搜索"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setQuery("");
                  setMemberFilterOpenId("");
                }}
              >
                ×
              </button>
            ) : null}
            {searchFocused && peopleSuggestions.length > 0 ? (
              <div className="pm-people-popover">
                <div className="pm-people-popover-title">匹配到的组织人员</div>
                {peopleSuggestions.map((member) => (
                  <button
                    key={member.open_id}
                    className="pm-people-option"
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      setMemberFilterOpenId(member.open_id);
                      setQuery(member.name || member.open_id);
                      setSearchFocused(false);
                    }}
                  >
                    <span className="pm-people-avatar">{(member.name || member.open_id).slice(0, 1)}</span>
                    <span className="pm-people-main">
                      <span className="pm-people-name">{member.name || member.open_id}</span>
                      <span className="pm-people-meta">{[member.department, member.position || member.title].filter(Boolean).join(" · ") || "未设置部门"}</span>
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <button className="pm-primary-btn" type="button" onClick={() => navigate("/projects/new")}>新建项目</button>
        </div>
      </div>

      <div className="pm-layout">
        <aside className="pm-sidebar">
          <div className="pm-sidebar-section">
            <div className="pm-sidebar-title">视图</div>
            <button className="pm-nav-item" type="button" data-active={workMode === "projects"} onClick={() => setWorkMode("projects")}>
              <span className="pm-nav-label"><span className="pm-nav-icon">▦</span><span>项目列表</span></span><span className="pm-nav-count">{projects.length}</span>
            </button>
            <button className="pm-nav-item" type="button" data-active={workMode === "tasks"} onClick={() => setWorkMode("tasks")}>
              <span className="pm-nav-label"><span className="pm-nav-icon">✓</span><span>任务列表</span></span><span className="pm-nav-count">{tasks.length}</span>
            </button>
          </div>

          {workMode === "projects" ? (
            <>
              <div className="pm-sidebar-section">
                <div className="pm-sidebar-title">项目视图</div>
                {projectViewItems.map((item) => (
                  <button
                    key={item.key}
                    className="pm-nav-item"
                    type="button"
                    data-active={projectView === item.key}
                    onClick={() => {
                      setWorkMode("projects");
                      setProjectView(item.key);
                    }}
                  >
                    <span className="pm-nav-label"><span className="pm-nav-icon">{item.key === "table" ? "≡" : item.key === "kanban" ? "▣" : "⌁"}</span><span>{item.title}</span></span>
                  </button>
                ))}
              </div>
              <div className="pm-sidebar-section">
                <div className="pm-sidebar-title">项目状态</div>
                {tabItems.map((item) => (
                  <button key={item.key} className="pm-nav-item" type="button" data-active={activeKey === item.key} onClick={() => setActiveKey(item.key)}>
                    <span className="pm-nav-label"><span className="pm-nav-icon">{item.key === "planning" ? "◇" : item.key === "active" ? "●" : item.key === "completed" ? "◆" : "□"}</span><span>{item.title}</span></span>
                  </button>
                ))}
              </div>
              <div className="pm-sidebar-section">
                <div className="pm-sidebar-title">类型</div>
                {([
                  ["all", "全部类型"],
                  ["team", "团队项目"],
                  ["personal", "个人项目"],
                ] as Array<["all" | ProjectType, string]>).map(([value, label]) => (
                  <button key={value} className="pm-nav-item" type="button" data-active={projectTypeFilter === value} onClick={() => setProjectTypeFilter(value)}>
                    <span className="pm-nav-label"><span className="pm-nav-icon">{value === "all" ? "⌘" : value === "team" ? "◌" : "◍"}</span><span>{label}</span></span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="pm-sidebar-section">
              <div className="pm-sidebar-title">任务状态</div>
              {taskFilters.map((item) => (
                <button key={item.value} className="pm-nav-item" type="button" data-active={taskFilter === item.value} onClick={() => setTaskFilter(item.value)}>
                  <span className="pm-nav-label"><span className="pm-nav-icon">{item.value === "open" ? "◐" : item.value === "todo" ? "○" : item.value === "in_progress" ? "◒" : item.value === "blocked" ? "!" : item.value === "done" ? "✓" : item.value === "cancelled" ? "×" : "∞"}</span><span>{item.label}</span></span>
                </button>
              ))}
            </div>
          )}
        </aside>

        <main className="pm-main">
          <div className="pm-toolbar">
            <div className="pm-toolbar-left">
              <div className="pm-view-title">{workMode === "projects" ? "项目视图" : isManager ? "按负责人查看任务" : "任务视图"}</div>
              <div className="pm-muted">{workMode === "projects" ? `${filteredProjects.length} 个项目` : `${filteredTasks.length} 个任务`}</div>
            </div>
            <div className="pm-toolbar-right">
              {workMode === "projects" ? (
                <>
                  <div className="pm-view-switch">
                    {projectViewItems.map((item) => (
                      <button key={item.key} type="button" data-active={projectView === item.key} onClick={() => setProjectView(item.key)}>
                        {item.title}
                      </button>
                    ))}
                  </div>
                  <select
                    className="pm-category-select"
                    value={projectCategoryFilter}
                    aria-label="项目类别筛选"
                    onChange={(event) => setProjectCategoryFilter(event.target.value as ProjectCategoryFilter)}
                  >
                    <option value="all">全部类别</option>
                    {projectCategoryValues.map((value) => (
                      <option key={value} value={value}>{value}</option>
                    ))}
                  </select>
                </>
              ) : (
                <>
                  <select className="pm-select" value={assigneeFilter} onChange={(event) => setAssigneeFilter(event.target.value)}>
                    <option value="all">全部负责人</option>
                    {taskAssigneeOptions.map((item) => (
                      <option key={item.openId} value={item.openId}>{item.name}</option>
                    ))}
                    <option value="__unassigned__">未分配负责人</option>
                  </select>
                  <span className="pm-muted">{isManager ? "按负责人分组，未分配置底" : "显示当前筛选任务"}</span>
                </>
              )}
            </div>
          </div>

          {workMode === "projects" && projectView === "table" ? (
            <div className="pm-cockpit">
              <div className="pm-cockpit-hero">
                <div className="pm-cockpit-kicker">当前人员身份信息</div>
                <div className="pm-cockpit-title">{me?.name || "未登录用户"}</div>
                <div className="pm-cockpit-sub">{me?.department || "未设置部门"} · 当前以{viewRoleLabel}视角查看</div>
                <div className="pm-identity-switch" aria-label="切换项目管理身份视角">
                  <button type="button" data-active={identityViewMode === "manager"} onClick={() => setIdentityViewMode("manager")}>管理员/指导者</button>
                  <button type="button" data-active={identityViewMode === "employee"} onClick={() => setIdentityViewMode("employee")}>员工</button>
                </div>
                <div className="pm-identity-grid">
                  <div className="pm-identity-item"><small>身份角色</small><b>{viewRoleLabel}</b></div>
                  <div className="pm-identity-item"><small>所属部门</small><b>{me?.department || "未设置"}</b></div>
                  <div className="pm-identity-item"><small>职位/职称</small><b>{me?.position || me?.title || "未设置"}</b></div>
                  <div className="pm-identity-item"><small>账号状态</small><b>{memberStatusLabel}</b></div>
                </div>
              </div>
              <div className="pm-cockpit-grid">
                <div className="pm-cockpit-panel">
                  <h3>今日简报 <span>{cockpitBriefs.length} 条待关注</span></h3>
                  <div className="pm-brief-list">
                    {cockpitBriefs.length === 0 ? <div className="pm-muted">当前没有逾期、受阻或沉寂项目</div> : null}
                    {cockpitBriefs.map((item, index) => (
                      <div key={`${item.label}-${item.title}-${index}`} className="pm-brief-item">
                        <span className="pm-brief-dot" style={{ background: item.tone }} />
                        <div>
                          <div className="pm-brief-title">{renderTag(item.label, { bg: `${item.tone}1A`, fg: item.tone })} {item.title}</div>
                          <div className="pm-brief-desc">{item.desc}</div>
                        </div>
                        <button className="pm-row-action" type="button" onClick={() => setWorkMode("tasks")}>处理</button>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="pm-cockpit-panel">
                  <h3>全局总览 <span>当前筛选范围</span></h3>
                  <div className="pm-cockpit-metrics">
                    <div className="pm-cockpit-metric"><small>筹备中</small><b>{planningProjects.length}</b></div>
                    <div className="pm-cockpit-metric"><small>进行中</small><b>{activeProjects.length}</b></div>
                    <div className="pm-cockpit-metric"><small>已完成</small><b>{completedProjects.length}</b></div>
                    <div className="pm-cockpit-metric"><small>已归档</small><b>{archivedProjects.length}</b></div>
                  </div>
                  <div className="pm-line-health">
                    {categoryHealth.map((item) => (
                      <div key={item.category} className="pm-line-health-row">
                        <span>{item.category}</span>
                        <span className="pm-line-health-bar"><i style={{ width: `${item.score}%`, background: item.color }} /></span>
                        <b style={{ color: item.color }}>{item.count}</b>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {workMode === "tasks" || projectView === "table" ? (
          <div className="pm-summary-grid">
            <div className="pm-metric-card">
              <div className="pm-section-title">管理概览</div>
              <div className="pm-metric-grid">
                {workMode === "tasks" ? (
                  <>
                    <div className="pm-metric-item"><div className="pm-inline-label">今日到期</div><div className="pm-metric-number">{dueTodayTasks.length}</div></div>
                    <div className="pm-metric-item"><div className="pm-inline-label">本周到期</div><div className="pm-metric-number">{dueThisWeekTasks.length}</div></div>
                    <div className="pm-metric-item"><div className="pm-inline-label">逾期</div><div className="pm-metric-number" data-tone={overdueFilteredTasks.length ? "warn" : "good"}>{overdueFilteredTasks.length}</div></div>
                    <div className="pm-metric-item"><div className="pm-inline-label">受阻</div><div className="pm-metric-number" data-tone={blockedFilteredTasks.length ? "danger" : "good"}>{blockedFilteredTasks.length}</div></div>
                  </>
                ) : (
                  <div className="pm-status-overview-grid">
                    {projectStatusOverview.map((item) => (
                      <div key={item.key} className="pm-status-card">
                        <div className="pm-status-card-head">
                          <span className="pm-status-card-title">{item.label}</span>
                          <span className="pm-status-card-count" style={{ color: item.tone.fg }}>{item.projects.length}</span>
                        </div>
                        <div className="pm-status-project-list">
                          {item.projects.length === 0 ? <span className="pm-status-card-empty">暂无项目</span> : null}
                          {item.projects.map((project) => (
                            <button
                              key={project.project_id}
                              className="pm-status-project-name"
                              type="button"
                              title={`定位到 ${project.name}`}
                              onClick={() => scrollProjectIntoView(project)}
                            >
                              {project.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
          ) : null}

          <div className="pm-content">
            {loading ? <SectionLoading text={workMode === "projects" ? "正在加载项目..." : "正在加载任务..."} /> : null}
            {!loading && workMode === "projects" && filteredProjects.length === 0 ? (
              <div className="pm-empty-wrap"><SectionEmpty description="当前筛选下没有项目" /></div>
            ) : null}
            {!loading && workMode === "projects" && filteredProjects.length > 0 ? renderProjectView() : null}

            {!loading && workMode === "tasks" && filteredTasks.length === 0 ? (
              <div className="pm-empty-wrap"><SectionEmpty description="当前筛选下没有任务" /></div>
            ) : null}
            {!loading && workMode === "tasks" && filteredTasks.length > 0 ? (
              <div>
                {taskGroups.map((group) => (
                  <section key={group.key} className="pm-task-group">
                    <div className="pm-task-group-head">
                      <div className="pm-task-group-title">
                        <span>{group.title}</span>
                        {group.subtitle ? <span className="pm-muted">{group.subtitle}</span> : null}
                      </div>
                      {renderTag(`${group.tasks.length} 个任务`, { bg: "#F2F3F5", fg: "#4E5969" })}
                    </div>
                    {renderTaskRows(group.tasks)}
                  </section>
                ))}
              </div>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
};

export default ProjectListPage;
