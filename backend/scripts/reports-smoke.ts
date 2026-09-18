/**
 * Live reports smoke tests — LIVE against the configured MongoDB and the real
 * HTTP stack (ephemeral app on 127.0.0.1).
 *
 * Verifies the P3 Reports + Export backend end to end:
 *   - authz: unauth 401; a specific groupId requires active membership (uniform
 *     404 for non-members and unknown IDs).
 *   - isolation: personal scope returns ONLY the actor's own personal expenses;
 *     group scope covers only groups the actor is an active member of.
 *   - range filtering: `from`/`to` are Inclusive UTC-day bounds; out-of-range
 *     expenses and settlements are excluded; an out-of-range settlement has no
 *     effect on the in-range net.
 *   - data: totals, category breakdown (shared classifier), per-group rows,
 *     actor paid/share/net (settlement-adjusted via the balances engine) and
 *     completed-settlement totals.
 *   - historical: archived groups remain readable/included for active members.
 *   - money: every figure is an integer in minor units (no float drift).
 *   - validation: bad scope/date/groupId combos return 400.
 *   - line items: the authorized transaction list is complete, correctly typed
 *     and sorted newest first (the CSV/PDF export source).
 *
 *   npx tsx scripts/reports-smoke.ts
 */
import type { AddressInfo } from "node:net";
import { once } from "node:events";
import mongoose, { Types } from "mongoose";
import bcrypt from "bcryptjs";
import { connectDatabase } from "../src/config/database.js";
import { createApp } from "../src/app.js";
import { User } from "../src/modules/auth/auth.model.js";
import { Group } from "../src/modules/groups/group.model.js";
import { Expense } from "../src/modules/expenses/expense.model.js";
import { Settlement } from "../src/modules/settlements/settlement.model.js";
import { Notification } from "../src/modules/notifications/notification.model.js";

const PASSWORD = "SmokeTest123";
const TEST_DOMAIN = "@mavi-reports-smoke.test";
const CURRENCY = "INR";

const FROM = "2026-01-01";
const TO = "2026-01-31";

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

const personalExpenseBody = (title: string, amountMinor: number, expenseDate: string) => ({
  title,
  amountMinor,
  currency: CURRENCY,
  expenseDate,
});

const groupExpenseBody = (
  title: string,
  amountMinor: number,
  payerId: string,
  participantIds: string[],
  expenseDate: string,
) => ({
  title,
  amountMinor,
  currency: CURRENCY,
  expenseDate,
  payerId,
  split: { method: "equal", equal: participantIds.map((userId) => ({ userId })) },
});

