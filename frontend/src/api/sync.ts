import { api } from "./client";

export interface SyncTableState {
  table_name: string;
  last_sync_at?: string | null;
  rows_synced: number;
  last_error?: string | null;
}

export interface SyncStateResponse {
  states: SyncTableState[];
}

export interface SyncAllResponse {
  results: Record<string, unknown>;
}

export const getSyncState = async (): Promise<SyncStateResponse> => {
  const { data } = await api.get<SyncStateResponse>("/sync/state");
  return data;
};

export const triggerFullSync = async (): Promise<SyncAllResponse> => {
  const { data } = await api.post<SyncAllResponse>("/sync/all");
  return data;
};
