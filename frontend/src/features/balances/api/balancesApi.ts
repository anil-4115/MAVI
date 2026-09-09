import type { ApiEnvelope } from "../../../lib/types";
import api from "../../../services/api";

/**
 * Group balances contract (backend/src/modules/balances/balances.types.ts).
 * Balances are always DERIVED server-side from expense + completed-settlement
 * records; nothing here computes or stores money. The frontend only formats the
 * returned integer minor units for display.
 */

export interface GroupBalanceMember {
  userId: string;
  name: string;
  /** Whether the user is currently an active group member. */
  active: boolean;
  /** Total this user paid toward group expenses. */
  paidMinor: number;
  /** Total this user owes toward group expenses (sum of their shares). */
  owedMinor: number;
  /** paidMinor - owedMinor (settlement-adjusted). Positive => receives; negative => owes. */
  netMinor: number;
}

/**
 * Signed net obligation between two members for one unordered pair.
 * netMinor positive => userIdA owes userIdB; negative => userIdB owes userIdA.
 */
export interface PairwiseBalanceEntry {
  userIdA: string;
  userIdB: string;
  netMinor: number;
}

/** Directional suggested transfer: fromUserId pays toUserId. Recommendations only. */
export interface SuggestedSettlement {
  fromUserId: string;
  toUserId: string;
  amountMinor: number;
}

/** Completed settlements projected for balance derivation (newest first). */
export interface SettlementView {
  groupId: string;
  payerId: string;
  receiverId: string;
  amountMinor: number;
}

export interface GroupBalances {
  group: {
    id: string;
    name: string;
    currency: string;
    archived: boolean;
  };
  /** Sum of non-voided expense totals in the group. */
  totalExpenseMinor: number;
  /** Money that must still move to settle everyone = sum of |negative net|. */
  totalOutstandingMinor: number;
  /** Balance of the requesting (active) member. */
  currentUser: GroupBalanceMember;
  /** All involved users (active + removed with history), sorted by userId. */
  members: GroupBalanceMember[];
  /** Pair-netted obligations, one entry per unordered pair with non-zero net. */
  pairwise: PairwiseBalanceEntry[];
  /** Greedy, deterministic settlement recommendations. */
  suggestedSettlements: SuggestedSettlement[];
  /** Completed settlements in the group (newest first). */
  settlements: SettlementView[];
}

type BalancesResponse = ApiEnvelope<GroupBalances>;

/** Active member only on the backend (403 otherwise); archived groups remain viewable. */
export const getGroupBalances = async (groupId: string): Promise<GroupBalances> => {
  const response = await api.get<BalancesResponse>(`/groups/${groupId}/balances`);
  return response.data.data;
};