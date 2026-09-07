import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiError } from "../../utils/ApiError.js";
import { requireObjectId } from "../common/guard.js";
import { getGroupBalances } from "./balances.service.js";
import { getDashboard } from "./dashboard.service.js";

const requireUser = (req: Request): string => {
  if (!req.user) {
    throw new ApiError(401, "Authentication required");
  }
  return req.user.id;
};

export const getGroupBalancesController = asyncHandler(async (req: Request, res: Response) => {
  const actorId = requireUser(req);
  const groupId = requireObjectId(req.params.groupId, "Group ID");
  const data = await getGroupBalances(groupId, actorId);

  res.status(200).json({ success: true, message: "Balances retrieved successfully", data });
});

export const getDashboardController = asyncHandler(async (req: Request, res: Response) => {
  const actorId = requireUser(req);
  const data = await getDashboard(actorId);

  res.status(200).json({ success: true, message: "Dashboard retrieved successfully", data });
});