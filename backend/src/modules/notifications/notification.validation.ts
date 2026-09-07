import { ApiError } from "../../utils/ApiError.js";
import type { NotificationType } from "./notification.types.js";
import { NOTIFICATION_TYPES } from "./notification.types.js";

export type NotificationStatusFilter = "all" | "unread";

/** Optional `?status=all|unread` on the list endpoint (default all). */
export function parseNotificationStatusFilter(value: unknown): NotificationStatusFilter {
  if (value === undefined || value === null || value === "") return "all";
  if (value !== "all" && value !== "unread") {
    throw new ApiError(400, "status must be 'all' or 'unread'");
  }
  return value;
}

/** Optional `?type=<notification type>` on the list endpoint. */
export function parseNotificationTypeFilter(value: unknown): NotificationType | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !NOTIFICATION_TYPES.includes(value as NotificationType)) {
    throw new ApiError(400, `type must be one of: ${NOTIFICATION_TYPES.join(", ")}`);
  }
  return value as NotificationType;
}