import { Types } from "mongoose";
import { ApiError } from "../../utils/ApiError.js";
import { Notification, type NotificationDocument } from "./notification.model.js";
import type { NewNotification, NotificationType, PublicNotification } from "./notification.types.js";
import type { PaginatedResult } from "../common/pagination.js";

export {
  activeMemberIds,
  leaderIds,
  onExpenseCreated,
  onGroupArchived,
  onGroupInvitation,
  onInvitationAccepted,
  onMemberLeft,
  onMemberRemoved,
  onOwnershipTransferred,
  onRoleChanged,
  onSettlementRecorded,
} from "./notification.events.js";

const toPublicNotification = (notification: NotificationDocument): PublicNotification => ({
  id: notification._id.toString(),
  type: notification.type,
  group: notification.group.toString(),
  actor: notification.actor.toString(),
  metadata: notification.metadata,
  read: notification.readAt !== null,
  readAt: notification.readAt ? notification.readAt.toISOString() : null,
  createdAt: notification.createdAt.toISOString(),
  updatedAt: notification.updatedAt.toISOString(),
});

/**
 * Persist resolved notification records. Exposed for tests/inspection;
 * business flows should use the fire-safe `notify` wrapper instead.
 */
export async function persistNotifications(items: NewNotification[]): Promise<PublicNotification[]> {
  if (items.length === 0) return [];

  const docs = (await Notification.insertMany(
    items.map((item) => ({
      recipient: new Types.ObjectId(item.recipientId),
      type: item.type,
      group: new Types.ObjectId(item.groupId),
      actor: new Types.ObjectId(item.actorId),
      metadata: item.metadata,
      readAt: null,
    })),
  )) as unknown as NotificationDocument[];

  return docs.map(toPublicNotification);
}

/**
 * Fire-safe notification generation. Notifications are lightweight and must
 * never fail the core mutation that triggered them, so failures are logged and
 * swallowed here.
 */
export async function notify(items: NewNotification[]): Promise<void> {
  if (items.length === 0) return;
  try {
    await persistNotifications(items);
  } catch (err) {
    console.error("[notifications] failed to persist notifications:", err);
  }
}

export interface NotificationListOptions {
  unreadOnly?: boolean;
  type?: NotificationType;
}

export async function listNotifications(
  userId: string,
  page: number,
  limit: number,
  skip: number,
  options: NotificationListOptions = {},
): Promise<PaginatedResult<PublicNotification>> {
  const filter: Record<string, unknown> = { recipient: new Types.ObjectId(userId) };
  if (options.unreadOnly) filter.readAt = null;
  if (options.type !== undefined) filter.type = options.type;

  const [total, docs] = await Promise.all([
    Notification.countDocuments(filter),
    Notification.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit),
  ]);

  return {
    items: (docs as unknown as NotificationDocument[]).map(toPublicNotification),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getUnreadCount(userId: string): Promise<number> {
  return Notification.countDocuments({ recipient: new Types.ObjectId(userId), readAt: null });
}

/** Mark a single notification read. Only the recipient may access it. Idempotent. */
export async function markNotificationRead(notificationId: string, userId: string): Promise<PublicNotification> {
  const notification = (await Notification.findOne({
    _id: notificationId,
    recipient: new Types.ObjectId(userId),
  })) as unknown as NotificationDocument | null;

  if (!notification) {
    throw new ApiError(404, "Notification not found");
  }

  if (notification.readAt === null) {
    notification.readAt = new Date();
    await notification.save();
  }

  return toPublicNotification(notification);
}

export async function markAllNotificationsRead(userId: string): Promise<{ modifiedCount: number }> {
  const result = await Notification.updateMany(
    { recipient: new Types.ObjectId(userId), readAt: null },
    { $set: { readAt: new Date() } },
  );
  return { modifiedCount: result.modifiedCount };
}