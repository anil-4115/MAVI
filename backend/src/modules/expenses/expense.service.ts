import { Types } from "mongoose";
import { ApiError } from "../../utils/ApiError.js";
import { Group, type GroupDocument } from "../groups/group.model.js";
import { calculateShares } from "../splitting/splitting.js";
import type { SplitRequest, SplitShare } from "../splitting/splitting.types.js";
import { SplitValidationError } from "../splitting/splitting.types.js";
import { Expense, type ExpenseDocument, type IExpenseAttachment } from "./expense.model.js";
import { notify, onExpenseCreated } from "../notifications/notification.service.js";
import type { PublicExpense, PublicExpenseAttachment } from "./expense.types.js";
import { deleteImage, type StoredAttachment } from "./attachment.service.js";
import {
  getParticipantUserIds,
  validateSplitPayload,
  type CreateExpenseInput,
  type CreatePersonalExpenseInput,
  type UpdateExpenseInput,
  type UpdatePersonalExpenseInput,
} from "./expense.validation.js";

const toPublicAttachment = (attachment: IExpenseAttachment): PublicExpenseAttachment => ({
  fileId: attachment.fileId.toString(),
  filename: attachment.filename,
  mimeType: attachment.mimeType,
  sizeBytes: attachment.sizeBytes,
  uploadedAt: (attachment.uploadedAt instanceof Date ? attachment.uploadedAt : new Date(attachment.uploadedAt)).toISOString(),
});

const toExpenseAttachmentDoc = (stored: StoredAttachment): IExpenseAttachment => ({
  fileId: new Types.ObjectId(stored.fileId),
  filename: stored.filename,
  mimeType: stored.mimeType,
  sizeBytes: stored.sizeBytes,
  uploadedAt: stored.uploadedAt,
});

const toPublicExpense = (expense: ExpenseDocument): PublicExpense => ({
  id: expense._id.toString(),
  group: expense.group ? expense.group.toString() : null,
  createdBy: expense.createdBy.toString(),
  title: expense.title,
  amountMinor: expense.amountMinor,
  currency: expense.currency,
  expenseDate: (expense.expenseDate instanceof Date ? expense.expenseDate : new Date(expense.expenseDate)).toISOString(),
  payerId: expense.payerId.toString(),
  splitMethod: expense.splitMethod,
  splitInput: expense.splitInput,
  participantShares: (expense.participantShares ?? []).map((s) => ({
    userId: s.userId.toString(),
    amountMinor: s.amountMinor,
  })),
  attachment: expense.attachment ? toPublicAttachment(expense.attachment) : null,
  voided: expense.voided ?? false,
  voidedAt: expense.voidedAt ? expense.voidedAt.toISOString() : null,
  createdAt: expense.createdAt.toISOString(),
  updatedAt: expense.updatedAt.toISOString(),
});

const findGroupOrThrow = async (groupId: string): Promise<GroupDocument> => {
  const group = await Group.findById(groupId);
  if (!group) {
    throw new ApiError(404, "Group not found");
  }
  return group as unknown as GroupDocument;
};

const getMembership = (group: GroupDocument, userId: string) =>
  group.members.find((m) => m.userId.toString() === userId);

/** Writer (authed user) must be an active group member. */
const assertActorActive = (group: GroupDocument, actorId: string): void => {
  const member = getMembership(group, actorId);
  if (!member || member.status !== "active") {
    // 404 (not 403) so callers cannot tell whether the group exists.
    throw new ApiError(404, "Group not found");
  }
};

/** Payer/participant must be an active member of the group. */
const assertParticipantActive = (group: GroupDocument, userId: string, label: string): void => {
  const member = getMembership(group, userId);
  if (!member || member.status !== "active") {
    throw new ApiError(400, `${label} must be an active member of this group`);
  }
};

const assertPayerAndParticipants = (group: GroupDocument, payerId: string, participantIds: string[]): void => {
  assertParticipantActive(group, payerId, "Payer");
  for (const participantId of participantIds) {
    assertParticipantActive(group, participantId, "Participant");
  }
};

/** Archived groups are read-only for new/changed financial records. */
const ensureWritable = (group: GroupDocument): void => {
  if (group.archived) {
    throw new ApiError(409, "Archived groups are read-only");
  }
};

const getOwnerId = (group: GroupDocument): string | null => {
  const owner = group.members.find((m) => m.role === "owner" && m.status === "active");
  return owner ? owner.userId.toString() : null;
};

