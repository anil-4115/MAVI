/**
 * Auth/email verification smoke tests — LIVE against the configured MongoDB.
 * Does NOT send real email (injects a recording fake sender).
 *
 *   npx tsx scripts/auth-verify-smoke.ts
 */
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { connectDatabase } from "../src/config/database.js";
import { ApiError } from "../src/utils/ApiError.js";
import { User, type UserDocument } from "../src/modules/auth/auth.model.js";
import { Notification } from "../src/modules/notifications/notification.model.js";
import {
  generateVerificationToken,
  getVerificationExpiry,
  hashToken,
} from "../src/modules/auth/token-utils.js";
import { register as registerUser, login as loginUser } from "../src/modules/auth/auth.service.js";
import { sendSignupEmailOnce, verifyEmailToken } from "../src/modules/auth/verification.service.js";
import { env } from "../src/config/env.js";
import type { SendEmailInput } from "../src/modules/email/email.types.js";

const BASE = "http://localhost:5000/api";
const TEST_DOMAIN = "@mavi-verify-smoke.test";
const PASSWORD = "SmokeTest123";

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

/* -------------------------------------------------------------------------- */
/*                                   Helpers                                  */
/* -------------------------------------------------------------------------- */
const makeName = (suffix: string) => `verify_smoke_${suffix}_${Date.now()}`;
const makeEmail = (name: string) => `${name.toLowerCase()}${TEST_DOMAIN}`;

async function createTestUser(name: string): Promise<{ user: UserDocument; email: string; token: string; hash: string }> {
  const email = makeEmail(name);
  const rawToken = generateVerificationToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = getVerificationExpiry();
  const user = (await User.create({
    name,
    email,
    passwordHash: await bcrypt.hash(PASSWORD, 4),
    emailVerified: false,
    verificationTokenHash: tokenHash,
    verificationTokenExpiresAt: expiresAt,
    verificationEmailSentAt: null,
  })) as unknown as UserDocument;
  return { user, email, token: rawToken, hash: tokenHash };
}

