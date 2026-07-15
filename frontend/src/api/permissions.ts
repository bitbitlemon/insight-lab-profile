import { api } from "./client";
import type {
  PermissionAssignment,
  PermissionOptions,
  PermissionRoleKey,
  PermissionScopeType,
} from "../types/api";

export interface PermissionAssignmentPayload {
  member_open_id: string;
  role_key: PermissionRoleKey;
  scope_type: PermissionScopeType;
  scope_value?: string | null;
}

export const getPermissionOptions = async (): Promise<PermissionOptions> => {
  const { data } = await api.get<PermissionOptions>("/permissions/options");
  return data;
};

export const listPermissionAssignments = async (): Promise<PermissionAssignment[]> => {
  const { data } = await api.get<PermissionAssignment[]>("/permissions/assignments");
  return data;
};

export const createPermissionAssignment = async (
  payload: PermissionAssignmentPayload,
): Promise<PermissionAssignment> => {
  const { data } = await api.post<PermissionAssignment>("/permissions/assignments", payload);
  return data;
};

export const deletePermissionAssignment = async (assignmentId: number): Promise<void> => {
  await api.delete(`/permissions/assignments/${assignmentId}`);
};
