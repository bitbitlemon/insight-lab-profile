import { api } from "./client";
import type { Page } from "../types/api";

export type LabSpaceType = "campus" | "building" | "floor" | "zone" | "room" | "workstation" | "virtual";
export type LabSpaceStatus = "active" | "inactive" | "maintenance" | "retired";
export type LabResourceType = "meeting_room" | "workstation" | "equipment" | "server" | "gpu" | "storage" | "software" | "account" | "other";
export type LabResourceStatus = "available" | "occupied" | "maintenance" | "disabled" | "retired";
export type LabReservationStatus = "pending" | "approved" | "rejected" | "cancelled" | "completed";
export type LabOccupancyStatus = "present" | "working" | "meeting" | "class" | "away" | "leave" | "offline" | "reserved";
export type LabOccupancySource = "manual" | "calendar" | "class" | "leave" | "reservation" | "device" | "system";

export interface LabSpace {
  space_id: number;
  parent_space_id: number | null;
  code: string;
  name: string;
  space_type: LabSpaceType;
  status: LabSpaceStatus;
  capacity: number;
  department: string | null;
  location_label: string | null;
  map_x: number | null;
  map_y: number | null;
  map_z: number | null;
  width: number | null;
  depth: number | null;
  height: number | null;
  sort_order: number;
  description: string | null;
  metadata: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface LabResource {
  resource_id: number;
  space_id: number | null;
  code: string;
  name: string;
  resource_type: LabResourceType;
  status: LabResourceStatus;
  capacity: number;
  owner_department: string | null;
  manager_open_id: string | null;
  bookable: boolean;
  requires_approval: boolean;
  specs: Record<string, unknown> | null;
  description: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface LabReservation {
  reservation_id: number;
  resource_id: number;
  space_id: number | null;
  member_open_id: string;
  title: string;
  purpose: string | null;
  start_at: string;
  end_at: string;
  status: LabReservationStatus;
  attendee_open_ids: string[];
  related_project_id: number | null;
  related_calendar_event_id: number | null;
  lark_event_id: string | null;
  approved_by: string | null;
  approved_at: string | null;
  review_comment: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface LabOccupancy {
  occupancy_id: number;
  space_id: number;
  resource_id: number | null;
  member_open_id: string | null;
  status: LabOccupancyStatus;
  source: LabOccupancySource;
  confidence: number;
  started_at: string;
  expected_end_at: string | null;
  expires_at: string | null;
  note: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface LabChatCluster {
  cluster_id: string;
  chat_id: string;
  chat_name: string;
  member_open_ids: string[];
  member_names: string[];
  message_count: number;
  last_message_at: string | null;
  thoughts: string[];
}

export interface LabDailyReport {
  daily_report_id: number;
  base_record_id: string;
  member_open_id: string | null;
  member_name: string | null;
  checkin_at: string | null;
  thinking_start_at: string | null;
  today_content: string | null;
  yesterday_content: string | null;
  three_day_content: string | null;
  today_messages: string | null;
  daily_summary: string | null;
  today_thinking: string | null;
  morning_messages: string | null;
  afternoon_messages: string | null;
  weekly_summary: string | null;
  weekly_report: string | null;
  synced_at: string;
}

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

export interface LabMessageConfig {
  config_id: number | null;
  manager_open_id: string;
  chat_id: string | null;
  chat_name: string | null;
  updated_at: string | null;
}

export interface LabMentionMessageResult {
  ok: boolean;
  chat_id: string;
  target_open_id: string;
  text: string;
  send_as: "user" | "bot";
  sender_open_id?: string | null;
  sender_name?: string | null;
}

export interface LabVisibleChat {
  chat_id: string;
  chat_name: string;
  member_count: number;
  updated_at: string | null;
}

export type LabSpacePayload = Partial<Omit<LabSpace, "space_id" | "created_by" | "created_at" | "updated_at">> & {
  code?: string;
  name?: string;
};

export type LabResourcePayload = Partial<Omit<LabResource, "resource_id" | "created_by" | "created_at" | "updated_at">> & {
  code?: string;
  name?: string;
};

export interface LabReservationPayload {
  resource_id: number;
  member_open_id?: string | null;
  title: string;
  purpose?: string | null;
  start_at: string;
  end_at: string;
  attendee_open_ids?: string[];
  related_project_id?: number | null;
}

export interface LabOccupancyPayload {
  space_id: number;
  resource_id?: number | null;
  member_open_id?: string | null;
  status?: LabOccupancyStatus;
  source?: LabOccupancySource;
  confidence?: number;
  started_at?: string | null;
  expected_end_at?: string | null;
  expires_at?: string | null;
  note?: string | null;
}

export const listLabSpaces = async (params?: {
  page?: number;
  page_size?: number;
  space_type?: LabSpaceType;
  status?: LabSpaceStatus;
  parent_space_id?: number;
  keyword?: string;
}): Promise<Page<LabSpace>> => {
  const { data } = await api.get<Page<LabSpace>>("/lab/spaces", { params });
  return data;
};

export const createLabSpace = async (payload: LabSpacePayload): Promise<LabSpace> => {
  const { data } = await api.post<LabSpace>("/lab/spaces", payload);
  return data;
};

export const updateLabSpace = async (spaceId: number, payload: LabSpacePayload): Promise<LabSpace> => {
  const { data } = await api.patch<LabSpace>(`/lab/spaces/${spaceId}`, payload);
  return data;
};

export const listLabResources = async (params?: {
  page?: number;
  page_size?: number;
  space_id?: number;
  resource_type?: LabResourceType;
  status?: LabResourceStatus;
  bookable?: boolean;
  keyword?: string;
}): Promise<Page<LabResource>> => {
  const { data } = await api.get<Page<LabResource>>("/lab/resources", { params });
  return data;
};

export const createLabResource = async (payload: LabResourcePayload): Promise<LabResource> => {
  const { data } = await api.post<LabResource>("/lab/resources", payload);
  return data;
};

export const updateLabResource = async (resourceId: number, payload: LabResourcePayload): Promise<LabResource> => {
  const { data } = await api.patch<LabResource>(`/lab/resources/${resourceId}`, payload);
  return data;
};

export const listLabReservations = async (params?: {
  page?: number;
  page_size?: number;
  resource_id?: number;
  member_open_id?: string;
  status?: LabReservationStatus;
  start?: string;
  end?: string;
}): Promise<Page<LabReservation>> => {
  const { data } = await api.get<Page<LabReservation>>("/lab/reservations", { params });
  return data;
};

export const createLabReservation = async (payload: LabReservationPayload): Promise<LabReservation> => {
  const { data } = await api.post<LabReservation>("/lab/reservations", payload);
  return data;
};

export const decideLabReservation = async (
  reservationId: number,
  payload: { approved: boolean; comment?: string | null },
): Promise<LabReservation> => {
  const { data } = await api.patch<LabReservation>(`/lab/reservations/${reservationId}/decision`, payload);
  return data;
};

export const cancelLabReservation = async (reservationId: number): Promise<LabReservation> => {
  const { data } = await api.patch<LabReservation>(`/lab/reservations/${reservationId}/cancel`);
  return data;
};

export const listLabOccupancy = async (params?: {
  page?: number;
  page_size?: number;
  space_id?: number;
  member_open_id?: string;
  status?: LabOccupancyStatus;
  active_only?: boolean;
}): Promise<Page<LabOccupancy>> => {
  const { data } = await api.get<Page<LabOccupancy>>("/lab/occupancy", { params });
  return data;
};

export const upsertLabOccupancy = async (payload: LabOccupancyPayload): Promise<LabOccupancy> => {
  const { data } = await api.post<LabOccupancy>("/lab/occupancy", payload);
  return data;
};

export const listLabChatClusters = async (params?: {
  max_chats?: number;
  message_page_size?: number;
  recent_hours?: number;
  recent_minutes?: number;
}): Promise<LabChatCluster[]> => {
  const { data } = await api.get<LabChatCluster[]>("/lab/chat-clusters", { params });
  return data;
};

export const syncLabDailyReports = async (): Promise<{ fetched: number; created: number; updated: number }> => {
  const { data } = await api.post<{ fetched: number; created: number; updated: number }>("/lab/daily-reports/sync");
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

export const getLabOverview = async (): Promise<LabOverview> => {
  const { data } = await api.get<LabOverview>("/lab/overview");
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

export const sendLabMentionMessage = async (payload: {
  target_open_id: string;
  message: string;
  chat_id?: string | null;
}): Promise<LabMentionMessageResult> => {
  const { data } = await api.post<LabMentionMessageResult>("/lab/messages/mention", payload);
  return data;
};

export const listLabCommonChats = async (params: {
  target_open_id: string;
  query?: string;
}): Promise<LabVisibleChat[]> => {
  const { data } = await api.get<LabVisibleChat[]>("/lab/messages/common-chats", { params });
  return data;
};
