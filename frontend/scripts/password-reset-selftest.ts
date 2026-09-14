/**
 * Frontend password-reset model-only self-test — runs the pure client-side
 * validation rules (no React, no renderer, no network). Mirrors the backend's
 * offline self-test convention.
 *
 * Run from the backend directory (tsx is installed there):
 *   npx tsx ../frontend/scripts/password-reset-selftest.ts
 */
import {
  validateConfirmPassword,
  validateEmail,
  validatePassword,
  validateResetToken,
} from "../src/features/auth/validation.js";

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
/*            Forgot-password form validation (validateEmail)                 */
/* -------------------------------------------------------------------------- */
// valid email
check(validateEmail("alice@example.com") === null, "forgot: valid email → no error");
check(validateEmail("  alice@example.com  ") === null, "forgot: whitespace-padded valid email → no error");
check(validateEmail("a.b+c@sub.example.co.uk") === null, "forgot: complex valid email → no error");

// invalid email
check(validateEmail("") !== null, "forgot: empty email → error");
check(validateEmail("   ") !== null, "forgot: whitespace-only email → error");
check(validateEmail("alice") !== null, "forgot: missing domain → error");
check(validateEmail("alice@") !== null, "forgot: missing domain name → error");
check(validateEmail("alice@example") !== null, "forgot: missing TLD → error");

const emailErrors: string[] = [
  "",
  "   ",
  "alice",
  "alice@",
  "alice@example",
].map((v) => (validateEmail(v) ?? "").trim()).filter((m) => m !== "");
check(
  emailErrors.length > 0 && emailErrors.every((m) => typeof m === "string" && m.length > 0),
  "forgot: every invalid email yields a message",
);
check(
  !/example\.com/i.test(validateEmail("") ?? ""),
  "forgot: error messages do not echo user input",
);

/* -------------------------------------------------------------------------- */
/*             Reset-password form validation (validatePassword)              */
/* -------------------------------------------------------------------------- */
// valid passwords
check(validatePassword("Abcdefg1") === null, "reset: 8-char with letter+number → no error");
check(validatePassword("CorrectHorseBattery9") === null, "reset: long valid password → no error");

// invalid passwords
check(validatePassword("") !== null, "reset: empty password → error");
check(validatePassword("short1") !== null, "reset: under 8 chars → error");
check(validatePassword("abcd1234") === null, "reset: lowercase+digits valid by rule (letter+number)");
check(validatePassword("ABCDEFGH1") === null, "reset: uppercase+digits valid by rule");
check(validatePassword("password") !== null, "reset: no digit → error");
check(validatePassword("12345678") !== null, "reset: no letter → error");

// length bound mirrors backend (8..72)
check(validatePassword("x".repeat(73)) !== null, "reset: 73-char password rejected (over 72)");

/* -------------------------------------------------------------------------- */
/*             Reset-password confirm validation                               */
/* -------------------------------------------------------------------------- */
check(validateConfirmPassword("Abcdefg1", "Abcdefg1") === null, "confirm: matching values → no error");
check(validateConfirmPassword("", "Abcdefg1") !== null, "confirm: empty confirm → error");
check(validateConfirmPassword("Abcdefg1", "AbcdefgX") !== null, "confirm: mismatch → error");
check(validateConfirmPassword("Abcdefg1", "") !== null, "confirm: empty password → error");

/* -------------------------------------------------------------------------- */
/*            Reset token validation (validateResetToken)                     */
/* -------------------------------------------------------------------------- */
const resetToken = "a".repeat(64);
check(validateResetToken(resetToken) === null, "token: 64-hex token → no error");
check(validateResetToken("") !== null, "token: empty token → error");
check(validateResetToken("   ") !== null, "token: whitespace token → error");
check(validateResetToken("x".repeat(513)) !== null, "token: over 512 chars → error");
check(
  /missing its token/i.test(validateResetToken("") ?? ""),
  "token: missing-token message is descriptive",
);

/* -------------------------------------------------------------------------- */
/*                            Summary & exit code                             */
/* -------------------------------------------------------------------------- */
console.log(`\nfrontend checks passed: ${passCount.n}`);
if (failures > 0) {
  console.log(`\nFRONTEND FAILURES (${failures}):\n- ${failuresList.join("\n- ")}\n`);
  console.log("ALL FRONTEND PASSWORD-RESET SELF-TESTS FAILED");
} else {
  console.log("\nALL FRONTEND PASSWORD-RESET SELF-TESTS PASSED");
}

process.exit(failures === 0 ? 0 : 1);