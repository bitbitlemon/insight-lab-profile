import { Fragment, startTransition, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Dialog, Selector, Toast } from "antd-mobile";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
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
  createProjectLog,
  decideProjectLog,
  deleteProject,
  getProject,
  listLarkChatTopics,
  listProjectChatMessages,
  listProjectLogs,
  listStageChecks,
  saveStageChecks,
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
import { getMemberSearchText } from "../components/MemberPicker";
import { Avatar, SectionEmpty, SectionLoading } from "../components/ui";
import { useAuth } from "../hooks/useAuth";
import { listApprovalRules } from "../api/approvalRules";
import type {
  ApprovalRule,
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
import {
  categoryFlowNote,
  categoryStageNodes,
  categoryStageTemplates,
  getStageStandardItems,
  legacyProjectCategoryMap,
  projectCategoryValues,
  sevenFlowNodes,
  workflowTemplates,
  stageStandardItems,
  standardApprovalTemplates,
  type PaperApprovalSnapshot,
  type PaperApprovalStep,
  type PaperApprovalStepStatus,
  type ProjectCategory,
  type ProjectCategoryFilter,
  type ProjectStageTemplate,
  type WorkflowTemplateKey,
} from "./projectManagementFlow";
import { projectPanelStyles } from "./projectManagementStyles";

type ProjectTabKey = "planning" | "active" | "completed" | "archived";
type WorkMode = "projects" | "tasks" | "approvals";
type ProjectViewKey = "dashboard" | "kanban" | "trello" | "gantt";
type TaskFilter = "open" | "todo" | "in_progress" | "blocked" | "done" | "cancelled" | "all";
type GuidanceStatus = "pending" | "viewed" | "replied" | "resolved";
type StageApprovalVisualStatus = "approved" | "rejected" | "pending" | "current" | "waiting" | "done";

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

const projectTypeStyle: Record<ProjectType, { label: string; bg: string; fg: string }> = {
  team: { label: "团队项目", bg: "#E8F7FF", fg: "#075985" },
  personal: { label: "个人项目", bg: "#F2F3F5", fg: "#4E5969" },
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
    currentNode: "启动阶段审批",
    currentApprover: "罗凯宇",
    applicant: "罗起宁",
    department: "科技部",
    guide: "罗凯宇",
    submitted: false,
    documentUrl: "https://insight-lab.feishu.cn/wiki/CWi2wc7gSiyeCAkQiQac9Qt8nGc",
    summary: "论文审批统一采用启动、设计、验证、内测、迭代、交付、归档 7 个阶段；每个阶段完成材料检查和审批后，才会解锁下一阶段。",
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
      { title: "启动阶段", items: ["提交论文选题、调研报告、指导人和核心作者信息。", "指导人确认研究方向和协作关系。"] },
      { title: "设计阶段", items: ["提交创新思路、研究方法、模型结构和开题报告。", "指导人确认技术路线与实验计划。"] },
      { title: "验证阶段", items: ["提交 baseline、创新实验、代码仓库和复现实验说明。", "完成核心指标验证，记录失败样例和问题归因。"] },
      { title: "内测阶段", items: ["提交论文初稿、图表、引用和实验补充材料。", "指导人组织内部评审，形成审稿意见和修改清单。"] },
      { title: "迭代阶段", items: ["逐条回应审稿意见，提交修改稿和回复信。", "完成补实验、格式检查和版本差异复核。"] },
      { title: "交付阶段", items: ["提交最终稿、投稿期刊/会议、作者信息和论文语言。", "保存投稿截图、回执或投稿系统记录。"] },
      { title: "归档阶段", items: ["归档论文最终版、代码、实验复现包和审稿记录。", "沉淀论文模板、复盘结论和可复用经验。"] },
    ],
    steps: [
      { group: "启动", title: "论文选题与调研审批", owner: "负责人", status: "done", executor: "罗起宁", approver: "系统记录", startedAt: "2026-06-21T09:30:00+08:00", completedAt: "2026-06-21T10:05:00+08:00", materials: ["论文标题", "负责人/部门/指导人", "调研报告", "创新思路文档"], note: "确认论文方向、指导关系、核心作者和参考论文清单。" },
      { group: "设计", title: "方法创新与开题审批", owner: "负责人", status: "current", executor: "罗起宁", approver: "罗凯宇", startedAt: "2026-06-21T10:05:00+08:00", materials: ["开题报告", "创新思路", "模型结构", "实验排期"], note: "当前等待指导人确认研究方法、创新点和开题方案。" },
      { group: "验证", title: "实验与代码复现审批", owner: "负责人", status: "waiting", executor: "罗起宁", approver: "指导人/代码审核人", materials: ["baseline 实验", "核心指标", "Gitee 仓库", "复现实验说明"], note: "完成 baseline 和创新实验验证，保留代码版本、指标与问题归因。" },
      { group: "内测", title: "论文初稿内审", owner: "负责人", status: "waiting", executor: "罗起宁", approver: "直接指导人/论文审稿人", materials: ["初稿 PDF", "图表与引用", "实验补充", "审稿意见"], note: "提交初稿并完成内部评审，形成可执行的修改清单。" },
      { group: "迭代", title: "审稿意见与返修审批", owner: "负责人", status: "waiting", executor: "罗起宁", approver: "检查人/指导人", materials: ["修改稿", "回复信", "补实验结果", "版本差异"], note: "逐条回应审稿意见，完成补实验、返修和格式检查。" },
      { group: "交付", title: "投稿材料终审", owner: "负责人", status: "waiting", executor: "罗起宁", approver: "秦老师", materials: ["最终稿件", "投稿会议/期刊", "作者信息", "投稿凭证"], note: "老师终审通过后提交投稿，并记录期刊/会议、语言和投稿回执。" },
      { group: "归档", title: "论文成果归档", owner: "负责人", status: "waiting", executor: "罗起宁", approver: "系统记录", materials: ["论文最终版", "代码与实验包", "审稿记录", "复盘模板"], note: "归档最终论文、代码、实验复现包和审稿记录，沉淀可复用经验。" },
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
  { key: "kanban", title: "看板节点流" },
  { key: "trello", title: "卡片看板" },
  { key: "gantt", title: "甘特里程碑" },
];

const availableProjectViewItems: Array<{ key: ProjectViewKey; title: string }> = [
  { key: "dashboard", title: "监督仪表盘" },
  ...projectViewItems,
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
    task_id: -201,
    project_id: -101,
    project_name: "实验室项目管理台优化",
    project_tags: "开发 前端 工作台",
    parent_task_id: null,
    title: "完成项目列表首屏信息架构调整",
    description: "确认项目状态、负责人、进度和风险提示在首屏的展示优先级。",
    status: "in_progress",
    priority: "high",
    assignee_open_id: "sample_fe",
    planned_start_date: addDaysIso(-4),
    due_date: addDaysIso(2),
    today_todo_date: addDaysIso(0),
    thinking: "先完成核心卡片，再补充筛选和空状态。",
    progress_draft: "已完成列表结构和状态筛选，正在调整任务展开区域。",
    task_origin: "manual",
    received_at: addDaysIso(-3),
    completed_at: null,
    created_by: "sample_owner",
    created_at: addDaysIso(-4),
    updated_at: nowIso,
  },
  {
    task_id: -202,
    project_id: -101,
    project_name: "实验室项目管理台优化",
    project_tags: "开发 前端 工作台",
    parent_task_id: null,
    title: "补充移动端项目筛选交互",
    description: "在手机宽度下验证筛选抽屉、项目标签和任务列表的可操作性。",
    status: "todo",
    priority: "medium",
    assignee_open_id: "sample_owner",
    planned_start_date: addDaysIso(1),
    due_date: addDaysIso(6),
    today_todo_date: null,
    thinking: null,
    progress_draft: null,
    task_origin: "manual",
    received_at: null,
    completed_at: null,
    created_by: "sample_owner",
    created_at: addDaysIso(-1),
    updated_at: nowIso,
  },
  {
    task_id: -203,
    project_id: -101,
    project_name: "实验室项目管理台优化",
    project_tags: "开发 前端 工作台",
    parent_task_id: null,
    title: "确认接口字段与前端展示映射",
    description: "核对项目详情、成员和任务接口的字段命名，避免上线后出现空数据显示。",
    status: "done",
    priority: "high",
    assignee_open_id: "sample_algo",
    planned_start_date: addDaysIso(-9),
    due_date: addDaysIso(-5),
    today_todo_date: null,
    thinking: null,
    progress_draft: "已完成字段清单和前端类型同步。",
    task_origin: "manual",
    received_at: addDaysIso(-8),
    completed_at: addDaysIso(-5),
    created_by: "sample_owner",
    created_at: addDaysIso(-9),
    updated_at: addDaysIso(-5),
  },
  {
    task_id: -204,
    project_id: -102,
    project_name: "科研成果材料整理",
    project_tags: "科研 材料",
    parent_task_id: null,
    title: "整理论文与会议纪要目录",
    description: "建立统一的材料命名规则，并为每份材料补充项目关联和负责人。",
    status: "todo",
    priority: "medium",
    assignee_open_id: "sample_algo",
    planned_start_date: addDaysIso(0),
    due_date: addDaysIso(8),
    today_todo_date: addDaysIso(0),
    thinking: "先按项目建立目录，再逐项补充元数据。",
    progress_draft: null,
    task_origin: "manual",
    received_at: null,
    completed_at: null,
    created_by: "sample_algo",
    created_at: addDaysIso(-2),
    updated_at: nowIso,
  },
  {
    task_id: -205,
    project_id: -102,
    project_name: "科研成果材料整理",
    project_tags: "科研 材料",
    parent_task_id: null,
    title: "确认历史材料缺失清单",
    description: "部分会议纪要尚未找到原始文件，需要确认补录来源。",
    status: "blocked",
    priority: "high",
    assignee_open_id: "sample_owner",
    planned_start_date: addDaysIso(-1),
    due_date: addDaysIso(3),
    today_todo_date: addDaysIso(0),
    thinking: "等待项目负责人确认旧材料存放位置。",
    progress_draft: "已标记 3 份缺失材料，待确认归档位置。",
    task_origin: "chat_ai",
    received_at: addDaysIso(-1),
    completed_at: null,
    created_by: "sample_owner",
    created_at: addDaysIso(-1),
    updated_at: nowIso,
  },
  {
    task_id: -206,
    project_id: -103,
    project_name: "竞赛报名与材料提交",
    project_tags: "竞赛 材料",
    parent_task_id: null,
    title: "完成最终提交材料归档",
    description: "保存已提交版本、回执截图和复盘记录。",
    status: "done",
    priority: "medium",
    assignee_open_id: "sample_fe",
    planned_start_date: addDaysIso(-12),
    due_date: addDaysIso(-2),
    today_todo_date: null,
    thinking: null,
    progress_draft: "材料和提交回执已归档。",
    task_origin: "manual",
    received_at: addDaysIso(-11),
    completed_at: addDaysIso(-2),
    created_by: "sample_fe",
    created_at: addDaysIso(-12),
    updated_at: addDaysIso(-2),
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

const getStageApprovalLogByTitle = (logs: ProjectLog[], stageTitle?: string) => {
  if (!stageTitle) return undefined;
  return logs.find((log) =>
    log.kind === "paper_stage"
    && log.resource_type === "stage_approval"
    && (log.old_value === stageTitle || log.title.includes(stageTitle)),
  );
};

const getStageApprovalVisualStatus = (
  logs: ProjectLog[],
  stageTitle: string | undefined,
  fallbackStatus: PaperApprovalStepStatus,
): StageApprovalVisualStatus => {
  const log = getStageApprovalLogByTitle(logs, stageTitle);
  if (log?.status === "approved") return "approved";
  if (log?.status === "rejected") return "rejected";
  if (log?.status === "pending_approval" || log?.status === "pending" || log?.status === "notified") return "pending";
  return fallbackStatus;
};

const getStandardApprovalSnapshot = (project: Project, logs: ProjectLog[] = []): PaperApprovalSnapshot | undefined => {
  const category = getProjectCategory(project);
  if (category === "all") return undefined;
  const template = standardApprovalTemplates[category];
  let unlocked = true;
  const steps: PaperApprovalStep[] = template.map((step, index) => {
    const approvalLog = getStageApprovalLogByTitle(logs, step.title);
    if (unlocked && approvalLog?.status === "approved") {
      return {
        ...step,
        status: "done",
        executor: step.executor === "负责人" ? (project.owner_open_id ? "项目负责人" : step.executor) : step.executor,
        startedAt: approvalLog.created_at || addDaysIso(index * 2 - template.length),
        completedAt: approvalLog.approved_at || approvalLog.updated_at || approvalLog.created_at || addDaysIso(index * 2 - template.length + 1),
      };
    }
    if (unlocked) {
      unlocked = false;
      return {
        ...step,
        status: "current",
        executor: step.executor === "负责人" ? (project.owner_open_id ? "项目负责人" : step.executor) : step.executor,
        startedAt: approvalLog?.created_at || project.updated_at || project.created_at,
        completedAt: undefined,
      };
    }
    return {
      ...step,
      status: "waiting",
      executor: step.executor === "负责人" ? (project.owner_open_id ? "项目负责人" : step.executor) : step.executor,
      startedAt: undefined,
      completedAt: undefined,
    };
  });
  const allApproved = steps.every((step) => step.status === "done");
  const currentStep = steps.find((step) => step.status === "current") || steps[steps.length - 1];
  return {
    projectId: project.project_id,
    title: `${category}标准审批流程`,
    paperTitle: project.name,
    status: allApproved ? "APPROVED" : "PENDING",
    currentNode: allApproved ? `${currentStep.title}已通过` : currentStep.title,
    currentApprover: allApproved ? "流程完成" : (currentStep.approver || currentStep.owner),
    applicant: "项目负责人",
    department: project.department || "未设置",
    guide: allApproved ? "流程完成" : (currentStep.approver || currentStep.owner),
    submitted: logs.length > 0,
    documentUrl: "",
    summary: `${category}项目会自动关联该方向的标准节点与审批流程；阶段只有在上一个阶段审批通过后才会进入下一阶段。`,
    formItems: [
      { label: "项目分类", value: category },
      { label: "项目名称", value: project.name },
      { label: "所属部门", value: project.department || "未设置" },
      { label: "当前节点", value: allApproved ? "全部阶段已通过" : currentStep.title },
    ],
    stages: template.map((step) => ({
      title: step.title,
      items: [
        `节点：${(categoryStageTemplates[category].find((stage) => stage.title === step.title)?.nodes || []).join("、")}`,
        `标准检查项：${(step.materials || []).slice(0, 3).join("、") || "待补充"}`,
      ],
    })),
    steps,
  };
};

const getProjectApprovalSnapshot = (project: Project) =>
  getPaperApprovalSnapshot(project.project_id) || getStandardApprovalSnapshot(project, []);

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

type NavIconName = "projects" | "tasks" | "approvals" | "table" | "kanban" | "gantt" | "status" | "type" | "user" | "settings";

const NavIcon = ({ name }: { name: NavIconName }) => {
  const common = {
    width: 21,
    height: 21,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  const paths: Record<NavIconName, JSX.Element> = {
    projects: (
      <>
        <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h3L12 6.5h5.5A2.5 2.5 0 0 1 20 9v8.5a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5z" />
        <path d="M8 12h8M8 16h5" />
      </>
    ),
    tasks: (
      <>
        <path d="M9 6h11M9 12h11M9 18h11" />
        <path d="m4 6 1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2" />
      </>
    ),
    approvals: (
      <>
        <path d="M7 4h10l3 3v13H4V4z" />
        <path d="M16 4v4h4M8 13l2.2 2.2L16 9.5" />
      </>
    ),
    table: (
      <>
        <rect x="4" y="5" width="16" height="14" rx="2" />
        <path d="M4 10h16M9 5v14" />
      </>
    ),
    kanban: (
      <>
        <rect x="4" y="5" width="5" height="14" rx="1.5" />
        <rect x="10.5" y="5" width="4" height="9" rx="1.5" />
        <rect x="16" y="5" width="4" height="12" rx="1.5" />
      </>
    ),
    gantt: (
      <>
        <path d="M5 6h4M5 12h8M5 18h13" />
        <path d="M14 6h5M16 12h3" />
      </>
    ),
    status: (
      <>
        <path d="M12 4v16M4 12h16" />
        <circle cx="12" cy="12" r="8" />
      </>
    ),
    type: (
      <>
        <path d="M5 5h6v6H5zM13 5h6v6h-6zM5 13h6v6H5zM13 13h6v6h-6z" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 20a7 7 0 0 1 14 0" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.05.05-2.12 2.12-.05-.05a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.02 1.55V20h-3v-.08A1.7 1.7 0 0 0 10.7 18.37a1.7 1.7 0 0 0-1.88.34l-.05.05-2.12-2.12.05-.05A1.7 1.7 0 0 0 7.04 15a1.7 1.7 0 0 0-1.55-1.02H5.4v-3h.08A1.7 1.7 0 0 0 7.03 9.96a1.7 1.7 0 0 0-.34-1.88l-.05-.05L8.76 5.9l.05.05a1.7 1.7 0 0 0 1.88.34A1.7 1.7 0 0 0 11.72 4.7V4.6h3v.08a1.7 1.7 0 0 0 1.02 1.55 1.7 1.7 0 0 0 1.88-.34l.05-.05 2.12 2.12-.05.05a1.7 1.7 0 0 0-.34 1.88 1.7 1.7 0 0 0 1.55 1.02h.08v3h-.08A1.7 1.7 0 0 0 19.4 15Z" />
      </>
    ),
  };
  return <svg {...common}>{paths[name]}</svg>;
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



const ProjectListPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { me } = useAuth();
  const focusTimerRef = useRef<Record<number, number>>({});
  const memberOpenIdFilter = searchParams.get("member_open_id") || undefined;
  const initialWorkMode: WorkMode = location.pathname === "/approvals" || searchParams.get("mode") === "approvals"
    ? "approvals"
    : searchParams.get("mode") === "tasks" ? "tasks" : "projects";
  const [workMode, setWorkMode] = useState<WorkMode>(initialWorkMode);
  const [projectView, setProjectView] = useState<ProjectViewKey>("trello");
  const [approvalFlowProjectId, setApprovalFlowProjectId] = useState<number | null>(null);
  const [approvalFlowStageIndex, setApprovalFlowStageIndex] = useState<number | null>(null);
  const [trelloStageTarget, setTrelloStageTarget] = useState<{ projectId: number; stageIndex: number } | null>(null);
  const [trelloStagePosition, setTrelloStagePosition] = useState<{ top: number; left: number } | null>(null);
  const [trelloEditingProjectId, setTrelloEditingProjectId] = useState<number | null>(null);
  const [trelloEditDraft, setTrelloEditDraft] = useState({ name: "", description: "", owner_open_id: "", priority: "medium" as ProjectPriority, project_type: "team" as ProjectType });
  const [trelloSavingProjectId, setTrelloSavingProjectId] = useState<number | null>(null);
  const trelloMaterialPopoverRef = useRef<HTMLElement | null>(null);
  const trelloPopoverDragRef = useRef<{ startX: number; startY: number; startTop: number; startLeft: number } | null>(null);

  const handleTrelloPopoverPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (!trelloStagePosition || (event.target as HTMLElement).closest("button")) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    trelloPopoverDragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      startTop: trelloStagePosition.top,
      startLeft: trelloStagePosition.left,
    };
  };

  const handleTrelloPopoverPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = trelloPopoverDragRef.current;
    const popover = trelloMaterialPopoverRef.current;
    if (!drag || !popover) return;
    const margin = 16;
    const maxTop = Math.max(88, window.innerHeight - popover.offsetHeight - margin);
    const maxLeft = Math.max(margin, window.innerWidth - popover.offsetWidth - margin);
    setTrelloStagePosition({
      top: Math.min(Math.max(drag.startTop + event.clientY - drag.startY, 88), maxTop),
      left: Math.min(Math.max(drag.startLeft + event.clientX - drag.startX, margin), maxLeft),
    });
  };

  const handleTrelloPopoverPointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    trelloPopoverDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
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
  const [savingStageApprovalKey, setSavingStageApprovalKey] = useState<string | null>(null);
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
  const [projectPersonPicker, setProjectPersonPicker] = useState<{ projectId: number; mode: "owner" | "member"; replaceOpenId?: string } | null>(null);
  const [projectPersonQuery, setProjectPersonQuery] = useState("");
  const [savingProjectPersonKey, setSavingProjectPersonKey] = useState<string | null>(null);
  const [stageApprovalComposer, setStageApprovalComposer] = useState<{ projectId: number; stageTitle: string; stepIndex: number } | null>(null);
  const [stageApprovalDrafts, setStageApprovalDrafts] = useState<Record<string, { approverOpenId: string; extraApproverOpenIds: string[]; mode: "single" | "joint" }>>({});
  const [approvalRules, setApprovalRules] = useState<ApprovalRule[]>([]);
  useEffect(() => {
    listApprovalRules().then(setApprovalRules).catch(() => setApprovalRules([]));
  }, []);
  const [stageCheckDrafts, setStageCheckDrafts] = useState<Record<string, { checked?: boolean; text?: string; link?: string; memberOpenId?: string; members?: string[] }>>({});
  const stageCheckDraftsRef = useRef<Record<string, { checked?: boolean; text?: string; link?: string; memberOpenId?: string; members?: string[] }>>({});
  const stageChecksLoadedRef = useRef<Record<number, boolean>>({});
  const stageCheckSaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [projectStageItems, setProjectStageItems] = useState<Record<number, Record<string, string[]>>>({});
  const [approvalScope, setApprovalScope] = useState<"mine" | "all">("mine");
  const [projectCreateDialogOpen, setProjectCreateDialogOpen] = useState(false);
  const [projectCreateDialogKey, setProjectCreateDialogKey] = useState(0);
  const [projectReloadVersion, setProjectReloadVersion] = useState(0);

  const openProjectCreateWindow = () => {
    setProjectCreateDialogKey((prev) => prev + 1);
    setProjectCreateDialogOpen(true);
  };

  const switchWorkMode = (mode: WorkMode) => {
    setWorkMode(mode);
    if (mode === "approvals") {
      if (location.pathname !== "/approvals") navigate("/approvals");
    } else if (location.pathname === "/approvals") {
      navigate("/projects");
    }
  };
  const [selectedApprovalStepKey, setSelectedApprovalStepKey] = useState<string | null>(null);
  const [identityViewMode, setIdentityViewMode] = useState<"manager" | "employee">("manager");

  useEffect(() => {
    if (location.pathname === "/approvals" || searchParams.get("mode") === "approvals") setWorkMode("approvals");
    else if (searchParams.get("mode") === "tasks") setWorkMode("tasks");
    else if (location.pathname === "/projects") setWorkMode("projects");
  }, [location.pathname, location.search, searchParams]);

  useEffect(() => {
    if (!trelloStageTarget || !trelloStagePosition || !trelloMaterialPopoverRef.current) return undefined;
    const clampPopover = () => {
      const popover = trelloMaterialPopoverRef.current;
      if (!popover) return;
      const margin = 16;
      const minTop = 88;
      const maxTop = Math.max(minTop, window.innerHeight - popover.offsetHeight - margin);
      const maxLeft = Math.max(margin, window.innerWidth - popover.offsetWidth - margin);
      const nextPosition = {
        top: Math.min(Math.max(trelloStagePosition.top, minTop), maxTop),
        left: Math.min(Math.max(trelloStagePosition.left, margin), maxLeft),
      };
      if (nextPosition.top !== trelloStagePosition.top || nextPosition.left !== trelloStagePosition.left) {
        setTrelloStagePosition(nextPosition);
      }
    };
    const frame = window.requestAnimationFrame(clampPopover);
    window.addEventListener("resize", clampPopover);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", clampPopover);
    };
  }, [trelloStageTarget, trelloStagePosition]);

  useEffect(() => {
    const handleProjectCreateMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const payload = event.data as { type?: string } | null;
      if (!payload?.type?.startsWith("insight-project-create:")) return;
      if (payload.type === "insight-project-create:close") {
        setProjectCreateDialogOpen(false);
        return;
      }
      if (payload.type === "insight-project-create:created") {
        setProjectCreateDialogOpen(false);
        setProjectReloadVersion((prev) => prev + 1);
      }
    };
    window.addEventListener("message", handleProjectCreateMessage);
    return () => {
      window.removeEventListener("message", handleProjectCreateMessage);
      Object.values(focusTimerRef.current).forEach((timerId) => window.clearTimeout(timerId));
    };
  }, []);

  const isManager = me?.role === "admin" || me?.role === "staff";
  const canManagePermissions = me?.role === "admin" || !!me?.is_super_admin;

  const canDeleteProject = (project: Project): boolean => {
    if (!me) return false;
    return (
      me.open_id === project.owner_open_id
      || (equalAccessOpenIds.has(me.open_id) && equalAccessOpenIds.has(project.owner_open_id))
      || (project.project_type === "team" && isManager)
    );
  };

  const replaceProjectEverywhere = (project: Project) => {
    setProjects((prev) => prev.map((item) => (item.project_id === project.project_id ? project : item)));
    setProjectHistory((prev) => prev.map((item) => (item.project_id === project.project_id ? project : item)));
    setExpandedProjects((prev) => ({ ...prev, [project.project_id]: project }));
    setProjectMemberDraftFromDetail(project.project_id, project.members || []);
  };

  const getActiveProjectMembers = (project: Project) => {
    const detail = expandedProjects[project.project_id];
    return (detail?.members || project.members || []).filter((member) => !member.left_at);
  };

  const openProjectPersonPicker = (projectId: number, mode: "owner" | "member", replaceOpenId?: string) => {
    setProjectPersonQuery("");
    setProjectPersonPicker({ projectId, mode, replaceOpenId });
  };

  const closeProjectPersonPicker = () => {
    setProjectPersonPicker(null);
    setProjectPersonQuery("");
  };

  const selectProjectPerson = async (project: Project, memberOpenId: string) => {
    if (!projectPersonPicker || projectPersonPicker.projectId !== project.project_id) return;
    const mode = projectPersonPicker.mode;
    const replaceOpenId = projectPersonPicker.replaceOpenId;
    const key = `${project.project_id}:${mode}:${replaceOpenId || "new"}:${memberOpenId}`;
    const activeMembers = getActiveProjectMembers(project);
    const activeMemberIds = new Set(activeMembers.map((member) => member.member_open_id));

    if (mode === "member" && memberOpenId === project.owner_open_id) {
      Toast.show({ icon: "fail", content: "负责人已在项目中" });
      return;
    }
    if (mode === "member" && activeMemberIds.has(memberOpenId) && memberOpenId !== replaceOpenId) {
      Toast.show({ icon: "fail", content: "该成员已在项目中" });
      return;
    }
    if (mode === "owner" && memberOpenId === project.owner_open_id) {
      closeProjectPersonPicker();
      return;
    }

    setSavingProjectPersonKey(key);
    try {
      if (project.project_id < 0) {
        const memberRow: ProjectMember = {
          member_open_id: memberOpenId,
          role: mode === "owner" ? "owner" : "member",
          share_ratio: 0,
          tags: mode === "owner" ? "负责人" : "快捷调整",
          joined_at: new Date().toISOString().slice(0, 10),
          left_at: null,
        };
        const nextMembers = activeMembers
          .filter((member) => member.member_open_id !== replaceOpenId && member.member_open_id !== memberOpenId)
          .map((member) => mode === "owner" && member.member_open_id === project.owner_open_id ? { ...member, role: "member" as PMRole } : member);
        replaceProjectEverywhere({
          ...project,
          owner_open_id: mode === "owner" ? memberOpenId : project.owner_open_id,
          members: mode === "owner" ? [memberRow, ...nextMembers] : [...nextMembers, memberRow],
          updated_at: new Date().toISOString(),
        });
        Toast.show({ icon: "success", content: mode === "owner" ? "负责人已更新" : replaceOpenId ? "成员已替换" : "成员已添加" });
        closeProjectPersonPicker();
        return;
      }

      if (mode === "owner") {
        const updated = await updateProject(project.project_id, { owner_open_id: memberOpenId });
        replaceProjectEverywhere(updated);
        await refreshProjectLogs(project.project_id);
        Toast.show({ icon: "success", content: "负责人已更新" });
      } else {
        if (replaceOpenId && replaceOpenId !== memberOpenId) {
          await addProjectMember(project.project_id, {
            member_open_id: memberOpenId,
            role: "member",
            share_ratio: 0,
            tags: "快捷替换",
          });
          await removeProjectMember(project.project_id, replaceOpenId);
        } else {
          await addProjectMember(project.project_id, {
            member_open_id: memberOpenId,
            role: "member",
            share_ratio: 0,
            tags: "快捷添加",
          });
        }
        const detail = await getProject(project.project_id);
        replaceProjectEverywhere(detail);
        await refreshProjectLogs(project.project_id);
        Toast.show({ icon: "success", content: replaceOpenId ? "成员已替换" : "成员已添加" });
      }
      closeProjectPersonPicker();
    } catch {
      Toast.show({ icon: "fail", content: mode === "owner" ? "负责人更新失败" : "成员调整失败" });
    } finally {
      setSavingProjectPersonKey(null);
    }
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

  const focusProjectId = Number(searchParams.get("focus_project_id"));

  useEffect(() => {
    if (workMode !== "projects" || loading || !focusProjectId) return undefined;
    const target = [...projects, ...projectHistory].find((project) => project.project_id === focusProjectId);
    if (!target) return undefined;
    setProjectView("trello");
    setHighlightProjectId(target.project_id);
    const timer = window.setTimeout(() => {
      document.getElementById(`project-card-${target.project_id}`)?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    }, 120);
    const clearTimer = window.setTimeout(() => setHighlightProjectId((current) => (current === target.project_id ? null : current)), 2200);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(clearTimer);
    };
  }, [focusProjectId, loading, projectHistory, projects, workMode]);

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

  const loadProjectLogsIfNeeded = (projectId: number) => {
    loadStageChecksIfNeeded(projectId);
    if (projectId < 0 || projectLogs[projectId]) return;
    listProjectLogs(projectId)
      .then((rows) => setProjectLogs((prev) => ({ ...prev, [projectId]: rows })))
      .catch(() => undefined);
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
          loadStageChecksIfNeeded(project.project_id);
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

  const removeTaskLocally = (task: Task) => {
    const updateProjectTaskMeta = (project: Project) => {
      if (project.project_id !== task.project_id) return project;
      return {
        ...project,
        task_count: Math.max(0, project.task_count - 1),
        task_done_count: Math.max(0, project.task_done_count - (task.status === "done" ? 1 : 0)),
      };
    };

    startTransition(() => {
      setTasks((prev) => prev.filter((item) => item.task_id !== task.task_id));
      setHistoryTasks((prev) => prev.filter((item) => item.task_id !== task.task_id));
      setProjectTasks((prev) => {
        if (!task.project_id || !prev[task.project_id]) return prev;
        return {
          ...prev,
          [task.project_id]: prev[task.project_id].filter((item) => item.task_id !== task.task_id),
        };
      });
      setProjects((prev) => prev.map(updateProjectTaskMeta));
      setProjectHistory((prev) => prev.map(updateProjectTaskMeta));
      setTaskLogs((prev) => {
        if (!(task.task_id in prev)) return prev;
        const next = { ...prev };
        delete next[task.task_id];
        return next;
      });
      setFocusSummaries((prev) => {
        if (!(task.task_id in prev)) return prev;
        const next = { ...prev };
        delete next[task.task_id];
        return next;
      });
      setFocusSessions((prev) => {
        if (!(task.task_id in prev)) return prev;
        const next = { ...prev };
        delete next[task.task_id];
        return next;
      });
      setExpandedFinishTaskIds((prev) => {
        if (!(task.task_id in prev)) return prev;
        const next = { ...prev };
        delete next[task.task_id];
        return next;
      });
      if (expandedTaskId === task.task_id) setExpandedTaskId(null);
      if (expandedProjectTaskId === task.task_id) setExpandedProjectTaskId(null);
    });
  };

  const handleDeleteTask = (task: Task) => {
    Dialog.confirm({
      title: "删除任务",
      content: `确认删除任务「${task.title}」? 此操作不可撤销.`,
      confirmText: "删除",
      cancelText: "取消",
      onConfirm: async () => {
        const snapshot = {
          tasks,
          historyTasks,
          projectTasks,
          projects,
          projectHistory,
          taskLogs,
          focusSummaries,
          focusSessions,
          expandedFinishTaskIds,
          expandedTaskId,
          expandedProjectTaskId,
        };
        setDeletingTaskId(task.task_id);
        removeTaskLocally(task);
        try {
          await deleteTask(task.task_id);
          Toast.show({ icon: "success", content: "任务已删除" });
        } catch (err) {
          const status = (err as { response?: { status?: number } })?.response?.status;
          if (status === 404) {
            Toast.show({ icon: "success", content: "任务已删除" });
            return;
          }
          startTransition(() => {
            setTasks(snapshot.tasks);
            setHistoryTasks(snapshot.historyTasks);
            setProjectTasks(snapshot.projectTasks);
            setProjects(snapshot.projects);
            setProjectHistory(snapshot.projectHistory);
            setTaskLogs(snapshot.taskLogs);
            setFocusSummaries(snapshot.focusSummaries);
            setFocusSessions(snapshot.focusSessions);
            setExpandedFinishTaskIds(snapshot.expandedFinishTaskIds);
            setExpandedTaskId(snapshot.expandedTaskId);
            setExpandedProjectTaskId(snapshot.expandedProjectTaskId);
          });
          const msg = status === 403 ? "无权删除该任务" : "删除失败";
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
  }, [projectReloadVersion]);

  useEffect(() => {
    if (workMode !== "approvals" || projectHistory.length === 0) return undefined;
    const candidates = projectHistory
      .filter((project) => project.project_id > 0 && !projectLogs[project.project_id])
      .slice(0, 120);
    if (candidates.length === 0) {
      setLoading(false);
      return undefined;
    }
    let active = true;
    setLoading(true);
    Promise.all(candidates.map(async (project) => [project.project_id, await listProjectLogs(project.project_id)] as const))
      .then((rows) => {
        if (!active) return;
        setProjectLogs((prev) => ({
          ...prev,
          ...rows.reduce<Record<number, ProjectLog[]>>((acc, [projectId, logs]) => {
            acc[projectId] = logs;
            return acc;
          }, {}),
        }));
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [projectHistory, projectLogs, workMode]);

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
        unique.slice(0, 60).forEach((project) => loadProjectLogsIfNeeded(project.project_id));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [activeKey, isManager, memberOpenIdFilter, projectReloadVersion, projectTypeFilter, workMode]);

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

  const renderMemberAvatar = (member?: Member, fallbackName?: string, size = 24) => (
    member?.open_id ? (
      <MemberAvatarLink
        openId={member.open_id}
        viewerOpenId={me?.open_id}
        src={member.avatar_url}
        name={member.name || fallbackName || "成员"}
        size={size}
      />
    ) : (
      <Avatar src={member?.avatar_url} name={member?.name || fallbackName || "成员"} size={size} />
    )
  );

  const formatDuration = (start?: string | null, end?: string | null) => {
    if (!start) return "未记录";
    const startMs = new Date(start).getTime();
    const endMs = end ? new Date(end).getTime() : Date.now();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return "未记录";
    const minutes = Math.max(1, Math.round((endMs - startMs) / 60000));
    if (minutes < 60) return `${minutes} 分钟`;
    if (minutes < 1440) return `${Math.round(minutes / 60)} 小时`;
    return `${Math.round(minutes / 1440)} 天`;
  };

  const describeProjectLogActivity = (log: ProjectLog) => {
    const stageName = log.old_value || log.paper_stage || log.title;
    if (log.resource_type === "stage_approval") {
      if (log.status === "approved") {
        return {
          tone: "success",
          title: `${stageName} 审批通过`,
          meta: `${formatDate(log.approved_at || log.updated_at)} · 审批耗时 ${formatDuration(log.created_at, log.approved_at || log.updated_at)}`,
        };
      }
      if (log.status === "rejected") {
        return {
          tone: "danger",
          title: `${stageName} 审批驳回`,
          meta: `${formatDate(log.approved_at || log.updated_at)} · 审批耗时 ${formatDuration(log.created_at, log.approved_at || log.updated_at)}`,
        };
      }
      return {
        tone: "warning",
        title: `${stageName} 发起审批`,
        meta: `${formatDate(log.created_at)} · 已等待 ${formatDuration(log.created_at)}`,
      };
    }
    if (log.kind === "paper_stage") {
      return {
        tone: "primary",
        title: `${stageName} 节点更新`,
        meta: `${formatDate(log.created_at)} · ${log.actor_name || log.actor_open_id}`,
      };
    }
    if (log.kind === "member_change") {
      return {
        tone: "primary",
        title: log.title || "成员变更",
        meta: `${formatDate(log.created_at)} · ${log.actor_name || log.actor_open_id}`,
      };
    }
    return {
      tone: log.status === "approved" ? "success" : log.status === "rejected" ? "danger" : "default",
      title: log.title || log.kind_label || "项目日志",
      meta: `${formatDate(log.created_at)} · ${log.actor_name || log.actor_open_id}`,
    };
  };

  const projectActivityItems = (project: Project, snapshot?: PaperApprovalSnapshot | null) => {
    const logs = (projectLogs[project.project_id] || []).slice(0, 12).map((log) => ({
      key: `log-${log.log_id}`,
      ...describeProjectLogActivity(log),
    }));
    if (logs.length) return logs.slice(0, 4);
    return (snapshot?.steps || [])
      .filter((step) => step.status === "done" || step.status === "current")
      .slice(-4)
      .reverse()
      .map((step, index) => ({
        key: `step-${index}-${step.title}`,
        tone: step.status === "done" ? "success" : "primary",
        title: step.status === "done" ? `${step.title} 已完成` : `${step.title} 进行中`,
        meta: step.status === "done"
          ? `${formatDate(step.completedAt)} · 节点耗时 ${formatDuration(step.startedAt, step.completedAt)}`
          : `${formatDate(step.startedAt)} · 已进行 ${formatDuration(step.startedAt)}`,
      }));
  };

  const renderProjectActivityPanel = (project: Project, snapshot?: PaperApprovalSnapshot | null) => {
    const items = projectActivityItems(project, snapshot);
    return (
      <section className="pm-project-activity-panel">
        <div className="pm-project-mini-head">
          <span>项目动态</span>
          <b>{(projectLogs[project.project_id] || []).length || items.length}</b>
        </div>
        <div className="pm-project-activity-list">
          {items.length ? items.map((item) => (
            <div key={item.key} className="pm-project-activity-item" data-tone={item.tone}>
              <i />
              <div>
                <strong>{item.title}</strong>
                <span>{item.meta}</span>
              </div>
            </div>
          )) : <div className="pm-project-activity-empty">暂无节点日志，阶段流转后会自动沉淀</div>}
        </div>
      </section>
    );
  };

  const renderPersonPickerPopover = (project: Project) => {
    if (!projectPersonPicker || projectPersonPicker.projectId !== project.project_id) return null;
    const keyword = projectPersonQuery.trim().toLowerCase();
    const activeMembers = getActiveProjectMembers(project);
    const activeIds = new Set(activeMembers.map((member) => member.member_open_id));
    const candidates = Object.values(memberMap)
      .filter((member) => {
        if (!keyword) return true;
        return getMemberSearchText(member).includes(keyword);
      })
      .sort((left, right) => (left.name || "").localeCompare(right.name || "", "zh-CN"))
      .slice(0, 40);
    return (
      <div className="pm-person-picker" onClick={(event) => event.stopPropagation()}>
        <div className="pm-person-picker-head">
          <span>{projectPersonPicker.mode === "owner" ? "选择负责人" : projectPersonPicker.replaceOpenId ? "替换成员" : "添加成员"}</span>
          <button type="button" onClick={closeProjectPersonPicker}>×</button>
        </div>
        <input
          value={projectPersonQuery}
          onChange={(event) => setProjectPersonQuery(event.target.value)}
          placeholder="搜索姓名 / 拼音首字母 / 部门"
          autoFocus
        />
        <div className="pm-person-options">
          {candidates.map((member) => {
            const disabled = projectPersonPicker.mode === "member"
              && (member.open_id === project.owner_open_id || (activeIds.has(member.open_id) && member.open_id !== projectPersonPicker.replaceOpenId));
            const selected = member.open_id === project.owner_open_id || member.open_id === projectPersonPicker.replaceOpenId;
            return (
              <button
                key={member.open_id}
                type="button"
                disabled={disabled || savingProjectPersonKey !== null}
                data-selected={selected ? "true" : undefined}
                onClick={() => void selectProjectPerson(project, member.open_id)}
              >
                {renderMemberAvatar(member, member.name, 28)}
                <span>
                  <strong>{member.name || member.open_id}</strong>
                  <small>{member.department || "未设置部门"}{member.title ? ` · ${member.title}` : ""}</small>
                </span>
                {disabled ? <em>已在项目中</em> : null}
              </button>
            );
          })}
          {!candidates.length ? <div className="pm-person-empty">没有匹配成员</div> : null}
        </div>
      </div>
    );
  };

  const renderProjectPeoplePanel = (project: Project, canEdit: boolean) => {
    const activeMembers = getActiveProjectMembers(project);
    const owner = memberMap[project.owner_open_id];
    const participants = activeMembers.filter((member) => member.member_open_id !== project.owner_open_id && member.role !== "owner");
    return (
      <section className="pm-project-people-panel">
        <div className="pm-project-mini-head">
          <span>负责人 / 成员</span>
          <b>1 名负责人 · {participants.length} 名成员</b>
        </div>
        <div className="pm-project-people-editor">
          <div className="pm-people-row">
            <small>负责人</small>
            <button
              className="pm-person-chip"
              type="button"
              disabled={!canEdit}
              title={canEdit ? "点击修改负责人" : "无权限修改负责人"}
              onClick={(event) => {
                event.stopPropagation();
                if (canEdit) openProjectPersonPicker(project.project_id, "owner");
              }}
            >
              {renderMemberAvatar(owner, project.owner_open_id, 28)}
              <span>{owner?.name || project.owner_open_id || "未设置"}</span>
            </button>
          </div>
          <div className="pm-people-row">
            <small>成员</small>
            <div className="pm-member-avatar-row">
              {participants.map((projectMember) => {
                const profile = memberMap[projectMember.member_open_id];
                return (
                  <button
                    key={projectMember.member_open_id}
                    className="pm-person-member-chip"
                    type="button"
                    disabled={!canEdit}
                    title={canEdit ? `替换 ${profile?.name || projectMember.member_open_id}` : profile?.name || projectMember.member_open_id}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (canEdit) openProjectPersonPicker(project.project_id, "member", projectMember.member_open_id);
                    }}
                  >
                    {renderMemberAvatar(profile, projectMember.member_open_id, 28)}
                    <span>{profile?.name || projectMember.member_open_id}</span>
                  </button>
                );
              })}
              <span className="pm-member-count">{participants.length} 人</span>
              <button
                className="pm-person-add-btn"
                type="button"
                disabled={!canEdit}
                title={canEdit ? "添加成员" : "无权限添加成员"}
                onClick={(event) => {
                  event.stopPropagation();
                  if (canEdit) openProjectPersonPicker(project.project_id, "member");
                }}
              >
                +
              </button>
            </div>
          </div>
        </div>
        {renderPersonPickerPopover(project)}
      </section>
    );
  };

  const stageCheckDraftKey = (projectId: number, stepTitle: string, item: string) => `${projectId}:${stepTitle}:${item}`;

  const stageCheckDraftCompleted = (draft: { checked?: boolean; text?: string; link?: string; memberOpenId?: string; members?: string[] }) =>
    Boolean(draft.checked || draft.text?.trim() || draft.link?.trim() || draft.memberOpenId || (draft.members && draft.members.length > 0));

  const loadStageChecksIfNeeded = (projectId: number) => {
    if (projectId < 0 || stageChecksLoadedRef.current[projectId]) return;
    stageChecksLoadedRef.current[projectId] = true;
    listStageChecks(projectId)
      .then((items) => {
        setStageCheckDrafts((prev) => {
          const next = { ...prev };
          for (const item of items) {
            const key = `${projectId}:${item.stage_title}:${item.item_text}`;
            next[key] = { ...(item.payload || {}), checked: item.checked };
          }
          stageCheckDraftsRef.current = next;
          return next;
        });
        const byStage: Record<string, string[]> = {};
        for (const item of items) {
          if (!item.from_template) continue;
          (byStage[item.stage_title] ||= []).push(item.item_text);
        }
        if (Object.keys(byStage).length > 0) {
          setProjectStageItems((prev) => ({ ...prev, [projectId]: byStage }));
        }
      })
      .catch(() => {
        stageChecksLoadedRef.current[projectId] = false;
      });
  };

  const persistStageCheckDraft = (key: string) => {
    const [projectIdRaw, stageTitle, ...rest] = key.split(":");
    const projectId = Number(projectIdRaw);
    const itemText = rest.join(":");
    if (!projectId || projectId < 0 || !stageTitle || !itemText) return;
    const draft = stageCheckDraftsRef.current[key] || {};
    void saveStageChecks(projectId, [{
      stage_title: stageTitle,
      item_text: itemText,
      checked: stageCheckDraftCompleted(draft),
      payload: draft,
    }]).catch(() => undefined);
  };

  const updateStageCheckDraft = (key: string, patch: Partial<{ checked: boolean; text: string; link: string; memberOpenId: string; members: string[] }>) => {
    setStageCheckDrafts((prev) => {
      const next = { ...prev, [key]: { ...(prev[key] || {}), ...patch } };
      stageCheckDraftsRef.current = next;
      return next;
    });
    if (stageCheckSaveTimers.current[key]) clearTimeout(stageCheckSaveTimers.current[key]);
    stageCheckSaveTimers.current[key] = setTimeout(() => persistStageCheckDraft(key), 800);
  };

  const inferStageCheckControl = (item: string) => {
    if (/报名/.test(item)) return "registration";
    if (/队友|队员|成员|作者|负责人|指导人|验收人|维护人|责任人/.test(item)) return "person";
    if (/链接|地址|入口|仓库|系统|平台/.test(item)) return "link";
    if (/截图|凭证|回执|证明|附件/.test(item)) return "evidence";
    if (/说明|总结|复盘|意见|问题|风险|清单|记录|日志|反馈/.test(item)) return "note";
    if (/是否|已确认|已完成|已明确|已确定|已通过|已跑通|已上传|已上线|已留存|已归档|已建立|已补齐|已关闭/.test(item)) return "check";
    return "text";
  };

  const renderStageCheckControl = (projectId: number, stepTitle: string, item: string, readonly: boolean, done: boolean) => {
    const key = stageCheckDraftKey(projectId, stepTitle, item);
    const draft = stageCheckDrafts[key] || {};
    const control = inferStageCheckControl(item);
    if (readonly) {
      return (
        <div className="pm-stage-check-readonly">
          <span>{done ? "已完成" : "待确认"}</span>
          <b>{done ? "系统记录已满足该项" : "暂无完成记录"}</b>
        </div>
      );
    }
    if (control === "registration") {
      return (
        <div className="pm-stage-check-control" data-control="registration">
          <label className="pm-stage-check-toggle">
            <input type="checkbox" checked={Boolean(draft.checked)} onChange={(event) => updateStageCheckDraft(key, { checked: event.target.checked })} />
            <span>已完成报名</span>
          </label>
          <input value={draft.text || ""} onChange={(event) => updateStageCheckDraft(key, { text: event.target.value })} placeholder="队伍名称 / 报名编号" />
        </div>
      );
    }
    if (control === "person") {
      return (
        <div className="pm-stage-check-control" data-control="person">
          <select value={draft.memberOpenId || ""} onChange={(event) => updateStageCheckDraft(key, { memberOpenId: event.target.value })}>
            <option value="">选择成员</option>
            {memberOptions.map((member) => <option key={member.openId} value={member.openId}>{member.name}</option>)}
          </select>
          <input value={draft.text || ""} onChange={(event) => updateStageCheckDraft(key, { text: event.target.value })} placeholder="角色 / 分工说明" />
        </div>
      );
    }
    if (control === "link") {
      return (
        <div className="pm-stage-check-control" data-control="link">
          <input type="url" value={draft.link || ""} onChange={(event) => updateStageCheckDraft(key, { link: event.target.value })} placeholder="粘贴链接 / 地址" />
        </div>
      );
    }
    if (control === "evidence") {
      return (
        <div className="pm-stage-check-control" data-control="evidence">
          <label className="pm-upload-btn">
            <input type="file" />
            <span>补充截图/附件</span>
          </label>
          <input value={draft.text || ""} onChange={(event) => updateStageCheckDraft(key, { text: event.target.value })} placeholder="凭证编号 / 简要说明" />
        </div>
      );
    }
    if (control === "note") {
      return (
        <div className="pm-stage-check-control" data-control="note">
          <textarea value={draft.text || ""} onChange={(event) => updateStageCheckDraft(key, { text: event.target.value })} placeholder="填写结论、问题或说明" />
        </div>
      );
    }
    if (control === "check") {
      return (
        <div className="pm-stage-check-control" data-control="check">
          <label className="pm-stage-check-toggle">
            <input type="checkbox" checked={Boolean(draft.checked)} onChange={(event) => updateStageCheckDraft(key, { checked: event.target.checked })} />
            <span>已确认</span>
          </label>
        </div>
      );
    }
    return (
      <div className="pm-stage-check-control" data-control="text">
        <input value={draft.text || ""} onChange={(event) => updateStageCheckDraft(key, { text: event.target.value })} placeholder="填写结果" />
      </div>
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

  const stageApprovalLog = (projectId: number, stageTitle?: string) => {
    if (!stageTitle) return undefined;
    return (projectLogs[projectId] || []).find((log) =>
      log.kind === "paper_stage"
      && log.resource_type === "stage_approval"
      && (log.old_value === stageTitle || log.title.includes(stageTitle)),
    );
  };

  const stageApprovalStatus = (project: Project, stageTitle: string | undefined, fallbackStatus: PaperApprovalStepStatus) => {
    return getStageApprovalVisualStatus(projectLogs[project.project_id] || [], stageTitle, fallbackStatus);
  };

  const getProjectApprovalSnapshotForProject = (project: Project) =>
    getPaperApprovalSnapshot(project.project_id) || getStandardApprovalSnapshot(project, projectLogs[project.project_id] || []);

  const refreshProjectLogs = async (projectId: number) => {
    if (projectId < 0) return;
    const rows = await listProjectLogs(projectId);
    setProjectLogs((prev) => ({ ...prev, [projectId]: rows }));
  };

  const stageApprovalDraftKey = (projectId: number, stageTitle: string) => `${projectId}:${stageTitle}`;

  const getStageApprovalDraft = (project: Project, stageTitle: string) => {
    const key = stageApprovalDraftKey(project.project_id, stageTitle);
    const saved = stageApprovalDrafts[key];
    if (saved) return saved;
    const category = getProjectCategory(project);
    const matched = approvalRules.find((rule) => rule.enabled && rule.project_category === category && rule.stage_title === stageTitle)
      || approvalRules.find((rule) => rule.enabled && rule.project_category === category && !rule.stage_title);
    if (matched && matched.approver_open_ids.length) {
      return {
        approverOpenId: matched.approver_open_ids[0],
        extraApproverOpenIds: matched.approver_open_ids.slice(1),
        mode: (matched.mode === "all" ? "joint" : "single") as "single" | "joint",
      };
    }
    return { approverOpenId: project.owner_open_id || me?.open_id || "", extraApproverOpenIds: [] as string[], mode: "single" as const };
  };

  const updateStageApprovalDraft = (projectId: number, stageTitle: string, patch: Partial<{ approverOpenId: string; extraApproverOpenIds: string[]; mode: "single" | "joint" }>) => {
    const key = stageApprovalDraftKey(projectId, stageTitle);
    setStageApprovalDrafts((prev) => ({
      ...prev,
      [key]: { approverOpenId: prev[key]?.approverOpenId || "", extraApproverOpenIds: prev[key]?.extraApproverOpenIds || [], mode: prev[key]?.mode || "single", ...patch },
    }));
  };

  const submitStageApproval = async (project: Project, stage: ProjectStageTemplate, step: PaperApprovalStep, index: number) => {
    const key = `${project.project_id}:${stage.title}:submit`;
    const draft = getStageApprovalDraft(project, stage.title);
    if (!draft.approverOpenId) {
      Toast.show({ icon: "fail", content: "请选择审批人" });
      setStageApprovalComposer({ projectId: project.project_id, stageTitle: stage.title, stepIndex: index });
      return;
    }
    const approverOpenIds = [draft.approverOpenId, ...(draft.extraApproverOpenIds || [])]
      .filter((oid, idx, arr) => oid && arr.indexOf(oid) === idx);
    const approvalModeLabel = draft.mode === "joint"
      ? "会签"
      : (draft.extraApproverOpenIds || []).length > 0 ? "或签" : "单人审批";
    const approverName = approverOpenIds.map((oid) => memberMap[oid]?.name || oid).join("、");
    setSavingStageApprovalKey(key);
    try {
      if (project.project_id < 0) {
        const now = new Date().toISOString();
        const mockLog: ProjectLog = {
          log_id: -Date.now(),
          project_id: project.project_id,
          actor_open_id: me?.open_id || "demo",
          actor_name: me?.name || "当前用户",
          kind: "paper_stage",
          kind_label: "阶段审批",
          status: "pending_approval",
          status_label: "待审批",
          title: `${stage.title}阶段审批`,
          body: `申请确认《${project.name}》${stage.title}已完成。\n审批方式：${approvalModeLabel}\n审批人：${approverName}\n节点：${stage.nodes.join("、")}\n流程节点：${step.title}`,
          target_open_id: draft.approverOpenId,
          target_name: approverName,
          approver_open_id: draft.approverOpenId,
          approver_name: approverName,
          resource_type: "stage_approval",
          old_value: stage.title,
          new_value: `${approvalModeLabel}｜${stage.nodes.join("、")}`,
          created_at: now,
          updated_at: now,
        };
        setProjectLogs((prev) => ({ ...prev, [project.project_id]: [mockLog, ...(prev[project.project_id] || [])] }));
        setStageApprovalComposer(null);
        Toast.show({ icon: "success", content: "示例阶段审批已发起" });
        return;
      }
      const created = await createProjectLog(project.project_id, {
        kind: "paper_stage",
        title: `${stage.title}阶段审批`,
        body: `申请确认《${project.name}》${stage.title}已完成。\n审批方式：${approvalModeLabel}\n审批人：${approverName}\n节点：${stage.nodes.join("、")}\n流程节点：${index + 1}. ${step.title}`,
        target_open_id: draft.approverOpenId,
        approver_open_ids: approverOpenIds,
        approval_mode: draft.mode === "joint" ? "all" : "any",
        resource_type: "stage_approval",
        old_value: stage.title,
        new_value: `${approvalModeLabel}｜${stage.nodes.join("、")}`,
        notify_now: true,
      });
      setProjectLogs((prev) => ({ ...prev, [project.project_id]: [created, ...(prev[project.project_id] || [])] }));
      setStageApprovalComposer(null);
      Toast.show({ icon: "success", content: "阶段审批已发起" });
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      Toast.show({ icon: "fail", content: detail || "阶段审批发起失败" });
    } finally {
      setSavingStageApprovalKey(null);
    }
  };

  const canDecideApprovalLog = (project: Project, log: ProjectLog | null | undefined): boolean => {
    if (!log || !me) return false;
    if (log.approvals && log.approvals.length > 0) {
      return log.approvals.some((a) => a.approver_open_id === me.open_id && a.decision === "pending");
    }
    return log.approver_open_id === me.open_id || canDeleteProject(project);
  };

  const decideCenterApproval = async (project: Project, log: ProjectLog, approved: boolean) => {
    if (project.project_id < 0) return;
    try {
      const updated = await decideProjectLog(project.project_id, log.log_id, {
        approved,
        comment: approved ? "同意" : "驳回",
      });
      setProjectLogs((prev) => ({
        ...prev,
        [project.project_id]: (prev[project.project_id] || []).map((item) => item.log_id === updated.log_id ? updated : item),
      }));
      Toast.show({ icon: "success", content: approved ? "已通过" : "已驳回" });
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      Toast.show({ icon: "fail", content: detail || "审批操作失败" });
    }
  };

  const decideStageApproval = async (project: Project, stageTitle: string, approved: boolean) => {
    const log = stageApprovalLog(project.project_id, stageTitle);
    if (!log) return;
    const key = `${project.project_id}:${stageTitle}:${approved ? "approve" : "reject"}`;
    setSavingStageApprovalKey(key);
    try {
      if (project.project_id < 0) {
        const updated: ProjectLog = {
          ...log,
          status: approved ? "approved" : "rejected",
          status_label: approved ? "已通过" : "已驳回",
          approved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        setProjectLogs((prev) => ({
          ...prev,
          [project.project_id]: (prev[project.project_id] || []).map((item) => item.log_id === log.log_id ? updated : item),
        }));
        Toast.show({ icon: "success", content: approved ? "阶段已通过" : "阶段已驳回" });
        return;
      }
      const updated = await decideProjectLog(project.project_id, log.log_id, {
        approved,
        comment: approved ? `${stageTitle}通过` : `${stageTitle}驳回`,
      });
      setProjectLogs((prev) => ({
        ...prev,
        [project.project_id]: (prev[project.project_id] || []).map((item) => item.log_id === updated.log_id ? updated : item),
      }));
      Toast.show({ icon: "success", content: approved ? "阶段已通过" : "阶段已驳回" });
    } catch {
      Toast.show({ icon: "fail", content: "阶段审批处理失败" });
    } finally {
      setSavingStageApprovalKey(null);
    }
  };

  const renderApprovalStepPanel = (project: Project, snapshot: PaperApprovalSnapshot) => {
    const projectId = project.project_id;
    if (!selectedApprovalStepKey?.startsWith(`${projectId}:`)) return null;
    const selectedIndex = Number(selectedApprovalStepKey.split(":")[1]);
    const stepIndex = selectedIndex >= 0 ? selectedIndex : 0;
    const step = snapshot.steps[stepIndex];
    const category = getProjectCategory(project);
    const panelStage = category !== "all" ? categoryStageTemplates[category][stepIndex] : undefined;
    const panelApprovalState = panelStage ? stageApprovalStatus(project, panelStage.title, step.status) : step.status;
    const panelStatusLabel = panelApprovalState === "approved"
      ? "已通过"
      : panelApprovalState === "rejected"
        ? "已驳回"
        : panelApprovalState === "pending"
          ? "待审批"
          : step.status === "current"
            ? "进行中"
            : step.status === "done"
              ? "已完成"
              : "待流转";
    const panelStatusTone = panelApprovalState === "approved"
      ? { bg: "#E8FFEA", fg: "#15803D" }
      : panelApprovalState === "rejected"
        ? { bg: "#FFF1F0", fg: "#F5483B" }
        : panelApprovalState === "pending"
          ? { bg: "#FFF7E8", fg: "#D46B08" }
          : step.status === "current"
            ? { bg: "#E8F3FF", fg: "#1D4ED8" }
            : { bg: "#F2F3F5", fg: "#646A73" };
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
            <div className="pm-muted">{step.group} · {panelStatusLabel}</div>
          </div>
          <div className="pm-approval-panel-actions">
            <div className="pm-muted">{identityViewMode === "employee" ? "员工视角：补充检查项结果和查看自己的任务" : "管理员/指导者视角：查看阶段状态和任务"}</div>
            {renderTag(panelStatusLabel, panelStatusTone)}
          </div>
        </div>
        <div className="pm-approval-panel-grid">
          <div><span>执行人</span><b>{step.executor || "待定"}</b></div>
          <div><span>审批人</span><b>{step.approver || step.owner}</b></div>
          <div><span>开始时间</span><b>{formatDate(step.startedAt)}</b></div>
          <div><span>完成时间</span><b>{step.completedAt ? formatDate(step.completedAt) : panelApprovalState === "pending" ? "审批中" : panelApprovalState === "rejected" ? "已退回修改" : step.status === "current" ? "待提交审批" : "待流转"}</b></div>
        </div>
        <div className="pm-approval-panel-box">
          <div className="pm-section-title">阶段性标准检查项</div>
          <div className="pm-approval-material-table">
            {(((projectStageItems[projectId] || {})[step.title]) || step.materials || ["待补充"]).map((item, materialIndex) => (
              <div key={`${item}-${materialIndex}`} className="pm-approval-material-row">
                <div className="pm-approval-material-name">
                  <span>{materialIndex + 1}</span>
                  <b>{item}</b>
                </div>
                {renderStageCheckControl(projectId, step.title, item, identityViewMode !== "employee", step.status === "done")}
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
      </div>
    );
  };

  const renderPaperApprovalBoard = (project: Project, snapshot: PaperApprovalSnapshot) => {
    const progress = getPaperApprovalProgress(snapshot);
    const currentIndex = snapshot.steps.findIndex((step) => step.status === "current") + 1;
    const boardIndex = currentIndex > 0 ? currentIndex : Math.max(1, snapshot.steps.filter((step) => step.status === "done").length);
    const category = getProjectCategory(project);
    const categoryStages = category === "all" ? [] : categoryStageTemplates[category];
    return (
      <div className="pm-approval-board-row">
        <div className="pm-approval-board">
          <div className="pm-approval-board-head">
              <span>{snapshot.title}</span>
              {renderTag(snapshot.status === "APPROVED" ? "全部通过" : "审批中", snapshot.status === "APPROVED" ? { bg: "#E8FFEA", fg: "#15803D" } : { bg: "#E8F3FF", fg: "#1D4ED8" })}
              <b>{progress}%</b>
              <span>{boardIndex}/{snapshot.steps.length} · {snapshot.currentNode} · {snapshot.currentApprover}</span>
            </div>
          <div className="pm-approval-node-flow">
            {snapshot.steps.map((step, index) => (
              <Fragment key={step.title}>
                {(() => {
                  const stage = categoryStages[index];
                  const approvalState = stageApprovalStatus(project, stage?.title, step.status);
                  const approvalLog = stageApprovalLog(project.project_id, stage?.title);
                  const pendingApproval = approvalLog && ["pending_approval", "pending", "notified"].includes(approvalLog.status);
                  const isUnlockedStage = step.status === "current";
                  const stageKey = stage ? `${project.project_id}:${stage.title}` : "";
                  const draft = stage ? getStageApprovalDraft(project, stage.title) : null;
                  const composerOpen = Boolean(stage && stageApprovalComposer?.projectId === project.project_id && stageApprovalComposer.stageTitle === stage.title);
                  const canApproveStage = Boolean(pendingApproval && canDecideApprovalLog(project, approvalLog));
                  const canSubmitStageApproval = Boolean(stage && isUnlockedStage && !approvalLog);
                  const canResubmitStageApproval = Boolean(stage && isUnlockedStage && approvalState === "rejected");
                  return (
                    <div
                      className="pm-approval-node-wrap"
                      data-status={step.status}
                      data-stage-approval={approvalState}
                      data-selected={selectedApprovalStepKey === approvalStepKey(project.project_id, index)}
                      role="button"
                      tabIndex={0}
                      onClick={(event) => {
                        event.stopPropagation();
                        const key = approvalStepKey(project.project_id, index);
                        setSelectedApprovalStepKey((prev) => prev === key ? null : key);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          const key = approvalStepKey(project.project_id, index);
                          setSelectedApprovalStepKey((prev) => prev === key ? null : key);
                        }
                      }}
                    >
                      <div className="pm-approval-node-group">{stage?.title || step.group}</div>
                      <div className="pm-approval-node">{index + 1}</div>
                      <div className="pm-approval-node-label">{step.title}</div>
                      {stage?.nodes?.length ? (
                        <div className="pm-approval-node-chips">
                          {stage.nodes.map((node) => <span key={`${step.title}-${node}`}>{node}</span>)}
                        </div>
                      ) : null}
                      {stage ? (
                        <div className="pm-stage-approval-actions" onClick={(event) => event.stopPropagation()}>
                          {approvalState === "approved" ? <span className="pm-stage-approval-badge" data-tone="approved">已通过</span> : null}
                          {approvalState === "rejected" ? <span className="pm-stage-approval-badge" data-tone="rejected">已驳回</span> : null}
                          {pendingApproval ? <span className="pm-stage-approval-badge" data-tone="pending">待审批</span> : null}
                          {canSubmitStageApproval ? (
                            <button
                              className="pm-stage-approval-btn"
                              type="button"
                              disabled={savingStageApprovalKey === `${stageKey}:submit`}
                              onClick={() => setStageApprovalComposer({ projectId: project.project_id, stageTitle: stage.title, stepIndex: index })}
                            >
                              发起审批
                            </button>
                          ) : null}
                          {canResubmitStageApproval ? (
                            <button
                              className="pm-stage-approval-btn"
                              type="button"
                              disabled={savingStageApprovalKey === `${stageKey}:submit`}
                              onClick={() => void submitStageApproval(project, stage, step, index)}
                            >
                              重新提交
                            </button>
                          ) : null}
                          {canApproveStage ? (
                            <>
                              <button
                                className="pm-stage-approval-btn"
                                type="button"
                                data-primary="true"
                                disabled={savingStageApprovalKey === `${stageKey}:approve`}
                                onClick={() => void decideStageApproval(project, stage.title, true)}
                              >
                                通过
                              </button>
                              <button
                                className="pm-stage-approval-btn"
                                type="button"
                                disabled={savingStageApprovalKey === `${stageKey}:reject`}
                                onClick={() => void decideStageApproval(project, stage.title, false)}
                              >
                                驳回
                              </button>
                            </>
                          ) : null}
                        </div>
                      ) : null}
                      {stage && composerOpen && draft && isUnlockedStage && !approvalLog ? (
                        <div className="pm-stage-approval-composer" onClick={(event) => event.stopPropagation()}>
                          <label>
                            <span>审批人</span>
                            <select
                              value={draft.approverOpenId}
                              onChange={(event) => updateStageApprovalDraft(project.project_id, stage.title, { approverOpenId: event.target.value })}
                            >
                              <option value="">选择审批人</option>
                              {Object.values(memberMap)
                                .sort((left, right) => (left.name || "").localeCompare(right.name || "", "zh-CN"))
                                .map((member) => (
                                  <option key={member.open_id} value={member.open_id}>{member.name || member.open_id}</option>
                                ))}
                            </select>
                          </label>
                          <label>
                            <span>方式</span>
                            <select
                              value={draft.mode}
                              onChange={(event) => updateStageApprovalDraft(project.project_id, stage.title, { mode: event.target.value as "single" | "joint" })}
                            >
                              <option value="single">或签（任一人通过）</option>
                              <option value="joint">会签（全员通过）</option>
                            </select>
                          </label>
                          {(
                            <label>
                              <span>{draft.mode === "joint" ? "会签人" : "更多审批人"}</span>
                              <div className="pm-cosigner-box">
                                {(draft.extraApproverOpenIds || []).map((oid) => (
                                  <span key={oid} className="pm-cosigner-chip">
                                    {memberMap[oid]?.name || oid}
                                    <button
                                      type="button"
                                      onClick={() => updateStageApprovalDraft(project.project_id, stage.title, {
                                        extraApproverOpenIds: (draft.extraApproverOpenIds || []).filter((item) => item !== oid),
                                      })}
                                    >
                                      ×
                                    </button>
                                  </span>
                                ))}
                                <select
                                  value=""
                                  onChange={(event) => {
                                    const oid = event.target.value;
                                    if (!oid || oid === draft.approverOpenId || (draft.extraApproverOpenIds || []).includes(oid)) return;
                                    updateStageApprovalDraft(project.project_id, stage.title, {
                                      extraApproverOpenIds: [...(draft.extraApproverOpenIds || []), oid],
                                    });
                                  }}
                                >
                                  <option value="">{draft.mode === "joint" ? "添加会签人" : "添加或签人"}</option>
                                  {Object.values(memberMap)
                                    .filter((member) => member.open_id !== draft.approverOpenId && !(draft.extraApproverOpenIds || []).includes(member.open_id))
                                    .sort((left, right) => (left.name || "").localeCompare(right.name || "", "zh-CN"))
                                    .map((member) => (
                                      <option key={member.open_id} value={member.open_id}>{member.name || member.open_id}</option>
                                    ))}
                                </select>
                              </div>
                            </label>
                          )}
                          <div className="pm-stage-approval-composer-actions">
                            <button type="button" onClick={() => setStageApprovalComposer(null)}>取消</button>
                            <button
                              type="button"
                              data-primary="true"
                              disabled={savingStageApprovalKey === `${stageKey}:submit`}
                              onClick={() => void submitStageApproval(project, stage, step, index)}
                            >
                              提交
                            </button>
                          </div>
                        </div>
                      ) : null}
                      <div className="pm-approval-node-date">{approvalStepDateLabel(step)}</div>
                    </div>
                  );
                })()}
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
    const approvalSnapshot = getProjectApprovalSnapshotForProject(project);
    return (
      <div className="pm-stage-node-map">
        <div className="pm-stage-node-map-head">
          <span>阶段节点</span>
          <b>{category} · {stages.length} 个阶段</b>
        </div>
        <div className="pm-stage-node-grid">
          {stages.map((stage, index) => (
            <div
              key={`${project.project_id}-${stage.title}`}
              className="pm-stage-node-item"
              data-stage-status={approvalSnapshot?.steps[index]?.status || "waiting"}
            >
              <div className="pm-stage-node-index">{index + 1}</div>
              <div className="pm-stage-node-title">{stage.title}</div>
              <div className="pm-stage-node-list">
                {stage.nodes.map((node) => (
                  <span key={`${stage.title}-${node}`} className="pm-stage-node-chip">{node}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const getApprovalCenterItems = () => {
    const uniqueProjects = [...projects, ...projectHistory].reduce<Project[]>((acc, project) => {
      if (!acc.some((item) => item.project_id === project.project_id)) acc.push(project);
      return acc;
    }, []);
    return uniqueProjects.flatMap((project) =>
      (projectLogs[project.project_id] || [])
        .filter((log) =>
          (log.resource_type === "stage_approval" || log.kind === "guidance" || log.kind === "server")
          && ["pending_approval", "pending", "notified"].includes(log.status)
        )
        .map((log) => ({
          project,
          log,
          stageTitle: log.resource_type === "stage_approval"
            ? (log.old_value || log.title.replace("阶段审批", ""))
            : (log.kind === "guidance" ? "指导申请" : log.kind === "server" ? "资源申请" : log.kind_label),
          mine: Boolean(me && (log.approvals && log.approvals.length > 0
            ? log.approvals.some((a) => a.approver_open_id === me.open_id && a.decision === "pending")
            : (log.approver_open_id === me.open_id || log.target_open_id === me.open_id))),
        })),
    ).sort((left, right) => (right.log.created_at || "").localeCompare(left.log.created_at || ""));
  };

  const renderApprovalCenter = () => {
    const approvalItems = getApprovalCenterItems();
    const mineItems = approvalItems.filter((item) => item.mine);
    const visibleItems = isManager && approvalScope === "all" ? approvalItems : mineItems;
    return (
      <div className="pm-approval-center">
        <div className="pm-approval-center-head">
          <div>
            <h2>审批中心</h2>
            <p>集中查看阶段审批、审批人、审批方式和等待时长。</p>
          </div>
          <div className="pm-approval-center-stats">
            <button type="button" data-active={approvalScope === "mine"} onClick={() => setApprovalScope("mine")}><b>{mineItems.length}</b>待我审批</button>
            <button type="button" data-active={approvalScope === "all"} disabled={!isManager} onClick={() => setApprovalScope("all")}><b>{approvalItems.length}</b>全部待审</button>
          </div>
        </div>
        <div className="pm-approval-center-list">
          {visibleItems.length === 0 ? (
            <div className="pm-approval-center-empty">当前没有待处理审批</div>
          ) : null}
          {visibleItems.map(({ project, log, stageTitle, mine }) => {
            const isStage = log.resource_type === "stage_approval";
            const mode = !isStage ? log.kind_label : (log.approval_mode === "all" || log.new_value?.startsWith("会签") ? "会签" : "单人审批");
            const canApprove = canDecideApprovalLog(project, log);
            const decisionLabel: Record<string, string> = { pending: "待审", approved: "已通过", rejected: "已驳回", skipped: "已跳过" };
            return (
              <article key={`${project.project_id}-${log.log_id}`} className="pm-approval-center-card">
                <div className="pm-approval-center-main">
                  <span className="pm-approval-center-kicker">{mode} · {mine ? "待我审批" : "待他人审批"}</span>
                  <h3>{project.name}</h3>
                  <p>{stageTitle} · {log.title}</p>
                  <div className="pm-approval-center-meta">
                    <span>发起人：{log.actor_name || log.actor_open_id}</span>
                    {log.approvals && log.approvals.length > 0 ? (
                      <span className="pm-approval-signers">
                        审批人：
                        {log.approvals.map((a) => (
                          <em key={a.approval_id} className="pm-approval-signer" data-decision={a.decision}>
                            {a.approver_name || a.approver_open_id}·{decisionLabel[a.decision] || a.decision}
                          </em>
                        ))}
                      </span>
                    ) : (
                      <span>审批人：{log.approver_name || log.target_name || log.approver_open_id || log.target_open_id || "未设置"}</span>
                    )}
                    <span>等待：{formatDuration(log.created_at)}</span>
                    <span>发起：{formatDate(log.created_at)}</span>
                  </div>
                </div>
                <div className="pm-approval-center-actions">
                  <button type="button" onClick={() => scrollProjectIntoView(project)}>查看项目</button>
                  <button type="button" disabled={!canApprove} data-primary="true" onClick={() => void (isStage ? decideStageApproval(project, stageTitle, true) : decideCenterApproval(project, log, true))}>通过</button>
                  <button type="button" disabled={!canApprove} onClick={() => void (isStage ? decideStageApproval(project, stageTitle, false) : decideCenterApproval(project, log, false))}>驳回</button>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    );
  };

  const renderProjectRows = () => (
    <div className="pm-project-list">
      {filteredProjects.map((project) => {
          const projectType = projectTypeStyle[project.my_project_type || project.project_type || "team"];
          const category = getProjectCategory(project);
          const owner = memberMap[project.owner_open_id];
          const canEdit = canDeleteProject(project);
          const approvalSnapshot = getProjectApprovalSnapshotForProject(project);
          return (
            <div
              key={project.project_id}
              id={`project-card-${project.project_id}`}
              className="pm-project-card"
              data-highlight={highlightProjectId === project.project_id ? "true" : undefined}
            >
              <div className="pm-project-card-head">
                <div className="pm-project-overview">
                  <div className="pm-name-cell">
                    <div className="pm-name-main">{project.name}</div>
                    <div className="pm-name-sub">
                      {renderTag(projectType.label, projectType)}
                      {category !== "all" ? renderTag(category, { bg: "#F0F7FF", fg: "#1677ff" }) : null}
                      {renderTag(priorityStyle[project.priority].label, priorityStyle[project.priority])}
                      {project.is_abnormal ? renderTag("异常", { bg: "#FFF1F0", fg: "#ff4d4f" }) : null}
                    </div>
                  </div>
                </div>
                <div className="pm-project-owner">
                  <div className="pm-card-field-label">负责人</div>
                  {renderAssignee(project.owner_open_id || owner?.open_id)}
                </div>
                <div className="pm-project-card-actions" onClick={(event) => event.stopPropagation()}>
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
              <div className="pm-project-workspace" onClick={(event) => event.stopPropagation()}>
                {renderProjectActivityPanel(project, approvalSnapshot)}
                {renderProjectPeoplePanel(project, canEdit)}
              </div>
              {approvalSnapshot ? renderPaperApprovalBoard(project, approvalSnapshot) : null}
            </div>
          );
      })}
    </div>
  );

  const renderProjectKanban = () => (
    <div className="pm-view-panel">
      <div className="pm-process-hero">
        <div className="pm-process-copy">
          <span className="pm-process-kicker">PROJECT WORKFLOW</span>
          <h2>项目流程工作台</h2>
          <p>用阶段驱动项目推进，让负责人、审批节点和交付动作都在同一条流程线上。</p>
          <div className="pm-process-stats">
            <span><b>{filteredProjects.length}</b> 个项目</span>
            <span><b>{activeProjects.length}</b> 进行中</span>
            <span><b>{getApprovalCenterItems().filter((item) => item.mine).length}</b> 待我处理</span>
          </div>
          <button className="pm-process-cta" type="button" onClick={openProjectCreateWindow}>+ 新建项目</button>
        </div>
        <div className="pm-process-map" aria-label="项目流程示意">
          <div className="pm-process-node pm-process-node-source">
            <span className="pm-process-node-icon">✦</span>
            <b>项目入口</b>
            <small>新建申请表单</small>
          </div>
          <span className="pm-process-connector">→</span>
          <div className="pm-process-node pm-process-node-stage">
            <span className="pm-process-node-index">01</span>
            <b>{sevenFlowNodes[0]?.title || "立项"}</b>
            <small>自动生成项目卡</small>
          </div>
          <span className="pm-process-connector">→</span>
          <div className="pm-process-node pm-process-node-action">
            <span className="pm-process-node-icon">✓</span>
            <b>自动化动作</b>
            <small>通知 · 审批 · 归档</small>
          </div>
        </div>
      </div>
      <div className="pm-table-scroll">
        <div className="pm-board-grid">
          {sevenFlowNodes.map((flowNode, flowIndex) => {
            const statusProjects = filteredProjects.filter((project) => {
              const snapshot = getProjectApprovalSnapshotForProject(project);
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
                      {stageNodes.length ? (
                        <div className="pm-board-node-chips">
                          {stageNodes.map((node) => <span key={`${project.project_id}-${flowNode.title}-${node}`}>{node}</span>)}
                        </div>
                      ) : null}
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

  const beginTrelloProjectEdit = (project: Project) => {
    setTrelloEditingProjectId(project.project_id);
    setTrelloEditDraft({
      name: project.name || "",
      description: project.description || "",
      owner_open_id: project.owner_open_id || "",
      priority: project.priority || "medium",
      project_type: project.project_type || "team",
    });
  };

  const updateTrelloProjectLocally = (updated: Project) => {
    setProjects((prev) => prev.map((item) => item.project_id === updated.project_id ? updated : item));
    setProjectHistory((prev) => prev.map((item) => item.project_id === updated.project_id ? updated : item));
    setExpandedProjects((prev) => ({ ...prev, [updated.project_id]: { ...(prev[updated.project_id] || updated), ...updated } }));
  };

  const saveTrelloProjectEdit = async (project: Project) => {
    const name = trelloEditDraft.name.trim();
    if (!name) {
      Toast.show({ icon: "fail", content: "项目名称不能为空" });
      return;
    }
    const localUpdated = { ...project, name, description: trelloEditDraft.description.trim() || null, owner_open_id: trelloEditDraft.owner_open_id || project.owner_open_id || "", priority: trelloEditDraft.priority, project_type: trelloEditDraft.project_type };
    setTrelloSavingProjectId(project.project_id);
    try {
      const updated = project.project_id < 0 ? localUpdated : await updateProject(project.project_id, {
        name,
        description: trelloEditDraft.description.trim() || null,
        owner_open_id: trelloEditDraft.owner_open_id || null,
        priority: trelloEditDraft.priority,
        project_type: trelloEditDraft.project_type,
      });
      updateTrelloProjectLocally(updated);
      setTrelloEditingProjectId(null);
      Toast.show({ icon: "success", content: "项目卡片已更新" });
    } catch {
      Toast.show({ icon: "fail", content: "项目卡片保存失败" });
    } finally {
      setTrelloSavingProjectId(null);
    }
  };

  const addTrelloProjectMember = async (project: Project) => {
    const memberOpenId = projectMemberAddDrafts[project.project_id];
    if (!memberOpenId) {
      Toast.show({ icon: "fail", content: "请选择项目成员" });
      return;
    }
    const activeMembers = getActiveProjectMembers(project);
    if (activeMembers.some((member) => member.member_open_id === memberOpenId)) {
      Toast.show({ icon: "fail", content: "该成员已在项目中" });
      return;
    }
    const key = projectMemberDraftKey(project.project_id, memberOpenId);
    setSavingProjectMemberKey(key);
    try {
      if (project.project_id < 0) {
        const memberRow: ProjectMember = {
          member_open_id: memberOpenId,
          role: "member",
          share_ratio: 0,
          tags: "卡片看板添加",
          joined_at: new Date().toISOString().slice(0, 10),
          left_at: null,
        };
        replaceProjectEverywhere({ ...project, members: [...activeMembers, memberRow], updated_at: new Date().toISOString() });
      } else {
        await addProjectMember(project.project_id, { member_open_id: memberOpenId, role: "member", share_ratio: 0, tags: "卡片看板添加" });
        replaceProjectEverywhere(await getProject(project.project_id));
      }
      setProjectMemberAddDrafts((prev) => ({ ...prev, [project.project_id]: "" }));
      Toast.show({ icon: "success", content: "项目成员已添加" });
    } catch {
      Toast.show({ icon: "fail", content: "添加成员失败，请检查权限或成员状态" });
    } finally {
      setSavingProjectMemberKey(null);
    }
  };

  const renderProjectTrelloBoard = () => (
    (() => {
      const trelloProjects = [...projectHistory, ...projects]
        .reduce<Project[]>((items, project) => items.some((item) => item.project_id === project.project_id) ? items : [...items, project], [])
        .filter((project) => projectCategoryFilter === "all" || getProjectCategory(project) === projectCategoryFilter)
        .filter((project) => !memberFilterOpenId || project.owner_open_id === memberFilterOpenId || project.created_by === memberFilterOpenId || (project.members || []).some((member) => member.member_open_id === memberFilterOpenId))
        .filter((project) => !textQuery || `${project.name} ${project.description || ""} ${project.department || ""} ${project.tags || ""}`.toLowerCase().includes(textQuery));
      const targetProject = trelloStageTarget ? trelloProjects.find((project) => project.project_id === trelloStageTarget.projectId) : undefined;
      const targetCategory = targetProject ? getProjectCategory(targetProject) : "all";
      const targetFlowCategory: ProjectCategory = targetCategory === "all" ? "论文写作" : targetCategory;
      const targetStages = targetProject ? categoryStageTemplates[targetFlowCategory] : [];
      const targetStage = targetProject && trelloStageTarget ? targetStages[trelloStageTarget.stageIndex] : undefined;
      const targetSnapshot = targetProject ? getProjectApprovalSnapshotForProject(targetProject) : undefined;
      const targetStep = targetProject && trelloStageTarget ? targetSnapshot?.steps[trelloStageTarget.stageIndex] : undefined;
      const targetStatus = targetProject && targetStage && targetStep
        ? stageApprovalStatus(targetProject, targetStage.title, targetStep.status)
        : "waiting";
      const targetMaterials = targetStep && targetStage
        ? (targetStep.materials || getStageStandardItems(targetFlowCategory, targetStage))
        : [];
      const statusLabel: Record<string, string> = { approved: "已通过", done: "已完成", pending: "审批中", current: "当前节点", rejected: "已驳回", waiting: "待流转" };
      return (
        <div className="pm-trello-board-page">
          <div className="pm-trello-board-toolbar">
            <div className="pm-trello-board-title-group">
              <span className="pm-trello-board-mark">▥</span>
              <b>项目卡片看板</b>
              <span className="pm-trello-board-divider" />
              <span className="pm-trello-board-context">一张卡片 = 一个项目</span>
              <span className="pm-trello-board-count">{trelloProjects.length} 个项目</span>
            </div>
            <div className="pm-trello-board-actions">
              <span className="pm-trello-board-hint">点击阶段提交材料</span>
              <button type="button" onClick={openProjectCreateWindow}>+ 创建项目</button>
            </div>
          </div>
          <div className="pm-trello-board-scroll">
            <div className="pm-trello-columns">
              {trelloProjects.map((project) => {
                const category = getProjectCategory(project);
                const flowCategory: ProjectCategory = category === "all" ? "论文写作" : category;
                const stages = categoryStageTemplates[flowCategory];
                const snapshot = getProjectApprovalSnapshotForProject(project);
                const owner = memberMap[project.owner_open_id]?.name || project.owner_open_id || "未设置";
                const priority = priorityStyle[project.priority];
                const isEditing = trelloEditingProjectId === project.project_id;
                const activeMembers = getActiveProjectMembers(project);
                const memberAddKey = projectMemberAddDrafts[project.project_id] || "";
                return (
                <section key={project.project_id} id={`project-card-${project.project_id}`} className="pm-trello-list" data-highlight={highlightProjectId === project.project_id ? "true" : undefined}>
                  <div className="pm-trello-list-head">
                    <div><b>{project.name}</b><span>{stages.length} 个阶段</span></div>
                    <button type="button" aria-label={`${project.name}更多操作`}>•••</button>
                  </div>
                  <div className="pm-trello-list-cards">
                    <article className="pm-trello-project-card">
                          <div className="pm-trello-project-card-head">
                            <div className="pm-trello-card-labels">
                              <span className="pm-trello-card-label" data-tone={project.priority}>{priority.label}</span>
                              <span className="pm-trello-card-label" data-tone="category">{category === "all" ? "项目" : category}</span>
                            </div>
                            <button className="pm-trello-edit-project" type="button" onClick={() => isEditing ? setTrelloEditingProjectId(null) : beginTrelloProjectEdit(project)}>{isEditing ? "取消" : "编辑"}</button>
                          </div>
                          {isEditing ? (
                            <div className="pm-trello-inline-editor">
                              <input value={trelloEditDraft.name} onChange={(event) => setTrelloEditDraft((prev) => ({ ...prev, name: event.target.value }))} placeholder="项目名称" />
                              <textarea value={trelloEditDraft.description} onChange={(event) => setTrelloEditDraft((prev) => ({ ...prev, description: event.target.value }))} placeholder="项目简介" />
                              <select value={trelloEditDraft.owner_open_id} onChange={(event) => setTrelloEditDraft((prev) => ({ ...prev, owner_open_id: event.target.value }))}>
                                <option value="">选择负责人</option>
                                {memberOptions.map((member) => <option key={member.openId} value={member.openId}>{member.name}</option>)}
                              </select>
                              <div className="pm-trello-inline-editor-row">
                                <select value={trelloEditDraft.priority} onChange={(event) => setTrelloEditDraft((prev) => ({ ...prev, priority: event.target.value as ProjectPriority }))}>
                                  {Object.entries(priorityStyle).map(([key, value]) => <option key={key} value={key}>{value.label}优先级</option>)}
                                </select>
                                <select value={trelloEditDraft.project_type} onChange={(event) => setTrelloEditDraft((prev) => ({ ...prev, project_type: event.target.value as ProjectType }))}>
                                  <option value="team">团队项目</option>
                                  <option value="personal">个人项目</option>
                                </select>
                              </div>
                              <button className="pm-trello-inline-save" type="button" disabled={trelloSavingProjectId === project.project_id} onClick={() => void saveTrelloProjectEdit(project)}>{trelloSavingProjectId === project.project_id ? "保存中..." : "保存项目"}</button>
                            </div>
                          ) : (
                            <button className="pm-trello-project-title-button" type="button" onClick={() => scrollProjectIntoView(project)}>
                              <b className="pm-trello-card-title">{project.name}</b>
                              {project.description ? <p>{project.description}</p> : null}
                            </button>
                          )}
                          <div className="pm-trello-card-footer">
                            <span className="pm-trello-avatar">{owner.slice(0, 1)}</span>
                            <span>{owner}</span>
                            <span className="pm-trello-card-progress">{getProgress(project)}%</span>
                          </div>
                          <div className="pm-trello-progress"><span style={{ width: `${getProgress(project)}%` }} /></div>
                          <div className="pm-trello-project-members">
                            <div className="pm-trello-project-members-head"><span>项目成员</span><span>{activeMembers.length} 人</span></div>
                            <div className="pm-trello-member-strip">
                              {activeMembers.slice(0, 6).map((member) => {
                                const memberInfo = memberMap[member.member_open_id];
                                return <span key={member.member_open_id} className="pm-trello-member-avatar" title={`${memberInfo?.name || member.member_open_id} · ${member.role === "owner" ? "负责人" : "成员"}`}>{(memberInfo?.name || member.member_open_id).slice(0, 1)}</span>;
                              })}
                              {activeMembers.length > 6 ? <span className="pm-trello-member-more">+{activeMembers.length - 6}</span> : null}
                              {activeMembers.length === 0 ? <small>暂无成员</small> : null}
                            </div>
                            <div className="pm-trello-member-add-row">
                              <select value={memberAddKey} onChange={(event) => setProjectMemberAddDrafts((prev) => ({ ...prev, [project.project_id]: event.target.value }))}>
                                <option value="">+ 添加项目成员</option>
                                {memberOptions.filter((member) => !activeMembers.some((item) => item.member_open_id === member.openId)).map((member) => <option key={member.openId} value={member.openId}>{member.name}</option>)}
                              </select>
                              <button type="button" disabled={!memberAddKey || savingProjectMemberKey === projectMemberDraftKey(project.project_id, memberAddKey)} onClick={() => void addTrelloProjectMember(project)}>添加</button>
                            </div>
                          </div>
                          <div className="pm-trello-project-stages-title"><span>项目阶段</span><span>{stages.length} 个阶段</span></div>
                          <div className="pm-trello-project-stages">
                            {stages.map((stage, stageIndex) => {
                              const step = snapshot?.steps[stageIndex];
                              const stageStatus = stageApprovalStatus(project, stage.title, step?.status || "waiting");
                              const selected = trelloStageTarget?.projectId === project.project_id && trelloStageTarget.stageIndex === stageIndex;
                              return (
                                <button
                                  key={stage.title}
                                  className="pm-trello-project-stage"
                                  type="button"
                                  data-status={stageStatus}
                                  data-selected={selected ? "true" : "false"}
                                  onClick={(event) => {
                                    loadStageChecksIfNeeded(project.project_id);
                                    if (selected) {
                                      setTrelloStageTarget(null);
                                      setTrelloStagePosition(null);
                                      return;
                                    }
                                    const rect = event.currentTarget.getBoundingClientRect();
                                    const popoverWidth = Math.min(360, window.innerWidth - 32);
                                    const left = rect.right + 12 + popoverWidth <= window.innerWidth - 16
                                      ? rect.right + 12
                                      : Math.max(16, rect.left - popoverWidth - 12);
                                    const top = Math.max(88, Math.min(rect.top, window.innerHeight - 520));
                                    setTrelloStagePosition({ top, left });
                                    setTrelloStageTarget({ projectId: project.project_id, stageIndex: stageIndex });
                                  }}
                                >
                                  <span className="pm-trello-stage-dot">{stageStatus === "approved" || stageStatus === "done" ? "✓" : stageIndex + 1}</span>
                                  <span><b>{stage.title}</b><small>{step?.title || stage.nodes.join("、")}</small></span>
                                  <em>{statusLabel[stageStatus] || "待流转"}</em>
                                  <i>↗</i>
                                </button>
                              );
                            })}
                          </div>
                    </article>
                  </div>
                </section>
                );
              })}
              <button className="pm-trello-add-list" type="button" onClick={openProjectCreateWindow}>＋ 新建项目列</button>
            </div>
          </div>
          {targetProject && targetStage && targetStep && trelloStageTarget ? (
            <aside
              className="pm-trello-material-popover"
              aria-label={`${targetStage.title}材料提交窗口`}
              ref={trelloMaterialPopoverRef}
              style={trelloStagePosition && window.innerWidth > 720 ? { top: trelloStagePosition.top, left: trelloStagePosition.left, right: "auto" } : undefined}
            >
              <div
                className="pm-trello-material-head"
                onPointerDown={handleTrelloPopoverPointerDown}
                onPointerMove={handleTrelloPopoverPointerMove}
                onPointerUp={handleTrelloPopoverPointerUp}
                onPointerCancel={handleTrelloPopoverPointerUp}
              >
                <div><small>阶段 {trelloStageTarget.stageIndex + 1} · {statusLabel[targetStatus]}</small><h3>{targetStage.title}</h3><p>{targetStep.title}</p></div>
                <button type="button" aria-label="关闭材料窗口" onClick={() => { setTrelloStageTarget(null); setTrelloStagePosition(null); }}>×</button>
              </div>
              <div className="pm-trello-material-meta"><span>执行人<b>{targetStep.executor || targetStep.owner}</b></span><span>审批人<b>{targetStep.approver || targetStep.owner}</b></span></div>
              <div className="pm-trello-material-title">提交本阶段材料</div>
              <div className="pm-trello-material-items">
                {targetMaterials.map((material, index) => <div key={`${material}-${index}`} className="pm-trello-material-item"><span>{index + 1}</span><div><b>{material}</b>{renderStageCheckControl(targetProject.project_id, targetStep.title, material, false, targetStep.status === "done")}</div></div>)}
              </div>
              <p className="pm-trello-material-note">{targetStep.note}</p>
              <div className="pm-trello-material-actions"><button type="button" onClick={() => { setTrelloStageTarget(null); setTrelloStagePosition(null); }}>关闭</button><button type="button" data-primary="true" onClick={() => { setTrelloStageTarget(null); setTrelloStagePosition(null); Toast.show({ icon: "success", content: "阶段材料已保存" }); }}>保存材料</button></div>
            </aside>
          ) : null}
        </div>
      );
    })()
  );

  const renderProjectApprovalFlow = () => {
    const selectedProject = filteredProjects.find((project) => project.project_id === approvalFlowProjectId) || filteredProjects[0];
    const category = selectedProject ? getProjectCategory(selectedProject) : "all";
    const flowCategory: ProjectCategory = category === "all" ? "论文写作" : category;
    const stages = categoryStageTemplates[flowCategory];
    const snapshot = selectedProject ? getProjectApprovalSnapshotForProject(selectedProject) : undefined;
    const selectedIndex = approvalFlowStageIndex !== null && approvalFlowStageIndex < stages.length ? approvalFlowStageIndex : null;
    const selectedStage = selectedIndex === null ? undefined : stages[selectedIndex];
    const selectedStep = selectedIndex === null ? undefined : snapshot?.steps[selectedIndex];
    const selectedApprovalState = selectedProject && selectedStage && selectedStep
      ? stageApprovalStatus(selectedProject, selectedStage.title, selectedStep.status)
      : undefined;
    const statusLabel: Record<string, string> = {
      approved: "已通过",
      rejected: "已驳回",
      pending: "审批中",
      done: "已完成",
      current: "当前节点",
      waiting: "待流转",
    };
    return (
      <div className="pm-approval-flow-view">
        <div className="pm-approval-flow-intro">
          <div>
            <span className="pm-process-kicker">APPROVAL WORKFLOW</span>
            <h2>项目审批流程</h2>
            <p>按阶段提交材料。点击任意审批点，查看该阶段的材料清单、执行人和审批人。</p>
          </div>
          <div className="pm-approval-flow-project-picker">
            <label htmlFor="approval-flow-project">当前项目</label>
            <select
              id="approval-flow-project"
              value={selectedProject?.project_id ?? ""}
              onChange={(event) => {
                setApprovalFlowProjectId(Number(event.target.value));
                setApprovalFlowStageIndex(null);
              }}
            >
              {filteredProjects.map((project) => <option key={project.project_id} value={project.project_id}>{project.name}</option>)}
            </select>
          </div>
        </div>
        {selectedProject ? (
          <div className="pm-approval-flow-shell">
            <div className="pm-approval-flow-track">
              {stages.map((stage, index) => {
                const step = snapshot?.steps[index];
                const approvalState = selectedProject ? stageApprovalStatus(selectedProject, stage.title, step?.status || "waiting") : "waiting";
                const isSelected = selectedIndex === index;
                return (
                  <div key={stage.title} className="pm-approval-flow-step" data-selected={isSelected ? "true" : "false"} data-status={approvalState}>
                    <button type="button" className="pm-approval-flow-step-button" onClick={() => setApprovalFlowStageIndex(isSelected ? null : index)}>
                      <span className="pm-approval-flow-dot">{approvalState === "approved" || approvalState === "done" ? "✓" : index + 1}</span>
                      <span className="pm-approval-flow-step-main">
                        <small>阶段 {index + 1}</small>
                        <b>{stage.title}</b>
                        <em>{step?.title || stage.nodes.join("、")}</em>
                      </span>
                      <span className="pm-approval-flow-step-status">{statusLabel[approvalState] || "待流转"}</span>
                      <span className="pm-approval-flow-step-arrow">{isSelected ? "×" : "↗"}</span>
                    </button>
                    {index < stages.length - 1 ? <span className="pm-approval-flow-line" aria-hidden="true" /> : null}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="pm-approval-flow-empty">当前筛选下暂无项目</div>
        )}
        {selectedProject && selectedStage && selectedStep && selectedIndex !== null ? (
          <div className="pm-material-modal-layer" role="presentation" onClick={() => setApprovalFlowStageIndex(null)}>
            <div className="pm-material-modal" role="dialog" aria-modal="true" aria-label={`${selectedStage.title}材料清单`} onClick={(event) => event.stopPropagation()}>
              <div className="pm-material-modal-head">
                <div>
                  <span>阶段 {selectedIndex + 1} · {statusLabel[selectedApprovalState || selectedStep.status]}</span>
                  <h3>{selectedStage.title}</h3>
                  <p>{selectedStep.title}</p>
                </div>
                <button type="button" aria-label="关闭材料窗口" onClick={() => setApprovalFlowStageIndex(null)}>×</button>
              </div>
              <div className="pm-material-modal-meta">
                <div><small>执行人</small><b>{selectedStep.executor || selectedStep.owner}</b></div>
                <div><small>审批人</small><b>{selectedStep.approver || selectedStep.owner}</b></div>
                <div><small>项目</small><b>{selectedProject.name}</b></div>
              </div>
              <div className="pm-material-modal-section-title">需要提交的材料</div>
              <div className="pm-material-list">
                {(selectedStep.materials || getStageStandardItems(flowCategory, selectedStage)).map((material, index) => (
                  <div key={`${material}-${index}`} className="pm-material-item">
                    <span>{selectedStep.status === "done" ? "✓" : index + 1}</span>
                    <div><b>{material}</b><small>{selectedStep.status === "done" ? "已完成并留存" : "待提交或补充"}</small></div>
                  </div>
                ))}
              </div>
              <div className="pm-material-modal-note">{selectedStep.note}</div>
              <div className="pm-material-modal-actions">
                <button type="button" onClick={() => setApprovalFlowStageIndex(null)}>关闭</button>
                <button type="button" data-primary="true" onClick={() => { setApprovalFlowStageIndex(null); scrollProjectIntoView(selectedProject); }}>进入项目处理</button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    );
  };

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
    if (projectView === "trello") return renderProjectTrelloBoard();
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
    <div className={`pm-workbench${projectView === "trello" ? " pm-trello-workbench" : ""}`}>
      <style>{projectPanelStyles}</style>
      <div className="pm-topbar">
        <div className="pm-brand">
          <span className="pm-mark">卷</span>
          <span className="pm-title">项目管理</span>
          <span className="pm-breadcrumb">工作台 / {workMode === "projects" ? "项目" : workMode === "tasks" ? "任务" : "审批"}</span>
        </div>
        <div className="pm-module-tabs pm-workspace-tabs" aria-label="工作区切换">
          <button className="pm-tab-btn" type="button" data-active={workMode === "projects"} onClick={() => switchWorkMode("projects")}>项目</button>
          <button className="pm-tab-btn" type="button" data-active={workMode === "tasks"} onClick={() => switchWorkMode("tasks")}>任务</button>
          <button className="pm-tab-btn" type="button" data-active={workMode === "approvals"} onClick={() => switchWorkMode("approvals")}>审批中心</button>
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
          {canManagePermissions ? (
            <button className="pm-tool-btn" type="button" onClick={() => navigate("/permissions")}>权限设置</button>
          ) : null}
          <button className="pm-primary-btn" type="button" onClick={openProjectCreateWindow}>新建项目</button>
        </div>
      </div>

      <div className="pm-layout">
        <aside className="pm-sidebar" aria-label="项目管理导航">
          <div className="pm-sidebar-profile">
            <button className="pm-profile-home" type="button" title="个人主页" onClick={() => navigate("/profile")}>
              <span className="pm-sidebar-avatar">{(me?.name || "我").slice(0, 1)}</span>
              <span className="pm-sidebar-profile-main">
                <b>{me?.name || "个人主页"}</b>
                <small>{me?.department || "查看个人信息"}</small>
              </span>
            </button>
          </div>
          <div className="pm-sidebar-nav">
            <div className="pm-sidebar-label">工作区</div>
            <button className="pm-sidebar-nav-item" type="button" data-active={workMode === "projects"} onClick={() => setWorkMode("projects")}>
              <NavIcon name="projects" /><span>项目</span><em>{filteredProjects.length}</em>
            </button>
            <button className="pm-sidebar-nav-item" type="button" data-active={workMode === "tasks"} onClick={() => setWorkMode("tasks")}>
              <NavIcon name="tasks" /><span>任务</span><em>{filteredTasks.length}</em>
            </button>
            <button className="pm-sidebar-nav-item" type="button" data-active={workMode === "approvals"} onClick={() => setWorkMode("approvals")}>
              <NavIcon name="approvals" /><span>审批</span><em>{getApprovalCenterItems().filter((item) => item.mine).length}</em>
            </button>
          </div>
          <div className="pm-sidebar-footer">
            {canManagePermissions ? <button className="pm-sidebar-nav-item" type="button" onClick={() => navigate("/permissions")}><NavIcon name="settings" /><span>权限设置</span></button> : null}
          </div>
        </aside>
        <main className="pm-main">
          <div className="pm-toolbar">
            <div className="pm-toolbar-left">
              <div className="pm-view-title">{workMode === "projects" ? "项目视图" : workMode === "tasks" ? (isManager ? "按负责人查看任务" : "任务视图") : "审批中心"}</div>
              <div className="pm-muted">{workMode === "projects" ? `${filteredProjects.length} 个项目` : workMode === "tasks" ? `${filteredTasks.length} 个任务` : `${getApprovalCenterItems().filter((item) => item.mine).length} 个待我审批`}</div>
            </div>
            <div className="pm-toolbar-right">
              {workMode === "projects" ? (
                <>
                  <div className="pm-view-switch">
                    {availableProjectViewItems.map((item) => (
                      <button key={item.key} type="button" data-active={item.key === "dashboard" ? location.pathname === "/projects/dashboard" : projectView === item.key} onClick={() => item.key === "dashboard" ? navigate("/projects/dashboard") : setProjectView(item.key)}>
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
                  <select className="pm-select" value={activeKey} aria-label="项目状态筛选" onChange={(event) => setActiveKey(event.target.value as ProjectTabKey)}>
                    {tabItems.map((item) => <option key={item.key} value={item.key}>{item.title}</option>)}
                  </select>
                  <select className="pm-select" value={projectTypeFilter} aria-label="项目类型筛选" onChange={(event) => setProjectTypeFilter(event.target.value as "all" | ProjectType)}>
                    <option value="all">全部类型</option>
                    <option value="team">团队项目</option>
                    <option value="personal">个人项目</option>
                  </select>
                </>
              ) : workMode === "tasks" ? (
                <>
                  <select className="pm-select" value={taskFilter} aria-label="任务状态筛选" onChange={(event) => setTaskFilter(event.target.value as TaskFilter)}>
                    {taskFilters.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                  <select className="pm-select" value={assigneeFilter} onChange={(event) => setAssigneeFilter(event.target.value)}>
                    <option value="all">全部负责人</option>
                    {taskAssigneeOptions.map((item) => (
                      <option key={item.openId} value={item.openId}>{item.name}</option>
                    ))}
                    <option value="__unassigned__">未分配负责人</option>
                  </select>
                  <span className="pm-muted">{isManager ? "按负责人分组，未分配置底" : "显示当前筛选任务"}</span>
                </>
              ) : (
                <>
                  <div className="pm-view-switch" aria-label="审批筛选">
                    <button type="button" data-active={approvalScope === "mine"} onClick={() => setApprovalScope("mine")}>待我审批</button>
                    {isManager ? <button type="button" data-active={approvalScope === "all"} onClick={() => setApprovalScope("all")}>全部待审</button> : null}
                  </div>
                  <span className="pm-muted">审批数据来自项目阶段日志</span>
                </>
              )}
            </div>
          </div>

          {false ? (
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

          {workMode === "tasks" ? (
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
            {loading ? <SectionLoading text={workMode === "projects" ? "正在加载项目..." : workMode === "tasks" ? "正在加载任务..." : "正在加载审批..."} /> : null}
            {!loading && workMode === "approvals" ? renderApprovalCenter() : null}
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
      {projectCreateDialogOpen ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1200,
            background: "rgba(15, 23, 42, 0.28)",
            backdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "32px 20px",
          }}
          onClick={() => setProjectCreateDialogOpen(false)}
        >
          <div
            style={{
              width: "min(1080px, 100%)",
              height: "min(880px, calc(100vh - 64px))",
              borderRadius: 24,
              overflow: "hidden",
              background: "#F5F6F8",
              boxShadow: "0 28px 90px rgba(15,23,42,0.18)",
              border: "1px solid rgba(255,255,255,0.72)",
              display: "flex",
              flexDirection: "column",
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div
              style={{
                height: 64,
                padding: "0 20px 0 24px",
                background: "rgba(255,255,255,0.92)",
                borderBottom: "1px solid #EAECF0",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 16,
              }}
            >
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#101828" }}>新建项目</div>
                <div style={{ marginTop: 4, fontSize: 13, color: "#667085" }}>在当前页面完成填写，提交后自动返回项目列表</div>
              </div>
              <button
                type="button"
                aria-label="关闭新建项目窗口"
                onClick={() => setProjectCreateDialogOpen(false)}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  border: "1px solid #E4E7EC",
                  background: "#FFFFFF",
                  color: "#475467",
                  fontSize: 18,
                  cursor: "pointer",
                }}
              >
                ×
              </button>
            </div>
            <iframe
              key={projectCreateDialogKey}
              title="新建项目"
              src={`/projects/new?embedded=1&t=${projectCreateDialogKey}`}
              style={{ flex: 1, width: "100%", border: 0, background: "#F5F6F8" }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default ProjectListPage;
