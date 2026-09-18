import type { SpendingCategory } from "../analytics/analytics.types.js";

/**
 * Reports are always DERIVED at request time from authoritative expense and
 * settlement records — nothing is persisted, no Report collection exists.
 * Every *Minor value is an integer in minor units (paise); all aggregation
 * happens server-side so the frontend never computes money.
 */
export const REPORT_SCOPES = ["all", "group", "personal"] as const;
export type ReportScope = (typeof REPORT_SCOPES)[number];

/** "YYYY-MM-DD" (UTC) bounds echoed back from the validated request. */
export interface ReportRange {
  from: string;
  to: string;
}

/**
 * An authorized report line item. Personal transactions are only ever the
 * actor's own; group transactions come only from groups the actor is an
 * active member of. `type` mirrors `Expense.group` (null ⇔ personal).
 */
export interface ReportTransaction {
  id: string;
  /** ISO date of the expense. */
  date: string;
  description: string;
  category: SpendingCategory;
  type: "group" | "personal";
  groupId: string | null;
  groupName: string | null;
  payerId: string;
  payerName: string;
  amountMinor: number;
  currency: string;
  splitMethod: string;
}

export interface ReportCategoryRow {
  category: SpendingCategory;
  amountMinor: number;
  expenseCount: number;
}

/**
 * Per-group row. `spentMinor` is the sum of the FULL expense amounts in the
 * range; `my*` figures are the actor's own (payer totals, share totals, and
 * the settlement-adjusted net position derived from the same debt-matrix
 * engine the balances module uses, scoped to the selected range).
 */
export interface ReportGroupRow {
  groupId: string;
  groupName: string;
  archived: boolean;
  expenseCount: number;
  spentMinor: number;
  myPaidMinor: number;
  myOwedMinor: number;
  myNetMinor: number;
  settlementCount: number;
  settlementTotalMinor: number;
}

export interface ReportSummary {
  range: ReportRange;
  scope: ReportScope;
  /** Present only when a single group was selected. */
  groupId: string | null;
  groupName: string | null;
  currency: string;
  expenseCount: number;
  groupExpenseCount: number;
  personalExpenseCount: number;
  /** Sum of non-voided expense amounts in scope. */
  totalSpentMinor: number;
  groupSpentMinor: number;
  personalSpentMinor: number;
  /** Actor totals across the selected groups (0 when scope is personal-only). */
  paidMinor: number;
  owedMinor: number;
  /** Settlement-adjusted actor net across the selected groups (0 when personal-only). */
  netMinor: number;
  /** Completed settlements within the range (group scopes only). */
  settlementCount: number;
  settlementTotalMinor: number;
  /** Non-empty categories in the canonical analytics order. */
  categories: ReportCategoryRow[];
  /** One row per selected group (group scopes only; empty otherwise). */
  groups: ReportGroupRow[];
  /** Authorized line items, newest first — used by CSV/PDF export. */
  transactions: ReportTransaction[];
}