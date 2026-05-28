import { api } from "./client";

export interface PendingLedgerEntry {
  ledger_id: number;
  member_open_id: string;
  member_name: string;
  source_type: "paper" | "competition" | "contribution" | "duty" | "adjust";
  source_id: number | null;
  occurred_at: string;
  base_points: number;
  share_ratio: number;
  final_points: number;
  reason: string | null;
  created_at: string;
  status: string;
  approved_by: string | null;
  approved_at: string | null;
  review_comment: string | null;
  disputed: boolean;
  disputed_by: string | null;
  disputed_at: string | null;
  dispute_reason: string | null;
  resolution_status: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
}

export interface CompetitionPendingReviewItem {
  comp_id: number;
  name: string;
  level: string;
  award_level: string;
  team_lead_open_id: string | null;
  current_shares: Record<string, number>;
  default_shares: Record<string, number>;
  deviation_reason: string;
  members: Array<{
    member_open_id: string;
    member_role: string;
  }>;
}

export const listPendingLedger = async (): Promise<PendingLedgerEntry[]> => {
  const { data } = await api.get<PendingLedgerEntry[]>("/points/ledger/pending");
  return data;
};

export const approveLedger = async (ledgerId: number, comment?: string | null): Promise<void> => {
  await api.post(`/points/ledger/${ledgerId}/approve`, { comment: comment || null });
};

export const rejectLedger = async (ledgerId: number, comment?: string | null): Promise<void> => {
  await api.post(`/points/ledger/${ledgerId}/reject`, { comment: comment || null });
};

export const disputeLedger = async (ledgerId: number, dispute_reason?: string | null): Promise<void> => {
  await api.post(`/points/ledger/${ledgerId}/dispute`, { dispute_reason: dispute_reason || null });
};

export const resolveLedger = async (
  ledgerId: number,
  approve: boolean,
  resolution_note?: string | null,
): Promise<void> => {
  await api.post(`/points/ledger/${ledgerId}/resolve`, {
    approve,
    resolution_note: resolution_note || null,
  });
};

export const upgradeEventTier = async (
  contributionId: number,
  tier: "A" | "B" | "C",
  comment?: string | null,
): Promise<void> => {
  await api.post(`/contributions/${contributionId}/tier`, { tier, comment: comment || null });
};

export const listCompetitionPendingReview = async (): Promise<CompetitionPendingReviewItem[]> => {
  const { data } = await api.get<CompetitionPendingReviewItem[]>("/competitions/pending-review");
  return data;
};

export const doubleReviewCompetition = async (
  compId: number,
  approve: boolean,
  comment?: string | null,
): Promise<void> => {
  await api.post(`/competitions/${compId}/double-review`, { approve, comment: comment || null });
};
