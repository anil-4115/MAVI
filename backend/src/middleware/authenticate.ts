import type { NextFunction, Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { verifyToken } from "../utils/jwt.js";
import { User } from "../modules/auth/auth.model.js";

export const authenticate = asyncHandler(async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    throw new ApiError(401, "Authentication required");
  }

  const token = header.slice("Bearer ".length).trim();
  if (!token) {
    throw new ApiError(401, "Authentication required");
  }

  const payload = verifyToken(token);

  const user = await User.findOne({ _id: payload.sub }).select("name email").lean();
  if (!user) {
    throw new ApiError(401, "Invalid or expired token");
  }

  req.user = { id: user._id.toString(), name: user.name, email: user.email };

  next();
});