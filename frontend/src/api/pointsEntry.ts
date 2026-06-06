import { api } from "./client";

export type GrantLevel = "national" | "provincial" | "school" | "horizontal";
export type GrantStatus = "applied" | "approved";
export type PenaltyKind = "deadline_minor" | "deadline_major" | "data_fraud" | "no_show" | "violation";
export type IndustrialScene = "contract" | "monthly_revenue" | "horizontal" | "startup";
export type ProductStage = "init" | "mvp" | "internal_qa" | "launch" | "operating";
export type DevRole = "owner" | "tech_lead" | "core" | "business_core" | "contributor" | "support";

export interface LedgerSubmitResult {
  ledger_id: number;
  final_points: number;
  reason?: string;
}

export interface TeamLedgerSubmitResult {
  ledger_ids: number[];
  total_points: number;
  allocations: Array<{
    member_open_id: string;
    points: number;
  }>;
}

export interface PointsPreview {
  points: number;
}

export interface DevTeamMember {
  member_open_id: string;
  role: DevRole;
}

export interface GrantSubmitPayload {
  member_open_id: string;
  level: GrantLevel;
  grant_status: GrantStatus;
  name: string;
  occurred_on: string;
}

export interface PenaltySubmitPayload {
  member_open_id: string;
  kind: PenaltyKind;
  custom_amount?: number;
  reason: string;
  occurred_on: string;
}

export interface IndustrialSubmitPayload {
  members: DevTeamMember[];
  amount_yuan: number;
  scene: IndustrialScene;
  occurred_on: string;
  project_key?: string;
  note?: string;
}

export interface ProductStageSubmitPayload {
  members: DevTeamMember[];
  stage: ProductStage;
  product_name: string;
  amount_yuan?: number;
  occurred_on: string;
}

export const previewGrantPoints = async (params: Pick<GrantSubmitPayload, "level" | "grant_status">): Promise<PointsPreview> => {
  const { data } = await api.get<PointsPreview>("/grants/preview", { params });
  return data;
};

export const submitGrantPoints = async (payload: GrantSubmitPayload): Promise<LedgerSubmitResult> => {
  const { data } = await api.post<LedgerSubmitResult>("/grants", payload);
  return data;
};

export const previewPenaltyPoints = async (params: { kind: PenaltyKind; custom_amount?: number }): Promise<PointsPreview> => {
  const { data } = await api.get<PointsPreview>("/penalties/preview", { params });
  return data;
};

export const submitPenaltyPoints = async (payload: PenaltySubmitPayload): Promise<LedgerSubmitResult> => {
  const { data } = await api.post<LedgerSubmitResult>("/penalties", payload);
  return data;
};

export const submitIndustrialPoints = async (payload: IndustrialSubmitPayload): Promise<TeamLedgerSubmitResult> => {
  const { data } = await api.post<TeamLedgerSubmitResult>("/industrial", payload);
  return data;
};

export const previewIndustrialPoints = async (params: { amount_yuan: number; project_key?: string }): Promise<PointsPreview> => {
  const { data } = await api.get<PointsPreview>("/industrial/preview", { params });
  return data;
};

export const previewProductStagePoints = async (params: {
  stage: ProductStage;
  amount_yuan?: number;
}): Promise<PointsPreview> => {
  const { data } = await api.get<PointsPreview>("/product_stages/preview", { params });
  return data;
};

export const submitProductStagePoints = async (payload: ProductStageSubmitPayload): Promise<TeamLedgerSubmitResult> => {
  const { data } = await api.post<TeamLedgerSubmitResult>("/product_stages", payload);
  return data;
};
