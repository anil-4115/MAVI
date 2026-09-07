import {
  DEFAULT_CURRENCY as SUPPORTED_CURRENCY,
} from "../common/money.js";
import {
  SPLIT_METHODS,
  type EqualParticipantInput,
  type ExactParticipantInput,
  type ItemwiseItemInput,
  type PercentageParticipantInput,
  type QuantityParticipantInput,
  type SharesParticipantInput,
  type SplitMethod,
  type SplitRequest,
  SplitValidationError,
} from "./splitting.types.js";

const fail = (message: string): never => {
  throw new SplitValidationError(message);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const expectInteger = (value: unknown, field: string, min: number): number => {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value) || value < min) {
    fail(`${field} must be an integer greater than or equal to ${min}`);
  }
  return value as number;
};

const expectUserId = (value: unknown): string => {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 100) {
    fail("Each participant must have a valid userId");
  }
  return value as string;
};

const assertUniqueUserIds = (userIds: string[]): void => {
  const seen = new Set<string>();
  for (const id of userIds) {
    if (seen.has(id)) {
      fail("Duplicate participant userIds are not allowed");
    }
    seen.add(id);
  }
};

const getParticipantsArray = (raw: Record<string, unknown>, key: string): Record<string, unknown>[] => {
  const list = raw[key];
  if (!Array.isArray(list) || list.length === 0) {
    fail(`"${key}" must be a non-empty array of participants`);
  }
  return list as Record<string, unknown>[];
};

const getItemsArray = (raw: Record<string, unknown>): Record<string, unknown>[] => {
  const list = raw.itemwise;
  if (!Array.isArray(list) || list.length === 0) {
    fail(`"itemwise" must be a non-empty array of items`);
  }
  return list as Record<string, unknown>[];
};

const parseEqual = (raw: Record<string, unknown>): EqualParticipantInput[] => {
  const participants = getParticipantsArray(raw, "equal");
  const result = participants.map((entry) => ({
    userId: expectUserId(entry.userId),
  }));
  assertUniqueUserIds(result.map((r) => r.userId));
  return result;
};

const parseQuantity = (raw: Record<string, unknown>): QuantityParticipantInput[] => {
  const participants = getParticipantsArray(raw, "quantity");
  const result: QuantityParticipantInput[] = [];
  let positive = 0;

  for (const entry of participants) {
    const quantity = expectInteger(entry.quantity, "quantity", 0);
    if (quantity > 0) positive++;
    result.push({ userId: expectUserId(entry.userId), quantity });
  }

  if (positive === 0) {
    fail("At least one quantity must be greater than 0");
  }

  assertUniqueUserIds(result.map((r) => r.userId));
  return result;
};

const parseExact = (raw: Record<string, unknown>, totalMinor: number): ExactParticipantInput[] => {
  const participants = getParticipantsArray(raw, "exact");
  const result: ExactParticipantInput[] = [];
  let sum = 0;

  for (const entry of participants) {
    const amountMinor = expectInteger(entry.amountMinor, "amountMinor", 0);
    sum += amountMinor;
    result.push({ userId: expectUserId(entry.userId), amountMinor });
  }

  if (sum !== totalMinor) {
    fail("The exact amounts must total exactly the expense amount");
  }

  assertUniqueUserIds(result.map((r) => r.userId));
  return result;
};

const parsePercentage = (raw: Record<string, unknown>): PercentageParticipantInput[] => {
  const participants = getParticipantsArray(raw, "percentage");
  const result: PercentageParticipantInput[] = [];
  let sumBasisPoints = 0;

  for (const entry of participants) {
    const percentage = entry.percentage;

    if (typeof percentage !== "number" || !Number.isFinite(percentage)) {
      throw new SplitValidationError("Percentage must be a number");
    }
    if (percentage <= 0 || percentage > 100) {
      throw new SplitValidationError("Percentage must be greater than 0 and at most 100");
    }
    const basisPoints = Math.round(percentage * 100);
    if (Math.abs(basisPoints - percentage * 100) > 1e-9) {
      fail("Percentage must have at most 2 decimal places");
    }

    sumBasisPoints += basisPoints;
    result.push({ userId: expectUserId(entry.userId), percentage });
  }

  if (sumBasisPoints !== 10000) {
    fail("Percentages must total exactly 100");
  }

  assertUniqueUserIds(result.map((r) => r.userId));
  return result;
};

const parseShares = (raw: Record<string, unknown>): SharesParticipantInput[] => {
  const participants = getParticipantsArray(raw, "shares");
  const result = participants.map((entry) => ({
    userId: expectUserId(entry.userId),
    shares: expectInteger(entry.shares, "shares", 1),
  }));
  assertUniqueUserIds(result.map((r) => r.userId));
  return result;
};

const parseItemwise = (raw: Record<string, unknown>, totalMinor: number): ItemwiseItemInput[] => {
  const items = getItemsArray(raw);
  const result: ItemwiseItemInput[] = [];
  let sum = 0;

  for (const item of items) {
    const participants = item.participants;
    if (!Array.isArray(participants) || participants.length === 0) {
      fail("Each item must have at least one participant");
    }
    const userIds = (participants as unknown[]).map(expectUserId);
    assertUniqueUserIds(userIds);

    const amountMinor = expectInteger(item.amountMinor, "item amountMinor", 1);
    sum += amountMinor;

    result.push({
      title: typeof item.title === "string" && item.title.trim() !== "" ? item.title.trim() : undefined,
      amountMinor,
      participants: userIds,
    });
  }

  if (sum !== totalMinor) {
    fail("The item amounts must total exactly the expense amount");
  }

  return result;
};

/**
 * Validate and type any untrusted split payload. Throws SplitValidationError on
 * malformed input or broken math invariants (amounts not summing to total, etc.).
 */
export function validateSplitInput(raw: unknown): SplitRequest {
  if (!isRecord(raw)) {
    throw new SplitValidationError("Split input must be an object");
  }
  const record = raw as Record<string, unknown>;

  const { method, totalMinor, currency } = record;

  if (typeof method !== "string" || !SPLIT_METHODS.includes(method as SplitMethod)) {
    fail("Unknown split method");
  }
  const splitMethod = method as SplitMethod;

  const validatedTotal = expectInteger(totalMinor, "totalMinor", 1);

  if (currency !== undefined && currency !== null && String(currency).trim() !== SUPPORTED_CURRENCY) {
    fail(`Only ${SUPPORTED_CURRENCY} is supported at this time`);
  }

  const byMethod: Record<string, () => unknown> = {
    equal: () => parseEqual(record),
    quantity: () => parseQuantity(record),
    exact: () => parseExact(record, validatedTotal),
    percentage: () => parsePercentage(record),
    shares: () => parseShares(record),
    itemwise: () => parseItemwise(record, validatedTotal),
  };

  const payload = byMethod[splitMethod]();

  const request: SplitRequest = {
    method: splitMethod,
    totalMinor: validatedTotal,
    currency: currency === undefined || currency === null ? undefined : String(currency).trim(),
  };
  (request as unknown as Record<string, unknown>)[splitMethod] = payload;

  return request;
}