import {
  rateLimit,
  type RateLimitExceededEventHandler,
  type RateLimitRequestHandler,
} from "express-rate-limit";
import {
  RATE_LIMIT_AUTH_LOGIN_MAX,
  RATE_LIMIT_AUTH_REGISTER_MAX,
  RATE_LIMIT_AUTH_VERIFY_EMAIL_MAX,
  RATE_LIMIT_GENERAL_API_MAX,
  RATE_LIMIT_WINDOW_MS,
} from "../config/rateLimit.js";

/** Safe message. Never echoes request data, IPs, or internals. */
const RATE_LIMIT_MESSAGE = "Too many requests. Please try again later.";

export interface RateLimiterOptions {
  windowMs: number;
  authLoginMax: number;
  authRegisterMax: number;
  authVerifyEmailMax: number;
  generalApiMax: number;
}

export interface RateLimiters {
  authLogin: RateLimitRequestHandler;
  authRegister: RateLimitRequestHandler;
  authVerifyEmail: RateLimitRequestHandler;
  generalApi: RateLimitRequestHandler;
}

/** 429 handler — returns the standard MAVI error envelope, no internals. */
const tooManyRequestsHandler: RateLimitExceededEventHandler = (_req, res) => {
  res.status(429).json({ success: false, message: RATE_LIMIT_MESSAGE });
};

/**
 * Builds a fresh set of limiters. Each call creates independent in-memory
 * stores, so a new app (or test) never shares quota state with another.
 *
 * @param overrides  Optional per-limiter tuning (used by tests and future env
 *                   wiring). Defaults to the constants in config/rateLimit.js.
 * @param behindProxy Whether the app runs behind a trusted reverse proxy. Only
 *                   affects validation warnings, not counting. When the app is
 *                   NOT behind a proxy we disable the `xForwardedForHeader`
 *                   validation because a direct client may send a spoofed
 *                   X-Forwarded-For header; we never trust it in that case.
 */
export const createRateLimiters = (
  overrides: Partial<RateLimiterOptions> = {},
  behindProxy = false,
): RateLimiters => {
  const windowMs = overrides.windowMs ?? RATE_LIMIT_WINDOW_MS;

  const validate = behindProxy
    ? undefined
    : { xForwardedForHeader: false };

  const options = {
    windowMs,
    // RFC draft-6 standard headers expose explicit RateLimit-Limit/RateLimit-
    // Remaining/RateLimit-Reset values (single-line, easier to debug than the
    // draft-8 combined RateLimit header).
    standardHeaders: "draft-6" as const,
    legacyHeaders: true,
    validate,
    handler: tooManyRequestsHandler,
  };

  return {
    authLogin: rateLimit({
      ...options,
      limit: overrides.authLoginMax ?? RATE_LIMIT_AUTH_LOGIN_MAX,
    }),
    authRegister: rateLimit({
      ...options,
      limit: overrides.authRegisterMax ?? RATE_LIMIT_AUTH_REGISTER_MAX,
    }),
    authVerifyEmail: rateLimit({
      ...options,
      limit: overrides.authVerifyEmailMax ?? RATE_LIMIT_AUTH_VERIFY_EMAIL_MAX,
    }),
    generalApi: rateLimit({
      ...options,
      limit: overrides.generalApiMax ?? RATE_LIMIT_GENERAL_API_MAX,
    }),
  };
};