import { api } from "./client";
import type { Page } from "../types/api";

export interface LabOverview {
  spaces_total: number;
  active_spaces: number;
  resources_total: number;
  bookable_resources: number;
  resources_by_status: Record<string, number>;
  pending_reservations: number;
  todays_reservations: number;
  active_occupancy: number;
  occupied_member_count: number;
}

export interface LabChatCluster {
  cluster_id: string;
  chat_id: string;
  chat_name: string;
  member_open_ids: string[];
  member_names: string[];
  message_count: number;
  last_message_at?: string | null;
  thoughts: string[];
}

export interface LabDailyReport {
  daily_report_id: number;
  base_record_id: string;
  member_open_id?: string | null;
  member_name?: string | null;
  checkin_at?: string | null;
  today_content?: string | null;
  yesterday_content?: string | null;
  three_day_content?: string | null;
  today_messages?: string | null;
  daily_summary?: string | null;
  today_thinking?: string | null;
  morning_messages?: string | null;
  afternoon_messages?: string | null;
  weekly_summary?: string | null;
  weekly_report?: string | null;
  synced_at: string;
}

export interface LabSpace {
  space_id: number;
  parent_space_id?: number | null;
  code: string;
  name: string;
  space_type: string;
  status: string;
  capacity: number;
  department?: string | null;
  location_label?: string | null;
}

export interface LabSpacePayload {
  parent_space_id?: number | null;
  code: string;
  name: string;
  space_type?: string;
  status?: string;
  capacity?: number;
  department?: string | null;
  location_label?: string | null;
  sort_order?: number;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface LabOccupancy {
  occupancy_id: number;
  space_id: number;
  resource_id?: number | null;
  member_open_id?: string | null;
  status: string;
  source: string;
  confidence: number;
  started_at: string;
  expected_end_at?: string | null;
  expires_at?: string | null;
  note?: string | null;
}

export interface LabMessageConfig {
  config_id?: number | null;
  manager_open_id: string;
  chat_id?: string | null;
  chat_name?: string | null;
  updated_at?: string | null;
}

export interface LabVisibleChat {
  chat_id: string;
  chat_name: string;
  member_count: number;
  updated_at?: string | null;
}

export const getLabOverview = async (): Promise<LabOverview> => {
  const { data } = await api.get<LabOverview>("/lab/overview");
  return data;
};

export const listLabChatClusters = async (params?: {
  recent_hours?: number;
  recent_minutes?: number;
  max_chats?: number;
  message_page_size?: number;
}): Promise<LabChatCluster[]> => {
  const { data } = await api.get<LabChatCluster[]>("/lab/chat-clusters", { params });
  return data;
};

export const listLabDailyReports = async (params?: {
  member_open_id?: string;
  sync?: boolean;
  limit?: number;
}): Promise<LabDailyReport[]> => {
  const { data } = await api.get<LabDailyReport[]>("/lab/daily-reports", { params });
  return data;
};

export const syncLabDailyReports = async (): Promise<{ fetched: number; created: number; updated: number }> => {
  const { data } = await api.post<{ fetched: number; created: number; updated: number }>("/lab/daily-reports/sync");
  return data;
};

export const listLabSpaces = async (): Promise<Page<LabSpace>> => {
  const { data } = await api.get<Page<LabSpace>>("/lab/spaces", { params: { page_size: 200, status: "active" } });
  return data;
};

export const createLabSpace = async (payload: LabSpacePayload): Promise<LabSpace> => {
  const { data } = await api.post<LabSpace>("/lab/spaces", payload);
  return data;
};

export const listLabOccupancy = async (): Promise<Page<LabOccupancy>> => {
  const { data } = await api.get<Page<LabOccupancy>>("/lab/occupancy", { params: { page_size: 200, active_only: true } });
  return data;
};

export const upsertLabOccupancy = async (payload: {
  space_id: number;
  resource_id?: number | null;
  member_open_id?: string | null;
  status?: string;
  source?: string;
  confidence?: number;
  started_at?: string | null;
  expected_end_at?: string | null;
  expires_at?: string | null;
  note?: string | null;
}): Promise<LabOccupancy> => {
  const { data } = await api.post<LabOccupancy>("/lab/occupancy", payload);
  return data;
};

export const getLabMessageConfig = async (): Promise<LabMessageConfig> => {
  const { data } = await api.get<LabMessageConfig>("/lab/message-config");
  return data;
};

export const saveLabMessageConfig = async (payload: {
  chat_id: string;
  chat_name?: string | null;
}): Promise<LabMessageConfig> => {
  const { data } = await api.put<LabMessageConfig>("/lab/message-config", payload);
  return data;
};

export const listLabCommonChats = async (params: {
  target_open_id: string;
  query?: string;
}): Promise<LabVisibleChat[]> => {
  const { data } = await api.get<LabVisibleChat[]>("/lab/messages/common-chats", { params });
  return data;
};

export const sendLabMentionMessage = async (payload: {
  target_open_id: string;
  message: string;
  chat_id?: string | null;
}): Promise<{ ok: boolean; chat_id: string; target_open_id: string; text: string; send_as: string }> => {
  const { data } = await api.post("/lab/messages/mention", payload);
  return data;
};

export const usageHeartbeat = async (page: string): Promise<void> => {
  await api.post("/usage/heartbeat", { page });
};
