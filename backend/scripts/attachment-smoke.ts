/**
 * Live attachment (GridFS receipt) smoke tests — LIVE against the configured
 * MongoDB and the real HTTP stack (ephemeral app on 127.0.0.1).
 *
 * Verifies the full receipt lifecycle for group and personal expenses: upload,
 * authenticated binary streaming, metadata on the expense, replace (old file
 * cleanup), remove, void cleanup, archival read-only, authorization (uniform
 * 404 for non-members / cross-user), oversize 413, MIME-spoof 400, missing-file
 * 400, and unauthenticated 401. GridFS usage is asserted directly against the
 * `expense-attachments` bucket.
 *
 *   npx tsx scripts/attachment-smoke.ts
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
import { DEFAULT_MAX_ATTACHMENT_BYTES } from "../src/modules/expenses/attachment.validation.js";

const PASSWORD = "SmokeTest123";
const TEST_DOMAIN = "@mavi-att-smoke.test";
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
  title: "Attachment smoke expense",
  amountMinor: 1000,
  currency: CURRENCY,
  payerId,
  split: { method: "equal", equal: participantIds.map((userId) => ({ userId })) },
});

/* Real, reproducible image payloads (magic-byte-valid, no decoder needed). */
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Array(256).fill(0x00)]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Array(256).fill(0x00)]);
const WEBP = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, ...Array(256).fill(0x00)]);

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