const assertCanModifyExpense = (group: GroupDocument, expense: ExpenseDocument, actorId: string): void => {
  assertActorActive(group, actorId);
  const isCreator = expense.createdBy.toString() === actorId;
  const isOwner = getOwnerId(group) === actorId;
  if (!isCreator && !isOwner) {
    throw new ApiError(403, "Only the expense creator or the group owner can modify this expense");
  }
};

const computeShares = (splitRequest: SplitRequest, amountMinor: number): SplitShare[] => {
  let shares: SplitShare[];
  try {
    shares = calculateShares(splitRequest);
  } catch (err) {
    if (err instanceof SplitValidationError) {
      throw new ApiError(400, err.message);
    }
    throw err;
  }

  const total = shares.reduce((acc, s) => acc + s.amountMinor, 0);
  if (total !== amountMinor) {
    throw new ApiError(400, "The split result must exactly equal the expense total");
  }
  return shares;
};

const findGroupExpenseOrThrow = async (groupId: string, expenseId: string): Promise<ExpenseDocument> => {
  const expense = await Expense.findOne({
    _id: expenseId,
    group: new Types.ObjectId(groupId),
    voided: { $ne: true },
  });
  if (!expense) {
    throw new ApiError(404, "Expense not found");
  }
  return expense as unknown as ExpenseDocument;
};

const findPersonalExpenseOrThrow = async (ownerId: string, expenseId: string): Promise<ExpenseDocument> => {
  const expense = await Expense.findOne({
    _id: expenseId,
    group: null,
    createdBy: new Types.ObjectId(ownerId),
    voided: { $ne: true },
  });
  if (!expense) {
    throw new ApiError(404, "Expense not found");
  }
  return expense as unknown as ExpenseDocument;
};

/* ---------------------------- attachment access --------------------------- */

export type AttachmentAccessMode = "read" | "write";

/**
 * Resolve a group expense for attachment access using the SAME authorization
 * rules as the rest of the expense module:
 * - read:  active group member only (uniform 404)
 * - write: creator-or-owner + group not archived
 */
export async function authorizeGroupAttachment(
  groupId: string,
  expenseId: string,
  actorId: string,
  mode: AttachmentAccessMode,
): Promise<{ group: GroupDocument; expense: ExpenseDocument }> {
  const group = await findGroupOrThrow(groupId);
  if (mode === "read") {
    assertActorActive(group, actorId);
  } else {
    ensureWritable(group);
  }
  const expense = await findGroupExpenseOrThrow(groupId, expenseId);
  if (mode === "write") {
    assertCanModifyExpense(group, expense, actorId);
  }
  return { group, expense };
}

/** Personal expenses are owner-only for every attachment operation. */
export async function authorizePersonalAttachment(ownerId: string, expenseId: string): Promise<ExpenseDocument> {
  return findPersonalExpenseOrThrow(ownerId, expenseId);
}

/** Delete a stored GridFS file best-effort; never blocks the primary mutation. */
const deleteStoredFile = async (fileId: string): Promise<void> => {
  try {
    await deleteImage(fileId);
  } catch (err) {
    console.error(`Failed to clean up attachment file ${fileId}:`, err instanceof Error ? err.message : err);
  }
};

export async function setGroupAttachment(
  groupId: string,
  expenseId: string,
  actorId: string,
  stored: StoredAttachment,
): Promise<PublicExpense> {
  const { expense } = await authorizeGroupAttachment(groupId, expenseId, actorId, "write");
  const previousFileId = expense.attachment ? expense.attachment.fileId.toString() : null;

  expense.attachment = toExpenseAttachmentDoc(stored);
  await expense.save();

  if (previousFileId) {
    await deleteStoredFile(previousFileId);
  }
  return toPublicExpense(expense);
}

export async function removeGroupAttachment(
  groupId: string,
  expenseId: string,
  actorId: string,
): Promise<PublicExpense> {
  const { expense } = await authorizeGroupAttachment(groupId, expenseId, actorId, "write");
  const fileId = expense.attachment ? expense.attachment.fileId.toString() : null;
  if (!fileId) {
    throw new ApiError(404, "Attachment not found");
  }

  expense.attachment = null;
  await expense.save();

  await deleteStoredFile(fileId);
  return toPublicExpense(expense);
}

export async function setPersonalAttachment(
  ownerId: string,
  expenseId: string,
  stored: StoredAttachment,
): Promise<PublicExpense> {
  const expense = await authorizePersonalAttachment(ownerId, expenseId);
  const previousFileId = expense.attachment ? expense.attachment.fileId.toString() : null;

  expense.attachment = toExpenseAttachmentDoc(stored);
  await expense.save();

  if (previousFileId) {
    await deleteStoredFile(previousFileId);
  }
  return toPublicExpense(expense);
}

