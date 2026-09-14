/**
 * Outbound email via Brevo (currently the active provider). This is the only
 * module that should know about Brevo. Everything upstream depends on the
 * SendEmailInput contract.
 *
 * The legacy Resend path is retained (sendEmailViaResend) while the migration
 * is in progress but is not wired to the default sender.
 */
import { BrevoClient, BrevoError, BrevoTimeoutError } from "@getbrevo/brevo";
import { Resend } from "resend";
import { env } from "../../config/env.js";
import { ApiError } from "../../utils/ApiError.js";
import type { SendEmailInput } from "./email.types.js";
import { buildBrevoSmtpEmail } from "./email.brevo.js";

/** Max length of a provider error snippet extracted from the response body. */
const MAX_BREVO_ERROR_SNIPPET = 500;

type FailureCategory =
  | "timeout"
  | "auth"
  | "forbidden"
  | "invalid_parameter"
  | "not_found"
  | "rate_limited"
  | "provider_error"
  | "unknown";

const categoryForStatus = (statusCode: number): FailureCategory => {
  if (statusCode === 401) return "auth";
  if (statusCode === 403) return "forbidden";
  if (statusCode === 400 || statusCode === 422) return "invalid_parameter";
  if (statusCode === 404) return "not_found";
  if (statusCode === 429) return "rate_limited";
  if (statusCode >= 500) return "provider_error";
  return "unknown";
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" ? (value as Record<string, unknown>) : null;

const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/**
 * Sanitizes a provider-supplied error snippet: trims, truncates, and redacts
 * anything that could look like an email address or the configured API key so
 * the diagnostic never echoes secrets or user contact data unnecessarily.
 */
function sanitizeErrorSnippet(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  let trimmed = value.trim();
  if (trimmed === "") return undefined;

  if (env.brevoApiKey && env.brevoApiKey.length > 0) {
    trimmed = trimmed.split(env.brevoApiKey).join("[api-key redacted]");
  }
  trimmed = trimmed.replace(EMAIL_PATTERN, "[email redacted]");

  if (trimmed.length > MAX_BREVO_ERROR_SNIPPET) {
    trimmed = `${trimmed.slice(0, MAX_BREVO_ERROR_SNIPPET)}…`;
  }
  return trimmed;
}

/**
 * Logs a SAFE diagnostic when the Brevo API request fails. Only ever emits the
 * provider name, an HTTP status code, Brevo's structured error code/message
 * (sanitized + truncated), an opaque request id, or a generic fallback — never
 * the API key, JWT, Mongo URI, auth headers, request payload, verification
 * token, or the email content.
 */
function logBrevoFailure(error: unknown): void {
  const diagnostic: Record<string, unknown> = { provider: "Brevo" };

  if (error instanceof BrevoTimeoutError) {
    diagnostic.failureType = "timeout";
  } else if (error instanceof BrevoError) {
    if (typeof error.statusCode === "number") {
      diagnostic.failureType = categoryForStatus(error.statusCode);
      diagnostic.statusCode = error.statusCode;
    }
    const body = asRecord(error.body);
    const code = sanitizeErrorSnippet(body?.code);
    const message = sanitizeErrorSnippet(body?.message);
    if (code) diagnostic.brevoCode = code;
    if (message) diagnostic.brevoMessage = message;
    if (typeof error.requestId === "string" && error.requestId !== "") {
      diagnostic.requestId = error.requestId;
    }
  } else {
    diagnostic.failureType = error instanceof Error ? error.name : "unknown";
  }

  if (!diagnostic.statusCode && !diagnostic.brevoCode && !diagnostic.brevoMessage) {
    diagnostic.detail = "Brevo request failed without a structured provider error";
  }

  console.error("Brevo transactional email failed:", diagnostic);
}

/**
 * Sends an email through Brevo. Resolves when the provider has accepted the
 * message; throws otherwise. Never resolves for a rejected/failed send.
 */
export async function sendEmail(input: SendEmailInput): Promise<void> {
  if (!env.brevoApiKey) {
    // No key configured: fail locally instead of making a doomed external
    // request. Callers treat this exactly like a provider rejection.
    throw new ApiError(500, "Email could not be sent");
  }

  const client = new BrevoClient({ apiKey: env.brevoApiKey });

  try {
    await client.transactionalEmails.sendTransacEmail(
      buildBrevoSmtpEmail(input, env.emailFrom),
    );
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    logBrevoFailure(error);
    throw new ApiError(500, "Email could not be sent");
  }
}

/**
 * Legacy Resend sender, retained while the migration to Brevo is in progress.
 * Not wired to the default sendEmail path. Preserves the original semantics:
 * resolves only when the provider accepts the message, throws otherwise.
 */
export async function sendEmailViaResend(input: SendEmailInput): Promise<void> {
  const resend = new Resend(env.resendApiKey);
  const { error } = await resend.emails.send({
    from: env.emailFrom,
    to: input.to,
    subject: input.message.subject,
    html: input.message.html,
    text: input.message.text,
  });

  if (error) {
    throw new ApiError(500, "Email could not be sent");
  }
}