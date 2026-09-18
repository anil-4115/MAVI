import { Types } from "mongoose";
import { User } from "../auth/auth.model.js";
import { Group, type GroupDocument } from "./group.model.js";
import { Expense } from "../expenses/expense.model.js";
import { Settlement } from "../settlements/settlement.model.js";
import { Notification } from "../notifications/notification.model.js";
import { deleteImage } from "../expenses/attachment.service.js";
import { ApiError } from "../../utils/ApiError.js";
import { DEFAULT_CURRENCY } from "../common/money.js";
import { assertOwnerInvariant, type AddMemberInput, type CreateGroupInput, type RoleInput, type UpdateGroupInput } from "./group.validation.js";
import {
  notify,
  onGroupArchived,
  onGroupRestored,
  onGroupInvitation,
  onInvitationAccepted,
  onMemberLeft,
  onMemberRemoved,
  onOwnershipTransferred,
  onRoleChanged,
} from "../notifications/notification.service.js";
import type {
  GroupInvitePreview,
  GroupMemberInput,
  GroupRole,
  MemberStatus,
  PublicGroup,
  PublicGroupMember,
} from "./group.types.js";

interface UserCacheEntry {
  id: string;
  name: string;
  email: string;
  exists: boolean;
}

const userCache = new Map<string, UserCacheEntry>();

async function resolveUsers(userIds: string[]): Promise<Map<string, UserCacheEntry>> {
  const missing = userIds.filter((id) => !userCache.has(id));
  if (missing.length > 0) {
    const users = await User.find({ _id: { $in: missing } }).select("name email").lean();
    for (const user of users) {
      userCache.set(user._id.toString(), {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        exists: true,
      });
    }
    for (const id of missing) {
      if (!userCache.has(id)) {
        userCache.set(id, { id, name: "Unknown", email: "", exists: false });
      }
    }
  }

  const result = new Map<string, UserCacheEntry>();
  for (const id of userIds) {
    const entry = userCache.get(id)!;
    result.set(id, entry);
  }
  return result;
}

const toPublicGroup = async (group: GroupDocument, viewerId: string): Promise<PublicGroup> => {
  const active = group.members.filter((m) => m.status === "active");
  const my = group.members.find((m) => m.userId.toString() === viewerId) ?? null;

  return {
    id: group._id.toString(),
    name: group.name,
    description: group.description,
    currency: group.currency,
    createdBy: group.createdBy.toString(),
    archived: group.archived,
    archivedAt: group.archivedAt ? group.archivedAt.toISOString() : null,
    createdAt: group.createdAt.toISOString(),
    updatedAt: group.updatedAt.toISOString(),
    memberCount: active.length,
    myRole: my?.role ?? null,
    myStatus: my ? (my.status as MemberStatus) : null,
  };
};

const findGroupOrThrow = async (groupId: string): Promise<GroupDocument> => {
  const group = await Group.findById(groupId);
  if (!group) {
    throw new ApiError(404, "Group not found");
  }
  return group as unknown as GroupDocument;
};

const getMembership = (group: GroupDocument, userId: string) =>
  group.members.find((m) => m.userId.toString() === userId);

function requireActiveMember(group: GroupDocument, userId: string): GroupMemberInput {
  const member = getMembership(group, userId);
  if (!member || member.status !== "active") {
    // 404 (not 403) so callers cannot tell whether the group exists.
    throw new ApiError(404, "Group not found");
  }
  return member;
}

function requireRole(group: GroupDocument, userId: string, roles: GroupRole[]): GroupMemberInput {
  const member = requireActiveMember(group, userId);
  if (!roles.includes(member.role)) {
    throw new ApiError(403, "You are not authorized to perform this action");
  }
  return member;
}

/* ---------------------------------- create ---------------------------------- */

