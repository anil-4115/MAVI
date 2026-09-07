export const SPLIT_METHODS = ["equal", "quantity", "exact", "percentage", "shares", "itemwise"] as const;
export type SplitMethod = (typeof SPLIT_METHODS)[number];

/** Error raised for any malformed or business-invalid split input. HTTP-independent. */
export class SplitValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SplitValidationError";
  }
}

export interface EqualParticipantInput {
  userId: string;
}

export interface QuantityParticipantInput {
  userId: string;
  quantity: number;
}

export interface ExactParticipantInput {
  userId: string;
  amountMinor: number;
}

export interface PercentageParticipantInput {
  userId: string;
  /** Percentage in the range (0, 100], up to 2 decimal places. e.g. 33.33. */
  percentage: number;
}

export interface SharesParticipantInput {
  userId: string;
  shares: number;
}

export interface ItemwiseItemInput {
  title?: string;
  amountMinor: number;
  /** Users who split this item equally. Unique within the item. */
  participants: string[];
}

/**
 * Typed input to the splitting engine. Exactly one method-specific payload is
 * present, matching `method`. All amounts are integer minor units of `currency`.
 */
export interface SplitRequest {
  method: SplitMethod;
  totalMinor: number;
  currency?: string;
  equal?: EqualParticipantInput[] | undefined;
  quantity?: QuantityParticipantInput[] | undefined;
  exact?: ExactParticipantInput[] | undefined;
  percentage?: PercentageParticipantInput[] | undefined;
  shares?: SharesParticipantInput[] | undefined;
  itemwise?: ItemwiseItemInput[] | undefined;
}

/** Single output entry: how much one user owes toward the expense. */
export interface SplitShare {
  userId: string;
  amountMinor: number;
}

export const asBasisPoints = (percentage: number): number => Math.round(percentage * 100);