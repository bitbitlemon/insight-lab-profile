import { api } from "./client";
import type { ApprovalRule } from "../types/api";

export interface ApprovalRulePayload {
  project_category: string;
  stage_title?: string | null;
  mode: "any" | "all";
  approver_open_ids: string[];
  enabled?: boolean;
}

export const listApprovalRules = async (): Promise<ApprovalRule[]> => {
  const { data } = await api.get<ApprovalRule[]>("/approval-rules");
  return data;
};

export const upsertApprovalRule = async (payload: ApprovalRulePayload): Promise<ApprovalRule> => {
  const { data } = await api.post<ApprovalRule>("/approval-rules", payload);
  return data;
};

export const deleteApprovalRule = async (ruleId: number): Promise<void> => {
  await api.delete(`/approval-rules/${ruleId}`);
};

export interface StageTemplate {
  template_id: number;
  project_category: string;
  stage_title: string;
  item_text: string;
  required: boolean;
  sort_order: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface StageTemplatePayload {
  project_category: string;
  stage_title: string;
  item_text: string;
  required?: boolean;
  sort_order?: number;
  enabled?: boolean;
}

export const listStageTemplates = async (params?: { project_category?: string; stage_title?: string }): Promise<StageTemplate[]> => {
  const { data } = await api.get<StageTemplate[]>("/stage-check-templates", { params });
  return data;
};

export const upsertStageTemplate = async (payload: StageTemplatePayload): Promise<StageTemplate> => {
  const { data } = await api.post<StageTemplate>("/stage-check-templates", payload);
  return data;
};

export const deleteStageTemplate = async (templateId: number): Promise<void> => {
  await api.delete(`/stage-check-templates/${templateId}`);
};