export async function createGroup(
  input: CreateGroupInput,
  creatorId: string,
): Promise<PublicGroup> {
  const creator = await User.exists({ _id: creatorId });
  if (!creator) {
    throw new ApiError(404, "User not found");
  }

  const now = new Date();
  const members: GroupMemberInput[] = [
    { userId: creatorId, role: "owner", status: "active", joinedAt: now },
  ];
  assertOwnerInvariant(members);

  const group = (await Group.create({
    name: input.name,
    description: input.description,
    currency: input.currency || DEFAULT_CURRENCY,
    createdBy: creatorId,
    members,
    archived: false,
    archivedAt: null,
  })) as unknown as GroupDocument;

  return toPublicGroup(group, creatorId);
}

/* ----------------------------------- list ---------------------------------- */

export type GroupListStatus = "active" | "archived";

export async function listGroups(
  userId: string,
  status: GroupListStatus = "active",
): Promise<PublicGroup[]> {
  const groups = (await Group.find({
    archived: status === "archived",
    members: { $elemMatch: { userId: userId as unknown as Types.ObjectId, status: "active" } },
  }).sort({ createdAt: -1 })) as unknown as GroupDocument[];

  return Promise.all(groups.map((g) => toPublicGroup(g, userId)));
}

/* ---------------------------------- detail --------------------------------- */

export async function getGroupDetail(groupId: string, viewerId: string): Promise<PublicGroup> {
  const group = await findGroupOrThrow(groupId);
  requireActiveMember(group, viewerId);
  return toPublicGroup(group, viewerId);
}

export async function getGroupForInvitePreview(groupId: string, viewerId: string): Promise<GroupInvitePreview> {
  const group = await findGroupOrThrow(groupId);
  const my = getMembership(group, viewerId);

  // Uniform 404 (whether the group exists, is unknown, or the viewer is not
  // currently invited) avoids leaking group existence or membership status.
  if (!my || my.status !== "invited") {
    throw new ApiError(404, "Invitation not found");
  }

  return {
    id: group._id.toString(),
    name: group.name,
    description: group.description,
    currency: group.currency,
    myStatus: my.status as MemberStatus,
  };
}

/* ---------------------------------- update --------------------------------- */

export async function updateGroup(
  groupId: string,
  actorId: string,
  input: UpdateGroupInput,
): Promise<PublicGroup> {
  const group = await findGroupOrThrow(groupId);
  requireRole(group, actorId, ["owner", "admin"]);

  if (input.name !== undefined) group.name = input.name;
  if (input.description !== undefined) group.description = input.description;

  await group.save();
  return toPublicGroup(group, actorId);
}

/* ---------------------------------- archive -------------------------------- */

export async function archiveGroup(groupId: string, actorId: string): Promise<PublicGroup> {
  const group = await findGroupOrThrow(groupId);
  const actor = requireActiveMember(group, actorId);
  if (actor.role !== "owner") {
    throw new ApiError(403, "Only the group owner can archive the group");
  }

  if (group.archived) {
    throw new ApiError(409, "Group is already archived");
  }

  group.archived = true;
  group.archivedAt = new Date();
  await group.save();

  await notify(onGroupArchived(group, actorId));

  // Visible only via explicit detail call (not the archived-excluded list).
  return toPublicGroup(group, actorId);
}

/* ---------------------------------- restore -------------------------------- */

/**
 * Owner-only unarchive. Reverses an archive: the group returns to Active and
 * every read/write guard immediately resumes because each one checks the live
 * `archived` flag at request time. Expenses, settlements, receipts, members
 * and notifications are left exactly as they were — nothing is re-created.
 * A group must already be archived (409 otherwise), so restore never races
 * active usage and the archive-first permanent-delete rule stays intact.
 */
export async function restoreGroup(groupId: string, actorId: string): Promise<PublicGroup> {
  const group = await findGroupOrThrow(groupId);
  const actor = requireActiveMember(group, actorId);
  if (actor.role !== "owner") {
    throw new ApiError(403, "Only the group owner can restore the group");
  }

  if (!group.archived) {
    throw new ApiError(409, "Group is not archived");
  }

  group.archived = false;
  group.archivedAt = null;
  await group.save();

  await notify(onGroupRestored(group, actorId));

  return toPublicGroup(group, actorId);
}

