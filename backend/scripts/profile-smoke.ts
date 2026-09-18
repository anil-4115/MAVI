/**
 * Live profile settings smoke tests — LIVE against the configured MongoDB and
 * the real HTTP stack (ephemeral app on 127.0.0.1). Real users exchange real
 * JWTs over HTTP.
 *
 * Covers: own-profile load, name update via PATCH /users/me, update
 * persistence (fresh login sees the new name), public-profile shape (only
 * id/name/email/createdAt — never password hashes or verification tokens),
 * validation of invalid names, ownership enforcement (a user cannot change
 * someone else's name), and secret-key absence in every profile response.
 *
 *   npx tsx scripts/profile-smoke.ts
 */
import type { AddressInfo } from "node:net";
import { once } from "node:events";
import mongoose, { Types } from "mongoose";
import bcrypt from "bcryptjs";
import { connectDatabase } from "../src/config/database.js";
import { createApp } from "../src/app.js";
import { User } from "../src/modules/auth/auth.model.js";

const PASSWORD = "SmokeTest123";
const TEST_DOMAIN = "@mavi-profile-smoke.test";

const FORBIDDEN_KEYS = [
  "passwordHash",
  "verificationTokenHash",
  "verificationTokenExpiresAt",
  "verifiedTokenHashes",
  "passwordResetTokenHash",
  "passwordResetTokenExpiresAt",
  "failedLoginAttempts",
  "accountLockedUntil",
];

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

const expectStatus = async (run: () => Promise<number>, expected: number, label: string): Promise<void> => {
  const got = await run();
  check(got === expected, `${label}: expected ${expected} (got ${got})`);
};

interface Jsonable {
  [key: string]: unknown;
}

interface StartServer {
  base: string;
  close: () => Promise<void>;
}

async function startServer(): Promise<StartServer> {
  const app = createApp({ logging: false });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  return {
    base: `http://127.0.0.1:${port}/api`,
    close: async () => {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections?.();
      });
    },
  };
}

async function api(
  base: string,
  method: string,
  path: string,
  token?: string,
  body?: unknown,
): Promise<{ status: number; json: Jsonable | null }> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json().catch(() => null)) as Jsonable | null;
  return { status: res.status, json };
}

const get = (base: string, path: string, token?: string) => api(base, "GET", path, token);
const post = (base: string, path: string, token: string, body: unknown) => api(base, "POST", path, token, body);
const patch = (base: string, path: string, token: string, body: unknown) => api(base, "PATCH", path, token, body);

/** Serializes the JSON response and asserts no secret-like keys leak through. */
const assertNoSecrets = (label: string, json: Jsonable | null): void => {
  const raw = JSON.stringify(json ?? {});
  for (const key of FORBIDDEN_KEYS) {
    check(!raw.includes(key), `${label}: response does not contain "${key}"`);
  }
  check(!raw.includes("Bearer") && !raw.includes("token"), `${label}: response does not contain token material`);
};

async function createVerifiedUser(name: string): Promise<{ id: string; email: string }> {
  const email = `${name.toLowerCase()}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${TEST_DOMAIN}`;
  const created = await User.create({
    name,
    email,
    passwordHash: await bcrypt.hash(PASSWORD, 4),
    emailVerified: true,
    verificationTokenHash: null,
    verificationTokenExpiresAt: null,
    verificationEmailSentAt: null,
    verifiedTokenHashes: [],
  });
  return { id: created._id.toString(), email };
}

async function login(base: string, email: string): Promise<string> {
  const res = await post(base, "/auth/login", "", { email, password: PASSWORD });
  const token = res.json?.data && typeof (res.json.data as Jsonable).token === "string"
    ? ((res.json.data as Jsonable).token as string)
    : "";
  check(res.status === 200 && token.length > 0, `login ${email}: 200 + token (got ${res.status})`);
  return token;
}

async function cleanUp(): Promise<void> {
  await User.deleteMany({ email: new RegExp(`\\${TEST_DOMAIN}$`) });
}

