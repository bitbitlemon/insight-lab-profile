import { api } from "./client";
import type { ProjectPriority, ProjectStatus, TaskStatus } from "../types/api";

export interface BoardProjectItem {
  project_id: number;
  name: string;
  status: ProjectStatus;
  priority: ProjectPriority;
  owner_open_id: string;
  updated_at: string | null;
  latest_topic_reply_at: string | null;
  task_count: number;
  task_done_count: number;
  open_task_count: number;
  is_abnormal?: boolean;
}

export interface BoardTaskItem {
  task_id: number;
  project_id: number | null;
  project_name?: string | null;
  project_tags?: string | null;
  title: string;
  status: TaskStatus;
  assignee_open_id: string | null;
  due_date: string | null;
  priority: ProjectPriority;
}

export interface BoardStatsResponse {
  scope: {
    department: string | null;
    manager_open_id: string;
    manager_name: string;
  };
  stats: {
    members: number;
    projects_total: number;
    active_projects: number;
    open_projects: number;
    open_tasks: number;
    standalone_open_tasks: number;
    blocked_tasks: number;
    overdue_tasks: number;
    due_soon_tasks: number;
    completed_tasks: number;
    task_completion_rate: number;
    recently_advanced_projects: number;
    abnormal_projects: number;
    no_topic_projects: number;
  };
  status_distribution: Array<{
    status: ProjectStatus;
    label: string;
    count: number;
  }>;
  recent_projects: BoardProjectItem[];
  detail_projects: BoardProjectItem[];
  abnormal_projects: Array<{
    project_id: number;
    name: string;
    status: ProjectStatus;
    latest_topic_reply_at: string | null;
    reason: string;
  }>;
  recent_tasks: BoardTaskItem[];
  detail_tasks: BoardTaskItem[];
  standalone_tasks: BoardTaskItem[];
  overdue_tasks: BoardTaskItem[];
  due_soon_tasks: BoardTaskItem[];
  department_members: Array<{
    open_id: string;
    name: string;
    avatar_url: string | null;
    title: string | null;
    position: string | null;
    role: string;
    status: string;
  }>;
}

export const getBoardStats = async (): Promise<BoardStatsResponse> => {
  const { data } = await api.get<BoardStatsResponse>("/stats/board");
  return data;
};
