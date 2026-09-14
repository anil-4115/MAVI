/**
 * Password-reset pure self-test — offline, no DB, no provider key.
 * Covers token generation/hashing, reset TTL helpers, the password-reset email
 * template builder, and the Brevo payload for reset emails (no external request).
 *
 *   npx tsx scripts/password-reset-selftest.ts
 */
import {
  generateResetToken,
  hashToken,
  isTokenExpired,
  RESET_TOKEN_TTL_MS,
  RESET_TOKEN_TTL_HOURS,
  getResetExpiry,
} from "../src/modules/auth/token-utils.js";
import { buildPasswordResetEmail } from "../src/modules/email/email.template.js";
import {
  buildBrevoSmtpEmail,
  BREVO_SENDER_NAME,
} from "../src/modules/email/email.brevo.js";

let failures = 0;
const failuresList: string[] = [];
const passCount = { n: 0 };

const check = (condition: boolean, label: string): void => {
  if (condition) {
    passCount.n++;
  } else {
    failures++;
    failuresList.push(`FAIL: ${label}`);
  }
};

/* -------------------------------------------------------------------------- */
/*                          Token generation & hashing                        */
/* -------------------------------------------------------------------------- */
const t1 = generateResetToken();
const t2 = generateResetToken();

check(typeof t1 === "string", "generate: returns string");
check(t1.length === 64, "generate: 64 hex chars (32 random bytes)");
check(/^[0-9a-f]{64}$/.test(t1), "generate: valid lowercase hex");
check(t1 !== t2, "generate: two calls produce distinct tokens");

const h1 = hashToken(t1);
check(typeof h1 === "string", "hash: returns string");
check(h1.length === 64, "hash: 64 hex chars (sha-256)");
check(/^[0-9a-f]{64}$/.test(h1), "hash: valid lowercase hex");
check(hashToken(t1) === h1, "hash: deterministic (same input → same output)");
check(hashToken(t2) !== h1, "hash: different inputs → different outputs");
check(h1 !== t1, "hash: output differs from input");

/* -------------------------------------------------------------------------- */
/*                           TTL & expiry helpers                             */
/* -------------------------------------------------------------------------- */
check(RESET_TOKEN_TTL_MS === 60 * 60 * 1000, "RESET_TTL_MS equals 1 hour in ms");
check(RESET_TOKEN_TTL_HOURS === 1, "RESET_TTL_HOURS equals 1");

const now = new Date("2025-06-01T12:00:00Z");
const future = new Date("2025-06-01T12:00:01Z");
const past = new Date("2025-06-01T11:59:59Z");
const farPast = new Date("2025-06-01T10:59:59Z"); // > 1 hour ago

check(!isTokenExpired(future, now), "expiry: valid future time → not expired");
check(isTokenExpired(past, now), "expiry: boundary (just before now) → expired");
check(isTokenExpired(farPast, now), "expiry: past time → expired");
check(isTokenExpired(null, now), "expiry: null → expired");
check(isTokenExpired(undefined, now), "expiry: undefined → expired");
check(isTokenExpired(future, future), "expiry: boundary (equals expiry) → expired");

// getResetExpiry returns a Date in the future
const expiry = getResetExpiry();
check(expiry instanceof Date, "getResetExpiry: returns a Date");
check(expiry.getTime() > Date.now(), "getResetExpiry: date is in the future");
check(
  expiry.getTime() - Date.now() <= RESET_TOKEN_TTL_MS + 1000,
  "getResetExpiry: within TTL window",
);

/* -------------------------------------------------------------------------- */
/*                   Password-reset email template builder                    */
/* -------------------------------------------------------------------------- */
const resetUrl = "http://localhost:5173/reset-password?token=abc123xyz";
const email = buildPasswordResetEmail({ toName: "Alice", resetUrl, expiryHours: 1 });

check(email.subject === "Reset your MAVI password", "template: correct subject");
check(typeof email.html === "string" && email.html.length > 200, "template: non-trivial html");
check(typeof email.text === "string" && email.text.length > 50, "template: non-trivial text fallback");
check(email.html.includes(resetUrl), "template: html contains reset URL");
check(email.text.includes(resetUrl), "template: text fallback contains URL");
check(email.html.includes("Alice"), "template: html contains recipient name");
check(email.html.includes("1 hour"), "template: html mentions 1-hour expiry");
check(email.html.includes("MAVI"), "template: html mentions MAVI brand");
check(!/<link\s+rel="stylesheet"/i.test(email.html), "template: no external CSS links");
check(!/<script/i.test(email.html), "template: no script tags (email-safe)");
check(/role="presentation"/i.test(email.html), "template: tables use role=presentation");
check(!/&(?![\w#]+;)/i.test(email.html.split("<!--")[0] ?? ""), "template: preheader is HTML-escaped");
check(
  email.html.includes("didn&apos;t request") || email.html.includes("didn't request"),
  "template: mentions what to do if user did not request",
);
check(
  email.text.includes("safe to ignore") || email.text.includes("safely ignore"),
  "template: text fallback mentions safe to ignore",
);

const emailExpiry6 = buildPasswordResetEmail({
  toName: "Bob",
  resetUrl,
  expiryHours: 6,
});
check(emailExpiry6.html.includes("6 hours"), "template: custom expiry 6 hours renders");

/* -------------------------------------------------------------------------- */
/*                    Brevo payload builder (offline, no key)                 */
/* -------------------------------------------------------------------------- */
const senderEmail = "sender@example.com";
const brevoPayload = buildBrevoSmtpEmail(
  { to: "recipient@example.com", message: email },
  senderEmail,
);

check(typeof brevoPayload.sender === "object" && brevoPayload.sender !== null, "brevo: sender object present");
check(brevoPayload.sender?.name === BREVO_SENDER_NAME, "brevo: sender name is MAVI");
check(brevoPayload.sender?.email === senderEmail, "brevo: sender email comes from config, not hardcoded");
check(Array.isArray(brevoPayload.to) && brevoPayload.to[0]?.email === "recipient@example.com", "brevo: recipient email mapped");
check(brevoPayload.subject === email.subject, "brevo: subject passed through unchanged");
check(brevoPayload.htmlContent === email.html, "brevo: HTML passed through byte-for-byte");
check(brevoPayload.textContent === email.text, "brevo: plain text passed through byte-for-byte");
check(typeof brevoPayload.htmlContent === "string" && brevoPayload.htmlContent.includes(resetUrl), "brevo: HTML keeps reset URL");

/* -------------------------------------------------------------------------- */
/*                            Summary & exit code                             */
/* -------------------------------------------------------------------------- */
console.log(`\nchecks passed: ${passCount.n}`);
if (failures > 0) {
  console.log(`\nFAILURES (${failures}):\n- ${failuresList.join("\n- ")}\n`);
  console.log("ALL PASSWORD-RESET SELF-TESTS FAILED");
} else {
  console.log("\nALL PASSWORD-RESET SELF-TESTS PASSED");
}

process.exit(failures === 0 ? 0 : 1);
