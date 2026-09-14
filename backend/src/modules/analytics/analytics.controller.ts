import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiError } from "../../utils/ApiError.js";
import {
  currentMonthUtc,
  getSpendingAnalytics,
  VALID_MONTH_PATTERN,
} from "./analytics.service.js";

const requireUser = (req: Request): string => {
  if (!req.user) {
    throw new ApiError(401, "Authentication required");
  }
  return req.user.id;
};

export const getSpendingAnalyticsController = asyncHandler(
  async (req: Request, res: Response) => {
    const actorId = requireUser(req);
    const rawMonth = typeof req.query.month === "string" ? req.query.month.trim() : "";
    if (rawMonth !== "" && !VALID_MONTH_PATTERN.test(rawMonth)) {
      throw new ApiError(400, "month must be in YYYY-MM format");
    }
    const month = rawMonth === "" ? currentMonthUtc() : rawMonth;
    const data = await getSpendingAnalytics(actorId, month);

    res.status(200).json({ success: true, message: "Spending analytics retrieved successfully", data });
  }
);