import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiError } from "../../utils/ApiError.js";
import { register as registerUser, login as loginUser, getProfileById } from "./auth.service.js";
import {
  validateForgotPassword,
  validateLogin,
  validateRegistration,
  validateResetPassword,
} from "./auth.validation.js";
import { verifyEmailToken } from "./verification.service.js";
import {
  requestPasswordReset,
  resetPassword as resetPasswordService,
} from "./passwordReset.service.js";

export const register = asyncHandler(async (req: Request, res: Response) => {
  const input = validateRegistration(req.body);
  const result = await registerUser(input);
  const message = result.verificationEmailSent
    ? "Account created. Check your email to verify your account."
    : "Account created. We could not send the verification email right now — please try again later.";

  res.status(201).json({
    success: true,
    message,
    data: { user: result.user },
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

export const verifyEmail = asyncHandler(async (req: Request, res: Response) => {
  const token = typeof req.query.token === "string" ? req.query.token.trim() : "";
  if (!token) {
    throw new ApiError(400, "Verification token is required.");
  }

  const result = await verifyEmailToken(token);

  res.status(200).json({
    success: true,
    message: result.message,
    data: { emailVerified: result.status === "verified" },
  });
});

export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  const input = validateForgotPassword(req.body);
  await requestPasswordReset(input.email);

  // Always the same generic envelope — never reveals whether the account exists.
  res.status(200).json({
    success: true,
    message: "If an account exists with that email, a password reset link has been sent.",
    data: { ok: true },
  });
});

export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  const input = validateResetPassword(req.body);
  await resetPasswordService(input.token, input.password);

  res.status(200).json({
    success: true,
    message: "Password reset successful. You can now sign in with your new password.",
    data: { ok: true },
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