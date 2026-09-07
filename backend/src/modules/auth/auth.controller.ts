import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiError } from "../../utils/ApiError.js";
import { register as registerUser, login as loginUser, getProfileById } from "./auth.service.js";
import { validateLogin, validateRegistration } from "./auth.validation.js";

export const register = asyncHandler(async (req: Request, res: Response) => {
  const input = validateRegistration(req.body);
  const user = await registerUser(input);

  res.status(201).json({
    success: true,
    message: "Account created successfully",
    data: { user },
  });
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const input = validateLogin(req.body);
  const result = await loginUser(input);

  res.status(200).json({
    success: true,
    message: "Login successful",
    data: result,
  });
});

export const getMe = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new ApiError(401, "Authentication required");
  }

  const user = await getProfileById(req.user.id);

  res.status(200).json({
    success: true,
    message: "Profile retrieved successfully",
    data: { user },
  });
});