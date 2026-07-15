import { api } from "./client";
import type {
  ChangeLogEntry,
  Page,
  LarkVisibleChat,
  LarkChatTopicPreview,
  PMRole,
  Project,
  ProjectChat,
  ProjectChatMessage,
  ProjectChatTopic,
  ProjectLog,
  ProjectMember,
  ProjectRelation,
  ProjectRelationType,
  ProjectPriority,
  ProjectStatus,
  ProjectType,
  StageCheckItem,
} from "../types/api";

export interface ListProjectsParams {
  page?: number;
  page_size?: number;
  status?: ProjectStatus;
  project_type?: ProjectType;
  department?: string;
  member_open_id?: string;
}

export interface ProjectMemberInput {
  member_open_id: string;
  role?: PMRole;
  share_ratio: number;
  tags?: string | null;
}

export interface ProjectPayload {
  name: string;
  description?: string | null;
  status?: ProjectStatus;
  priority?: ProjectPriority;
  project_type?: ProjectType;
  owner_open_id?: string | null;
  department?: string | null;
  start_date?: string | null;
  target_end_date?: string | null;
  actual_end_date?: string | null;
  tags?: string | null;
  points_awarded?: number;
  members?: ProjectMemberInput[];
}

export interface ProjectChatPayload {
  chat_id: string;
  chat_name?: string | null;
  description?: string | null;
  selected_topic_key?: string | null;
  selected_topic_title?: string | null;
  sync_enabled?: boolean;
}

export interface ProjectChatSyncPayload {
  page_size?: number;
  max_pages?: number;
  start?: string | null;
  end?: string | null;
}

export interface ProjectLogPayload {
  kind: "note" | "guidance" | "server" | "member_change" | "paper_stage" | "notification";
  title?: string | null;
  body?: string | null;
  target_open_id?: string | null;
  resource_type?: string | null;
  old_value?: string | null;
  new_value?: string | null;
  paper_id?: number | null;
  paper_stage?: "topic" | "research" | "experiment" | "draft" | "submit" | null;
  paper_status?: "published" | "accepted" | "under_review" | "in_progress" | "rejected" | null;
  milestone_status?: "pending" | "in_progress" | "done" | "blocked" | null;
  approver_open_ids?: string[] | null;
  approval_mode?: "any" | "all" | null;
  notify_now?: boolean;
}

export interface ProjectRelationPayload {
  target_project_id: number;
  relation_type: ProjectRelationType;
  title?: string | null;
  description?: string | null;
}

export interface LarkVisibleChatPage {
  chats: LarkVisibleChat[];
  has_more: boolean;
  page_token?: string | null;
}

export interface LarkChatTopicPreviewPage {
  topics: LarkChatTopicPreview[];
  has_more: boolean;
  page_token?: string | null;
}

export const listProjects = async (params?: ListProjectsParams): Promise<Page<Project>> => {
  const { data } = await api.get<Page<Project>>("/projects", { params });
  return data;
};

export const getProject = async (projectId: number | string): Promise<Project> => {
  const { data } = await api.get<Project>(`/projects/${projectId}`);
  return data;
};

export const listProjectAuditLogs = async (projectId: number | string): Promise<ChangeLogEntry[]> => {
  const { data } = await api.get<ChangeLogEntry[]>(`/projects/${projectId}/audit`);
  return data;
};

export const listProjectLogs = async (projectId: number | string): Promise<ProjectLog[]> => {
  const { data } = await api.get<ProjectLog[]>(`/projects/${projectId}/logs`);
  return data;
};

export const listProjectRelations = async (projectId: number | string): Promise<ProjectRelation[]> => {
  const { data } = await api.get<ProjectRelation[]>(`/projects/${projectId}/relations`);
  return data;
};

export const createProjectRelation = async (
  projectId: number | string,
  payload: ProjectRelationPayload,
): Promise<ProjectRelation> => {
  const { data } = await api.post<ProjectRelation>(`/projects/${projectId}/relations`, payload);
  return data;
};

export const deleteProjectRelation = async (
  projectId: number | string,
  relationId: number | string,
): Promise<void> => {
  await api.delete(`/projects/${projectId}/relations/${relationId}`);
};

export const createProjectLog = async (projectId: number | string, payload: ProjectLogPayload): Promise<ProjectLog> => {
  const { data } = await api.post<ProjectLog>(`/projects/${projectId}/logs`, payload);
  return data;
};

export const listStageChecks = async (projectId: number | string): Promise<StageCheckItem[]> => {
  const { data } = await api.get<StageCheckItem[]>(`/projects/${projectId}/stage-checks`);
  return data;
};

export const saveStageChecks = async (
  projectId: number | string,
  items: { stage_title: string; item_text: string; checked: boolean; payload?: Record<string, unknown> | null }[],
): Promise<StageCheckItem[]> => {
  const { data } = await api.put<StageCheckItem[]>(`/projects/${projectId}/stage-checks`, { items });
  return data;
};

