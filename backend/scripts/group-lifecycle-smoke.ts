/**
 * Live group lifecycle smoke tests — LIVE against the configured MongoDB and
 * the real HTTP stack (ephemeral app on 127.0.0.1).
 *
 * Verifies the P1 + P2 group lifecycle milestones end to end:
 *   - P1: `PATCH /groups/:id/archive` is owner-only (member/admin 403), idempotent
 *     guard (re-archive 409), and flips archived/archivedAt.
 *   - P1: `GET /groups` stays active-only; `GET /groups?status=archived` lists
 *     archived groups; `status` is validated (400).
 *   - P1: Archived groups stay readable (detail 200) but reject financial writes
 *     (expense/settlement 409) and attachment writes (409).
 *   - P1: `DELETE /groups/:id` (permanent delete) requires the group to be archived
 *     (409 otherwise) and is owner-only (member/admin 403, unauth 401).
 *   - P1: Permanent delete removes the group, its expenses, settlements,
 *     group-scoped notifications, and every GridFS receipt — restoring the
 *     bucket baseline and leaving personal expenses/receipts untouched.
 *   - P1: A second permanent-delete attempt returns 404 (safe/idempotent).
 *   - P2: `PATCH /groups/:id/restore` is owner-only (member/admin 403,
 *     non-member 404, unauth 401) and requires the group to be archived (409
 *     if active). Flips archived=false, clears archivedAt. Notifies members.
 *   - P2: Listing separation holds through archive→restore (group moves between
 *     active and archived lists correctly).
 *   - P2: Data integrity: expenses, settlements, receipts, members and
 *     notifications are preserved across archive→restore.
 *   - P2: Post-restore functionality resumes: expense/settlement creation and
 *     receipt upload succeed.
 *   - P2: Full lifecycle: archive→restore→archive→restore→archive→permanent-delete
 *     works; permanent delete cascades correctly after restore.
 *
 *   npx tsx scripts/group-lifecycle-smoke.ts
 */
import type { AddressInfo } from "node:net";
import { once } from "node:events";
import { GridFSBucket } from "mongodb";
import mongoose, { Types } from "mongoose";
import bcrypt from "bcryptjs";
import { connectDatabase } from "../src/config/database.js";
import { createApp } from "../src/app.js";
import { User } from "../src/modules/auth/auth.model.js";
import { Group } from "../src/modules/groups/group.model.js";
import { Expense } from "../src/modules/expenses/expense.model.js";
import { Settlement } from "../src/modules/settlements/settlement.model.js";
import { Notification } from "../src/modules/notifications/notification.model.js";
import { ATTACHMENT_BUCKET_NAME } from "../src/modules/expenses/attachment.service.js";

const PASSWORD = "SmokeTest123";
const TEST_DOMAIN = "@mavi-gls-smoke.test";
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

