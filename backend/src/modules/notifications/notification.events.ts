/**
 * Pure notification event builders. Each function maps a completed domain
 * mutation to the lightweight notification records that describe it.
 *
 * These are intentionally PURE (no DB, no HTTP) so the recipient/metadata
 * policy is unit-testable offline. Persistence happens in the service layer.
 */
import type { NewNotification, NotificationMetadata, NotificationType } from "./notification.types.js";

/** Structural member duck-type (compatible with GroupDocument members). */
export interface MemberLike {
  userId: { toString(): string } | string;
  role: string;
  status: string;
}

/** Structural group duck-type (compatible with GroupDocument). */
export interface GroupLike {
  _id: { toString(): string } | string;
  name?: string;
  members: MemberLike[];
}

export const activeMemberIds = (members: MemberLike[]): string[] =>
  members.filter((m) => m.status === "active").map((m) => m.userId.toString());

export const leaderIds = (members: MemberLike[]): string[] =>
  members
    .filter((m) => (m.role === "owner" || m.role === "admin") && m.status === "active")
    .map((m) => m.userId.toString());

const unique = (ids: string[]): string[] => [...new Set(ids)];

/** Never notify the actor about their own action. */
const exceptActor = (ids: string[], actorId: string): string[] => ids.filter((id) => id !== actorId);

const groupMeta = (name: string | undefined): NotificationMetadata => ({ groupName: name });

const build = (
  group: GroupLike,
  type: NotificationType,
  actorId: string,
  recipients: string[],
  metadata: NotificationMetadata,
): NewNotification[] =>
  unique(exceptActor(recipients, actorId)).map((recipientId) => ({
    recipientId,
    type,
    groupId: group._id.toString(),
    actorId,
    metadata,
  }));

export interface ExpenseEventData {
  id: string;
  title: string;
  amountMinor: number;
  currency: string;
}

/** A group expense was created. Notify every active member except the creator. */
export function onExpenseCreated(group: GroupLike, actorId: string, expense: ExpenseEventData): NewNotification[] {
  return build(group, "expense_created", actorId, activeMemberIds(group.members), {
    ...groupMeta(group.name),
    expenseId: expense.id,
    title: expense.title,
    amountMinor: expense.amountMinor,
    currency: expense.currency,
  });
}

/** Someone was invited to the group. Notify the invitee. */
export function onGroupInvitation(group: GroupLike, actorId: string, inviteeId: string): NewNotification[] {
  return build(group, "group_invitation", actorId, [inviteeId], {
    ...groupMeta(group.name),
    inviteeId,
  });
}

/** An invited member accepted. Notify active owners/admins. */
export function onInvitationAccepted(group: GroupLike, acceptorId: string): NewNotification[] {
  return build(group, "invitation_accepted", acceptorId, leaderIds(group.members), {
    ...groupMeta(group.name),
    acceptorId,
  });
}

/** An admin/owner removed a member. Notify the removed member. */
export function onMemberRemoved(group: GroupLike, actorId: string, removedMemberId: string): NewNotification[] {
  return build(group, "member_removed", actorId, [removedMemberId], {
    ...groupMeta(group.name),
    removedMemberId,
  });
}

/** A member left the group. Notify active owners/admins. */
export function onMemberLeft(group: GroupLike, leaverId: string): NewNotification[] {
  return build(group, "member_left", leaverId, leaderIds(group.members), {
    ...groupMeta(group.name),
    leaverId,
  });
}

/** An owner changed a member's role. Notify the target member. */
export function onRoleChanged(group: GroupLike, actorId: string, targetUserId: string, role: string): NewNotification[] {
  return build(group, "role_changed", actorId, [targetUserId], {
    ...groupMeta(group.name),
    role,
  });
}

/** Ownership was transferred. Notify the new owner. */
export function onOwnershipTransferred(group: GroupLike, actorId: string, newOwnerId: string): NewNotification[] {
  return build(group, "ownership_transferred", actorId, [newOwnerId], {
    ...groupMeta(group.name),
  });
}

/** The group was archived. Notify every other active member. */
export function onGroupArchived(group: GroupLike, actorId: string): NewNotification[] {
  return build(group, "group_archived", actorId, activeMemberIds(group.members), {
    ...groupMeta(group.name),
  });
}

/** The group was restored (unarchived). Notify every other active member. */
export function onGroupRestored(group: GroupLike, actorId: string): NewNotification[] {
  return build(group, "group_restored", actorId, activeMemberIds(group.members), {
    ...groupMeta(group.name),
  });
}

export interface SettlementEventData {
  id: string;
  payerId: string;
  receiverId: string;
  amountMinor: number;
  currency: string;
}

/** A settlement was recorded. Notify the payer and receiver (except the actor). */
export function onSettlementRecorded(group: GroupLike, actorId: string, settlement: SettlementEventData): NewNotification[] {
  return build(group, "settlement_recorded", actorId, [settlement.payerId, settlement.receiverId], {
    ...groupMeta(group.name),
    settlementId: settlement.id,
    payerId: settlement.payerId,
    receiverId: settlement.receiverId,
    amountMinor: settlement.amountMinor,
    currency: settlement.currency,
  });
}