/**
 * Email-verification domain logic.
 *
 * Security notes:
 * - Tokens are cryptographically random (node:crypto), never Math.random().
 * - Only the SHA-256 token hash is persisted; the raw token lives only long
 *   enough to build the email URL.
 * - Consumed token hashes are kept so re-clicking a used link is idempotent
 *   ("already verified") while the active hash is cleared.
 * - The signup email is sent exactly once per account: verificationEmailSentAt
 *   is only persisted after the provider accepts the message, and a fresh DB
 *   read guards every send attempt (backend is the final authority).
 */
import { env } from "../../config/env.js";
import { ApiError } from "../../utils/ApiError.js";
import { User } from "./auth.model.js";
import { buildVerificationEmail } from "../email/email.template.js";
import { sendEmail } from "../email/email.service.js";
import type { SendEmailInput } from "../email/email.types.js";
import {
  TOKEN_TTL_HOURS,
  generateVerificationToken,
  getVerificationExpiry,
  hashToken,
  isTokenExpired,
} from "./token-utils.js";

export {
  generateVerificationToken,
  getVerificationExpiry,
  hashToken,
  isTokenExpired,
};

export function buildVerificationUrl(rawToken: string): string {
  return `${env.frontendUrl.replace(/\/+$/, "")}/verify-email?token=${encodeURIComponent(rawToken)}`;
}

export interface SignupEmailContext {
  user: { id: string; email: string; name: string };
  rawToken: string;
  expiresAt: Date;
}

export type EmailSendFunction = (input: SendEmailInput) => Promise<void>;

const defaultSender: EmailSendFunction = (input) => sendEmail(input);

/**
 * Sends the signup verification email at most once per account. Asserts fresh
 * from the DB before sending and only claims `verificationEmailSentAt` after
 * the provider accepted the message.
 *
 * @param deps.send Injectable for tests (e.g. a recorder); never required in
 *        production code paths.
 */
export async function sendSignupEmailOnce(
  context: SignupEmailContext,
  deps: { send?: EmailSendFunction } = {},
): Promise<boolean> {
  const send = deps.send ?? defaultSender;

  const current = await User.findById(context.user.id).select("verificationEmailSentAt").lean();
  if (current?.verificationEmailSentAt) {
    return false;
  }

  const verificationUrl = buildVerificationUrl(context.rawToken);
  const message = buildVerificationEmail({
    toName: context.user.name,
    verificationUrl,
    expiryHours: TOKEN_TTL_HOURS,
  });

  await send({ to: context.user.email, message });

  const claimed = await User.updateOne(
    { _id: context.user.id, verificationEmailSentAt: null },
    { $set: { verificationEmailSentAt: new Date() } },
  );
  return claimed.modifiedCount > 0;
}

export type VerifyEmailResult = {
  status: "verified" | "already_verified";
  message: string;
};

/**
 * Verifies an email token. Safe to call repeatedly:
 * - valid, unverified token -> verifies the account (clears active token)
 * - valid, already verified token -> idempotent "already verified"
 * - previously-consumed token -> idempotent "already verified"
 * - unknown/expired token -> ApiError 400
 */
export async function verifyEmailToken(rawToken: string): Promise<VerifyEmailResult> {
  const tokenHash = hashToken(rawToken);

  const user = await User.findOne({ verificationTokenHash: tokenHash }).select(
    "+emailVerified +verificationTokenHash +verifiedTokenHashes",
  );

  if (!user) {
    const consumed = await User.exists({ verifiedTokenHashes: tokenHash });
    if (consumed) {
      return { status: "already_verified", message: "Account is already verified." };
    }
    throw new ApiError(400, "Verification link is invalid or has expired.");
  }

  if (user.emailVerified) {
    return { status: "already_verified", message: "Account is already verified." };
  }

  if (isTokenExpired(user.verificationTokenExpiresAt)) {
    throw new ApiError(400, "Verification link is invalid or has expired.");
  }

  user.emailVerified = true;
  user.verificationTokenHash = null;
  user.verificationTokenExpiresAt = null;
  user.verifiedTokenHashes = [...(user.verifiedTokenHashes ?? []), tokenHash];
  await user.save();

  return { status: "verified", message: "Email verified successfully." };
}