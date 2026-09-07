import { allocateTotal } from "../common/money.js";
import type {
  ItemwiseItemInput,
  SplitRequest,
  SplitShare,
} from "./splitting.types.js";
import { SplitValidationError } from "./splitting.types.js";

/**
 * Pure expense-splitting engine. No DB, no HTTP, no currency/format concerns.
 *
 * Every valid calculation upholds the core invariant:
 *     SUM(all participant shares) === totalMinor
 * rounded via deterministic largest-remainder allocation.
 */

const ones = (n: number): number[] => Array(n).fill(1);

const computeEqual = (input: SplitRequest): SplitShare[] => {
  const participants = input.equal ?? [];
  const amounts = allocateTotal(input.totalMinor, ones(participants.length));
  return participants.map((p, i) => ({ userId: p.userId, amountMinor: amounts[i] }));
};

const computeQuantity = (input: SplitRequest): SplitShare[] => {
  const participants = input.quantity ?? [];
  const weights = participants.map((p) => p.quantity);
  const amounts = allocateTotal(input.totalMinor, weights);
  return participants.map((p, i) => ({ userId: p.userId, amountMinor: amounts[i] }));
};

const computeExact = (input: SplitRequest): SplitShare[] => {
  return (input.exact ?? []).map((p) => ({ userId: p.userId, amountMinor: p.amountMinor }));
};

const computePercentage = (input: SplitRequest): SplitShare[] => {
  const participants = input.percentage ?? [];
  const basisPoints = participants.map((p) => Math.round(p.percentage * 100));
  const amounts = allocateTotal(input.totalMinor, basisPoints);
  return participants.map((p, i) => ({ userId: p.userId, amountMinor: amounts[i] }));
};

const computeShares = (input: SplitRequest): SplitShare[] => {
  const participants = input.shares ?? [];
  const weights = participants.map((p) => p.shares);
  const amounts = allocateTotal(input.totalMinor, weights);
  return participants.map((p, i) => ({ userId: p.userId, amountMinor: amounts[i] }));
};

const computeItemwise = (input: SplitRequest): SplitShare[] => {
  const items: ItemwiseItemInput[] = input.itemwise ?? [];

  const order: string[] = [];
  const totals = new Map<string, number>();

  for (const item of items) {
    const shares = allocateTotal(item.amountMinor, ones(item.participants.length));
    for (let i = 0; i < item.participants.length; i++) {
      const userId = item.participants[i];
      if (!order.includes(userId)) order.push(userId);
      totals.set(userId, (totals.get(userId) ?? 0) + shares[i]);
    }
  }

  return order.map((userId) => ({ userId, amountMinor: totals.get(userId) ?? 0 }));
};

const CALCULATORS = {
  equal: computeEqual,
  quantity: computeQuantity,
  exact: computeExact,
  percentage: computePercentage,
  shares: computeShares,
  itemwise: computeItemwise,
} as const;

/**
 * Compute participant shares for a validated split request. Input must already be
 * validated (e.g. via validateSplitInput); the engine re-asserts the summing
 * invariant and throws SplitValidationError if it can never hold.
 */
export function calculateShares(input: SplitRequest): SplitShare[] {
  const calculator = CALCULATORS[input.method];
  if (!calculator) {
    throw new SplitValidationError("Unknown split method");
  }

  const shares = calculator(input);

  const sum = shares.reduce((acc, share) => acc + share.amountMinor, 0);
  if (sum !== input.totalMinor) {
    throw new SplitValidationError("Calculated shares do not total the expense amount");
  }

  return shares;
}