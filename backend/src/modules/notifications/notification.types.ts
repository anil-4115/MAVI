/**
 * H.8 Notification types.
 *
 * Notifications are lightweight, display-focused records generated from
 * existing group activity. They never replace authoritative financial records
 * (expenses/settlements); balances remain derived only from those.
 */
export const NOTIFICATION_TYPES = [
  "group_invitation",
  "invitation_accepted",
  "member_removed",
  "member_left",
  "role_changed",
  "ownership_transferred",
  "group_archived",
  "expense_created",
  "settlement_recorded",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Free-form, serializable, display-only payload (ids/amounts/names). */
export type NotificationMetadata = Record<string, unknown>;

/** A fully-resolved notification before persistence (pure event builders produce these). */
export interface NewNotification {
  recipientId: string;
  type: NotificationType;
  groupId: string;
  actorId: string;
  metadata: NotificationMetadata;
}

/** Safe, serialized notification. Never includes sensitive user fields. */
export interface PublicNotification {
  id: string;
  type: NotificationType;
  group: string;
  actor: string;
  metadata: NotificationMetadata;
  read: boolean;
  readAt: string | null;
  createdAt: string;
  updatedAt: string;
}