/**
 * H.8 Notifications self-test — pure/offline (no DB).
 * Exercises the notification event builders + recipient-selection helpers.
 *
 *   npx tsx scripts/notifications-selftest.ts
 */
import {
  activeMemberIds,
  leaderIds,
  onExpenseCreated,
  onGroupArchived,
  onGroupInvitation,
  onInvitationAccepted,
  onMemberLeft,
  onMemberRemoved,
  onOwnershipTransferred,
  onRoleChanged,
  onSettlementRecorded,
  type GroupLike,
  type MemberLike,
} from "../src/modules/notifications/notification.events.js";
import { NOTIFICATION_TYPES } from "../src/modules/notifications/notification.types.js";

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

const sameIds = (actual: string[], expected: string[]): boolean =>
  JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort());

const uid = (id: string): { toString(): string } => ({ toString: () => id });
const m = (id: string, role = "member", status = "active"): MemberLike => ({ userId: uid(id), role, status });
const group = (members: MemberLike[]): GroupLike => ({ _id: uid("g1"), name: "Test Group", members });

/* ------------------------- type catalogue completeness ---------------------- */
const TYPES = [
  "expense_created",
  "group_invitation",
  "invitation_accepted",
  "member_removed",
  "member_left",
  "role_changed",
  "ownership_transferred",
  "group_archived",
  "settlement_recorded",
];
check(NOTIFICATION_TYPES.length === TYPES.length, "catalogue: exactly 9 notification types");
for (const t of TYPES) {
  check((NOTIFICATION_TYPES as readonly string[]).includes(t), `catalogue: includes ${t}`);
}

/* ------------------------------- member selectors --------------------------- */
const mixed = [m("a", "owner"), m("b", "admin"), m("c", "member"), m("d", "member", "invited"), m("e", "member", "declined")];
check(activeMemberIds(mixed).length === 3 && sameIds(activeMemberIds(mixed), ["a", "b", "c"]), "selectors: activeMemberIds excludes invited/declined");
check(leaderIds(mixed).length === 2 && sameIds(leaderIds(mixed), ["a", "b"]), "selectors: leaderIds returns active owner+admin only");
check(activeMemberIds([]).length === 0 && leaderIds([]).length === 0, "selectors: empty member list yields empty ids");

/* -------------------------------- expense_created --------------------------- */
const gExp = group([m("a", "owner"), m("b"), m("c"), m("d", "member", "invited"), m("e", "member", "declined")]);
const expItems = onExpenseCreated(gExp, "a", { id: "e1", title: "Dinner", amountMinor: 3000, currency: "INR" });
check(expItems.length === 2 && sameIds(expItems.map((i) => i.recipientId), ["b", "c"]), "expense_created: notifies every active member except creator");
check(expItems.every((i) => i.type === "expense_created" && i.groupId === "g1" && i.actorId === "a"), "expense_created: type/group/actor set");
check(
  expItems.every((i) => i.metadata.expenseId === "e1" && i.metadata.title === "Dinner" && i.metadata.amountMinor === 3000 && i.metadata.currency === "INR" && i.metadata.groupName === "Test Group"),
  "expense_created: metadata carries expense id/title/amount/currency",
);

/* -------------------------------- group_invitation -------------------------- */
const inviteItems = onGroupInvitation(gExp, "a", "b");
check(inviteItems.length === 1 && inviteItems[0].recipientId === "b" && inviteItems[0].actorId === "a", "group_invitation: notifies the invitee, actor = inviter");
check(inviteItems[0].metadata.inviteeId === "b" && inviteItems[0].metadata.groupName === "Test Group", "group_invitation: metadata carries invitee + group name");
check(onGroupInvitation(gExp, "b", "b").length === 0, "group_invitation: self-invite never notifies the actor");

/* ------------------------------ invitation_accepted ------------------------- */
const gAccepted = group([m("a", "owner"), m("b", "admin"), m("x"), m("z")]);
const acceptItems = onInvitationAccepted(gAccepted, "x");
check(acceptItems.length === 2 && sameIds(acceptItems.map((i) => i.recipientId), ["a", "b"]), "invitation_accepted: notifies active owner+admin");
check(acceptItems.every((i) => i.actorId === "x" && i.metadata.acceptorId === "x"), "invitation_accepted: actor + metadata acceptorId = new member");