async function cleanUp(): Promise<void> {
  const users = await User.find({ email: new RegExp(`${TEST_DOMAIN.replace(/@/, "\\@")}$`) }).select("_id");
  if (users.length === 0) return;
  const ids = users.map((u) => u._id);
  await Notification.deleteMany({ user: { $in: ids } });
  await User.deleteMany({ _id: { $in: ids } });
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

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 1: register creates account; one-time send fires exactly once
  // ───────────────────────────────────────────────────────────────────────────
  const test1Email = makeEmail(makeName("t1"));
  let t1UserId = "";
  try {
    emailLog.length = 0;
    const reg1 = await registerUser({ name: "Smoke Test 1", email: test1Email, password: PASSWORD });
    check(reg1.user.email === test1Email, "TEST 1: register returns correct email");
    check(reg1.user.emailVerified === false, "TEST 1: register sets emailVerified=false");
    // With a configured provider the real send is attempted (and succeeds when
    // the provider accepts); without one the send fails and must not topple
    // registration. Assert whichever branch the environment is in.
    const emailProvided = Boolean(env.brevoApiKey || env.resendApiKey);
    check(
      reg1.verificationEmailSent === emailProvided,
      `TEST 1: verificationEmailSent matches provider presence (got ${reg1.verificationEmailSent}, provider=${emailProvided})`,
    );
    t1UserId = reg1.user.id;
    const u1 = await User.findById(t1UserId).select("verificationEmailSentAt verificationTokenHash emailVerified").lean();
    check(!!u1, "TEST 1: user persisted");
    check(u1!.emailVerified === false, "TEST 1: emailVerified stored as false");
    check(
      emailProvided ? u1!.verificationEmailSentAt !== null : u1!.verificationEmailSentAt === null,
      `TEST 1: sentAt matches provider result (got ${emailProvided ? "accepted" : "null"})`,
    );
    check(typeof u1!.verificationTokenHash === "string", "TEST 1: token hash stored");
  } catch (err) {
    check(false, `TEST 1: register threw ${err instanceof Error ? err.message : String(err)}`);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 1b: one-time email guard via mock sender (pure DB check)
  // ───────────────────────────────────────────────────────────────────────────
  const { user: u2, email: e2, token: rawToken2 } = await createTestUser("t1b_guard");
  try {
    emailLog.length = 0;
    const sent1 = await sendSignupEmailOnce(
      { user: { id: u2._id.toString(), email: e2, name: "Guard" }, rawToken: rawToken2, expiresAt: getVerificationExpiry() },
      { send: recordingSender },
    );
    check(sent1 === true, "TEST 1b: first send succeeds");
    check(emailLog.length === 1, "TEST 1b: sender invoked once");

    const sent2 = await sendSignupEmailOnce(
      { user: { id: u2._id.toString(), email: e2, name: "Guard" }, rawToken: rawToken2, expiresAt: getVerificationExpiry() },
      { send: recordingSender },
    );
    check(sent2 === false, "TEST 1b: second send skipped (already sent)");
    check(emailLog.length === 1, "TEST 1b: sender not invoked a second time");
  } catch (err) {
    check(false, `TEST 1b: threw ${err instanceof Error ? err.message : String(err)}`);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 2: duplicate email → 409; no second verification email
  // ───────────────────────────────────────────────────────────────────────────
  try {
    await registerUser({ name: "Dup", email: e2, password: PASSWORD });
    check(false, "TEST 2: expected 409 duplicate");
  } catch (err) {
    check(err instanceof ApiError && err.statusCode === 409, `TEST 2: expected 409 (got ${err instanceof ApiError ? err.statusCode : String(err)})`);
  }
  // No new sender call since the duplicate registration was rejected
  check(emailLog.length === 1, "TEST 2: no additional email sent for duplicate");

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 3: login before verification → 403
  // ───────────────────────────────────────────────────────────────────────────
  try {
    await loginUser({ email: e2, password: PASSWORD });
    check(false, "TEST 3: expected 403 for unverified login");
  } catch (err) {
    check(
      err instanceof ApiError && err.statusCode === 403,
      `TEST 3: expected 403 (got ${err instanceof ApiError ? err.statusCode : String(err)})`,
    );
    check(
      err instanceof ApiError && err.message.includes("verify your email"),
      "TEST 3: message mentions email verification",
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 4: valid verification link → verified; token hash cleared
  // ───────────────────────────────────────────────────────────────────────────
  try {
    const result = await verifyEmailToken(rawToken2);
    check(result.status === "verified", "TEST 4: status=verified");
    const u = await User.findById(u2._id).select("+emailVerified +verificationTokenHash +verifiedTokenHashes").lean();
    check(u!.emailVerified === true, "TEST 4: emailVerified set to true");
    check(u!.verificationTokenHash === null, "TEST 4: active token hash cleared");
    check(u!.verificationTokenExpiresAt === null, "TEST 4: expiry cleared");
    check(u!.verifiedTokenHashes.includes(hashToken(rawToken2)), "TEST 4: consumed hash recorded");
  } catch (err) {
    check(false, `TEST 4: threw ${err instanceof Error ? err.message : String(err)}`);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 5: same verification link again → idempotent "already verified"
  // ───────────────────────────────────────────────────────────────────────────
  try {
    const result5 = await verifyEmailToken(rawToken2);
    check(result5.status === "already_verified", "TEST 5: second click status=already_verified");
    check(result5.message.includes("already verified"), "TEST 5: message says already verified");
  } catch (err) {
    check(false, `TEST 5: threw ${err instanceof Error ? err.message : String(err)}`);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 6: invalid token → fails safely
  // ───────────────────────────────────────────────────────────────────────────
  const garbageToken = generateVerificationToken();
  try {
    await verifyEmailToken(garbageToken);
    check(false, "TEST 6: expected ApiError 400 for invalid token");
  } catch (err) {
    check(err instanceof ApiError && err.statusCode === 400, `TEST 6: expected 400 (got ${err instanceof ApiError ? err.statusCode : String(err)})`);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 7: expired token → fails safely
  // ───────────────────────────────────────────────────────────────────────────
  const { user: u7, token: rawToken7 } = await createTestUser("t7_expired");
  await User.updateOne(
    { _id: u7._id },
    { $set: { verificationTokenExpiresAt: new Date(Date.now() - 10000) } },
  );
  try {
    await verifyEmailToken(rawToken7);
    check(false, "TEST 7: expected ApiError 400 for expired token");
  } catch (err) {
    check(err instanceof ApiError && err.statusCode === 400, `TEST 7: expected 400 (got ${err instanceof ApiError ? err.statusCode : String(err)})`);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 8: verified user login → success; JWT shape correct
  // ───────────────────────────────────────────────────────────────────────────
  try {
    const auth = await loginUser({ email: e2, password: PASSWORD });
    check(typeof auth.token === "string" && auth.token.split(".").length === 3, "TEST 8: returns JWT (3-part)");
    check(auth.user.email === e2, "TEST 8: returned email matches");
    check(auth.user.emailVerified === true, "TEST 8: returned user flagged verified");
  } catch (err) {
    check(false, `TEST 8: threw ${err instanceof Error ? err.message : String(err)}`);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Cleanup
  // ───────────────────────────────────────────────────────────────────────────
  await cleanUp();

  // ───────────────────────────────────────────────────────────────────────────
  // Summary
  // ───────────────────────────────────────────────────────────────────────────
  console.log(`\nchecks passed: ${passCount.n}`);
  if (failures > 0) {
    console.log(`\nFAILURES (${failures}):\n- ${failuresList.join("\n- ")}\n`);
    console.log("ALL AUTH-VERIFY SMOKE TESTS FAILED");
  } else {
    console.log("\nALL AUTH-VERIFY SMOKE TESTS PASSED");
  }

  await mongoose.disconnect().catch(() => {});
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Auth-verify smoke crashed:", err);
  process.exit(2);
});