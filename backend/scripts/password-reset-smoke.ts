/**
 * Password-reset smoke tests — LIVE against the configured MongoDB.
 * Does NOT send real email (injects a recording fake sender).
 *
 *   npx tsx scripts/password-reset-smoke.ts
 */
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { connectDatabase } from "../src/config/database.js";
import { ApiError } from "../src/utils/ApiError.js";
import { User, type UserDocument } from "../src/modules/auth/auth.model.js";
import { Notification } from "../src/modules/notifications/notification.model.js";
import {
  generateResetToken,
  getResetExpiry,
  hashToken,
} from "../src/modules/auth/token-utils.js";
import { BCRYPT_ROUNDS } from "../src/modules/auth/auth.service.js";
import {
  requestPasswordReset,
  resetPassword,
  buildPasswordResetUrl,
} from "../src/modules/auth/passwordReset.service.js";
import { login as loginUser } from "../src/modules/auth/auth.service.js";
import type { SendEmailInput } from "../src/modules/email/email.types.js";

const TEST_DOMAIN = "@mavi-password-reset-smoke.test";
const PASSWORD = "ResetSmoke123";
const NEW_PASSWORD = "ResetNew987";

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

const emailLog: SendEmailInput[] = [];

const recordingSender = async (input: SendEmailInput): Promise<void> => {
  emailLog.push(input);
};

const failingSender = async (): Promise<void> => {
  throw new ApiError(500, "Email could not be sent");
};

/* -------------------------------------------------------------------------- */
/*                                   Helpers                                  */
/* -------------------------------------------------------------------------- */
const makeEmail = (suffix: string) => `reset_smoke_${Date.now()}_${suffix}${TEST_DOMAIN}`;

async function createVerifiedUser(name: string): Promise<{ id: string; email: string }> {
  const email = makeEmail(name.toLowerCase());
  const created = await User.create({
    name,
    email,
    passwordHash: await bcrypt.hash(PASSWORD, BCRYPT_ROUNDS),
    emailVerified: true,
    verificationTokenHash: null,
    verificationTokenExpiresAt: null,
    verificationEmailSentAt: null,
  });
  return { id: created._id.toString(), email };
}

async function readResetState(
  userId: string,
): Promise<{ hash: string | null; expiresAt: Date | null; passwordHash: string }> {
  const doc = await User.findById(userId)
    .select("+passwordResetTokenHash +passwordHash")
    .lean();
  return {
    hash: doc?.passwordResetTokenHash ?? null,
    expiresAt: doc?.passwordResetTokenExpiresAt ?? null,
    passwordHash: doc?.passwordHash ?? "",
  };
}

async function cleanUp(): Promise<void> {
  const users = await User.find({
    email: new RegExp(`${TEST_DOMAIN.replace(/@/, "\\@")}$`),
  }).select("_id");
  if (users.length === 0) return;
  const ids = users.map((u) => u._id);
  await Notification.deleteMany({ user: { $in: ids } });
  await User.deleteMany({ _id: { $in: ids } });
}

async function expectApiError(
  statusCode: number,
  messageFragment: string,
  run: () => Promise<unknown>,
  label: string,
): Promise<void> {
  try {
    await run();
    check(false, `${label}: expected ApiError ${statusCode}, got success`);
  } catch (err) {
    if (!(err instanceof ApiError)) {
      check(false, `${label}: expected ApiError (got ${String(err)})`);
      return;
    }
    check(
      err.statusCode === statusCode,
      `${label}: expected ${statusCode} (got ${err.statusCode})`,
    );
    check(
      err.message.includes(messageFragment),
      `${label}: expected message to include "${messageFragment}" (got "${err.message}")`,
    );
  }
}

