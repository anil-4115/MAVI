import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiError } from "../../utils/ApiError.js";
import { requireObjectId } from "../common/guard.js";
import { parsePagination } from "../common/pagination.js";
import {
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "./notification.service.js";
import { parseNotificationStatusFilter, parseNotificationTypeFilter } from "./notification.validation.js";

const requireUser = (req: Request): string => {
  if (!req.user) {
    throw new ApiError(401, "Authentication required");
  }
  return req.user.id;
};

export const list = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUser(req);
  const { page, limit, skip } = parsePagination(req.query as Record<string, unknown>);
  const status = parseNotificationStatusFilter((req.query as Record<string, unknown>).status);
  const type = parseNotificationTypeFilter((req.query as Record<string, unknown>).type);
  const result = await listNotifications(userId, page, limit, skip, {
    unreadOnly: status === "unread",
    type,
  });

  res.status(200).json({ success: true, message: "Notifications retrieved successfully", data: result });
});

export const unreadCount = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUser(req);
  const count = await getUnreadCount(userId);

  res.status(200).json({ success: true, message: "Unread notification count retrieved", data: { count } });
});

export const markRead = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUser(req);
  const notificationId = requireObjectId(req.params.notificationId, "Notification ID");
  const notification = await markNotificationRead(notificationId, userId);

  res.status(200).json({ success: true, message: "Notification marked as read", data: { notification } });
});

export const markAllRead = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUser(req);
  const result = await markAllNotificationsRead(userId);

  res.status(200).json({ success: true, message: "All notifications marked as read", data: result });
});