export async function removePersonalAttachment(ownerId: string, expenseId: string): Promise<PublicExpense> {
  const expense = await authorizePersonalAttachment(ownerId, expenseId);
  const fileId = expense.attachment ? expense.attachment.fileId.toString() : null;
  if (!fileId) {
    throw new ApiError(404, "Attachment not found");
  }

  expense.attachment = null;
  await expense.save();

  await deleteStoredFile(fileId);
  return toPublicExpense(expense);
}

/* ------------------------------ group expenses ---------------------------- */

export interface CreateGroupExpenseOptions {
  /**
   * When true, no `expense_created` notifications are emitted. Used by the
   * recurring generator so automated occurrences do not spam members; manual
   * expense creation keeps the default (notify) behavior.
   */
  suppressNotifications?: boolean;
}

export async function createGroupExpense(
  groupId: string,
  actorId: string,
  input: CreateExpenseInput,
  options: CreateGroupExpenseOptions = {},
): Promise<PublicExpense> {
  const group = await findGroupOrThrow(groupId);
  ensureWritable(group);
  assertActorActive(group, actorId);

  assertPayerAndParticipants(group, input.payerId, getParticipantUserIds(input.split));
  const shares = computeShares(input.split, input.amountMinor);

  const expense = (await Expense.create({
    group: new Types.ObjectId(groupId),
    createdBy: new Types.ObjectId(actorId),
    title: input.title,
    amountMinor: input.amountMinor,
    currency: input.currency,
    expenseDate: input.expenseDate,
    payerId: new Types.ObjectId(input.payerId),
    splitMethod: input.split.method,
    splitInput: input.split,
    participantShares: shares.map((s) => ({ userId: new Types.ObjectId(s.userId), amountMinor: s.amountMinor })),
    voided: false,
    voidedAt: null,
    voidedBy: null,
  })) as unknown as ExpenseDocument;

  if (!options.suppressNotifications) {
    await notify(
      onExpenseCreated(group, actorId, {
        id: expense._id.toString(),
        title: expense.title,
        amountMinor: expense.amountMinor,
        currency: expense.currency,
      }),
    );
  }

  return toPublicExpense(expense);
}

