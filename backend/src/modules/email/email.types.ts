/**
 * Email module contract. The rest of MAVI depends on these types, not on any
 * specific provider. Provider-specific details live only in email.service.ts
 * and email.brevo.ts.
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