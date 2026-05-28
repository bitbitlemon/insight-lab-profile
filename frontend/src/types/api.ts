import type { PointsSummary } from "../api/common";

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface Member {
  open_id: string;
  base_record_id?: string;
  name: string;
  en_name?: string;
  email?: string;
  mobile?: string;
  avatar_url?: string;
  role: "student" | "teacher" | "staff" | "admin";
  department?: string;
  position?: string | null;
  title?: string | null;
  signature?: string | null;
  enroll_date?: string;
  graduate_date?: string;
  research_area?: string;
  bio?: string | null;
  extra_memberships?: string;
  status: "active" | "on_leave" | "graduated" | "left";
  privacy_level: "public" | "internal" | "private";
  created_at: string;
  updated_at: string;
}

export interface PaperAuthor {
  paper_author_id: number;
  base_record_id?: string;
  paper_id: number;
  author_open_id: string;
  author_order: number;
  role: string[] | string;
  affiliation?: string | null;
  contribution_text?: string | null;
  created_at?: string;
}

export interface Paper {
  paper_id: number;
  base_record_id?: string;
  title: string;
  authors_text: string;
  venue: string;
  venue_type: "journal" | "conference" | "workshop" | "preprint";
  venue_level?: string;
  year: number;
  publish_date?: string;
  doi?: string;
  arxiv_id?: string;
  url?: string;
  pdf_url?: string;
  abstract?: string;
  status: "published" | "accepted" | "under_review" | "in_progress" | "rejected";
  keywords?: string;
  citation_count?: number;
  notes?: string;
  points_summary?: PointsSummary | null;
  created_by?: string;
  created_at: string;
  updated_at: string;
  authors?: PaperAuthor[];
}

export interface MeetingNote {
  note_id: number;
  base_record_id?: string;
  owner_open_id: string;
  meeting_title: string;
  meeting_date: string;
  meeting_type: string;
  external_participants?: string;
  location?: string;
  lark_minute_token?: string;
  summary: string;
  my_reflection?: string;
  action_items?: string;
  attachment_urls?: string;
  tags?: string;
  source: "manual" | "auto_minute" | "imported";
  review_status: "draft" | "submitted";
  privacy_level: "public" | "internal" | "private";
  created_at: string;
  updated_at: string;
}

export type ProjectStatus = "planning" | "active" | "paused" | "completed" | "archived";
export type ProjectPriority = "low" | "medium" | "high" | "urgent";
export type PMRole = "owner" | "co_lead" | "member" | "observer";
export type TaskStatus = "todo" | "in_progress" | "done" | "blocked" | "cancelled";

export interface ProjectMember {
  member_open_id: string;
  role: PMRole;
  share_ratio: number;
  joined_at: string;
  left_at: string | null;
}

export interface Project {
  project_id: number;
  name: string;
  description: string | null;
  status: ProjectStatus;
  priority: ProjectPriority;
  owner_open_id: string;
  department: string | null;
  start_date: string | null;
  target_end_date: string | null;
  actual_end_date: string | null;
  tags: string | null;
  points_awarded: number;
  archived_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  members: ProjectMember[];
  days_active: number;
  task_count: number;
  task_done_count: number;
}

export interface Task {
  task_id: number;
  project_id: number | null;
  parent_task_id: number | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: ProjectPriority;
  assignee_open_id: string | null;
  planned_start_date: string | null;
  due_date: string | null;
  completed_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}
