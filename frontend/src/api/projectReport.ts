import { api } from "./client";

export interface ReportMetric {
  label: string;
  value: number | string;
  hint?: string | null;
}

export interface DepartmentReportRow {
  department: string;
  active_members: number;
  active_projects: number;
  completed_projects: number;
  created_projects: number;
  open_tasks: number;
  in_progress_tasks: number;
  completed_tasks: number;
  overdue_tasks: number;
  blocked_tasks: number;
  chat_messages: number;
  chat_speakers: number;
  meetings: number;
  meeting_hours: number;
  high_load_members: number;
  idle_members: number;
  risk_projects: number;
  health_score: number;
}

export interface PersonReportRow {
  member_open_id: string;
  member_name: string;
  department: string;
  owner_projects: number;
  participant_projects: number;
  open_tasks: number;
  in_progress_tasks: number;
  completed_tasks: number;
  overdue_tasks: number;
  blocked_tasks: number;
  chat_messages: number;
  meetings: number;
  meeting_hours: number;
  load_score: number;
  risk_flags: string[];
}

export interface WeeklyDepartmentMeetingRow {
  week_start: string;
  week_end: string;
  department: string;
  meetings: number;
  meeting_hours: number;
  avg_hours: number;
}

export interface ProjectRiskRow {
  project_id: number;
  name: string;
  department: string;
  owner_name: string;
  status: string;
  priority: string;
  overdue_tasks: number;
  blocked_tasks: number;
  last_chat_at?: string | null;
  target_end_date?: string | null;
  reasons: string[];
}

export interface TaskRiskRow {
  task_id: number;
  title: string;
  project_id?: number | null;
  project_name?: string | null;
  assignee_open_id?: string | null;
  assignee_name?: string | null;
  department: string;
  status: string;
  priority: string;
  due_date?: string | null;
}

export interface ProjectReportSummary {
  start_date: string;
  end_date: string;
  generated_at: string;
  metrics: ReportMetric[];
  departments: DepartmentReportRow[];
  weekly_meetings: WeeklyDepartmentMeetingRow[];
  people: PersonReportRow[];
  risk_projects: ProjectRiskRow[];
  overdue_tasks: TaskRiskRow[];
  briefing: string;
}

export const getProjectReportSummary = async (params?: {
  start_date?: string;
  end_date?: string;
  days?: number;
}): Promise<ProjectReportSummary> => {
  const { data } = await api.get<ProjectReportSummary>("/project-report/summary", { params });
  return data;
};
