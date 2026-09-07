import type { ApiEnvelope } from "../../../lib/types";
import api from "../../../services/api";

/**
 * Group balances contract (backend/src/modules/balances/balances.types.ts).
 * F.1 only consumes a subset for the group overview; the full balances UI
 * arrives in F.5.
 */

export interface GroupBalanceMember {
  userId: string;
  name: string;
  active: boolean;
  paidMinor: number;
  owedMinor: number;
  netMinor: number;
}

export interface GroupBalances {
  group: {
    id: string;
    name: string;
    currency: string;
    archived: boolean;
  };
  totalExpenseMinor: number;
  totalOutstandingMinor: number;
  currentUser: GroupBalanceMember;
  members: GroupBalanceMember[];
}

type BalancesResponse = ApiEnvelope<GroupBalances>;

export const getGroupBalances = async (groupId: string): Promise<GroupBalances> => {
  const response = await api.get<BalancesResponse>(`/groups/${groupId}/balances`);
  return response.data.data;
};