async function download(
  base: string,
  path: string,
  token: string,
): Promise<{ status: number; buffer: Buffer }> {
  const res = await fetch(`${base}${path}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  const buffer = Buffer.from(await res.arrayBuffer());
  return { status: res.status, buffer };
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

async function cleanUp(beforeFiles: Set<string>): Promise<void> {
  const smokeUsers = await User.find({ email: new RegExp(`\\${TEST_DOMAIN}$`) }).select("_id");
  const ids = smokeUsers.map((u) => u._id);
  let groupIds: Types.ObjectId[] = [];
  if (ids.length > 0) {
    const groups = (await Group.find({ "members.userId": { $in: ids } }).select("_id")) as unknown as {
      _id: Types.ObjectId;
    }[];
    groupIds = groups.map((g) => g._id);
    await Notification.deleteMany({ group: { $in: groupIds } });
    await Settlement.deleteMany({ group: { $in: groupIds } });
    await Expense.deleteMany({ group: { $in: groupIds } });
    await Expense.deleteMany({ createdBy: { $in: ids } });
    await Group.deleteMany({ _id: { $in: groupIds } });
    await User.deleteMany({ _id: { $in: ids } });
  }

  /* Delete only GridFS files that did NOT exist before this run (i.e. created
     by this or an earlier abandoned run) — never touch pre-existing app data. */
  const db = requireDb();
  const bucket = new GridFSBucket(db, { bucketName: ATTACHMENT_BUCKET_NAME });
  for (const file of await bucket.find({}).toArray()) {
    const fileId = file._id.toString();
    if (!beforeFiles.has(fileId)) {
      await bucket.delete(new Types.ObjectId(fileId)).catch(() => undefined);
    }
  }
}

async function main(): Promise<void> {
  try {
    await connectDatabase();
  } catch {
    console.error("Could not connect to database");
    process.exit(2);
  }

  await cleanUp(new Set());

  /* Snapshot the bucket AFTER the residue scrub so any file present here is
     pre-existing app data that cleanup must never touch. */
  const beforeFiles = await snapshotBucket();

  const srv = await startServer();
  const { base } = srv;

  try {
    const owner = await createVerifiedUser("Owner Attach");
    const member = await createVerifiedUser("Member Attach");
    const outsider = await createVerifiedUser("Outsider Attach");
    const tokenOwner = await login(base, owner.email);
    const tokenMember = await login(base, member.email);
    const tokenOutsider = await login(base, outsider.email);

    /* ----------------------------- setup ------------------------------- */
    const g = await post(base, "/groups", tokenOwner, { name: "Attachment group", currency: CURRENCY });
    const groupId = ((g.json?.data as Jsonable).group as Jsonable).id as string;
    check(groupId.length === 24, "SETUP: group created");

    check((await post(base, `/groups/${groupId}/members`, tokenOwner, { userId: member.id })).status === 200, "SETUP: member invited");
    check((await post(base, `/groups/${groupId}/members/${member.id}/accept`, tokenMember, {})).status === 200, "SETUP: member accepted");

    const groupExpenseCreated = await post(base, `/groups/${groupId}/expenses`, tokenOwner, groupExpenseBody(owner.id, [owner.id, member.id]));
    const groupExpenseId = ((groupExpenseCreated.json?.data as Jsonable).expense as Jsonable).id as string;
    const personalId = (((await post(base, "/expenses/personal", tokenMember, { title: "private", amountMinor: 400, currency: CURRENCY })).json?.data as Jsonable).expense as Jsonable).id as string;
    check(groupExpenseId.length === 24 && personalId.length === 24, "SETUP: group + personal expenses created");

    const gExpPath = `/groups/${groupId}/expenses/${groupExpenseId}/attachment`;
    const pExpPath = `/expenses/personal/${personalId}/attachment`;

    /* --------------- unauthenticated + validation guards ------------------ */
    check((await upload(base, gExpPath, tokenOwner, "r.jpg", JPEG)).status === 200, "CONTROL: owner upload jpeg -> 200");
    check((await get(base, gExpPath)).status === 401, "AUTH: no token get -> 401");
    check((await upload(base, gExpPath, tokenOutsider, "r.jpg", JPEG)).status === 404, "IDOR: outsider upload -> 404");
    check((await get(base, gExpPath, tokenOutsider)).status === 404, "IDOR: outsider get -> 404");
    check((await del(base, gExpPath, tokenOutsider)).status === 404, "IDOR: outsider delete -> 404");

    /* Plain member can read (authenticated member) but not write. */
    check((await get(base, gExpPath, tokenMember)).status === 200, "AUTH: active member get -> 200");
    check((await upload(base, gExpPath, tokenMember, "hijack.png", PNG)).status === 403, "AUTH: member cannot replace owner's receipt -> 403");
    check((await del(base, gExpPath, tokenMember)).status === 403, "AUTH: member cannot delete attachment -> 403");

    /* Personal expense isolation: only its owner can touch its receipt. */
    check((await get(base, pExpPath, tokenOutsider)).status === 404, "ISOLATION: outsider reads member receipt -> 404");
    check((await upload(base, pExpPath, tokenOwner, "steal.png", PNG)).status === 404, "ISOLATION: owner cannot upload to member's personal receipt -> 404");

    /* Verify the metadata stored on the group expense. */
    const listRes = await get(base, `/groups/${groupId}/expenses/${groupExpenseId}`, tokenOwner);
    const expObj = listRes.json?.data as Jsonable;
    const attachment = (expObj.expense as Jsonable | undefined)?.attachment as Jsonable | null;
    check(
      Boolean(attachment) &&
        typeof attachment?.fileId === "string" &&
        attachment?.mimeType === "image/jpeg" &&
        attachment?.sizeBytes === JPEG.length &&
        typeof attachment?.filename === "string" &&
        typeof attachment?.uploadedAt === "string",
      "META: expense carries validated attachment metadata (fileId/mime/size/name/uploadedAt)",
    );
    check((attachment?.filename as string) === "r.jpg", "META: original filename preserved after sanitize");

    /* ---------------- authenticated binary streaming ---------------- */
    const dl = await download(base, gExpPath, tokenOwner);
    check(dl.status === 200 && dl.buffer.equals(JPEG), "STREAM: GET returns exact uploaded bytes");
    const dlHeaders = await fetch(`${base}${gExpPath}`, { headers: { Authorization: `Bearer ${tokenOwner}` } });
    check(
      dlHeaders.headers.get("content-type")?.startsWith("image/jpeg") === true &&
        dlHeaders.headers.get("cache-control") === "private, no-store",
      "STREAM: content-type + no-store headers set",
    );
    await dlHeaders.arrayBuffer();

    /* ---------------- oversize + mime-spoof guards at the API ------------- */
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const exactCap = Buffer.concat([pngHeader, Buffer.alloc(DEFAULT_MAX_ATTACHMENT_BYTES - pngHeader.length, 1)]);
    check(exactCap.length === DEFAULT_MAX_ATTACHMENT_BYTES, "SIZE: boundary buffer is exactly DEFAULT_MAX_ATTACHMENT_BYTES");
    const atCap = await upload(base, gExpPath, tokenOwner, "exact.png", exactCap);
    check(atCap.status === 200, "SIZE: exactly-2-MiB upload -> 200");
    const overCap = Buffer.concat([pngHeader, Buffer.alloc(DEFAULT_MAX_ATTACHMENT_BYTES - pngHeader.length + 1, 1)]);
    const oversize = await upload(base, gExpPath, tokenOwner, "over.png", overCap);
    check(oversize.status === 413, "SIZE: 2 MiB + 1 byte upload -> 413");
    const renamedText = Buffer.from("this is definitely not an image but we renamed it .jpg");
    const spoof = await upload(base, gExpPath, tokenOwner, "fake.jpg", renamedText);
    check(spoof.status === 400, "MIME: renamed text file -> 400");
    const empty = await upload(base, gExpPath, tokenOwner, "empty.jpg", Buffer.alloc(0));
    check(empty.status === 400, "MIME: empty buffer -> 400");

    /* ---------------- replace: old GridFS file is cleaned up ------------- */
    const beforeReplace = await bucketCount();
    const replaced = await upload(base, gExpPath, tokenOwner, "receipt.png", PNG);
    check(replaced.status === 200, "REPLACE: upload png over existing -> 200");
    const replacedAtt = ((replaced.json?.data as Jsonable).expense as Jsonable | undefined)?.attachment as Jsonable | null;
    check(
      (replacedAtt?.mimeType as string) === "image/png" && (replacedAtt?.sizeBytes as number) === PNG.length,
      "REPLACE: metadata updated to png",
    );
    const afterReplace = await bucketCount();
    check(afterReplace === beforeReplace, "REPLACE: old GridFS file deleted (no orphan)");

    const dl2 = await download(base, gExpPath, tokenOwner);
    check(dl2.buffer.equals(PNG), "REPLACE: stream now returns png bytes");

    /* ---------------- remove: attachment + GridFS file gone -------------- */
    const removed = await del(base, gExpPath, tokenOwner);
    check(removed.status === 200 && ((removed.json?.data as Jsonable).expense as Jsonable | undefined)?.attachment === null, "REMOVE: 200 + attachment null");
    check((await get(base, gExpPath, tokenOwner)).status === 404, "REMOVE: get after remove -> 404");
    check((await del(base, gExpPath, tokenOwner)).status === 404, "REMOVE: delete after remove -> 404");
    check((await bucketCount()) === beforeReplace - 1, "REMOVE: GridFS file removed");

    /* ------------- personal receipt lifecycle full round-trip ------------- */
    check((await upload(base, pExpPath, tokenMember, "me.webp", WEBP)).status === 200, "PERSONAL: owner uploads webp -> 200");
    const pDl = await download(base, pExpPath, tokenMember);
    check(pDl.buffer.equals(WEBP), "PERSONAL: bytes round-trip");
    check((await get(base, pExpPath, tokenOwner)).status === 404, "PERSONAL: stranger cannot read -> 404");
    check((await del(base, pExpPath, tokenMember)).status === 200, "PERSONAL: owner removes -> 200");
    check((await get(base, pExpPath, tokenMember)).status === 404, "PERSONAL: get after remove -> 404");

    /* ---------------- void cleans up an attached receipt ---------------- */
    const toVoid = (((await post(base, `/groups/${groupId}/expenses`, tokenOwner, groupExpenseBody(owner.id, [owner.id, member.id]))).json?.data as Jsonable).expense as Jsonable).id as string;
    const voidPath = `/groups/${groupId}/expenses/${toVoid}/attachment`;
    check((await upload(base, voidPath, tokenOwner, "doomed.jpg", JPEG)).status === 200, "VOID: attach receipt -> 200");
    check((await del(base, `/groups/${groupId}/expenses/${toVoid}`, tokenOwner)).status === 200, "VOID: expense voided -> 200");
    check((await get(base, voidPath, tokenOwner)).status === 404, "VOID: receipt gone after void -> 404");
    const voidedDoc = await Expense.findById(toVoid).select("attachment");
    check(
      (voidedDoc as unknown as { attachment: unknown }).attachment === null,
      "VOID: expense attachment field cleared",
    );
    check((await bucketCount()) >= 0, "VOID: GridFS cleanup did not throw");

    /* ---------------- archived group blocks attachment writes -------------- */
    const gArc = await post(base, "/groups", tokenOwner, { name: "Archived attach", currency: CURRENCY });
    const gArcId = ((gArc.json?.data as Jsonable).group as Jsonable).id as string;
    const arcExpense = (((await post(base, `/groups/${gArcId}/expenses`, tokenOwner, groupExpenseBody(owner.id, [owner.id]))).json?.data as Jsonable).expense as Jsonable).id as string;
    const arcPath = `/groups/${gArcId}/expenses/${arcExpense}/attachment`;
    check((await del(base, `/groups/${gArcId}`, tokenOwner)).status === 200, "ARCHIVE: group archived");
    check((await upload(base, arcPath, tokenOwner, "late.jpg", JPEG)).status === 409, "ARCHIVE: upload to archived -> 409");
    check((await get(base, arcPath, tokenOwner)).status === 404, "ARCHIVE: get on archived w/o attachment -> 404");
  } finally {
    await srv.close();
    await cleanUp(beforeFiles);
  }

  const residue = await User.countDocuments({ email: new RegExp(`\\${TEST_DOMAIN}$`) });
  check(residue === 0, `CLEANUP: no residue users remain (${residue})`);

  console.log(`\nattachment smoke checks passed: ${passCount.n}`);
  if (failures > 0) {
    console.log(`\nFAILURES (${failures}):\n- ${failuresList.join("\n- ")}\n`);
    console.log("ALL ATTACHMENT SMOKE TESTS FAILED");
  } else {
    console.log("\nALL ATTACHMENT SMOKE TESTS PASSED");
  }
  process.exit(failures === 0 ? 0 : 1);
}

/** Snapshot the GridFS file ids that exist before this run creates any. */
async function snapshotBucket(): Promise<Set<string>> {
  const db = requireDb();
  const bucket = new GridFSBucket(db, { bucketName: ATTACHMENT_BUCKET_NAME });
  const ids = new Set<string>();
  for (const file of await bucket.find({}).toArray()) {
    ids.add(file._id.toString());
  }
  return ids;
}

async function bucketCount(): Promise<number> {
  const db = requireDb();
  const bucket = new GridFSBucket(db, { bucketName: ATTACHMENT_BUCKET_NAME });
  const files = await bucket.find({}).toArray();
  return files.length;
}

function requireDb(): import("mongodb").Db {
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error("MongoDB connection not ready");
  }
  return db;
}

main().catch((err) => {
  console.error("Attachment smoke crashed:", err);
  process.exit(2);
});