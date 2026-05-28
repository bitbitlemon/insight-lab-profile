import { api } from "./client";
import type { Page } from "../types/api";

export interface AuditEntry {
  log_id: number;
  actor_open_id: string;
  action: "create" | "update" | "delete" | "export" | string;
  target_table: string;
  target_id: string;
  diff?: string | null;
  ip?: string | null;
  created_at: string;
}

export interface AuditUndoResult {
  restored_table: string;
  restored_pk: Record<string, unknown>;
}

// 后端审计路由 prefix 为 /api/audit_log
const AUDIT_BASE = "/audit_log";

export const listAuditEntries = async (params?: {
  page?: number;
  page_size?: number;
  actor_open_id?: string;
  action?: string;
  target_table?: string;
  target_id?: string;
}): Promise<Page<AuditEntry>> => {
  const { data } = await api.get<Page<AuditEntry>>(AUDIT_BASE, { params });
  return data;
};

export const undoAuditEntry = async (log_id: number): Promise<AuditUndoResult> => {
  const { data } = await api.post<AuditUndoResult>(`${AUDIT_BASE}/${log_id}/undo`);
  return data;
};
