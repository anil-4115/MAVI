import { Router } from "express";
import type { RateLimiters } from "../../middleware/rateLimiters.js";
import { authenticate } from "../../middleware/authenticate.js";
import {
  forgotPassword,
  getMe,
  login,
  register,
  resetPassword,
  verifyEmail,
} from "./auth.controller.js";

export const buildAuthRouter = (limiters: RateLimiters): Router => {
  const router = Router();

  // Stricter limits for the user-controlled, unauthenticated auth surface.
  router.post("/register", limiters.authRegister, register);
  router.post("/login", limiters.authLogin, login);
  router.get("/verify-email", limiters.authVerifyEmail, verifyEmail);
  router.post("/forgot-password", limiters.authForgotPassword, forgotPassword);
  router.post("/reset-password", limiters.authResetPassword, resetPassword);

  // Authenticated profile endpoint falls under the general API limiter.
  router.get("/me", limiters.generalApi, authenticate, getMe);

  return router;
};