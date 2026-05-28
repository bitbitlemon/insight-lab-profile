import { api } from "./client";
import type { PointsSummary } from "./common";
import type { Page } from "../types/api";

const COMPETITIONS_TABLE_ID = import.meta.env.VITE_LARK_TABLE_COMPETITIONS || "tbliDgFfcNAv0cIF";

export interface CompetitionAttachment {
  file_token: string;
  name: string | null;
  size: number | null;
  type: string | null;
  url: string | null;
  source_app_token?: string | null;
  source_table_id?: string | null;
}

export interface UploadedCompetitionFile {
  file_token: string;
  name: string | null;
  size: number | null;
  type: string | null;
}

export interface CompetitionMemberInput {
  member_open_id: string;
  member_role: "member" | "advisor";
  share_ratio: number;
  contribution_text?: string | null;
}

export interface CompetitionMember {
  comp_id: number;
  member_open_id: string;
  member_role: "member" | "advisor";
  contribution_text?: string | null;
}

export interface CompetitionCreatePayload {
  name: string;
  organizer: string;
  level: string;
  category?: string | null;
  start_date?: string | null;
  end_date: string;
  award_level: string;
  rank?: string | null;
  description?: string | null;
  team_lead_open_id?: string | null;
  members: CompetitionMemberInput[];
  project_id?: number | null;
}

export interface CompetitionUpdatePayload extends Partial<Omit<CompetitionCreatePayload, "members">> {
  members?: CompetitionMemberInput[];
  cert_files?: UploadedCompetitionFile[];
  photo_files?: UploadedCompetitionFile[];
}

export interface Competition {
  comp_id: number;
  name: string;
  organizer: string;
  level: string;
  category: string | null;
  start_date: string | null;
  end_date: string;
  award_level: string;
  rank: string | null;
  score?: number | null;
  certificate_url?: string | null;
  project_url?: string | null;
  description: string | null;
  reflection?: string | null;
  points_summary?: PointsSummary | null;
  team_lead_open_id: string | null;
  project_id?: number | null;
  created_by?: string | null;
  members?: CompetitionMember[];
  cert_files?: CompetitionAttachment[];
  photo_files?: CompetitionAttachment[];
}

export const competitionFileProxyUrl = (attachment: {
  file_token: string;
  source_table_id?: string | null;
}): string => {
  const jwt = localStorage.getItem("jwt") || "";
  const tableId = attachment.source_table_id || COMPETITIONS_TABLE_ID;
  return `/api/files/${encodeURIComponent(attachment.file_token)}/proxy?t=${encodeURIComponent(jwt)}&table_id=${encodeURIComponent(tableId)}`;
};

export const listCompetitions = async (params?: {
  member_open_id?: string;
  page?: number;
  page_size?: number;
}): Promise<Page<Competition>> => {
  const { data } = await api.get<Page<Competition>>("/competitions", { params });
  return data;
};

export const getCompetition = async (comp_id: number | string): Promise<Competition> => {
  const { data } = await api.get<Competition>(`/competitions/${comp_id}`);
  return data;
};

export const createCompetition = async (payload: CompetitionCreatePayload): Promise<Competition> => {
  const { data } = await api.post<Competition>("/competitions", payload);
  return data;
};

export const updateCompetition = async (
  comp_id: number | string,
  payload: CompetitionUpdatePayload,
): Promise<Competition> => {
  const { data } = await api.patch<Competition>(`/competitions/${comp_id}`, payload);
  return data;
};

export const uploadCompetitionFile = async (file: File): Promise<UploadedCompetitionFile> => {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("target", "competition");
  const { data } = await api.post<UploadedCompetitionFile>("/files/upload", formData);
  return data;
};

export const updateCompetitionMemberContribution = async (
  compId: number | string,
  memberOpenId: string,
  contributionText: string | null,
): Promise<Competition> => {
  const { data } = await api.patch<Competition>(`/competitions/${compId}/members/${encodeURIComponent(memberOpenId)}/contribution`, {
    contribution_text: contributionText,
  });
  return data;
};
