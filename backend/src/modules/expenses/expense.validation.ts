import { Types } from "mongoose";
import { ApiError } from "../../utils/ApiError.js";
import { DEFAULT_CURRENCY } from "../common/money.js";
import type { SplitRequest } from "../splitting/splitting.types.js";
import { SplitValidationError } from "../splitting/splitting.types.js";
import { validateSplitInput } from "../splitting/splitting.validation.js";

/* ----------------------------- field helpers ----------------------------- */

const getTitle = (value: unknown): string => {
  if (typeof value !== "string" || value.trim().length < 1 || value.trim().length > 120) {
    throw new ApiError(400, "Title must be between 1 and 120 characters");
  }
  return value.trim();
};

const getAmountMinor = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new ApiError(400, "amountMinor must be a positive integer");
  }
  return value;
};

const getCurrency = (value: unknown): string => {
  const currency = value === undefined || value === null ? DEFAULT_CURRENCY : String(value).trim().toUpperCase();
  if (currency !== DEFAULT_CURRENCY) {
    throw new ApiError(400, `Only ${DEFAULT_CURRENCY} is supported at this time`);
  }
  return currency;
};

const getExpenseDate = (value: unknown): Date => {
  if (value === undefined || value === null) return new Date();
  const date = new Date(value as string);
  if (Number.isNaN(date.getTime())) {
    throw new ApiError(400, "expenseDate must be a valid date");
  }
  return date;
};

const getPayerId = (value: unknown): string => {
  if (typeof value !== "string" || !Types.ObjectId.isValid(value)) {
    throw new ApiError(400, "A valid payerId is required");
  }
  return value;
};

/* ----------------------------- splitting glue ---------------------------- */

/** Union of all participant userIds referenced by a split request. */
export function getParticipantUserIds(split: SplitRequest): string[] {
  switch (split.method) {
    case "equal":
      return (split.equal ?? []).map((p) => p.userId);
    case "quantity":
      return (split.quantity ?? []).map((p) => p.userId);
    case "exact":
      return (split.exact ?? []).map((p) => p.userId);
    case "percentage":
      return (split.percentage ?? []).map((p) => p.userId);
    case "shares":
      return (split.shares ?? []).map((p) => p.userId);
    case "itemwise":
      return [...new Set((split.itemwise ?? []).flatMap((item) => item.participants))];
  }
}

/**
 * Validate an untrusted split payload through the H.4 engine, binding the
 * expense total and currency. Converts engine errors to ApiError(400) and
 * enforces that every participant userId is a valid ObjectId.
 */
export function validateSplitPayload(rawSplit: unknown, totalMinor: number, currency: string): SplitRequest {
  if (typeof rawSplit !== "object" || rawSplit === null || Array.isArray(rawSplit)) {
    throw new ApiError(400, "A valid split configuration is required");
  }

  let request: SplitRequest;
  try {
    request = validateSplitInput({ ...(rawSplit as object), totalMinor, currency });
  } catch (err) {
    if (err instanceof SplitValidationError) {
      throw new ApiError(400, err.message);
    }
    throw err;
  }

  for (const userId of getParticipantUserIds(request)) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new ApiError(400, "Each participant must be a valid userId");
    }
  }

  return request;
}

/* ------------------------------ group expense ----------------------------- */

export interface CreateExpenseInput {
  title: string;
  amountMinor: number;
  currency: string;
  expenseDate: Date;
  payerId: string;
  split: SplitRequest;
}

export function validateCreateExpense(body: unknown): CreateExpenseInput {
  const { title, amountMinor, currency, expenseDate, payerId, split } = (body ?? {}) as Record<string, unknown>;

  const validatedAmount = getAmountMinor(amountMinor);
  const validatedCurrency = getCurrency(currency);

  return {
    title: getTitle(title),
    amountMinor: validatedAmount,
    currency: validatedCurrency,
    expenseDate: getExpenseDate(expenseDate),
    payerId: getPayerId(payerId),
    split: validateSplitPayload(split, validatedAmount, validatedCurrency),
  };
}

