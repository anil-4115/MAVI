import type { ApiEnvelope } from "../../../lib/types";
import api from "../../../services/api";

/**
 * Types mirror the backend DashboardData contract exactly
 * (backend/src/modules/balances/balances.types.ts). All *Minor fields are
 * integer minor units (paise). The backend remains authoritative for every
 * value; the frontend only displays them.
 */

export interface DashboardData {
  personalSpendingMinor: number;
  groupSumPaidMinor: number;
  groupSumOwedMinor: number;
  groupSumToReceiveMinor: number;
  groupSumToPayMinor: number;
  overallNetMinor: number;
  groupCount: number;
  groups: DashboardGroupOverview[];
  recentGroupExpenses: RecentGroupExpenseSummary[];
  recentPersonalExpenses: RecentPersonalExpenseSummary[];
  recentSettlements: SettlementView[];
}

export interface DashboardGroupOverview {
  id: string;
  name: string;
  memberCount: number;
  myRole: string | null;
  netMinor: number;
  outstandingMinor: number;
}

export interface RecentGroupExpenseSummary {
  id: string;
  groupId: string;
  groupName: string;
  title: string;
  amountMinor: number;
  currency: string;
  expenseDate: string;
  payerId: string;
}

export interface RecentPersonalExpenseSummary {
  id: string;
  title: string;
  amountMinor: number;
  currency: string;
  expenseDate: string;
}

/** A settlement projection: ids only, no embedded names (backend contract). */
export interface SettlementView {
  groupId: string;
  payerId: string;
  receiverId: string;
  amountMinor: number;
}

type DashboardResponse = ApiEnvelope<DashboardData>;

export const getDashboard = async (): Promise<DashboardData> => {
  const response = await api.get<DashboardResponse>("/dashboard");
  return response.data.data;
};