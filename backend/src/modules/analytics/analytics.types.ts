export const SPENDING_CATEGORIES = [
  "Food & Drinks",
  "Travel",
  "Shopping",
  "Bills",
  "Entertainment",
  "Others",
] as const;

export type SpendingCategory = (typeof SPENDING_CATEGORIES)[number];

export interface CategorySpend {
  category: SpendingCategory;
  amountMinor: number;
}

export interface MonthSpend {
  /** "YYYY-MM" (UTC) */
  month: string;
  totalMinor: number;
}

export interface TopSpender {
  userId: string;
  name: string;
  amountMinor: number;
  rank: number;
}

export interface SpendingAnalytics {
  /** Requested "YYYY-MM" (UTC) */
  month: string;
  currency: string;
  totalSpentMinor: number;
  categories: CategorySpend[];
  /** Last 6 months ending at the requested month, oldest first. */
  byMonth: MonthSpend[];
  topSpenders: TopSpender[];
}