/* ------------------------------- member_removed ----------------------------- */
const removeItems = onMemberRemoved(gExp, "a", "b");
check(removeItems.length === 1 && removeItems[0].recipientId === "b" && removeItems[0].actorId === "a", "member_removed: notifies the removed member only");
check(removeItems[0].metadata.removedMemberId === "b", "member_removed: metadata carries removedMemberId");

/* --------------------------------- member_left ------------------------------ */
const leaveItems = onMemberLeft(gAccepted, "z");
check(leaveItems.length === 2 && sameIds(leaveItems.map((i) => i.recipientId), ["a", "b"]), "member_left: notifies active owner+admin, never the leaver");
check(leaveItems.every((i) => i.actorId === "z" && i.metadata.leaverId === "z"), "member_left: actor + metadata leaverId = leaver");

/* --------------------------------- role_changed ----------------------------- */
const roleItems = onRoleChanged(gExp, "a", "b", "admin");
check(roleItems.length === 1 && roleItems[0].recipientId === "b" && roleItems[0].actorId === "a", "role_changed: notifies the target member, actor = owner");
check(roleItems[0].metadata.role === "admin", "role_changed: metadata carries the new role");

/* --------------------------- ownership_transferred --------------------------- */
const ownerItems = onOwnershipTransferred(gExp, "a", "b");
check(ownerItems.length === 1 && ownerItems[0].recipientId === "b" && ownerItems[0].actorId === "a", "ownership_transferred: notifies the new owner only");

/* ------------------------------- group_archived ----------------------------- */
const gArchive = group([m("a", "owner"), m("b"), m("c"), m("d", "member", "declined")]);
const archiveItems = onGroupArchived(gArchive, "a");
check(archiveItems.length === 2 && sameIds(archiveItems.map((i) => i.recipientId), ["b", "c"]), "group_archived: notifies every other active member");

/* ----------------------------- settlement_recorded -------------------------- */
const settleAsThird = onSettlementRecorded(gExp, "x", { id: "s1", payerId: "b", receiverId: "a", amountMinor: 500, currency: "INR" });
check(settleAsThird.length === 2 && sameIds(settleAsThird.map((i) => i.recipientId), ["a", "b"]), "settlement_recorded: notifies payer + receiver when actor is a third party");
const settleAsPayer = onSettlementRecorded(gExp, "b", { id: "s2", payerId: "b", receiverId: "a", amountMinor: 500, currency: "INR" });
check(settleAsPayer.length === 1 && settleAsPayer[0].recipientId === "a", "settlement_recorded: excludes the actor payer");
const settleAsReceiver = onSettlementRecorded(gExp, "a", { id: "s3", payerId: "b", receiverId: "a", amountMinor: 500, currency: "INR" });
check(settleAsReceiver.length === 1 && settleAsReceiver[0].recipientId === "b", "settlement_recorded: excludes the actor receiver");
check(
  settleAsPayer[0].metadata.settlementId === "s2" && settleAsPayer[0].metadata.payerId === "b" && settleAsPayer[0].metadata.receiverId === "a" && settleAsPayer[0].metadata.amountMinor === 500 && settleAsPayer[0].metadata.currency === "INR",
  "settlement_recorded: metadata carries settlement ids/amount/currency",
);

/* ---------------------------------- dedupe ---------------------------------- */
const dupMembers = [m("a", "owner"), m("a", "owner"), m("b")];
const dupItems = onExpenseCreated({ _id: uid("g2"), name: "Dupe", members: dupMembers }, "x", { id: "e2", title: "Dup", amountMinor: 10, currency: "INR" });
check(dupItems.length === 2 && sameIds(dupItems.map((i) => i.recipientId), ["a", "b"]), "dedupe: duplicate member ids produce unique recipients");
const selfPair = onSettlementRecorded(gExp, "x", { id: "s4", payerId: "b", receiverId: "b", amountMinor: 1, currency: "INR" });
check(selfPair.length === 1 && selfPair[0].recipientId === "b", "dedupe: payer === receiver collapses to a single notification");

/* -------------------------------- empty group ------------------------------- */
check(onExpenseCreated(group([]), "a", { id: "e-empty", title: "Empty", amountMinor: 1, currency: "INR" }).length === 0, "empty group: expense in an empty member list creates nothing");

console.log("PASS=" + passCount.n + " FAIL=" + failures);
if (failures > 0) {
  failuresList.forEach((f) => console.log(f));
  process.exit(1);
}
process.exit(0);