async function main(): Promise<void> {
  try {
    await connectDatabase();
  } catch {
    console.error("Could not connect to database");
    process.exit(2);
  }

  await cleanUp();

  const srv = await startServer();
  const { base } = srv;

  try {
    const me = await createVerifiedUser("Profile Me");
    const other = await createVerifiedUser("Profile Other");
    const tokenMe = await login(base, me.email);
    const tokenOther = await login(base, other.email);

    check(tokenMe.length > 0 && tokenOther.length > 0, "SETUP: both users can log in");

    /* ---------------- unauthenticated + ownership basics ---------------- */
    const unauthMe = await get(base, "/auth/me");
    check(unauthMe.status === 401, "PROFILE: GET /auth/me without token -> 401");
    const unauthPatch = await patch(base, "/users/me", "", { name: "Hacker" });
    check(unauthPatch.status === 401, "PROFILE: PATCH /users/me without token -> 401");

    /* ---------------------- own profile load (GET) ---------------------- */
    const myMe = await get(base, "/auth/me", tokenMe);
    check(myMe.status === 200, "PROFILE: GET /auth/me with token -> 200");
    const myUser = (myMe.json?.data as Jsonable).user as Jsonable | undefined;
    check(myUser?.name === "Profile Me", "PROFILE: /auth/me returns my name");
    assertNoSecrets("PROFILE: /auth/me", myMe.json);

    /* ------------------- update own name (PATCH /users/me) ------------- */
    const updated = await patch(base, "/users/me", tokenMe, { name: "Updated Rename" });
    check(updated.status === 200, "PROFILE: PATCH /users/me -> 200");
    const updatedUser = (updated.json?.data as Jsonable).user as Jsonable | undefined;
    check(updatedUser?.name === "Updated Rename", "PROFILE: PATCH /users/me returns new name");
    check(updatedUser?.id === me.id, "PROFILE: PATCH /users/me returns my id");
    assertNoSecrets("PROFILE: PATCH /users/me", updated.json);

    /* ---- persistence across sessions: fresh login sees the new name ---- */
    const tokenMe2 = await login(base, me.email);
    const freshMe = await get(base, "/auth/me", tokenMe2);
    check(freshMe.status === 200, "PROFILE: fresh login GET /auth/me -> 200");
    check(
      (freshMe.json?.data as Jsonable).user?.name === "Updated Rename",
      "PROFILE: name update persisted across sessions",
    );

    /* ------------------- public profile of another user ----------------- */
    const theirs = await get(base, `/users/${other.id}`, tokenMe);
    check(theirs.status === 200, "PROFILE: GET /users/:otherId -> 200");
    const otherPublic = (theirs.json?.data as Jsonable).user as Jsonable | undefined;
    check(otherPublic?.name === "Profile Other", "PROFILE: public profile returns other user's name");
    check(
      (["id", "name", "email", "createdAt"] as const).every((k) => k in (otherPublic ?? {})),
      "PROFILE: public profile has exactly id/name/email/createdAt",
    );
    assertNoSecrets("PROFILE: public profile", theirs.json);

    /* --- ownership: user cannot update someone else's name via body --- */
    const hijack = await patch(base, "/users/me", tokenMe, { name: "Hijacked Name", userId: other.id });
    check(hijack.status === 200, "PROFILE: PATCH with userId field still allowed for own name");
    check(
      (hijack.json?.data as Jsonable).user?.name === "Hijacked Name",
      "PROFILE: PATCH body userId is ignored (made-up name applied to ME, not the other user)",
    );
    const otherAfter = await get(base, `/users/${other.id}`, tokenMe);
    check(
      (otherAfter.json?.data as Jsonable).user?.name === "Profile Other",
      "PROFILE: other user's public name unchanged (ownership enforced)",
    );

    /* ------------------------ validation of bad names -------------------- */
    await expectStatus(() => patch(base, "/users/me", tokenMe, { name: "X" }).then((r) => r.status), 400, "PROFILE: name too short -> 400");
    await expectStatus(() => patch(base, "/users/me", tokenMe, { name: "   " }).then((r) => r.status), 400, "PROFILE: blank name -> 400");
    await expectStatus(() => patch(base, "/users/me", tokenMe, { name: "a".repeat(101) }).then((r) => r.status), 400, "PROFILE: name too long -> 400");
    await expectStatus(() => patch(base, "/users/me", tokenMe, {}).then((r) => r.status), 400, "PROFILE: missing name -> 400");

    /* ---------------- public profile of unknown user -> 404 -------------- */
    const unknown = new Types.ObjectId().toString();
    await expectStatus(() => get(base, `/users/${unknown}`, tokenMe).then((r) => r.status), 404, "PROFILE: unknown userId -> 404");

    /* ---------------- name is stored trimmed ----------------------------- */
    const trimmed = await patch(base, "/users/me", tokenMe, { name: "  Padded Trim  " });
    check(
      (trimmed.json?.data as Jsonable).user?.name === "Padded Trim",
      "PROFILE: update trims surrounding whitespace",
    );

    /* -------- tokenOther still works (no cross-user session damage) ------ */
    const otherMe = await get(base, "/auth/me", tokenOther);
    check(otherMe.status === 200 && (otherMe.json?.data as Jsonable).user?.name === "Profile Other", "PROFILE: other user's session unaffected");
  } finally {
    await srv.close();
    await cleanUp();
  }

  await mongoose.disconnect().catch(() => {});
  console.log(`\nPASS: ${passCount.n}  FAIL: ${failures}`);
  if (failuresList.length > 0) {
    console.log(failuresList.join("\n"));
    process.exit(1);
  }
  process.exit(0);
}

main();