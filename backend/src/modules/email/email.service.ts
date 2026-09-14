/**
 * Outbound email via Resend. This is the only module that should know about
 * Resend. Everything upstream depends on the SendEmailInput contract.
 */
import { Resend } from "resend";
import { env } from "../../config/env.js";
import { ApiError } from "../../utils/ApiError.js";
import type { SendEmailInput } from "./email.types.js";

/**
 * Sends an email through Resend. Resolves when the provider has accepted the
 * message; throws otherwise. Never resolves for a rejected/failed send.
 */
export async function sendEmail(input: SendEmailInput): Promise<void> {
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