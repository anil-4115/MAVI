/**
 * Pure email-template builder. No Resend or DB imports.
 * Safe to import in tests, self-tests, and the server alike.
 */
import type { EmailMessage } from "./email.types.js";

interface BuildVerificationEmailInput {
  /** Recipient display name (used for personalisation). */
  toName: string;
  /** Absolute verification URL containing the raw token. */
  verificationUrl: string;
  /** Number of hours until the link expires. */
  expiryHours: number;
}

interface BuildPasswordResetEmailInput {
  /** Recipient display name (used for personalisation). */
  toName: string;
  /** Absolute password-reset URL containing the raw token. */
  resetUrl: string;
  /** Number of hours until the link expires. */
  expiryHours: number;
}

const stripHtml = (html: string): string =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&\w+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const ESCAPE_HTML = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export function buildVerificationEmail(input: BuildVerificationEmailInput): EmailMessage {
  const { toName, verificationUrl, expiryHours } = input;
  const safeName = ESCAPE_HTML(toName || "there");
  const safeUrl = ESCAPE_HTML(verificationUrl);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Verify your MAVI account</title>
</head>
<body style="margin:0;padding:0;background:#0b0a13;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#d4d0e8">
<!-- Preheader (hidden text for preview panes) -->
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all">
Verify your email to get started with MAVI.
&#8199;&#65279;&#847;<!-- zero-width space so Gmail shows this -->
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0a13">
<tr><td align="center" style="padding:48px 16px 40px">
<table role="presentation" width="540" cellpadding="0" cellspacing="0" class="container" style="max-width:540px;width:100%">
<!-- Card -->
<tr><td style="background:#1a1827;border-radius:16px;border:1px solid rgba(255,255,255,.06);padding:40px 36px 36px">
<!-- Brand -->
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="width:44px;height:44px;background:linear-gradient(135deg,#8a50ff,#6c3ce0);border-radius:12px;text-align:center;vertical-align:middle;font-size:22px;font-weight:700;color:#fff">
M
</td>
<td style="padding-left:12px;font-size:20px;font-weight:700;color:#f0ecff;letter-spacing:-.02em">
MAVI
</td>
</tr></table>

<p style="margin:32px 0 0;font-size:24px;font-weight:700;color:#f0ecff;line-height:1.25">Verify your email</p>
<p style="margin:8px 0 0;font-size:15px;color:#a5a0c0">Welcome to MAVI — Split Smarter. Together.</p>

<p style="margin:28px 0 0;font-size:15px;color:#d4d0e8;line-height:1.6">
Hi ${safeName},
</p>
<p style="margin:16px 0 0;font-size:15px;color:#d4d0e8;line-height:1.6">
Thanks for creating your MAVI account. Please verify your email address to get started.
</p>

<!-- Button -->
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:32px 0 0">
<tr>
<td align="center" style="background:linear-gradient(135deg,#8a50ff,#6c3ce0);border-radius:12px;padding:0">
<a href="${safeUrl}" target="_blank" style="display:inline-block;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;padding:14px 32px">
Verify my email
</a>
</td>
</tr>
</table>

<p style="margin:24px 0 0;font-size:13px;color:#6e6a8a;line-height:1.5">
If the button doesn&apos;t work, copy and paste this link into your browser:
</p>
<p style="margin:8px 0 0;font-size:13px;color:#a7a2c0;word-break:break-all;line-height:1.5">
<a href="${safeUrl}" target="_blank" style="color:#a7a2c0;text-decoration:underline">${safeUrl}</a>
</p>

<p style="margin:28px 0 0;font-size:13px;color:#6e6a8a;line-height:1.5">
This link expires in ${expiryHours} hour${expiryHours === 1 ? "" : "s"}.
If you didn&apos;t create a MAVI account, you can safely ignore this email.
</p>

</td></tr><!-- /card -->

<!-- Footer -->
<tr><td style="padding:24px 0 0;font-size:12px;color:#4e4a6a;text-align:center">
&copy; ${new Date().getFullYear()} MAVI. All rights reserved.
</td></tr>
</table>
</td></tr>
</table>

<style>
@media only screen and (max-width:600px){
.container{width:100%!important;padding:12px!important}
td[style*="padding:40px 36px 36px"]{padding:28px 20px 24px!important}
}
</style>
</body>
</html>`;

  const text = stripHtml(`Verify your email

Hi ${safeName},

Thanks for creating your MAVI account. Please verify your email address to get started.

Verify my email: ${verificationUrl}

This link expires in ${expiryHours} hour${expiryHours === 1 ? "" : "s"}.
If you didn't create a MAVI account, you can safely ignore this email.`);

  return {
    subject: "Verify your MAVI account",
    text,
    html,
  };
}

