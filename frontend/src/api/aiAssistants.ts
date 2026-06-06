import { api } from "./client";

export type AIAssistantScope = "global" | "department";
export type AIAssistantCadence = "daily" | "weekly" | "manual";

export interface AIAssistantConfig {
  assistant_id: number;
  scope: AIAssistantScope;
  department: string | null;
  name: string;
  role: string;
  prompt: string;
  workflow: string | null;
  cadence: AIAssistantCadence;
  enabled: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface AIAssistantPayload {
  scope: AIAssistantScope;
  department?: string | null;
  name: string;
  role: string;
  prompt: string;
  workflow?: string | null;
  cadence: AIAssistantCadence;
  enabled: boolean;
}

export const listAIAssistants = async (params?: {
  scope?: AIAssistantScope;
  department?: string;
  enabled_only?: boolean;
}): Promise<AIAssistantConfig[]> => {
  const { data } = await api.get<AIAssistantConfig[]>("/ai-assistants", { params });
  return data;
};

export const createAIAssistant = async (payload: AIAssistantPayload): Promise<AIAssistantConfig> => {
  const { data } = await api.post<AIAssistantConfig>("/ai-assistants", payload);
  return data;
};

export const updateAIAssistant = async (
  assistantId: number,
  payload: AIAssistantPayload,
): Promise<AIAssistantConfig> => {
  const { data } = await api.patch<AIAssistantConfig>(`/ai-assistants/${assistantId}`, payload);
  return data;
};
