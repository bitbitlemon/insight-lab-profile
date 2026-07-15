import { api } from "./client";
import type { Member } from "../types/api";

export interface LarkLoginResponse {
  token: string;
  user: Member;
}

export const larkLogin = async (code: string) => {
  const response = await api.post<LarkLoginResponse>("/auth/lark/login", { code });
  return response.data;
};

export const getMe = async () => {
  const response = await api.get<Member>("/auth/me");
  return response.data;
};

export const browserLogin = async (identifier: string, passcode?: string) => {
  const response = await api.post<LarkLoginResponse>("/auth/browser/login", { identifier, passcode });
  return response.data;
};
