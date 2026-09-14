/**
 * Auth/email verification pure self-test — offline, no DB, no Resend.
 *
 *   npx tsx scripts/auth-email-selftest.ts
 */
import {
  generateVerificationToken,
  hashToken,
  isTokenExpired,
  TOKEN_TTL_MS,
  TOKEN_TTL_HOURS,
} from "../src/modules/auth/token-utils.js";
import { buildVerificationEmail } from "../src/modules/email/email.template.js";

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
const t1 = generateVerificationToken();
const t2 = generateVerificationToken();

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
check(TOKEN_TTL_MS === 24 * 60 * 60 * 1000, "TTL_MS equals 24 hours in ms");
check(TOKEN_TTL_HOURS === 24, "TTL_HOURS equals 24");

const now = new Date("2025-06-01T12:00:00Z");
const future = new Date("2025-06-01T12:00:01Z");
const past = new Date("2025-05-31T23:59:59Z");

check(!isTokenExpired(future, now), "expiry: valid future time → not expired");
check(isTokenExpired(past, now), "expiry: past time → expired");
check(isTokenExpired(null, now), "expiry: null → expired");
check(isTokenExpired(undefined, now), "expiry: undefined → expired");
check(isTokenExpired(future, future), "expiry: boundary (equals expiry) → expired");

/* -------------------------------------------------------------------------- */
/*                          Email template builder                            */
/* -------------------------------------------------------------------------- */
const verifyUrl = "http://localhost:5173/verify-email?token=abc123";
const email = buildVerificationEmail({ toName: "Alice", verificationUrl: verifyUrl, expiryHours: 24 });

check(email.subject === "Verify your MAVI account", "template: correct subject");
check(typeof email.html === "string" && email.html.length > 200, "template: non-trivial html");
check(typeof email.text === "string" && email.text.length > 50, "template: non-trivial text fallback");
check(email.html.includes(verifyUrl), "template: html contains verification URL");
check(email.text.includes(verifyUrl), "template: text fallback contains URL");
check(email.html.includes("Alice"), "template: html contains recipient name");
check(email.html.includes("24 hour"), "template: html mentions 24-hour expiry");
check(email.html.includes("MAVI"), "template: html mentions MAVI brand");
check(!/<link\s+rel="stylesheet"/i.test(email.html), "template: no external CSS links");
check(!/<script/i.test(email.html), "template: no script tags (email-safe)");
check(/role="presentation"/i.test(email.html), "template: tables use role=presentation");
check(!/&(?![\w#]+;)/i.test(email.html.split("<!--")[0] ?? ""), "template: preheader is HTML-escaped");

const emailExpiry6 = buildVerificationEmail({
  toName: "Bob",
  verificationUrl: verifyUrl,
  expiryHours: 6,
});
check(emailExpiry6.html.includes("6 hours"), "template: custom expiry 6 hours renders");

/* -------------------------------------------------------------------------- */
/*                            Summary & exit code                             */
/* -------------------------------------------------------------------------- */
console.log(`\nchecks passed: ${passCount.n}`);
if (failures > 0) {
  console.log(`\nFAILURES (${failures}):\n- ${failuresList.join("\n- ")}\n`);
  console.log("ALL AUTH-EMAIL SELF-TESTS FAILED");
} else {
  console.log("\nALL AUTH-EMAIL SELF-TESTS PASSED");
}

process.exit(failures === 0 ? 0 : 1);