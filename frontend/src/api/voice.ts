import { api } from "./client";
import type { ProjectPriority } from "../types/api";

export interface VoiceInterpretResult {
  action: "task" | "event" | "unknown";
  confidence: number;
  title: string;
  description?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  due_date?: string | null;
  location?: string | null;
  attendee_open_ids: string[];
  assignee_open_ids: string[];
  priority: ProjectPriority;
  reason?: string | null;
}

export interface VoiceJsapiConfig {
  appId: string;
  timestamp: number;
  nonceStr: string;
  signature: string;
  jsApiList: string[];
  url: string;
}

export const interpretVoiceCommand = async (text: string): Promise<VoiceInterpretResult> => {
  const { data } = await api.post<VoiceInterpretResult>("/voice/interpret", { text });
  return data;
};

export const getVoiceJsapiConfig = async (url: string): Promise<VoiceJsapiConfig> => {
  const { data } = await api.post<VoiceJsapiConfig>("/voice/jsapi-config", { url });
  return data;
};

export const transcribeVoiceAudio = async (payload: { audio_base64: string; format: "wav" | "aac" | "mp3" | "pcm" }): Promise<{ text: string }> => {
  const { data } = await api.post<{ text: string }>("/voice/transcribe", payload);
  return data;
};