/* -------------------------------------------------------------------------- */
/*                                   Tests                                    */
/* -------------------------------------------------------------------------- */
async function main(): Promise<void> {
  try {
    await connectDatabase();
  } catch {
    console.error("Could not connect to database");
    process.exit(2);
  }

  await cleanUp();

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 1: forgot password for existing user → token stored, email sent
  // ─────────────────────────────────────────────────────────────────────────
  const t1 = await createVerifiedUser("t1_forgot");
  emailLog.length = 0;
  const result1 = await requestPasswordReset(t1.email, { send: recordingSender });
  check(result1.resetEmailSent === true, "TEST 1: result indicates email sent");
  check(emailLog.length === 1, "TEST 1: sender invoked once");
  {
    const state = await readResetState(t1.id);
    check(typeof state.hash === "string", "TEST 1: token hash stored");
    check(state.hash!.length === 64, "TEST 1: hash is 64-hex (sha-256)");
    check(state.expiresAt instanceof Date, "TEST 1: expiry stored");
    check(state.expiresAt!.getTime() > Date.now(), "TEST 1: expiry is in the future");
    check(state.passwordHash !== "", "TEST 1: password hash present");
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 1b: email payload contains reset URL and branding
  // ─────────────────────────────────────────────────────────────────────────
  {
    const msg = emailLog[0].message;
    check(msg.subject === "Reset your MAVI password", "TEST 1b: email subject correct");
    check(msg.html.includes("/reset-password?token="), "TEST 1b: html contains reset-password path");
    check(msg.text.includes("/reset-password?token="), "TEST 1b: text contains reset-password path");
    check(msg.html.includes("MAVI"), "TEST 1b: html mentions MAVI brand");
    check(msg.html.includes("1 hour") || msg.html.includes("expires in"), "TEST 1b: html mentions expiry");
    check(
      msg.html.includes("safely ignore") || msg.html.includes("didn&apos;t request"),
      "TEST 1b: html mentions safe to ignore",
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 2: forgot password for unknown user → same generic response, no email
  // ─────────────────────────────────────────────────────────────────────────
  emailLog.length = 0;
  const unknownEmail = makeEmail("t2_unknown");
  const result2 = await requestPasswordReset(unknownEmail, { send: recordingSender });
  check(result2.resetEmailSent === false, "TEST 2: result indicates no email sent");
  check(emailLog.length === 0, "TEST 2: sender not invoked for unknown email");

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 3: invalid reset token → safe 400
  // ─────────────────────────────────────────────────────────────────────────
  await expectApiError(400, "Reset link is invalid or has expired", () =>
    resetPassword("0".repeat(64), NEW_PASSWORD),
    "TEST 3",
  );

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 4: expired reset token → safe 400
  // ─────────────────────────────────────────────────────────────────────────
  const t4 = await createVerifiedUser("t4_expired");
  const rawToken4 = generateResetToken();
  await User.updateOne(
    { _id: t4.id },
    {
      $set: {
        passwordResetTokenHash: hashToken(rawToken4),
        passwordResetTokenExpiresAt: new Date(Date.now() - 10000),
      },
    },
  );
  await expectApiError(400, "Reset link is invalid or has expired", () =>
    resetPassword(rawToken4, NEW_PASSWORD),
    "TEST 4",
  );

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 5: successful password reset → old password rejected, new password accepted
  // ─────────────────────────────────────────────────────────────────────────
  const t5 = await createVerifiedUser("t5_success");
  const rawToken5 = generateResetToken();
  await User.updateOne(
    { _id: t5.id },
    {
      $set: {
        passwordResetTokenHash: hashToken(rawToken5),
        passwordResetTokenExpiresAt: getResetExpiry(),
      },
    },
  );
  try {
    await resetPassword(rawToken5, NEW_PASSWORD);
    check(true, "TEST 5: resetPassword succeeded");
  } catch (err) {
    check(false, `TEST 5: resetPassword threw ${err instanceof Error ? err.message : String(err)}`);
  }
  // Old password no longer works
  try {
    await loginUser({ email: t5.email, password: PASSWORD });
    check(false, "TEST 5: old password still works (expected rejection)");
  } catch (err) {
    check(
      err instanceof ApiError && err.statusCode === 401,
      `TEST 5: old password rejected (got ${err instanceof ApiError ? err.statusCode : String(err)})`,
    );
  }
  // New password works
  try {
    const auth = await loginUser({ email: t5.email, password: NEW_PASSWORD });
    check(typeof auth.token === "string" && auth.token.split(".").length === 3, "TEST 5: new password login returns JWT");
  } catch (err) {
    check(false, `TEST 5: new password login threw ${err instanceof Error ? err.message : String(err)}`);
  }
  // Token cleared
  {
    const state = await readResetState(t5.id);
    check(state.hash === null, "TEST 5: token hash cleared after reset");
    check(state.expiresAt === null, "TEST 5: expiry cleared after reset");
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 6: same token cannot be reused (single-use)
  // ─────────────────────────────────────────────────────────────────────────
  const t6 = await createVerifiedUser("t6_onetime");
  const rawToken6 = generateResetToken();
  await User.updateOne(
    { _id: t6.id },
    {
      $set: {
        passwordResetTokenHash: hashToken(rawToken6),
        passwordResetTokenExpiresAt: getResetExpiry(),
      },
    },
  );
  await resetPassword(rawToken6, NEW_PASSWORD); // first use — succeeds
  await expectApiError(400, "Reset link is invalid or has expired", () =>
    resetPassword(rawToken6, "AnotherPwd99"),
    "TEST 6: second use rejected",
  );

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 7: repeated forgot-password requests overwrite token (new email sent)
  // ─────────────────────────────────────────────────────────────────────────
  const t7 = await createVerifiedUser("t7_repeat");
  emailLog.length = 0;
  await requestPasswordReset(t7.email, { send: recordingSender });
  const state7a = await readResetState(t7.id);
  await requestPasswordReset(t7.email, { send: recordingSender });
  const state7b = await readResetState(t7.id);
  check(emailLog.length === 2, "TEST 7: two emails sent for two requests");
  check(state7a.hash !== state7b.hash, "TEST 7: token hash replaced on second request");
  // First token is now invalid; only second works
  // The raw token of the first request is lost (expected — only hash stored);
  // verify the second hash is active by failing with the first hash is not testable
  // without raw. Just confirm second state is valid.
  check(state7b.hash!.length === 64, "TEST 7: second token hash valid");

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 8: Brevo failure → safe handling, no crash, no sensitive leakage
  // ─────────────────────────────────────────────────────────────────────────
  const t8 = await createVerifiedUser("t8_brevo_fail");
  const consoleSpies: string[] = [];
  const origError = console.error;
  console.error = (...args: unknown[]) => { consoleSpies.push(args.map(String).join(" ")); };
  try {
    const result8 = await requestPasswordReset(t8.email, { send: failingSender });
    check(result8.resetEmailSent === false, "TEST 8: result indicates email not sent");
    check(consoleSpies.length > 0, "TEST 8: safe diagnostic logged");
    // No sensitive data in logs
    const logBlob = consoleSpies.join(" ");
    check(!/password123|Password123/i.test(logBlob), "TEST 8: no password in logs");
    check(!/xkeysib-[a-z0-9]/i.test(logBlob), "TEST 8: no API key in logs");
    // Token still stored (so user can retry later)
    const state8 = await readResetState(t8.id);
    check(typeof state8.hash === "string", "TEST 8: token hash still present after send failure");
  } finally {
    console.error = origError;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 9: lockout is cleared after successful password reset
  // ─────────────────────────────────────────────────────────────────────────
  const t9 = await createVerifiedUser("t9_lockout");
  const rawToken9 = generateResetToken();
  await User.updateOne(
    { _id: t9.id },
    {
      $set: {
        passwordResetTokenHash: hashToken(rawToken9),
        passwordResetTokenExpiresAt: getResetExpiry(),
        failedLoginAttempts: 5,
        accountLockedUntil: new Date(Date.now() + 600_000),
      },
    },
  );
  await resetPassword(rawToken9, NEW_PASSWORD);
  {
    const st = await User.findById(t9.id)
      .select("+failedLoginAttempts +accountLockedUntil")
      .lean();
    check((st?.failedLoginAttempts ?? 0) === 0, "TEST 9: failedLoginAttempts cleared");
    check(st?.accountLockedUntil === null || st?.accountLockedUntil === undefined, "TEST 9: lockout cleared");
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 10: buildPasswordResetUrl returns correct URL with frontend config
  // ─────────────────────────────────────────────────────────────────────────
  const testUrl = buildPasswordResetUrl("rawtok123");
  check(testUrl.includes("/reset-password?token=rawtok123"), "TEST 10: reset URL contains correct path and token");
  check(!testUrl.includes("%2F"), "TEST 10: token not double-encoded");

  // ─────────────────────────────────────────────────────────────────────────
  // Cleanup
  // ─────────────────────────────────────────────────────────────────────────
  await cleanUp();

  // ─────────────────────────────────────────────────────────────────────────
  // Summary
  // ─────────────────────────────────────────────────────────────────────────
  console.log(`\nchecks passed: ${passCount.n}`);
  if (failures > 0) {
    console.log(`\nFAILURES (${failures}):\n- ${failuresList.join("\n- ")}\n`);
    console.log("ALL PASSWORD-RESET SMOKE TESTS FAILED");
  } else {
    console.log("\nALL PASSWORD-RESET SMOKE TESTS PASSED");
  }

  await mongoose.disconnect().catch(() => {});
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Password-reset smoke crashed:", err);
  process.exit(2);
});
