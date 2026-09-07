import type { Types } from "mongoose";

export const GroupRoles = ["owner", "admin", "member"] as const;
export type GroupRole = (typeof GroupRoles)[number];

export const MemberStatuses = ["active", "invited", "declined"] as const;
export type MemberStatus = (typeof MemberStatuses)[number];

export interface GroupMemberInput {
  userId: Types.ObjectId | string;
  role: GroupRole;
  status: MemberStatus;
  joinedAt: Date;
  /** Owner/admin who added the member (unset for the creator). */
  addedBy?: Types.ObjectId | string;
}

/**
 * Safe, public view of a member for list/detail responses.
 * Never includes passwordHash or other sensitive fields.
 */
export interface PublicGroupMember {
  userId: string;
  name: string;
  email: string;
  role: GroupRole;
  status: MemberStatus;
  joinedAt: string;
}

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

/** Minimal invitee-facing preview of a group (no expense data). */
export interface GroupInvitePreview {
  id: string;
  name: string;
  description?: string;
  currency: string;
  myStatus: MemberStatus;
}