export const notifyProjectLogAgain = async (projectId: number | string, logId: number | string): Promise<ProjectLog> => {
  const { data } = await api.post<ProjectLog>(`/projects/${projectId}/logs/${logId}/notify`);
  return data;
};

export const decideProjectLog = async (
  projectId: number | string,
  logId: number | string,
  payload: { approved: boolean; comment?: string | null },
): Promise<ProjectLog> => {
  const { data } = await api.post<ProjectLog>(`/projects/${projectId}/logs/${logId}/decision`, payload);
  return data;
};

export const createProject = async (payload: ProjectPayload): Promise<Project> => {
  const { data } = await api.post<Project>("/projects", payload);
  return data;
};

export const publishProject = async (projectId: number | string): Promise<Project> => {
  const { data } = await api.post<Project>(`/projects/${projectId}/publish`);
  return data;
};

export const updateProject = async (
  projectId: number | string,
  payload: Partial<ProjectPayload>,
): Promise<Project> => {
  const { data } = await api.patch<Project>(`/projects/${projectId}`, payload);
  return data;
};

export const deleteProject = async (projectId: number | string): Promise<void> => {
  await api.delete(`/projects/${projectId}`);
};

export const addProjectMember = async (
  projectId: number | string,
  payload: ProjectMemberInput,
): Promise<ProjectMember> => {
  const { data } = await api.post<ProjectMember>(`/projects/${projectId}/members`, payload);
  return data;
};

export const receiveProjectMember = async (projectId: number | string): Promise<ProjectMember> => {
  const { data } = await api.post<ProjectMember>(`/projects/${projectId}/members/receipt`);
  return data;
};

export const notifyProjectMemberAgain = async (
  projectId: number | string,
  memberOpenId: string,
): Promise<ProjectMember> => {
  const { data } = await api.post<ProjectMember>(`/projects/${projectId}/members/${memberOpenId}/notify`);
  return data;
};

export const updateProjectMember = async (
  projectId: number | string,
  memberOpenId: string,
  payload: ProjectMemberInput,
): Promise<ProjectMember> => {
  const { data } = await api.patch<ProjectMember>(`/projects/${projectId}/members/${memberOpenId}`, payload);
  return data;
};

export const removeProjectMember = async (
  projectId: number | string,
  memberOpenId: string,
): Promise<void> => {
  await api.delete(`/projects/${projectId}/members/${memberOpenId}`);
};

export const listProjectChats = async (projectId: number | string): Promise<ProjectChat[]> => {
  const { data } = await api.get<ProjectChat[]>(`/projects/${projectId}/chats`);
  return data;
};

export const listVisibleLarkChats = async (params?: {
  query?: string;
  page_size?: number;
  page_token?: string | null;
}): Promise<LarkVisibleChatPage> => {
  const { data } = await api.get<LarkVisibleChatPage>("/projects/lark/chats", { params });
  return data;
};

export const listLarkChatTopics = async (
  chatId: string,
  params?: { page_size?: number; page_token?: string | null },
): Promise<LarkChatTopicPreviewPage> => {
  const { data } = await api.get<LarkChatTopicPreviewPage>(`/projects/lark/chats/${chatId}/topics`, { params });
  return data;
};

export const addProjectChat = async (
  projectId: number | string,
  payload: ProjectChatPayload,
): Promise<ProjectChat> => {
  const { data } = await api.post<ProjectChat>(`/projects/${projectId}/chats`, payload);
  return data;
};

export const deleteProjectChat = async (projectId: number | string, projectChatId: number | string): Promise<void> => {
  await api.delete(`/projects/${projectId}/chats/${projectChatId}`);
};

export const syncProjectChat = async (
  projectId: number | string,
  projectChatId: number | string,
  payload?: ProjectChatSyncPayload,
): Promise<{
  project_chat_id: number;
  chat_id: string;
  pages: number;
  fetched: number;
  inserted: number;
  message_count: number;
  topic_count: number;
  latest_message_at?: string | null;
  latest_topic_title?: string | null;
}> => {
  const { data } = await api.post(`/projects/${projectId}/chats/${projectChatId}/sync`, payload || {});
  return data;
};

export const listProjectChatTopics = async (
  projectId: number | string,
  projectChatId: number | string,
): Promise<ProjectChatTopic[]> => {
  const { data } = await api.get<ProjectChatTopic[]>(`/projects/${projectId}/chats/${projectChatId}/topics`);
  return data;
};

export const listProjectChatMessages = async (
  projectId: number | string,
  projectChatId: number | string,
  params?: { page?: number; page_size?: number; topic_key?: string },
): Promise<Page<ProjectChatMessage>> => {
  const { data } = await api.get<Page<ProjectChatMessage>>(`/projects/${projectId}/chats/${projectChatId}/messages`, { params });
  return data;
};
