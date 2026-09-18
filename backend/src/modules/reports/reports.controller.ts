import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiError } from "../../utils/ApiError.js";
import { requireObjectId } from "../common/guard.js";
import type { ReportScope } from "./reports.types.js";
import {
  getReportSummary,
  parseReportRange,
  parseReportScope,
} from "./reports.service.js";

const requireUser = (req: Request): string => {
  if (!req.user) {
    throw new ApiError(401, "Authentication required");
  }
  return req.user.id;
};

export const getReportSummaryController = asyncHandler(async (req: Request, res: Response) => {
  const actorId = requireUser(req);

  const scopeProvided = req.query.scope !== undefined;
  const rawScope = parseReportScope(req.query.scope);
  if (scopeProvided && rawScope === null) {
    throw new ApiError(400, "scope must be all, group or personal");
  }
  let scope: ReportScope = rawScope ?? "all";

  const rawGroupId = typeof req.query.groupId === "string" ? req.query.groupId.trim() : "";
  let groupId: string | null = null;
  if (rawGroupId !== "") {
    groupId = requireObjectId(rawGroupId, "Group ID");
    if (scopeProvided && scope !== "group") {
      throw new ApiError(400, "groupId can only be combined with scope=group");
    }
    // A group filter always means group scope (never personal spending).
    scope = "group";
  } else if (scope === "group") {
    throw new ApiError(400, "scope=group requires a groupId");
  }

  const range = parseReportRange(req.query.from, req.query.to);
  if (range === null) {
    throw new ApiError(400, "from and to must both be valid dates in YYYY-MM-DD format");
  }

  const data = await getReportSummary(actorId, { scope, groupId, range });

  res.status(200).json({ success: true, message: "Report retrieved successfully", data });
});