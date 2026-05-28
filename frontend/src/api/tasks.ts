import { api } from "./client";
import type { Page, ProjectPriority, Task, TaskStatus } from "../types/api";

export interface ListTasksParams {
  project_id?: number;
  assignee_open_id?: string;
  status?: TaskStatus;
  page?: number;
  page_size?: number;
}

export interface TaskPayload {
  title: string;
  description?: string | null;
  project_id?: number | null;
  parent_task_id?: number | null;
  status?: TaskStatus;
  priority?: ProjectPriority;
  assignee_open_id?: string | null;
  planned_start_date?: string | null;
  due_date?: string | null;
}

export const listTasks = async (params?: ListTasksParams): Promise<Page<Task>> => {
  const { data } = await api.get<Page<Task>>("/tasks", { params });
  return data;
};

export const listTodayTasks = async (days_ahead = 3): Promise<Task[]> => {
  const { data } = await api.get<Task[]>("/tasks/today", { params: { days_ahead } });
  return data;
};

export const createTask = async (payload: TaskPayload): Promise<Task> => {
  const { data } = await api.post<Task>("/tasks", payload);
  return data;
};

export const updateTask = async (taskId: number | string, payload: Partial<TaskPayload>): Promise<Task> => {
  const { data } = await api.patch<Task>(`/tasks/${taskId}`, payload);
  return data;
};

export const deleteTask = async (taskId: number | string): Promise<void> => {
  await api.delete(`/tasks/${taskId}`);
};
