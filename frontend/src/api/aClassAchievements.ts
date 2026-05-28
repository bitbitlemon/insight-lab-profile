import { api } from "./client";
import { appendAuthToken } from "../utils/fileLinks";

const A_CLASS_TABLE_ID = "tbl5hk9UpmisKOxC";

export type AClassKind = "pdf" | "image" | "extra";

export type AClassAttachment = {
  file_token: string;
  name?: string;
  size?: number;
  type?: string;
};

export type AClassAchievementRead = {
  id: number;
  base_record_id: string;
  project_content?: string;
  event_name?: string;
  level?: string;
  award_grade?: string;
  organizer?: string;
  event_date?: string;
  department?: string;
  responsible_person?: string;
  first_student?: string;
  other_students?: string;
  research_category?: string;
  pdf_files: AClassAttachment[];
  image_files: AClassAttachment[];
  extra_files: AClassAttachment[];
  ai_image_understanding?: string;
  kimi_summary?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
};

export type ListResp = {
  items: AClassAchievementRead[];
  total: number;
  research_categories: string[];
  levels: string[];
};

export const listAClassAchievements = async (params?: {
  research_category?: string;
  level?: string;
}): Promise<ListResp> => {
  const { data } = await api.get<ListResp>("/a-class-achievements", { params });
  return data;
};

export const getAClassAchievement = async (id: number | string): Promise<AClassAchievementRead> => {
  const { data } = await api.get<AClassAchievementRead>(`/a-class-achievements/${id}`);
  return data;
};

export const uploadAClassFile = async (file: File): Promise<{
  file_token: string;
  name: string;
  size: number;
  type: string;
}> => {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post("/files/upload?target=a_class", form, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
  return data;
};

export const patchAClassAttachments = async (
  baseRecordId: string,
  kind: AClassKind,
  fileTokens: string[],
): Promise<AClassAchievementRead> => {
  const { data } = await api.patch<AClassAchievementRead>(
    `/a-class-achievements/by-record/${encodeURIComponent(baseRecordId)}/attachments`,
    { kind, file_tokens: fileTokens },
  );
  return data;
};

export const aClassFileUrl = (fileToken: string, token?: string): string => {
  return appendAuthToken(`/api/files/${encodeURIComponent(fileToken)}/proxy?table_id=${encodeURIComponent(A_CLASS_TABLE_ID)}`, token);
};
