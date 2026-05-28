import { api } from "./client";
import type { Page, Paper, PaperAuthor } from "../types/api";

export const listPapers = async (params?: {
  author_open_id?: string;
  year?: number;
  status?: string;
  keyword?: string;
  page?: number;
  page_size?: number;
}): Promise<Page<Paper>> => {
  const { data } = await api.get<Page<Paper>>("/papers", { params });
  return data;
};

export const getPaper = async (paper_id: number): Promise<Paper> => {
  const { data } = await api.get<Paper>(`/papers/${paper_id}`);
  return data;
};

export const createPaper = async (payload: Partial<Paper>): Promise<Paper> => {
  const { data } = await api.post<Paper>("/papers", payload);
  return data;
};

export const updatePaper = async (paper_id: number, payload: Partial<Paper>): Promise<Paper> => {
  const { data } = await api.patch<Paper>(`/papers/${paper_id}`, payload);
  return data;
};

export const updatePaperAuthorContribution = async (
  paperId: number,
  paperAuthorId: number,
  contributionText: string | null,
): Promise<PaperAuthor> => {
  const { data } = await api.patch<PaperAuthor>(`/papers/${paperId}/authors/${paperAuthorId}/contribution`, {
    contribution_text: contributionText,
  });
  return data;
};

export const deletePaper = async (paper_id: number): Promise<void> => {
  await api.delete(`/papers/${paper_id}`);
};

export type ZhangqianStageGroup = "S" | "REVISION" | "ACC" | "ONLINE";

export interface ZhangqianLogStage {
  key: string;
  label: string;
  kind: "doc" | "attachment" | "text";
  group: ZhangqianStageGroup;
  required: boolean;
  has_content: boolean;
  missing: boolean;
  links?: { text: string; url: string }[];
  files?: { name?: string; file_token?: string; size?: number; type?: string; tmp_url?: string; url?: string }[];
  text?: string | null;
}

export interface ZhangqianLogGroupSummary {
  key: ZhangqianStageGroup;
  label: string;
  desc: string;
  total: number;
  filled: number;
  missing: number;
}

export interface ZhangqianLogSummary {
  required_count: number;
  filled_count: number;
  missing_count: number;
  missing_keys: string[];
  groups: ZhangqianLogGroupSummary[];
}

export interface ZhangqianLogResponse {
  matched: boolean;
  record_id?: string;
  title_en?: string | null;
  title_zh?: string | null;
  current_status?: string | null;
  submit_date?: string | null;
  submit_journal?: string | null;
  publish_date?: string | null;
  doi?: string | null;
  issn?: string | null;
  opensource_url?: string | null;
  log_text?: string | null;
  log_summary?: string | null;
  participants?: { open_id: string; name: string }[];
  advisor?: { open_id: string; name: string }[];
  stages?: ZhangqianLogStage[];
  summary?: ZhangqianLogSummary;
  tried_title_en?: string;
  tried_title_zh?: string | null;
  total_records?: number;
}

export const getZhangqianLog = async (paper_id: number): Promise<ZhangqianLogResponse> => {
  const { data } = await api.get<ZhangqianLogResponse>(`/papers/${paper_id}/zhangqian-log`);
  return data;
};

export type PipelineStage = "topic" | "research" | "experiment" | "draft" | "submit";
export type PipelineStatus = "pending" | "in_progress" | "done" | "blocked";

export interface PaperMilestone {
  milestone_id: number;
  paper_id: number;
  stage: PipelineStage;
  stage_label: string;
  owner_open_id: string | null;
  owner_name: string | null;
  due_date: string | null;
  status: PipelineStatus;
  completed_at: string | null;
  notes: string | null;
}

export const listPaperMilestones = async (paper_id: number): Promise<PaperMilestone[]> => {
  const { data } = await api.get<PaperMilestone[]>(`/papers/${paper_id}/milestones`);
  return data;
};

export const updatePaperMilestone = async (
  paper_id: number, milestone_id: number,
  payload: { owner_open_id?: string | null; due_date?: string | null; status?: PipelineStatus; notes?: string | null },
): Promise<PaperMilestone> => {
  const { data } = await api.patch<PaperMilestone>(`/papers/${paper_id}/milestones/${milestone_id}`, payload);
  return data;
};
