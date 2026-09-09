/**
 * Live smoke tests for H.8 Notifications + integration with groups/expenses/settlements.
 * Runs against the configured MongoDB (reads backend/.env; never modifies it).
 * Creates throwaway users/groups/expenses/settlements/notifications and cleans up.
 *
 *   npx tsx scripts/notifications-smoke.ts
 */
import mongoose, { Types } from "mongoose";
import bcrypt from "bcryptjs";
import { connectDatabase } from "../src/config/database.js";
import { ApiError } from "../src/utils/ApiError.js";
import { User } from "../src/modules/auth/auth.model.js";
import { Group } from "../src/modules/groups/group.model.js";
import { Expense } from "../src/modules/expenses/expense.model.js";
import { Settlement } from "../src/modules/settlements/settlement.model.js";
import { Notification } from "../src/modules/notifications/notification.model.js";
import {
  archiveGroup,
  changeRole,
  createGroup,
  inviteMember,
  removeMember,
  respondToInvitation,
  transferOwnership,
} from "../src/modules/groups/group.service.js";
import { validateAddMember, validateCreateGroup, validateRole } from "../src/modules/groups/group.validation.js";
import { createGroupExpense } from "../src/modules/expenses/expense.service.js";
import { validateCreateExpense } from "../src/modules/expenses/expense.validation.js";
import { createSettlement } from "../src/modules/settlements/settlement.service.js";
import {
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../src/modules/notifications/notification.service.js";
import type { NotificationType } from "../src/modules/notifications/notification.types.js";

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

const latestNotification = async (userId: string, type?: NotificationType) => {
  const res = await listNotifications(userId, 1, 20, 0, type ? { type } : {});
  return res.items[0];
};

const settleInput = (payerId: string, receiverId: string, amountMinor: number) => ({
  payerId,
  receiverId,
  amountMinor,
  currency: "INR",
  date: new Date(),
});

async function main(): Promise<void> {
  const cleanIds = { users: [] as string[], groups: [] as string[], expenses: [] as string[] };
  let g1 = "";

  try {
    await connectDatabase();

    /* -------------------- idempotent pre-clean of leftovers ------------------ */
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

    const [aId, bId, cId, dId, eId] = await Promise.all([
      makeUser("Alice"),
      makeUser("Bob"),
      makeUser("Carol"),
      makeUser("Dave"),
      makeUser("Eve"),
    ]);

    g1 = (await createGroup(validateCreateGroup({ name: "H8 Smoke Group", description: "notifications smoke", currency: "INR" }), aId)).id;
    cleanIds.groups.push(g1);

    /* ------------------------- Test A: group_invitation ---------------------- */
    await inviteMember(g1, aId, validateAddMember({ userId: bId }));
    await inviteMember(g1, aId, validateAddMember({ userId: cId }));
    await inviteMember(g1, aId, validateAddMember({ userId: dId }));
    await inviteMember(g1, aId, validateAddMember({ userId: eId }));

    for (const [label, userId] of [
      ["A.invite-b", bId],
      ["A.invite-c", cId],
      ["A.invite-d", dId],
      ["A.invite-e", eId],
    ] as const) {
      check((await getUnreadCount(userId)) === 1, `${label}: invitee has 1 unread`);
      const n = await latestNotification(userId, "group_invitation");
      check(n !== undefined && n.type === "group_invitation" && n.actor === aId && n.group === g1, `${label}: group_invitation from owner`);
      check(n !== undefined && n.metadata.inviteeId === userId && n.metadata.groupName === "H8 Smoke Group" && n.read === false, `${label}: metadata invitee + group name, unread`);
    }

    /* ---------------------- Test B: invitation_accepted ---------------------- */
    await respondToInvitation(g1, bId, "accept");
    await respondToInvitation(g1, cId, "accept");
    await respondToInvitation(g1, eId, "accept");
    await respondToInvitation(g1, dId, "decline");

    check((await getUnreadCount(aId)) === 3, "B.accept: owner A has 3 unread (B, C, E)");
    const aAccepted = await listNotifications(aId, 1, 20, 0, { type: "invitation_accepted" });
    check(aAccepted.total === 3 && aAccepted.items.every((n) => n.type === "invitation_accepted" && n.actor !== aId), "B.accept: all three new notifications are invitation_accepted");
    const acceptorIds = aAccepted.items.map((n) => String(n.metadata.acceptorId));
    check(sameUserSet(acceptorIds, [bId, cId, eId]), "B.accept: metadata.acceptorId covers B, C, E");
    check((await getUnreadCount(dId)) === 1, "B.decline: declining sends no new notification (D still has only the invitation)");

    /* ------------------------- Test C: role_changed -------------------------- */
    await changeRole(g1, aId, cId, validateRole({ role: "admin" }));
    check((await getUnreadCount(cId)) === 2, "C.role: C has 2 unread (invitation + role_changed)");
    const roleNotif = await latestNotification(cId, "role_changed");
    check(roleNotif !== undefined && roleNotif.actor === aId && roleNotif.metadata.role === "admin", "C.role: role_changed metadata carries the new role");

    /* ------------------------ Test D: expense_created ------------------------ */
    const expInput = validateCreateExpense({
      title: "Team dinner",
      amountMinor: 3000,
      currency: "INR",
      expenseDate: new Date(),
      payerId: aId,
      split: { method: "equal", totalMinor: 3000, currency: "INR", equal: [aId, bId, cId].map((userId) => ({ userId })) },
    });
    const expense = await createGroupExpense(g1, aId, expInput);
    cleanIds.expenses.push(expense.id);

    check((await getUnreadCount(bId)) === 2 && (await getUnreadCount(cId)) === 3 && (await getUnreadCount(eId)) === 2, "D.expense: B/C/E each got expense_created");
    check((await getUnreadCount(aId)) === 3 && (await getUnreadCount(dId)) === 1, "D.expense: creator A and declined D are not notified");
    const expNotif = await latestNotification(bId, "expense_created");
    check(
      expNotif !== undefined && expNotif.actor === aId && expNotif.metadata.expenseId === expense.id && expNotif.metadata.title === "Team dinner" && expNotif.metadata.amountMinor === 3000 && expNotif.metadata.currency === "INR",
      "D.expense: metadata carries expense id/title/amount/currency",
    );
    check(expNotif !== undefined && expNotif.group === g1, "D.expense: notification is scoped to the group");

    /* ------------------------ Test E: settlement_recorded -------------------- */
    await createSettlement(g1, bId, settleInput(bId, aId, 500));
    check((await getUnreadCount(aId)) === 4, "E.settle: receiver A notified (unread 4)");
    check((await getUnreadCount(bId)) === 2, "E.settle: actor payer B is not notified");
    const settleNotif = await latestNotification(aId, "settlement_recorded");
    check(
      settleNotif !== undefined && settleNotif.actor === bId && settleNotif.metadata.payerId === bId && settleNotif.metadata.receiverId === aId && settleNotif.metadata.amountMinor === 500 && settleNotif.metadata.currency === "INR",
      "E.settle: metadata carries settlement parties + amount",
    );

    /* ------------------------- Test F: member_removed ------------------------ */
    await removeMember(g1, aId, eId);
    check((await getUnreadCount(eId)) === 3, "F.remove: removed member E notified (unread 3)");
    const removeNotif = await latestNotification(eId, "member_removed");
    check(removeNotif !== undefined && removeNotif.actor === aId && removeNotif.metadata.removedMemberId === eId, "F.remove: member_removed metadata carries removedMemberId");

    /* -------------------------- Test G: member_left -------------------------- */
    await removeMember(g1, bId, bId);
    check((await getUnreadCount(aId)) === 5 && (await getUnreadCount(cId)) === 4, "G.leave: owner A and admin C notified of B leaving");
    check((await getUnreadCount(bId)) === 2, "G.leave: leaver B receives nothing new");
    const leaveNotif = await latestNotification(aId, "member_left");
    const leaveNotifC = await latestNotification(cId, "member_left");
    check(leaveNotif !== undefined && leaveNotif.actor === bId && leaveNotif.metadata.leaverId === bId, "G.leave: member_left metadata carries leaverId");
    check(leaveNotifC !== undefined && leaveNotifC.type === "member_left", "G.leave: admin also received member_left");

    /* ---------------------- Test H: ownership_transferred -------------------- */
    await transferOwnership(g1, aId, cId);
    check((await getUnreadCount(cId)) === 5, "H.owner: new owner C notified (unread 5)");
    check((await getUnreadCount(aId)) === 5, "H.owner: old owner A is the actor and is not notified");
    const ownerNotif = await latestNotification(cId, "ownership_transferred");
    check(ownerNotif !== undefined && ownerNotif.actor === aId && ownerNotif.metadata.groupName === "H8 Smoke Group", "H.owner: ownership_transferred actor = old owner");

    /* ------------------------- Test I: group_archived ------------------------ */
    await archiveGroup(g1, cId);
    check((await getUnreadCount(aId)) === 6, "I.archive: remaining active member A notified");
    check((await getUnreadCount(cId)) === 5, "I.archive: actor (new owner) is not notified");
    const archiveNotif = await latestNotification(aId, "group_archived");
    check(archiveNotif !== undefined && archiveNotif.actor === cId && archiveNotif.metadata.groupName === "H8 Smoke Group", "I.archive: group_archived actor = archiver");

    /* ------------------------ Test R: read/unread handling ------------------- */
    const aList = await listNotifications(aId, 1, 20, 0);
    const aNotifId = aList.items[0].id;
    await expectApiError(() => markNotificationRead(aNotifId, cId), 404, "R.authz: a non-recipient cannot mark someone else's notification read");
    await expectApiError(() => markNotificationRead("aaaaaaaaaaaaaaaaaaaaaaaa", aId), 404, "R.invalid-id: unknown notification is a 404");

    const bInvite = await latestNotification(bId, "group_invitation");
    const marked = await markNotificationRead(bInvite.id, bId);
    check(marked.read === true && marked.readAt !== null, "R.mark-read: single notification becomes read");
    check((await getUnreadCount(bId)) === 1, "R.mark-read: unread count decreases by one");
    const markedAgain = await markNotificationRead(bInvite.id, bId);
    check(markedAgain.read === true && (await getUnreadCount(bId)) === 1, "R.mark-read: idempotent (already read stays read)");

    const markedAll = await markAllNotificationsRead(aId);
    check(markedAll.modifiedCount === 6 && (await getUnreadCount(aId)) === 0, "R.mark-all: marks all 6 unread as read");
    check((await markAllNotificationsRead(aId)).modifiedCount === 0, "R.mark-all: idempotent (nothing left to mark)");

    /* --------------------------- Test L: list/filter ------------------------- */
    const aPage = await listNotifications(aId, 1, 2, 0);
    check(aPage.items.length === 2 && aPage.total === 6 && aPage.totalPages === 3, `L.page: page1 = 2 items, total 6, pages 3 (got ${aPage.items.length}/${aPage.total}/${aPage.totalPages})`);
    const aUnread = await listNotifications(aId, 1, 20, 0, { unreadOnly: true });
    check(aUnread.total === 0, "L.unread-filter: A has 0 unread after mark-all");
    const cRole = await listNotifications(cId, 1, 20, 0, { type: "role_changed" });
    check(cRole.total === 1 && cRole.items[0].metadata.role === "admin", "L.type-filter: C has exactly one role_changed (+ 1 page item)");
    const cUnread = await listNotifications(cId, 1, 20, 0, { unreadOnly: true });
    check(cUnread.total === 5, "L.unread: C still has 5 unread");

    /* --------------------- Test T: totals + integrity ------------------------ */
    const totals = await Notification.countDocuments({ group: new Types.ObjectId(g1) });
    check(totals === 17, `T.totals: exactly 17 notifications generated for the group (got ${totals})`);
    const bHistorical = await listNotifications(bId, 1, 20, 0);
    check(bHistorical.items.some((n) => n.type === "expense_created"), "T.intact: a leaver's historical notifications remain accessible");
    const dupeCheck = new Set((await listNotifications(aId, 1, 100, 0)).items.map((n) => n.type)).size;
    check(dupeCheck >= 3, `T.intact: A's feed contains multiple distinct types (got ${dupeCheck})`);
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

function sameUserSet(actual: string[], expected: string[]): boolean {
  return JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort());
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