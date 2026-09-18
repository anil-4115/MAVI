/**
 * Pure self-test for request-log URL redaction — offline, no DB, no HTTP.
 * The request logger must never log the email-verification `token` (or any
 * other sensitive query param). This proves the sanitizer redacts them while
 * preserving the path and every non-sensitive parameter byte-for-byte.
 *
 *   npx tsx scripts/log-redaction-selftest.ts
 */
import { sanitizeLogUrl } from "../src/utils/sanitizeLogUrl.js";

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

const exact = (input: string, expected: string, label: string): void => {
  const got = sanitizeLogUrl(input);
  check(got === expected, `${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(expected)}`);
};

/* URLs without a query are returned unchanged. */
exact("/api/health", "/api/health", "no-query");
exact("/api/groups/abc/settlements?", "/api/groups/abc/settlements?", "empty-query");

/* The verification link never logs its token. */
exact(
  "/auth/verify-email?token=abc123f0e5769a5a4e4e",
  "/auth/verify-email?token=[REDACTED]",
  "verify-token",
);

/* Sensitive params are redacted regardless of case/encoding. */
exact("/foo?Token=abc", "/foo?Token=[REDACTED]", "case-insensitive-key");
exact("/foo?key=abc&code=banana", "/foo?key=[REDACTED]&code=[REDACTED]", "multi-sensitive");
exact("/foo?password=p%40ss", "/foo?password=[REDACTED]", "password");
exact("/foo?api_key=abc", "/foo?api_key=[REDACTED]", "api-key");
exact("/foo?otp=123456", "/foo?otp=[REDACTED]", "otp");
exact("/foo?token", "/foo?token=[REDACTED]", "key-without-value");

/* Non-sensitive params are preserved alongside redacted ones. */
exact(
  "/groups/g1/settlements?page=2&limit=20&status=completed",
  "/groups/g1/settlements?page=2&limit=20&status=completed",
  "normal-params-preserved",
);
exact(
  "/auth/verify-email?token=abc123&utm_source=email",
  "/auth/verify-email?token=[REDACTED]&utm_source=email",
  "mixed-params",
);

/* A value that merely contains "token" must not trigger redaction. */
exact("/foo?note=token-not-secret", "/foo?note=token-not-secret", "value-not-redacted");

console.log(`\nchecks passed: ${passCount.n}`);
if (failures > 0) {
  console.log(`\nFAILURES (${failures}):\n- ${failuresList.join("\n- ")}\n`);
  console.log("ALL LOG-REDACTION SELF-TESTS FAILED");
} else {
  console.log("\nALL LOG-REDACTION SELF-TESTS PASSED");
}

process.exit(failures === 0 ? 0 : 1);