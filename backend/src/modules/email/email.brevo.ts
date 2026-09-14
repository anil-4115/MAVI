/**
 * Pure Brevo payload builder. No env imports, no SDK client, no I/O — safe to
 * import in offline tests and self-tests. The only Brevo-adjacent detail here
 * is the request shape itself; auth and the HTTP call live in email.service.ts.
 */
import type { Brevo } from "@getbrevo/brevo";
import type { SendEmailInput } from "./email.types.js";

/** Display name shown to recipients as the sender. Brand constant. */
export const BREVO_SENDER_NAME = "MAVI";

/**
 * Maps the provider-agnostic SendEmailInput onto Brevo's send-transactional
 * email request. Subject, HTML and plain-text content are passed through
 * byte-for-byte; no re-escaping or alteration happens here.
 */
export function buildBrevoSmtpEmail(
  input: SendEmailInput,
  senderEmail: string,
): Brevo.SendTransacEmailRequest {
  return {
    sender: { email: senderEmail, name: BREVO_SENDER_NAME },
    to: [{ email: input.to }],
    subject: input.message.subject,
    htmlContent: input.message.html,
    textContent: input.message.text,
  };
}