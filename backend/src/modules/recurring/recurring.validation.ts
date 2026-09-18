import { Types } from "mongoose";
import { ApiError } from "../../utils/ApiError.js";
import { DEFAULT_CURRENCY } from "../common/money.js";
import { getParticipantUserIds, validateSplitPayload } from "../expenses/expense.validation.js";
import type { SplitRequest } from "../splitting/splitting.types.js";
import { isValidDayKey, todayUtcDayKey } from "./recurrence.js";
import { RECURRING_FREQUENCIES, type RecurringFrequency } from "./recurring.types.js";

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
  const currency =
    value === undefined || value === null ? DEFAULT_CURRENCY : String(value).trim().toUpperCase();
  if (currency !== DEFAULT_CURRENCY) {
    throw new ApiError(400, `Only ${DEFAULT_CURRENCY} is supported at this time`);
  }
  return currency;
};

const getFrequency = (value: unknown): RecurringFrequency => {
  if (typeof value !== "string" || !RECURRING_FREQUENCIES.includes(value as RecurringFrequency)) {
    throw new ApiError(400, `frequency must be one of ${RECURRING_FREQUENCIES.join(", ")}`);
  }
  return value as RecurringFrequency;
};

/** MVP intentionally supports only an interval of 1; anything else is rejected. */
const getInterval = (value: unknown): number => {
  if (value === undefined || value === null) return 1;
  if (value !== 1) {
    throw new ApiError(400, "interval must be 1 (custom intervals are not supported yet)");
  }
  return 1;
};

const getStartDate = (value: unknown): string => {
  if (value === undefined || value === null) return todayUtcDayKey();
  if (!isValidDayKey(value)) {
    throw new ApiError(400, "startDate must be a valid YYYY-MM-DD date");
  }
  return value;
};

const getEndDate = (value: unknown): string | null => {
  if (value === undefined || value === null) return null;
  if (!isValidDayKey(value)) {
    throw new ApiError(400, "endDate must be a valid YYYY-MM-DD date");
  }
  return value;
};

const getPayerId = (value: unknown): string => {
  if (typeof value !== "string" || !Types.ObjectId.isValid(value)) {
    throw new ApiError(400, "A valid payerId is required");
  }
  return value;
};

const assertEndNotBeforeStart = (startDate: string, endDate: string | null): void => {
  if (endDate !== null && endDate < startDate) {
    throw new ApiError(400, "endDate cannot be before startDate");
  }
};

/* ------------------------------ group rule ------------------------------- */

export interface CreateGroupRuleInput {
  title: string;
  amountMinor: number;
  currency: string;
  payerId: string;
  split: SplitRequest;
  frequency: RecurringFrequency;
  interval: number;
  startDate: string;
  endDate: string | null;
}

export function validateCreateGroupRule(body: unknown): CreateGroupRuleInput {
  const { title, amountMinor, currency, payerId, split, frequency, interval, startDate, endDate } = (
    body ?? {}
  ) as Record<string, unknown>;

  const validatedAmount = getAmountMinor(amountMinor);
  const validatedCurrency = getCurrency(currency);
  const validatedStart = getStartDate(startDate);
  const validatedEnd = getEndDate(endDate);
  assertEndNotBeforeStart(validatedStart, validatedEnd);

  const validatedSplit = validateSplitPayload(split, validatedAmount, validatedCurrency);
  if (getParticipantUserIds(validatedSplit).length === 0) {
    throw new ApiError(400, "A recurring group rule requires at least one participant");
  }

  return {
    title: getTitle(title),
    amountMinor: validatedAmount,
    currency: validatedCurrency,
    payerId: getPayerId(payerId),
    split: validatedSplit,
    frequency: getFrequency(frequency),
    interval: getInterval(interval),
    startDate: validatedStart,
    endDate: validatedEnd,
  };
}

/* ---------------------------- personal rule ------------------------------ */

