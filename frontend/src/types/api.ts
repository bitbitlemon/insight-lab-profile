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
  is_super_admin?: boolean;
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
export type ProjectType = "personal" | "team";
export type PMRole = "owner" | "co_lead" | "member" | "observer";
export type TaskStatus = "todo" | "in_progress" | "done" | "blocked" | "cancelled";
export type PublicationStatus = "draft" | "published";
export type ProjectRelationType = "transformed_to" | "derived" | "related";

export interface ProjectMember {
  member_open_id: string;
  role: PMRole;
  share_ratio: number;
  tags?: string | null;
  received_at?: string | null;
  joined_at: string;
  left_at: string | null;
}

export interface ProjectChat {
  project_chat_id: number;
  project_id: number;
  chat_id: string;
  chat_name?: string | null;
  description?: string | null;
  selected_topic_key?: string | null;
  selected_topic_title?: string | null;
  sync_enabled: boolean;
  last_synced_at?: string | null;
  last_message_at?: string | null;
  latest_topic_key?: string | null;
  latest_topic_title?: string | null;
  latest_topic_reply_at?: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  topic_count: number;
  message_count: number;
  is_stale?: boolean;
  stale_reason?: string | null;
}

export interface ProjectChatTopic {
  project_chat_topic_id: number;
  project_chat_id: number;
  project_id: number;
  topic_key: string;
  title?: string | null;
  first_message_id?: string | null;
  first_sender_open_id?: string | null;
  last_message_id?: string | null;
  last_reply_at?: string | null;
  reply_count: number;
  created_at: string;
  updated_at: string;
}