export interface UpdateExpenseInput {
  title?: string;
  amountMinor?: number;
  expenseDate?: Date;
  payerId?: string;
  /** Raw split object; validated against the effective total inside the service. */
  rawSplit?: unknown;
}

export function validateUpdateExpense(body: unknown, groupCurrency: string): UpdateExpenseInput {
  const { title, amountMinor, currency, expenseDate, payerId, split, group } = (body ?? {}) as Record<string, unknown>;

  if (group !== undefined && group !== null) {
    throw new ApiError(400, "An expense cannot be moved to another group");
  }
  if (currency !== undefined && currency !== null && String(currency).trim().toUpperCase() !== groupCurrency) {
    throw new ApiError(400, "The expense currency cannot be changed");
  }

  const hasTitle = title !== undefined && title !== null;
  const hasAmount = amountMinor !== undefined && amountMinor !== null;
  const hasDate = expenseDate !== undefined && expenseDate !== null;
  const hasPayer = payerId !== undefined && payerId !== null;
  const hasSplit = split !== undefined && split !== null;

  if (!hasTitle && !hasAmount && !hasDate && !hasPayer && !hasSplit) {
    throw new ApiError(400, "Provide at least one field to update");
  }
  if (hasSplit && (typeof split !== "object" || split === null || Array.isArray(split))) {
    throw new ApiError(400, "A valid split configuration is required");
  }

  return {
    title: hasTitle ? getTitle(title) : undefined,
    amountMinor: hasAmount ? getAmountMinor(amountMinor) : undefined,
    expenseDate: hasDate ? getExpenseDate(expenseDate) : undefined,
    payerId: hasPayer ? getPayerId(payerId) : undefined,
    rawSplit: hasSplit ? split : undefined,
  };
}

/* ---------------------------- personal expenses --------------------------- */

const rejectPersonalExtras = (body: Record<string, unknown>): void => {
  const { payerId, split, group, participantShares } = body;
  if (payerId !== undefined && payerId !== null) {
    throw new ApiError(400, "Personal expenses cannot specify a payer");
  }
  if (split !== undefined && split !== null) {
    throw new ApiError(400, "Personal expenses cannot define custom splitting");
  }
  if (group !== undefined && group !== null) {
    throw new ApiError(400, "Personal expenses cannot belong to a group");
  }
  if (participantShares !== undefined && participantShares !== null) {
    throw new ApiError(400, "Personal expenses cannot define participants");
  }
};

export interface CreatePersonalExpenseInput {
  title: string;
  amountMinor: number;
  currency: string;
  expenseDate: Date;
}

export function validateCreatePersonalExpense(body: unknown): CreatePersonalExpenseInput {
  const record = (body ?? {}) as Record<string, unknown>;
  rejectPersonalExtras(record);

  const { title, amountMinor, currency, expenseDate } = record;
  const validatedAmount = getAmountMinor(amountMinor);

  return {
    title: getTitle(title),
    amountMinor: validatedAmount,
    currency: getCurrency(currency),
    expenseDate: getExpenseDate(expenseDate),
  };
}

export interface UpdatePersonalExpenseInput {
  title?: string;
  amountMinor?: number;
  expenseDate?: Date;
}

export function validateUpdatePersonalExpense(body: unknown): UpdatePersonalExpenseInput {
  const record = (body ?? {}) as Record<string, unknown>;
  rejectPersonalExtras(record);

  const { title, amountMinor, expenseDate, currency } = record;
  if (currency !== undefined && currency !== null) {
    getCurrency(currency);
  }

  const hasTitle = title !== undefined && title !== null;
  const hasAmount = amountMinor !== undefined && amountMinor !== null;
  const hasDate = expenseDate !== undefined && expenseDate !== null;

  if (!hasTitle && !hasAmount && !hasDate) {
    throw new ApiError(400, "Provide at least one field to update");
  }

  return {
    title: hasTitle ? getTitle(title) : undefined,
    amountMinor: hasAmount ? getAmountMinor(amountMinor) : undefined,
    expenseDate: hasDate ? getExpenseDate(expenseDate) : undefined,
  };
}