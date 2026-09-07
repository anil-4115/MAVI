import { Types } from "mongoose";
import { ApiError } from "../../utils/ApiError.js";
import { DEFAULT_CURRENCY } from "../common/money.js";
import { SETTLEMENT_STATUSES, type CreateSettlementInput, type SettlementStatus } from "./settlement.types.js";

const getUserId = (value: unknown, label: string): string => {
  if (typeof value !== "string" || !Types.ObjectId.isValid(value)) {
    throw new ApiError(400, `A valid ${label}Id is required`);
  }
  return value;
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

const getDate = (value: unknown): Date => {
  if (value === undefined || value === null) return new Date();
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    throw new ApiError(400, "date must be a valid date");
  }
  return date;
};

const getNote = (value: unknown): string | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    throw new ApiError(400, "note must be a string");
  }
  const note = value.trim();
  if (note.length > 300) {
    throw new ApiError(400, "note must be at most 300 characters");
  }
  return note === "" ? undefined : note;
};

export function validateCreateSettlement(body: unknown): CreateSettlementInput {
  const { payerId, receiverId, amountMinor, currency, date, note } = (body ?? {}) as Record<string, unknown>;

  const payer = getUserId(payerId, "payer");
  const receiver = getUserId(receiverId, "receiver");
  if (payer === receiver) {
    throw new ApiError(400, "The payer must be different from the receiver");
  }

  return {
    payerId: payer,
    receiverId: receiver,
    amountMinor: getAmountMinor(amountMinor),
    currency: getCurrency(currency),
    date: getDate(date),
    note: getNote(note),
  };
}

/**
 * Re-validate an already-parsed CreateSettlementInput before any write.
 * The service layer calls this so invalid financial input is rejected even by
 * non-HTTP callers (defense in depth for the integer-minor-unit money rules).
 */
export function assertValidSettlementInput(input: CreateSettlementInput): void {
  getUserId(input.payerId, "payer");
  getUserId(input.receiverId, "receiver");
  if (input.payerId === input.receiverId) {
    throw new ApiError(400, "The payer must be different from the receiver");
  }
  getAmountMinor(input.amountMinor);
  getCurrency(input.currency);
  getDate(input.date);
  getNote(input.note);
}

/**
 * Optional list filter. `?status=completed|cancelled` on the list endpoint.
 */
export function parseSettlementStatusFilter(value: unknown): SettlementStatus | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !SETTLEMENT_STATUSES.includes(value as SettlementStatus)) {
    throw new ApiError(400, "status must be 'completed' or 'cancelled'");
  }
  return value as SettlementStatus;
}