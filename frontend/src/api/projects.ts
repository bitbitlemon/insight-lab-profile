import { api } from "./client";
import type { Page, PMRole, Project, ProjectMember, ProjectPriority, ProjectStatus } from "../types/api";

export interface ListProjectsParams {
  page?: number;
  page_size?: number;
  status?: ProjectStatus;
  department?: string;
  member_open_id?: string;
}

export interface ProjectMemberInput {
  member_open_id: string;
  role: PMRole;
  share_ratio: number;
}

export interface ProjectPayload {
  name: string;
  description?: string | null;
  status?: ProjectStatus;
  priority?: ProjectPriority;
  department?: string | null;
  start_date?: string | null;
  target_end_date?: string | null;
  actual_end_date?: string | null;
  tags?: string | null;
  points_awarded?: number;
  members?: ProjectMemberInput[];
}

export const listProjects = async (params?: ListProjectsParams): Promise<Page<Project>> => {
  const { data } = await api.get<Page<Project>>("/projects", { params });
  return data;
};

export const getProject = async (projectId: number | string): Promise<Project> => {
  const { data } = await api.get<Project>(`/projects/${projectId}`);
  return data;
};

export const createProject = async (payload: ProjectPayload): Promise<Project> => {
  const { data } = await api.post<Project>("/projects", payload);
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

export const removeProjectMember = async (
  projectId: number | string,
  memberOpenId: string,
): Promise<void> => {
  await api.delete(`/projects/${projectId}/members/${memberOpenId}`);
};
