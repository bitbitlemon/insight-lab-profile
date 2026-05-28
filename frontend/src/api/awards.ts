import { api } from "./client";
import type { Page } from "../types/api";

export interface Award {
  award_id: number;
  base_record_id?: string | null;
  recipient_open_id: string;
  name: string;
  level: string | null;
  category: string | null;
  issuer: string | null;
  award_date: string | null;
  amount: number | null;
  certificate_url: string | null;
  description: string | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

export const listAwards = async (params?: {
  recipient_open_id?: string;
  category?: string;
  level?: string;
  page?: number;
  page_size?: number;
}): Promise<Page<Award>> => {
  const { data } = await api.get<Page<Award>>("/awards", { params });
  return data;
};

export const getAward = async (award_id: number | string): Promise<Award> => {
  const { data } = await api.get<Award>(`/awards/${award_id}`);
  return data;
};
