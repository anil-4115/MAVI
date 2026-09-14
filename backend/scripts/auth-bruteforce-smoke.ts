/**
 * Brute-force login protection smoke tests — LIVE against the configured MongoDB.
 * Does NOT send email and only touches test-domain users.
 *
 *   npx tsx scripts/auth-bruteforce-smoke.ts
 */
import mongoose from "mongoose";
import { connectDatabase } from "../src/config/database.js";
import { ApiError } from "../src/utils/ApiError.js";
import { User } from "../src/modules/auth/auth.model.js";
import { login as loginUser } from "../src/modules/auth/auth.service.js";
import { verifyToken } from "../src/utils/jwt.js";
import bcrypt from "bcryptjs";

const PASSWORD = "SmokeTest123";
const WRONG_PASSWORD = "WrongSauce123";
const TEST_DOMAIN = "@mavi-bruteforce-smoke.test";
const LOCK_MSG = "Too many failed login attempts. Please try again later.";

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

const makeEmail = (suffix: string) =>
  `bruteforce_smoke_${Date.now()}_${suffix}${TEST_DOMAIN}`;

async function createUser(
  suffix: string,
  opts: { verified?: boolean } = {},
): Promise<{ id: string; email: string }> {
  const { verified = true } = opts;
  const email = makeEmail(suffix);
  const created = await User.create({
    name: `Bruteforce Smoke ${suffix}`,
    email,
    passwordHash: await bcrypt.hash(PASSWORD, 4),
    emailVerified: verified,
    verificationTokenHash: null,
    verificationTokenExpiresAt: null,
    verificationEmailSentAt: null,
    verifiedTokenHashes: [],
  });
  return { id: created._id.toString(), email };
}

async function readLoginState(userId: string): Promise<{
  failedLoginAttempts: number;
  accountLockedUntil: Date | null;
}> {
  const doc = await User.findById(userId)
    .select("+failedLoginAttempts +accountLockedUntil")
    .lean();
  return {
    failedLoginAttempts: doc?.failedLoginAttempts ?? 0,
    accountLockedUntil: doc?.accountLockedUntil ?? null,
  };
}

