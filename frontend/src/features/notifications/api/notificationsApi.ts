import type { ApiEnvelope, PaginatedResult } from "../../../lib/types";
import api from "../../../services/api";

/**
 * Notification API types mirror the backend H.8 contract
 * (backend/src/modules/notifications/notification.types.ts). The event type
 * enum is authoritative on the backend — the frontend only renders the values
 * the backend defines.
 */

export const NOTIFICATION_TYPES = [
  "group_invitation",
  "invitation_accepted",
  "member_removed",
  "member_left",
  "role_changed",
  "ownership_transferred",
  "group_archived",
  "group_restored",
  "expense_created",
  "settlement_recorded",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export type NotificationStatusFilter = "all" | "unread";

export type NotificationMetadata = Record<string, unknown>;

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

export interface ListNotificationsParams {
  page?: number;
  limit?: number;
  status?: NotificationStatusFilter;
  type?: NotificationType;
}

type NotificationsResponse = ApiEnvelope<PaginatedResult<PublicNotification>>;
type UnreadCountResponse = ApiEnvelope<{ count: number }>;
type NotificationResponse = ApiEnvelope<{ notification: PublicNotification }>;
type ReadAllResponse = ApiEnvelope<{ modifiedCount: number }>;

export const listNotifications = async (
  params: ListNotificationsParams = {}
): Promise<PaginatedResult<PublicNotification>> => {
  const response = await api.get<NotificationsResponse>("/notifications", { params });
  return response.data.data;
};

export const getUnreadCount = async (): Promise<number> => {
  const response = await api.get<UnreadCountResponse>("/notifications/unread-count");
  return response.data.data.count;
};

export const markNotificationRead = async (
  notificationId: string
): Promise<PublicNotification> => {
  const response = await api.patch<NotificationResponse>(
    `/notifications/${notificationId}/read`
  );
  return response.data.data.notification;
};

export const markAllNotificationsRead = async (): Promise<number> => {
  const response = await api.patch<ReadAllResponse>("/notifications/read-all");
  return response.data.data.modifiedCount;
};