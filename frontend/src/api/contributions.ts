import { api } from "./client";
import type { Page } from "../types/api";

export type ContributionType = "event" | "internal_share" | "document" | "reflection" | "other";
export type ContributionRole =
  | "organizer" | "co_organizer" | "speaker" | "participant" | "contributor" | "other";

export interface Contribution {
  contribution_id: number;
  member_open_id: string;
  type: ContributionType;
  title: string;
  description: string | null;
  occurred_at: string;
  role_in_contribution: ContributionRole | null;
  hours: number | null;
  score: number | null;
  proof_url: string | null;
  tags: string | null;
  created_at: string;
}

export const listContributions = async (params?: {
  member_open_id?: string;
  type?: ContributionType;
  page?: number;
  page_size?: number;
}): Promise<Page<Contribution>> => {
  const { data } = await api.get<Page<Contribution>>("/contributions", { params });
  return data;
};

export const getContribution = async (contribution_id: number | string): Promise<Contribution> => {
  const { data } = await api.get<Contribution>(`/contributions/${contribution_id}`);
  return data;
};

export const createContribution = async (
  payload: Omit<Contribution, "contribution_id" | "created_at">,
): Promise<Contribution> => {
  const { data } = await api.post<Contribution>("/contributions", payload);
  return data;
};

export const updateContribution = async (
  contribution_id: number | string,
  payload: Partial<Omit<Contribution, "contribution_id" | "created_at" | "member_open_id">>,
): Promise<Contribution> => {
  const { data } = await api.patch<Contribution>(`/contributions/${contribution_id}`, payload);
  return data;
};
