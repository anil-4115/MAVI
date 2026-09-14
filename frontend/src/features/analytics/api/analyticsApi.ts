import type { ApiEnvelope } from "../../../lib/types";
import api from "../../../services/api";

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
  month: string;
  currency: string;
  totalSpentMinor: number;
  categories: CategorySpend[];
  byMonth: MonthSpend[];
  topSpenders: TopSpender[];
}

type AnalyticsResponse = ApiEnvelope<SpendingAnalytics>;

/** Read-only monthly spending analytics (backend aggregates; frontend never computes money). */
export const getSpendingAnalytics = async (month?: string): Promise<SpendingAnalytics> => {
  const response = await api.get<AnalyticsResponse>("/analytics/spending", {
    params: month ? { month } : undefined,
  });
  return response.data.data;
};

export const CATEGORY_COLORS: Record<SpendingCategory, string> = {
  "Food & Drinks": "#7c3aed",
  Travel: "#0ea5e9",
  Shopping: "#ec4899",
  Bills: "#f59e0b",
  Entertainment: "#10b981",
  Others: "#94a3b8",
};

export const MONTH_LABELS: string[] = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function monthLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  const label = MONTH_LABELS[(month ?? 1) - 1] ?? String(month);
  return `${label} ${year}`;
}

export function shortMonthLabel(monthKey: string): string {
  const [, month] = monthKey.split("-").map(Number);
  return (MONTH_LABELS[(month ?? 1) - 1] ?? String(month)).slice(0, 3);
}

export function currentMonthKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function shiftMonth(monthKey: string, offset: number): string {
  const [year, month] = monthKey.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, (month ?? 1) - 1 + offset, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}