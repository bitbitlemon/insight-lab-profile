import { api } from "./client";

export type ChatIntentStatus =
  | "pending"
  | "applied"
  | "rejected"
  | "auto_applied"
  | "cancelled";

export type ChatIntentKind = "create_task" | "complete_task" | "noop";

export interface ChatIntent {
  chat_intent_id: number;
  project_chat_id: number;
  project_id: number;
  project_name?: string | null;
  chat_name?: string | null;
  source_message_id: string;
  intent_seq: number;
  intent_kind: ChatIntentKind;
  status: ChatIntentStatus;
  confidence: number;
  title?: string | null;
  description?: string | null;
  assignee_name_raw?: string | null;
  assignee_open_id?: string | null;
  assignee_name?: string | null;
  due_date?: string | null;
  priority?: string | null;
  matched_task_id?: number | null;
  matched_task_title?: string | null;
  reasoning?: string | null;
  model_name?: string | null;
  extracted_at: string;
  applied_at?: string | null;
  applied_task_id?: number | null;
  applied_log_id?: number | null;
  reviewer_open_id?: string | null;
  reviewer_name?: string | null;
  review_note?: string | null;
  source_message_text?: string | null;
  source_sender_name?: string | null;
  source_text?: string | null;
  source_message_at?: string | null;
}

export interface ChatInsightChatBrief {
  project_chat_id: number;
  project_id: number;
  project_name?: string | null;
  chat_id: string;
  chat_name?: string | null;
  last_synced_at?: string | null;
  last_message_at?: string | null;
  pending_count: number;
  applied_count: number;
}

export async function listChatIntents(params: {
  status?: string;
  project_chat_id?: number;
  kind?: string;
  limit?: number;
  offset?: number;
}): Promise<{ items: ChatIntent[] }> {
  const { data } = await api.get("/chat-insights", { params });
  return data;
}

export async function getChatIntent(id: number): Promise<ChatIntent> {
  const { data } = await api.get(`/chat-insights/${id}`);
  return data;
}

export async function approveChatIntent(
  id: number,
  body?: {
    note?: string;
    title_override?: string;
    assignee_open_id_override?: string;
    due_date_override?: string;
    priority_override?: "low" | "medium" | "high" | "urgent";
  },
): Promise<ChatIntent> {
  const { data } = await api.post(`/chat-insights/${id}/approve`, body ?? {});
  return data;
}

export async function rejectChatIntent(
  id: number,
  note?: string,
): Promise<ChatIntent> {
  const { data } = await api.post(`/chat-insights/${id}/reject`, { note });
  return data;
}

export async function cancelChatIntent(
  id: number,
  note?: string,
): Promise<ChatIntent> {
  const { data } = await api.post(`/chat-insights/${id}/cancel`, { note });
  return data;
}

export async function triggerChatExtract(
  project_chat_id: number,
  opts?: { since_minutes?: number; limit?: number; sync_first?: boolean },
): Promise<{ project_chat_id: number; synced: unknown; extracted: unknown }> {
  const { data } = await api.post("/chat-insights/extract", {
    project_chat_id,
    since_minutes: opts?.since_minutes ?? 24 * 60,
    limit: opts?.limit ?? 60,
    sync_first: opts?.sync_first ?? true,
  });
  return data;
}

export async function listChatInsightChats(): Promise<{
  items: ChatInsightChatBrief[];
}> {
  const { data } = await api.get("/chat-insights/chats/list");
  return data;
}