const settlementBody = (payerId: string, receiverId: string, amountMinor: number, date: string) => ({
  payerId,
  receiverId,
  amountMinor,
  currency: CURRENCY,
  date,
  idempotencyKey: `reports-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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
  const token =
    res.json?.data && typeof (res.json.data as Jsonable).token === "string"
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

const expenseFrom = (res: { json: Jsonable | null }): Jsonable =>
  (res.json?.data as Jsonable).expense as Jsonable;

const report = (base: string, token: string, query: string) =>
  get(base, `/reports/summary?${query}`, token);

const reportData = (res: { json: Jsonable | null }): Jsonable => (res.json?.data as Jsonable) ?? {};

const isInteger = (value: unknown): boolean => typeof value === "number" && Number.isInteger(value);

async function main(): Promise<void> {
  try {
    await connectDatabase();
  } catch {
    console.error("Could not connect to database");
    process.exit(2);
  }

  const srv = await startServer();
  const { base } = srv;

  try {
    const owner = await createVerifiedUser("Reports Owner");
    const member = await createVerifiedUser("Reports Member");
    const outsider = await createVerifiedUser("Reports Outsider");
    const tokenOwner = await login(base, owner.email);
    const tokenMember = await login(base, member.email);
    const tokenOutsider = await login(base, outsider.email);

    /* ----------------------------- setup --------------------------------- */
    const g1 = await post(base, "/groups", tokenOwner, { name: "Report group", currency: CURRENCY });
    const g1Id = ((g1.json?.data as Jsonable).group as Jsonable).id as string;
    const g3 = await post(base, "/groups", tokenOwner, { name: "Archived report group", currency: CURRENCY });
    const g3Id = ((g3.json?.data as Jsonable).group as Jsonable).id as string;
    check(g1Id.length === 24 && g3Id.length === 24, "SETUP: groups created");

    check((await post(base, `/groups/${g1Id}/members`, tokenOwner, { userId: member.id })).status === 200, "SETUP: member invited to g1");
    check((await post(base, `/groups/${g1Id}/members/${member.id}/accept`, tokenMember, {})).status === 200, "SETUP: member accepted g1");
    check((await post(base, `/groups/${g3Id}/members`, tokenOwner, { userId: member.id })).status === 200, "SETUP: member invited to g3");
    check((await post(base, `/groups/${g3Id}/members/${member.id}/accept`, tokenMember, {})).status === 200, "SETUP: member accepted g3");

    /* Group expenses (g1): one on the inclusive start day, one on the end day. */
    check(
      (await post(base, `/groups/${g1Id}/expenses`, tokenOwner, groupExpenseBody("Team lunch", 1000, owner.id, [owner.id, member.id], "2026-01-01T00:00:00.000Z"))).status === 201,
      "SETUP: g1 lunch created (range start)",
    );
    check(
      (await post(base, `/groups/${g1Id}/expenses`, tokenOwner, groupExpenseBody("Taxi ride", 600, member.id, [owner.id, member.id], "2026-01-31T00:00:00.000Z"))).status === 201,
      "SETUP: g1 taxi created (range end)",
    );
    check(
      (await post(base, `/groups/${g1Id}/expenses`, tokenOwner, groupExpenseBody("Old trip", 9999, owner.id, [owner.id, member.id], "2025-12-31T00:00:00.000Z"))).status === 201,
      "SETUP: g1 out-of-range (before) created",
    );
    check(
      (await post(base, `/groups/${g1Id}/expenses`, tokenOwner, groupExpenseBody("Future trip", 8888, owner.id, [owner.id, member.id], "2026-02-01T00:00:00.000Z"))).status === 201,
      "SETUP: g1 out-of-range (after) created",
    );
    check(
      (await post(base, `/groups/${g3Id}/expenses`, tokenOwner, groupExpenseBody("Movie night", 400, owner.id, [owner.id, member.id], "2026-01-15T00:00:00.000Z"))).status === 201,
      "SETUP: g3 movie created",
    );

    /* Personal expenses: owner's is in scope, member's must never leak. */
    check((await post(base, "/expenses/personal", tokenOwner, personalExpenseBody("Groceries", 200, "2026-01-05T00:00:00.000Z"))).status === 201, "SETUP: owner personal created");
    check((await post(base, "/expenses/personal", tokenMember, personalExpenseBody("Shopping spree", 500, "2026-01-06T00:00:00.000Z"))).status === 201, "SETUP: member personal created");

    /* Completed settlements: one in range (g1), one out of range (g3). */
    check(
      (await post(base, `/groups/${g1Id}/settlements`, tokenOwner, settlementBody(owner.id, member.id, 100, "2026-01-25T00:00:00.000Z"))).status === 201,
      "SETUP: g1 in-range settlement created",
    );
    check(
      (await post(base, `/groups/${g3Id}/settlements`, tokenOwner, settlementBody(owner.id, member.id, 50, "2025-12-20T00:00:00.000Z"))).status === 201,
      "SETUP: g3 out-of-range settlement created",
    );

    /* Archive g3 — active members must still be able to report on it. */
    check((await patch(base, `/groups/${g3Id}/archive`, tokenOwner, {})).status === 200, "SETUP: g3 archived");

    /* ------------------------- authz / validation ------------------------- */
    check((await get(base, `/reports/summary?scope=all&from=${FROM}&to=${TO}`)).status === 401, "AUTHZ: unauth -> 401");
    check((await report(base, tokenOutsider, `scope=group&groupId=${g1Id}&from=${FROM}&to=${TO}`)).status === 404, "AUTHZ: non-member group -> 404");
    check((await report(base, tokenOwner, `scope=group&groupId=${new Types.ObjectId().toString()}&from=${FROM}&to=${TO}`)).status === 404, "AUTHZ: unknown group -> 404");

    check((await report(base, tokenOwner, `scope=bogus&from=${FROM}&to=${TO}`)).status === 400, "VALIDATION: bad scope -> 400");
    check((await report(base, tokenOwner, `scope=personal&groupId=${g1Id}&from=${FROM}&to=${TO}`)).status === 400, "VALIDATION: personal + groupId -> 400");
    check((await report(base, tokenOwner, `scope=all&groupId=${g1Id}&from=${FROM}&to=${TO}`)).status === 400, "VALIDATION: all + groupId -> 400");
    check((await report(base, tokenOwner, `scope=group&from=${FROM}&to=${TO}`)).status === 400, "VALIDATION: group scope without groupId -> 400");
    check((await report(base, tokenOwner, `groupId=notanid&from=${FROM}&to=${TO}`)).status === 400, "VALIDATION: bad groupId -> 400");
    check((await report(base, tokenOwner, `from=2026-13-01&to=2026-13-02`)).status === 400, "VALIDATION: bad month -> 400");
    check((await report(base, tokenOwner, `from=2026-02-31&to=2026-03-01`)).status === 400, "VALIDATION: unreal day -> 400");
    check((await report(base, tokenOwner, `from=2026-02-01&to=2026-01-01`)).status === 400, "VALIDATION: from after to -> 400");
    check((await report(base, tokenOwner, `from=${FROM}`)).status === 400, "VALIDATION: from without to -> 400");

    /* ------------------------------ all scope ----------------------------- */
    const allRes = await report(base, tokenOwner, `scope=all&from=${FROM}&to=${TO}`);
    const all = reportData(allRes);
    check(allRes.status === 200, "ALL: 200");
    check(all.range && (all.range as Jsonable).from === FROM && (all.range as Jsonable).to === TO, "ALL: range echoed");
    check(all.scope === "all" && all.groupId === null && all.groupName === null, "ALL: scope/group echo");
    check(all.currency === CURRENCY, "ALL: currency echo");

    check(all.personalSpentMinor === 200, `ALL: personal spend only actor's own (got ${all.personalSpentMinor})`);
    check(all.groupSpentMinor === 2000, `ALL: group spend includes archived g3, excludes out-of-range (got ${all.groupSpentMinor})`);
    check(all.totalSpentMinor === 2200 && all.expenseCount === 4, `ALL: total 2200 across 4 expenses (got ${all.totalSpentMinor}/${all.expenseCount})`);
    check(all.groupExpenseCount === 3 && all.personalExpenseCount === 1, "ALL: expense count split");

    check(all.paidMinor === 1400 && all.owedMinor === 1000 && all.netMinor === 500, `ALL: actor rollup paid/owed/net (got ${all.paidMinor}/${all.owedMinor}/${all.netMinor})`);
    check(all.settlementCount === 1 && all.settlementTotalMinor === 100, `ALL: settlements in range only (got ${all.settlementCount}/${all.settlementTotalMinor})`);

    const groupRows = (all.groups as Jsonable[]) ?? [];
    check(groupRows.length === 2, `ALL: two group rows (got ${groupRows.length})`);
    const g1Row = groupRows.find((row) => row.groupId === g1Id);
    const g3Row = groupRows.find((row) => row.groupId === g3Id);
    check(Boolean(g1Row && g3Row), "ALL: g1 + g3 rows present");
    check(
      g1Row?.spentMinor === 1600 && g1Row?.expenseCount === 2 && g1Row?.myPaidMinor === 1000 && g1Row?.myOwedMinor === 800 && g1Row?.myNetMinor === 300,
      `ALL: g1 row figures + settlement-adjusted net (got ${JSON.stringify(g1Row)})`,
    );
    check(g1Row?.settlementCount === 1 && g1Row?.settlementTotalMinor === 100 && g1Row?.archived === false, "ALL: g1 settlement totals + active");
    check(
      g3Row?.spentMinor === 400 && g3Row?.myNetMinor === 200 && g3Row?.settlementCount === 0 && g3Row?.archived === true,
      `ALL: archived g3 row readable + out-of-range settlement excluded (got ${JSON.stringify(g3Row)})`,
    );

    const categories = (all.categories as Jsonable[]) ?? [];
    const categoryMap = new Map(categories.map((entry) => [entry.category, entry.amountMinor]));
    check(categories.length === 3, `ALL: three non-empty categories (got ${categories.length})`);
    check(categoryMap.get("Food & Drinks") === 1200, `ALL: Food & Drinks = group+personal (got ${categoryMap.get("Food & Drinks")})`);
    check(categoryMap.get("Travel") === 600, `ALL: out-of-range Travel excluded (got ${categoryMap.get("Travel")})`);
    check(categoryMap.get("Entertainment") === 400, "ALL: Entertainment from archived group");

    const transactions = (all.transactions as Jsonable[]) ?? [];
    check(transactions.length === 4, `ALL: authorized line items complete (got ${transactions.length})`);
    check(transactions[0]?.description === "Taxi ride", `ALL: newest-first ordering (got ${transactions[0]?.description})`);
    check(!transactions.some((tx) => tx.description === "Shopping spree"), "ALL: member personal never leaks");
    check(!transactions.some((tx) => tx.description === "Old trip" || tx.description === "Future trip"), "ALL: out-of-range items excluded");
    const personalTx = transactions.find((tx) => tx.description === "Groceries");
    check(personalTx?.type === "personal" && personalTx?.groupName === null && personalTx?.groupId === null, "ALL: personal line typed + no group");
    const groupTx = transactions.find((tx) => tx.description === "Team lunch");
    check(groupTx?.type === "group" && groupTx?.groupName === "Report group" && groupTx?.payerName === "Reports Owner", "ALL: group line typed + names resolved");
    check(typeof groupTx?.splitMethod === "string" && groupTx.splitMethod.length > 0, "ALL: split method present");

    const numericFields = [
      all.totalSpentMinor,
      all.groupSpentMinor,
      all.personalSpentMinor,
      all.paidMinor,
      all.owedMinor,
      all.netMinor,
      all.settlementTotalMinor,
      ...categories.map((c) => c.amountMinor),
      ...groupRows.flatMap((row) => [row.spentMinor, row.myPaidMinor, row.myOwedMinor, row.myNetMinor, row.settlementTotalMinor]),
      ...transactions.map((tx) => tx.amountMinor),
    ];
    check(numericFields.every(isInteger), "MONEY: every figure is an integer minor unit");

    /* ---------------------------- personal scope --------------------------- */
    const personalRes = await report(base, tokenOwner, `scope=personal&from=${FROM}&to=${TO}`);
    const personal = reportData(personalRes);
    check(personalRes.status === 200, "PERSONAL: 200");
    check(personal.scope === "personal", "PERSONAL: scope echo");
    check(personal.personalSpentMinor === 200 && personal.groupSpentMinor === 0 && personal.expenseCount === 1, `PERSONAL: only own spend (got ${personal.personalSpentMinor}/${personal.groupSpentMinor}/${personal.expenseCount})`);
    check(personal.paidMinor === 0 && personal.owedMinor === 0 && personal.netMinor === 0, "PERSONAL: no group metrics");
    check(((personal.groups as Jsonable[]) ?? []).length === 0, "PERSONAL: no group rows");
    check(((personal.transactions as Jsonable[]) ?? []).length === 1 && (personal.transactions as Jsonable[])[0]?.description === "Groceries", "PERSONAL: only own line item");

    /* ----------------------------- group scope ----------------------------- */
    const groupRes = await report(base, tokenOwner, `scope=group&groupId=${g1Id}&from=${FROM}&to=${TO}`);
    const group = reportData(groupRes);
    check(groupRes.status === 200, "GROUP: 200");
    check(group.groupId === g1Id && group.groupName === "Report group", "GROUP: group echo");
    check(group.groupSpentMinor === 1600 && group.personalSpentMinor === 0 && group.expenseCount === 2, `GROUP: g1 only, no personal (got ${group.groupSpentMinor}/${group.expenseCount})`);
    check(((group.groups as Jsonable[]) ?? []).length === 1, "GROUP: single group row");
    check(group.netMinor === 300 && group.settlementTotalMinor === 100, "GROUP: g1 net + settlement scoped");

    const implicitRes = await report(base, tokenOwner, `groupId=${g1Id}&from=${FROM}&to=${TO}`);
    const implicit = reportData(implicitRes);
    check(
      implicitRes.status === 200 && implicit.scope === "group" && implicit.personalSpentMinor === 0 && implicit.groupSpentMinor === 1600,
      "GROUP: groupId alone implies group scope (no personal leakage)",
    );

    /* ----------------------------- date windows ---------------------------- */
    const singleRes = await report(base, tokenOwner, `scope=group&groupId=${g1Id}&from=2026-01-01&to=2026-01-01`);
    const single = reportData(singleRes);
    check(single.expenseCount === 1 && single.groupSpentMinor === 1000, `WINDOW: single inclusive day start (got ${single.groupSpentMinor})`);

    const lateRes = await report(base, tokenOwner, `scope=all&from=2026-01-31&to=2026-01-31`);
    const late = reportData(lateRes);
    check(late.expenseCount === 1 && late.groupSpentMinor === 600, `WINDOW: inclusive end day only (got ${late.groupSpentMinor}/${late.expenseCount})`);

    const defaultRes = await report(base, tokenOwner, `scope=all`);
    const fallback = reportData(defaultRes);
    const fallbackRange = (fallback.range as Jsonable) ?? {};
    check(
      defaultRes.status === 200 &&
        typeof fallbackRange.from === "string" &&
        fallbackRange.from.endsWith("-01") &&
        String(fallbackRange.from) <= String(fallbackRange.to),
      "WINDOW: default range is the current month",
    );

    /* ------------------------- member isolation ---------------------------- */
    const memberRes = await report(base, tokenMember, `scope=all&from=${FROM}&to=${TO}`);
    const memberData = reportData(memberRes);
    check(memberData.personalSpentMinor === 500, `ISOLATION: member sees own personal (got ${memberData.personalSpentMinor})`);
    check(memberData.groupSpentMinor === 2000, "ISOLATION: member sees same shared groups");
    check(memberData.paidMinor === 600 && memberData.owedMinor === 1000 && memberData.netMinor === -500, `ISOLATION: member mirror figures (got ${memberData.paidMinor}/${memberData.owedMinor}/${memberData.netMinor})`);
    const memberTx = (memberData.transactions as Jsonable[]) ?? [];
    check(!memberTx.some((tx) => tx.description === "Groceries"), "ISOLATION: owner personal never leaks to member");
    check(memberTx.some((tx) => tx.description === "Shopping spree"), "ISOLATION: member sees own personal line");

    /* ------------------------- outsider isolation -------------------------- */
    const outsiderRes = await report(base, tokenOutsider, `scope=all&from=${FROM}&to=${TO}`);
    const outsiderData = reportData(outsiderRes);
    check(outsiderRes.status === 200 && outsiderData.expenseCount === 0 && ((outsiderData.groups as Jsonable[]) ?? []).length === 0, "ISOLATION: outsider sees nothing");

    /* ------------------------ archived group history ----------------------- */
    const archivedGroupRes = await report(base, tokenMember, `scope=group&groupId=${g3Id}&from=${FROM}&to=${TO}`);
    const archivedGroup = reportData(archivedGroupRes);
    check(archivedGroupRes.status === 200 && archivedGroup.groupSpentMinor === 400, "HISTORY: active member reports on archived group");
    check(archivedGroup.settlementCount === 0, "HISTORY: out-of-range g3 settlement excluded from archived report");
  } finally {
    await srv.close();
    await cleanUp();
  }

  const residue = await User.countDocuments({ email: new RegExp(`\\${TEST_DOMAIN}$`) });
  check(residue === 0, `CLEANUP: no residue users remain (${residue})`);

  console.log(`\nreports smoke checks passed: ${passCount.n}`);
  if (failures > 0) {
    console.log(`\nFAILURES (${failures}):\n- ${failuresList.join("\n- ")}\n`);
    console.log("ALL REPORTS SMOKE TESTS FAILED");
  } else {
    console.log("\nALL REPORTS SMOKE TESTS PASSED");
  }
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Reports smoke crashed:", err);
  process.exit(2);
});