export function buildPasswordResetEmail(input: BuildPasswordResetEmailInput): EmailMessage {
  const { toName, resetUrl, expiryHours } = input;
  const safeName = ESCAPE_HTML(toName || "there");
  const safeUrl = ESCAPE_HTML(resetUrl);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Reset your MAVI password</title>
</head>
<body style="margin:0;padding:0;background:#0b0a13;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#d4d0e8">
<!-- Preheader (hidden text for preview panes) -->
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all">
We received a request to reset your MAVI password.
&#8199;&#65279;&#847;<!-- zero-width space so Gmail shows this -->
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0a13">
<tr><td align="center" style="padding:48px 16px 40px">
<table role="presentation" width="540" cellpadding="0" cellspacing="0" class="container" style="max-width:540px;width:100%">
<!-- Card -->
<tr><td style="background:#1a1827;border-radius:16px;border:1px solid rgba(255,255,255,.06);padding:40px 36px 36px">
<!-- Brand -->
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="width:44px;height:44px;background:linear-gradient(135deg,#8a50ff,#6c3ce0);border-radius:12px;text-align:center;vertical-align:middle;font-size:22px;font-weight:700;color:#fff">
M
</td>
<td style="padding-left:12px;font-size:20px;font-weight:700;color:#f0ecff;letter-spacing:-.02em">
MAVI
</td>
</tr></table>

<p style="margin:32px 0 0;font-size:24px;font-weight:700;color:#f0ecff;line-height:1.25">Reset your password</p>
<p style="margin:8px 0 0;font-size:15px;color:#a5a0c0">We received a request to reset the password for your MAVI account.</p>

<p style="margin:28px 0 0;font-size:15px;color:#d4d0e8;line-height:1.6">
Hi ${safeName},
</p>
<p style="margin:16px 0 0;font-size:15px;color:#d4d0e8;line-height:1.6">
No action is needed if you didn&apos;t request this — your password will not change.
</p>

<!-- Button -->
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:32px 0 0">
<tr>
<td align="center" style="background:linear-gradient(135deg,#8a50ff,#6c3ce0);border-radius:12px;padding:0">
<a href="${safeUrl}" target="_blank" style="display:inline-block;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;padding:14px 32px">
Reset my password
</a>
</td>
</tr>
</table>

<p style="margin:24px 0 0;font-size:13px;color:#6e6a8a;line-height:1.5">
If the button doesn&apos;t work, copy and paste this link into your browser:
</p>
<p style="margin:8px 0 0;font-size:13px;color:#a7a2c0;word-break:break-all;line-height:1.5">
<a href="${safeUrl}" target="_blank" style="color:#a7a2c0;text-decoration:underline">${safeUrl}</a>
</p>

<p style="margin:28px 0 0;font-size:13px;color:#6e6a8a;line-height:1.5">
This link expires in ${expiryHours} hour${expiryHours === 1 ? "" : "s"}.
If you didn&apos;t request a password reset, you can safely ignore this email.
</p>

</td></tr><!-- /card -->

<!-- Footer -->
<tr><td style="padding:24px 0 0;font-size:12px;color:#4e4a6a;text-align:center">
&copy; ${new Date().getFullYear()} MAVI. All rights reserved.
</td></tr>
</table>
</td></tr>
</table>

<style>
@media only screen and (max-width:600px){
.container{width:100%!important;padding:12px!important}
td[style*="padding:40px 36px 36px"]{padding:28px 20px 24px!important}
}
</style>
</body>
</html>`;

  const text = stripHtml(`Reset your password

Hi ${safeName},

We received a request to reset the password for your MAVI account.

Reset my password: ${resetUrl}

This link expires in ${expiryHours} hour${expiryHours === 1 ? "" : "s"}.
If you didn't request a password reset, you can safely ignore this email — your password will not change.`);

  return {
    subject: "Reset your MAVI password",
    text,
    html,
  };
}