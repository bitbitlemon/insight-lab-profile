import { api } from "./client";

export interface AssistantProject {
  project_id: number;
  name: string;
  status: string;
  current_stage?: string | null;
  department?: string | null;
  owner_name: string;
  open_tasks: number;
  blocked_tasks: number;
  overdue_tasks: number;
  latest_progress?: string | null;
  latest_progress_at?: string | null;
}

export interface ProjectAssistantResponse {
  answer: string;
  matched_count: number;
  projects: AssistantProject[];
  sources: Array<{ source_id: string; source_type: string; title: string; content: string; occurred_at?: string | null; project_id?: number | null }>;
  retrieval_query: string;
  used_llm: boolean;
  answer_mode: "llm" | "database_fallback" | "no_match";
  model_name?: string | null;
  llm_error?: string | null;
  steps: string[];
  trace_id: string;
  generated_at: string;
}

export const queryProjectAssistant = async (question: string, context?: { projectIds?: number[]; conversation?: Array<{ role: "user" | "assistant"; content: string }> }) => {
  const { data } = await api.post<ProjectAssistantResponse>("/assistant/project-query", {
    question,
    context_project_ids: context?.projectIds || [],
    conversation: context?.conversation || [],
  });
  return data;
};
