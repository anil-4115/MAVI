/**
 * Live authorization (IDOR/BOLA) smoke tests — LIVE against the configured
 * MongoDB and the real HTTP stack (ephemeral app on 127.0.0.1). Two real users
 * (attacker A + victim B) exchange real JWTs over HTTP.
 *
 * Verifies the uniform 404-on-unauthorized policy (no resource existence
 * oracle), role-level 403 denials where membership is established, cross-user
 * and cross-group direct-object-reference protection, personal-expense
 * isolation, notification-recipient scoping, and preview/removal semantics.
 *
 *   npx tsx scripts/authorization-smoke.ts
 */
import type { AddressInfo } from "node:net";
import { once } from "node:events";
import { Types } from "mongoose";
import bcrypt from "bcryptjs";
import { connectDatabase } from "../src/config/database.js";
import { createApp } from "../src/app.js";
import { User } from "../src/modules/auth/auth.model.js";
import { Group } from "../src/modules/groups/group.model.js";
import { Expense } from "../src/modules/expenses/expense.model.js";
import { Settlement } from "../src/modules/settlements/settlement.model.js";
import { Notification } from "../src/modules/notifications/notification.model.js";

const PASSWORD = "SmokeTest123";
const TEST_DOMAIN = "@mavi-auz-smoke.test";
const CURRENCY = "INR";

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
  if (body !== undefined && method !== "GET") headers["Content-Type"] = "application/json";
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body !== undefined && method !== "GET" ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json().catch(() => null)) as Jsonable | null;
  return { status: res.status, json };
}

const get = (base: string, path: string, token?: string) => api(base, "GET", path, token);
const post = (base: string, path: string, token: string, body: unknown) => api(base, "POST", path, token, body);
const patch = (base: string, path: string, token: string, body: unknown) => api(base, "PATCH", path, token, body);
const del = (base: string, path: string, token: string) => api(base, "DELETE", path, token);

const groupExpenseBody = (payerId: string, participantIds: string[]) => ({
  title: "Authorization smoke expense",
  amountMinor: 1000,
  currency: CURRENCY,
  payerId,
  split: { method: "equal", equal: participantIds.map((userId) => ({ userId })) },
});

