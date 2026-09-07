import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiError } from "../../utils/ApiError.js";
import { getProfileById, searchUsers, updateProfile } from "./users.service.js";
import { validateUpdateProfile } from "./users.validation.js";
import { requireObjectId } from "../common/guard.js";

export const search = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new ApiError(401, "Authentication required");
  }

  const query = typeof req.query.q === "string" ? req.query.q : "";
  const results = await searchUsers(query, req.user.id);

  res.status(200).json({
    success: true,
    message: "Search completed",
    data: { users: results },
  });
});

export const getProfile = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireObjectId(req.params.userId, "User ID");
  const user = await getProfileById(userId);

  res.status(200).json({
    success: true,
    message: "Profile retrieved successfully",
    data: { user },
  });
});

export const updateMe = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new ApiError(401, "Authentication required");
  }

  const input = validateUpdateProfile(req.body);
  const user = await updateProfile({ userId: req.user.id, name: input.name });

  res.status(200).json({
    success: true,
    message: "Profile updated successfully",
    data: { user },
  });
});
