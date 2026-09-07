import type { ApiEnvelope } from "../../../lib/types";
import api from "../../../services/api";

/**
 * Group API types mirror the backend contract
 * (backend/src/modules/groups/group.types.ts). Only the endpoints required by
 * F.1 are exposed; invite/role/owner/settlement endpoints come with later
 * phases.
 */

export const GROUP_ROLES = ["owner", "admin", "member"] as const;
export type GroupRole = (typeof GROUP_ROLES)[number];

export const MEMBER_STATUSES = ["active", "invited", "declined"] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

export interface PublicGroup {
  id: string;
  name: string;
  description?: string;
  currency: string;
  createdBy: string;
  archived: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  memberCount: number;
  myRole: GroupRole | null;
  myStatus: MemberStatus | null;
}

export interface PublicGroupMember {
  userId: string;
  name: string;
  email: string;
  role: GroupRole;
  status: MemberStatus;
  joinedAt: string;
}

export interface CreateGroupPayload {
  name: string;
  description?: string;
  currency?: string;
}

interface GroupResponse extends ApiEnvelope<{ group: PublicGroup }> {
  success: true;
}

interface GroupsResponse extends ApiEnvelope<{ groups: PublicGroup[] }> {
  success: true;
}

interface MembersResponse extends ApiEnvelope<{ members: PublicGroupMember[] }> {
  success: true;
}

export const listGroups = async (): Promise<PublicGroup[]> => {
  const response = await api.get<GroupsResponse>("/groups");
  return response.data.data.groups;
};

export const createGroup = async (payload: CreateGroupPayload): Promise<PublicGroup> => {
  const response = await api.post<GroupResponse>("/groups", payload);
  return response.data.data.group;
};

export const getGroup = async (groupId: string): Promise<PublicGroup> => {
  const response = await api.get<GroupResponse>(`/groups/${groupId}`);
  return response.data.data.group;
};

export const listGroupMembers = async (groupId: string): Promise<PublicGroupMember[]> => {
  const response = await api.get<MembersResponse>(`/groups/${groupId}/members`);
  return response.data.data.members;
};