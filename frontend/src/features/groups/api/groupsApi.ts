import type { ApiEnvelope } from "../../../lib/types";
import api from "../../../services/api";

/**
 * Group API types mirror the backend contract
 * (backend/src/modules/groups/group.types.ts and group.routes.ts). All group
 * management endpoints (update/archive/invite/accept/decline/remove/role/
 * ownership) carry their backend authorization rules; the UI gates controls by
 * `myRole` but the server remains authoritative.
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

export interface UpdateGroupPayload {
  name?: string;
  description?: string;
}

/** Public preview visible to an invited user before they accept (GET /groups/:id/preview). */
export interface GroupInvitePreview {
  id: string;
  name: string;
  description?: string;
  currency: string;
  myStatus: MemberStatus;
}

export type ManageableRole = Exclude<GroupRole, "owner">;

interface GroupResponse extends ApiEnvelope<{ group: PublicGroup }> {
  success: true;
}

interface GroupsResponse extends ApiEnvelope<{ groups: PublicGroup[] }> {
  success: true;
}

interface MembersResponse extends ApiEnvelope<{ members: PublicGroupMember[] }> {
  success: true;
}

interface InvitePreviewResponse extends ApiEnvelope<{ group: GroupInvitePreview }> {
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

export const getGroupInvitePreview = async (groupId: string): Promise<GroupInvitePreview> => {
  const response = await api.get<InvitePreviewResponse>(`/groups/${groupId}/preview`);
  return response.data.data.group;
};

/** Owner/admin only on the backend. */
export const updateGroup = async (
  groupId: string,
  payload: UpdateGroupPayload,
): Promise<PublicGroup> => {
  const response = await api.patch<GroupResponse>(`/groups/${groupId}`, payload);
  return response.data.data.group;
};

/** Owner only on the backend (PATCH-less archive via DELETE). */
export const archiveGroup = async (groupId: string): Promise<PublicGroup> => {
  const response = await api.delete<GroupResponse>(`/groups/${groupId}`);
  return response.data.data.group;
};

/** Owner/admin invite a registered user by id. */
export const inviteMember = async (groupId: string, userId: string): Promise<PublicGroup> => {
  const response = await api.post<GroupResponse>(`/groups/${groupId}/members`, { userId });
  return response.data.data.group;
};

/** Respond to your own invitation (the backend requires userId === caller). */
export const acceptInvitation = async (groupId: string, userId: string): Promise<void> => {
  await api.post<ApiEnvelope<null>>(`/groups/${groupId}/members/${userId}/accept`);
};

export const declineInvitation = async (groupId: string, userId: string): Promise<void> => {
  await api.post<ApiEnvelope<null>>(`/groups/${groupId}/members/${userId}/decline`);
};

/** Remove another member (owner/admin) or leave the group yourself. */
export const removeMember = async (groupId: string, userId: string): Promise<void> => {
  await api.delete<ApiEnvelope<null>>(`/groups/${groupId}/members/${userId}`);
};

/** Owner only: promote/demote an active non-owner member. */
export const changeMemberRole = async (
  groupId: string,
  userId: string,
  role: ManageableRole,
): Promise<PublicGroup> => {
  const response = await api.patch<GroupResponse>(`/groups/${groupId}/members/${userId}/role`, {
    role,
  });
  return response.data.data.group;
};

/** Owner only: hand the group to another active member (demotes you to admin). */
export const transferOwnership = async (
  groupId: string,
  newOwnerId: string,
): Promise<PublicGroup> => {
  const response = await api.patch<GroupResponse>(`/groups/${groupId}/owner`, {
    userId: newOwnerId,
  });
  return response.data.data.group;
};

export const listGroupMembers = async (groupId: string): Promise<PublicGroupMember[]> => {
  const response = await api.get<MembersResponse>(`/groups/${groupId}/members`);
  return response.data.data.members;
};