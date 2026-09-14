/**
 * Rate-limit tuning knobs. Keep every limit here so the numbers have a single
 * source of truth. All windows are per client IP address.
 *
 * Normal usage guidance:
 * - The frontend performs several API calls per page view (groups, balances,
 *   settlements, notifications, ...). The general limit is high enough for a
 *   busy human session while still stopping scripted flooding.
 * - Auth endpoints are the primary automated-attack surface, so they get
 *   tighter budgets than the general API.
 */
export const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

/** POST /api/auth/login */
export const RATE_LIMIT_AUTH_LOGIN_MAX = 10;

/** POST /api/auth/register */
export const RATE_LIMIT_AUTH_REGISTER_MAX = 8;

/** GET /api/auth/verify-email */
export const RATE_LIMIT_AUTH_VERIFY_EMAIL_MAX = 20;

/**
 * POST /api/auth/forgot-password. Tighter than login/register: it can
 * generate provider email traffic and is a spam/enumeration surface.
 */
export const RATE_LIMIT_AUTH_FORGOT_PASSWORD_MAX = 5;

/** POST /api/auth/reset-password. Token guesses are cheap, so budget limited. */
export const RATE_LIMIT_AUTH_RESET_PASSWORD_MAX = 5;

/** All remaining /api routes (users, groups, expenses, balances, settlements, notifications, analytics). */
export const RATE_LIMIT_GENERAL_API_MAX = 600;