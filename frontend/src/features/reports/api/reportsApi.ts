import type { ApiEnvelope } from "../../../lib/types";
import api from "../../../services/api";

export interface ReportRange {
  from: string;
  to: string;
}

export type ReportScope = "all" | "group" | "personal";

export interface ReportTransaction {
  id: string;
  date: string;
  description: string;
  category: string;
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
  category: string;
  amountMinor: number;
  expenseCount: number;
}

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
  groupId: string | null;
  groupName: string | null;
  currency: string;
  expenseCount: number;
  groupExpenseCount: number;
  personalExpenseCount: number;
  totalSpentMinor: number;
  groupSpentMinor: number;
  personalSpentMinor: number;
  paidMinor: number;
  owedMinor: number;
  netMinor: number;
  settlementCount: number;
  settlementTotalMinor: number;
  categories: ReportCategoryRow[];
  groups: ReportGroupRow[];
  transactions: ReportTransaction[];
}

export interface ReportQuery {
  scope: ReportScope;
  groupId?: string;
  from?: string;
  to?: string;
}

class ReportsApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ReportsApiError";
    this.status = status;
  }
}

/**
 * The backend aggregates every number; the frontend only renders/serializes
 * the integers it returns. The report transaction list is the single
 * authorized source for CSV/PDF export lines.
 */
export const getReportSummary = async (query: ReportQuery): Promise<ReportSummary> => {
  try {
    const response = await api.get<ApiEnvelope<ReportSummary>>("/reports/summary", {
      params: {
        scope: query.scope,
        groupId: query.groupId || undefined,
        from: query.from,
        to: query.to,
      },
    });
    return response.data.data;
  } catch (error) {
    if (typeof error === "object" && error !== null && "response" in error) {
      const response = (error as { response?: { status?: number; data?: { message?: string } } }).response;
      throw new ReportsApiError(
        response?.data?.message ?? "Failed to load report",
        response?.status ?? 500,
      );
    }
    throw error;
  }
};