/* ---------------------------- permanent delete ---------------------------- */

/**
 * Irreversibly delete an archived group and every record that references it:
 * its expenses (including their GridFS receipts), settlements, and group-scoped
 * notifications. Owner-only and archive-first: a group must be archived before
 * it can be permanently deleted, so this "undo" path never races active usage.
 *
 * The GridFS cleanup runs BEFORE the group record is removed. If any file
 * delete fails, the whole operation aborts (the group still exists) and is
 * safe to retry, so we never report success while leaving orphaned receipts.
 */
export async function permanentlyDeleteGroup(groupId: string, actorId: string): Promise<void> {
  const group = await findGroupOrThrow(groupId);
  const actor = requireActiveMember(group, actorId);
  if (actor.role !== "owner") {
    throw new ApiError(403, "Only the group owner can permanently delete the group");
  }

  if (!group.archived) {
    throw new ApiError(409, "Only archived groups can be permanently deleted");
  }

  const groupObjectId = new Types.ObjectId(groupId);

  /* Capture receipt file ids BEFORE any expense rows are removed. */
  const expenseDocs = (await Expense.find({ group: groupObjectId }).select("attachment")) as unknown as Array<{
    attachment: { fileId: Types.ObjectId } | null;
  }>;
  const fileIds = expenseDocs
    .map((expense) => (expense.attachment ? expense.attachment.fileId.toString() : null))
    .filter((fileId): fileId is string => fileId !== null);

  await Settlement.deleteMany({ group: groupObjectId });
  await Expense.deleteMany({ group: groupObjectId });
  await Notification.deleteMany({ group: groupObjectId });

  for (const fileId of fileIds) {
    await deleteImage(fileId);
  }

  await Group.deleteOne({ _id: groupObjectId });
}

/* ---------------------------------- members -------------------------------- */

/** Owner/admin invites a registered user (status invited until they accept). */
export async function inviteMember(
  groupId: string,
  actorId: string,
  input: AddMemberInput,
): Promise<PublicGroup> {
  const group = await findGroupOrThrow(groupId);
  requireRole(group, actorId, ["owner", "admin"]);

  const targetId = input.userId;
  const target = await User.exists({ _id: targetId });
  if (!target) {
    throw new ApiError(404, "User not found");
  }

  const existing = getMembership(group, targetId);
  if (existing && existing.status === "invited") {
    throw new ApiError(409, "User is already invited to this group");
  }
  if (existing && existing.status === "active") {
    throw new ApiError(409, "User is already an active member of this group");
  }

  const now = new Date();
  if (existing && existing.status === "declined") {
    existing.status = "invited";
    existing.addedBy = actorId as unknown as Types.ObjectId;
  } else {
    group.members.push({
      userId: targetId as unknown as Types.ObjectId,
      role: "member",
      status: "invited",
      joinedAt: now,
      addedBy: actorId as unknown as Types.ObjectId,
    });
  }

  assertOwnerInvariant(group.members);
  await group.save();

  await notify(onGroupInvitation(group, actorId, targetId));
  return toPublicGroup(group, actorId);
}

export async function listMembers(groupId: string, viewerId: string): Promise<PublicGroupMember[]> {
  const group = await findGroupOrThrow(groupId);
  requireActiveMember(group, viewerId);

  const userIds = [...new Set(group.members.map((m) => m.userId.toString()))];
  const users = await resolveUsers(userIds);

  /** Owner/admin may see the full member list; plain members see only active members. */
  const viewer = requireActiveMember(group, viewerId);
  const privileged = viewer.role === "owner" || viewer.role === "admin";

  const members: PublicGroupMember[] = [];
  for (const m of group.members) {
    if (m.status === "declined") continue;
    if (!privileged && m.status !== "active") continue;

    const u = users.get(m.userId.toString());
    members.push({
      userId: m.userId.toString(),
      name: u?.name ?? "Unknown",
      email: u?.email ?? "",
      role: m.role,
      status: m.status as MemberStatus,
      joinedAt: m.joinedAt instanceof Date ? m.joinedAt.toISOString() : new Date(m.joinedAt).toISOString(),
    });
  }

  return members;
}