const settlementBody = (payerId: string, receiverId: string, amountMinor: number) => ({
  payerId,
  receiverId,
  amountMinor,
  currency: CURRENCY,
  // P0 idempotency contract: every settlement create needs a unique key.
  idempotencyKey: `auz-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
});

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
  const smokeUsers = await User.find({ email: new RegExp(`\\${TEST_DOMAIN}$`) }).select("_id");
  const ids = smokeUsers.map((u) => u._id);
  if (ids.length === 0) return;
  const groups = (await Group.find({ "members.userId": { $in: ids } }).select("_id")) as unknown as {
    _id: Types.ObjectId;
  }[];
  const gids = groups.map((g) => g._id);
  await Notification.deleteMany({ group: { $in: gids } });
  await Settlement.deleteMany({ group: { $in: gids } });
  await Expense.deleteMany({ group: { $in: gids } });
  await Expense.deleteMany({ createdBy: { $in: ids } });
  await Group.deleteMany({ _id: { $in: gids } });
  await User.deleteMany({ _id: { $in: ids } });
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
    const a = await createVerifiedUser("Attacker Auz");
    const b = await createVerifiedUser("Victim Buz");
    const tokenA = await login(base, a.email);
    const tokenB = await login(base, b.email);

    /* ------------------- unauth + basic auth sanity ------------------------ */
    check((await get(base, `/auth/me`, tokenA)).status === 200, "AUTH: A /auth/me works");
    check((await get(base, "/groups", tokenA)).status === 200, "AUTH: A /groups works");

    /* ------------------- positive control (A's OWN group) ------------------ */
    const gA = await post(base, "/groups", tokenA, { name: "A group", currency: CURRENCY });
    const gAId = (gA.json?.data as Jsonable).group.id as string;
    check(gAId.length === 24, "SETUP: A created own group (control)");
    const gANonexistent = (await get(base, `/groups/${new Types.ObjectId().toString()}`, tokenA)).status;
    check(gANonexistent === 404, "SETUP: unknown group id -> 404");

    /* ---------------------- B creates the victim group --------------------- */
    const gB = await post(base, "/groups", tokenB, { name: "Victim group", currency: CURRENCY });
    const gBId = (gB.json?.data as Jsonable).group.id as string;
    check(gBId.length === 24, "SETUP: B created victim group");

    const uA = `/groups/${gBId}`;
    const unknownId = new Types.ObjectId().toString();

    /* -------- Phase 1: A (non-member) probes B's group => uniform 404 ------ */
    const probes404: Array<[string, () => Promise<number>]> = [
      ["detail", () => get(base, uA, tokenA).then((r) => r.status)],
      ["members", () => get(base, `${uA}/members`, tokenA).then((r) => r.status)],
      ["list expenses", () => get(base, `${uA}/expenses`, tokenA).then((r) => r.status)],
      ["create expense", () => post(base, `${uA}/expenses`, tokenA, groupExpenseBody(b.id, [b.id])).then((r) => r.status)],
      ["balances", () => get(base, `${uA}/balances`, tokenA).then((r) => r.status)],
      ["list settlements", () => get(base, `${uA}/settlements`, tokenA).then((r) => r.status)],
      ["create settlement", () => post(base, `${uA}/settlements`, tokenA, settlementBody(a.id, b.id, 100)).then((r) => r.status)],
      ["update group", () => patch(base, uA, tokenA, { name: "hijack" }).then((r) => r.status)],
      ["archive group", () => del(base, uA, tokenA).then((r) => r.status)],
      ["invite member", () => post(base, `${uA}/members`, tokenA, { userId: b.id }).then((r) => r.status)],
      ["remove member", () => del(base, `${uA}/members/${a.id}`, tokenA).then((r) => r.status)],
      ["change role", () => patch(base, `${uA}/members/${b.id}/role`, tokenA, { role: "admin" }).then((r) => r.status)],
      ["transfer owner", () => patch(base, `${uA}/owner`, tokenA, { userId: a.id }).then((r) => r.status)],
      ["preview", () => get(base, `${uA}/preview`, tokenA).then((r) => r.status)],
      ["accept own invite", () => post(base, `${uA}/members/${a.id}/accept`, tokenA, {}).then((r) => r.status)],
      ["accept other's invite", () => post(base, `${uA}/members/${b.id}/accept`, tokenA, {}).then((r) => r.status)],
    ];
    for (const [label, fn] of probes404) {
      await expectStatus(fn, label === "accept other's invite" ? 403 : 404, `PHASE1 non-member ${label}`);
    }

    /* ---- Phase 1b: unknown group id must look identical (no oracle) -------- */
    const unknownDetail = await get(base, `/groups/${unknownId}`, tokenA);
    const knownDetail = await get(base, uA, tokenA);
    check(unknownDetail.status === 404, "PHASE1b: unknown group detail -> 404");
    check(
      knownDetail.status === 404 && unknownDetail.status === knownDetail.status,
      "PHASE1b: no existence oracle — existing vs unknown group look identical (404/404)",
    );

    /* --------------------------- Phase 2: invite --------------------------- */
    const invited = await post(base, `${uA}/members`, tokenB, { userId: a.id });
    check(invited.status === 200, "PHASE2: B invites A -> 200");
    const preview = await get(base, `${uA}/preview`, tokenA);
    check(preview.status === 200, "PHASE2: invited A preview -> 200");
    check(
      (preview.json?.data as Jsonable).group.myStatus === "invited",
      "PHASE2: preview only exposes invited status",
    );
    const strangerPreview = await get(base, `/groups/${gAId}/preview`, tokenB);
    check(strangerPreview.status === 404, "PHASE2: non-peer preview -> 404 (no status leak)");

    /* ------------------------- Phase 3: accept  ---------------------------- */
    const accepted = await post(base, `${uA}/members/${a.id}/accept`, tokenA, {});
    check(accepted.status === 200, "PHASE3: A accepts own invite -> 200");
    const memberDetail = await get(base, uA, tokenA);
    check(memberDetail.status === 200, "PHASE3: A reads group as member -> 200");
    check(
      (memberDetail.json?.data as Jsonable).group.myRole === "member" &&
        (memberDetail.json?.data as Jsonable).group.myStatus === "active",
      "PHASE3: A is plain active member",
    );

    /* ------- Phase 4: A=member, role-level denials stay 403 ----------------- */
    await expectStatus(() => patch(base, uA, tokenA, { name: "hijack" }).then((r) => r.status), 403, "PHASE4 member update group");
    await expectStatus(() => del(base, uA, tokenA).then((r) => r.status), 403, "PHASE4 member archive group");
    await expectStatus(() => post(base, `${uA}/members`, tokenA, { userId: b.id }).then((r) => r.status), 403, "PHASE4 member invite");
    await expectStatus(() => patch(base, `${uA}/members/${b.id}/role`, tokenA, { role: "admin" }).then((r) => r.status), 403, "PHASE4 member change role");
    await expectStatus(() => patch(base, `${uA}/owner`, tokenA, { userId: a.id }).then((r) => r.status), 403, "PHASE4 member transfer owner");
    check((await get(base, `${uA}/members`, tokenA)).status === 200, "PHASE4: member can list members");

    /* -------- Phase 5: expense permissions (creator/owner only) ------------ */
    const eB = await post(base, `${uA}/expenses`, tokenB, groupExpenseBody(b.id, [a.id, b.id]));
    const eBId = (eB.json?.data as Jsonable).expense.id as string;
    check(eBId.length === 24, "PHASE5: B created group expense");
    check((await get(base, `${uA}/expenses/${eBId}`, tokenA)).status === 200, "PHASE5: member reads expense -> 200");
    await expectStatus(() => patch(base, `${uA}/expenses/${eBId}`, tokenA, { title: "hijack" }).then((r) => r.status), 403, "PHASE5 member edits B expense");
    await expectStatus(() => del(base, `${uA}/expenses/${eBId}`, tokenA).then((r) => r.status), 403, "PHASE5 member deletes B expense");
    await expectStatus(() => patch(base, `${uA}/expenses/${eBId}`, tokenB, { title: "legit" }).then((r) => r.status), 200, "PHASE5 creator edits own expense");
    const eA = await post(base, `${uA}/expenses`, tokenA, groupExpenseBody(a.id, [a.id, b.id]));
    const eAId = (eA.json?.data as Jsonable).expense.id as string;
    check(eAId.length === 24, "PHASE5: A created own expense");
    check((await patch(base, `${uA}/expenses/${eAId}`, tokenA, { title: "mine" })).status === 200, "PHASE5: A edits own expense");

    /* --------- Phase 6: settlement permission (creator/owner) -------------- */
    const sB = await post(base, `${uA}/settlements`, tokenB, settlementBody(b.id, a.id, 300));
    const sBId = (sB.json?.data as Jsonable).settlement.id as string;
    check(sBId.length === 24, "PHASE6: B recorded settlement");
    await expectStatus(() => patch(base, `${uA}/settlements/${sBId}/status`, tokenA, {}).then((r) => r.status), 403, "PHASE6 A cancels B's settlement");
    await expectStatus(() => patch(base, `${uA}/settlements/${sBId}/status`, tokenB, {}).then((r) => r.status), 200, "PHASE6 creator cancels own settlement");
    const sA = await post(base, `${uA}/settlements`, tokenA, settlementBody(a.id, b.id, 100));
    const sAId = (sA.json?.data as Jsonable).settlement.id as string;
    check(sAId.length === 24, "PHASE6: A (plain member) records settlement — active members may record");
    check((await patch(base, `${uA}/settlements/${sAId}/status`, tokenA, {})).status === 200, "PHASE6: A cancels own settlement");

    /* ------------- Phase 7: cross-group direct object reference ------------ */
    const gB2 = await post(base, "/groups", tokenB, { name: "Victim group 2", currency: CURRENCY });
    const gB2Id = (gB2.json?.data as Jsonable).group.id as string;
    const eB2 = await post(base, `/groups/${gB2Id}/expenses`, tokenB, groupExpenseBody(b.id, [b.id]));
    const eB2Id = (eB2.json?.data as Jsonable).expense.id as string;
    check(eB2Id.length === 24, "PHASE7: B created expense in gB2");
    await expectStatus(() => get(base, `/groups/${gB2Id}`, tokenA).then((r) => r.status), 404, "PHASE7 A reads gB2");
    await expectStatus(() => get(base, `/groups/${gB2Id}/expenses`, tokenA).then((r) => r.status), 404, "PHASE7 A lists gB2 expenses");
    await expectStatus(() => get(base, `${uA}/expenses/${eB2Id}`, tokenA).then((r) => r.status), 404, "PHASE7 cross-group expense read");
    await expectStatus(() => patch(base, `${uA}/expenses/${eB2Id}`, tokenA, { title: "x" }).then((r) => r.status), 404, "PHASE7 cross-group expense edit");
    await expectStatus(() => del(base, `${uA}/expenses/${eB2Id}`, tokenA).then((r) => r.status), 404, "PHASE7 cross-group expense delete");

    /* ------------- Phase 8: personal expense isolation --------------------- */
    const pA = await post(base, "/expenses/personal", tokenA, { title: "private", amountMinor: 500, currency: CURRENCY });
    const pAId = (pA.json?.data as Jsonable).expense.id as string;
    check(pAId.length === 24, "PHASE8: A created personal expense");
    check((await get(base, `/expenses/personal/${pAId}`, tokenA)).status === 200, "PHASE8: A reads own personal expense");
    await expectStatus(() => get(base, `/expenses/personal/${pAId}`, tokenB).then((r) => r.status), 404, "PHASE8 B cannot read A's personal expense");

    /* ------------- Phase 9: notification recipient scoping ----------------- */
    const bNotifs = await get(base, "/notifications", tokenB);
    const bItems = ((bNotifs.json?.data as Jsonable).items as Array<{ id?: string }>) ?? [];
    check(bNotifs.status === 200 && bItems.length > 0, "PHASE9: B has notifications");
    const bNotifId = bItems[0].id ?? "";
    check(bNotifId.length === 24, "PHASE9: B notification id available");
    await expectStatus(() => patch(base, `/notifications/${bNotifId}/read`, tokenA, {}).then((r) => r.status), 404, "PHASE9 A cannot read B's notification");
    await expectStatus(() => patch(base, `/notifications/${bNotifId}/read`, tokenB, {}).then((r) => r.status), 200, "PHASE9 B can read own notification");

    /* ------------- Phase 10: public user profile (by design) --------------- */
    const profile = await get(base, `/users/${b.id}`, tokenA);
    const profileUser = profile.json?.data as Jsonable;
    check(profile.status === 200, "PHASE10: A reads B profile -> 200");
    check(
      Object.keys(profileUser.user ?? {})
        .sort()
        .join(",") === "createdAt,email,id,name",
      "PHASE10: profile exposes only name/email/createdAt (no emailVerified/private fields)",
    );
    await expectStatus(() => get(base, `/users/${unknownId}`, tokenA).then((r) => r.status), 404, "PHASE10 unknown user -> 404");
    const searchPrefix = b.email.split("@")[0].slice(0, 14);
    const search = await get(base, `/users/search?q=${encodeURIComponent(searchPrefix)}`, tokenA);
    const searchUsers = (search.json?.data as Jsonable).users as Array<{ id?: string }> | undefined;
    check(search.status === 200 && (searchUsers ?? []).some((u) => u.id === b.id), "PHASE10: by-design search finds B");

    /* --------------- Phase 11: removed member => uniform 404 ---------------- */
    check((await del(base, `${uA}/members/${a.id}`, tokenB)).status === 200, "PHASE11: owner removes A");
    await expectStatus(() => get(base, uA, tokenA).then((r) => r.status), 404, "PHASE11 removed member detail");
    await expectStatus(() => get(base, `${uA}/expenses`, tokenA).then((r) => r.status), 404, "PHASE11 removed member expenses");
    await expectStatus(() => get(base, `${uA}/balances`, tokenA).then((r) => r.status), 404, "PHASE11 removed member balances");
    await expectStatus(() => post(base, `${uA}/settlements`, tokenA, settlementBody(a.id, b.id, 50)).then((r) => r.status), 404, "PHASE11 removed member settlement");
    await expectStatus(() => get(base, `${uA}/preview`, tokenA).then((r) => r.status), 404, "PHASE11 removed member preview");

    /* -------- Phase 12: re-invite positive control (404s were real) -------- */
    check((await post(base, `${uA}/members`, tokenB, { userId: a.id })).status === 200, "PHASE12: B re-invites A");
    check((await post(base, `${uA}/members/${a.id}/accept`, tokenA, {})).status === 200, "PHASE12: A accepts again");
    check((await get(base, uA, tokenA)).status === 200, "PHASE12: A active again -> 200");

    /* --------------- Phase 13: payload/id validation + unauth ---------------- */
    check((await get(base, `${uA}/expenses/not-an-id`, tokenA)).status === 400, "PHASE13: non-objectid path param -> 400");
    check((await get(base, uA)).status === 401, "PHASE13: no token -> 401");
  } finally {
    await srv.close();
    await cleanUp();
  }

  const residue = await User.countDocuments({ email: new RegExp(`\\${TEST_DOMAIN}$`) });
  check(residue === 0, `CLEANUP: no residue users remain (${residue})`);

  console.log(`\nauthorization checks passed: ${passCount.n}`);
  if (failures > 0) {
    console.log(`\nFAILURES (${failures}):\n- ${failuresList.join("\n- ")}\n`);
    console.log("ALL AUTHORIZATION SMOKE TESTS FAILED");
  } else {
    console.log("\nALL AUTHORIZATION SMOKE TESTS PASSED");
  }
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Authorization smoke crashed:", err);
  process.exit(2);
});