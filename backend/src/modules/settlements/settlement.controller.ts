import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiError } from "../../utils/ApiError.js";
import { requireObjectId } from "../common/guard.js";
import { parsePagination } from "../common/pagination.js";
import { cancelSettlement, createSettlement, listSettlements } from "./settlement.service.js";
import { parseSettlementStatusFilter, validateCreateSettlement } from "./settlement.validation.js";

const requireUser = (req: Request): string => {
  if (!req.user) {
    throw new ApiError(401, "Authentication required");
  }
  return req.user.id;
};

export const create = asyncHandler(async (req: Request, res: Response) => {
  const actorId = requireUser(req);
  const groupId = requireObjectId(req.params.groupId, "Group ID");
  const input = validateCreateSettlement(req.body);
  const settlement = await createSettlement(groupId, actorId, input);

  res.status(201).json({ success: true, message: "Settlement recorded successfully", data: { settlement } });
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  const actorId = requireUser(req);
  const groupId = requireObjectId(req.params.groupId, "Group ID");
  const { page, limit, skip } = parsePagination(req.query as Record<string, unknown>);
  const status = parseSettlementStatusFilter((req.query as Record<string, unknown>).status);
  const result = await listSettlements(groupId, actorId, page, limit, skip, status);

  res.status(200).json({ success: true, message: "Settlements retrieved successfully", data: result });
});

export const cancel = asyncHandler(async (req: Request, res: Response) => {
  const actorId = requireUser(req);
  const groupId = requireObjectId(req.params.groupId, "Group ID");
  const settlementId = requireObjectId(req.params.settlementId, "Settlement ID");
  const settlement = await cancelSettlement(groupId, settlementId, actorId);

  res.status(200).json({ success: true, message: "Settlement cancelled", data: { settlement } });
});