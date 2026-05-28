import { api } from "./client";
import type { Page } from "../types/api";

export type AdvisingRole = "primary" | "co_advisor" | "external";

export interface Advising {
  advising_id: number;
  base_record_id?: string | null;
  student_open_id: string;
  advisor_open_id: string;
  role: AdvisingRole;
  start_date: string;
  end_date?: string | null;
  notes?: string | null;
  created_at: string;
}

export interface AdvisingPayload {
  student_open_id: string;
  advisor_open_id: string;
  role: AdvisingRole;
  start_date: string;
  end_date?: string | null;
  notes?: string | null;
}

export const listAdvising = async (params?: {
  page?: number;
  page_size?: number;
  student_open_id?: string;
  advisor_open_id?: string;
  related_open_id?: string;
}): Promise<Page<Advising>> => {
  const { data } = await api.get<Page<Advising>>("/advising", { params });
  return data;
};

export const getAdvising = async (advising_id: number): Promise<Advising> => {
  const { data } = await api.get<Advising>(`/advising/${advising_id}`);
  return data;
};

export const createAdvising = async (payload: AdvisingPayload): Promise<Advising> => {
  const { data } = await api.post<Advising>("/advising", payload);
  return data;
};

export const updateAdvising = async (
  advising_id: number,
  payload: Partial<AdvisingPayload>,
): Promise<Advising> => {
  const { data } = await api.patch<Advising>(`/advising/${advising_id}`, payload);
  return data;
};

export const deleteAdvising = async (advising_id: number): Promise<void> => {
  await api.delete(`/advising/${advising_id}`);
};
