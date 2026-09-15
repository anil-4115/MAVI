import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiError } from "../../utils/ApiError.js";
import { env } from "../../config/env.js";
import { requireObjectId } from "../common/guard.js";
import { parsePagination } from "../common/pagination.js";
import { getGroupDetail } from "../groups/group.service.js";
import { deleteImage, getImageInfo, openDownloadStream, storeImage, type StoredAttachment } from "./attachment.service.js";
import { sanitizeDisplayFilename, validateAttachmentBuffer } from "./attachment.validation.js";
import {
  authorizeGroupAttachment,
  authorizePersonalAttachment,
  createGroupExpense,
  createPersonalExpense,
  deleteGroupExpense,
  deletePersonalExpense,
  getGroupExpense,
  getPersonalExpense,
  listGroupExpenses,
  listPersonalExpenses,
  removeGroupAttachment,
  removePersonalAttachment,
  setGroupAttachment,
  setPersonalAttachment,
  updateGroupExpense,
  updatePersonalExpense,
} from "./expense.service.js";
import type { PublicExpense } from "./expense.types.js";
import {
  validateCreateExpense,
  validateCreatePersonalExpense,
  validateUpdateExpense,
  validateUpdatePersonalExpense,
} from "./expense.validation.js";

const requireUser = (req: Request): string => {
  if (!req.user) {
    throw new ApiError(401, "Authentication required");
  }
  return req.user.id;
};

/* ----------------------------- attachments -------------------------------- */

/**
 * Validate the uploaded buffer (magic bytes + size), store it in GridFS, then
 * attach it via `attach`. If the DB update fails after a successful upload, the
 * freshly written GridFS file is removed so no orphan is left behind.
 */
const uploadAttachmentFor = async (
  req: Request,
  attach: (stored: StoredAttachment) => Promise<PublicExpense>,
): Promise<PublicExpense> => {
  const file = req.file;
  if (!file) {
    throw new ApiError(400, "A receipt file is required");
  }
  const { mimeType } = validateAttachmentBuffer(file.buffer, env.maxAttachmentBytes);
  const filename = sanitizeDisplayFilename(file.originalname);
  const stored = await storeImage(file.buffer, filename, mimeType);

  try {
    return await attach(stored);
  } catch (err) {
    await deleteImage(stored.fileId).catch(() => undefined);
    throw err;
  }
};

/** Stream a stored attachment through the authenticated API (never a public URL). */
const streamAttachment = async (res: Response, fileId: string, mimeType: string): Promise<void> => {
  const info = await getImageInfo(fileId);
  if (!info) {
    throw new ApiError(404, "Attachment not found");
  }
  res.setHeader("Content-Type", mimeType);
  res.setHeader("Content-Length", String(info.length));
  res.setHeader("Content-Disposition", 'inline; filename="receipt"');
  res.setHeader("Cache-Control", "private, no-store");
  const stream = openDownloadStream(fileId);
  stream.on("error", (err) => {
    res.destroy(err instanceof Error ? err : new Error(String(err)));
  });
  stream.pipe(res);
};

export const uploadGroupAttachment = asyncHandler(async (req: Request, res: Response) => {
  const actorId = requireUser(req);
  const groupId = requireObjectId(req.params.groupId, "Group ID");
  const expenseId = requireObjectId(req.params.expenseId, "Expense ID");
  const expense = await uploadAttachmentFor(req, (stored) =>
    setGroupAttachment(groupId, expenseId, actorId, stored),
  );
  res.status(200).json({ success: true, message: "Receipt attached", data: { expense } });
});

export const getGroupAttachment = asyncHandler(async (req: Request, res: Response) => {
  const actorId = requireUser(req);
  const groupId = requireObjectId(req.params.groupId, "Group ID");
  const expenseId = requireObjectId(req.params.expenseId, "Expense ID");
  const { expense } = await authorizeGroupAttachment(groupId, expenseId, actorId, "read");
  if (!expense.attachment) {
    throw new ApiError(404, "Attachment not found");
  }
  await streamAttachment(res, expense.attachment.fileId.toString(), expense.attachment.mimeType);
});

export const deleteGroupAttachment = asyncHandler(async (req: Request, res: Response) => {
  const actorId = requireUser(req);
  const groupId = requireObjectId(req.params.groupId, "Group ID");
  const expenseId = requireObjectId(req.params.expenseId, "Expense ID");
  const expense = await removeGroupAttachment(groupId, expenseId, actorId);
  res.status(200).json({ success: true, message: "Receipt removed", data: { expense } });
});

export const uploadPersonalAttachment = asyncHandler(async (req: Request, res: Response) => {
  const actorId = requireUser(req);
  const expenseId = requireObjectId(req.params.expenseId, "Expense ID");
  const expense = await uploadAttachmentFor(req, (stored) =>
    setPersonalAttachment(actorId, expenseId, stored),
  );
  res.status(200).json({ success: true, message: "Receipt attached", data: { expense } });
});