export interface CreatePersonalRuleInput {
  title: string;
  amountMinor: number;
  currency: string;
  frequency: RecurringFrequency;
  interval: number;
  startDate: string;
  endDate: string | null;
}

export function validateCreatePersonalRule(body: unknown): CreatePersonalRuleInput {
  const record = (body ?? {}) as Record<string, unknown>;
  const { title, amountMinor, currency, frequency, interval, startDate, endDate } = record;

  if (record.payerId !== undefined && record.payerId !== null) {
    throw new ApiError(400, "Personal recurring rules cannot specify a payer");
  }
  if (record.split !== undefined && record.split !== null) {
    throw new ApiError(400, "Personal recurring rules cannot define custom splitting");
  }
  if (record.group !== undefined && record.group !== null) {
    throw new ApiError(400, "Personal recurring rules cannot belong to a group");
  }

  const validatedStart = getStartDate(startDate);
  const validatedEnd = getEndDate(endDate);
  assertEndNotBeforeStart(validatedStart, validatedEnd);

  return {
    title: getTitle(title),
    amountMinor: getAmountMinor(amountMinor),
    currency: getCurrency(currency),
    frequency: getFrequency(frequency),
    interval: getInterval(interval),
    startDate: validatedStart,
    endDate: validatedEnd,
  };
}

/* ------------------------------- update rule ----------------------------- */

export interface UpdateRuleInput {
  title?: string;
  amountMinor?: number;
  payerId?: string;
  rawSplit?: unknown;
  frequency?: RecurringFrequency;
  interval?: number;
  startDate?: string;
  /** undefined = no change; null = clear the end date. */
  endDate?: string | null;
}

export function validateUpdateRule(body: unknown, isGroupRule: boolean): UpdateRuleInput {
  const record = (body ?? {}) as Record<string, unknown>;

  if (record.group !== undefined && record.group !== null) {
    throw new ApiError(400, "A recurring rule cannot be moved");
  }
  if (record.currency !== undefined && record.currency !== null) {
    getCurrency(record.currency);
  }
  if (!isGroupRule && record.payerId !== undefined && record.payerId !== null) {
    throw new ApiError(400, "Personal recurring rules cannot specify a payer");
  }
  if (!isGroupRule && record.split !== undefined && record.split !== null) {
    throw new ApiError(400, "Personal recurring rules cannot define custom splitting");
  }
  if (isGroupRule && record.split !== undefined && record.split !== null) {
    if (typeof record.split !== "object" || record.split === null || Array.isArray(record.split)) {
      throw new ApiError(400, "A valid split configuration is required");
    }
  }

  const hasTitle = record.title !== undefined && record.title !== null;
  const hasAmount = record.amountMinor !== undefined && record.amountMinor !== null;
  const hasPayer = record.payerId !== undefined && record.payerId !== null;
  const hasSplit = record.split !== undefined && record.split !== null;
  const hasFrequency = record.frequency !== undefined && record.frequency !== null;
  const hasInterval = record.interval !== undefined && record.interval !== null;
  const hasStart = record.startDate !== undefined && record.startDate !== null;
  const hasEnd = "endDate" in record;

  if (
    !hasTitle &&
    !hasAmount &&
    !hasPayer &&
    !hasSplit &&
    !hasFrequency &&
    !hasInterval &&
    !hasStart &&
    !hasEnd
  ) {
    throw new ApiError(400, "Provide at least one field to update");
  }

  return {
    title: hasTitle ? getTitle(record.title) : undefined,
    amountMinor: hasAmount ? getAmountMinor(record.amountMinor) : undefined,
    payerId: hasPayer ? getPayerId(record.payerId) : undefined,
    rawSplit: hasSplit ? record.split : undefined,
    frequency: hasFrequency ? getFrequency(record.frequency) : undefined,
    interval: hasInterval ? getInterval(record.interval) : undefined,
    startDate: hasStart ? getStartDate(record.startDate) : undefined,
    endDate: hasEnd ? getEndDate(record.endDate) : undefined,
  };
}
