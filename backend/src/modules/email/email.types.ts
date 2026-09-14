/**
 * Email module contract. The rest of MAVI depends on these types, not on
 * Resend. Resend-specific details live only in email.service.ts.
 */

export interface EmailMessage {
  subject: string;
  text: string;
  html: string;
}

export interface SendEmailInput {
  to: string;
  message: EmailMessage;
}