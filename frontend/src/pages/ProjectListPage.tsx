import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Dialog, Selector, Toast } from "antd-mobile";
import { useNavigate, useSearchParams } from "react-router-dom";
import { createAIAssistant, listAIAssistants, updateAIAssistant, type AIAssistantConfig, type AIAssistantScope, type AIAssistantCadence } from "../api/aiAssistants";
import {
  listCalendarEvents,
  listLarkUserStatuses,
  type CalendarEvent,
  type LarkUserStatus,
} from "../api/calendar";
import {
  createContribution,
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
  listTodayTasks,
  listTaskAuditLogs,
  listTasks,
  markTaskTodayTodo,
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

type ProjectTabKey = "active" | "completed" | "archived";
type WorkMode = "projects" | "tasks" | "today";
type TaskFilter = "open" | "todo" | "in_progress" | "blocked" | "done" | "cancelled" | "all";

const equalAccessOpenIds = new Set(["ou_20fec537961e0a66669370b00d0fc52d", "ou_c544c4877658cfa1df6cee41939b99c4"]);

const projectStatusStyle: Record<ProjectStatus, { label: string; bg: string; fg: string }> = {
  planning: { label: "规划中", bg: "#E8F3FF", fg: "#1D4ED8" },
  active: { label: "进行中", bg: "#E8FFEA", fg: "#15803D" },
  paused: { label: "已暂停", bg: "#FFF7E6", fg: "#B45309" },
  completed: { label: "已完成", bg: "#F0FDF4", fg: "#15803D" },
  archived: { label: "已存档", bg: "#F4F3FF", fg: "#5B21B6" },
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

const projectCategoryValues = ["开发", "科研", "竞赛", "培训"] as const;
type ProjectCategory = (typeof projectCategoryValues)[number];
type ProjectCategoryFilter = "all" | ProjectCategory;
type WorkflowTemplateKey = ProjectCategory | "自定义";

const workflowTemplates: Record<ProjectCategory, Array<{ title: string; hours: number; review: string }>> = {
  开发: [
    { title: "需求确认与边界定义", hours: 2, review: "负责人确认目标、范围和验收口径" },
    { title: "方案/原型设计", hours: 3, review: "负责人审核实现路径和关键风险" },
    { title: "开发实现", hours: 8, review: "按模块推进并记录关键决策" },
    { title: "联调与自测", hours: 4, review: "验证主流程、边界和异常场景" },
    { title: "验收上线与复盘沉淀", hours: 2, review: "形成知识文档和后续优化项" },
  ],
  科研: [
    { title: "问题定义与文献梳理", hours: 4, review: "负责人确认研究问题和参考范围" },
    { title: "实验方案设计", hours: 4, review: "审核变量、数据和评价指标" },
    { title: "实验执行与记录", hours: 8, review: "保留过程数据和失败样本" },
    { title: "结果分析与讨论", hours: 4, review: "确认结论是否支撑目标" },
    { title: "论文/报告整理", hours: 4, review: "沉淀可复用方法和材料" },
  ],
  竞赛: [
    { title: "赛题解读与规则确认", hours: 2, review: "确认评分标准和提交限制" },
    { title: "方案分工与时间排期", hours: 2, review: "明确负责人、里程碑和风险点" },
    { title: "核心实现/训练", hours: 8, review: "记录参数、方案和版本差异" },
    { title: "验证优化与材料准备", hours: 4, review: "按评分标准做针对性提升" },
    { title: "提交复盘与知识沉淀", hours: 2, review: "总结可复用流程和坑点" },
  ],
  培训: [
    { title: "培训目标与对象确认", hours: 1, review: "确认受众、能力目标和交付形式" },
    { title: "课程/材料设计", hours: 3, review: "负责人审核结构和案例" },
    { title: "内容制作与演练", hours: 4, review: "检查节奏、演示和互动环节" },
    { title: "培训执行与反馈收集", hours: 2, review: "记录参与情况和问题" },
    { title: "复盘改进与知识沉淀", hours: 2, review: "沉淀讲义、FAQ 和改进计划" },
  ],
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

const tabItems: Array<{ key: ProjectTabKey; title: string }> = [
  { key: "active", title: "进行中" },
  { key: "completed", title: "已完成" },
  { key: "archived", title: "已存档" },
];

const statusesForTab: Record<ProjectTabKey, ProjectStatus[]> = {
  active: ["planning", "active", "paused"],
  completed: ["completed"],
  archived: ["archived"],
};

const splitProjectTags = (value?: string | null) =>
  (value || "")
    .split(/[,\s，、#]+/)
    .map((tag) => tag.trim())
    .filter(Boolean);

const getProjectCategory = (project: Project): ProjectCategoryFilter => {
  const category = splitProjectTags(project.tags).find((tag): tag is ProjectCategory =>
    projectCategoryValues.includes(tag as ProjectCategory),
  );
  return category || "all";
};

const getProjectCustomTags = (value?: string | null) =>
  splitProjectTags(value).filter((tag) => !projectCategoryValues.includes(tag as ProjectCategory)).join(" ");

const combineProjectTags = (category: ProjectCategoryFilter, customTags: string) => {
  const tags = splitProjectTags(customTags);
  if (category !== "all") tags.unshift(category);
  return Array.from(new Set(tags)).join(" ") || null;
};

const taskProjectLabel = (task: Task) => task.project_name || "独立任务";

const formatDate = (value?: string | null): string => {
  if (!value) return "未设置";
  const normalized = value.replace("T", " ");
  return normalized.length >= 16 ? normalized.slice(0, 16) : normalized;
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
    background: #F7F8FA;
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
    background: #FFFFFF;
    border-bottom: 1px solid #E5E6EB;
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
    background: #3370FF;
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
  }
  .pm-search {
    width: 220px;
    height: 30px;
    border: 1px solid #E5E6EB;
    border-radius: 5px;
    background: #FFFFFF;
    color: #1F2329;
    padding: 0 10px;
    font-size: 13px;
    outline: none;
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
  .pm-layout {
    display: grid;
    grid-template-columns: 220px minmax(0, 1fr);
    min-height: calc(100vh - 48px);
  }
  .pm-sidebar {
    background: #FFFFFF;
    border-right: 1px solid #E5E6EB;
    padding: 12px 10px;
  }
  .pm-sidebar-section {
    margin-bottom: 16px;
  }
  .pm-sidebar-title {
    padding: 0 8px 6px;
    color: #8F959E;
    font-size: 12px;
    font-weight: 700;
  }
  .pm-nav-item {
    width: 100%;
    height: 34px;
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: #1F2329;
    padding: 0 8px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-size: 13px;
    cursor: pointer;
    position: relative;
  }
  .pm-nav-item:hover {
    background: #F2F3F5;
  }
  .pm-nav-item[data-active="true"] {
    background: #F0F6FF;
    color: #3370FF;
    font-weight: 700;
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
    color: #8F959E;
    font-size: 12px;
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
  .pm-main {
    min-width: 0;
    padding: 12px 14px 20px;
  }
  .pm-toolbar {
    min-height: 44px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    background: #FFFFFF;
    border: 1px solid #E5E6EB;
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
    background: #FFFFFF;
    border: 1px solid #E5E6EB;
    border-top: 0;
    border-radius: 0 0 6px 6px;
    min-height: 520px;
  }
  .pm-table-scroll {
    width: 100%;
    overflow-x: auto;
  }
  .pm-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }
  .pm-table th {
    height: 36px;
    padding: 0 10px;
    border-bottom: 1px solid #E5E6EB;
    background: #FAFAFA;
    color: #646A73;
    font-size: 12px;
    font-weight: 700;
    text-align: left;
  }
  .pm-table td {
    height: 44px;
    padding: 7px 10px;
    border-bottom: 1px solid #E8EAED;
    color: #1F2329;
    font-size: 13px;
    vertical-align: middle;
  }
  .pm-table tr:hover td {
    background: #F7FAFF;
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
    padding: 12px;
    background: #F7F8FA;
    border-bottom: 1px solid #E5E6EB;
  }
  .pm-inline-grid {
    display: grid;
    grid-template-columns: minmax(260px, 1fr) 320px;
    gap: 12px;
    align-items: start;
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
      border-right: 0;
      border-bottom: 1px solid #E5E6EB;
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
    .pm-search {
      width: 100%;
    }
    .pm-select {
      width: 100%;
    }
    .pm-main {
      padding: 10px;
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
    .pm-sidebar-section {
      margin-bottom: 10px;
    }
    .pm-sidebar-section:nth-of-type(n+3) {
      display: none;
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
  const [activeKey, setActiveKey] = useState<ProjectTabKey>("active");
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectHistory, setProjectHistory] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [historyTasks, setHistoryTasks] = useState<Task[]>([]);
  const [aiAssistants, setAiAssistants] = useState<AIAssistantConfig[]>([]);
  const [assistantConfigExpanded, setAssistantConfigExpanded] = useState(false);
  const [savingAssistantId, setSavingAssistantId] = useState<number | "new" | null>(null);
  const [taskFilter, setTaskFilter] = useState<TaskFilter>("open");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [projectTypeFilter, setProjectTypeFilter] = useState<"all" | ProjectType>("all");
  const [projectCategoryFilter, setProjectCategoryFilter] = useState<ProjectCategoryFilter>("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [memberMap, setMemberMap] = useState<Record<string, Member>>({});
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deletingTaskId, setDeletingTaskId] = useState<number | null>(null);
  const [expandedProjectId, setExpandedProjectId] = useState<number | null>(null);
  const [expandedTaskId, setExpandedTaskId] = useState<number | null>(null);
  const [expandedProjectTaskId, setExpandedProjectTaskId] = useState<number | null>(null);
  const [savingProjectId, setSavingProjectId] = useState<number | null>(null);
  const [savingProjectMemberKey, setSavingProjectMemberKey] = useState<string | null>(null);
  const [savingTaskId, setSavingTaskId] = useState<number | null>(null);
  const [savingTodayTaskId, setSavingTodayTaskId] = useState<number | null>(null);
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
    category: "all" as ProjectCategoryFilter,
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
    deviationReason: "",
    finishReflection: "",
    saveAsKnowledge: true,
    knowledgeTitle: "",
  });
  const [workflowDraft, setWorkflowDraft] = useState({
    template: "开发" as WorkflowTemplateKey,
    assignee_open_id: "",
    reviewer: "",
    customNodes: "",
  });
  const [projectMemberDrafts, setProjectMemberDrafts] = useState<Record<string, { role: PMRole; share_ratio: string; tags: string }>>({});
  const [projectMemberAddDrafts, setProjectMemberAddDrafts] = useState<Record<number, string>>({});
  const [assistantDraft, setAssistantDraft] = useState({
    assistant_id: 0,
    scope: "global" as AIAssistantScope,
    department: "",
    name: "小卷管理助手",
    role: "management",
    prompt: "关注项目节奏、任务阻塞、知识沉淀和团队负载，输出可执行建议。",
    workflow: "每日检查逾期/受阻任务；每周总结知识、会议、群聊和任务偏差。",
    cadence: "weekly" as AIAssistantCadence,
    enabled: true,
  });

  useEffect(() => {
    return () => {
      Object.values(focusTimerRef.current).forEach((timerId) => window.clearTimeout(timerId));
    };
  }, []);

  const isManager = me?.role === "admin" || me?.role === "staff";

  const loadAIAssistants = () => {
    listAIAssistants()
      .then((items) => setAiAssistants(items))
      .catch(() => setAiAssistants([]));
  };

  const editAssistantDraft = (assistant: AIAssistantConfig) => {
    setAssistantDraft({
      assistant_id: assistant.assistant_id,
      scope: assistant.scope,
      department: assistant.department || "",
      name: assistant.name,
      role: assistant.role,
      prompt: assistant.prompt,
      workflow: assistant.workflow || "",
      cadence: assistant.cadence,
      enabled: assistant.enabled,
    });
  };

  const saveAssistantDraft = async () => {
    const name = assistantDraft.name.trim();
    const prompt = assistantDraft.prompt.trim();
    if (!name || !prompt) {
      Toast.show({ icon: "fail", content: "请填写助手名称和提示词" });
      return;
    }
    if (assistantDraft.scope === "department" && !assistantDraft.department.trim()) {
      Toast.show({ icon: "fail", content: "部门助手需要选择部门" });
      return;
    }
    const payload = {
      scope: assistantDraft.scope,
      department: assistantDraft.scope === "department" ? assistantDraft.department.trim() : null,
      name,
      role: assistantDraft.role.trim() || "management",
      prompt,
      workflow: assistantDraft.workflow.trim() || null,
      cadence: assistantDraft.cadence,
      enabled: assistantDraft.enabled,
    };
    setSavingAssistantId(assistantDraft.assistant_id ? assistantDraft.assistant_id : "new");
    try {
      const saved = assistantDraft.assistant_id
        ? await updateAIAssistant(assistantDraft.assistant_id, payload)
        : await createAIAssistant(payload);
      setAiAssistants((prev) => {
        const exists = prev.some((item) => item.assistant_id === saved.assistant_id);
        return exists ? prev.map((item) => (item.assistant_id === saved.assistant_id ? saved : item)) : [saved, ...prev];
      });
      editAssistantDraft(saved);
      Toast.show({ icon: "success", content: "AI 助手配置已保存" });
    } catch {
      Toast.show({ icon: "fail", content: "AI 助手保存失败" });
    } finally {
      setSavingAssistantId(null);
    }
  };

  const canDeleteProject = (project: Project): boolean => {
    if (!me) return false;
    return (
      me.open_id === project.owner_open_id
      || (equalAccessOpenIds.has(me.open_id) && equalAccessOpenIds.has(project.owner_open_id))
      || (project.project_type === "team" && isManager)
    );
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
      deviationReason: "",
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
      template: category === "all" ? "开发" : category,
      assignee_open_id: project.owner_open_id || "",
      reviewer: memberMap[project.owner_open_id]?.name || "项目负责人审核",
      customNodes: defaultWorkflowText(category === "all" ? "开发" : category),
    }));
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

  const toggleTaskTodayTodo = async (task: Task, enabled: boolean) => {
    setSavingTodayTaskId(task.task_id);
    try {
      const updated = await markTaskTodayTodo(task.task_id, enabled);
      if (workMode === "today" && !enabled) {
        setTasks((prev) => prev.filter((item) => item.task_id !== task.task_id));
      } else {
        applyTaskUpdate(updated);
      }
      Toast.show({ icon: "success", content: enabled ? "已加入今日待办" : "已移出今日待办" });
    } catch {
      Toast.show({ icon: "fail", content: "今日待办更新失败" });
    } finally {
      setSavingTodayTaskId(null);
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
            "完成后请补充复盘、知识沉淀或可复用材料。",
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

  const finishTaskWork = async (task: Task) => {
    const session = focusSessions[task.task_id];
    const expectedMinutes = session?.expectedMinutes || Math.max(1, Number(focusDraft.expectedMinutes) || 60);
    const actualMinutes = focusDraft.actualMinutes.trim()
      ? Math.max(0, Number(focusDraft.actualMinutes) || 0)
      : session
        ? Math.max(1, Math.round((Date.now() - new Date(session.startedAt).getTime()) / 60000))
        : expectedMinutes;
    const goalText = focusDraft.goalAchieved === "yes" ? "已达到" : focusDraft.goalAchieved === "partly" ? "部分达到" : "未达到";
    const delta = actualMinutes - expectedMinutes;
    const note = [
      `目标达成: ${goalText}`,
      `预计耗时: ${formatMinutes(expectedMinutes)}`,
      `实际耗时: ${formatMinutes(actualMinutes)}`,
      `偏差: ${delta >= 0 ? "+" : ""}${formatMinutes(Math.abs(delta))}`,
      `偏差原因: ${focusDraft.deviationReason.trim() || "未填写"}`,
      `结束复盘/灵感: ${focusDraft.finishReflection.trim() || "未填写"}`,
    ].join("\n");
    setSavingFocusId(task.task_id);
    let knowledgeCreated = false;
    try {
      await stopTaskFocus(task.task_id, { elapsed_seconds: actualMinutes * 60, note });
      if (focusDraft.saveAsKnowledge && me?.open_id) {
        try {
          const knowledge = await createContribution({
            member_open_id: me.open_id,
            type: "document",
            title: focusDraft.knowledgeTitle.trim() || `任务复盘：${task.title}`,
            description: [
              `关联项目: ${task.project_name || task.project_id || "独立任务"}`,
              `关联任务: #${task.task_id} ${task.title}`,
              note,
            ].join("\n"),
            occurred_at: new Date().toISOString().slice(0, 10),
            role_in_contribution: "contributor",
            hours: actualMinutes > 0 ? Number((actualMinutes / 60).toFixed(2)) : null,
            score: null,
            proof_url: null,
            tags: [
              "任务知识",
              task.project_id ? `project:${task.project_id}` : "project:none",
              `task:${task.task_id}`,
            ].join(" "),
          });
          if (task.project_id) {
            setProjectKnowledge((prev) => ({
              ...prev,
              [task.project_id as number]: [knowledge, ...(prev[task.project_id as number] || [])],
            }));
          }
          knowledgeCreated = true;
        } catch {
          Toast.show({ icon: "fail", content: "任务已结束，知识文档同步失败" });
        }
      }
      const updated = await updateTask(task.task_id, {
        status: "done",
        progress_draft: [
          task.progress_draft || taskDraft.progress_draft || "",
          focusDraft.finishReflection.trim() ? `完成复盘: ${focusDraft.finishReflection.trim()}` : "",
        ].filter(Boolean).join("\n"),
      });
      applyTaskUpdate(updated);
      if (focusTimerRef.current[task.task_id]) {
        window.clearTimeout(focusTimerRef.current[task.task_id]);
        delete focusTimerRef.current[task.task_id];
      }
      setFocusSessions((prev) => {
        const next = { ...prev };
        delete next[task.task_id];
        return next;
      });
      loadTaskLogs(task.task_id);
      loadTaskFocusSummary(task.task_id);
      Toast.show({ icon: "success", content: knowledgeCreated ? "任务已结束，知识文档已生成" : "任务已结束并记录评估" });
    } catch {
      Toast.show({ icon: "fail", content: "结束任务失败" });
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
          const msg = (err as { response?: { status?: number } })?.response?.status === 403 ? "无权删除该项目" : "删除失败";
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
        setMemberMap(members.reduce<Record<string, Member>>((acc, member) => {
          acc[member.open_id] = member;
          return acc;
        }, {}));
      })
      .catch(() => setMemberMap({}));
  }, []);

  useEffect(() => {
    loadAIAssistants();
  }, []);

  useEffect(() => {
    let active = true;
    listTasks({ page_size: 500 })
      .then((page) => {
        if (active) setHistoryTasks(page.items);
      })
      .catch(() => {
        if (active) setHistoryTasks([]);
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
      setProjectHistory(
        responses.flatMap((response) => response.items)
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
        const unique = responses.flatMap((response) => response.items)
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
    if (workMode !== "tasks" && workMode !== "today") return undefined;
    let active = true;
    setLoading(true);
    const request = workMode === "today"
      ? listTodayTasks().then((items) => [{ items, total: items.length, page: 1, page_size: items.length }])
      : Promise.all((taskFilter === "open"
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
        const unique = responses.flatMap((response) => response.items)
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

  const filteredProjects = useMemo(() => {
    return projects
      .filter((project) => projectCategoryFilter === "all" || getProjectCategory(project) === projectCategoryFilter)
      .filter((project) => {
        if (!queryText) return true;
        return `${project.name} ${project.description || ""} ${project.department || ""} ${project.tags || ""}`.toLowerCase().includes(queryText);
      });
  }, [projectCategoryFilter, projects, queryText]);

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
        if (!queryText) return true;
        return `${task.title} ${task.description || ""} ${task.project_name || ""}`.toLowerCase().includes(queryText);
      });
  }, [assigneeFilter, queryText, tasks]);

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

  const projectDoneCount = filteredProjects.filter((project) => project.status === "completed").length;
  const totalProjectTasks = filteredProjects.reduce((sum, project) => sum + project.task_count, 0);
  const doneProjectTasks = filteredProjects.reduce((sum, project) => sum + project.task_done_count, 0);
  const sidebarProgress = totalProjectTasks ? Math.round((doneProjectTasks / totalProjectTasks) * 100) : 0;
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
  const missingThinkingTasks = openFilteredTasks.filter((task) => !(task.thinking || "").trim());
  const todayCompletedTasks = filteredTasks.filter((task) => task.status === "done");
  const todayThinkingLines = filteredTasks
    .map((task) => (task.thinking || "").trim())
    .filter(Boolean)
    .slice(0, 6);
  const todayCompletionLines = filteredTasks
    .map((task) => (task.progress_draft || "").trim())
    .filter(Boolean)
    .slice(0, 6);
  const todayDeviationRows = filteredTasks
    .map((task) => {
      if (!task.planned_start_date || !task.due_date) return null;
      const plannedMs = new Date(task.due_date).getTime() - new Date(task.planned_start_date).getTime();
      const actualSeconds = focusSummaries[task.task_id] || 0;
      if (!Number.isFinite(plannedMs) || plannedMs <= 0 || actualSeconds <= 0) return null;
      const plannedSeconds = plannedMs / 1000;
      return Math.abs(actualSeconds - plannedSeconds) / plannedSeconds;
    })
    .filter((value): value is number => value !== null);
  const todayDeviationRate = todayDeviationRows.length
    ? Math.round((todayDeviationRows.reduce((sum, value) => sum + value, 0) / todayDeviationRows.length) * 100)
    : 0;
  const overloadedAssignees = taskGroups.filter((group) => group.tasks.filter((task) => !["done", "cancelled"].includes(task.status)).length >= 5);
  const abnormalProjects = filteredProjects.filter((project) => project.is_abnormal);
  const stalledProjects = filteredProjects.filter((project) => project.status === "active" && project.task_count > 0 && project.task_done_count === 0);
  const managerInsights = workMode === "tasks"
    ? [
        overdueFilteredTasks.length > 0 ? `有 ${overdueFilteredTasks.length} 个任务已逾期，建议优先拉齐负责人和截止口径。` : "当前任务视图没有逾期项，节奏基本可控。",
        blockedFilteredTasks.length > 0 ? `有 ${blockedFilteredTasks.length} 个任务受阻，适合安排短会快速清障。` : "没有受阻任务，暂不需要专门清障会议。",
        overloadedAssignees.length > 0 ? `${overloadedAssignees.slice(0, 2).map((group) => group.title).join("、")} 任务负载偏高，建议拆分或转派。` : "负责人负载未出现明显集中。",
      ]
    : [
        abnormalProjects.length > 0 ? `有 ${abnormalProjects.length} 个异常项目，需要确认原因和负责人。` : "当前项目列表没有异常标记。",
        stalledProjects.length > 0 ? `有 ${stalledProjects.length} 个进行中项目尚无完成任务，建议检查拆解是否过粗。` : "进行中项目已有任务推进痕迹。",
        sidebarProgress < 35 && totalProjectTasks > 0 ? "整体任务完成率偏低，建议优先推进关键路径任务。" : "整体完成率处于可观察区间。",
      ];

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

  const renderTaskFocusPanel = (task: Task, canEdit: boolean) => {
	    const session = focusSessions[task.task_id];
	    const totalMinutes = Math.round((focusSummaries[task.task_id] || 0) / 60);
	    const recommendations = getTaskRecommendations(task);
	    const finishExpanded = Boolean(expandedFinishTaskIds[task.task_id]);
	    return (
	      <div style={{ marginTop: 10, borderTop: "1px solid #F2F3F5", paddingTop: 10 }}>
	        <div style={{ marginBottom: 10, background: "#FAFAFA", border: "1px solid #E8EAED", borderRadius: 6, padding: 8 }}>
          <div className="pm-section-title" style={{ marginBottom: 6 }}>相似历史任务</div>
          {recommendations.length ? (
            <div style={{ display: "grid", gap: 6 }}>
              {recommendations.map(({ task: item, sharedTokens }) => {
                const itemMinutes = Math.round((focusSummaries[item.task_id] || 0) / 60);
                return (
                  <div key={item.task_id} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 8, alignItems: "center", borderTop: "1px solid #F2F3F5", paddingTop: 6 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 750, color: "#1F2329", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</div>
                      <div className="pm-muted" style={{ marginTop: 3 }}>
                        {item.project_name || "独立任务"} · {item.assignee_open_id ? memberMap[item.assignee_open_id]?.name || item.assignee_open_id : "未分配"}
                        {sharedTokens.length ? ` · 共同关键词 ${sharedTokens.slice(0, 3).join("、")}` : ""}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
                      {renderTag(taskStatusStyle[item.status].label, taskStatusStyle[item.status])}
                      <span className="pm-muted">{itemMinutes ? formatMinutes(itemMinutes) : formatDate(item.completed_at || item.updated_at)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="pm-muted">暂无可推荐的相似历史任务。后续完成任务并沉淀知识后，这里会自动出现参考项。</div>
          )}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 10, alignItems: "start" }}>
          <div style={{ background: "#FFFFFF", border: "1px solid #F2F3F5", borderRadius: 6, padding: 8 }}>
            <div className="pm-section-title" style={{ marginBottom: 6 }}>启动前</div>
            <div className="pm-inline-fields">
              <div>
                <div className="pm-inline-label">预计时长</div>
                <input className="pm-inline-field" type="number" min="1" value={focusDraft.expectedMinutes} disabled={!canEdit || savingFocusId === task.task_id} onChange={(event) => setFocusDraft((prev) => ({ ...prev, expectedMinutes: event.target.value }))} />
              </div>
              <div>
                <div className="pm-inline-label">提醒时间</div>
                <input className="pm-inline-field" type="number" min="1" value={focusDraft.reminderMinutes} disabled={!canEdit || savingFocusId === task.task_id} onChange={(event) => setFocusDraft((prev) => ({ ...prev, reminderMinutes: event.target.value }))} />
              </div>
            </div>
            <div className="pm-inline-label" style={{ marginTop: 10 }}>启动思路</div>
            <textarea className="pm-inline-field pm-inline-textarea" value={focusDraft.startThinking} disabled={!canEdit || savingFocusId === task.task_id} placeholder="准备怎么做、先验证什么、需要谁配合" onChange={(event) => {
              const value = event.target.value;
              setFocusDraft((prev) => ({ ...prev, startThinking: value }));
              setTaskDraft((prev) => ({ ...prev, thinking: value }));
            }} />
            <div className="pm-inline-actions">
              {canEdit ? (
                <button className="pm-primary-btn" type="button" disabled={savingFocusId === task.task_id} onClick={() => void startTaskWork(task)}>
                  {session ? "重新启动计时" : "开始任务"}
                </button>
              ) : null}
              <span className="pm-muted">
                默认 1 小时{totalMinutes ? ` · 历史实际 ${formatMinutes(totalMinutes)}` : ""}{session ? ` · 本次开始 ${formatDate(session.startedAt)}` : ""}
              </span>
            </div>
          </div>

	          <div style={{ background: "#FAFAFA", border: "1px solid #F2F3F5", borderRadius: 6, padding: 8 }}>
	            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
	              <div className="pm-section-title">完成后</div>
	              <button className="pm-row-action" type="button" onClick={() => setExpandedFinishTaskIds((prev) => ({ ...prev, [task.task_id]: !prev[task.task_id] }))}>
	                {finishExpanded ? "收起" : "展开"}
	              </button>
	            </div>
	            {finishExpanded ? (
	              <>
	            <div className="pm-inline-fields">
              <div>
                <div className="pm-inline-label">实际耗时</div>
                <input className="pm-inline-field" type="number" min="0" value={focusDraft.actualMinutes} disabled={!canEdit || savingFocusId === task.task_id} placeholder={session ? "留空则按计时计算" : "分钟"} onChange={(event) => setFocusDraft((prev) => ({ ...prev, actualMinutes: event.target.value }))} />
              </div>
              <div>
                <div className="pm-inline-label">目标达成</div>
                <select className="pm-inline-field" value={focusDraft.goalAchieved} disabled={!canEdit || savingFocusId === task.task_id} onChange={(event) => setFocusDraft((prev) => ({ ...prev, goalAchieved: event.target.value as "yes" | "partly" | "no" }))}>
                  <option value="yes">达到目标</option>
                  <option value="partly">部分达到</option>
                  <option value="no">未达到</option>
                </select>
              </div>
            </div>
            <div className="pm-inline-label" style={{ marginTop: 10 }}>偏差原因</div>
            <textarea className="pm-inline-field pm-inline-textarea" value={focusDraft.deviationReason} disabled={!canEdit || savingFocusId === task.task_id} placeholder="为什么和预计不一致：需求不清、资料缺失、沟通等待、实现复杂度等" onChange={(event) => setFocusDraft((prev) => ({ ...prev, deviationReason: event.target.value }))} />
            <div className="pm-inline-label" style={{ marginTop: 10 }}>结束复盘 / 灵感</div>
            <textarea className="pm-inline-field pm-inline-textarea" value={focusDraft.finishReflection} disabled={!canEdit || savingFocusId === task.task_id} placeholder="沉淀给知识库的要点、下次可复用的方法、遗留想法" onChange={(event) => setFocusDraft((prev) => ({ ...prev, finishReflection: event.target.value }))} />
            <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, color: "#1F2329", fontSize: 12, fontWeight: 700 }}>
              <input type="checkbox" checked={focusDraft.saveAsKnowledge} disabled={!canEdit || savingFocusId === task.task_id} onChange={(event) => setFocusDraft((prev) => ({ ...prev, saveAsKnowledge: event.target.checked }))} />
              同步为知识文档
            </label>
            {focusDraft.saveAsKnowledge ? (
              <>
                <div className="pm-inline-label" style={{ marginTop: 10 }}>知识标题</div>
                <input className="pm-inline-field" value={focusDraft.knowledgeTitle} disabled={!canEdit || savingFocusId === task.task_id} placeholder={`任务复盘：${task.title}`} onChange={(event) => setFocusDraft((prev) => ({ ...prev, knowledgeTitle: event.target.value }))} />
                <div className="pm-muted" style={{ marginTop: 6 }}>会创建一条“文档贡献”，并用 project/task 标签关联到当前任务。</div>
              </>
            ) : null}
	            <div className="pm-inline-actions">
	              {canEdit ? (
	                <button className="pm-tool-btn" type="button" disabled={savingFocusId === task.task_id} onClick={() => void finishTaskWork(task)}>
	                  结束并完成任务
	                </button>
	              ) : null}
	            </div>
	              </>
	            ) : (
	              <div className="pm-muted" style={{ marginTop: 6 }}>结束任务、填写偏差原因、复盘和知识沉淀时再展开。</div>
	            )}
	          </div>
        </div>
      </div>
    );
  };

  const renderProjectRows = () => (
    <div className="pm-table-scroll">
    <table className="pm-table">
      <colgroup>
        <col style={{ width: "30%" }} />
        <col style={{ width: "11%" }} />
        <col style={{ width: "10%" }} />
        <col style={{ width: "9%" }} />
        <col style={{ width: "15%" }} />
        <col style={{ width: "8%" }} />
        <col style={{ width: "11%" }} />
        <col style={{ width: "6%" }} />
      </colgroup>
      <thead>
        <tr>
          <th>项目</th>
          <th>负责人</th>
          <th>状态</th>
          <th>优先级</th>
          <th>进度</th>
          <th>任务</th>
          <th>更新</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        {filteredProjects.map((project) => {
          const projectType = projectTypeStyle[project.my_project_type || project.project_type || "team"];
          const category = getProjectCategory(project);
          const progress = getProgress(project);
          const owner = memberMap[project.owner_open_id];
          const canEdit = canDeleteProject(project);
          const detail = expandedProjects[project.project_id] || project;
          const detailTasks = projectTasks[project.project_id] || [];
          const detailRelations = projectRelations[project.project_id] || [];
          const detailLogs = projectLogs[project.project_id] || [];
          const detailKnowledge = projectKnowledge[project.project_id] || [];
	          const detailMeetings = projectMeetings[project.project_id] || [];
	          const detailCalendarEvents = projectCalendarEvents[project.project_id] || [];
	          const meetingExpanded = Boolean(expandedMeetingProjectIds[project.project_id]);
          const meetingRows = detailMeetings.map((note) => ({
            note,
            urls: extractMeetingUrls(note),
            durationMinutes: parseMeetingDurationMinutes(note),
          }));
          const calendarMeetingRows = detailCalendarEvents.map((event) => ({
            event,
            urls: extractCalendarEventUrls(event),
            durationMinutes: calendarEventDurationMinutes(event),
          }));
          const knownMeetingDuration =
            meetingRows.reduce((sum, item) => sum + (item.durationMinutes || 0), 0)
            + calendarMeetingRows.reduce((sum, item) => sum + item.durationMinutes, 0);
          const plannedSeconds = detailTasks.reduce((sum, task) => {
            if (!task.planned_start_date || !task.due_date) return sum;
            const start = new Date(task.planned_start_date).getTime();
            const end = new Date(task.due_date).getTime();
            return Number.isFinite(start) && Number.isFinite(end) && end > start ? sum + Math.round((end - start) / 1000) : sum;
          }, 0);
          const actualSeconds = detailTasks.reduce((sum, task) => sum + (focusSummaries[task.task_id] || 0), 0);
          const participantCount = new Set(detailTasks.map((task) => task.assignee_open_id || task.created_by).filter(Boolean)).size || 1;
          const doneTaskCount = detailTasks.filter((task) => task.status === "done").length;
          const actualDeltaMinutes = Math.round((actualSeconds - plannedSeconds) / 60);
          const focusLoadedCount = detailTasks.filter((task) => focusSummaries[task.task_id] !== undefined).length;
          const actionableTasks = detailTasks.filter((task) => !["done", "cancelled"].includes(task.status));
          const inProgressTasks = actionableTasks.filter((task) => task.status === "in_progress");
          const blockedTasks = actionableTasks.filter((task) => task.status === "blocked");
          const overdueTasks = actionableTasks.filter((task) => task.due_date && new Date(task.due_date).getTime() < Date.now());
          const memberExecutionRows = Array.from(
            actionableTasks.reduce((groups, task) => {
              const openId = task.assignee_open_id || task.created_by || "__unassigned__";
              const current = groups.get(openId) || [];
              current.push(task);
              groups.set(openId, current);
              return groups;
            }, new Map<string, Task[]>()),
          )
            .map(([openId, items]) => ({
              openId,
              memberName: openId === "__unassigned__" ? "未分配" : memberMap[openId]?.name || openId,
              activeTask: items.find((task) => task.status === "in_progress") || items[0],
              tasks: items,
              blockedCount: items.filter((task) => task.status === "blocked").length,
              overdueCount: items.filter((task) => task.due_date && new Date(task.due_date).getTime() < Date.now()).length,
            }))
            .sort((left, right) => {
              if (left.activeTask.status === "in_progress" && right.activeTask.status !== "in_progress") return -1;
              if (right.activeTask.status === "in_progress" && left.activeTask.status !== "in_progress") return 1;
              return left.memberName.localeCompare(right.memberName, "zh-Hans-CN");
            });
          const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
          const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
          const taskChangedToday = detailTasks.filter((task) => new Date(task.updated_at || task.created_at).getTime() >= oneDayAgo).length;
          const taskChangedThisWeek = detailTasks.filter((task) => new Date(task.updated_at || task.created_at).getTime() >= oneWeekAgo).length;
          const tasksDoneThisWeek = detailTasks.filter((task) => task.completed_at && new Date(task.completed_at).getTime() >= oneWeekAgo).length;
          const knowledgeHours = detailKnowledge.reduce((sum, item) => sum + (Number(item.hours) || 0), 0);
          const knowledgeLikeCount = detailKnowledge.reduce((sum, item) => sum + (item.like_count || 0), 0);
          const knowledgeCommentCount = detailKnowledge.reduce((sum, item) => sum + (item.comment_count || 0), 0);
          const knowledgeInteractionCount = knowledgeLikeCount + knowledgeCommentCount;
          const scoredKnowledge = detailKnowledge.filter((item) => item.score !== null && item.score !== undefined);
          const averageKnowledgeScore = scoredKnowledge.length
            ? scoredKnowledge.reduce((sum, item) => sum + (Number(item.score) || 0), 0) / scoredKnowledge.length
            : null;
          const chatInteractionCount = (detail.chats || []).reduce((sum, chat) => sum + (chat.message_count || 0), 0);
          const derivedRelationCount = detailRelations.filter((relation) => relation.relation_type === "derived" || relation.relation_type === "transformed_to").length;
          const projectSummaryLines = [
            taskChangedToday > 0 ? `过去 24 小时有 ${taskChangedToday} 个任务发生更新。` : "过去 24 小时暂无任务更新，建议确认项目是否需要推进。",
            tasksDoneThisWeek > 0 ? `本周完成 ${tasksDoneThisWeek} 个任务，已有可沉淀成果。` : "本周暂无完成任务，适合检查拆解粒度和截止时间。",
            detailKnowledge.length > 0 ? `已关联 ${detailKnowledge.length} 条知识，沉淀 ${knowledgeHours.toFixed(1)} 小时，获得 ${knowledgeInteractionCount} 次互动。` : "项目暂无知识沉淀，任务完成时建议同步为知识文档。",
            chatInteractionCount > 0 ? `关联群聊累计 ${chatInteractionCount} 条消息，可继续从话题中提炼日报。` : "暂未形成群聊互动数据，可关联项目话题后同步。",
          ];
          const projectRecommendations = getProjectRecommendations(project);
          const completedProjectRecommendations = projectRecommendations.filter((item) => item.project.status === "completed" || item.project.status === "archived");
          const activeProjectRecommendations = projectRecommendations.filter((item) => !["completed", "archived"].includes(item.project.status));
          const visibleProjectChats = visibleChats[project.project_id] || [];
          return (
            <Fragment key={project.project_id}>
            <tr onClick={() => openProjectInline(project)} style={{ cursor: "pointer", background: expandedProjectId === project.project_id ? "#F7F8FA" : undefined }}>
              <td>
                <div className="pm-name-cell">
                  <div className="pm-name-main">{project.name}</div>
                  <div className="pm-name-sub">
                    {renderTag(projectType.label, projectType)}
                    {category !== "all" ? <span style={{ marginLeft: 6 }}>{renderTag(category, { bg: "#F0FDF4", fg: "#15803D" })}</span> : null}
                    {project.is_abnormal ? <span style={{ marginLeft: 6 }}>{renderTag("异常", { bg: "#FEE2E2", fg: "#B91C1C" })}</span> : null}
                  </div>
                </div>
              </td>
              <td>{renderAssignee(project.owner_open_id || owner?.open_id)}</td>
              <td>{renderTag(projectStatusStyle[project.status].label, projectStatusStyle[project.status])}</td>
              <td>{renderTag(priorityStyle[project.priority].label, priorityStyle[project.priority])}</td>
              <td>
                <div className="pm-sidebar-metric-row" style={{ marginBottom: 4 }}>
                  <span>{progress}%</span>
                  <span>{project.task_done_count}/{project.task_count}</span>
                </div>
                <div className="pm-progress"><span style={{ width: `${progress}%` }} /></div>
              </td>
              <td>{project.task_count}</td>
              <td className="pm-muted">{formatDate(project.updated_at)}</td>
              <td onClick={(event) => event.stopPropagation()}>
                <button className="pm-row-action" type="button" onClick={() => openProjectInline(project)}>
                  {expandedProjectId === project.project_id ? "收起" : "展开"}
                </button>
                {canDeleteProject(project) ? (
                  <button
                    className="pm-row-action pm-row-action-danger"
                    type="button"
                    disabled={deletingId === project.project_id}
                    onClick={() => handleDeleteProject(project)}
                  >
                    删除
                  </button>
                ) : null}
              </td>
            </tr>
            {expandedProjectId === project.project_id ? (
              <tr>
                <td colSpan={8} style={{ padding: 0 }}>
                  <div className="pm-inline-editor">
                    <div className="pm-inline-grid">
                      <div className="pm-inline-panel">
                        <div className="pm-inline-label">项目名称</div>
                        <input className="pm-inline-field" value={projectDraft.name} disabled={!canEdit} onChange={(event) => setProjectDraft((prev) => ({ ...prev, name: event.target.value }))} />
                        <div className="pm-inline-label" style={{ marginTop: 10 }}>项目描述</div>
                        <textarea className="pm-inline-field pm-inline-textarea" value={projectDraft.description} disabled={!canEdit} onChange={(event) => setProjectDraft((prev) => ({ ...prev, description: event.target.value }))} />
                        <div className="pm-inline-actions">
                          {canEdit ? (
                            <button className="pm-primary-btn" type="button" disabled={savingProjectId === project.project_id} onClick={() => void saveProjectInline(project)}>
                              保存项目
                            </button>
                          ) : null}
                          <button className="pm-tool-btn" type="button" onClick={() => setExpandedProjectId(null)}>收起</button>
                        </div>
	                        <div style={{ marginTop: 12, padding: 10, border: "1px solid #E5E6EB", borderRadius: 6, background: "#FAFAFA" }}>
	                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8 }}>
	                            <div>
	                              <div className="pm-section-title" style={{ marginBottom: 2 }}>关联飞书会议</div>
	                              <div className="pm-muted">
	                                {projectMeetingsLoadingId === project.project_id ? "加载中" : `已关联 ${detailMeetings.length + detailCalendarEvents.length} 场`}
	                                {knownMeetingDuration ? ` · ${formatMinutes(knownMeetingDuration)}` : ""}
	                              </div>
	                            </div>
	                            <button className="pm-row-action" type="button" onClick={() => setExpandedMeetingProjectIds((prev) => ({ ...prev, [project.project_id]: !prev[project.project_id] }))}>
	                              {meetingExpanded ? "收起" : "展开"}
	                            </button>
	                          </div>
	                          {meetingExpanded ? (
	                          <>
	                          <button className="pm-row-action" type="button" disabled={projectMeetingsLoadingId === project.project_id} onClick={() => loadProjectMeetings(project.project_id)}>
	                            刷新会议
	                          </button>
	                          <div style={{ display: "grid", gap: 6, marginBottom: 10 }}>
                            <div className="pm-inline-fields">
                              <div>
                                <div className="pm-inline-label">会议标题</div>
                                <input className="pm-inline-field" value={meetingLinkDrafts[project.project_id]?.title || ""} placeholder={`${project.name} 会议`} onChange={(event) => setMeetingLinkDrafts((prev) => ({ ...prev, [project.project_id]: { ...(prev[project.project_id] || { title: "", url: "", durationMinutes: "" }), title: event.target.value } }))} />
                              </div>
                              <div>
                                <div className="pm-inline-label">飞书会议链接</div>
                                <input className="pm-inline-field" value={meetingLinkDrafts[project.project_id]?.url || ""} placeholder="https://..." onChange={(event) => setMeetingLinkDrafts((prev) => ({ ...prev, [project.project_id]: { ...(prev[project.project_id] || { title: "", url: "", durationMinutes: "" }), url: event.target.value } }))} />
                              </div>
                              <div>
                                <div className="pm-inline-label">时长(分钟)</div>
                                <input className="pm-inline-field" type="number" min="0" value={meetingLinkDrafts[project.project_id]?.durationMinutes || ""} placeholder="60" onChange={(event) => setMeetingLinkDrafts((prev) => ({ ...prev, [project.project_id]: { ...(prev[project.project_id] || { title: "", url: "", durationMinutes: "" }), durationMinutes: event.target.value } }))} />
                              </div>
                            </div>
                            <button className="pm-primary-btn" type="button" disabled={savingMeetingProjectId === project.project_id} onClick={() => void saveProjectMeetingLink(project)}>
                              保存会议链接
                            </button>
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, marginBottom: 8 }}>
                            <div><div className="pm-inline-label">会议数</div><div style={{ fontWeight: 850 }}>{projectMeetingsLoadingId === project.project_id ? "加载中" : detailMeetings.length + detailCalendarEvents.length}</div></div>
                            <div><div className="pm-inline-label">识别时长</div><div style={{ fontWeight: 850 }}>{knownMeetingDuration ? formatMinutes(knownMeetingDuration) : "未识别"}</div></div>
                            <div><div className="pm-inline-label">会议链接</div><div style={{ fontWeight: 850 }}>{meetingRows.reduce((sum, item) => sum + item.urls.length, 0) + calendarMeetingRows.reduce((sum, item) => sum + item.urls.length, 0)}</div></div>
                          </div>
                          {calendarMeetingRows.length ? (
                            <div style={{ display: "grid", gap: 6, marginBottom: 8 }}>
                              {calendarMeetingRows.slice(0, 4).map(({ event, urls, durationMinutes }) => (
                                <div key={event.event_id} style={{ padding: 8, border: "1px solid #F2F3F5", borderRadius: 6, background: "#FFFFFF" }}>
                                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                                    <div style={{ minWidth: 0, fontSize: 12, fontWeight: 850, color: "#1F2329", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{event.title}</div>
                                    <div className="pm-muted" style={{ whiteSpace: "nowrap" }}>{durationMinutes ? formatMinutes(durationMinutes) : "时长未识别"}</div>
                                  </div>
                                  <div className="pm-muted" style={{ marginTop: 3 }}>{formatDate(event.start_at)} · 日历同步</div>
                                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                                    {urls.slice(0, 2).map((url) => (
                                      <a key={url} className="pm-row-action" href={url} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>
                                        打开会议
                                      </a>
                                    ))}
                                    {urls.length === 0 ? <span className="pm-muted">未识别到飞书会议链接</span> : null}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : null}
                          {meetingRows.length ? (
                            <div style={{ display: "grid", gap: 6 }}>
                              {meetingRows.slice(0, 4).map(({ note, urls, durationMinutes }) => (
                                <div key={note.note_id} style={{ padding: 8, border: "1px solid #F2F3F5", borderRadius: 6, background: "#FFFFFF" }}>
                                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                                    <div style={{ minWidth: 0, fontSize: 12, fontWeight: 850, color: "#1F2329", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{note.meeting_title}</div>
                                    <div className="pm-muted" style={{ whiteSpace: "nowrap" }}>{durationMinutes ? formatMinutes(durationMinutes) : "时长未识别"}</div>
                                  </div>
                                  <div className="pm-muted" style={{ marginTop: 3 }}>{formatDate(note.meeting_date)} · {note.meeting_type}</div>
                                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                                    {urls.slice(0, 2).map((url) => (
                                      <a key={url} className="pm-row-action" href={url} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>
                                        打开会议
                                      </a>
                                    ))}
                                    {urls.length === 0 ? <span className="pm-muted">未识别到飞书会议链接</span> : null}
                                  </div>
                                </div>
                              ))}
                            </div>
	                          ) : (
	                            calendarMeetingRows.length === 0 ? <div className="pm-muted">暂无关联会议。可直接输入会议链接保存；飞书日历日程请在日历页面同步，日程文本包含 project:{project.project_id} 时会自动关联。</div> : null
	                          )}
	                          </>
	                          ) : null}
	                        </div>
                      </div>
                      <div className="pm-inline-panel">
                        <div className="pm-inline-fields">
                          <div>
                            <div className="pm-inline-label">状态</div>
                            <select className="pm-inline-field" value={projectDraft.status} disabled={!canEdit} onChange={(event) => setProjectDraft((prev) => ({ ...prev, status: event.target.value as ProjectStatus }))}>
                              <option value="planning">规划中</option>
                              <option value="active">进行中</option>
                              <option value="paused">已暂停</option>
                              <option value="completed">已完成</option>
                              <option value="archived">已存档</option>
                            </select>
                          </div>
                          <div>
                            <div className="pm-inline-label">优先级</div>
                            <select className="pm-inline-field" value={projectDraft.priority} disabled={!canEdit} onChange={(event) => setProjectDraft((prev) => ({ ...prev, priority: event.target.value as ProjectPriority }))}>
                              <option value="low">低</option>
                              <option value="medium">中</option>
                              <option value="high">高</option>
                              <option value="urgent">紧急</option>
                            </select>
                          </div>
                          <div>
                            <div className="pm-inline-label">类型</div>
                            <select className="pm-inline-field" value={projectDraft.project_type} disabled={!canEdit} onChange={(event) => setProjectDraft((prev) => ({ ...prev, project_type: event.target.value as ProjectType }))}>
                              <option value="team">团队项目</option>
                              <option value="personal">个人项目</option>
                            </select>
                          </div>
                          <div>
                            <div className="pm-inline-label">部门</div>
                            <select className="pm-inline-field" value={projectDraft.department} disabled={!canEdit} onChange={(event) => setProjectDraft((prev) => ({ ...prev, department: event.target.value }))}>
                              <option value="">未设置</option>
                              {departmentOptions.map((department) => (
                                <option key={department} value={department}>{department}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <div className="pm-inline-label">开始时间</div>
                            <input className="pm-inline-field" type="date" value={projectDraft.start_date} disabled={!canEdit} onChange={(event) => setProjectDraft((prev) => ({ ...prev, start_date: event.target.value }))} />
                          </div>
                          <div>
                            <div className="pm-inline-label">目标截止</div>
                            <input className="pm-inline-field" type="date" value={projectDraft.target_end_date} disabled={!canEdit} onChange={(event) => setProjectDraft((prev) => ({ ...prev, target_end_date: event.target.value }))} />
                          </div>
                          <div>
                            <div className="pm-inline-label">完成时间</div>
                            <input className="pm-inline-field" type="date" value={projectDraft.actual_end_date} disabled={!canEdit} onChange={(event) => setProjectDraft((prev) => ({ ...prev, actual_end_date: event.target.value }))} />
                          </div>
                          <div>
                            <div className="pm-inline-label">积分</div>
                            <input className="pm-inline-field" type="number" min="0" value={projectDraft.points_awarded} disabled={!canEdit} onChange={(event) => setProjectDraft((prev) => ({ ...prev, points_awarded: event.target.value }))} />
                          </div>
                        </div>
                        <div className="pm-inline-label" style={{ marginTop: 10 }}>大类标签</div>
                        <select className="pm-inline-field" value={projectDraft.category} disabled={!canEdit} onChange={(event) => setProjectDraft((prev) => ({ ...prev, category: event.target.value as ProjectCategoryFilter }))}>
                          <option value="all">未设置</option>
                          {projectCategoryValues.map((category) => (
                            <option key={category} value={category}>{category}</option>
                          ))}
                        </select>
                        <div className="pm-inline-label" style={{ marginTop: 10 }}>其他标签</div>
                        <input className="pm-inline-field" value={projectDraft.tags} disabled={!canEdit} onChange={(event) => setProjectDraft((prev) => ({ ...prev, tags: event.target.value }))} />
                      </div>
                    </div>
                    <div className="pm-inline-panel" style={{ marginTop: 12 }}>
                      <div className="pm-section-title">详情信息</div>
                      {projectDetailLoadingId === project.project_id ? (
                        <div className="pm-muted">正在加载完整项目详情...</div>
                      ) : (
                        <>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8, marginBottom: 12 }}>
                            <div><div className="pm-inline-label">负责人</div>{renderAssignee(detail.owner_open_id)}</div>
                            <div><div className="pm-inline-label">开始</div><div>{formatDate(detail.start_date)}</div></div>
                            <div><div className="pm-inline-label">目标截止</div><div>{formatDate(detail.target_end_date)}</div></div>
                            <div><div className="pm-inline-label">完成</div><div>{formatDate(detail.actual_end_date)}</div></div>
                            <div><div className="pm-inline-label">任务进度</div><div>{detail.task_done_count}/{detail.task_count}</div></div>
                            <div><div className="pm-inline-label">已进行</div><div>{detail.days_active} 天</div></div>
                            <div><div className="pm-inline-label">知识</div><div>{projectKnowledgeLoadingId === project.project_id ? "加载中" : `${detailKnowledge.length} 条`}</div></div>
                            <div><div className="pm-inline-label">更新</div><div>{formatDate(detail.updated_at)}</div></div>
                          </div>
                          {detail.is_abnormal ? (
                            <div style={{ marginBottom: 10, color: "#B91C1C", fontSize: 12, fontWeight: 700 }}>
                              异常：{detail.abnormal_reason || "项目存在异常"}
                            </div>
                          ) : null}
                          <div style={{ marginBottom: 12, padding: 10, border: "1px solid #E5E6EB", borderRadius: 6, background: "#FAFAFA" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8 }}>
                              <div className="pm-section-title" style={{ marginBottom: 0 }}>项目效能</div>
                              <button className="pm-row-action" type="button" onClick={() => loadProjectFocusSummaries(detailTasks)}>
                                刷新实际耗时
                              </button>
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 8 }}>
                              <div><div className="pm-inline-label">预计总时间</div><div style={{ fontWeight: 800 }}>{formatMinutes(Math.round(plannedSeconds / 60))}</div></div>
                              <div><div className="pm-inline-label">实际专注</div><div style={{ fontWeight: 800 }}>{formatMinutes(Math.round(actualSeconds / 60))}</div></div>
                              <div><div className="pm-inline-label">偏差</div><div style={{ fontWeight: 800, color: actualDeltaMinutes > 0 ? "#B45309" : "#15803D" }}>{plannedSeconds ? `${actualDeltaMinutes >= 0 ? "+" : "-"}${formatMinutes(Math.abs(actualDeltaMinutes))}` : "未计算"}</div></div>
                              <div><div className="pm-inline-label">人均投入</div><div style={{ fontWeight: 800 }}>{formatMinutes(Math.round(actualSeconds / 60 / participantCount))}</div></div>
                              <div><div className="pm-inline-label">完成任务</div><div style={{ fontWeight: 800 }}>{doneTaskCount}/{detailTasks.length}</div></div>
                            </div>
                            <div className="pm-muted" style={{ marginTop: 8 }}>
                              实际耗时已加载 {focusLoadedCount}/{detailTasks.length} 个任务；已关联会议 {detailMeetings.length} 场，识别会议时长 {knownMeetingDuration ? formatMinutes(knownMeetingDuration) : "未识别"}。
                            </div>
                          </div>
                          <div style={{ marginBottom: 12, padding: 10, border: "1px solid #E5E6EB", borderRadius: 6, background: "#FFFFFF" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8 }}>
                              <div className="pm-section-title" style={{ marginBottom: 0 }}>实时执行态势</div>
                              <div style={{ display: "flex", gap: 6 }}>
                                <button className="pm-row-action" type="button" disabled={larkStatusLoadingProjectId === project.project_id} onClick={() => loadProjectLarkStatuses(project.project_id, detailTasks)}>刷新状态</button>
                                <button className="pm-row-action" type="button" onClick={() => navigate("/calendar")}>安排会议</button>
                              </div>
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 8, marginBottom: 8 }}>
                              <div><div className="pm-inline-label">推进中</div><div style={{ fontWeight: 800 }}>{inProgressTasks.length}</div></div>
                              <div><div className="pm-inline-label">可行动任务</div><div style={{ fontWeight: 800 }}>{actionableTasks.length}</div></div>
                              <div><div className="pm-inline-label">受阻</div><div style={{ fontWeight: 800, color: blockedTasks.length ? "#B91C1C" : "#15803D" }}>{blockedTasks.length}</div></div>
                              <div><div className="pm-inline-label">逾期</div><div style={{ fontWeight: 800, color: overdueTasks.length ? "#B45309" : "#15803D" }}>{overdueTasks.length}</div></div>
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "minmax(110px, 0.6fr) minmax(180px, 1.4fr) 88px 74px 74px 84px", gap: 8, color: "#646A73", fontSize: 12, fontWeight: 800, padding: "6px 0", borderBottom: "1px solid #F2F3F5" }}>
                              <div>成员</div><div>此刻任务</div><div>飞书状态</div><div>任务状态</div><div>逾期</div><div>任务数</div>
                            </div>
                            {memberExecutionRows.slice(0, 8).map((row) => (
                              <div key={row.openId} style={{ display: "grid", gridTemplateColumns: "minmax(110px, 0.6fr) minmax(180px, 1.4fr) 88px 74px 74px 84px", gap: 8, alignItems: "center", padding: "7px 0", borderBottom: "1px solid #F7F8FA", fontSize: 12 }}>
                                <div style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.memberName}</div>
                                <div style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.activeTask.title}</div>
                                <div style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: larkStatuses[row.openId] ? "#15803D" : "#646A73", fontWeight: larkStatuses[row.openId] ? 800 : 500 }}>{row.openId === "__unassigned__" ? "-" : larkStatusLabel(larkStatuses[row.openId])}</div>
                                <div>{renderTag(taskStatusStyle[row.activeTask.status].label, taskStatusStyle[row.activeTask.status])}</div>
                                <div style={{ color: row.overdueCount ? "#B45309" : "#646A73", fontWeight: row.overdueCount ? 800 : 500 }}>{row.overdueCount}</div>
                                <div className="pm-muted">{row.tasks.length}{row.blockedCount ? ` · 阻塞${row.blockedCount}` : ""}</div>
                              </div>
                            ))}
                            {memberExecutionRows.length === 0 ? <div className="pm-muted">当前没有进行中、待办或受阻任务</div> : null}
                            {memberExecutionRows.length > 8 ? <div className="pm-muted" style={{ marginTop: 6 }}>还有 {memberExecutionRows.length - 8} 位成员未显示</div> : null}
                          </div>
                          <div style={{ marginBottom: 12, padding: 10, border: "1px solid #E5E6EB", borderRadius: 6, background: "#FAFAFA" }}>
                            <div className="pm-section-title">项目日报 / 周报摘要</div>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(118px, 1fr))", gap: 8, marginBottom: 8 }}>
                              <div><div className="pm-inline-label">今日任务更新</div><div style={{ fontWeight: 850 }}>{taskChangedToday}</div></div>
                              <div><div className="pm-inline-label">本周任务更新</div><div style={{ fontWeight: 850 }}>{taskChangedThisWeek}</div></div>
                              <div><div className="pm-inline-label">本周完成</div><div style={{ fontWeight: 850 }}>{tasksDoneThisWeek}</div></div>
                              <div><div className="pm-inline-label">知识沉淀</div><div style={{ fontWeight: 850 }}>{detailKnowledge.length}</div></div>
                              <div><div className="pm-inline-label">沉淀时长</div><div style={{ fontWeight: 850 }}>{knowledgeHours.toFixed(1)}h</div></div>
                              <div><div className="pm-inline-label">知识互动</div><div style={{ fontWeight: 850 }}>{knowledgeInteractionCount}</div></div>
                              <div><div className="pm-inline-label">群聊消息</div><div style={{ fontWeight: 850 }}>{chatInteractionCount}</div></div>
                              <div><div className="pm-inline-label">衍生/转化</div><div style={{ fontWeight: 850 }}>{derivedRelationCount}</div></div>
                              <div><div className="pm-inline-label">知识评分</div><div style={{ fontWeight: 850 }}>{averageKnowledgeScore === null ? "未评分" : averageKnowledgeScore.toFixed(1)}</div></div>
                            </div>
                            <div style={{ display: "grid", gap: 6 }}>
                              {projectSummaryLines.map((line) => (
                                <div key={line} style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 12, lineHeight: 1.5, color: "#1F2329" }}>
                                  <span style={{ width: 6, height: 6, borderRadius: 999, background: "#3370FF", marginTop: 7, flex: "0 0 auto" }} />
                                  <span>{line}</span>
                                </div>
                              ))}
                            </div>
                            <div className="pm-muted" style={{ marginTop: 8 }}>知识互动 = 点赞 {knowledgeLikeCount} + 评论 {knowledgeCommentCount}，评论内容可在项目知识里展开查看。</div>
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.35fr) minmax(260px, 0.65fr)", gap: 12 }}>
                            <div>
                              <div className="pm-section-title">成员</div>
                              {canEdit ? (
                                <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 6, marginBottom: 8 }}>
                                  <select
                                    className="pm-inline-field"
                                    value={projectMemberAddDrafts[project.project_id] || ""}
                                    onChange={(event) => setProjectMemberAddDrafts((prev) => ({ ...prev, [project.project_id]: event.target.value }))}
                                  >
                                    <option value="">选择要添加的成员</option>
                                    {memberOptions
                                      .filter((item) => !(detail.members || []).some((member) => !member.left_at && member.member_open_id === item.openId))
                                      .map((item) => (
                                        <option key={item.openId} value={item.openId}>{item.name}</option>
                                      ))}
                                  </select>
                                  <button
                                    className="pm-tool-btn"
                                    type="button"
                                    disabled={savingProjectMemberKey !== null}
                                    onClick={() => void addProjectMemberInline(project.project_id)}
                                  >
                                    添加
                                  </button>
                                </div>
                              ) : null}
                              <div style={{ display: "grid", gap: 8, maxHeight: 260, overflow: "auto" }}>
                                {(detail.members || []).filter((member) => !member.left_at).slice(0, 16).map((member) => {
                                  const key = projectMemberDraftKey(project.project_id, member.member_open_id);
                                  const draft = projectMemberDrafts[key] || { role: member.role, share_ratio: String(member.share_ratio ?? 0), tags: member.tags || "" };
                                  const person = memberMap[member.member_open_id];
                                  return (
                                    <div key={member.member_open_id} style={{ display: "grid", gridTemplateColumns: "minmax(120px, 1fr) 82px 68px minmax(90px, 1fr) auto", gap: 6, alignItems: "center", padding: 6, border: "1px solid #F2F3F5", borderRadius: 6, background: "#FAFAFA" }}>
                                      <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 6 }}>
                                        <MemberAvatarLink openId={member.member_open_id} viewerOpenId={me?.open_id} src={person?.avatar_url} name={person?.name || member.member_open_id} size={24} />
                                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12, fontWeight: 800 }}>{person?.name || member.member_open_id}</span>
                                      </div>
                                      <select className="pm-inline-field" value={draft.role} disabled={!canEdit} onChange={(event) => setProjectMemberDrafts((prev) => ({ ...prev, [key]: { ...draft, role: event.target.value as PMRole } }))}>
                                        <option value="owner">负责</option>
                                        <option value="co_lead">协同</option>
                                        <option value="member">成员</option>
                                        <option value="observer">观察</option>
                                      </select>
                                      <input className="pm-inline-field" type="number" min="0" max="1" step="0.05" value={draft.share_ratio} disabled={!canEdit} onChange={(event) => setProjectMemberDrafts((prev) => ({ ...prev, [key]: { ...draft, share_ratio: event.target.value } }))} />
                                      <input className="pm-inline-field" value={draft.tags} disabled={!canEdit} placeholder="标签" onChange={(event) => setProjectMemberDrafts((prev) => ({ ...prev, [key]: { ...draft, tags: event.target.value } }))} />
                                      {canEdit ? (
                                        <div style={{ display: "flex", gap: 4 }}>
                                          <button className="pm-row-action" type="button" disabled={savingProjectMemberKey === key} onClick={() => void saveProjectMemberInline(project.project_id, member)}>保存</button>
                                          {member.role !== "owner" ? <button className="pm-row-action pm-row-action-danger" type="button" disabled={savingProjectMemberKey === key} onClick={() => void removeProjectMemberInline(project.project_id, member.member_open_id)}>移出</button> : null}
                                        </div>
                                      ) : null}
                                    </div>
                                  );
                                })}
                                {(detail.members || []).filter((member) => !member.left_at).length === 0 ? <span className="pm-muted">暂无成员</span> : null}
                              </div>
                            </div>
                            <div>
                              <div className="pm-section-title">最近日志</div>
                              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 220, overflow: "auto" }}>
                                {detailLogs.slice(0, 10).map((log) => (
                                  <div key={log.log_id} style={{ padding: "6px 0", borderBottom: "1px solid #F2F3F5", color: "#646A73", fontSize: 12 }}>
                                    {formatDate(log.created_at)} · {log.title}
                                  </div>
                                ))}
                                {detailLogs.length === 0 ? <span className="pm-muted">暂无日志</span> : null}
                              </div>
                            </div>
                          </div>
                          <div style={{ marginTop: 12, padding: 10, border: "1px solid #F2F3F5", borderRadius: 6, background: "#FAFAFA" }}>
                            <div className="pm-section-title">关联项目</div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                              {detailRelations.slice(0, 4).map((relation) => (
                                <span key={relation.relation_id} className="pm-tag" style={{ background: "#F2F3F5", color: "#4E5969" }}>
                                  {relation.relation_label} · {relation.project_name}
                                </span>
                              ))}
                              {detailRelations.length > 4 ? <span className="pm-muted">+{detailRelations.length - 4}</span> : null}
                              {detailRelations.length === 0 ? <span className="pm-muted">暂无关联</span> : null}
                            </div>
                          </div>
                          <div style={{ marginTop: 12, padding: 10, border: "1px solid #F2F3F5", borderRadius: 6, background: "#FFFFFF" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8 }}>
                              <div className="pm-section-title" style={{ marginBottom: 0 }}>项目知识</div>
                              <button className="pm-row-action" type="button" disabled={projectKnowledgeLoadingId === project.project_id} onClick={() => loadProjectKnowledge(project.project_id)}>
                                刷新
                              </button>
                            </div>
                            {projectKnowledgeLoadingId === project.project_id ? <div className="pm-muted">正在加载知识条目...</div> : null}
                            {projectKnowledgeLoadingId !== project.project_id && detailKnowledge.length === 0 ? <div className="pm-muted">暂无任务沉淀知识</div> : null}
                            {detailKnowledge.slice(0, 6).map((item) => {
                              const taskTag = splitProjectTags(item.tags).find((tag) => tag.startsWith("task:"));
                              const comments = knowledgeComments[item.contribution_id];
                              return (
                                <Fragment key={item.contribution_id}>
                                  <div style={{ display: "grid", gridTemplateColumns: "minmax(180px, 1fr) 100px 84px 112px", gap: 8, padding: "7px 0", borderTop: "1px solid #F2F3F5", alignItems: "center", fontSize: 12 }}>
                                    <div style={{ minWidth: 0 }}>
                                      <div style={{ fontWeight: 800, color: "#1F2329", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</div>
                                      <div className="pm-muted" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{taskTag || "未关联任务"} · {item.description?.split("\n").slice(-1)[0] || "无摘要"}</div>
                                    </div>
                                    <div className="pm-muted">{memberMap[item.member_open_id]?.name || item.member_open_id}</div>
                                    <div className="pm-muted">{formatDate(item.occurred_at)}</div>
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
                                      <button className="pm-row-action" type="button" disabled={likingKnowledgeId === item.contribution_id} onClick={() => void likeProjectKnowledge(project.project_id, item.contribution_id)}>
                                        赞 {item.like_count || 0}
                                      </button>
                                      <button className="pm-row-action" type="button" disabled={loadingKnowledgeCommentsId === item.contribution_id} onClick={() => void toggleKnowledgeComments(item.contribution_id)}>
                                        {comments ? "收起" : `评 ${item.comment_count || 0}`}
                                      </button>
                                    </div>
                                  </div>
                                  {comments ? (
                                    <div style={{ margin: "0 0 8px", padding: 8, border: "1px solid #F2F3F5", borderRadius: 6, background: "#FAFAFA" }}>
                                      {comments.length ? comments.map((comment) => (
                                        <div key={comment.comment_id} style={{ padding: "5px 0", borderBottom: "1px solid #F2F3F5", fontSize: 12 }}>
                                          <div style={{ color: "#646A73", marginBottom: 2 }}>
                                            {memberMap[comment.author_open_id]?.name || comment.author_open_id} · {formatDate(comment.created_at)}
                                          </div>
                                          <div style={{ color: "#1F2329", lineHeight: 1.5, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{comment.content}</div>
                                        </div>
                                      )) : <div className="pm-muted">暂无评论</div>}
                                      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 6, marginTop: 8 }}>
                                        <input
                                          className="pm-inline-field"
                                          value={knowledgeCommentDrafts[item.contribution_id] || ""}
                                          placeholder="补充建议、复用经验或问题"
                                          onChange={(event) => setKnowledgeCommentDrafts((prev) => ({ ...prev, [item.contribution_id]: event.target.value }))}
                                        />
                                        <button className="pm-tool-btn" type="button" disabled={savingKnowledgeCommentId === item.contribution_id} onClick={() => void submitKnowledgeComment(project.project_id, item.contribution_id)}>
                                          评论
                                        </button>
                                      </div>
                                    </div>
                                  ) : null}
                                </Fragment>
                              );
                            })}
                            {detailKnowledge.length > 6 ? <div className="pm-muted" style={{ marginTop: 6 }}>还有 {detailKnowledge.length - 6} 条知识未显示</div> : null}
                          </div>
                          <div style={{ marginTop: 12 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8 }}>
                              <div className="pm-section-title" style={{ marginBottom: 0 }}>群聊与话题</div>
                              <div style={{ display: "flex", gap: 6 }}>
                                <input className="pm-inline-field" style={{ width: 180, minHeight: 28 }} value={chatQuery} placeholder="搜索我的飞书群聊" onChange={(event) => setChatQuery(event.target.value)} />
                                <button className="pm-tool-btn" type="button" disabled={chatSearchingId === project.project_id} onClick={() => void searchVisibleChats(project.project_id)}>
                                  搜索群聊
                                </button>
                              </div>
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: visibleProjectChats.length > 0 ? "minmax(0, 1fr) minmax(0, 1fr)" : "1fr", gap: 12 }}>
                              <div className="pm-inline-panel">
                                <div className="pm-section-title">已关联群聊/话题</div>
                                {(detail.chats || []).map((chat) => (
                                  <div key={chat.project_chat_id} style={{ padding: "8px 0", borderBottom: "1px solid #F2F3F5" }}>
                                    <div style={{ fontSize: 13, fontWeight: 700 }}>{chat.chat_name || "飞书群聊"}</div>
                                    <div className="pm-muted">{chat.selected_topic_title || chat.latest_topic_title || chat.selected_topic_key || "未选话题"} · 消息 {chat.message_count}</div>
                                    <div className="pm-inline-actions" style={{ marginTop: 6 }}>
                                      <button className="pm-row-action" type="button" disabled={syncingChatId === chat.project_chat_id} onClick={() => void syncChat(project.project_id, chat.project_chat_id)}>同步</button>
                                      <button className="pm-row-action" type="button" disabled={messageLoadingId === chat.project_chat_id} onClick={() => void toggleChatMessages(project.project_id, chat.project_chat_id, chat.selected_topic_key || chat.latest_topic_key)}>
                                        {chatMessages[chat.project_chat_id] ? "收起消息" : "展开消息"}
                                      </button>
                                    </div>
                                    {chatMessages[chat.project_chat_id] ? (
                                      <div style={{ marginTop: 8, maxHeight: 220, overflow: "auto", border: "1px solid #F2F3F5", borderRadius: 6, background: "#FFFFFF" }}>
                                        {chatMessages[chat.project_chat_id].map((message) => (
                                          <div key={message.project_chat_message_id} style={{ padding: 8, borderBottom: "1px solid #F7F8FA", fontSize: 12 }}>
                                            <div className="pm-muted">{message.sender_name || message.sender_open_id || "未知成员"} · {formatDate(message.message_created_at)}</div>
                                            <div style={{ marginTop: 4, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{message.content || `[${message.msg_type || "消息"}]`}</div>
                                          </div>
                                        ))}
                                        {chatMessages[chat.project_chat_id].length === 0 ? <div className="pm-muted" style={{ padding: 8 }}>暂无已同步消息</div> : null}
                                      </div>
                                    ) : null}
                                  </div>
                                ))}
                                {(detail.chats || []).length === 0 ? <div className="pm-muted">暂无关联群聊</div> : null}
                              </div>
                              {visibleProjectChats.length > 0 ? (
                              <div className="pm-inline-panel">
                                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", marginBottom: 6 }}>
                                  <div className="pm-section-title" style={{ marginBottom: 0 }}>选择群聊话题</div>
                                  <button className="pm-row-action" type="button" onClick={() => setVisibleChats((prev) => ({ ...prev, [project.project_id]: [] }))}>收起选择</button>
                                </div>
                                {visibleProjectChats.map((chat) => (
                                  <div key={chat.chat_id} style={{ padding: "8px 0", borderBottom: "1px solid #F2F3F5" }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                                      <div style={{ minWidth: 0 }}>
                                        <div style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{chat.name || "未命名群聊"}</div>
                                        <div className="pm-muted" style={{ wordBreak: "break-all" }}>{chat.chat_id}</div>
                                      </div>
                                      <button className="pm-row-action" type="button" disabled={topicLoadingKey === chat.chat_id} onClick={() => void loadVisibleChatTopics(chat)}>话题</button>
                                    </div>
                                    {(visibleChatTopics[chat.chat_id] || []).map((topic) => (
                                      <div key={topic.topic_key} style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 6, padding: 6, background: "#F7F8FA", borderRadius: 5 }}>
                                        <div style={{ minWidth: 0 }}>
                                          <div style={{ fontSize: 12, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{topic.title || topic.topic_key}</div>
                                          <div className="pm-muted">{topic.reply_count} 条 · {formatDate(topic.last_reply_at)}</div>
                                        </div>
                                        <button className="pm-row-action" type="button" onClick={() => void associateTopic(project.project_id, chat, topic)}>关联</button>
                                      </div>
                                    ))}
                                  </div>
                                ))}
                              </div>
                              ) : null}
                            </div>
                          </div>
                          <div className="pm-inline-panel" style={{ marginTop: 12 }}>
                            <div className="pm-section-title">项目流程拆解</div>
                            <div style={{ marginBottom: 10, border: "1px solid #E8EAED", borderRadius: 6, background: "#FAFAFA", padding: 8 }}>
                              <div className="pm-section-title" style={{ marginBottom: 6 }}>相似项目与可复用流程</div>
                              {projectRecommendations.length ? (
                                <div style={{ display: "grid", gap: 10 }}>
                                  <div>
                                    <div className="pm-inline-label">做过相似项目</div>
                                    {completedProjectRecommendations.length ? (
                                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8 }}>
                                        {completedProjectRecommendations.map((item) => renderProjectRecommendationCard(item, project))}
                                      </div>
                                    ) : <div className="pm-muted">暂无已完成的相似项目。</div>}
                                  </div>
                                  <div>
                                    <div className="pm-inline-label">正在做相似项目</div>
                                    {activeProjectRecommendations.length ? (
                                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8 }}>
                                        {activeProjectRecommendations.map((item) => renderProjectRecommendationCard(item, project))}
                                      </div>
                                    ) : <div className="pm-muted">暂无正在推进的相似项目。</div>}
                                  </div>
                                </div>
                              ) : (
                                <div className="pm-muted">暂无相似项目。项目完成、任务拆解和知识沉淀越多，这里会越准确。</div>
                              )}
                            </div>
                            <div className="pm-inline-fields">
                              <div>
                                <div className="pm-inline-label">流程模板</div>
                                <select className="pm-inline-field" value={workflowDraft.template} disabled={!canEdit || generatingWorkflowId === project.project_id} onChange={(event) => {
                                  const template = event.target.value as WorkflowTemplateKey;
                                  setWorkflowDraft((prev) => ({
                                    ...prev,
                                    template,
                                    customNodes: defaultWorkflowText(template),
                                  }));
                                }}>
                                  {projectCategoryValues.map((category) => (
                                    <option key={category} value={category}>{category}标准流程</option>
                                  ))}
                                  <option value="自定义">自定义流程</option>
                                </select>
                              </div>
                              <div>
                                <div className="pm-inline-label">默认负责人</div>
                                <select className="pm-inline-field" value={workflowDraft.assignee_open_id} disabled={!canEdit || generatingWorkflowId === project.project_id} onChange={(event) => setWorkflowDraft((prev) => ({ ...prev, assignee_open_id: event.target.value }))}>
                                  <option value="">项目负责人</option>
                                  {memberOptions.map((member) => (
                                    <option key={member.openId} value={member.openId}>{member.name}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <div className="pm-inline-label">审核人/说明</div>
                                <input className="pm-inline-field" value={workflowDraft.reviewer} disabled={!canEdit || generatingWorkflowId === project.project_id} placeholder="负责人审核" onChange={(event) => setWorkflowDraft((prev) => ({ ...prev, reviewer: event.target.value }))} />
                              </div>
                            </div>
                            <div className="pm-inline-label" style={{ marginTop: 10 }}>流程节点</div>
                            <div style={{ marginTop: 6, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8 }}>
                              {workflowNodeLines().map((line, index) => {
                                const [title = "", hours = "2", review = "负责人审核"] = line.split("|").map((part) => part.trim());
                                return (
                                  <div key={`${index}-${line}`} style={{ border: "1px solid #E5E6EB", borderRadius: 6, padding: 8, background: "#FAFAFA", display: "grid", gap: 6 }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", gap: 6, alignItems: "center" }}>
                                      <span style={{ fontSize: 12, fontWeight: 850, color: "#1F2329" }}>节点 {index + 1}</span>
                                      {canEdit && workflowNodeLines().length > 1 ? (
                                        <button className="pm-row-action pm-row-action-danger" type="button" disabled={generatingWorkflowId === project.project_id} onClick={() => removeWorkflowNodeLine(index)}>删除</button>
                                      ) : null}
                                    </div>
                                    <input className="pm-inline-field" value={title} disabled={!canEdit || generatingWorkflowId === project.project_id} placeholder="节点名称" onChange={(event) => updateWorkflowNodeLine(index, "title", event.target.value)} />
                                    <input className="pm-inline-field" type="number" min="1" value={hours} disabled={!canEdit || generatingWorkflowId === project.project_id} placeholder="预计小时" onChange={(event) => updateWorkflowNodeLine(index, "hours", event.target.value)} />
                                    <input className="pm-inline-field" value={review} disabled={!canEdit || generatingWorkflowId === project.project_id} placeholder="审核要求" onChange={(event) => updateWorkflowNodeLine(index, "review", event.target.value)} />
                                  </div>
                                );
                              })}
                            </div>
                            {canEdit ? (
                              <div className="pm-inline-actions" style={{ marginTop: 8 }}>
                                <button className="pm-tool-btn" type="button" disabled={generatingWorkflowId === project.project_id} onClick={addWorkflowNodeLine}>添加节点</button>
                              </div>
                            ) : null}
                            <div className="pm-inline-actions">
                              {canEdit ? (
                                <button className="pm-primary-btn" type="button" disabled={generatingWorkflowId === project.project_id} onClick={() => void generateProjectWorkflow(project)}>
                                  启动项目并生成任务
                                </button>
                              ) : null}
                              <span className="pm-muted">生成后会按节点创建任务，并把预计耗时、审核要求写入任务描述。</span>
                            </div>
                          </div>
                          <div style={{ marginTop: 12 }}>
                            <div className="pm-section-title">项目任务</div>
                            <div style={{ display: "grid", gridTemplateColumns: "minmax(180px, 1fr) 84px 84px 110px 72px", gap: 8, color: "#646A73", fontSize: 12, fontWeight: 700, padding: "6px 0", borderBottom: "1px solid #F2F3F5" }}>
                              <div>任务</div><div>状态</div><div>优先级</div><div>负责人</div><div>操作</div>
                            </div>
                            {detailTasks.map((task) => (
                              <Fragment key={task.task_id}>
                                <div onClick={() => openProjectTaskInline(task)} style={{ display: "grid", gridTemplateColumns: "minmax(180px, 1fr) 84px 84px 110px 72px", gap: 8, alignItems: "center", padding: "7px 0", borderBottom: "1px solid #F7F8FA", fontSize: 12, cursor: "pointer", background: expandedProjectTaskId === task.task_id ? "#F7F8FA" : undefined }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{task.title}</span>
                                    {!(task.thinking || "").trim() ? renderTag("缺思路", { bg: "#FEE2E2", fg: "#991B1B" }) : null}
                                    {task.task_origin === "chat_ai" ? renderTag("群聊识别", { bg: "#E8F3FF", fg: "#1D4ED8" }) : null}
                                  </div>
                                  <div>{renderTag(taskStatusStyle[task.status].label, taskStatusStyle[task.status])}</div>
                                  <div>{renderTag(priorityStyle[task.priority].label, priorityStyle[task.priority])}</div>
                                  <div className="pm-muted">{renderTaskAssigneeStatus(task)}</div>
                                  <div onClick={(event) => event.stopPropagation()}>
                                    {canDeleteTask(task) ? (
                                      <button className="pm-row-action pm-row-action-danger" type="button" disabled={deletingTaskId === task.task_id} onClick={() => handleDeleteTask(task)}>删除</button>
                                    ) : null}
                                  </div>
                                </div>
                                {expandedProjectTaskId === task.task_id ? (
                                  <div
                                    style={{ padding: 10, background: "#F7F8FA", borderBottom: "1px solid #E5E6EB" }}
                                    onClick={(event) => {
                                      if (event.target === event.currentTarget) setExpandedProjectTaskId(null);
                                    }}
                                  >
                                    <div className="pm-inline-grid">
                                      <div className="pm-inline-panel">
                                        <div className="pm-inline-label">任务标题</div>
                                        <input className="pm-inline-field" value={taskDraft.title} disabled={!canDeleteTask(task)} onChange={(event) => setTaskDraft((prev) => ({ ...prev, title: event.target.value }))} />
                                        <div className="pm-inline-label" style={{ marginTop: 10 }}>任务描述</div>
                                        <textarea className="pm-inline-field pm-inline-textarea" value={taskDraft.description} disabled={!canDeleteTask(task)} onChange={(event) => setTaskDraft((prev) => ({ ...prev, description: event.target.value }))} />
                                        <div className="pm-inline-label" style={{ marginTop: 10 }}>任务思路</div>
                                        <textarea className="pm-inline-field pm-inline-textarea" value={taskDraft.thinking} disabled={!canDeleteTask(task)} placeholder="今天准备怎么做、先验证什么、需要谁配合" onChange={(event) => setTaskDraft((prev) => ({ ...prev, thinking: event.target.value }))} />
                                        <div className="pm-inline-actions">
                                          {canDeleteTask(task) ? <button className="pm-primary-btn" type="button" disabled={savingTaskId === task.task_id} onClick={() => void saveTaskInline(task)}>保存任务</button> : null}
                                        </div>
                                      </div>
                                      <div className="pm-inline-panel">
                                        <div className="pm-inline-fields">
                                          <div><div className="pm-inline-label">状态</div><select className="pm-inline-field" value={taskDraft.status} disabled={!canDeleteTask(task)} onChange={(event) => setTaskDraft((prev) => ({ ...prev, status: event.target.value as TaskStatus }))}><option value="todo">待办</option><option value="in_progress">进行中</option><option value="done">已完成</option><option value="blocked">受阻</option><option value="cancelled">已取消</option></select></div>
                                          <div><div className="pm-inline-label">优先级</div><select className="pm-inline-field" value={taskDraft.priority} disabled={!canDeleteTask(task)} onChange={(event) => setTaskDraft((prev) => ({ ...prev, priority: event.target.value as ProjectPriority }))}><option value="low">低</option><option value="medium">中</option><option value="high">高</option><option value="urgent">紧急</option></select></div>
                                          <div><div className="pm-inline-label">负责人</div><select className="pm-inline-field" value={taskDraft.assignee_open_id} disabled={!canDeleteTask(task)} onChange={(event) => setTaskDraft((prev) => ({ ...prev, assignee_open_id: event.target.value }))}><option value="">未分配</option>{memberOptions.map((member) => <option key={member.openId} value={member.openId}>{member.name}</option>)}</select></div>
                                        </div>
                                        <div style={{ marginTop: 10, color: "#646A73", fontSize: 12, lineHeight: 1.7 }}>截止：{formatDate(task.due_date)} · 更新：{formatDate(task.updated_at)}</div>
                                        <div className="pm-inline-label" style={{ marginTop: 10 }}>进度暂存 / 过程总结</div>
                                        <textarea className="pm-inline-field pm-inline-textarea" value={taskDraft.progress_draft} disabled={!canDeleteTask(task)} placeholder="随手保存当前进展、卡点、经验和下一步" onChange={(event) => setTaskDraft((prev) => ({ ...prev, progress_draft: event.target.value }))} />
                                      </div>
                                    </div>
                                    {renderTaskFocusPanel(task, canDeleteTask(task))}
                                  </div>
                                ) : null}
                              </Fragment>
                            ))}
                            {detailTasks.length === 0 ? <div className="pm-muted">暂无任务</div> : null}
                          </div>
                        </>
                      )}
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
                <button
                  className="pm-row-action"
                  type="button"
                  disabled={savingTodayTaskId === task.task_id}
                  onClick={() => void toggleTaskTodayTodo(task, workMode === "today" ? false : !task.today_todo_date)}
                  style={{
                    minWidth: 76,
                    padding: "6px 8px",
                    borderRadius: 999,
                    border: task.today_todo_date || workMode === "today" ? "1px solid #FCA5A5" : "1px solid #93C5FD",
                    background: task.today_todo_date || workMode === "today" ? "#FEF2F2" : "#EFF6FF",
                    color: task.today_todo_date || workMode === "today" ? "#B91C1C" : "#1D4ED8",
                    fontWeight: 850,
                    whiteSpace: "nowrap",
                  }}
                >
                  {workMode === "today" || task.today_todo_date ? "今日中" : "加今日"}
                </button>
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
                    {renderTaskFocusPanel(task, canEdit)}
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
          <span className="pm-breadcrumb">工作台 / {workMode === "projects" ? "项目" : workMode === "today" ? "今日待办" : "任务"}</span>
        </div>
        <div className="pm-module-tabs">
          <button className="pm-tab-btn" type="button" data-active={workMode === "projects"} onClick={() => setWorkMode("projects")}>项目</button>
          <button className="pm-tab-btn" type="button" data-active={workMode === "tasks"} onClick={() => setWorkMode("tasks")}>任务</button>
          <button className="pm-tab-btn" type="button" data-active={workMode === "today"} onClick={() => setWorkMode("today")}>今日待办</button>
        </div>
        <div className="pm-toolbar-right">
          <input className="pm-search" value={query} placeholder="搜索项目、任务、负责人" onChange={(event) => setQuery(event.target.value)} />
          <button className="pm-tool-btn" type="button" onClick={() => navigate("/tasks/new")}>新建任务</button>
          <button className="pm-primary-btn" type="button" onClick={() => navigate("/projects/new")}>新建项目</button>
        </div>
      </div>

      <div className="pm-layout">
        <aside className="pm-sidebar">
          <div className="pm-sidebar-section">
            <div className="pm-sidebar-title">视图</div>
            <button className="pm-nav-item" type="button" data-active={workMode === "projects"} onClick={() => setWorkMode("projects")}>
              <span>项目列表</span><span className="pm-nav-count">{projects.length}</span>
            </button>
            <button className="pm-nav-item" type="button" data-active={workMode === "tasks"} onClick={() => setWorkMode("tasks")}>
              <span>任务列表</span><span className="pm-nav-count">{tasks.length}</span>
            </button>
            <button className="pm-nav-item" type="button" data-active={workMode === "today"} onClick={() => setWorkMode("today")}>
              <span>今日待办</span><span className="pm-nav-count">{workMode === "today" ? filteredTasks.length : "-"}</span>
            </button>
          </div>

          {workMode === "projects" ? (
            <>
              <div className="pm-sidebar-section">
                <div className="pm-sidebar-title">项目状态</div>
                {tabItems.map((item) => (
                  <button key={item.key} className="pm-nav-item" type="button" data-active={activeKey === item.key} onClick={() => setActiveKey(item.key)}>
                    <span>{item.title}</span>
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
                    <span>{label}</span>
                  </button>
                ))}
              </div>
              <div className="pm-sidebar-section">
                <div className="pm-sidebar-title">执行概览</div>
                <div className="pm-sidebar-metric">
                  <div className="pm-sidebar-metric-row"><span>项目数</span><b>{filteredProjects.length}</b></div>
                  <div className="pm-sidebar-metric-row"><span>完成项目</span><b>{projectDoneCount}</b></div>
                  <div className="pm-sidebar-metric-row"><span>任务完成率</span><b>{sidebarProgress}%</b></div>
                  <div className="pm-progress"><span style={{ width: `${sidebarProgress}%` }} /></div>
                </div>
              </div>
            </>
          ) : workMode === "tasks" ? (
            <div className="pm-sidebar-section">
              <div className="pm-sidebar-title">任务状态</div>
              {taskFilters.map((item) => (
                <button key={item.value} className="pm-nav-item" type="button" data-active={taskFilter === item.value} onClick={() => setTaskFilter(item.value)}>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="pm-sidebar-section">
              <div className="pm-sidebar-title">今日提醒</div>
              <div className="pm-sidebar-metric">
                <div className="pm-sidebar-metric-row"><span>今日任务</span><b>{filteredTasks.length}</b></div>
                <div className="pm-sidebar-metric-row"><span>缺思路</span><b>{missingThinkingTasks.length}</b></div>
                <div className="pm-sidebar-metric-row"><span>已完成</span><b>{todayCompletedTasks.length}</b></div>
              </div>
            </div>
          )}
        </aside>

        <main className="pm-main">
          <div className="pm-toolbar">
            <div className="pm-toolbar-left">
              <div className="pm-view-title">{workMode === "projects" ? "项目视图" : workMode === "today" ? "今日待办" : isManager ? "按负责人查看任务" : "任务视图"}</div>
              <div className="pm-muted">{workMode === "projects" ? `${filteredProjects.length} 个项目` : `${filteredTasks.length} 个任务`}</div>
            </div>
            <div className="pm-toolbar-right">
              {workMode === "projects" ? (
                <Selector
                  className="pm-selector"
                  value={[projectCategoryFilter]}
                  options={[
                    { label: "全部分类", value: "all" },
                    ...projectCategoryValues.map((value) => ({ label: value, value })),
                  ]}
                  columns={5}
                  showCheckMark={false}
                  onChange={(value) => setProjectCategoryFilter((value[0] || "all") as ProjectCategoryFilter)}
                />
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

          <div style={{ border: "1px solid #E5E6EB", borderRadius: 6, background: "#FFFFFF", padding: 10, margin: "10px 0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: assistantConfigExpanded ? 8 : 0 }}>
              <div>
                <div className="pm-section-title" style={{ marginBottom: 2 }}>AI 助手配置</div>
                <div className="pm-muted">{aiAssistants.length ? `已配置 ${aiAssistants.length} 个助手，默认隐藏配置表单。` : "需要调整通用/部门助手时再展开配置。"}</div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button className="pm-row-action" type="button" onClick={loadAIAssistants}>刷新</button>
                <button className="pm-tool-btn" type="button" onClick={() => setAssistantConfigExpanded((prev) => !prev)}>
                  {assistantConfigExpanded ? "隐藏配置" : "展开配置"}
                </button>
              </div>
            </div>
            {assistantConfigExpanded ? (
            <div style={{ display: "grid", gridTemplateColumns: isManager ? "minmax(260px, 1fr) minmax(300px, 1fr)" : "1fr", gap: 10, alignItems: "start" }}>
              <div style={{ display: "grid", gap: 6 }}>
                {aiAssistants.slice(0, 5).map((assistant) => (
                  <div key={assistant.assistant_id} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 8, alignItems: "center", padding: 8, border: "1px solid #F2F3F5", borderRadius: 6, background: "#FAFAFA" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 850, color: "#1F2329", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {assistant.name}
                      </div>
                      <div className="pm-muted" style={{ marginTop: 3 }}>
                        {assistant.scope === "global" ? "通用助手" : `${assistant.department || "未设置部门"} 助手`} · {assistant.cadence === "daily" ? "每日" : assistant.cadence === "weekly" ? "每周" : "手动"} · {assistant.enabled ? "启用" : "停用"}
                      </div>
                    </div>
                    {isManager ? <button className="pm-row-action" type="button" onClick={() => editAssistantDraft(assistant)}>编辑</button> : null}
                  </div>
                ))}
                {aiAssistants.length === 0 ? <div className="pm-muted">暂无 AI 助手配置。</div> : null}
              </div>
              {isManager ? (
                <div style={{ display: "grid", gap: 8 }}>
                  <div className="pm-inline-fields">
                    <div>
                      <div className="pm-inline-label">范围</div>
                      <select className="pm-inline-field" value={assistantDraft.scope} onChange={(event) => setAssistantDraft((prev) => ({ ...prev, scope: event.target.value as AIAssistantScope }))}>
                        <option value="global">通用助手</option>
                        <option value="department">部门助手</option>
                      </select>
                    </div>
                    <div>
                      <div className="pm-inline-label">部门</div>
                      <select className="pm-inline-field" value={assistantDraft.department} disabled={assistantDraft.scope === "global"} onChange={(event) => setAssistantDraft((prev) => ({ ...prev, department: event.target.value }))}>
                        <option value="">选择部门</option>
                        {departmentOptions.map((department) => (
                          <option key={department} value={department}>{department}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <div className="pm-inline-label">名称</div>
                      <input className="pm-inline-field" value={assistantDraft.name} onChange={(event) => setAssistantDraft((prev) => ({ ...prev, name: event.target.value }))} />
                    </div>
                    <div>
                      <div className="pm-inline-label">节奏</div>
                      <select className="pm-inline-field" value={assistantDraft.cadence} onChange={(event) => setAssistantDraft((prev) => ({ ...prev, cadence: event.target.value as AIAssistantCadence }))}>
                        <option value="daily">每日</option>
                        <option value="weekly">每周</option>
                        <option value="manual">手动</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <div className="pm-inline-label">提示词</div>
                    <textarea className="pm-inline-field pm-inline-textarea" value={assistantDraft.prompt} onChange={(event) => setAssistantDraft((prev) => ({ ...prev, prompt: event.target.value }))} />
                  </div>
                  <div>
                    <div className="pm-inline-label">工作流</div>
                    <textarea className="pm-inline-field pm-inline-textarea" value={assistantDraft.workflow} onChange={(event) => setAssistantDraft((prev) => ({ ...prev, workflow: event.target.value }))} />
                  </div>
                  <div className="pm-inline-actions" style={{ marginTop: 0 }}>
                    <button className="pm-primary-btn" type="button" disabled={savingAssistantId !== null} onClick={() => void saveAssistantDraft()}>
                      {assistantDraft.assistant_id ? "保存助手" : "创建助手"}
                    </button>
                    <button className="pm-tool-btn" type="button" onClick={() => setAssistantDraft((prev) => ({ ...prev, assistant_id: 0, name: "小卷管理助手", scope: "global", department: "" }))}>
                      新建
                    </button>
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#646A73", fontSize: 12 }}>
                      <input type="checkbox" checked={assistantDraft.enabled} onChange={(event) => setAssistantDraft((prev) => ({ ...prev, enabled: event.target.checked }))} />
                      启用
                    </label>
                  </div>
                </div>
              ) : null}
            </div>
            ) : null}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10, margin: "10px 0" }}>
            <div style={{ border: "1px solid #E5E6EB", borderRadius: 6, background: "#FFFFFF", padding: 10 }}>
              <div className="pm-section-title">管理概览</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(92px, 1fr))", gap: 8 }}>
                {workMode === "today" ? (
                  <>
                    <div><div className="pm-inline-label">今日任务</div><div style={{ fontWeight: 850 }}>{filteredTasks.length}</div></div>
                    <div><div className="pm-inline-label">缺思路</div><div style={{ fontWeight: 850, color: missingThinkingTasks.length ? "#B91C1C" : "#15803D" }}>{missingThinkingTasks.length}</div></div>
                    <div><div className="pm-inline-label">已完成</div><div style={{ fontWeight: 850 }}>{todayCompletedTasks.length}</div></div>
                    <div><div className="pm-inline-label">整体偏离率</div><div style={{ fontWeight: 850, color: todayDeviationRate > 30 ? "#B45309" : "#15803D" }}>{todayDeviationRows.length ? `${todayDeviationRate}%` : "待累计"}</div></div>
                  </>
                ) : workMode === "tasks" ? (
                  <>
                    <div><div className="pm-inline-label">今日到期</div><div style={{ fontWeight: 850 }}>{dueTodayTasks.length}</div></div>
                    <div><div className="pm-inline-label">本周到期</div><div style={{ fontWeight: 850 }}>{dueThisWeekTasks.length}</div></div>
                    <div><div className="pm-inline-label">逾期</div><div style={{ fontWeight: 850, color: overdueFilteredTasks.length ? "#B45309" : "#15803D" }}>{overdueFilteredTasks.length}</div></div>
                    <div><div className="pm-inline-label">受阻</div><div style={{ fontWeight: 850, color: blockedFilteredTasks.length ? "#B91C1C" : "#15803D" }}>{blockedFilteredTasks.length}</div></div>
                  </>
                ) : (
                  <>
                    <div><div className="pm-inline-label">项目数</div><div style={{ fontWeight: 850 }}>{filteredProjects.length}</div></div>
                    <div><div className="pm-inline-label">完成率</div><div style={{ fontWeight: 850 }}>{sidebarProgress}%</div></div>
                    <div><div className="pm-inline-label">异常</div><div style={{ fontWeight: 850, color: abnormalProjects.length ? "#B91C1C" : "#15803D" }}>{abnormalProjects.length}</div></div>
                    <div><div className="pm-inline-label">未起量</div><div style={{ fontWeight: 850, color: stalledProjects.length ? "#B45309" : "#15803D" }}>{stalledProjects.length}</div></div>
                  </>
                )}
              </div>
            </div>
            <div style={{ border: "1px solid #E5E6EB", borderRadius: 6, background: "#FAFAFA", padding: 10 }}>
              <div className="pm-section-title">{workMode === "today" ? "AI 今日概览" : "AI 辅助判断"}</div>
              {workMode === "today" ? (
                <div style={{ display: "grid", gap: 8 }}>
                  <div>
                    <div className="pm-inline-label">AI 总结的今日思路</div>
                    <div className="pm-muted" style={{ lineHeight: 1.6 }}>
                      {todayThinkingLines.length ? todayThinkingLines.map((line, index) => `${index + 1}. ${line}`).join("；") : "今日待办还没有填写任务思路。"}
                    </div>
                  </div>
                  <div>
                    <div className="pm-inline-label">AI 的今日完成情况</div>
                    <div className="pm-muted" style={{ lineHeight: 1.6 }}>
                      {todayCompletionLines.length ? todayCompletionLines.map((line, index) => `${index + 1}. ${line}`).join("；") : "还没有过程暂存或完成复盘。"}
                    </div>
                  </div>
                  <div className="pm-muted">整体偏离率来自任务预计区间与专注/完成记录的差异；任务内部仍保留更精细的偏差原因。</div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {managerInsights.map((insight) => (
                    <div key={insight} style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 12, color: "#1F2329", lineHeight: 1.5 }}>
                      <span style={{ width: 6, height: 6, borderRadius: 999, background: "#3370FF", marginTop: 7, flex: "0 0 auto" }} />
                      <span>{insight}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="pm-content">
            {loading ? <SectionLoading text={workMode === "projects" ? "正在加载项目..." : workMode === "today" ? "正在加载今日待办..." : "正在加载任务..."} /> : null}
            {!loading && workMode === "projects" && filteredProjects.length === 0 ? (
              <div className="pm-empty-wrap"><SectionEmpty description="当前筛选下没有项目" /></div>
            ) : null}
            {!loading && workMode === "projects" && filteredProjects.length > 0 ? renderProjectRows() : null}

            {!loading && (workMode === "tasks" || workMode === "today") && filteredTasks.length === 0 ? (
              <div className="pm-empty-wrap"><SectionEmpty description={workMode === "today" ? "今天还没有待办，去任务列表点击加入今日" : "当前筛选下没有任务"} /></div>
            ) : null}
            {!loading && (workMode === "tasks" || workMode === "today") && filteredTasks.length > 0 ? (
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