export interface ProjectChatMessage {
  project_chat_message_id: number;
  project_chat_id: number;
  project_id: number;
  chat_id: string;
  message_id: string;
  topic_key: string;
  root_id?: string | null;
  parent_id?: string | null;
  thread_id?: string | null;
  sender_open_id?: string | null;
  sender_name?: string | null;
  sender_type?: string | null;
  msg_type?: string | null;
  content?: string | null;
  deleted: boolean;
  updated: boolean;
  message_created_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectLog {
  log_id: number;
  project_id: number;
  actor_open_id: string;
  actor_name?: string | null;
  kind: "note" | "guidance" | "server" | "member_change" | "paper_stage" | "notification";
  kind_label: string;
  status: "recorded" | "pending" | "pending_approval" | "approved" | "rejected" | "notified";
  status_label: string;
  title: string;
  body?: string | null;
  target_open_id?: string | null;
  target_name?: string | null;
  approver_open_id?: string | null;
  approver_name?: string | null;
  resource_type?: string | null;
  old_value?: string | null;
  new_value?: string | null;
  paper_id?: number | null;
  paper_stage?: string | null;
  paper_status?: string | null;
  notified_at?: string | null;
  approved_at?: string | null;
  approval_mode?: "any" | "all" | null;
  approvals?: ProjectLogApproval[];
  created_at: string;
  updated_at: string;
}

export interface StageCheckItem {
  stage_title: string;
  item_text: string;
  required: boolean;
  from_template: boolean;
  checked: boolean;
  payload?: { checked?: boolean; text?: string; link?: string; memberOpenId?: string; members?: string[] } | null;
  updated_by?: string | null;
  updated_at?: string | null;
}

export interface ProjectLogApproval {
  approval_id: number;
  approver_open_id: string;
  approver_name?: string | null;
  decision: "pending" | "approved" | "rejected" | "skipped";
  comment?: string | null;
  decided_at?: string | null;
}

export interface ApprovalRule {
  rule_id: number;
  project_category: string;
  stage_title?: string | null;
  mode: "any" | "all";
  approver_open_ids: string[];
  approver_names?: (string | null)[];
  enabled: boolean;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectRelation {
  relation_id: number;
  source_project_id: number;
  target_project_id: number;
  project_id: number;
  project_name: string;
  project_status: ProjectStatus;
  project_type: ProjectType;
  tags?: string | null;
  relation_type: ProjectRelationType;
  relation_label: string;
  direction: "outgoing" | "incoming";
  title?: string | null;
  description?: string | null;
  created_by: string;
  created_by_name?: string | null;
  created_at: string;
  updated_at: string;
}

export interface LarkVisibleChat {
  chat_id: string;
  name?: string | null;
  description?: string | null;
  avatar?: string | null;
  chat_mode?: string | null;
  chat_status?: string | null;
  external?: boolean | null;
  owner_id?: string | null;
  create_time?: string | null;
}

export interface LarkChatTopicPreview {
  topic_key: string;
  title?: string | null;
  last_reply_at?: string | null;
  reply_count: number;
  last_message_id?: string | null;
}

export interface Project {
  current_stage?: string | null;
  project_id: number;
  name: string;
  description: string | null;
  status: ProjectStatus;
  publication_status?: PublicationStatus;
  priority: ProjectPriority;
  project_type: ProjectType;
  my_project_type?: ProjectType | null;
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
  chats: ProjectChat[];
  days_active: number;
  task_count: number;
  task_done_count: number;
  is_abnormal?: boolean;
  abnormal_reason?: string | null;
  abnormal_chat_count?: number;
}

export interface Task {
  task_id: number;
  project_id: number | null;
  project_name?: string | null;
  project_tags?: string | null;
  parent_task_id: number | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  publication_status?: PublicationStatus;
  priority: ProjectPriority;
  assignee_open_id: string | null;
  planned_start_date: string | null;
  due_date: string | null;
  today_todo_date?: string | null;
  thinking?: string | null;
  progress_draft?: string | null;
  task_origin?: "manual" | "chat_ai" | string;
  received_at?: string | null;
  completed_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ChangeLogEntry {
  log_id: number;
  actor_open_id: string;
  actor_name?: string | null;
  action: "create" | "update" | "delete" | "export";
  target_table: string;
  target_id: string;
  changes: {
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
    delta?: Record<string, { before?: unknown; after?: unknown }>;
  };
  created_at: string;
}

export interface MemberWorkloadTask {
  task_id: number;
  project_id: number | null;
  project_name?: string | null;
  title: string;
  description?: string | null;
  status: TaskStatus;
  priority: ProjectPriority;
  due_date?: string | null;
  completed_at?: string | null;
  updated_at?: string | null;
}

export interface MemberWorkload {
  member: {
    open_id: string;
    name: string;
    avatar_url?: string | null;
    department?: string | null;
    title?: string | null;
    position?: string | null;
  };
  detail_visible: boolean;
  visibility_reason: string;
  summary: {
    total_tasks: number;
    open_tasks: number;
    todo_tasks: number;
    in_progress_tasks: number;
    blocked_tasks: number;
    done_tasks: number;
    overdue_tasks: number;
    active_project_count: number;
    capacity_score: number;
    capacity_label: string;
  };
  tasks: MemberWorkloadTask[];
  recent_done_tasks: MemberWorkloadTask[];
}

export type PermissionRoleKey =
  | "super_admin"
  | "bu_minister"
  | "bu_deputy"
  | "department_minister"
  | "department_deputy";

export type PermissionScopeType = "global" | "bu" | "department";

export interface PermissionRoleOption {
  role_key: PermissionRoleKey;
  label: string;
  scope_type: PermissionScopeType;
}

export interface PermissionOptions {
  business_units: string[];
  departments: string[];
  roles: PermissionRoleOption[];
}

export interface PermissionAssignment {
  assignment_id: number;
  member_open_id: string;
  member_name?: string | null;
  member_department?: string | null;
  role_key: PermissionRoleKey;
  role_label: string;
  scope_type: PermissionScopeType;
  scope_value?: string | null;
  active: boolean;
  assigned_by?: string | null;
  created_at: string;
  updated_at: string;
}
