import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiError } from "../../utils/ApiError.js";
import { requireObjectId } from "../common/guard.js";
import { parsePagination } from "../common/pagination.js";
import { getGroupDetail } from "../groups/group.service.js";
import {
  createGroupExpense,
  createPersonalExpense,
  deleteGroupExpense,
  deletePersonalExpense,
  getGroupExpense,
  getPersonalExpense,
  listGroupExpenses,
  listPersonalExpenses,
  updateGroupExpense,
  updatePersonalExpense,
} from "./expense.service.js";
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