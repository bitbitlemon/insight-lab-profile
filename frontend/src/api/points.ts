import { api } from "./client";

export interface PointsBreakdown {
  paper: number;
  competition: number;
  contribution: number;
  duty: number;
  adjust: number;
  total: number;
}

export interface MemberPoints {
  member_open_id: string;
  name: string;
  department: string | null;
  title: string | null;
  avatar_url: string | null;
  breakdown: PointsBreakdown;
  entries_count: number;
}

export interface LeaderboardItem {
  rank: number;
  member_open_id: string;
  name: string;
  department: string | null;
  avatar_url: string | null;
  total_points: number;
}

export interface LedgerEntry {
  ledger_id: number;
  source_type: "paper" | "competition" | "contribution" | "duty" | "adjust";
  source_id: number | null;
  occurred_at: string;
  base_points: number;
  share_ratio: number;
  final_points: number;
  reason: string | null;
  created_at: string;
}

export const getMemberPoints = async (open_id: string): Promise<MemberPoints> => {
  const { data } = await api.get<MemberPoints>(`/points/members/${open_id}`);
  return data;
};

export const getMemberPointsLedger = async (
  open_id: string,
  params?: { limit?: number },
): Promise<LedgerEntry[]> => {
  const { data } = await api.get<LedgerEntry[]>(`/points/members/${open_id}/ledger`, { params });
  return data;
};

export const getPointsLeaderboard = async (params?: {
  department?: string;
  start?: string;
  end?: string;
  limit?: number;
}): Promise<LeaderboardItem[]> => {
  const { data } = await api.get<LeaderboardItem[]>("/points/leaderboard", { params });
  return data;
};
