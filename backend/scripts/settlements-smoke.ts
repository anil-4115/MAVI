/**
 * Live smoke tests for H.7 Settlements + balance integration.
 * Runs against the configured MongoDB (reads backend/.env; never modifies it).
 * Creates throwaway users/groups/expenses/settlements and cleans up afterward.
 *
 *   npx tsx scripts/settlements-smoke.ts
 */
import mongoose, { Types } from "mongoose";
import bcrypt from "bcryptjs";
import { connectDatabase } from "../src/config/database.js";
import { ApiError } from "../src/utils/ApiError.js";
import { User } from "../src/modules/auth/auth.model.js";
import { Group } from "../src/modules/groups/group.model.js";
import { Expense } from "../src/modules/expenses/expense.model.js";
import { createGroupExpense } from "../src/modules/expenses/expense.service.js";
import { validateCreateExpense } from "../src/modules/expenses/expense.validation.js";
import { Settlement } from "../src/modules/settlements/settlement.model.js";
import { Notification } from "../src/modules/notifications/notification.model.js";
import { cancelSettlement, createSettlement, listSettlements } from "../src/modules/settlements/settlement.service.js";
import { getGroupBalances } from "../src/modules/balances/balances.service.js";
import { getDashboard } from "../src/modules/balances/dashboard.service.js";

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

const expectApiError = async (fn: () => Promise<unknown>, status: number, label: string): Promise<void> => {
  try {
    await fn();
    check(false, `${label}: expected ApiError ${status}, got success`);
  } catch (err) {
    const got = err instanceof ApiError ? err.statusCode : err instanceof mongoose.Error.CastError ? 400 : 500;
    check(got === status, `${label}: expected ApiError ${status} (got ${got}: ${err instanceof Error ? err.message : String(err)})`);
  }
};

const netOf = async (groupId: string, actorId: string, userId: string): Promise<number | undefined> => {
  const balances = await getGroupBalances(groupId, actorId);
  return balances.members.find((m) => m.userId === userId)?.netMinor;
};

let idempotencyCounter = 0;
const settleInput = (payerId: string, receiverId: string, amountMinor: number, note?: string) => ({
  payerId,
  receiverId,
  amountMinor,
  currency: "INR",
  date: new Date(),
  note,
  idempotencyKey: `smoke-${++idempotencyCounter}-${Date.now()}`,
});

