import { api } from "./client";
import type { Page } from "../types/api";

export interface Training {
  training_id: number;
  base_record_id?: string | null;
  participant_open_id: string;
  name: string;
  type: string | null;
  organizer: string | null;
  start_date: string | null;
  end_date: string | null;
  location: string | null;
  hours: number | null;
  has_certificate: boolean;
  certificate_url: string | null;
  reflection: string | null;
  created_at?: string;
  updated_at?: string;
}

export const listTrainings = async (params?: {
  participant_open_id?: string;
  type?: string;
  page?: number;
  page_size?: number;
}): Promise<Page<Training>> => {
  const { data } = await api.get<Page<Training>>("/trainings", { params });
  return data;
};

export const getTraining = async (training_id: number | string): Promise<Training> => {
  const { data } = await api.get<Training>(`/trainings/${training_id}`);
  return data;
};