/* ------------------------------ accept / decline --------------------------- */

export async function respondToInvitation(
  groupId: string,
  invitedUserId: string,
  action: "accept" | "decline",
): Promise<void> {
  const group = await findGroupOrThrow(groupId);

  const member = getMembership(group, invitedUserId);
  if (!member || member.status !== "invited") {
    throw new ApiError(404, "Invitation not found");
  }

  if (action === "accept") {
    member.status = "active";
    member.joinedAt = new Date();
  } else {
    member.status = "declined";
  }

  assertOwnerInvariant(group.members);
  await group.save();

  if (action === "accept") {
    await notify(onInvitationAccepted(group, invitedUserId));
  }
}

/* ---------------------------------- remove --------------------------------- */

export async function removeMember(
  groupId: string,
  actorId: string,
  targetUserId: string,
): Promise<void> {
  const group = await findGroupOrThrow(groupId);
  const actor = getMembership(group, actorId);

  const self = actorId === targetUserId;
  if (!actor || actor.status !== "active") {
    // 404 (not 403) so non-members cannot distinguish existing from unknown groups.
    throw new ApiError(404, "Group not found");
  }

  const target = getMembership(group, targetUserId);
  if (!target) {
    throw new ApiError(404, "Member not found in this group");
  }

  const actorPrivileged = actor.role === "owner" || actor.role === "admin";
  if (!self && !actorPrivileged) {
    throw new ApiError(403, "You are not authorized to remove this member");
  }

  if (target.role === "owner" && target.status === "active") {
    throw new ApiError(409, "The group owner cannot be removed. Transfer ownership first");
  }

  target.status = "declined";
  assertOwnerInvariant(group.members);
  await group.save();

  await notify(self ? onMemberLeft(group, actorId) : onMemberRemoved(group, actorId, targetUserId));
}

/* ----------------------------------- roles --------------------------------- */

export async function changeRole(
  groupId: string,
  actorId: string,
  targetUserId: string,
  roleInput: RoleInput,
): Promise<PublicGroup> {
  const group = await findGroupOrThrow(groupId);
  const actor = requireActiveMember(group, actorId);
  if (actor.role !== "owner") {
    throw new ApiError(403, "Only the group owner can change roles");
  }

  const target = getMembership(group, targetUserId);
  if (!target || target.status !== "active") {
    throw new ApiError(404, "Active member not found in this group");
  }
  if (target.role === "owner") {
    throw new ApiError(409, "The owner's role cannot be changed; use ownership transfer instead");
  }

  target.role = roleInput.role;
  assertOwnerInvariant(group.members);
  await group.save();

  await notify(onRoleChanged(group, actorId, targetUserId, roleInput.role));
  return toPublicGroup(group, actorId);
}

/* ------------------------------- ownership -------------------------------- */

export async function transferOwnership(
  groupId: string,
  actorId: string,
  newOwnerId: string,
): Promise<PublicGroup> {
  const group = await findGroupOrThrow(groupId);

  const actor = getMembership(group, actorId);
  if (!actor || actor.status !== "active") {
    // 404 (not 403) so non-members cannot distinguish existing from unknown groups.
    throw new ApiError(404, "Group not found");
  }
  if (actor.role !== "owner") {
    throw new ApiError(403, "Only the current owner can transfer ownership");
  }

  if (actorId === newOwnerId) {
    throw new ApiError(400, "The new owner must be a different member");
  }

  const newOwner = getMembership(group, newOwnerId);
  if (!newOwner || newOwner.status !== "active") {
    throw new ApiError(404, "The new owner must be an active member of the group");
  }

  actor.role = "admin";
  newOwner.role = "owner";

  assertOwnerInvariant(group.members);
  await group.save();

  await notify(onOwnershipTransferred(group, actorId, newOwnerId));
  return toPublicGroup(group, newOwnerId);
}
