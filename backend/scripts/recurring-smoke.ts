/**
 * Live recurring-expense smoke tests — LIVE against the configured MongoDB and
 * the real HTTP stack (ephemeral app on 127.0.0.1).
 *
 * Verifies the P4 recurring-expense milestone end to end:
 *   - Rule CRUD for personal + group rules with the documented authorization
 *     (creator-or-owner; non-members/invited -> 404; admins cannot touch others').
 *   - Generate Now is idempotent: a second call does not duplicate the expense.
 *   - The unique {rule, occurrenceKey} ledger is enforced at the DB level.
 *   - Generation reuses the normal expense path: group rule -> normal Expense
 *     with authoritative participantShares; personal rule -> personal Expense.
 *   - Recurring generation emits NO expense_created notifications while manual
 *     expense creation still does (no regression).
 *   - Missed occurrences are skipped, never backfilled.
 *   - Removing a participant makes generation fail safely without a false claim.
 *   - A creator leaving pauses their rules; archived groups block generation and
 *     restore resumes it; permanent delete cascades rules + ledger.
 *   - End dates deactivate a rule after its final occurrence.
 *
 *   npx tsx scripts/recurring-smoke.ts
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
import { Notification } from "../src/modules/notifications/notification.model.js";
import { RecurringGeneration } from "../src/modules/recurring/recurring.model.js";
import { RecurringRule } from "../src/modules/recurring/recurring.model.js";
import { processDueRules } from "../src/modules/recurring/recurring.service.js";
import { addDays, todayUtcDayKey } from "../src/modules/recurring/recurrence.js";

const PASSWORD = "SmokeTest123";
const TEST_DOMAIN = "@mavi-rec-smoke.test";
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

const ruleOf = (res: { json: Jsonable | null }): Jsonable =>
  (((res.json?.data as Jsonable)?.rule as Jsonable) ?? {});
const genOf = (res: { json: Jsonable | null }): Jsonable =>
  ((res.json?.data as Jsonable) ?? {});

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

  const rules = (await RecurringRule.find({
    $or: [{ owner: { $in: ids } }, { group: { $in: gids } }],
  }).select("_id")) as unknown as { _id: Types.ObjectId }[];
  const ruleIds = rules.map((r) => r._id);

  await RecurringGeneration.deleteMany({ rule: { $in: ruleIds } });
  await RecurringRule.deleteMany({ _id: { $in: ruleIds } });
  await Notification.deleteMany({ group: { $in: gids } });
  await Expense.deleteMany({ group: { $in: gids } });
  await Expense.deleteMany({ createdBy: { $in: ids } });
  await Group.deleteMany({ _id: { $in: gids } });
  await User.deleteMany({ _id: { $in: ids } });
}

const ledgerCount = (ruleId: string) => RecurringGeneration.countDocuments({ rule: new Types.ObjectId(ruleId) });
const ruleExpenseCount = async (ruleId: string): Promise<number> => {
  const ledger = await RecurringGeneration.find({ rule: new Types.ObjectId(ruleId) }).select("expense");
  const expenseIds = ledger.map((row) => row.expense).filter((id): id is Types.ObjectId => id !== null);
  if (expenseIds.length === 0) return 0;
  return Expense.countDocuments({ _id: { $in: expenseIds } });
};
const groupExpenseCount = (groupId: string) =>
  Expense.countDocuments({ group: new Types.ObjectId(groupId) });

async function main(): Promise<void> {
  try {
    await connectDatabase();
  } catch {
    console.error("Could not connect to database");
    process.exit(2);
  }

  const srv = await startServer();
  const { base } = srv;
  const today = todayUtcDayKey();

  try {
    const owner = await createVerifiedUser("Rec Owner");
    const admin = await createVerifiedUser("Rec Admin");
    const member = await createVerifiedUser("Rec Member");
    const outsider = await createVerifiedUser("Rec Outsider");
    const tokenOwner = await login(base, owner.email);
    const tokenAdmin = await login(base, admin.email);
    const tokenMember = await login(base, member.email);
    const tokenOutsider = await login(base, outsider.email);

    /* ------------------------------ setup -------------------------------- */
    const g1 = await post(base, "/groups", tokenOwner, { name: "Recurring group", currency: CURRENCY });
    const g1Id = ((g1.json?.data as Jsonable).group as Jsonable).id as string;
    check(g1Id.length === 24, "SETUP: group g1 created");
    check((await post(base, `/groups/${g1Id}/members`, tokenOwner, { userId: admin.id })).status === 200, "SETUP: admin invited");
    check((await post(base, `/groups/${g1Id}/members/${admin.id}/accept`, tokenAdmin, {})).status === 200, "SETUP: admin accepted");
    check((await post(base, `/groups/${g1Id}/members`, tokenOwner, { userId: member.id })).status === 200, "SETUP: member invited");
    check((await post(base, `/groups/${g1Id}/members/${member.id}/accept`, tokenMember, {})).status === 200, "SETUP: member accepted");

    const equalTo = (ids: string[]) => ({ method: "equal", equal: ids.map((userId) => ({ userId })) });
    const groupRuleBody = (over: Record<string, unknown> = {}) => ({
      title: "Recurring group rule",
      amountMinor: 90000,
      currency: CURRENCY,
      frequency: "daily",
      payerId: owner.id,
      split: equalTo([owner.id, admin.id]),
      ...over,
    });

    /* ==================== A. group rule CRUD + authz ===================== */
    const createA = await post(base, `/groups/${g1Id}/recurring`, tokenOwner, groupRuleBody());
    const ruleA = ruleOf(createA);
    check(createA.status === 201 && ruleA.id !== undefined, "A: owner creates group rule -> 201");
    check(ruleA.group === g1Id, "A: rule.group is the group id");
    check(ruleA.frequency === "daily" && ruleA.interval === 1, "A: frequency/interval persisted");
    check(ruleA.nextOccurrence === today && ruleA.startDate === today, "A: start defaults to today, next = today");
    check(ruleA.active === true && ruleA.splitMethod === "equal", "A: rule starts active with split method");
    check(ruleA.canManage === true, "A: creator canManage true");
    const ruleAId = ruleA.id as string;

    check((await post(base, `/groups/${g1Id}/recurring`, tokenOutsider, groupRuleBody())).status === 404, "A: non-member create -> 404");
    check((await get(base, `/groups/${g1Id}/recurring`, tokenOutsider)).status === 404, "A: non-member list -> 404");
    check((await get(base, `/groups/${g1Id}/recurring`)).status === 401, "A: unauth list -> 401");

    const listAsMember = await get(base, `/groups/${g1Id}/recurring`, tokenMember);
    check(listAsMember.status === 200, "A: member lists group rules -> 200");
    const memberViewOfA = (listAsMember.json?.data as Jsonable).rules as Jsonable[];
    check(memberViewOfA.length === 1 && memberViewOfA[0].canManage === false, "A: member sees rule but cannot manage it");

    check((await patch(base, `/groups/${g1Id}/recurring/${ruleAId}`, tokenMember, { title: "hax" })).status === 403, "A: member cannot edit owner's rule -> 403");
    check((await patch(base, `/groups/${g1Id}/recurring/${ruleAId}`, tokenAdmin, { title: "hax" })).status === 403, "A: admin cannot edit another's rule -> 403");
    check((await del(base, `/groups/${g1Id}/recurring/${ruleAId}`, tokenMember)).status === 403, "A: member cannot delete owner's rule -> 403");
    check((await patch(base, `/groups/${g1Id}/recurring/${ruleAId}`, tokenOwner, { title: "Recurring group rule v2" })).status === 200, "A: creator edits own rule -> 200");

    const createMine = await post(base, `/groups/${g1Id}/recurring`, tokenMember, groupRuleBody({ title: "Member rule", payerId: member.id, split: equalTo([member.id, owner.id]) }));
    const ruleMineId = ruleOf(createMine).id as string;
    check(createMine.status === 201, "A: member creates own rule -> 201");
    check((await patch(base, `/groups/${g1Id}/recurring/${ruleMineId}`, tokenOwner, { title: "Owner edited member rule" })).status === 200, "A: group owner can manage member's rule -> 200");
    check((await del(base, `/groups/${g1Id}/recurring/${ruleMineId}`, tokenOwner)).status === 200, "A: group owner deletes member's rule -> 200");
    check((await get(base, `/groups/${g1Id}/recurring/${ruleMineId}`, tokenMember)).status === 404, "A: deleted rule -> 404");
    check((await get(base, `/groups/${g1Id}/recurring/${ruleAId}`, tokenOutsider)).status === 404, "A: non-member get -> 404 (uniform)");

    /* ==================== B. personal rule CRUD ========================== */
    const createP = await post(base, "/recurring/personal", tokenOwner, { title: "Personal rule", amountMinor: 12345, frequency: "weekly" });
    const ruleP = ruleOf(createP);
    const rulePId = ruleP.id as string;
    check(createP.status === 201 && ruleP.group === null, "B: personal rule created (group null)");
    check(ruleP.payerId === owner.id && ruleP.splitMethod === "equal", "B: personal rule pays/equals owner");
    check(ruleP.startDate === today && ruleP.nextOccurrence === today, "B: personal start/next default to today");

    check((await post(base, "/recurring/personal", tokenOwner, { title: "x", amountMinor: 1, frequency: "daily", payerId: owner.id })).status === 400, "B: personal rule rejects payer -> 400");
    check((await post(base, "/recurring/personal", tokenOwner, { title: "x", amountMinor: 1, frequency: "daily", split: equalTo([owner.id]) })).status === 400, "B: personal rule rejects split -> 400");
    check((await post(base, "/recurring/personal", tokenOwner, { title: "x", amountMinor: 1, frequency: "hourly" })).status === 400, "B: unknown frequency -> 400");
    check((await post(base, "/recurring/personal", tokenOwner, { title: "x", amountMinor: 1, frequency: "daily", interval: 2 })).status === 400, "B: interval != 1 rejected -> 400");
    check((await get(base, `/recurring/personal/${rulePId}`, tokenMember)).status === 404, "B: others cannot read personal rule -> 404");

    const memberPersonal = await get(base, "/recurring/personal", tokenMember);
    check(((memberPersonal.json?.data as Jsonable).rules as Jsonable[]).length === 0, "B: personal list is per-user");

    const updateP = await patch(base, `/recurring/personal/${rulePId}`, tokenOwner, { amountMinor: 50000 });
    check(updateP.status === 200, "B: update personal amount -> 200");
    check(ruleOf(updateP).amountMinor === 50000, "B: amount updated");
    check(((ruleOf(updateP).splitInput as Jsonable).totalMinor) === 50000, "B: split totalMinor re-bound to new amount");

    const pauseP = await post(base, `/recurring/personal/${rulePId}/pause`, tokenOwner, {});
    check(pauseP.status === 200 && ruleOf(pauseP).active === false, "B: pause -> active false");
    check((await post(base, `/recurring/personal/${rulePId}/generate-now`, tokenOwner, {})).status === 409, "B: generate paused rule -> 409");
    const resumeP = await post(base, `/recurring/personal/${rulePId}/resume`, tokenOwner, {});
    check(resumeP.status === 200 && ruleOf(resumeP).active === true, "B: resume -> active true");
    check((await del(base, `/recurring/personal/${rulePId}`, tokenOwner)).status === 200, "B: delete personal rule -> 200");
    check((await get(base, `/recurring/personal/${rulePId}`, tokenOwner)).status === 404, "B: deleted personal rule -> 404");

    /* ============ C. generation + idempotency + notifications =========== */
    const createC = await post(base, `/groups/${g1Id}/recurring`, tokenOwner, groupRuleBody({ title: "Daily coffee", amountMinor: 30000, payerId: owner.id, split: equalTo([owner.id, admin.id]) }));
    const ruleCId = ruleOf(createC).id as string;
    const groupExpBefore = await groupExpenseCount(g1Id);
    const groupNotifBefore = await Notification.countDocuments({ group: new Types.ObjectId(g1Id) });

    const gen1 = await post(base, `/groups/${g1Id}/recurring/${ruleCId}/generate-now`, tokenOwner, {});
    const gen1Data = genOf(gen1);
    check(gen1.status === 200 && gen1Data.generated === true, "C: generate-now -> generated true");
    const generatedExpenseId = gen1Data.expenseId as string;
    check(typeof generatedExpenseId === "string" && generatedExpenseId.length === 24, "C: returns generated expense id");

    const genExpense = await Expense.findById(generatedExpenseId);
    check(genExpense !== null, "C: generated expense exists");
    check(genExpense?.group?.toString() === g1Id, "C: generated expense belongs to the group");
    check(genExpense?.createdBy.toString() === owner.id, "C: generated expense createdBy = rule owner");
    check(genExpense?.payerId.toString() === owner.id, "C: generated expense payer = rule payer");
    check(genExpense?.expenseDate.toISOString() === `${today}T00:00:00.000Z`, "C: expenseDate is UTC midnight of occurrence");
    check(genExpense?.splitMethod === "equal", "C: generated expense uses the rule split method");
    check(
      (genExpense?.participantShares ?? []).reduce((a, s) => a + s.amountMinor, 0) === 30000,
      "C: generated participantShares sum to the amount",
    );
    check(await groupExpenseCount(g1Id) === groupExpBefore + 1, "C: exactly one new group expense");
    check(await ledgerCount(ruleCId) === 1, "C: exactly one ledger row for the occurrence");

    const gen2 = await post(base, `/groups/${g1Id}/recurring/${ruleCId}/generate-now`, tokenOwner, {});
    check(gen2.status === 200 && genOf(gen2).generated === false, "C: second generate-now -> not generated (idempotent)");
    check(await groupExpenseCount(g1Id) === groupExpBefore + 1, "C: no duplicate expense on repeat");
    check(await ledgerCount(ruleCId) === 1, "C: ledger still single row");

    const ruleCAfter = await RecurringRule.findById(ruleCId);
    check(ruleCAfter?.nextOccurrence === addDays(today, 1), "C: next occurrence advanced to tomorrow");

    let duplicateRejected = false;
    try {
      await RecurringGeneration.create({
        rule: new Types.ObjectId(ruleCId),
        occurrenceKey: today,
        expense: null,
        generatedAt: new Date(),
      });
    } catch (err) {
      duplicateRejected =
        typeof err === "object" && err !== null && (err as { code?: number }).code === 11000;
    }
    check(duplicateRejected, "C: unique rule+occurrence index rejects duplicate ledger insert");

    check(
      (await Notification.countDocuments({
        group: new Types.ObjectId(g1Id),
        type: "expense_created",
        "metadata.expenseId": generatedExpenseId,
      })) === 0,
      "C: recurring generation emitted NO expense_created notification",
    );

    const manualExp = await post(base, `/groups/${g1Id}/expenses`, tokenOwner, {
      title: "Manual expense",
      amountMinor: 5000,
      currency: CURRENCY,
      payerId: owner.id,
      split: equalTo([owner.id, admin.id]),
    });
    check(manualExp.status === 201, "C: manual group expense still works -> 201");
    check(
      (await Notification.countDocuments({ group: new Types.ObjectId(g1Id), type: "expense_created" })) >= 1,
      "C: manual expense still emits expense_created notification (no regression)",
    );
    void groupNotifBefore;

    /* --------- C6: scheduled processDueRules path -------- */
    const createD = await post(base, `/groups/${g1Id}/recurring`, tokenOwner, groupRuleBody({ title: "Scheduled rule", payerId: owner.id, split: equalTo([owner.id, admin.id]) }));
    const ruleDId = ruleOf(createD).id as string;
    const scheduled = await processDueRules(today);
    check(scheduled.processed >= 1 && scheduled.generated >= 1, "C6: processDueRules generates due rules");
    check(await ruleExpenseCount(ruleDId) === 1, "C6: scheduled rule produced exactly one expense");
    const scheduledAgain = await processDueRules(today);
    check(await ruleExpenseCount(ruleDId) === 1, "C6: re-running scheduler is idempotent");
    void scheduledAgain;

    /* ============ D. missed occurrences are skipped ===================== */
    const createE = await post(base, `/groups/${g1Id}/recurring`, tokenOwner, groupRuleBody({ title: "Missed daily", startDate: addDays(today, -3), payerId: owner.id, split: equalTo([owner.id, admin.id]) }));
    const ruleEId = ruleOf(createE).id as string;
    check(ruleOf(createE).nextOccurrence === today, "D: past start resumes at today (no backfill)");
    const genE = await post(base, `/groups/${g1Id}/recurring/${ruleEId}/generate-now`, tokenOwner, {});
    check(genOf(genE).generated === true, "D: missed rule generates today's occurrence");
    check(await ruleExpenseCount(ruleEId) === 1, "D: only one expense created (missed days skipped)");

    const createF = await post(base, `/groups/${g1Id}/recurring`, tokenOwner, groupRuleBody({ title: "Missed weekly", frequency: "weekly", startDate: addDays(today, -10), payerId: owner.id, split: equalTo([owner.id, admin.id]) }));
    const ruleFId = ruleOf(createF).id as string;
    check(ruleOf(createF).nextOccurrence === addDays(today, 4), "D: weekly aligns to anchor weekday");
    check(genOf(await post(base, `/groups/${g1Id}/recurring/${ruleFId}/generate-now`, tokenOwner, {})).generated === false, "D: not-due rule generates nothing");
    check(await ruleExpenseCount(ruleFId) === 0, "D: no expense for a non-aligned day");

    /* ====== E. removed participant / creator leave handling ============== */
    const createG = await post(base, `/groups/${g1Id}/recurring`, tokenOwner, groupRuleBody({ title: "Participant leaves", payerId: owner.id, split: equalTo([owner.id, admin.id, member.id]) }));
    const ruleGId = ruleOf(createG).id as string;
    check((await del(base, `/groups/${g1Id}/members/${member.id}`, tokenOwner)).status === 200, "E: owner removes member -> 200");
    const expBeforeG = await groupExpenseCount(g1Id);
    const genG = await post(base, `/groups/${g1Id}/recurring/${ruleGId}/generate-now`, tokenOwner, {});
    check(genG.status === 400, "E: generation with removed participant -> 400 (safe failure)");
    check(await groupExpenseCount(g1Id) === expBeforeG, "E: no expense created on failed generation");
    check(await ledgerCount(ruleGId) === 0, "E: failed generation leaves no false-success claim");
    const ruleGAfter = await RecurringRule.findById(ruleGId);
    check(ruleGAfter !== null && ruleGAfter.active === true, "E: rule left intact/active after failure");
    check((await del(base, `/groups/${g1Id}/recurring/${ruleGId}`, tokenOwner)).status === 200, "E: cleanup rule G -> 200");

    const createH = await post(base, `/groups/${g1Id}/recurring`, tokenAdmin, groupRuleBody({ title: "Admin rule", payerId: admin.id, split: equalTo([admin.id, owner.id]) }));
    const ruleHId = ruleOf(createH).id as string;
    check(createH.status === 201, "E: admin creates own rule");
    check((await del(base, `/groups/${g1Id}/members/${admin.id}`, tokenAdmin)).status === 200, "E: admin leaves group -> 200");
    const ruleHAfter = await RecurringRule.findById(ruleHId);
    check(ruleHAfter !== null && ruleHAfter.active === false, "E: leaving creator's rule auto-paused");
    check((await post(base, `/groups/${g1Id}/recurring/${ruleHId}/generate-now`, tokenOwner, {})).status === 409, "E: paused rule generate-now -> 409");
    check((await get(base, `/groups/${g1Id}/recurring/${ruleHId}`, tokenOwner)).status === 200, "E: owner can still see paused rule");
    check((await del(base, `/groups/${g1Id}/recurring/${ruleHId}`, tokenOwner)).status === 200, "E: cleanup rule H -> 200");

    /* ====== F. archived group blocks generation; restore resumes ======== */
    const g2 = await post(base, "/groups", tokenOwner, { name: "Recurring restore group", currency: CURRENCY });
    const g2Id = ((g2.json?.data as Jsonable).group as Jsonable).id as string;
    check((await post(base, `/groups/${g2Id}/members`, tokenOwner, { userId: member.id })).status === 200, "F: g2 member invited");
    check((await post(base, `/groups/${g2Id}/members/${member.id}/accept`, tokenMember, {})).status === 200, "F: g2 member accepted");

    const createI = await post(base, `/groups/${g2Id}/recurring`, tokenOwner, {
      title: "Archive rule",
      amountMinor: 7000,
      currency: CURRENCY,
      frequency: "daily",
      payerId: owner.id,
      split: equalTo([owner.id, member.id]),
    });
    const ruleIId = ruleOf(createI).id as string;
    check(createI.status === 201, "F: g2 rule created");

    const archived = await patch(base, `/groups/${g2Id}/archive`, tokenOwner, {});
    check(archived.status === 200, "F: g2 archived");
    check((await get(base, `/groups/${g2Id}/recurring/${ruleIId}`, tokenOwner)).status === 200, "F: archived rules readable");
    check((await post(base, `/groups/${g2Id}/recurring/${ruleIId}/generate-now`, tokenOwner, {})).status === 409, "F: generation blocked while archived -> 409");
    check(await groupExpenseCount(g2Id) === 0, "F: no expense generated for archived group");

    check((await patch(base, `/groups/${g2Id}/restore`, tokenOwner, {})).status === 200, "F: g2 restored");
    const genI = await post(base, `/groups/${g2Id}/recurring/${ruleIId}/generate-now`, tokenOwner, {});
    check(genI.status === 200 && genOf(genI).generated === true, "F: generation resumes after restore");
    check(await groupExpenseCount(g2Id) === 1, "F: one expense after restore");

    /* ============ G. permanent delete cascades rules + ledger =========== */
    check((await patch(base, `/groups/${g2Id}/archive`, tokenOwner, {})).status === 200, "G: g2 re-archived");
    check((await del(base, `/groups/${g2Id}`, tokenOwner)).status === 200, "G: g2 permanently deleted");
    check(await RecurringRule.countDocuments({ group: new Types.ObjectId(g2Id) }) === 0, "G: group rules deleted");
    check(await RecurringGeneration.countDocuments({ rule: new Types.ObjectId(ruleIId) }) === 0, "G: generation ledger deleted");
    check(await groupExpenseCount(g2Id) === 0, "G: group expenses deleted (existing cascade intact)");

    /* ==================== H. end date semantics ========================= */
    const endRule = await post(base, "/recurring/personal", tokenOwner, {
      title: "Ending rule",
      amountMinor: 1000,
      frequency: "daily",
      startDate: today,
      endDate: today,
    });
    const endRuleId = ruleOf(endRule).id as string;
    check(endRule.status === 201, "H: rule with end date created");
    const genEnd = await post(base, `/recurring/personal/${endRuleId}/generate-now`, tokenOwner, {});
    check(genEnd.status === 200 && genOf(genEnd).generated === true, "H: final occurrence generated");
    const endRuleAfter = await RecurringRule.findById(endRuleId);
    check(endRuleAfter !== null && endRuleAfter.active === false, "H: rule deactivated after final occurrence");
    check((await post(base, `/recurring/personal/${endRuleId}/generate-now`, tokenOwner, {})).status === 409, "H: generate on exhausted rule -> 409");

    check(
      (await post(base, "/recurring/personal", tokenOwner, { title: "bad", amountMinor: 1, frequency: "daily", startDate: today, endDate: addDays(today, -1) })).status === 400,
      "H: endDate before startDate -> 400",
    );
    const pastWindow = await post(base, "/recurring/personal", tokenOwner, {
      title: "past window",
      amountMinor: 1,
      frequency: "daily",
      startDate: addDays(today, -10),
      endDate: addDays(today, -5),
    });
    check(pastWindow.status === 400, "H: recurrence window already ended -> 400");

    /* ==================== I. personal generation ======================== */
    const personalRule = await post(base, "/recurring/personal", tokenOwner, { title: "Personal generate", amountMinor: 4321, frequency: "daily" });
    const personalRuleId = ruleOf(personalRule).id as string;
    const genPersonal = await post(base, `/recurring/personal/${personalRuleId}/generate-now`, tokenOwner, {});
    check(genPersonal.status === 200 && genOf(genPersonal).generated === true, "I: personal generate-now -> generated");
    const personalExpenseId = genOf(genPersonal).expenseId as string;
    const personalDoc = await Expense.findById(personalExpenseId);
    check(personalDoc !== null && personalDoc.group === null, "I: personal generated expense has no group");
    check(personalDoc?.createdBy.toString() === owner.id, "I: personal generated expense owned by user");
    check(personalDoc?.expenseDate.toISOString() === `${today}T00:00:00.000Z`, "I: personal expenseDate is UTC midnight");
    check(await ledgerCount(personalRuleId) === 1, "I: personal ledger row created");
  } finally {
    await srv.close();
    await cleanUp();
  }

  const residue = await User.countDocuments({ email: new RegExp(`\\${TEST_DOMAIN}$`) });
  check(residue === 0, `CLEANUP: no residue users remain (${residue})`);

  console.log(`\nrecurring smoke checks passed: ${passCount.n}`);
  if (failures > 0) {
    console.log(`\nFAILURES (${failures}):\n- ${failuresList.join("\n- ")}\n`);
    console.log("ALL RECURRING SMOKE TESTS FAILED");
  } else {
    console.log("\nALL RECURRING SMOKE TESTS PASSED");
  }
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Recurring smoke crashed:", err);
  process.exit(2);
});