async function main(): Promise<void> {
  const cleanIds = { users: [] as string[], groups: [] as string[], expenses: [] as string[] };
  let g1 = "";

  try {
    await connectDatabase();

    /* -------------------- idempotent pre-clean of leftovers ------------------ */
    /* Remove any data left behind by a previously crashed smoke run.           */
    const smokeUsers = await User.find({ email: /@mavi-smoke\.test$/ }).select("_id");
    const smokeUserIds = smokeUsers.map((u) => u._id);
    if (smokeUserIds.length > 0) {
      const smokeGroups = await Group.find({ "members.userId": { $in: smokeUserIds } }).select("_id");
      const smokeGroupIds = smokeGroups.map((g) => g._id);
      await Notification.deleteMany({ group: { $in: smokeGroupIds } });
      await Settlement.deleteMany({ group: { $in: smokeGroupIds } });
      await Expense.deleteMany({ group: { $in: smokeGroupIds } });
      await Group.deleteMany({ _id: { $in: smokeGroupIds } });
      await User.deleteMany({ _id: { $in: smokeUserIds } });
    }

    /* ------------------------------- setup ---------------------------------- */
    const hash = await bcrypt.hash("testpass123", 4);
    const makeUser = async (name: string): Promise<string> => {
      const user = (await User.create({ name, email: `${name.toLowerCase()}-${Date.now()}@mavi-smoke.test`, passwordHash: hash })) as unknown as { _id: Types.ObjectId };
      cleanIds.users.push(user._id.toString());
      return user._id.toString();
    };

    const [aId, bId, cId, dId] = await Promise.all([makeUser("Alice"), makeUser("Bob"), makeUser("Carol"), makeUser("Dave")]);

    const makeGroup = async (name: string, members: { userId: string; role: string; status: string }[]): Promise<string> => {
      const group = (await Group.create({
        name,
        description: "temporary smoke-test group",
        currency: "INR",
        createdBy: members[0].userId,
        members: members.map((m) => ({ ...m, joinedAt: new Date() })),
        archived: false,
        archivedAt: null,
      })) as unknown as { _id: Types.ObjectId };
      cleanIds.groups.push(group._id.toString());
      return group._id.toString();
    };

    g1 = await makeGroup("H7 Smoke Group 1", [
      { userId: aId, role: "owner", status: "active" },
      { userId: bId, role: "member", status: "active" },
      { userId: cId, role: "member", status: "active" },
    ]);

    /* Group expense: A pays 1000, equal split A/B/C -> shares A334 B333 C333. */
    const expenseInput = validateCreateExpense({
      title: "Team dinner",
      amountMinor: 1000,
      currency: "INR",
      expenseDate: new Date(),
      payerId: aId,
      split: {
        method: "equal",
        totalMinor: 1000,
        currency: "INR",
        equal: [aId, bId, cId].map((userId) => ({ userId })),
      },
    });
    const expense = await createGroupExpense(g1, aId, expenseInput);
    cleanIds.expenses.push(expense.id);

    /* --------------------------------- Test A -------------------------------- */
    /* Create completed settlement + balance integration (partial settlement).  */
    const s1 = await createSettlement(g1, bId, settleInput(bId, aId, 133, "first payment"));
    check(s1.status === "completed" && s1.payerId === bId && s1.receiverId === aId && s1.amountMinor === 133,
      "A.create: completed settlement with payer/receiver/amount/note");
    check(s1.group === g1 && s1.createdBy === bId, "A.create: group and createdBy set");

    check((await netOf(g1, aId, aId)) === 533, "A.balance: after B->A 133, A net = 533");
    check((await netOf(g1, aId, bId)) === -200, "A.balance.partial: B net = -200 (500 debt, 133 settled)");
    check((await netOf(g1, aId, cId)) === -333, "A.balance: C net unchanged = -333");

    /* ------------------------------- Test B: full ---------------------------- */
    const s2 = await createSettlement(g1, bId, settleInput(bId, aId, 200, "rest"));
    check(s2.status === "completed", "B.create: second settlement created");
    check((await netOf(g1, aId, bId)) === 0, "B.balance.full: B net = 0 after full settlement");
    check((await netOf(g1, aId, aId)) === 333, "B.balance: A net = 333 (only C remains)");
    // multiple settlements between same users accumulate (133+200 = 333)
    check((await netOf(g1, aId, aId)) === 333, "B.multi: same-pair settlements accumulate");

    /* ------------------------- Test C: over-settlement ----------------------- */
    // C owes A 333 but settles 500 -> A ends up owing C 167; balanced flips.
    const s3 = await createSettlement(g1, cId, settleInput(cId, aId, 500, "advance"));
    check((await netOf(g1, aId, aId)) === -167, "C.over: A net flips to -167 after over-settlement");
    check((await netOf(g1, aId, cId)) === 167, "C.over: C net = +167");

    const b1 = await getGroupBalances(g1, aId);
    const acPair = b1.pairwise.find((p) => (p.userIdA === aId && p.userIdB === cId) || (p.userIdA === cId && p.userIdB === aId));
    check(acPair?.netMinor === 167, `C.over.pair: A owes C 167 (got ${acPair?.netMinor})`);

    // Cancel the over-settlement -> balances revert.
    const s3c = await cancelSettlement(g1, s3.id, cId);
    check(s3c.status === "cancelled", "C.cancel: over-settlement cancelled");
    check((await netOf(g1, aId, aId)) === 333, "C.cancel.revert: A net back to 333");
    check((await netOf(g1, aId, cId)) === -333, "C.cancel.revert: C net back to -333");
    // cannot cancel twice
    await expectApiError(() => cancelSettlement(g1, s3.id, cId), 409, "C.cancel-twice");
    // historical record remains visible as cancelled
    const cancelledList = await listSettlements(g1, aId, 1, 20, 0, "cancelled");
    check(cancelledList.items.some((s) => s.id === s3.id && s.status === "cancelled"), "C.historical: cancelled settlement still listed");

    /* --------------------------- Test D: authorization ----------------------- */
    const s4 = await createSettlement(g1, cId, settleInput(cId, bId, 100));
    // B is not creator and not owner -> 403
    await expectApiError(() => cancelSettlement(g1, s4.id, bId), 403, "D.unauthorized-cancel");
    // Owner A can cancel
    const s4after = await cancelSettlement(g1, s4.id, aId);
    check(s4after.status === "cancelled", "D.owner-cancel: owner cancels C's settlement");
    await expectApiError(() => cancelSettlement(g1, s4.id, aId), 409, "D.owner-cancel-twice");

    /* ------------------------------ Test E: validation ------------------------ */
    await expectApiError(() => createSettlement(g1, aId, settleInput(dId, aId, 100)), 400, "E.non-member-payer");
    await expectApiError(() => createSettlement(g1, aId, settleInput(aId, dId, 100)), 400, "E.non-member-receiver");
    await expectApiError(() => createSettlement(g1, aId, settleInput(aId, aId, 100)), 400, "E.payer-equals-receiver");
    await expectApiError(() => createSettlement(g1, bId, settleInput(bId, aId, 0)), 400, "E.amount-zero");
    await expectApiError(() => createSettlement(g1, bId, settleInput(bId, aId, 1.5)), 400, "E.amount-non-integer");
    await expectApiError(
      () => createSettlement(g1, bId, { ...settleInput(bId, aId, 100), date: "not-a-date" }),
      400,
      "E.invalid-date",
    );
    await expectApiError(
      () => createSettlement(g1, bId, { ...settleInput(bId, aId, 100), note: "x".repeat(301) }),
      400,
      "E.note-too-long",
    );
    await expectApiError(() => createSettlement(g1, bId, { ...settleInput(bId, aId, 100), currency: "USD" }), 400, "E.bad-currency");
    await expectApiError(() => createSettlement(new Types.ObjectId().toString(), aId, settleInput(bId, aId, 100)), 404, "E.invalid-group");

    /* ------------------------------ Test F: pagination ------------------------ */
    await createSettlement(g1, bId, settleInput(bId, aId, 25, "p1"));
    await createSettlement(g1, cId, settleInput(cId, aId, 40, "p2"));
    await createSettlement(g1, bId, settleInput(bId, aId, 30, "p3"));

    const page1 = await listSettlements(g1, aId, 1, 2, 0);
    check(page1.items.length === 2 && page1.total === 7 && page1.totalPages === 4, `F.pagination: page1 = 2 items, total 7, pages 4 (got ${page1.items.length}/${page1.total}/${page1.totalPages})`);
    const page2 = await listSettlements(g1, aId, 2, 2, 2);
    check(page2.items.length === 2 && page2.page === 2, "F.pagination: page2 correct");
    const newestFirst = page1.items[0].date >= page1.items[1].date;
    check(newestFirst, "F.pagination: newest first ordering");

    const completedFilter = await listSettlements(g1, aId, 1, 20, 0, "completed");
    check(completedFilter.total === 5, `F.filter: completed filter total 5 (got ${completedFilter.total})`);
    await expectApiError(() => listSettlements(g1, aId, 1, 20, 0, "paid" as never), 400, "F.filter-invalid-status");

    /* ------------------------------ Test G: archived -------------------------- */
    // deterministic standalone record: B->A 50. Tracking it as g1s (created
    // while the group is still writable) keeps the final balance arithmetic
    // exact instead of coupling to whichever item the newest-first page returns.
    const g1s = await createSettlement(g1, bId, settleInput(bId, aId, 50, "archived-cancel"));
    await Group.updateOne({ _id: g1 }, { $set: { archived: true, archivedAt: new Date() } });
    await expectApiError(() => createSettlement(g1, bId, settleInput(bId, aId, 10)), 409, "G.archive-rejects-new");
    // historical settlements remain viewable in archived group
    const archivedList = await listSettlements(g1, aId, 1, 20, 0);
    check(archivedList.total > 0, "G.archive-list: historical settlements viewable");
    // cancellation still allowed under existing rules (owner A) and preserves history
    const gCancel = await cancelSettlement(g1, g1s.id, aId);
    check(gCancel.status === "cancelled", "G.archive-cancel: owner can cancel historical settlement in archived group");
    await Group.updateOne({ _id: g1 }, { $set: { archived: false, archivedAt: null } });

    /* --------------------------- Test H: removed member ----------------------- */
    await Group.updateOne({ _id: g1 }, { $set: { "members.$[m].status": "declined" } }, { arrayFilters: [{ "m.userId": new Types.ObjectId(bId) }] });
    await expectApiError(() => createSettlement(g1, bId, settleInput(bId, aId, 10)), 404, "H.removed-cannot-create");
    await expectApiError(() => createSettlement(g1, aId, settleInput(bId, aId, 10)), 400, "H.removed-payer-rejected");
    const historical = await listSettlements(g1, aId, 1, 20, 0, "completed");
    check(historical.items.some((s) => s.payerId === bId), "H.removed-history: B's historical settlements remain visible");
    const balAfterRemove = await getGroupBalances(g1, aId);
    const bMember = balAfterRemove.members.find((m) => m.userId === bId);
    check(bMember !== undefined && bMember.active === false, "H.removed-history: B still appears with historical position (inactive)");

    /* ----------------------------- Test I: dashboard -------------------------- */
    const dash = await getDashboard(aId);
    check(dash.recentSettlements.some((s) => s.groupId === g1), "I.dashboard: recent settlements contains real completed data");
    check(dash.recentSettlements.length >= 1, `I.dashboard: recent settlements count >= 1 (got ${dash.recentSettlements.length})`);

    /* --------------------------- Test J: cross-group -------------------------- */
    const g2 = await makeGroup("H7 Smoke Group 2", [
      { userId: aId, role: "owner", status: "active" },
      { userId: cId, role: "member", status: "active" },
    ]);
    const exp2 = validateCreateExpense({
      title: "Taxi",
      amountMinor: 400,
      currency: "INR",
      expenseDate: new Date(),
      payerId: aId,
      split: { method: "equal", totalMinor: 400, currency: "INR", equal: [aId, cId].map((userId) => ({ userId })) },
    });
    const e2 = await createGroupExpense(g2, aId, exp2);
    cleanIds.expenses.push(e2.id);
    await createSettlement(g2, cId, settleInput(cId, aId, 100));

    check((await netOf(g2, aId, cId)) === -100, "J.cross: group2 C net = -100 after its settlement");
    const g1After = await getGroupBalances(g1, aId);
    const aNet = g1After.members.find((m) => m.userId === aId)?.netMinor;
    check(aNet === 238, `J.cross: group1 balances unaffected by group2 settlement (A = 238, got ${aNet})`);
    check(!g1After.settlements.some((s) => s.groupId === g2), "J.cross: group1 settlement list excludes group2");

    /* ---------------------------- Test K: idempotency ------------------------ */
    const idemKey = `smoke-idem-${Date.now()}`;
    const k1 = await createSettlement(g2, cId, { ...settleInput(cId, aId, 60, "once"), idempotencyKey: idemKey });
    const k1Replay = await createSettlement(g2, cId, { ...settleInput(cId, aId, 60, "once"), idempotencyKey: idemKey });
    check(k1Replay.id === k1.id && k1Replay.amountMinor === 60, "K.replay: same key returns the original settlement (no duplicate)");
    const k1Conflict = await createSettlement(g2, cId, { ...settleInput(cId, aId, 999, "conflict"), idempotencyKey: idemKey });
    check(k1Conflict.id === k1.id && k1Conflict.amountMinor === 60, "K.conflict: same key, different payload still returns the original");
    const k2 = await createSettlement(g2, cId, { ...settleInput(cId, aId, 60, "twice"), idempotencyKey: `${idemKey}-2` });
    check(k2.id !== k1.id, "K.distinct: a new key creates a new settlement even with identical fields");
    const settleNotifsA = await Notification.find({
      group: new Types.ObjectId(g2),
      recipient: new Types.ObjectId(aId),
      type: "settlement_recorded",
    }).lean();
    check(
      settleNotifsA.length === 3,
      `K.notify: replays did not re-emit notifications (got ${settleNotifsA.length}, expected 3)`,
    );

    /* ------------------------ invariant sanity check ------------------------- */
    const finalBal = await getGroupBalances(g1, aId);
    const sumNet = finalBal.members.reduce((acc, m) => acc + m.netMinor, 0);
    check(sumNet === 0, "final: sum(net) === 0 across members");
    const allInts = finalBal.members.every((m) => Number.isInteger(m.paidMinor) && Number.isInteger(m.owedMinor) && Number.isInteger(m.netMinor));
    check(allInts, "final: all amounts are integer minor units");
  } finally {
    /* ------------------------------- cleanup --------------------------------- */
    await Notification.deleteMany({ group: { $in: cleanIds.groups } });
    await Settlement.deleteMany({ group: { $in: cleanIds.groups } });
    await Expense.deleteMany({ _id: { $in: cleanIds.expenses } });
    await Group.deleteMany({ _id: { $in: cleanIds.groups } });
    await User.deleteMany({ _id: { $in: cleanIds.users } });
    await mongoose.disconnect();
  }
}

main()
  .then(() => {
    console.log("PASS=" + passCount.n + " FAIL=" + failures);
    if (failures > 0) {
      failuresList.forEach((f) => console.log(f));
      process.exit(1);
    }
    process.exit(0);
  })
  .catch((err) => {
    console.error("Smoke run crashed:", err);
    process.exit(1);
  });