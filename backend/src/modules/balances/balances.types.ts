/**
 * Balances are always DERIVED from authoritative expense (and, in H.7,
 * settlement) records. Nothing in this module persists balance documents.
 */

/** Net position of a single user inside a group. */
export interface GroupBalanceMember {
  userId: string;
  name: string;
  /** Whether the user is currently an active group member. */
  active: boolean;
  /** Total this user paid toward group expenses. */
  paidMinor: number;
  /** Total this user owes toward group expenses (sum of their shares). */
  owedMinor: number;
  /** paidMinor - owedMinor. Positive => should receive; negative => owes others. */
  netMinor: number;
}

/**
 * Signed net obligation between two members for one unordered pair.
 * `userIdA` is always lexicographically smaller than `userIdB`.
 * `netMinor` positive => `userIdA` owes `userIdB`; negative => `userIdB`
 * owes `userIdA`. Reciprocal debts are netted, so an entry can never appear
 * twice for the same pair.
 */
export interface PairwiseBalanceEntry {
  userIdA: string;
  userIdB: string;
  netMinor: number;
}

/**
 * Directional suggested transfer produced by the greedy netting algorithm.
 * `fromUserId` pays `toUserId`. Recommendations only — no records are
 * created and nothing is persisted.
 */
export interface SuggestedSettlement {
  fromUserId: string;
  toUserId: string;
  amountMinor: number;
}

/**
 * H.7 Settlement projection consumed by the balance engine. Only completed
 * settlements are supplied; cancelled records have no effect on balances.
 */
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

export interface DashboardGroupOverview {
  id: string;
  name: string;
  memberCount: number;
  myRole: string | null;
  netMinor: number;
  outstandingMinor: number;
}

export interface DashboardData {
  /** Sum of the user's non-voided personal expenses (spending, not debt). */
  personalSpendingMinor: number;
  /** Sum of what the user paid in their active groups. */
  groupSumPaidMinor: number;
  /** Sum of what the user owes in their active groups (all shares). */
  groupSumOwedMinor: number;
  /** Sum of positive group net positions (amount the user expects to receive). */
  groupSumToReceiveMinor: number;
  /** Sum of |negative| group net positions (amount the user expects to pay). */
  groupSumToPayMinor: number;
  /** groupSumToReceiveMinor - groupSumToPayMinor. */
  overallNetMinor: number;
  groupCount: number;
  groups: DashboardGroupOverview[];
  recentGroupExpenses: RecentGroupExpenseSummary[];
  recentPersonalExpenses: RecentPersonalExpenseSummary[];
  /** Recent completed settlements across the user's active groups. */
  recentSettlements: SettlementView[];
}