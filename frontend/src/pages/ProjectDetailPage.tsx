import type { CSSProperties } from "react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { Button, Card, Dialog, Form, Input, Popup, Selector, Tabs, TextArea, Toast } from "antd-mobile";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import { listMembers } from "../api/members";
import {
  addProjectChat,
  addProjectMember,
  createProjectRelation,
  deleteProjectRelation,
  createProjectLog,
  decideProjectLog,
  deleteProjectChat,
  getProject,
  listProjects,
  listProjectRelations,
  listProjectLogs,
  listLarkChatTopics,
  listVisibleLarkChats,
  listProjectChatMessages,
  listProjectChatTopics,
  notifyProjectLogAgain,
  notifyProjectMemberAgain,
  publishProject,
  removeProjectMember,
  syncProjectChat,
  updateProject,
} from "../api/projects";
import { deleteTask, listTaskAuditLogs, listTasks, notifyTaskAgain, updateTask } from "../api/tasks";
import { MemberAvatarLink, MemberNameLink } from "../components/MemberProfileLink";
import MemberPicker from "../components/MemberPicker";
import {
  PageShell,
  SectionEmpty,
  SectionError,
  SectionLoading,
  chipStyle,
  colors,
  lineClamp,
  priorityTone,
  sectionCardStyle,
} from "../components/ui";
import { useAuth } from "../hooks/useAuth";
import type {
  LarkChatTopicPreview,
  LarkVisibleChat,
  Member,
  PMRole,
  Project,
  ProjectChatMessage,
  ProjectChatTopic,
  ProjectLog,
  ProjectRelation,
  ProjectRelationType,
  ProjectPriority,
  ProjectStatus,
  ProjectType,
  Task,
  TaskStatus,
  ChangeLogEntry,
} from "../types/api";

type DetailTabKey = "tasks" | "members" | "chats" | "relations" | "logs";
const equalAccessOpenIds = new Set(["ou_20fec537961e0a66669370b00d0fc52d", "ou_c544c4877658cfa1df6cee41939b99c4"]);
const TASK_ASSIGNEE_ALL = "__all__";
const TASK_ASSIGNEE_UNASSIGNED = "__unassigned__";

const projectStatusStyle: Record<ProjectStatus, { label: string; bg: string; fg: string }> = {
  planning: { label: "规划中", bg: "#e5e7eb", fg: "#374151" },
  active: { label: "进行中", bg: "#dbeafe", fg: "#1e40af" },
  paused: { label: "已暂停", bg: "#ffedd5", fg: "#c2410c" },
  completed: { label: "已完成", bg: "#dcfce7", fg: "#15803d" },
  archived: { label: "已存档", bg: "#ede9fe", fg: "#5b21b6" },
};

const priorityStyle: Record<ProjectPriority, { label: string; bg: string; fg: string }> = {
  urgent: { label: "紧急", bg: priorityTone.urgent.bg, fg: priorityTone.urgent.fg },
  high: { label: "高", bg: priorityTone.high.bg, fg: priorityTone.high.fg },
  medium: { label: "中", bg: priorityTone.medium.bg, fg: priorityTone.medium.fg },
  low: { label: "低", bg: priorityTone.low.bg, fg: priorityTone.low.fg },
};

const projectTypeStyle: Record<ProjectType, { label: string; bg: string; fg: string }> = {
  team: { label: "团队项目", bg: "#ecfeff", fg: "#0f766e" },
  personal: { label: "个人项目", bg: "#f3f4f6", fg: "#374151" },
};

const taskStatusStyle: Record<TaskStatus, { label: string; bg: string; fg: string }> = {
  todo: { label: "待办", bg: "#e5e7eb", fg: "#374151" },
  in_progress: { label: "进行中", bg: "#dbeafe", fg: "#1d4ed8" },
  done: { label: "已完成", bg: "#dcfce7", fg: "#15803d" },
  blocked: { label: "阻塞", bg: "#fee2e2", fg: "#b91c1c" },
  cancelled: { label: "已取消", bg: "#f3f4f6", fg: "#9ca3af" },
};

const memberRoleStyle: Record<PMRole, { label: string; bg: string; fg: string }> = {
  owner: { label: "负责人", bg: "#dbeafe", fg: "#1e40af" },
  co_lead: { label: "参与者", bg: "#dcfce7", fg: "#15803d" },
  member: { label: "参与者", bg: "#dcfce7", fg: "#15803d" },
  observer: { label: "参与者", bg: "#dcfce7", fg: "#15803d" },
};

const developmentStages = [
  { key: "需求确认", title: "需求确认", hint: "确认目标、边界、角色和验收口径" },
  { key: "原型验证", title: "原型验证", hint: "用小范围 DEMO 验证关键流程" },
  { key: "开发联调", title: "开发联调", hint: "完成主要功能并打通接口链路" },
  { key: "测试验收", title: "测试验收", hint: "集中回归、处理缺陷并确认上线条件" },
  { key: "上线运维", title: "上线运维", hint: "发布、监控、回滚和后续迭代" },
] as const;

type DevelopmentStageStatus = "done" | "active" | "todo";

const developmentStageStyle: Record<DevelopmentStageStatus, { label: string; bg: string; fg: string; border: string; dot: string }> = {
  done: { label: "已完成", bg: "#f0fdf4", fg: "#15803d", border: "#86efac", dot: "#22c55e" },
  active: { label: "进行中", bg: "#fef2f2", fg: "#b91c1c", border: "#fca5a5", dot: "#ef4444" },
  todo: { label: "未开始", bg: "#f8fafc", fg: "#64748b", border: "#e5e7eb", dot: "#94a3b8" },
};

const getDevelopmentStageStatus = (stageTasks: Task[]): DevelopmentStageStatus => {
  if (!stageTasks.length) return "todo";
  if (stageTasks.every((task) => task.status === "done")) return "done";
  if (stageTasks.some((task) => task.status === "in_progress" || task.status === "blocked")) return "active";
  return "todo";
};

const getDevelopmentStageTasks = (tasks: Task[], stageKey: string) =>
  tasks.filter((task) => task.title.includes(stageKey));

type ProjectLogKind = ProjectLog["kind"];

const logKindOptions: Array<{ label: string; value: ProjectLogKind }> = [
  { label: "记录", value: "note" },
  { label: "申请指导", value: "guidance" },
  { label: "申请服务器", value: "server" },
  { label: "人员变动", value: "member_change" },
  { label: "论文节点", value: "paper_stage" },
  { label: "发送通知", value: "notification" },
];

const relationTypeOptions: Array<{ label: string; value: ProjectRelationType }> = [
  { label: "调整为", value: "transformed_to" },
  { label: "衍生项目", value: "derived" },
  { label: "相关项目", value: "related" },
];

const paperStageOptions = [
  { label: "选题", value: "topic" },
  { label: "调研", value: "research" },
  { label: "实验", value: "experiment" },
  { label: "初稿", value: "draft" },
  { label: "投稿/评审", value: "submit" },
];

const paperStatusOptions = [
  { label: "进行中", value: "in_progress" },
  { label: "同行评审", value: "under_review" },
  { label: "已接收", value: "accepted" },
  { label: "已发表", value: "published" },
  { label: "已拒稿", value: "rejected" },
];

const logStatusStyle: Record<ProjectLog["status"], { bg: string; fg: string }> = {
  recorded: { bg: "#f1f5f9", fg: "#475569" },
  pending: { bg: "#fef3c7", fg: "#92400e" },
  pending_approval: { bg: "#ffedd5", fg: "#c2410c" },
  approved: { bg: "#dcfce7", fg: "#15803d" },
  rejected: { bg: "#fee2e2", fg: "#b91c1c" },
  notified: { bg: "#dbeafe", fg: "#1d4ed8" },
};

const extractMessage = (err: unknown): string => {
  if (axios.isAxiosError(err)) {
    const detail = (err.response?.data as { detail?: string } | undefined)?.detail;
    if (typeof detail === "string") return detail;
    if (err.message) return err.message;
  }
  if (err instanceof Error) return err.message;
  return "操作失败";
};

const formatDateTime = (value?: string | null) => {
  if (!value) return "未设置";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value.slice(0, 16).replace("T", " ");
  }
  const pad = (input: number) => String(input).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const fieldLabels: Record<string, string> = {
  status: "状态",
  priority: "优先级",
  assignee_open_id: "负责人",
  due_date: "截止时间",
  planned_start_date: "计划开始",
  completed_at: "完成时间",
  title: "标题",
  description: "描述",
  name: "项目名称",
  target_end_date: "目标截止",
  actual_end_date: "实际完成",
  owner_open_id: "负责人",
  department: "部门",
};

const valueLabel = (field: string, value: unknown, members: Record<string, Member>) => {
  if (value === null || value === undefined || value === "") return "未设置";
  if (field === "status" && typeof value === "string") return taskStatusStyle[value as TaskStatus]?.label || projectStatusStyle[value as ProjectStatus]?.label || value;
  if (field === "priority" && typeof value === "string") return priorityStyle[value as ProjectPriority]?.label || value;
  if ((field === "assignee_open_id" || field === "owner_open_id") && typeof value === "string") return members[value]?.name || value;
  if (/date|_at/.test(field) && typeof value === "string") return formatDateTime(value);
  return String(value);
};

const describeLog = (log: ChangeLogEntry, members: Record<string, Member>) => {
  if (log.action === "create") return ["创建记录"];
  if (log.action === "delete") return ["删除记录"];
  const delta = log.changes.delta || {};
  const lines = Object.entries(delta)
    .filter(([field]) => !["updated_at", "base_record_id"].includes(field))
    .map(([field, change]) => {
      const label = fieldLabels[field] || field;
      return `${label}: ${valueLabel(field, change.before, members)} -> ${valueLabel(field, change.after, members)}`;
    });
  return lines.length ? lines : ["更新记录"];
};

