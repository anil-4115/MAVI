import type { Types } from "mongoose";
import type { SplitMethod, SplitRequest } from "../splitting/splitting.types.js";

/** Supported recurrence cadences. MVP uses a fixed interval of 1. */
export const RECURRING_FREQUENCIES = ["daily", "weekly", "monthly", "yearly"] as const;
export type RecurringFrequency = (typeof RECURRING_FREQUENCIES)[number];

/** Stored recurring-rule definition. Never contains derived balance data. */
export interface IRecurringRule {
  /** Null for a personal rule; a Group ObjectId for a group rule. */
  group: Types.ObjectId | null;
  /** The user who created the rule (creator). Authorization is creator-or-owner. */
  owner: Types.ObjectId;
  title: string;
  amountMinor: number;
  currency: string;
  /** Payer of every generated expense. Personal rules always pay from the owner. */
  payerId: Types.ObjectId;
  splitMethod: SplitMethod;
  /** Fully validated SplitRequest with `totalMinor === amountMinor`. */
  splitInput: SplitRequest;
  frequency: RecurringFrequency;
  /** MVP supports only 1. Stored explicitly so the model stays future-proof. */
  interval: number;
  /** First eligible occurrence day key (`YYYY-MM-DD`, UTC). */
  startDayKey: string;
  /** Next occurrence to generate (UTC day key). Advances as occurrences are handled. */
  nextOccurrence: string;
  /** Optional last eligible occurrence day key (inclusive). */
  endDayKey: string | null;
  active: boolean;
  /** Last occurrence day key that was successfully generated (audit/debug only). */
  lastGeneratedOccurrence: string | null;
}

export type RecurringRuleDocument = IRecurringRule & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  save: () => Promise<unknown>;
};

/** Safe, serialized recurring rule. Never includes sensitive fields. */
export interface PublicRecurringRule {
  id: string;
  group: string | null;
  owner: string;
  title: string;
  amountMinor: number;
  currency: string;
  payerId: string;
  splitMethod: SplitMethod;
  splitInput: SplitRequest;
  frequency: RecurringFrequency;
  interval: number;
  startDate: string;
  nextOccurrence: string;
  endDate: string | null;
  active: boolean;
  lastGeneratedOccurrence: string | null;
  createdAt: string;
  updatedAt: string;
  /** True when the viewer (creator or group owner) may mutate this rule. */
  canManage: boolean;
}

/**
 * Idempotency ledger: one record per (rule, occurrence). The unique index makes
 * concurrent or repeated generation attempts for the same occurrence a no-op.
 */
export interface IRecurringGeneration {
  rule: Types.ObjectId;
  /** Occurrence day key (`YYYY-MM-DD`, UTC). */
  occurrenceKey: string;
  /** The generated expense, or null while creation is in flight / after a reset. */
  expense: Types.ObjectId | null;
  generatedAt: Date;
}
