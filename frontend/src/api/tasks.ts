import { api } from "./client";
import type { ChangeLogEntry, Page, ProjectPriority, Task, TaskStatus } from "../types/api";

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
  today_todo_date?: string | null;
  thinking?: string | null;
  progress_draft?: string | null;
  helper_open_ids?: string | null;
  mentor_open_ids?: string | null;
  task_origin?: string;
}

export interface TaskFocusPayload {
  elapsed_seconds?: number;
  note?: string | null;
  screenshot_url?: string | null;
}

export interface TaskFocusSummary {
  task_id: number;
  total_seconds: number;
}

export interface TaskFeedback {
  feedback_id: number;
  task_id: number;
  project_id?: number | null;
  reporter_open_id: string;
  reporter_name?: string | null;
  content: string;
  status: string;
  created_at: string;
}

export interface SystemFeedback {
  feedback_id: number;
  reporter_open_id: string;
  reporter_name?: string | null;
  content: string;
  page_url?: string | null;
  status: string;
  created_at: string;
}

export const listTasks = async (params?: ListTasksParams): Promise<Page<Task>> => {
  const { data } = await api.get<Page<Task>>("/tasks", { params });
  return data;
};

export const listTodayTasks = async (_daysAhead?: number): Promise<Task[]> => {
  const { data } = await api.get<Task[]>("/tasks/today");
  return data;
};

export const getTask = async (taskId: number | string): Promise<Task> => {
  const { data } = await api.get<Task>(`/tasks/${taskId}`);
  return data;
};

export const createTask = async (payload: TaskPayload): Promise<Task> => {
  const { data } = await api.post<Task>("/tasks", payload);
  return data;
};

export const publishTask = async (taskId: number | string): Promise<Task> => {
  const { data } = await api.post<Task>(`/tasks/${taskId}/publish`);
  return data;
};

export const updateTask = async (taskId: number | string, payload: Partial<TaskPayload>): Promise<Task> => {
  const { data } = await api.patch<Task>(`/tasks/${taskId}`, payload);
  return data;
};

export const markTaskTodayTodo = async (taskId: number | string, enabled: boolean): Promise<Task> => {
  const { data } = await api.post<Task>(`/tasks/${taskId}/today`, { enabled });
  return data;
};

export const createTodayTasksFromThinking = async (payload: {
  text: string;
  project_id?: number | null;
  assignee_open_id?: string | null;
}): Promise<Task[]> => {
  const { data } = await api.post<Task[]>("/tasks/today/from-thinking", payload);
  return data;
};

export const getTaskFocusSummary = async (taskId: number | string): Promise<TaskFocusSummary> => {
  const { data } = await api.get<TaskFocusSummary>(`/tasks/${taskId}/focus/summary`);
  return data;
};

export const createTaskFeedback = async (taskId: number | string, content: string): Promise<TaskFeedback> => {
  const { data } = await api.post<TaskFeedback>(`/tasks/${taskId}/feedback`, { content });
  return data;
};

export const createSystemFeedback = async (content: string, pageUrl?: string | null): Promise<SystemFeedback> => {
  const { data } = await api.post<SystemFeedback>("/tasks/feedback", { content, page_url: pageUrl || null });
  return data;
};

export const startTaskFocus = async (taskId: number | string, payload?: TaskFocusPayload): Promise<void> => {
  await api.post(`/tasks/${taskId}/focus/start`, payload || {});
};

export const heartbeatTaskFocus = async (taskId: number | string, payload: TaskFocusPayload): Promise<void> => {
  await api.post(`/tasks/${taskId}/focus/heartbeat`, payload);
};

export const sendTaskFocusTestCard = async (taskId: number | string): Promise<void> => {
  await api.post(`/tasks/${taskId}/focus/test-card`);
};

export const logTaskFocus = async (taskId: number | string, payload: TaskFocusPayload): Promise<void> => {
  await api.post(`/tasks/${taskId}/focus/log`, payload);
};

export const stopTaskFocus = async (taskId: number | string, payload: TaskFocusPayload): Promise<void> => {
  await api.post(`/tasks/${taskId}/focus/stop`, payload);
};

export const receiveTask = async (taskId: number | string): Promise<Task> => {
  const { data } = await api.post<Task>(`/tasks/${taskId}/receipt`);
  return data;
};

export const notifyTaskAgain = async (taskId: number | string): Promise<Task> => {
  const { data } = await api.post<Task>(`/tasks/${taskId}/notify`);
  return data;
};

export const listTaskAuditLogs = async (taskId: number | string): Promise<ChangeLogEntry[]> => {
  const { data } = await api.get<ChangeLogEntry[]>(`/tasks/${taskId}/audit`);
  return data;
};

export const deleteTask = async (taskId: number | string): Promise<void> => {
  await api.delete(`/tasks/${taskId}`);
};