export const getPersonalAttachment = asyncHandler(async (req: Request, res: Response) => {
  const actorId = requireUser(req);
  const expenseId = requireObjectId(req.params.expenseId, "Expense ID");
  const expense = await authorizePersonalAttachment(actorId, expenseId);
  if (!expense.attachment) {
    throw new ApiError(404, "Attachment not found");
  }
  await streamAttachment(res, expense.attachment.fileId.toString(), expense.attachment.mimeType);
});

export const deletePersonalAttachment = asyncHandler(async (req: Request, res: Response) => {
  const actorId = requireUser(req);
  const expenseId = requireObjectId(req.params.expenseId, "Expense ID");
  const expense = await removePersonalAttachment(actorId, expenseId);
  res.status(200).json({ success: true, message: "Receipt removed", data: { expense } });
});

/* ------------------------------ group expenses ---------------------------- */

export const createGroup = asyncHandler(async (req: Request, res: Response) => {
  const actorId = requireUser(req);
  const groupId = requireObjectId(req.params.groupId, "Group ID");
  const input = validateCreateExpense(req.body);
  const expense = await createGroupExpense(groupId, actorId, input);

  res.status(201).json({ success: true, message: "Expense created successfully", data: { expense } });
});

export const listGroup = asyncHandler(async (req: Request, res: Response) => {
  const actorId = requireUser(req);
  const groupId = requireObjectId(req.params.groupId, "Group ID");
  const { page, limit, skip } = parsePagination(req.query as Record<string, unknown>);
  const result = await listGroupExpenses(groupId, actorId, page, limit, skip);

  res.status(200).json({ success: true, message: "Expenses retrieved successfully", data: result });
});

export const getGroupExpenseDetail = asyncHandler(async (req: Request, res: Response) => {
  const actorId = requireUser(req);
  const groupId = requireObjectId(req.params.groupId, "Group ID");
  const expenseId = requireObjectId(req.params.expenseId, "Expense ID");
  const expense = await getGroupExpense(groupId, expenseId, actorId);

  res.status(200).json({ success: true, message: "Expense retrieved successfully", data: { expense } });
});

export const updateGroup = asyncHandler(async (req: Request, res: Response) => {
  const actorId = requireUser(req);
  const groupId = requireObjectId(req.params.groupId, "Group ID");
  const expenseId = requireObjectId(req.params.expenseId, "Expense ID");

  const group = await getGroupDetail(groupId, actorId);
  const input = validateUpdateExpense(req.body, group.currency);
  const expense = await updateGroupExpense(groupId, expenseId, actorId, input);

  res.status(200).json({ success: true, message: "Expense updated successfully", data: { expense } });
});

export const deleteGroup = asyncHandler(async (req: Request, res: Response) => {
  const actorId = requireUser(req);
  const groupId = requireObjectId(req.params.groupId, "Group ID");
  const expenseId = requireObjectId(req.params.expenseId, "Expense ID");
  await deleteGroupExpense(groupId, expenseId, actorId);

  res.status(200).json({ success: true, message: "Expense deleted successfully", data: null });
});

/* ---------------------------- personal expenses --------------------------- */

export const createPersonal = asyncHandler(async (req: Request, res: Response) => {
  const actorId = requireUser(req);
  const input = validateCreatePersonalExpense(req.body);
  const expense = await createPersonalExpense(actorId, input);

  res.status(201).json({ success: true, message: "Personal expense created successfully", data: { expense } });
});

export const listPersonal = asyncHandler(async (req: Request, res: Response) => {
  const actorId = requireUser(req);
  const { page, limit, skip } = parsePagination(req.query as Record<string, unknown>);
  const result = await listPersonalExpenses(actorId, page, limit, skip);

  res.status(200).json({ success: true, message: "Personal expenses retrieved successfully", data: result });
});

export const getPersonal = asyncHandler(async (req: Request, res: Response) => {
  const actorId = requireUser(req);
  const expenseId = requireObjectId(req.params.expenseId, "Expense ID");
  const expense = await getPersonalExpense(actorId, expenseId);

  res.status(200).json({ success: true, message: "Personal expense retrieved successfully", data: { expense } });
});

export const updatePersonal = asyncHandler(async (req: Request, res: Response) => {
  const actorId = requireUser(req);
  const expenseId = requireObjectId(req.params.expenseId, "Expense ID");
  const input = validateUpdatePersonalExpense(req.body);
  const expense = await updatePersonalExpense(actorId, expenseId, input);

  res.status(200).json({ success: true, message: "Personal expense updated successfully", data: { expense } });
});

export const deletePersonal = asyncHandler(async (req: Request, res: Response) => {
  const actorId = requireUser(req);
  const expenseId = requireObjectId(req.params.expenseId, "Expense ID");
  await deletePersonalExpense(actorId, expenseId);

  res.status(200).json({ success: true, message: "Personal expense deleted successfully", data: null });
});