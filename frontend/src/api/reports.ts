import { api } from "./client";

export interface ReportMetric {
  label: string;
  value: number | string;
  hint?: string | null;
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
  departments: unknown[];
  weekly_meetings: unknown[];
  people: PersonReportRow[];
  risk_projects: ProjectRiskRow[];
  overdue_tasks: TaskRiskRow[];
  briefing: string;
}

export interface StageOverviewItem {
  project_id: number;
  name: string;
  owner_open_id?: string | null;
  owner_name?: string | null;
  category?: string | null;
  status: string;
  priority: string;
  current_stage?: string | null;
  stage_index?: number | null;
  stage_entered_at?: string | null;
  days_in_stage: number;
  stage_stuck: boolean;
  target_end_date?: string | null;
  target_overdue: boolean;
  pending_approval_log_id?: number | null;
  pending_approval_since?: string | null;
  pending_approval_days: number;
  open_tasks: number;
  overdue_tasks: number;
}

export interface StageOverviewResponse {
  summary: {
    total_projects: number;
    by_stage: Record<string, number>;
    stuck_projects: number;
    target_overdue_projects: number;
    pending_approvals: number;
    stuck_threshold_days: number;
  };
  items: StageOverviewItem[];
}

export const getProjectReportSummary = async (days = 7): Promise<ProjectReportSummary> => {
  const { data } = await api.get<ProjectReportSummary>("/project-report/summary", { params: { days } });
  return data;
};

export const getStageOverview = async (stuckDays = 14): Promise<StageOverviewResponse> => {
  const { data } = await api.get<StageOverviewResponse>("/project-report/stage-overview", { params: { stuck_days: stuckDays } });
  return data;
};
