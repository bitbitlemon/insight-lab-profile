import { api } from "./client";

export interface CloudLabViewer {
  member_open_id: string;
  member_name: string;
  avatar_url?: string | null;
  last_seen_at: string;
}

export interface DailyUsageMetric {
  date: string;
  active_users: number;
  cloud_lab_users: number;
  interactions: number;
}

export interface SnakeScore {
  score_id: number;
  member_open_id: string;
  member_name: string;
  avatar_url?: string | null;
  score: number;
  duration_seconds: number;
  created_at: string;
}

export interface UsageAdminSummary {
  current_cloud_lab_viewers: number;
  viewer_window_seconds: number;
  viewers: CloudLabViewer[];
  daily_metrics: DailyUsageMetric[];
  snake_leaderboard: SnakeScore[];
}

export const recordUsageHeartbeat = async (page: string): Promise<void> => {
  await api.post("/usage/heartbeat", { page });
};

export const getUsageAdminSummary = async (params?: {
  days?: number;
  viewer_window_seconds?: number;
}): Promise<UsageAdminSummary> => {
  const { data } = await api.get<UsageAdminSummary>("/usage/admin/summary", { params });
  return data;
};

export const listSnakeScores = async (limit = 10): Promise<SnakeScore[]> => {
  const { data } = await api.get<SnakeScore[]>("/usage/snake-scores", { params: { limit } });
  return data;
};

export const submitSnakeScore = async (payload: {
  score: number;
  duration_seconds?: number;
}): Promise<SnakeScore> => {
  const { data } = await api.post<SnakeScore>("/usage/snake-scores", payload);
  return data;
};