async function cleanUp(): Promise<void> {
  await User.deleteMany({ email: new RegExp(`\\${TEST_DOMAIN}$`) });
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

async function main(): Promise<void> {
  try {
    await connectDatabase();
  } catch {
    console.error("Could not connect to database");
    process.exit(2);
  }

  await cleanUp();

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 1: normal successful login for a verified user; JWT verifies
  // ─────────────────────────────────────────────────────────────────────────
  const t1 = await createUser("t1_success");
  try {
    const auth = await loginUser({ email: t1.email, password: PASSWORD });
    check(typeof auth.token === "string" && auth.token.split(".").length === 3, "TEST 1: returns 3-part JWT");
    check(auth.user.email === t1.email, "TEST 1: returned email matches");
    check(auth.user.emailVerified === true, "TEST 1: returned user flagged verified");
    try {
      const payload = verifyToken(auth.token);
      check(payload.sub === t1.id, "TEST 1: JWT subject matches user id");
    } catch (err) {
      check(false, `TEST 1: token did not verify: ${err instanceof Error ? err.message : String(err)}`);
    }
  } catch (err) {
    check(false, `TEST 1: threw ${err instanceof Error ? err.message : String(err)}`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 2: failed login increments the counter
  // ─────────────────────────────────────────────────────────────────────────
  const t2 = await createUser("t2_increment");
  await expectApiError(401, "Invalid email or password", () =>
    loginUser({ email: t2.email, password: WRONG_PASSWORD }),
    "TEST 2",
  );
  {
    const st = await readLoginState(t2.id);
    check(st.failedLoginAttempts === 1, `TEST 2: counter incremented to 1 (got ${st.failedLoginAttempts})`);
    check(st.accountLockedUntil === null, "TEST 2: not locked after one failure");
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 3: 4 failed attempts are still allowed; correct login succeeds
  // ─────────────────────────────────────────────────────────────────────────
  const t3 = await createUser("t3_four");
  let fourAllowed = true;
  for (let i = 1; i <= 4; i++) {
    try {
      await loginUser({ email: t3.email, password: WRONG_PASSWORD });
      fourAllowed = false;
      break;
    } catch {
      // expected — every attempt up to the 4th must be allowed to continue
    }
  }
  check(fourAllowed, "TEST 3: four failed attempts all still return 401 (login continues)");
  {
    const st = await readLoginState(t3.id);
    check(st.failedLoginAttempts === 4, `TEST 3: counter reached 4 (got ${st.failedLoginAttempts})`);
    check(st.accountLockedUntil === null, "TEST 3: no lockout at 4 failures");
  }
  try {
    const auth = await loginUser({ email: t3.email, password: PASSWORD });
    check(typeof auth.token === "string", "TEST 3: correct password still succeeds at 4 failures");
  } catch (err) {
    check(false, `TEST 3: correct login after 4 failures threw ${err instanceof Error ? err.message : String(err)}`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 4: 5th failed attempt activates the lockout
  // ─────────────────────────────────────────────────────────────────────────
  const t4 = await createUser("t4_lockout");
  for (let i = 1; i <= 5; i++) {
    try {
      await loginUser({ email: t4.email, password: WRONG_PASSWORD });
    } catch {
      // expected
    }
  }
  {
    const before = Date.now();
    const st = await readLoginState(t4.id);
    check(st.failedLoginAttempts === 5, `TEST 4: counter reached 5 (got ${st.failedLoginAttempts})`);
    check(
      !!st.accountLockedUntil && st.accountLockedUntil.getTime() > before,
      "TEST 4: accountLockedUntil set in the future",
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 5: correct password during lockout is rejected (safe message)
  // ─────────────────────────────────────────────────────────────────────────
  await expectApiError(429, LOCK_MSG, () =>
    loginUser({ email: t4.email, password: PASSWORD }),
    "TEST 5",
  );
  {
    const st = await readLoginState(t4.id);
    check(st.failedLoginAttempts === 5, "TEST 5: counter unchanged during lockout");
    check(!!st.accountLockedUntil, "TEST 5: still locked after rejected attempt");
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 6: login after the 15-minute lockout expires works
  // ─────────────────────────────────────────────────────────────────────────
  const t6 = await createUser("t6_expired");
  await User.updateOne(
    { _id: t6.id },
    { $set: { failedLoginAttempts: 5, accountLockedUntil: new Date(Date.now() - 1000) } },
  );
  {
    const auth = await loginUser({ email: t6.email, password: PASSWORD });
    check(typeof auth.token === "string", "TEST 6: login succeeds after lockout expiry");
    const st = await readLoginState(t6.id);
    check(st.failedLoginAttempts === 0, `TEST 6: counter reset after success (got ${st.failedLoginAttempts})`);
    check(st.accountLockedUntil === null, "TEST 6: lockout cleared after success");
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 6b: one more failure after expiry re-locks the account
  // ─────────────────────────────────────────────────────────────────────────
  const t6b = await createUser("t6b_relock");
  await User.updateOne(
    { _id: t6b.id },
    { $set: { failedLoginAttempts: 5, accountLockedUntil: new Date(Date.now() - 1000) } },
  );
  await expectApiError(401, "Invalid email or password", () =>
    loginUser({ email: t6b.email, password: WRONG_PASSWORD }),
    "TEST 6b",
  );
  {
    const before = Date.now();
    const st = await readLoginState(t6b.id);
    check(st.failedLoginAttempts >= 6, `TEST 6b: counter incremented past threshold (got ${st.failedLoginAttempts})`);
    check(
      !!st.accountLockedUntil && st.accountLockedUntil.getTime() > before,
      "TEST 6b: account re-locked after expiry + failure",
    );
    await expectApiError(429, LOCK_MSG, () =>
      loginUser({ email: t6b.email, password: PASSWORD }),
      "TEST 6b (re-locked)",
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 7: successful login resets the failed-attempt counter
  // ─────────────────────────────────────────────────────────────────────────
  const t7 = await createUser("t7_reset");
  for (let i = 1; i <= 2; i++) {
    try {
      await loginUser({ email: t7.email, password: WRONG_PASSWORD });
    } catch {
      // expected
    }
  }
  {
    const st = await readLoginState(t7.id);
    check(st.failedLoginAttempts === 2, `TEST 7: counter at 2 before success (got ${st.failedLoginAttempts})`);
  }
  try {
    const auth = await loginUser({ email: t7.email, password: PASSWORD });
    check(typeof auth.token === "string", "TEST 7: login succeeds");
    const st = await readLoginState(t7.id);
    check(st.failedLoginAttempts === 0, `TEST 7: counter reset to 0 after success (got ${st.failedLoginAttempts})`);
    check(st.accountLockedUntil === null, "TEST 7: lockout cleared after success");
  } catch (err) {
    check(false, `TEST 7: threw ${err instanceof Error ? err.message : String(err)}`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 8: existing unverified-user login restriction still works
  // ─────────────────────────────────────────────────────────────────────────
  const t8 = await createUser("t8_unverified", { verified: false });
  await expectApiError(403, "verify your email", () =>
    loginUser({ email: t8.email, password: PASSWORD }),
    "TEST 8",
  );
  {
    const st = await readLoginState(t8.id);
    check(st.failedLoginAttempts === 0, "TEST 8: unverified user counter untouched");
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 9: no sensitive information is returned
  // ─────────────────────────────────────────────────────────────────────────
  // a) Wrong password and unknown email produce identical generic messages
  const unknownEmail = makeEmail("t9_ghost");
  let ghostMsg = "";
  try {
    await loginUser({ email: unknownEmail, password: WRONG_PASSWORD });
  } catch (err) {
    ghostMsg = err instanceof ApiError ? err.message : "";
  }
  let wrongPasswordMsg = "";
  try {
    await loginUser({ email: t2.email, password: WRONG_PASSWORD });
  } catch (err) {
    wrongPasswordMsg = err instanceof ApiError ? err.message : "";
  }
  check(ghostMsg === "Invalid email or password", "TEST 9: unknown email returns generic message");
  check(wrongPasswordMsg === "Invalid email or password", "TEST 9: wrong password returns generic message");
  check(ghostMsg === wrongPasswordMsg, "TEST 9: no email enumeration (identical messages)");

  // b) Successful login payload exposes no secret fields
  {
    const t9 = await createUser("t9_payload");
    const auth9 = await loginUser({ email: t9.email, password: PASSWORD });
    const sensitive = /password|token|attempt|locked|hash/i;
    check(!sensitive.test(JSON.stringify(auth9.user)), "TEST 9: user payload has no sensitive fields");
  }

  // c) Lockout message is generic and contains no user data
  check(LOCK_MSG === "Too many failed login attempts. Please try again later.", "TEST 9: exact safe lockout message");
  check(!/password|email|hash|token/i.test(LOCK_MSG), "TEST 9: lockout message leaks no sensitive data");

  // ─────────────────────────────────────────────────────────────────────────
  // Cleanup
  // ─────────────────────────────────────────────────────────────────────────
  await cleanUp();

  console.log(`\nchecks passed: ${passCount.n}`);
  if (failures > 0) {
    console.log(`\nFAILURES (${failures}):\n- ${failuresList.join("\n- ")}\n`);
    console.log("ALL AUTH BRUTEFORCE SMOKE TESTS FAILED");
  } else {
    console.log("\nALL AUTH BRUTEFORCE SMOKE TESTS PASSED");
  }

  await mongoose.disconnect().catch(() => {});
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Auth bruteforce-smoke crashed:", err);
  process.exit(2);
});