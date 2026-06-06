import { api } from "./client";
import type { Page, Member, MemberWorkload } from "../types/api";

export const listMembers = async (params?: {
  department?: string;
  role?: string;
  keyword?: string;
  page?: number;
  page_size?: number;
}): Promise<Page<Member>> => {
  const { data } = await api.get<Page<Member>>("/members", { params });
  return data;
};

export const getMember = async (open_id: string): Promise<Member> => {
  const { data } = await api.get<Member>(`/members/${open_id}`);
  return data;
};

export const getMemberWorkload = async (open_id: string): Promise<MemberWorkload> => {
  const { data } = await api.get<MemberWorkload>(`/members/${open_id}/workload`);
  return data;
};

export const getMemberWorkloads = async (open_ids: string[]): Promise<Record<string, MemberWorkload>> => {
  if (!open_ids.length) return {};
  const { data } = await api.get<Record<string, MemberWorkload>>("/members/workloads/bulk", {
    params: { open_ids: open_ids.join(",") },
  });
  return data;
};

export type LarkPeopleSyncSource = "ehr" | "contact" | "auto";

export interface LarkPeopleSyncResult {
  source: string;
  total: number;
  created: number;
  updated: number;
  unchanged: number;
  marked_left: number;
  departments: number;
  errors: string[];
}

export const syncLarkPeople = async (params?: {
  source?: LarkPeopleSyncSource;
  mark_missing_left?: boolean;
}): Promise<LarkPeopleSyncResult> => {
  const { data } = await api.post<LarkPeopleSyncResult>("/members/sync/lark-people", null, { params });
  return data;
};

export type MemberUpdatePayload = Partial<Omit<Member, "department" | "position" | "title">> & {
  department?: string | null;
  position?: string | null;
  title?: string | null;
};

export const updateMember = async (open_id: string, payload: MemberUpdatePayload): Promise<Member> => {
  const { data } = await api.patch<Member>(`/members/${open_id}`, payload);
  return data;
};

export type MemberCreatePayload = Pick<Member, "open_id" | "name" | "role" | "status"> &
  Partial<
    Pick<
      Member,
      | "base_record_id"
      | "en_name"
      | "email"
      | "mobile"
      | "avatar_url"
      | "department"
      | "position"
      | "title"
      | "signature"
      | "enroll_date"
      | "graduate_date"
      | "research_area"
      | "bio"
      | "privacy_level"
    >
  >;

export const createMember = async (payload: MemberCreatePayload): Promise<Member> => {
  const { data } = await api.post<Member>("/members", payload);
  return data;
};

export const deleteMember = async (open_id: string): Promise<Member> => {
  const { data } = await api.delete<Member>(`/members/${open_id}`);
  return data;
};
