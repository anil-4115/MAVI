/**
 * Password-reset domain logic.
 *
 * Security notes:
 * - Tokens are cryptographically random (node:crypto), never Math.random().
 * - Only the SHA-256 token hash is persisted; the raw token lives only long
 *   enough to build the email URL.
 * - Token lifetime is 1 hour (RESET_TOKEN_TTL_MS).
 * - The reset token is consumed atomically: update filters on the still-active
 *   hash, so a token can never be used twice even under concurrency.
 * - Forgot-password never reveals whether an email exists: the controller
 *   returns one generic envelope for known and unknown accounts alike.
 * - MAVI uses stateless JWTs (no token version, no server-side session store),
 *   so there is no safe way to revoke already-issued JWTs here. A successful
 *   reset rotates the passwordHash and clears the lockout/counter; that is the
 *   strongest invalidation the current architecture supports cleanly. Existing
 *   JWTs remain valid until natural expiry — documented limitation, not
 *   redesigned on purpose.
 */
import bcrypt from "bcryptjs";
import { env } from "../../config/env.js";
import { ApiError } from "../../utils/ApiError.js";
import { User } from "./auth.model.js";
import { BCRYPT_ROUNDS } from "./auth.service.js";
import { buildPasswordResetEmail } from "../email/email.template.js";
import { sendEmail } from "../email/email.service.js";
import type { SendEmailInput } from "../email/email.types.js";
import {
  RESET_TOKEN_TTL_HOURS,
  generateResetToken,
  getResetExpiry,
  hashToken,
  isTokenExpired,
} from "./token-utils.js";

export type EmailSendFunction = (input: SendEmailInput) => Promise<void>;

const defaultSender: EmailSendFunction = (input) => sendEmail(input);

export function buildPasswordResetUrl(rawToken: string): string {
  return `${env.frontendUrl.replace(/\/+$/, "")}/reset-password?token=${encodeURIComponent(rawToken)}`;
}

export interface PasswordResetEmailContext {
  user: { id: string; email: string; name: string };
  rawToken: string;
  expiresAt: Date;
}

export interface ForgotPasswordResult {
  /** True only when a matching account existed and the provider accepted the email. */
  resetEmailSent: boolean;
}

/** Bcrypt work done in the "unknown email" branch so responses do not reveal the DB hit. */
const TIMING_EQUALIZER_SALT = "mavi-timing-equalization";

/**
 * Handles a forgot-password request. The returned result is intentionally NOT
 * sufficient to distinguish existing vs missing accounts at the API layer — the
 * controller always replies with the same generic envelope.
 *
 * @param deps.send Injectable for tests (e.g. a recorder); never required in
 *        production code paths.
 */
export async function requestPasswordReset(
  email: string,
  deps: { send?: EmailSendFunction } = {},
): Promise<ForgotPasswordResult> {
  const send = deps.send ?? defaultSender;

  const user = await User.findOne({ email }).select("name email").lean();

  if (!user) {
    // Burn equivalent bcrypt work so the response timing does not trivially
    // broadcast whether the account exists.
    await bcrypt.hash(TIMING_EQUALIZER_SALT, BCRYPT_ROUNDS);
    return { resetEmailSent: false };
  }

  const rawToken = generateResetToken();
  const expiresAt = getResetExpiry();

  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        passwordResetTokenHash: hashToken(rawToken),
        passwordResetTokenExpiresAt: expiresAt,
      },
    },
  );

  const resetUrl = buildPasswordResetUrl(rawToken);
  const message = buildPasswordResetEmail({
    toName: user.name,
    resetUrl,
    expiryHours: RESET_TOKEN_TTL_HOURS,
  });

  let resetEmailSent = false;
  try {
    await send({ to: user.email, message });
    resetEmailSent = true;
  } catch (error) {
    // Provider rejection must never leak to the frontend or topple the request.
    // The safe message never contains provider details, secrets, or tokens.
    console.error(
      "Password reset email could not be sent:",
      error instanceof Error ? error.message : String(error),
    );
  }

  return { resetEmailSent };
}

/**
 * Consumes a reset token and rotates the password.
 *
 * - missing/unknown/expired token → ApiError 400 with a safe client message.
 * - success is atomic: the update only matches while the token hash is still the
 *   active one and unexpired, so a consumed token can never be reused.
 */
export async function resetPassword(rawToken: string, newPassword: string): Promise<void> {
  const tokenHash = hashToken(rawToken);
  const now = new Date();

  const user = await User.findOne({
    passwordResetTokenHash: tokenHash,
    passwordResetTokenExpiresAt: { $gt: now },
  }).select("_id");

  if (!user) {
    throw new ApiError(400, "Reset link is invalid or has expired.");
  }

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

  const consumed = await User.findOneAndUpdate(
    {
      _id: user._id,
      passwordResetTokenHash: tokenHash,
      passwordResetTokenExpiresAt: { $gt: now },
    },
    {
      $set: {
        passwordHash,
        passwordResetTokenHash: null,
        passwordResetTokenExpiresAt: null,
        failedLoginAttempts: 0,
        accountLockedUntil: null,
      },
    },
    { returnDocument: "after" },
  );

  if (!consumed) {
    throw new ApiError(400, "Reset link is invalid or has expired.");
  }
}

export { isTokenExpired };