const fetchAllMembers = async (): Promise<Member[]> => {
  const firstPage = await listMembers({ page: 1, page_size: 100 });
  const totalPages = Math.ceil(firstPage.total / firstPage.page_size);

  if (totalPages <= 1) {
    return firstPage.items;
  }

  const rest = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, index) => listMembers({ page: index + 2, page_size: firstPage.page_size })),
  );

  return firstPage.items.concat(rest.flatMap((page) => page.items));
};

const ProjectDetailPage = () => {
  const navigate = useNavigate();
  const { project_id } = useParams();
  const { me } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<Record<string, Member>>({});
  const [loading, setLoading] = useState(true);
  const [taskLoading, setTaskLoading] = useState(true);
  const [activeKey, setActiveKey] = useState<DetailTabKey>("tasks");
  const [statusUpdatingId, setStatusUpdatingId] = useState<number | null>(null);
  const [taskAssigneeFilter, setTaskAssigneeFilter] = useState(TASK_ASSIGNEE_ALL);
  const [projectSaving, setProjectSaving] = useState(false);
  const [projectDraft, setProjectDraft] = useState({
    name: "",
    description: "",
    status: "active" as ProjectStatus,
    priority: "medium" as ProjectPriority,
    project_type: "team" as ProjectType,
    department: "",
    tags: "",
  });
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [taskDraft, setTaskDraft] = useState({
    title: "",
    description: "",
    status: "todo" as TaskStatus,
    priority: "medium" as ProjectPriority,
    assignee_open_id: "",
  });
  const [taskSaving, setTaskSaving] = useState(false);
  const [taskLogs, setTaskLogs] = useState<ChangeLogEntry[]>([]);
  const [taskLogsLoading, setTaskLogsLoading] = useState(false);
  const [projectLogs, setProjectLogs] = useState<ProjectLog[]>([]);
  const [projectRelations, setProjectRelations] = useState<ProjectRelation[]>([]);
  const [relationPopupVisible, setRelationPopupVisible] = useState(false);
  const [relationSubmitting, setRelationSubmitting] = useState(false);
  const [projectOptions, setProjectOptions] = useState<Project[]>([]);
  const [relationDraft, setRelationDraft] = useState({
    target_project_id: "",
    relation_type: "related" as ProjectRelationType,
    title: "",
    description: "",
  });
  const [logPopupVisible, setLogPopupVisible] = useState(false);
  const [logSubmitting, setLogSubmitting] = useState(false);
  const [logDraft, setLogDraft] = useState({
    kind: "note" as ProjectLogKind,
    title: "",
    body: "",
    target_open_id: "",
    resource_type: "",
    old_value: "",
    new_value: "",
    paper_id: "",
    paper_stage: "submit",
    paper_status: "under_review",
  });
  const [submittingMember, setSubmittingMember] = useState(false);
  const [notifyingKey, setNotifyingKey] = useState<string | null>(null);
  const [chatSyncingId, setChatSyncingId] = useState<number | null>(null);
  const [chatTopics, setChatTopics] = useState<Record<number, ProjectChatTopic[]>>({});
  const [chatQuery, setChatQuery] = useState("");
  const [visibleChats, setVisibleChats] = useState<LarkVisibleChat[]>([]);
  const [visibleChatsToken, setVisibleChatsToken] = useState<string | null>(null);
  const [chatSearching, setChatSearching] = useState(false);
  const [visibleChatTopics, setVisibleChatTopics] = useState<Record<string, LarkChatTopicPreview[]>>({});
  const [visibleChatTopicTokens, setVisibleChatTopicTokens] = useState<Record<string, string | null>>({});
  const [topicLoadingChatId, setTopicLoadingChatId] = useState<string | null>(null);
  const [expandedChatIds, setExpandedChatIds] = useState<Record<number, boolean>>({});
  const [chatMessages, setChatMessages] = useState<Record<number, ProjectChatMessage[]>>({});
  const [chatMessagesLoadingId, setChatMessagesLoadingId] = useState<number | null>(null);

  const hasEqualOwnerAccess = Boolean(me && project && equalAccessOpenIds.has(me.open_id) && equalAccessOpenIds.has(project.owner_open_id));
  const canManageProject = Boolean(
    me && project && (
      me.open_id === project.owner_open_id
      || hasEqualOwnerAccess
      || (project.project_type === "team" && (me.role === "admin" || me.role === "staff"))
    ),
  );

  const loadProject = async () => {
    if (!project_id) return;
    const response = await getProject(project_id);
    setProject(response);
    setProjectDraft({
      name: response.name,
      description: response.description || "",
      status: response.status,
      priority: response.priority,
      project_type: response.project_type || "team",
      department: response.department || "",
      tags: response.tags || "",
    });
  };

  const loadProjectLogs = async () => {
    if (!project_id) return;
    try {
      const logs = await listProjectLogs(project_id);
      setProjectLogs(logs);
    } catch {
      setProjectLogs([]);
    }
  };

  const loadProjectRelations = async () => {
    if (!project_id) return;
    try {
      const relations = await listProjectRelations(project_id);
      setProjectRelations(relations);
    } catch {
      setProjectRelations([]);
    }
  };

  const loadTasks = async () => {
    if (!project_id) return;
    const response = await listTasks({ project_id: Number(project_id), page_size: 200 });
    setTasks(response.items);
  };

  useEffect(() => {
    fetchAllMembers()
      .then((list) => {
        setMembers(
          list.reduce<Record<string, Member>>((acc, member) => {
            acc[member.open_id] = member;
            return acc;
          }, {}),
        );
      })
      .catch(() => setMembers({}));
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setTaskLoading(true);

    Promise.all([loadProject(), loadTasks(), loadProjectLogs(), loadProjectRelations()])
      .catch(() => {
        if (active) {
          setProject(null);
          setTasks([]);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
          setTaskLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [project_id]);

  const taskAssigneeOptions = useMemo(
    () => {
      const activeProjectMembers = project?.members.filter((member) => !member.left_at) || [];
      const taskAssigneeIds = Array.from(new Set(tasks.map((task) => task.assignee_open_id).filter(Boolean))) as string[];
      const projectMemberIds = new Set(activeProjectMembers.map((member) => member.member_open_id));
      return [
        { label: "全部负责人", value: TASK_ASSIGNEE_ALL },
        ...activeProjectMembers.map((member) => ({
          label: members[member.member_open_id]?.name || member.member_open_id,
          value: member.member_open_id,
        })),
        ...taskAssigneeIds
          .filter((openId) => !projectMemberIds.has(openId))
          .map((openId) => ({
            label: members[openId]?.name || openId,
            value: openId,
          })),
        { label: "未分配", value: TASK_ASSIGNEE_UNASSIGNED },
      ];
    },
    [members, project?.members, tasks],
  );

  const filteredBoardTasks = useMemo(
    () => tasks.filter((task) => {
      if (taskAssigneeFilter === TASK_ASSIGNEE_ALL) return true;
      if (taskAssigneeFilter === TASK_ASSIGNEE_UNASSIGNED) return !task.assignee_open_id;
      return task.assignee_open_id === taskAssigneeFilter;
    }),
    [taskAssigneeFilter, tasks],
  );

  const updateLogDraft = (patch: Partial<typeof logDraft>) => {
    setLogDraft((prev) => ({ ...prev, ...patch }));
  };

  const openLogComposer = (kind: ProjectLogKind) => {
    setLogDraft({
      kind,
      title: "",
      body: "",
      target_open_id: "",
      resource_type: "",
      old_value: "",
      new_value: "",
      paper_id: "",
      paper_stage: "submit",
      paper_status: "under_review",
    });
    setLogPopupVisible(true);
  };

  const openRelationComposer = async () => {
    setRelationDraft({ target_project_id: "", relation_type: "related", title: "", description: "" });
    setRelationPopupVisible(true);
    try {
      const response = await listProjects({ page_size: 200, member_open_id: me?.open_id });
      setProjectOptions(response.items.filter((item) => String(item.project_id) !== String(project_id)));
    } catch {
      setProjectOptions([]);
    }
  };

  const submitProjectRelation = async () => {
    if (!project_id || !relationDraft.target_project_id) {
      Toast.show({ icon: "fail", content: "请选择关联项目" });
      return;
    }
    setRelationSubmitting(true);
    try {
      await createProjectRelation(project_id, {
        target_project_id: Number(relationDraft.target_project_id),
        relation_type: relationDraft.relation_type,
        title: relationDraft.title.trim() || null,
        description: relationDraft.description.trim() || null,
      });
      setRelationPopupVisible(false);
      await Promise.all([loadProjectRelations(), loadProjectLogs()]);
      Toast.show({ icon: "success", content: "项目关系已记录" });
    } catch (err) {
      Toast.show({ icon: "fail", content: extractMessage(err) });
    } finally {
      setRelationSubmitting(false);
    }
  };

  const handleDeleteProjectRelation = async (relation: ProjectRelation) => {
    if (!project_id) return;
    const ok = await Dialog.confirm({
      content: `确认取消与《${relation.project_name}》的关联吗？`,
      confirmText: "取消关联",
      cancelText: "返回",
    });
    if (!ok) return;
    try {
      await deleteProjectRelation(project_id, relation.relation_id);
      await Promise.all([loadProjectRelations(), loadProjectLogs()]);
      Toast.show({ icon: "success", content: "项目关系已取消" });
    } catch (err) {
      Toast.show({ icon: "fail", content: extractMessage(err) });
    }
  };

  const submitProjectLog = async () => {
    if (!project_id) return;
    setLogSubmitting(true);
    try {
      await createProjectLog(project_id, {
        kind: logDraft.kind,
        title: logDraft.title.trim() || null,
        body: logDraft.body.trim() || null,
        target_open_id: logDraft.target_open_id || null,
        resource_type: logDraft.resource_type.trim() || null,
        old_value: logDraft.old_value.trim() || null,
        new_value: logDraft.new_value.trim() || null,
        paper_id: logDraft.paper_id ? Number(logDraft.paper_id) : null,
        paper_stage: logDraft.kind === "paper_stage" ? (logDraft.paper_stage as any) : null,
        paper_status: logDraft.kind === "paper_stage" ? (logDraft.paper_status as any) : null,
        milestone_status: logDraft.kind === "paper_stage" ? "done" : null,
        notify_now: true,
      });
      setLogPopupVisible(false);
      await loadProjectLogs();
      Toast.show({ icon: "success", content: "项目日志已提交" });
    } catch (err) {
      Toast.show({ icon: "fail", content: extractMessage(err) });
    } finally {
      setLogSubmitting(false);
    }
  };

  const handleNotifyProjectLog = async (log: ProjectLog) => {
    if (!project_id) return;
    setNotifyingKey(`log-${log.log_id}`);
    try {
      const updated = await notifyProjectLogAgain(project_id, log.log_id);
      setProjectLogs((prev) => prev.map((item) => (item.log_id === updated.log_id ? updated : item)));
      Toast.show({ icon: "success", content: "通知已发送" });
    } catch (err) {
      Toast.show({ icon: "fail", content: extractMessage(err) });
    } finally {
      setNotifyingKey(null);
    }
  };

  const handleDecideProjectLog = async (log: ProjectLog, approved: boolean) => {
    if (!project_id) return;
    try {
      const updated = await decideProjectLog(project_id, log.log_id, { approved });
      setProjectLogs((prev) => prev.map((item) => (item.log_id === updated.log_id ? updated : item)));
      Toast.show({ icon: "success", content: approved ? "已审批通过" : "已拒绝" });
    } catch (err) {
      Toast.show({ icon: "fail", content: extractMessage(err) });
    }
  };

  const patchProjectStatus = async (status: ProjectStatus) => {
    if (!project_id) return;
    try {
      const updated = await updateProject(project_id, { status });
      setProject(updated);
      setProjectDraft((prev) => ({ ...prev, status: updated.status }));
      void loadProjectLogs();
      Toast.show({ icon: "success", content: "项目状态已更新" });
    } catch (err) {
      Toast.show({ icon: "fail", content: extractMessage(err) });
    }
  };

  const submitProjectDraft = async () => {
    if (!project_id) return;
    const name = projectDraft.name.trim();
    if (!name) {
      Toast.show({ icon: "fail", content: "请填写项目名称" });
      return;
    }
    setProjectSaving(true);
    try {
      const updated = await updateProject(project_id, {
        name,
        description: projectDraft.description.trim() || null,
        status: projectDraft.status,
        priority: projectDraft.priority,
        project_type: projectDraft.project_type,
        department: projectDraft.department.trim() || null,
        tags: projectDraft.tags.trim() || null,
      });
      setProject(updated);
      setProjectDraft({
        name: updated.name,
        description: updated.description || "",
        status: updated.status,
        priority: updated.priority,
        project_type: updated.project_type || "team",
        department: updated.department || "",
        tags: updated.tags || "",
      });
      void loadProjectLogs();
      Toast.show({ icon: "success", content: "项目已保存" });
    } catch (err) {
      Toast.show({ icon: "fail", content: extractMessage(err) });
    } finally {
      setProjectSaving(false);
    }
  };

  const handlePublishProject = async () => {
    if (!project_id) return;
    try {
      const updated = await publishProject(project_id);
      setProject(updated);
      Toast.show({ icon: "success", content: "项目已发布并通知相关成员" });
    } catch (err) {
      Toast.show({ icon: "fail", content: extractMessage(err) });
    }
  };

  const handleTaskStatusChange = async (task: Task, status: TaskStatus) => {
    if (task.status === status) return;
    setStatusUpdatingId(task.task_id);
    try {
      const updated = await updateTask(task.task_id, { status });
      setTasks((prev) => prev.map((item) => (item.task_id === updated.task_id ? updated : item)));
      setSelectedTask((prev) => (prev?.task_id === updated.task_id ? updated : prev));
      setTaskDraft((prev) => (selectedTask?.task_id === updated.task_id ? { ...prev, status: updated.status } : prev));
      void listTaskAuditLogs(updated.task_id).then(setTaskLogs).catch(() => setTaskLogs([]));
      if (status === "done") {
        void loadProjectLogs();
      }
    } catch (err) {
      Toast.show({ icon: "fail", content: extractMessage(err) });
    } finally {
      setStatusUpdatingId(null);
    }
  };

  const openTaskDetail = (task: Task) => {
    if (selectedTask?.task_id === task.task_id) {
      setSelectedTask(null);
      return;
    }
    setSelectedTask(task);
    setTaskDraft({
      title: task.title,
      description: task.description || "",
      status: task.status,
      priority: task.priority,
      assignee_open_id: task.assignee_open_id || "",
    });
    setTaskLogs([]);
    setTaskLogsLoading(true);
    listTaskAuditLogs(task.task_id)
      .then(setTaskLogs)
      .catch(() => setTaskLogs([]))
      .finally(() => setTaskLogsLoading(false));
  };

  const submitTaskDraft = async () => {
    if (!selectedTask) return;
    const title = taskDraft.title.trim();
    if (!title) {
      Toast.show({ icon: "fail", content: "请填写任务标题" });
      return;
    }
    setTaskSaving(true);
    setStatusUpdatingId(selectedTask.task_id);
    try {
      const updated = await updateTask(selectedTask.task_id, {
        title,
        description: taskDraft.description.trim() || null,
        status: taskDraft.status,
        priority: taskDraft.priority,
        assignee_open_id: taskDraft.assignee_open_id.trim() || null,
      });
      setTasks((prev) => prev.map((item) => (item.task_id === updated.task_id ? updated : item)));
      setSelectedTask(updated);
      setTaskDraft({
        title: updated.title,
        description: updated.description || "",
        status: updated.status,
        priority: updated.priority,
        assignee_open_id: updated.assignee_open_id || "",
      });
      await listTaskAuditLogs(updated.task_id).then(setTaskLogs).catch(() => setTaskLogs([]));
      if (updated.status === "done") {
        void loadProjectLogs();
      }
      Toast.show({ icon: "success", content: "任务已保存" });
    } catch (err) {
      Toast.show({ icon: "fail", content: extractMessage(err) });
    } finally {
      setTaskSaving(false);
      setStatusUpdatingId(null);
    }
  };

  const canMoveTask = (task: Task) => {
    if (!me) return false;
    return task.assignee_open_id === me.open_id || task.created_by === me.open_id || canManageProject;
  };

  const canDeleteTask = (task: Task) => {
    if (!me) return false;
    return task.created_by === me.open_id || task.assignee_open_id === me.open_id || canManageProject;
  };

  const canNotify = () => canManageProject;

  const handleNotifyTaskAgain = async (task: Task) => {
    if (!task.assignee_open_id) {
      Toast.show({ icon: "fail", content: "任务未设置负责人" });
      return;
    }
    const key = `task-${task.task_id}`;
    setNotifyingKey(key);
    try {
      await notifyTaskAgain(task.task_id);
      Toast.show({ icon: "success", content: "已再次通知任务负责人" });
    } catch (err) {
      Toast.show({ icon: "fail", content: extractMessage(err) });
    } finally {
      setNotifyingKey(null);
    }
  };

  const handleDeleteTask = async (task: Task) => {
    const confirmed = await Dialog.confirm({
      content: `确认删除任务「${task.title}」吗？`,
      confirmText: "删除",
      cancelText: "取消",
    });
    if (!confirmed) return;
    setStatusUpdatingId(task.task_id);
    try {
      await deleteTask(task.task_id);
      setTasks((prev) => prev.filter((item) => item.task_id !== task.task_id));
      setSelectedTask(null);
      await Promise.all([loadProject(), loadProjectLogs()]);
      Toast.show({ icon: "success", content: "任务已删除" });
    } catch (err) {
      Toast.show({ icon: "fail", content: extractMessage(err) });
    } finally {
      setStatusUpdatingId(null);
    }
  };

  const handleNotifyProjectMemberAgain = async (memberOpenId: string) => {
    if (!project_id) return;
    const key = `project-member-${memberOpenId}`;
    setNotifyingKey(key);
    try {
      await notifyProjectMemberAgain(project_id, memberOpenId);
      Toast.show({ icon: "success", content: "已再次通知项目成员" });
    } catch (err) {
      Toast.show({ icon: "fail", content: extractMessage(err) });
    } finally {
      setNotifyingKey(null);
    }
  };

  const handleAddTask = () => {
    if (!project) return;
    navigate(`/tasks/new?project_id=${project.project_id}`);
  };

  const submitAddMember = async (values: { member_open_id: string; tags: string }) => {
    if (!project_id) return;
    setSubmittingMember(true);
    try {
      await addProjectMember(project_id, {
        member_open_id: values.member_open_id.trim(),
        role: "member",
        share_ratio: 0,
        tags: values.tags?.trim() || null,
      });
      await loadProject();
      Toast.show({ icon: "success", content: "成员已添加" });
    } catch (err) {
      Toast.show({ icon: "fail", content: extractMessage(err) });
    } finally {
      setSubmittingMember(false);
    }
  };

  const loadChatTopics = async (projectChatId: number) => {
    if (!project_id) return;
    try {
      const topics = await listProjectChatTopics(project_id, projectChatId);
      setChatTopics((prev) => ({ ...prev, [projectChatId]: topics }));
    } catch {
      setChatTopics((prev) => ({ ...prev, [projectChatId]: [] }));
    }
  };

  const handleSyncChat = async (projectChatId: number) => {
    if (!project_id) return;
    setChatSyncingId(projectChatId);
    try {
      const result = await syncProjectChat(project_id, projectChatId, { page_size: 50, max_pages: 20 });
      await loadProject();
      await loadChatTopics(projectChatId);
      Toast.show({ icon: "success", content: `已同步 ${result.fetched} 条消息` });
    } catch (err) {
      Toast.show({ icon: "fail", content: extractMessage(err) });
    } finally {
      setChatSyncingId(null);
    }
  };

  const toggleChatReplies = async (projectChatId: number, topicKey?: string | null) => {
    if (!project_id) return;
    if (expandedChatIds[projectChatId]) {
      setExpandedChatIds((prev) => ({ ...prev, [projectChatId]: false }));
      return;
    }
    setExpandedChatIds((prev) => ({ ...prev, [projectChatId]: true }));
    if (chatMessages[projectChatId]?.length) return;
    setChatMessagesLoadingId(projectChatId);
    try {
      const page = await listProjectChatMessages(project_id, projectChatId, {
        page: 1,
        page_size: 200,
        topic_key: topicKey || undefined,
      });
      setChatMessages((prev) => ({ ...prev, [projectChatId]: page.items }));
      if (page.items.length === 0) {
        Toast.show({ content: "暂无已同步回复，请先同步话题" });
      }
    } catch (err) {
      Toast.show({ icon: "fail", content: extractMessage(err) });
    } finally {
      setChatMessagesLoadingId(null);
    }
  };

  const submitAddChat = async (values: { chat_id: string; chat_name: string; description: string; topic_key: string; topic_title: string }) => {
    if (!project_id) return;
    const chatId = values.chat_id.trim();
    if (!chatId) {
      Toast.show({ icon: "fail", content: "请填写群聊 ID" });
      return;
    }
    const topicKey = values.topic_key.trim();
    if (!topicKey.startsWith("omt_")) {
      Toast.show({ icon: "fail", content: "请填写 omt_ 开头的话题 ID" });
      return;
    }
    try {
      const chat = await addProjectChat(project_id, {
        chat_id: chatId,
        chat_name: values.chat_name?.trim() || null,
        description: values.description?.trim() || null,
        selected_topic_key: topicKey,
        selected_topic_title: values.topic_title?.trim() || topicKey,
        sync_enabled: true,
      });
      await loadProject();
      await handleSyncChat(chat.project_chat_id);
    } catch (err) {
      Toast.show({ icon: "fail", content: extractMessage(err) });
    }
  };

  const associateVisibleTopic = async (chat: LarkVisibleChat, topic: LarkChatTopicPreview) => {
    if (!project_id) return;
    try {
      const created = await addProjectChat(project_id, {
        chat_id: chat.chat_id,
        chat_name: chat.name || null,
        description: chat.description || null,
        selected_topic_key: topic.topic_key,
        selected_topic_title: topic.title || topic.topic_key,
        sync_enabled: true,
      });
      await loadProject();
      await handleSyncChat(created.project_chat_id);
    } catch (err) {
      Toast.show({ icon: "fail", content: extractMessage(err) });
    }
  };

  const loadVisibleChats = async (append = false) => {
    setChatSearching(true);
    try {
      const page = await listVisibleLarkChats({
        query: chatQuery.trim() || undefined,
        page_size: 20,
        page_token: append ? visibleChatsToken : null,
      });
      setVisibleChats((prev) => (append ? prev.concat(page.chats) : page.chats));
      setVisibleChatsToken(page.has_more ? page.page_token || null : null);
      if (!append) {
        setVisibleChatTopics({});
        setVisibleChatTopicTokens({});
      }
    } catch (err) {
      Toast.show({ icon: "fail", content: extractMessage(err) });
    } finally {
      setChatSearching(false);
    }
  };

  const loadVisibleChatTopics = async (chat: LarkVisibleChat, append = false) => {
    setTopicLoadingChatId(chat.chat_id);
    try {
      const page = await listLarkChatTopics(chat.chat_id, {
        page_size: 30,
        page_token: append ? visibleChatTopicTokens[chat.chat_id] || null : null,
      });
      setVisibleChatTopics((prev) => {
        const merged = append ? (prev[chat.chat_id] || []).concat(page.topics) : page.topics;
        const unique = merged.filter(
          (topic, index, list) => list.findIndex((item) => item.topic_key === topic.topic_key) === index,
        );
        return { ...prev, [chat.chat_id]: unique };
      });
      setVisibleChatTopicTokens((prev) => ({ ...prev, [chat.chat_id]: page.has_more ? page.page_token || null : null }));
      if (page.topics.length === 0 && !append) {
        Toast.show({ content: "暂未读取到话题" });
      }
    } catch (err) {
      Toast.show({ icon: "fail", content: extractMessage(err) });
    } finally {
      setTopicLoadingChatId(null);
    }
  };

  const openAddChatDialog = () => {
    let currentValues = { chat_id: "", chat_name: "", description: "", topic_key: "", topic_title: "" };

    Dialog.show({
      title: "手动关联话题",
      content: (
        <Form
          layout="vertical"
          initialValues={currentValues}
          onValuesChange={(_, allValues) => {
            currentValues = allValues as typeof currentValues;
          }}
          footer={
            <Button
              block
              color="primary"
              onClick={() => {
                Dialog.clear();
                void submitAddChat(currentValues);
              }}
            >
              关联话题并同步
            </Button>
          }
          style={{ paddingTop: 8 }}
        >
          <Form.Item name="chat_id" label="群聊 ID" rules={[{ required: true, message: "请填写群聊 ID" }]}>
            <Input placeholder="oc_xxx" clearable />
          </Form.Item>
          <Form.Item name="topic_key" label="话题 ID" rules={[{ required: true, message: "请填写话题 ID" }]}>
            <Input placeholder="omt_xxx" clearable />
          </Form.Item>
          <Form.Item name="topic_title" label="话题名称">
            <Input placeholder="显示在项目里的话题名称" clearable />
          </Form.Item>
          <Form.Item name="chat_name" label="群聊名称">
            <Input placeholder="例如：项目推进群" clearable />
          </Form.Item>
          <Form.Item name="description" label="备注">
            <Input placeholder="可填写用途或对应阶段" clearable />
          </Form.Item>
        </Form>
      ),
      closeOnMaskClick: true,
    });
  };

  const handleDeleteChat = async (projectChatId: number) => {
    if (!project_id) return;
    const confirmed = await Dialog.confirm({
      content: "确认取消关联该群聊吗？已同步的消息分析数据会一起删除。",
      confirmText: "取消关联",
      cancelText: "返回",
    });
    if (!confirmed) return;
    try {
      await deleteProjectChat(project_id, projectChatId);
      await loadProject();
      Toast.show({ icon: "success", content: "群聊关联已删除" });
    } catch (err) {
      Toast.show({ icon: "fail", content: extractMessage(err) });
    }
  };

  const openAddMemberDialog = () => {
    let currentValues = { member_open_id: "", tags: "" };

    Dialog.show({
      title: "添加成员",
      content: (
        <Form
          layout="vertical"
          initialValues={currentValues}
          onValuesChange={(values, allValues) => {
            currentValues = allValues as typeof currentValues;
          }}
          footer={
            <Button
              block
              color="primary"
              loading={submittingMember}
              onClick={() => {
                Dialog.clear();
                void submitAddMember(currentValues);
              }}
            >
              提交
            </Button>
          }
          style={{ paddingTop: 8 }}
        >
          <Form.Item name="member_open_id" label="成员" rules={[{ required: true, message: "请选择成员" }]}>
            <MemberPicker placeholder="搜索成员姓名 / 部门" />
          </Form.Item>
          <Form.Item name="tags" label="自定义标签">
            <Input placeholder="例如：前端, 算法；默认参与者" clearable />
          </Form.Item>
        </Form>
      ),
      closeOnMaskClick: true,
    });
  };

  const handleRemoveMember = async (memberOpenId: string) => {
    if (!project_id) return;
    const confirmed = await Dialog.confirm({
      content: "确认将该成员移出项目吗？",
      confirmText: "移除",
      cancelText: "取消",
    });

    if (!confirmed) return;

    try {
      await removeProjectMember(project_id, memberOpenId);
      await loadProject();
      Toast.show({ icon: "success", content: "成员已移除" });
    } catch (err) {
      Toast.show({ icon: "fail", content: extractMessage(err) });
    }
  };

  if (loading) {
    return (
      <PageShell>
        <SectionLoading text="正在加载项目详情..." />
      </PageShell>
    );
  }

  if (!project) {
    return (
      <PageShell>
        <SectionError title="项目不存在" description="请返回项目列表重新选择" />
      </PageShell>
    );
  }

  const status = projectStatusStyle[project.status];
  const priority = priorityStyle[project.priority];
  const projectType = projectTypeStyle[project.project_type || "team"];
  return (
    <PageShell>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingBottom: 20 }}>
        <Button
          fill="solid"
          color="primary"
          style={{
            alignSelf: "flex-start",
            "--text-color": "#ffffff",
            "--background-color": colors.primary,
            "--border-radius": "999px",
            boxShadow: "0 10px 24px rgba(79,70,229,0.2)",
          } as CSSProperties}
          onClick={() => navigate(-1)}
        >
          返回上一页
        </Button>

        <Card style={sectionCardStyle}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: colors.title, lineHeight: 1.3 }}>{project.name}</div>
                {project.description ? (
                  <div style={{ ...lineClamp(4), marginTop: 8, color: colors.body, fontSize: 13, lineHeight: 1.7 }}>
                    {project.description}
                  </div>
                ) : null}
              </div>
              <MemberAvatarLink
                openId={project.owner_open_id}
                viewerOpenId={me?.open_id}
                src={members[project.owner_open_id]?.avatar_url}
                name={members[project.owner_open_id]?.name || project.owner_open_id}
                size={48}
              />
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {project.publication_status === "draft" ? (
                <span style={chipStyle("#fef3c7", "#92400e", 700)}>暂存</span>
              ) : (
                <span style={chipStyle(status.bg, status.fg)}>{status.label}</span>
              )}
              <span style={chipStyle(projectType.bg, projectType.fg, 700)}>{projectType.label}</span>
              {project.is_abnormal ? <span style={chipStyle("#fee2e2", "#b91c1c", 700)}>异常</span> : null}
              <span style={chipStyle(priority.bg, priority.fg)}>{priority.label}优先级</span>
              <span style={chipStyle("#f3f4f6", "#4b5563", 500)}>{project.department || "未设置部门"}</span>
              {project.tags ? <span style={chipStyle("#eef2ff", "#4338ca", 500)}>{project.tags}</span> : null}
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: 10,
              }}
            >
              <div style={{ padding: "12px 14px", borderRadius: 12, background: "#f8fafc", border: "1px solid rgba(229,231,235,0.85)" }}>
                <div style={{ color: colors.muted, fontSize: 11 }}>项目周期</div>
                <div style={{ marginTop: 5, color: colors.title, fontSize: 15, fontWeight: 700 }}>{project.days_active} 天 已进行</div>
              </div>
              <div style={{ padding: "12px 14px", borderRadius: 12, background: "#f8fafc", border: "1px solid rgba(229,231,235,0.85)" }}>
                <div style={{ color: colors.muted, fontSize: 11 }}>积分分配</div>
                <div style={{ marginTop: 5, color: colors.title, fontSize: 15, fontWeight: 700 }}>开发中</div>
              </div>
            </div>
            <div style={{ color: colors.muted, fontSize: 12 }}>
              目标截止：{formatDateTime(project.target_end_date)} · 负责人：
              <MemberNameLink
                openId={project.owner_open_id}
                viewerOpenId={me?.open_id}
                style={{ color: colors.muted, fontSize: 12 }}
              >
                {members[project.owner_open_id]?.name || project.owner_open_id}
              </MemberNameLink>
            </div>
            {project.is_abnormal ? (
              <div style={{ padding: "10px 12px", borderRadius: 10, background: "#fef2f2", color: "#b91c1c", fontSize: 12, fontWeight: 700 }}>
                {project.abnormal_reason || "项目存在异常"}
              </div>
            ) : null}
            {canManageProject ? (
              <div style={{ marginTop: 4, paddingTop: 12, borderTop: "1px solid #E5E6EB", display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ color: colors.title, fontSize: 14, fontWeight: 800 }}>项目编辑</div>
                  <Button size="small" color="primary" loading={projectSaving} onClick={() => void submitProjectDraft()}>
                    保存项目
                  </Button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1.2fr) minmax(180px, 0.8fr)", gap: 10 }}>
                  <div>
                    <div style={{ color: colors.muted, fontSize: 12, fontWeight: 700, marginBottom: 6 }}>项目名称</div>
                    <Input value={projectDraft.name} onChange={(value) => setProjectDraft((prev) => ({ ...prev, name: value }))} clearable />
                  </div>
                  <div>
                    <div style={{ color: colors.muted, fontSize: 12, fontWeight: 700, marginBottom: 6 }}>部门</div>
                    <Input value={projectDraft.department} onChange={(value) => setProjectDraft((prev) => ({ ...prev, department: value }))} placeholder="未设置部门" clearable />
                  </div>
                </div>
                <div>
                  <div style={{ color: colors.muted, fontSize: 12, fontWeight: 700, marginBottom: 6 }}>项目描述</div>
                  <TextArea
                    value={projectDraft.description}
                    onChange={(value) => setProjectDraft((prev) => ({ ...prev, description: value }))}
                    placeholder="补充项目目标、范围和交付标准"
                    autoSize={{ minRows: 2, maxRows: 5 }}
                  />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
                  <div>
                    <div style={{ color: colors.muted, fontSize: 12, fontWeight: 700, marginBottom: 6 }}>状态</div>
                    <Selector
                      value={[projectDraft.status]}
                      options={[
                        { label: "规划中", value: "planning" },
                        { label: "进行中", value: "active" },
                        { label: "暂停", value: "paused" },
                        { label: "完成", value: "completed" },
                        { label: "归档", value: "archived" },
                      ]}
                      columns={3}
                      showCheckMark={false}
                      onChange={(value) => setProjectDraft((prev) => ({ ...prev, status: (value[0] || "active") as ProjectStatus }))}
                    />
                  </div>
                  <div>
                    <div style={{ color: colors.muted, fontSize: 12, fontWeight: 700, marginBottom: 6 }}>优先级</div>
                    <Selector
                      value={[projectDraft.priority]}
                      options={[
                        { label: "低", value: "low" },
                        { label: "中", value: "medium" },
                        { label: "高", value: "high" },
                        { label: "紧急", value: "urgent" },
                      ]}
                      columns={4}
                      showCheckMark={false}
                      onChange={(value) => setProjectDraft((prev) => ({ ...prev, priority: (value[0] || "medium") as ProjectPriority }))}
                    />
                  </div>
                  <div>
                    <div style={{ color: colors.muted, fontSize: 12, fontWeight: 700, marginBottom: 6 }}>类型</div>
                    <Selector
                      value={[projectDraft.project_type]}
                      options={[
                        { label: "团队", value: "team" },
                        { label: "个人", value: "personal" },
                      ]}
                      columns={2}
                      showCheckMark={false}
                      onChange={(value) => setProjectDraft((prev) => ({ ...prev, project_type: (value[0] || "team") as ProjectType }))}
                    />
                  </div>
                </div>
                <div>
                  <div style={{ color: colors.muted, fontSize: 12, fontWeight: 700, marginBottom: 6 }}>标签</div>
                  <Input value={projectDraft.tags} onChange={(value) => setProjectDraft((prev) => ({ ...prev, tags: value }))} placeholder="例如：小卷, 数据平台" clearable />
                </div>
              </div>
            ) : null}
          </div>
        </Card>

        {canManageProject ? (
          <Card style={sectionCardStyle}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ color: colors.title, fontSize: 15, fontWeight: 700 }}>操作</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {project.status !== "active" ? <Button size="small" onClick={() => patchProjectStatus("active")}>恢复进行中</Button> : null}
                <Button size="small" onClick={() => patchProjectStatus("completed")}>标记完成</Button>
                <Button size="small" onClick={() => patchProjectStatus("paused")}>暂停</Button>
                <Button size="small" onClick={() => patchProjectStatus("archived")}>归档</Button>
                {project.publication_status === "draft" ? (
                  <Button size="small" color="primary" onClick={handlePublishProject}>确认发布</Button>
                ) : null}
                <Button size="small" onClick={openRelationComposer}>关联项目</Button>
                <Button size="small" onClick={openAddMemberDialog}>添加成员</Button>
              </div>
            </div>
          </Card>
        ) : null}


        <Card style={sectionCardStyle}>
          <Tabs activeKey={activeKey} onChange={(key) => setActiveKey(key as DetailTabKey)}>
            <Tabs.Tab key="tasks" title="任务">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, paddingTop: 14, flexWrap: "wrap" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: colors.title, fontSize: 14, fontWeight: 800 }}>项目任务</div>
                  <div style={{ marginTop: 3, color: colors.muted, fontSize: 12 }}>
                    当前显示 {filteredBoardTasks.length} / {tasks.length} 条任务
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
                  <div style={{ minWidth: 180, maxWidth: 300 }}>
                    <Selector
                      value={[taskAssigneeFilter]}
                      options={taskAssigneeOptions}
                      columns={1}
                      showCheckMark={false}
                      onChange={(value) => setTaskAssigneeFilter(String(value[0] || TASK_ASSIGNEE_ALL))}
                    />
                  </div>
                  <Button
                    size="small"
                    color="primary"
                    onClick={handleAddTask}
                    style={{ "--border-radius": "999px", "--background-color": colors.primary } as CSSProperties}
                  >
                    ＋ 添加任务
                  </Button>
                </div>
              </div>
              {taskLoading ? <SectionLoading text="正在加载任务..." /> : null}
              {!taskLoading ? (
                <div style={{ marginTop: 12, border: "1px solid #E5E6EB", borderRadius: 6, overflow: "hidden", background: "#FFFFFF" }}>
                  <div style={{ overflowX: "auto" }}>
                    <div style={{ minWidth: 760 }}>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "minmax(260px, 1.6fr) 118px 132px 104px 132px 112px",
                          minHeight: 34,
                          alignItems: "center",
                          padding: "0 12px",
                          background: "#F7F8FA",
                          borderBottom: "1px solid #E5E6EB",
                          color: "#646A73",
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        <div>任务</div>
                        <div>状态</div>
                        <div>负责人</div>
                        <div>优先级</div>
                        <div>截止时间</div>
                        <div style={{ textAlign: "right" }}>操作</div>
                      </div>
                      {filteredBoardTasks.length ? (
                        filteredBoardTasks.map((task) => (
                          <Fragment key={task.task_id}>
                            <div
                              role="button"
                              tabIndex={0}
                              onClick={() => openTaskDetail(task)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") openTaskDetail(task);
                              }}
                              style={{
                                display: "grid",
                                gridTemplateColumns: "minmax(260px, 1.6fr) 118px 132px 104px 132px 112px",
                                minHeight: 42,
                                alignItems: "center",
                                padding: "0 12px",
                                borderBottom: selectedTask?.task_id === task.task_id ? "0" : "1px solid #F2F3F5",
                                background: selectedTask?.task_id === task.task_id ? "#F7F8FA" : "#FFFFFF",
                                color: "#1F2329",
                                fontSize: 13,
                                cursor: "pointer",
                              }}
                            >
                              <div style={{ minWidth: 0, paddingRight: 12 }}>
                                <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 700 }}>
                                  {task.title}
                                </div>
                                {task.description ? (
                                  <div style={{ marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: colors.muted, fontSize: 12 }}>
                                    {task.description}
                                  </div>
                                ) : null}
                              </div>
                              <div>
                                <span style={chipStyle(taskStatusStyle[task.status].bg, taskStatusStyle[task.status].fg, 600)}>
                                  {taskStatusStyle[task.status].label}
                                </span>
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                                {task.assignee_open_id ? (
                                  <MemberAvatarLink
                                    openId={task.assignee_open_id}
                                    viewerOpenId={me?.open_id}
                                    src={members[task.assignee_open_id]?.avatar_url}
                                    name={members[task.assignee_open_id]?.name || task.assignee_open_id}
                                    size={24}
                                    receiptStatus={task.received_at ? "received" : "pending"}
                                  />
                                ) : null}
                                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: task.assignee_open_id ? colors.body : colors.muted }}>
                                  {task.assignee_open_id ? members[task.assignee_open_id]?.name || "未命名" : "未分配"}
                                </span>
                              </div>
                              <div>
                                <span style={chipStyle(priorityStyle[task.priority].bg, priorityStyle[task.priority].fg, 600)}>
                                  {priorityStyle[task.priority].label}
                                </span>
                              </div>
                              <div style={{ color: colors.muted, fontSize: 12 }}>{formatDateTime(task.due_date)}</div>
                              <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
                                <Button
                                  size="mini"
                                  fill="none"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    openTaskDetail(task);
                                  }}
                                >
                                  {selectedTask?.task_id === task.task_id ? "收起" : "展开"}
                                </Button>
                                {canDeleteTask(task) ? (
                                  <Button
                                    size="mini"
                                    fill="none"
                                    color="danger"
                                    loading={statusUpdatingId === task.task_id}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      if (statusUpdatingId !== task.task_id) void handleDeleteTask(task);
                                    }}
                                  >
                                    删除
                                  </Button>
                                ) : null}
                              </div>
                            </div>
                            {selectedTask?.task_id === task.task_id ? (
                              <div style={{ borderBottom: "1px solid #E5E6EB", background: "#F7F8FA", padding: 12 }}>
                                <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 1fr) 320px", gap: 12, alignItems: "start" }}>
                                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                    <div>
                                      <div style={{ color: colors.muted, fontSize: 12, fontWeight: 700, marginBottom: 6 }}>任务标题</div>
                                      <Input value={taskDraft.title} onChange={(value) => setTaskDraft((prev) => ({ ...prev, title: value }))} clearable />
                                    </div>
                                    <div>
                                      <div style={{ color: colors.muted, fontSize: 12, fontWeight: 700, marginBottom: 6 }}>任务描述</div>
                                      <TextArea
                                        value={taskDraft.description}
                                        onChange={(value) => setTaskDraft((prev) => ({ ...prev, description: value }))}
                                        placeholder="补充执行说明、依赖和交付标准"
                                        autoSize={{ minRows: 3, maxRows: 6 }}
                                      />
                                    </div>
                                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                      <Button size="small" color="primary" loading={taskSaving} disabled={!canMoveTask(task)} onClick={() => void submitTaskDraft()}>
                                        保存任务
                                      </Button>
                                      {canNotify() && task.assignee_open_id ? (
                                        <Button size="small" fill="outline" color="primary" loading={notifyingKey === `task-${task.task_id}`} onClick={() => handleNotifyTaskAgain(task)}>
                                          再次通知
                                        </Button>
                                      ) : null}
                                      <Button size="small" fill="none" onClick={() => setSelectedTask(null)}>收起</Button>
                                    </div>
                                  </div>
                                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                    <div>
                                      <div style={{ color: colors.muted, fontSize: 12, fontWeight: 700, marginBottom: 6 }}>状态</div>
                                      <Selector
                                        value={[taskDraft.status]}
                                        options={[
                                          { label: "待办", value: "todo" },
                                          { label: "进行中", value: "in_progress" },
                                          { label: "已完成", value: "done" },
                                          { label: "阻塞", value: "blocked" },
                                          { label: "已取消", value: "cancelled" },
                                        ]}
                                        columns={3}
                                        showCheckMark={false}
                                        onChange={(value) => setTaskDraft((prev) => ({ ...prev, status: (value[0] || "todo") as TaskStatus }))}
                                      />
                                    </div>
                                    <div>
                                      <div style={{ color: colors.muted, fontSize: 12, fontWeight: 700, marginBottom: 6 }}>优先级</div>
                                      <Selector
                                        value={[taskDraft.priority]}
                                        options={[
                                          { label: "低", value: "low" },
                                          { label: "中", value: "medium" },
                                          { label: "高", value: "high" },
                                          { label: "紧急", value: "urgent" },
                                        ]}
                                        columns={4}
                                        showCheckMark={false}
                                        onChange={(value) => setTaskDraft((prev) => ({ ...prev, priority: (value[0] || "medium") as ProjectPriority }))}
                                      />
                                    </div>
                                    <div>
                                      <div style={{ color: colors.muted, fontSize: 12, fontWeight: 700, marginBottom: 6 }}>负责人</div>
                                      <MemberPicker
                                        value={taskDraft.assignee_open_id}
                                        onChange={(value) => setTaskDraft((prev) => ({ ...prev, assignee_open_id: String(value || "") }))}
                                        placeholder="选择负责人"
                                      />
                                    </div>
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, color: colors.muted, fontSize: 12 }}>
                                      <div>截止：{formatDateTime(task.due_date)}</div>
                                      <div style={{ color: task.received_at ? colors.success : colors.danger }}>
                                        {task.assignee_open_id ? (task.received_at ? "已收到" : "未收到") : "未设置负责人"}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                                <div style={{ marginTop: 12, padding: 10, borderRadius: 6, background: "#FFFFFF", border: "1px solid #E5E6EB" }}>
                                  <div style={{ color: colors.title, fontSize: 13, fontWeight: 800, marginBottom: 8 }}>任务更新日志</div>
                                  {taskLogsLoading ? <SectionLoading text="正在加载日志..." /> : null}
                                  {!taskLogsLoading && taskLogs.length === 0 ? <div style={{ color: colors.muted, fontSize: 12 }}>暂无任务变更记录</div> : null}
                                  {!taskLogsLoading && taskLogs.length > 0 ? (
                                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                      {taskLogs.map((log) => (
                                        <div key={log.log_id} style={{ padding: "7px 8px", borderRadius: 6, background: "#F7F8FA", border: "1px solid #F2F3F5" }}>
                                          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, color: colors.muted, fontSize: 11 }}>
                                            <span>{log.actor_name || log.actor_open_id}</span>
                                            <span>{formatDateTime(log.created_at)}</span>
                                          </div>
                                          <div style={{ marginTop: 4, color: colors.body, fontSize: 12, lineHeight: 1.55 }}>
                                            {describeLog(log, members).join("；")}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            ) : null}
                          </Fragment>
                        ))
                      ) : (
                        <div style={{ padding: 24, color: colors.muted, fontSize: 13, textAlign: "center" }}>当前筛选下暂无任务</div>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}
            </Tabs.Tab>
            <Tabs.Tab key="members" title="成员">
              <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 14 }}>
                {project.members.filter((member) => !member.left_at).length === 0 ? (
                  <SectionEmpty description="项目下还没有有效成员" />
                ) : (
                  project.members
                    .filter((member) => !member.left_at)
                    .map((member) => {
                      const profile = members[member.member_open_id];
                      const role = memberRoleStyle[member.role];

                      return (
                        <div
                          key={member.member_open_id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 12,
                            padding: 12,
                            border: "1px solid rgba(229,231,235,0.92)",
                            borderRadius: 12,
                            background: "#ffffff",
                          }}
                        >
                          <MemberAvatarLink
                            openId={member.member_open_id}
                            viewerOpenId={me?.open_id}
                            src={profile?.avatar_url}
                            name={profile?.name || member.member_open_id}
                            size={44}
                            receiptStatus={member.received_at ? "received" : "pending"}
                          />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <MemberNameLink
                              openId={member.member_open_id}
                              viewerOpenId={me?.open_id}
                              style={{ fontSize: 14, fontWeight: 700, color: colors.title }}
                            >
                              {profile?.name || member.member_open_id}
                            </MemberNameLink>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                              <span style={chipStyle(role.bg, role.fg, 600)}>{role.label}</span>
                              <span style={chipStyle("#f8fafc", "#4b5563", 500)}>积分后续分配</span>
                              {member.tags ? <span style={chipStyle("#ecfeff", "#0f766e", 500)}>{member.tags}</span> : null}
                            </div>
                          </div>
                          {canNotify() ? (
                            <Button
                              size="mini"
                              fill="outline"
                              color="primary"
                              loading={notifyingKey === `project-member-${member.member_open_id}`}
                              onClick={() => handleNotifyProjectMemberAgain(member.member_open_id)}
                            >
                              再次通知
                            </Button>
                          ) : null}
                          {canManageProject && member.role !== "owner" ? (
                            <Button size="mini" color="danger" fill="outline" onClick={() => handleRemoveMember(member.member_open_id)}>
                              删除
                            </Button>
                          ) : null}
                        </div>
                      );
                    })
                )}
              </div>
            </Tabs.Tab>
            <Tabs.Tab key="chats" title="群聊">
              <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 14 }}>
                {canManageProject ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <Input
                        value={chatQuery}
                        onChange={setChatQuery}
                        placeholder="搜索我的飞书群聊"
                        clearable
                        style={{ "--background-color": "#f8fafc", "--border-radius": "10px" } as CSSProperties}
                      />
                      <Button size="small" color="primary" loading={chatSearching} onClick={() => loadVisibleChats(false)}>
                        查找
                      </Button>
                      <Button size="small" fill="outline" onClick={openAddChatDialog}>
                        手填话题
                      </Button>
                    </div>
                    {visibleChats.length > 0 ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <div style={{ display: "flex", justifyContent: "flex-end" }}>
                          <Button
                            size="mini"
                            fill="none"
                            onClick={() => {
                              setVisibleChats([]);
                              setVisibleChatsToken(null);
                            }}
                          >
                            收起
                          </Button>
                        </div>
                        {visibleChats.map((chat) => {
                          const topics = visibleChatTopics[chat.chat_id] || [];
                          return (
                            <div
                              key={chat.chat_id}
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: 8,
                                padding: 10,
                                borderRadius: 12,
                                background: "#f8fafc",
                                border: "1px solid rgba(229,231,235,0.85)",
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                {chat.avatar ? (
                                  <img src={chat.avatar} alt="" style={{ width: 36, height: 36, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
                                ) : (
                                  <div style={{ width: 36, height: 36, borderRadius: 8, background: "#e5e7eb", flexShrink: 0 }} />
                                )}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: 13, fontWeight: 700, color: colors.title }}>{chat.name || "未命名群聊"}</div>
                                  <div style={{ marginTop: 3, color: colors.muted, fontSize: 11, wordBreak: "break-all" }}>{chat.chat_id}</div>
                                </div>
                                <Button
                                  size="mini"
                                  fill="outline"
                                  loading={topicLoadingChatId === chat.chat_id}
                                  onClick={() => loadVisibleChatTopics(chat)}
                                >
                                  选择话题
                                </Button>
                              </div>
                              {topics.length > 0 ? (
                                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                  {topics.map((topic) => {
                                    const linked = project.chats.some(
                                      (item) => item.chat_id === chat.chat_id && item.selected_topic_key === topic.topic_key,
                                    );
                                    return (
                                      <div
                                        key={topic.topic_key}
                                        style={{
                                          display: "flex",
                                          alignItems: "center",
                                          justifyContent: "space-between",
                                          gap: 8,
                                          padding: "8px 10px",
                                          borderRadius: 10,
                                          background: "#ffffff",
                                        }}
                                      >
                                        <div style={{ minWidth: 0 }}>
                                          <div style={{ ...lineClamp(2), fontSize: 13, fontWeight: 700, color: colors.title }}>
                                            {topic.title || topic.topic_key}
                                          </div>
                                          <div style={{ marginTop: 3, color: colors.muted, fontSize: 11 }}>
                                            {topic.reply_count} 条 · {formatDateTime(topic.last_reply_at)}
                                          </div>
                                        </div>
                                        <Button
                                          size="mini"
                                          color={linked ? "default" : "primary"}
                                          disabled={linked}
                                          onClick={() => associateVisibleTopic(chat, topic)}
                                        >
                                          {linked ? "已关联" : "关联"}
                                        </Button>
                                      </div>
                                    );
                                  })}
                                  {visibleChatTopicTokens[chat.chat_id] ? (
                                    <Button
                                      size="mini"
                                      fill="outline"
                                      loading={topicLoadingChatId === chat.chat_id}
                                      onClick={() => loadVisibleChatTopics(chat, true)}
                                    >
                                      加载更多话题
                                    </Button>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                        {visibleChatsToken ? (
                          <Button size="small" fill="outline" loading={chatSearching} onClick={() => loadVisibleChats(true)}>
                            加载更多
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {project.chats.length === 0 ? (
                  <SectionEmpty description="暂未关联飞书群聊" />
                ) : (
                  project.chats.map((chat) => {
                    const topics = chatTopics[chat.project_chat_id] || [];
                    return (
                      <div
                        key={chat.project_chat_id}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 10,
                          padding: 12,
                          border: "1px solid rgba(229,231,235,0.92)",
                          borderRadius: 12,
                          background: "#ffffff",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: colors.title }}>
                              {chat.chat_name || "飞书群聊"}
                            </div>
                            <div style={{ marginTop: 4, color: colors.muted, fontSize: 12, wordBreak: "break-all" }}>
                              {chat.chat_id}
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                            <Button
                              size="mini"
                              fill="outline"
                              loading={chatSyncingId === chat.project_chat_id}
                              onClick={() => handleSyncChat(chat.project_chat_id)}
                            >
                              同步
                            </Button>
                            {canManageProject ? (
                              <Button size="mini" color="danger" fill="none" onClick={() => handleDeleteChat(chat.project_chat_id)}>
                                删除
                              </Button>
                            ) : null}
                          </div>
                        </div>
                        {chat.description ? <div style={{ color: colors.body, fontSize: 12 }}>{chat.description}</div> : null}
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          <span style={chipStyle("#eef2ff", "#4338ca", 600)}>已选话题</span>
                          {chat.is_stale ? <span style={chipStyle("#fee2e2", "#b91c1c", 700)}>异常</span> : null}
                          <span style={chipStyle("#f0fdf4", "#15803d", 600)}>消息 {chat.message_count}</span>
                          <span style={chipStyle("#f8fafc", "#4b5563", 500)}>同步 {formatDateTime(chat.last_synced_at)}</span>
                        </div>
                        <div style={{ padding: 10, borderRadius: 10, background: "#f8fafc", border: "1px solid rgba(229,231,235,0.85)" }}>
                          <div style={{ color: colors.muted, fontSize: 11 }}>关联话题</div>
                          <div style={{ marginTop: 5, color: colors.title, fontSize: 13, fontWeight: 700 }}>
                            {chat.selected_topic_title || chat.latest_topic_title || "暂无"}
                          </div>
                          <div style={{ marginTop: 4, color: colors.muted, fontSize: 12 }}>
                            最后回复：{formatDateTime(chat.latest_topic_reply_at)}
                          </div>
                          {chat.is_stale ? (
                            <div style={{ marginTop: 6, color: "#b91c1c", fontSize: 12, fontWeight: 700 }}>
                              {chat.stale_reason || "关联话题超过 48 小时无新回复"}
                            </div>
                          ) : null}
                        </div>
                        <Button
                          size="mini"
                          fill="outline"
                          loading={chatMessagesLoadingId === chat.project_chat_id}
                          onClick={() => toggleChatReplies(chat.project_chat_id, chat.selected_topic_key || chat.latest_topic_key)}
                        >
                          {expandedChatIds[chat.project_chat_id] ? "收起回复" : "展开回复"}
                        </Button>
                        {expandedChatIds[chat.project_chat_id] ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {(chatMessages[chat.project_chat_id] || []).length === 0 ? (
                              <div style={{ color: colors.muted, fontSize: 12, padding: "8px 2px" }}>
                                暂无已同步回复
                              </div>
                            ) : (
                              (chatMessages[chat.project_chat_id] || []).map((message) => (
                                <div
                                  key={message.project_chat_message_id}
                                  style={{
                                    padding: 10,
                                    borderRadius: 10,
                                    background: "#ffffff",
                                    border: "1px solid rgba(229,231,235,0.85)",
                                  }}
                                >
                                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                                    <div style={{ color: colors.title, fontSize: 12, fontWeight: 700 }}>
                                      {message.sender_name || message.sender_open_id || "未知成员"}
                                    </div>
                                    <div style={{ color: colors.muted, fontSize: 11, flexShrink: 0 }}>
                                      {formatDateTime(message.message_created_at)}
                                    </div>
                                  </div>
                                  <div style={{ marginTop: 6, color: colors.body, fontSize: 12, lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word", overflowWrap: "anywhere", maxWidth: "100%", overflow: "hidden" }}>
                                    {message.content || `[${message.msg_type || "消息"}]`}
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        ) : null}
                        {topics.length > 0 ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {topics.slice(0, 5).map((topic) => (
                              <div
                                key={topic.project_chat_topic_id}
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  gap: 10,
                                  padding: "8px 10px",
                                  borderRadius: 10,
                                  background: "#fafafa",
                                }}
                              >
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ ...lineClamp(2), color: colors.title, fontSize: 13, fontWeight: 600 }}>
                                    {topic.title || topic.topic_key}
                                  </div>
                                  <div style={{ marginTop: 3, color: colors.muted, fontSize: 11 }}>
                                    {topic.topic_key}
                                  </div>
                                </div>
                                <div style={{ flexShrink: 0, textAlign: "right", color: colors.muted, fontSize: 11 }}>
                                  <div>{topic.reply_count} 条</div>
                                  <div>{formatDateTime(topic.last_reply_at)}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <Button size="mini" fill="none" onClick={() => loadChatTopics(chat.project_chat_id)}>
                            查看话题
                          </Button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </Tabs.Tab>
            <Tabs.Tab key="relations" title="关联">
              <div style={{ paddingTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
                {canManageProject ? (
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
                    <Button size="small" color="primary" onClick={openRelationComposer}>
                      ＋ 关联项目
                    </Button>
                  </div>
                ) : null}
                {projectRelations.length === 0 ? <SectionEmpty description="暂无关联项目" /> : null}
                {projectRelations.length > 0 ? (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
                    {projectRelations.map((relation) => (
                      <div
                        key={relation.relation_id}
                        style={{
                          padding: 12,
                          borderRadius: 12,
                          background: "#ffffff",
                          border: "1px solid rgba(226,232,240,0.95)",
                          boxShadow: "0 8px 18px rgba(15,23,42,0.04)",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ ...lineClamp(2), color: colors.title, fontSize: 14, fontWeight: 800 }}>
                              {relation.project_name}
                            </div>
                            <div style={{ marginTop: 4, color: colors.muted, fontSize: 11 }}>
                              {relation.direction === "outgoing" ? "本项目关联到对方" : "对方关联到本项目"} · {formatDateTime(relation.created_at)}
                            </div>
                          </div>
                          <span style={chipStyle("#ecfeff", "#0f766e", 800)}>{relation.relation_label}</span>
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                          <span style={chipStyle(projectStatusStyle[relation.project_status].bg, projectStatusStyle[relation.project_status].fg, 700)}>
                            {projectStatusStyle[relation.project_status].label}
                          </span>
                          <span style={chipStyle(projectTypeStyle[relation.project_type].bg, projectTypeStyle[relation.project_type].fg, 700)}>
                            {projectTypeStyle[relation.project_type].label}
                          </span>
                          {relation.tags ? <span style={chipStyle("#f8fafc", "#4b5563", 600)}>{relation.tags}</span> : null}
                        </div>
                        {relation.title ? (
                          <div style={{ marginTop: 8, color: colors.title, fontSize: 13, fontWeight: 700 }}>{relation.title}</div>
                        ) : null}
                        {relation.description ? (
                          <div style={{ marginTop: 6, color: colors.body, fontSize: 12, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
                            {relation.description}
                          </div>
                        ) : null}
                        <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <Button size="mini" fill="outline" onClick={() => navigate(`/projects/${relation.project_id}`)}>
                            查看项目
                          </Button>
                          {canManageProject ? (
                            <Button size="mini" color="danger" fill="none" onClick={() => handleDeleteProjectRelation(relation)}>
                              取消关联
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </Tabs.Tab>
            <Tabs.Tab key="logs" title="项目日志">
              <div style={{ paddingTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {logKindOptions.map((option) => (
                    <Button
                      key={option.value}
                      size="small"
                      fill={option.value === "note" ? "solid" : "outline"}
                      color="primary"
                      onClick={() => openLogComposer(option.value)}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
                {projectLogs.length === 0 ? <SectionEmpty description="暂无项目日志" /> : null}
                {projectLogs.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {projectLogs.map((log) => {
                      const isStallAlert = log.resource_type === "project_stall_check";
                      return (
                      <div
                        key={log.log_id}
                        style={{
                          padding: 12,
                          borderRadius: 12,
                          background: isStallAlert ? "#fef2f2" : "#ffffff",
                          border: isStallAlert ? "1px solid #fca5a5" : "1px solid rgba(226,232,240,0.95)",
                          boxShadow: isStallAlert ? "0 10px 22px rgba(185,28,28,0.10)" : "0 8px 18px rgba(15,23,42,0.04)",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ color: isStallAlert ? "#991b1b" : colors.title, fontSize: 14, fontWeight: 800, lineHeight: 1.5 }}>{log.title}</div>
                            <div style={{ marginTop: 3, color: colors.muted, fontSize: 11 }}>
                              {formatDateTime(log.created_at)} · {log.actor_name || log.actor_open_id}
                            </div>
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 5, alignItems: "flex-end", flexShrink: 0 }}>
                            <span style={chipStyle(isStallAlert ? "#fee2e2" : "#e0f2fe", isStallAlert ? "#b91c1c" : "#075985", 800)}>
                              {isStallAlert ? "异常" : log.kind_label}
                            </span>
                            <span style={chipStyle(logStatusStyle[log.status].bg, logStatusStyle[log.status].fg, 800)}>{log.status_label}</span>
                          </div>
                        </div>
                        {log.body ? (
                          <div style={{ marginTop: 8, color: isStallAlert ? "#7f1d1d" : colors.body, fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
                            {log.body}
                          </div>
                        ) : null}
                        <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6, color: colors.muted, fontSize: 12 }}>
                          {log.target_name ? <span>对象: {log.target_name}</span> : null}
                          {log.approver_name ? <span>审批: {log.approver_name}</span> : null}
                          {log.resource_type && !isStallAlert ? <span>资源: {log.resource_type}</span> : null}
                          {log.paper_id ? <span>论文: #{log.paper_id}</span> : null}
                          {log.paper_stage ? <span>节点: {paperStageOptions.find((item) => item.value === log.paper_stage)?.label || log.paper_stage}</span> : null}
                        </div>
                        <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <Button
                            size="mini"
                            fill="outline"
                            loading={notifyingKey === `log-${log.log_id}`}
                            onClick={() => handleNotifyProjectLog(log)}
                          >
                            发送通知
                          </Button>
                          {log.status === "pending_approval" && (log.approver_open_id === me?.open_id || canManageProject) ? (
                            <>
                              <Button size="mini" color="primary" onClick={() => handleDecideProjectLog(log, true)}>通过</Button>
                              <Button size="mini" color="danger" fill="outline" onClick={() => handleDecideProjectLog(log, false)}>拒绝</Button>
                            </>
                          ) : null}
                        </div>
                      </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            </Tabs.Tab>
          </Tabs>
        </Card>
      </div>
      <Popup
        visible={relationPopupVisible}
        onMaskClick={() => setRelationPopupVisible(false)}
        bodyStyle={{
          borderTopLeftRadius: 18,
          borderTopRightRadius: 18,
          background: "#f8fafc",
          maxHeight: "82vh",
          overflowY: "auto",
          paddingBottom: "calc(18px + env(safe-area-inset-bottom))",
        }}
      >
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
            <div>
              <div style={{ color: colors.title, fontSize: 17, fontWeight: 800 }}>关联项目</div>
              <div style={{ marginTop: 3, color: colors.muted, fontSize: 12 }}>记录项目调整、衍生项目或普通关联</div>
            </div>
            <Button size="mini" fill="none" onClick={() => setRelationPopupVisible(false)}>关闭</Button>
          </div>
          <Form layout="vertical">
            <Form.Item label="关系类型">
              <Selector
                columns={3}
                showCheckMark={false}
                options={relationTypeOptions}
                value={[relationDraft.relation_type]}
                onChange={(value) => setRelationDraft((prev) => ({ ...prev, relation_type: (value[0] as ProjectRelationType) || "related" }))}
              />
            </Form.Item>
            <Form.Item label="关联项目">
              {projectOptions.length > 0 ? (
                <Selector
                  columns={1}
                  showCheckMark={false}
                  options={projectOptions.map((item) => ({
                    label: `${item.name} · ${projectStatusStyle[item.status].label}`,
                    value: String(item.project_id),
                  }))}
                  value={relationDraft.target_project_id ? [relationDraft.target_project_id] : []}
                  onChange={(value) => setRelationDraft((prev) => ({ ...prev, target_project_id: String(value[0] || "") }))}
                />
              ) : (
                <Input
                  value={relationDraft.target_project_id}
                  placeholder="输入目标项目 ID"
                  type="number"
                  onChange={(value) => setRelationDraft((prev) => ({ ...prev, target_project_id: value }))}
                />
              )}
            </Form.Item>
            <Form.Item label="关系说明">
              <Input
                value={relationDraft.title}
                placeholder="例如：课题方向调整、从主项目拆分子项目"
                onChange={(value) => setRelationDraft((prev) => ({ ...prev, title: value }))}
              />
            </Form.Item>
            <Form.Item label="补充记录">
              <TextArea
                value={relationDraft.description}
                rows={4}
                placeholder="记录为什么调整、拆分或关联，后续会写入项目日志"
                onChange={(value) => setRelationDraft((prev) => ({ ...prev, description: value }))}
              />
            </Form.Item>
          </Form>
          <Button color="primary" loading={relationSubmitting} onClick={submitProjectRelation}>
            确认关联并记录日志
          </Button>
        </div>
      </Popup>
      <Popup
        visible={logPopupVisible}
        onMaskClick={() => setLogPopupVisible(false)}
        bodyStyle={{
          borderTopLeftRadius: 18,
          borderTopRightRadius: 18,
          background: "#f8fafc",
          maxHeight: "86vh",
          overflowY: "auto",
          paddingBottom: "calc(18px + env(safe-area-inset-bottom))",
        }}
      >
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
            <div>
              <div style={{ color: colors.title, fontSize: 17, fontWeight: 800 }}>新增项目日志</div>
              <div style={{ marginTop: 3, color: colors.muted, fontSize: 12 }}>申请指导、资源或记录论文节点推进</div>
            </div>
            <Button size="mini" fill="none" onClick={() => setLogPopupVisible(false)}>关闭</Button>
          </div>
          <Form layout="vertical">
            <Form.Item label="日志类型">
              <Selector
                columns={3}
                showCheckMark={false}
                options={logKindOptions}
                value={[logDraft.kind]}
                onChange={(value) => updateLogDraft({ kind: (value[0] as ProjectLogKind) || "note" })}
              />
            </Form.Item>
            <Form.Item label="标题">
              <Input
                value={logDraft.title}
                placeholder="可留空，系统会按类型生成标题"
                onChange={(value) => updateLogDraft({ title: value })}
              />
            </Form.Item>
            {(logDraft.kind === "guidance" || logDraft.kind === "notification") ? (
              <Form.Item label={logDraft.kind === "guidance" ? "指导人" : "通知对象"}>
                <MemberPicker
                  value={logDraft.target_open_id}
                  onChange={(value) => updateLogDraft({ target_open_id: Array.isArray(value) ? value[0] || "" : value || "" })}
                  placeholder="选择成员"
                />
              </Form.Item>
            ) : null}
            {logDraft.kind === "server" ? (
              <Form.Item label="服务器/资源类型">
                <Input
                  value={logDraft.resource_type}
                  placeholder="例如 A100、3090、存储、数据库"
                  onChange={(value) => updateLogDraft({ resource_type: value })}
                />
              </Form.Item>
            ) : null}
            {logDraft.kind === "member_change" ? (
              <>
                <Form.Item label="变更前">
                  <Input value={logDraft.old_value} placeholder="原负责人/成员" onChange={(value) => updateLogDraft({ old_value: value })} />
                </Form.Item>
                <Form.Item label="变更后">
                  <Input value={logDraft.new_value} placeholder="新负责人/成员" onChange={(value) => updateLogDraft({ new_value: value })} />
                </Form.Item>
              </>
            ) : null}
            {logDraft.kind === "paper_stage" ? (
              <>
                <Form.Item label="论文 ID">
                  <Input
                    value={logDraft.paper_id}
                    type="number"
                    placeholder="填写要同步更新的论文 ID"
                    onChange={(value) => updateLogDraft({ paper_id: value })}
                  />
                </Form.Item>
                <Form.Item label="论文节点">
                  <Selector
                    columns={3}
                    showCheckMark={false}
                    options={paperStageOptions}
                    value={[logDraft.paper_stage]}
                    onChange={(value) => updateLogDraft({ paper_stage: String(value[0] || "submit") })}
                  />
                </Form.Item>
                <Form.Item label="论文状态">
                  <Selector
                    columns={3}
                    showCheckMark={false}
                    options={paperStatusOptions}
                    value={[logDraft.paper_status]}
                    onChange={(value) => updateLogDraft({ paper_status: String(value[0] || "under_review") })}
                  />
                </Form.Item>
              </>
            ) : null}
            <Form.Item label="说明">
              <TextArea
                value={logDraft.body}
                placeholder="补充背景、希望上级/指导人处理的事项、服务器用途等"
                autoSize={{ minRows: 3, maxRows: 7 }}
                onChange={(value) => updateLogDraft({ body: value })}
              />
            </Form.Item>
          </Form>
          <Button color="primary" loading={logSubmitting} onClick={submitProjectLog}>
            提交并通知
          </Button>
        </div>
      </Popup>
    </PageShell>
  );
};

export default ProjectDetailPage;
