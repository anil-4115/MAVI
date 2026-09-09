import type { ApiEnvelope, PaginatedResult } from "../../../lib/types";
import api from "../../../services/api";

/**
 * Group expense contract (backend/src/modules/expenses/* and the H.4 splitting
 * engine). All *Minor values are integer minor units (paise) — the backend is
 * authoritative for every number; the frontend only formats them.
 *
 * Create/edit payloads send the method-specific array only (no `totalMinor` /
 * `currency`): the backend injects those via `validateSplitPayload`.
 */

export const SPLIT_METHODS = ["equal", "quantity", "exact", "percentage", "shares", "itemwise"] as const;
export type SplitMethod = (typeof SPLIT_METHODS)[number];

export interface SplitParticipantInput {
  userId: string;
}

export interface QuantityParticipantInput extends SplitParticipantInput {
  quantity: number;
}

export interface ExactParticipantInput extends SplitParticipantInput {
  amountMinor: number;
}

export interface PercentageParticipantInput extends SplitParticipantInput {
  percentage: number;
}

export interface SharesParticipantInput extends SplitParticipantInput {
  shares: number;
}

export interface ItemwiseItemInput {
  title?: string;
  amountMinor: number;
  participants: string[];
}

/** Payload sent to the backend for create/update (method + one array). */
export type SplitPayload = { method: "equal"; equal: SplitParticipantInput[] } | { method: "quantity"; quantity: QuantityParticipantInput[] } | { method: "exact"; exact: ExactParticipantInput[] } | { method: "percentage"; percentage: PercentageParticipantInput[] } | { method: "shares"; shares: SharesParticipantInput[] } | { method: "itemwise"; itemwise: ItemwiseItemInput[] };

export interface PublicExpenseParticipantShare {
  userId: string;
  amountMinor: number;
}

/** Mirrors backend PublicExpense. `splitInput` is the stored engine request (read-only). */
export interface PublicExpense {
  id: string;
  group: string | null;
  createdBy: string;
  title: string;
  amountMinor: number;
  currency: string;
  expenseDate: string;
  payerId: string;
  splitMethod: SplitMethod;
  splitInput: unknown | null;
  participantShares: PublicExpenseParticipantShare[];
  voided: boolean;
  voidedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateExpensePayload {
  title: string;
  amountMinor: number;
  currency?: string;
  /** ISO date string. */
  expenseDate?: string;
  payerId: string;
  split: SplitPayload;
}

export interface UpdateExpensePayload {
  title?: string;
  amountMinor?: number;
  expenseDate?: string;
  payerId?: string;
  split?: SplitPayload;
}

export interface ListExpensesParams {
  page?: number;
  limit?: number;
}

type ExpenseResponse = ApiEnvelope<{ expense: PublicExpense }>;
type ExpenseListResponse = ApiEnvelope<PaginatedResult<PublicExpense>>;

export const listGroupExpenses = async (
  groupId: string,
  params: ListExpensesParams = {}
): Promise<PaginatedResult<PublicExpense>> => {
  const response = await api.get<ExpenseListResponse>(`/groups/${groupId}/expenses`, { params });
  return response.data.data;
};

export const getGroupExpense = async (groupId: string, expenseId: string): Promise<PublicExpense> => {
  const response = await api.get<ExpenseResponse>(`/groups/${groupId}/expenses/${expenseId}`);
  return response.data.data.expense;
};

export const createGroupExpense = async (
  groupId: string,
  payload: CreateExpensePayload
): Promise<PublicExpense> => {
  const response = await api.post<ExpenseResponse>(`/groups/${groupId}/expenses`, payload);
  return response.data.data.expense;
};

/** Only the expense creator or the group owner may update/void (backend-enforced). */
export const updateGroupExpense = async (
  groupId: string,
  expenseId: string,
  payload: UpdateExpensePayload
): Promise<PublicExpense> => {
  const response = await api.patch<ExpenseResponse>(`/groups/${groupId}/expenses/${expenseId}`, payload);
  return response.data.data.expense;
};

/** Soft-delete: voids the expense; history stays intact. */
export const deleteGroupExpense = async (groupId: string, expenseId: string): Promise<void> => {
  await api.delete<ApiEnvelope<null>>(`/groups/${groupId}/expenses/${expenseId}`);
};

/*
 * Personal expenses (backend H.5): `POST/GET /expenses/personal`,
 * `GET/PATCH/DELETE /expenses/personal/:expenseId`. Personal expenses belong to
 * the authenticated user only (createdBy = owner, group = null, payer = owner,
 * single self-share). No category or splitting fields exist on the backend, so
 * none are sent. Money is integer minor units (paise); the backend is
 * authoritative and the frontend only formats.
 */

export interface CreatePersonalExpensePayload {
  title: string;
  amountMinor: number;
  /** ISO date string; defaults to today server-side. */
  expenseDate?: string;
}

export interface UpdatePersonalExpensePayload {
  title?: string;
  amountMinor?: number;
  /** ISO date string. */
  expenseDate?: string;
}

export const listPersonalExpenses = async (
  params: ListExpensesParams = {}
): Promise<PaginatedResult<PublicExpense>> => {
  const response = await api.get<ExpenseListResponse>("/expenses/personal", { params });
  return response.data.data;
};

export const getPersonalExpense = async (expenseId: string): Promise<PublicExpense> => {
  const response = await api.get<ExpenseResponse>(`/expenses/personal/${expenseId}`);
  return response.data.data.expense;
};

export const createPersonalExpense = async (payload: CreatePersonalExpensePayload): Promise<PublicExpense> => {
  const response = await api.post<ExpenseResponse>("/expenses/personal", payload);
  return response.data.data.expense;
};

export const updatePersonalExpense = async (
  expenseId: string,
  payload: UpdatePersonalExpensePayload
): Promise<PublicExpense> => {
  const response = await api.patch<ExpenseResponse>(`/expenses/personal/${expenseId}`, payload);
  return response.data.data.expense;
};

/** Soft-delete: voids the personal expense; it drops out of the list. */
export const deletePersonalExpense = async (expenseId: string): Promise<void> => {
  await api.delete<ApiEnvelope<null>>(`/expenses/personal/${expenseId}`);
};