const groupExpenseBody = (payerId: string, participantIds: string[]) => ({
  title: "Lifecycle smoke expense",
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
  idempotencyKey: `gls-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
});

/* Magic-byte-valid image payloads (no decoder needed). */
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Array(256).fill(0x00)]);

async function upload(
  base: string,
  path: string,
  token: string,
  filename: string,
  buffer: Buffer,
): Promise<{ status: number; json: Jsonable | null }> {
  const form = new FormData();
  form.append("attachment", new Blob([new Uint8Array(buffer)], { type: "application/octet-stream" }), filename);
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const json = (await res.json().catch(() => null)) as Jsonable | null;
  return { status: res.status, json };
}

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

function requireDb(): import("mongodb").Db {
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error("MongoDB connection not ready");
  }
  return db;
}

async function snapshotBucket(): Promise<Set<string>> {
  const bucket = new GridFSBucket(requireDb(), { bucketName: ATTACHMENT_BUCKET_NAME });
  const ids = new Set<string>();
  for (const file of await bucket.find({}).toArray()) {
    ids.add(file._id.toString());
  }
  return ids;
}

async function main(): Promise<void> {
  try {
    await connectDatabase();
  } catch {
    console.error("Could not connect to database");
    process.exit(2);
  }

  const beforeFiles = await snapshotBucket();

  const srv = await startServer();
  const { base } = srv;

  try {
    const owner = await createVerifiedUser("Gls Owner");
    const admin = await createVerifiedUser("Gls Admin");
    const member = await createVerifiedUser("Gls Member");
    const outsider = await createVerifiedUser("Gls Outsider");
    const tokenOwner = await login(base, owner.email);
    const tokenAdmin = await login(base, admin.email);
    const tokenMember = await login(base, member.email);
    const tokenOutsider = await login(base, outsider.email);

    /* ----------------------------- setup --------------------------------- */
    const g1 = await post(base, "/groups", tokenOwner, { name: "Lifecycle group", currency: CURRENCY });
    const g1Id = ((g1.json?.data as Jsonable).group as Jsonable).id as string;
    check(g1Id.length === 24, "SETUP: target group created");
    const g2 = await post(base, "/groups", tokenOwner, { name: "Control group", currency: CURRENCY });
    const g2Id = ((g2.json?.data as Jsonable).group as Jsonable).id as string;
    check(g2Id.length === 24, "SETUP: control group created");

    check((await post(base, `/groups/${g1Id}/members`, tokenOwner, { userId: admin.id })).status === 200, "SETUP: admin invited");
    check((await post(base, `/groups/${g1Id}/members/${admin.id}/accept`, tokenAdmin, {})).status === 200, "SETUP: admin accepted");
    check((await post(base, `/groups/${g1Id}/members`, tokenOwner, { userId: member.id })).status === 200, "SETUP: member invited");
    check((await post(base, `/groups/${g1Id}/members/${member.id}/accept`, tokenMember, {})).status === 200, "SETUP: member accepted");

    /* Expense + receipt + a second (attachment-less) expense on the target so
       the cascade and the archived-write guards can both be exercised. */
    const targetExp = (((await post(base, `/groups/${g1Id}/expenses`, tokenOwner, groupExpenseBody(owner.id, [owner.id, member.id]))).json?.data as Jsonable).expense as Jsonable).id as string;
    check(targetExp.length === 24, "SETUP: target expense created");
    check((await upload(base, `/groups/${g1Id}/expenses/${targetExp}/attachment`, tokenOwner, "doomed.jpg", JPEG)).status === 200, "SETUP: receipt attached");
    const bareExp = (((await post(base, `/groups/${g1Id}/expenses`, tokenOwner, groupExpenseBody(owner.id, [owner.id, admin.id]))).json?.data as Jsonable).expense as Jsonable).id as string;
    check(bareExp.length === 24, "SETUP: attachment-less expense created");
    check((await post(base, `/groups/${g1Id}/settlements`, tokenOwner, settlementBody(owner.id, member.id, 250))).status === 201, "SETUP: settlement recorded");

    /* Personal expense + receipt for the member — must SURVIVE the cascade. */
    const personalExp = (((await post(base, "/expenses/personal", tokenMember, { title: "private", amountMinor: 400, currency: CURRENCY })).json?.data as Jsonable).expense as Jsonable).id as string;
    check(personalExp.length === 24, "SETUP: personal expense created");
    check((await upload(base, `/expenses/personal/${personalExp}/attachment`, tokenMember, "keep.jpg", JPEG)).status === 200, "SETUP: personal receipt attached");

    /* -------- g3: restore lifecycle group (P2) ---------- */
    const g3 = await post(base, "/groups", tokenOwner, { name: "Restore group", currency: CURRENCY });
    const g3Id = ((g3.json?.data as Jsonable).group as Jsonable).id as string;
    check(g3Id.length === 24, "SETUP: restore group (g3) created");
    check((await post(base, `/groups/${g3Id}/members`, tokenOwner, { userId: admin.id })).status === 200, "SETUP: g3 admin invited");
    check((await post(base, `/groups/${g3Id}/members/${admin.id}/accept`, tokenAdmin, {})).status === 200, "SETUP: g3 admin accepted");
    check((await post(base, `/groups/${g3Id}/members`, tokenOwner, { userId: member.id })).status === 200, "SETUP: g3 member invited");
    check((await post(base, `/groups/${g3Id}/members/${member.id}/accept`, tokenMember, {})).status === 200, "SETUP: g3 member accepted");
    const g3Exp = (((await post(base, `/groups/${g3Id}/expenses`, tokenOwner, groupExpenseBody(owner.id, [owner.id, member.id]))).json?.data as Jsonable).expense as Jsonable).id as string;
    check(g3Exp.length === 24, "SETUP: g3 expense created");
    check((await upload(base, `/groups/${g3Id}/expenses/${g3Exp}/attachment`, tokenOwner, "g3-receipt.jpg", JPEG)).status === 200, "SETUP: g3 receipt attached");
    check((await post(base, `/groups/${g3Id}/settlements`, tokenOwner, settlementBody(owner.id, member.id, 300))).status === 201, "SETUP: g3 settlement recorded");

    /* Capture g3 data-integrity snapshot (expense split + settlement + members). */
    const g3ExpDoc = await Expense.findOne({ _id: g3Exp });
    const g3ExpSnapshot = JSON.stringify({
      title: g3ExpDoc?.title,
      amountMinor: g3ExpDoc?.amountMinor,
      currency: g3ExpDoc?.currency,
      splitMethod: g3ExpDoc?.splitMethod,
      splitInput: g3ExpDoc?.splitInput,
      participantShares: g3ExpDoc?.participantShares,
      attachmentPresent: Boolean(g3ExpDoc?.attachment),
    });
    const g3SettleDoc = await Settlement.findOne({ group: new Types.ObjectId(g3Id) });
    const g3SettleSnapshot = JSON.stringify({
      payerId: g3SettleDoc?.payerId.toString(),
      receiverId: g3SettleDoc?.receiverId.toString(),
      amountMinor: g3SettleDoc?.amountMinor,
    });

    const g3MemberSnapshot = await (async () => {
      const doc = (await Group.findById(g3Id)) as unknown as { members: Array<{ userId: { toString(): string }; role: string; status: string }> };
      return JSON.stringify(
        doc.members
          .map((mm) => ({ userId: mm.userId.toString(), role: mm.role, status: mm.status }))
          .sort((a, b) => a.userId.localeCompare(b.userId)),
      );
    })();

    /* Balance oracle: expense + settlement amounts for g3 should be identical after restore. */
    const g3BalBefore = JSON.stringify((await get(base, `/groups/${g3Id}/balances`, tokenOwner)).json?.data);
    const g3NotifCountBefore = await Notification.countDocuments({ group: new Types.ObjectId(g3Id) });

    /* -------- P1: archive is owner-only via PATCH /groups/:id/archive ------ */
    check((await patch(base, `/groups/${g1Id}/archive`, tokenMember, {})).status === 403, "P1: member archive -> 403");
    check((await patch(base, `/groups/${g1Id}/archive`, tokenAdmin, {})).status === 403, "P1: admin archive -> 403");
    check((await patch(base, `/groups/${g1Id}/archive`)).status === 401, "P1: unauth archive -> 401");
    const archived = await patch(base, `/groups/${g1Id}/archive`, tokenOwner, {});
    const archivedGroup = (archived.json?.data as Jsonable).group as Jsonable | undefined;
    check(
      archived.status === 200 &&
        archivedGroup?.archived === true &&
        typeof archivedGroup?.archivedAt === "string",
      "P1: owner archive -> 200 + archived/archivedAt set",
    );
    check((await patch(base, `/groups/${g1Id}/archive`, tokenOwner, {})).status === 409, "P1: re-archive -> 409");

    /* -------- P2: list separation (active default, ?status=archived) -------- */
    const activeList = (await get(base, "/groups", tokenOwner)).json?.data as Jsonable;
    check(
      (activeList.groups as Array<{ id: string }>).some((g) => g.id === g2Id) &&
        !(activeList.groups as Array<{ id: string }>).some((g) => g.id === g1Id),
      "P2: GET /groups lists control, excludes archived",
    );
    const archivedList = (await get(base, "/groups?status=archived", tokenOwner)).json?.data as Jsonable;
    const archivedNames = (archivedList.groups as Array<{ id: string }>).map((g) => g.id);
    check(archivedNames.includes(g1Id) && !archivedNames.includes(g2Id), "P2: ?status=archived lists target, excludes control");
    check((await get(base, "/groups?status=bogus", tokenOwner)).status === 400, "P2: ?status=bogus -> 400");

    /* --------- P3: archived groups stay readable, financial writes 409 ----- */
    check((await get(base, `/groups/${g1Id}`, tokenOwner)).status === 200, "P3: owner reads archived detail -> 200");
    check((await get(base, `/groups/${g1Id}`, tokenMember)).status === 200, "P3: member reads archived detail -> 200");
    check((await post(base, `/groups/${g1Id}/expenses`, tokenOwner, groupExpenseBody(owner.id, [owner.id]))).status === 409, "P3: create expense on archived -> 409");
    check((await post(base, `/groups/${g1Id}/settlements`, tokenOwner, settlementBody(owner.id, member.id, 10))).status === 409, "P3: create settlement on archived -> 409");
    check((await upload(base, `/groups/${g1Id}/expenses/${bareExp}/attachment`, tokenOwner, "late.jpg", JPEG)).status === 409, "P3: attach receipt to archived expense -> 409");
    check((await patch(base, `/groups/${g1Id}/expenses/${targetExp}`, tokenOwner, { title: "nope" })).status === 409, "P3: edit expense on archived -> 409");

    /* -------- P4: permanent delete gating (409 unless archived, owner) ----- */
    check((await del(base, `/groups/${g2Id}`, tokenOwner)).status === 409, "P4: delete non-archived -> 409");
    check((await del(base, `/groups/${g1Id}`, tokenMember)).status === 403, "P4: member delete archived -> 403");
    check((await del(base, `/groups/${g1Id}`, tokenAdmin)).status === 403, "P4: admin delete archived -> 403");
    check((await del(base, `/groups/${g1Id}`)).status === 401, "P4: unauth delete -> 401");

    /* ------- P5: permanent delete cascades group + records + receipts ------ */
    const deleted = await del(base, `/groups/${g1Id}`, tokenOwner);
    check(deleted.status === 200 && deleted.json?.data === null, "P5: owner delete -> 200 + data null");
    check((await get(base, `/groups/${g1Id}`, tokenOwner)).status === 404, "P5: detail after delete -> 404");
    const afterActive = (await get(base, "/groups", tokenOwner)).json?.data as Jsonable;
    check(!(afterActive.groups as Array<{ id: string }>).some((g) => g.id === g1Id), "P5: active list excludes deleted group");
    const afterArchived = (await get(base, "/groups?status=archived", tokenOwner)).json?.data as Jsonable;
    check(!(afterArchived.groups as Array<{ id: string }>).some((g) => g.id === g1Id), "P5: archived list excludes deleted group");

    const gid = new Types.ObjectId(g1Id);
    check((await Expense.countDocuments({ group: gid })) === 0, "P5: no expense rows remain for deleted group");
    check((await Settlement.countDocuments({ group: gid })) === 0, "P5: no settlement rows remain for deleted group");
    check((await Notification.countDocuments({ group: gid })) === 0, "P5: no notifications remain for deleted group");

    const afterBucket = await snapshotBucket();
    check(
      afterBucket.size === beforeFiles.size + 2,
      `P5: GridFS receipts cleaned (personal + g3 receipts remain; ${beforeFiles.size} -> ${afterBucket.size})`,
    );
    check((await Expense.findOne({ _id: personalExp })) !== null, "P5: personal expense survives cascade");
    check((await del(base, `/groups/${g1Id}`, tokenOwner)).status === 404, "P5: repeat delete -> 404 (idempotent)");

    /* ------- P2 restore authorization + active-409 (g3 is still active here) - */
    const g3id = new Types.ObjectId(g3Id);
    check((await patch(base, `/groups/${g3Id}/restore`, tokenOutsider, {})).status === 404, "R: non-member restore active -> 404");
    check((await patch(base, `/groups/${g3Id}/restore`)).status === 401, "R: unauth restore active -> 401");
    check((await patch(base, `/groups/${g3Id}/restore`, tokenMember, {})).status === 403, "R: member restore active -> 403");
    check((await patch(base, `/groups/${g3Id}/restore`, tokenAdmin, {})).status === 403, "R: admin restore active -> 403");
    check((await patch(base, `/groups/${g3Id}/restore`, tokenOwner, {})).status === 409, "R: owner restore ACTIVE -> 409 (archived-only rule)");

    /* ------- P2: archive g3 (baseline for restore) ------------------------- */
    const g3BucketBefore = (await snapshotBucket()).size;
    const g3Archive = await patch(base, `/groups/${g3Id}/archive`, tokenOwner, {});
    const g3ArchivedGroup = (g3Archive.json?.data as Jsonable).group as Jsonable | undefined;
    check(
      g3Archive.status === 200 && g3ArchivedGroup?.archived === true && typeof g3ArchivedGroup?.archivedAt === "string",
      "R: owner archive g3 -> 200 + archived/archivedAt set",
    );
    check((await patch(base, `/groups/${g3Id}/expenses/${g3Exp}`, tokenOwner, { title: "nope" })).status === 409, "R: expense edit on archived g3 -> 409");

    /* ------- P2: restore ARCHIVED g3 -> success ---------------------------- */
    const restored = await patch(base, `/groups/${g3Id}/restore`, tokenOwner, {});
    const restoredGroup = (restored.json?.data as Jsonable).group as Jsonable | undefined;
    check(
      restored.status === 200 &&
        restoredGroup?.archived === false &&
        (restoredGroup?.archivedAt === null || restoredGroup?.archivedAt === undefined),
      "R: restore archived g3 -> 200 + archived=false + archivedAt cleared",
    );

    /* ------- P2: restore does NOT create duplicates ------------------------ */
    check((await Group.countDocuments({ _id: g3id })) === 1, "R: no duplicate group rows after restore");
    check((await Expense.countDocuments({ group: g3id })) === 1, "R: no duplicate expense rows after restore");
    check((await Settlement.countDocuments({ group: g3id })) === 1, "R: no duplicate settlement rows after restore");
    check((await get(base, `/groups/${g3Id}`, tokenOwner)).status === 200, "R: restored group detail readable");

    /* ------- P2: listing after restore ------------------------------------ */
    const activeAfterRestore = (await get(base, "/groups", tokenOwner)).json?.data as Jsonable;
    check(
      (activeAfterRestore.groups as Array<{ id: string }>).some((g) => g.id === g3Id) &&
        (activeAfterRestore.groups as Array<{ id: string }>).some((g) => g.id === g2Id),
      "R: active list includes restored g3 + control g2",
    );
    const archivedAfterRestore = (await get(base, "/groups?status=archived", tokenOwner)).json?.data as Jsonable;
    check(
      !(archivedAfterRestore.groups as Array<{ id: string }>).some((g) => g.id === g3Id),
      "R: archived list excludes restored g3",
    );

    /* ------- P2: data integrity after restore ------------------------------ */
    const g3ExpAfter = await Expense.findOne({ _id: g3Exp });
    check(g3ExpAfter !== null, "R: expense preserved after restore");
    check(
      g3ExpAfter !== null &&
        JSON.stringify({
          title: g3ExpAfter.title,
          amountMinor: g3ExpAfter.amountMinor,
          currency: g3ExpAfter.currency,
          splitMethod: g3ExpAfter.splitMethod,
          splitInput: g3ExpAfter.splitInput,
          participantShares: g3ExpAfter.participantShares,
          attachmentPresent: Boolean(g3ExpAfter.attachment),
        }) === g3ExpSnapshot,
      "R: expense splits + receipt reference preserved after restore",
    );
    const g3SettleAfter = await Settlement.findOne({ group: g3id });
    check(
      g3SettleAfter !== null &&
        JSON.stringify({
          payerId: g3SettleAfter.payerId.toString(),
          receiverId: g3SettleAfter.receiverId.toString(),
          amountMinor: g3SettleAfter.amountMinor,
        }) === g3SettleSnapshot,
      "R: settlement preserved (payer/receiver/amount) after restore",
    );
    const g3MemberAfter = await (async () => {
      const doc = (await Group.findById(g3Id)) as unknown as { members: Array<{ userId: { toString(): string }; role: string; status: string }> };
      return JSON.stringify(
        doc.members
          .map((mm) => ({ userId: mm.userId.toString(), role: mm.role, status: mm.status }))
          .sort((a, b) => a.userId.localeCompare(b.userId)),
      );
    })();
    check(g3MemberAfter === g3MemberSnapshot, "R: members + roles preserved after restore");
    check((await Notification.countDocuments({ group: g3id, type: "group_restored" })) >= 1, "R: group_restored notification persisted for members");
    check(
      (await Notification.countDocuments({ group: g3id })) >= g3NotifCountBefore,
      "R: notifications not deleted during restore",
    );
    check((await Expense.findOne({ _id: personalExp })) !== null, "R: personal expense still intact after restore");
    check(
      JSON.stringify((await get(base, `/groups/${g3Id}/balances`, tokenOwner)).json?.data) === g3BalBefore,
      "R: balances unchanged across archive+restore",
    );
    const g3BucketAfter = (await snapshotBucket()).size;
    check(g3BucketAfter === g3BucketBefore, "R: GridFS receipts preserved across archive+restore");

    /* ------- P2: functionality resumes after restore ---------------------- */
    check((await post(base, `/groups/${g3Id}/expenses`, tokenOwner, groupExpenseBody(owner.id, [owner.id, member.id]))).status === 201, "R: expense creation resumes after restore");
    check((await post(base, `/groups/${g3Id}/settlements`, tokenOwner, settlementBody(owner.id, member.id, 50))).status === 201, "R: settlement creation resumes after restore");
    const g3NewExp = (((await post(base, `/groups/${g3Id}/expenses`, tokenOwner, groupExpenseBody(owner.id, [owner.id, member.id]))).json?.data as Jsonable).expense as Jsonable).id as string;
    check(
      (await upload(base, `/groups/${g3Id}/expenses/${g3NewExp}/attachment`, tokenOwner, "resume.jpg", JPEG)).status === 200,
      "R: receipt upload resumes after restore",
    );
    check((await patch(base, `/groups/${g3Id}`, tokenOwner, { description: "back in action" })).status === 200, "R: group mutation resumes after restore");

    /* ------- P2: full lifecycle ACTIVE → ARCHIVED → RESTORED → ACTIVE ------- */
    const reArchive = await patch(base, `/groups/${g3Id}/archive`, tokenOwner, {});
    const reArchived = (reArchive.json?.data as Jsonable).group as Jsonable | undefined;
    check(reArchive.status === 200 && reArchived?.archived === true, "R: active g3 re-archive after restore -> 200");
    const reRestore = await patch(base, `/groups/${g3Id}/restore`, tokenOwner, {});
    const reRestored = (reRestore.json?.data as Jsonable).group as Jsonable | undefined;
    check(reRestore.status === 200 && reRestored?.archived === false && (reRestored?.archivedAt === null || reRestored?.archivedAt === undefined), "R: re-restore after re-archive -> 200 + flags reset");

    /* ------- P2: archived again → permanent delete still works (P1 intact) -- */
    check((await patch(base, `/groups/${g3Id}/archive`, tokenOwner, {})).status === 200, "R: g3 re-archived for delete");
    check((await del(base, `/groups/${g3Id}`, tokenMember)).status === 403, "R: member delete restored-then-archived -> 403");
    check((await del(base, `/groups/${g3Id}`, tokenAdmin)).status === 403, "R: admin delete restored-then-archived -> 403");
    const delG3 = await del(base, `/groups/${g3Id}`, tokenOwner);
    check(delG3.status === 200 && delG3.json?.data === null, "R: owner delete archived g3 -> 200 + data null");
    check((await get(base, `/groups/${g3Id}`, tokenOwner)).status === 404, "R: g3 detail after delete -> 404");
    check((await Expense.countDocuments({ group: g3id })) === 0, "R: g3 expense rows removed");
    check((await Settlement.countDocuments({ group: g3id })) === 0, "R: g3 settlement rows removed");
    check((await Notification.countDocuments({ group: g3id })) === 0, "R: g3 notifications removed");
    check((await del(base, `/groups/${g3Id}`, tokenOwner)).status === 404, "R: g3 repeat delete -> 404 (idempotent)");
  } finally {
    await srv.close();
    await cleanUp();
  }

  const residue = await User.countDocuments({ email: new RegExp(`\\${TEST_DOMAIN}$`) });
  check(residue === 0, `CLEANUP: no residue users remain (${residue})`);

  console.log(`\ngroup lifecycle smoke checks passed: ${passCount.n}`);
  if (failures > 0) {
    console.log(`\nFAILURES (${failures}):\n- ${failuresList.join("\n- ")}\n`);
    console.log("ALL GROUP LIFECYCLE SMOKE TESTS FAILED");
  } else {
    console.log("\nALL GROUP LIFECYCLE SMOKE TESTS PASSED");
  }
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Group lifecycle smoke crashed:", err);
  process.exit(2);
});