export async function listGroupExpenses(
  groupId: string,
  actorId: string,
  page: number,
  limit: number,
  skip: number,
): Promise<{ items: PublicExpense[]; total: number; page: number; limit: number; totalPages: number }> {
  const group = await findGroupOrThrow(groupId);
  assertActorActive(group, actorId);

  const filter = { group: new Types.ObjectId(groupId), voided: { $ne: true } };
  const [total, docs] = await Promise.all([
    Expense.countDocuments(filter),
    Expense.find(filter).sort({ expenseDate: -1, _id: -1 }).skip(skip).limit(limit),
  ]);

  return {
    items: (docs as unknown as ExpenseDocument[]).map(toPublicExpense),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getGroupExpense(groupId: string, expenseId: string, actorId: string): Promise<PublicExpense> {
  const group = await findGroupOrThrow(groupId);
  assertActorActive(group, actorId);

  const expense = await findGroupExpenseOrThrow(groupId, expenseId);
  return toPublicExpense(expense);
}

export async function updateGroupExpense(
  groupId: string,
  expenseId: string,
  actorId: string,
  input: UpdateExpenseInput,
): Promise<PublicExpense> {
  const group = await findGroupOrThrow(groupId);
  ensureWritable(group);
  const expense = await findGroupExpenseOrThrow(groupId, expenseId);
  assertCanModifyExpense(group, expense, actorId);

  if (input.title !== undefined) expense.title = input.title;
  if (input.expenseDate !== undefined) expense.expenseDate = input.expenseDate;

  if (input.payerId !== undefined) {
    assertParticipantActive(group, input.payerId, "Payer");
    expense.payerId = new Types.ObjectId(input.payerId);
  }

  if (input.amountMinor !== undefined || input.rawSplit !== undefined) {
    const effectiveAmount = input.amountMinor ?? expense.amountMinor;
    const splitRequest =
      input.rawSplit !== undefined
        ? validateSplitPayload(input.rawSplit, effectiveAmount, group.currency)
        : { ...(expense.splitInput as SplitRequest), totalMinor: effectiveAmount };

    const payerId = input.payerId ?? expense.payerId.toString();
    assertPayerAndParticipants(group, payerId, getParticipantUserIds(splitRequest));
    const shares = computeShares(splitRequest, effectiveAmount);

    expense.amountMinor = effectiveAmount;
    expense.splitMethod = splitRequest.method;
    expense.splitInput = splitRequest;
    expense.participantShares = shares.map((s) => ({
      userId: new Types.ObjectId(s.userId),
      amountMinor: s.amountMinor,
    }));
  }

  await expense.save();
  return toPublicExpense(expense);
}

/**
 * Soft-delete: voids the expense instead of removing the record so financial
 * history remains intact. Later balance derivation MUST exclude expenses with
 * `voided: true`; the group/owner/creator scoped list endpoint already does.
 */
export async function deleteGroupExpense(groupId: string, expenseId: string, actorId: string): Promise<void> {
  const group = await findGroupOrThrow(groupId);
  ensureWritable(group);
  const expense = await findGroupExpenseOrThrow(groupId, expenseId);
  assertCanModifyExpense(group, expense, actorId);

  const attachmentFileId = expense.attachment ? expense.attachment.fileId.toString() : null;
  expense.voided = true;
  expense.voidedAt = new Date();
  expense.voidedBy = new Types.ObjectId(actorId);
  if (attachmentFileId) {
    // The expense record stays (financial history), but its receipt must not.
    expense.attachment = null;
  }
  await expense.save();

  if (attachmentFileId) {
    await deleteStoredFile(attachmentFileId);
  }
}

/* ---------------------------- personal expenses --------------------------- */

export async function createPersonalExpense(
  actorId: string,
  input: CreatePersonalExpenseInput,
): Promise<PublicExpense> {
  const splitRequest: SplitRequest = {
    method: "equal",
    totalMinor: input.amountMinor,
    currency: input.currency,
    equal: [{ userId: actorId }],
  };

  const expense = (await Expense.create({
    group: null,
    createdBy: new Types.ObjectId(actorId),
    title: input.title,
    amountMinor: input.amountMinor,
    currency: input.currency,
    expenseDate: input.expenseDate,
    payerId: new Types.ObjectId(actorId),
    splitMethod: "equal",
    splitInput: splitRequest,
    participantShares: [{ userId: new Types.ObjectId(actorId), amountMinor: input.amountMinor }],
    voided: false,
    voidedAt: null,
    voidedBy: null,
  })) as unknown as ExpenseDocument;

  return toPublicExpense(expense);
}

export async function listPersonalExpenses(
  actorId: string,
  page: number,
  limit: number,
  skip: number,
): Promise<{ items: PublicExpense[]; total: number; page: number; limit: number; totalPages: number }> {
  const filter = { group: null, createdBy: new Types.ObjectId(actorId), voided: { $ne: true } };
  const [total, docs] = await Promise.all([
    Expense.countDocuments(filter),
    Expense.find(filter).sort({ expenseDate: -1, _id: -1 }).skip(skip).limit(limit),
  ]);

  return {
    items: (docs as unknown as ExpenseDocument[]).map(toPublicExpense),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getPersonalExpense(ownerId: string, expenseId: string): Promise<PublicExpense> {
  const expense = await findPersonalExpenseOrThrow(ownerId, expenseId);
  return toPublicExpense(expense);
}

export async function updatePersonalExpense(
  ownerId: string,
  expenseId: string,
  input: UpdatePersonalExpenseInput,
): Promise<PublicExpense> {
  const expense = await findPersonalExpenseOrThrow(ownerId, expenseId);

  if (input.title !== undefined) expense.title = input.title;
  if (input.expenseDate !== undefined) expense.expenseDate = input.expenseDate;

  if (input.amountMinor !== undefined) {
    expense.amountMinor = input.amountMinor;
    expense.participantShares = [{ userId: new Types.ObjectId(ownerId), amountMinor: input.amountMinor }];

    const splitInput = expense.splitInput as SplitRequest | null;
    if (splitInput) {
      splitInput.totalMinor = input.amountMinor;
      splitInput.equal = [{ userId: ownerId }];
      expense.splitInput = splitInput;
    }
  }

  await expense.save();
  return toPublicExpense(expense);
}

export async function deletePersonalExpense(ownerId: string, expenseId: string): Promise<void> {
  const expense = await findPersonalExpenseOrThrow(ownerId, expenseId);

  const attachmentFileId = expense.attachment ? expense.attachment.fileId.toString() : null;
  expense.voided = true;
  expense.voidedAt = new Date();
  expense.voidedBy = new Types.ObjectId(ownerId);
  if (attachmentFileId) {
    expense.attachment = null;
  }
  await expense.save();

  if (attachmentFileId) {
    await deleteStoredFile(attachmentFileId);
  }
}