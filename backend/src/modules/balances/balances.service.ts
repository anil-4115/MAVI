import { Types } from "mongoose";
import { ApiError } from "../../utils/ApiError.js";
import { User } from "../auth/auth.model.js";
import { Group, type GroupDocument } from "../groups/group.model.js";
import { Expense } from "../expenses/expense.model.js";
import { Settlement } from "../settlements/settlement.model.js";
import type {
  GroupBalanceMember,
  GroupBalances,
  PairwiseBalanceEntry,
  SuggestedSettlement,
  SettlementView,
} from "./balances.types.js";

/**
 * Minimal normalized expense consumed by the pure calculation engine.
 * The engine intentionally consumes `participantShares` already computed by
 * H.4/H.5 — it never recalulates splits. Completed settlements (H.7) are
 * folded in via `applySettlements` after the expense matrix is built.
 */
export interface BalanceExpense {
  id: string;
  payerId: string;
  amountMinor: number;
  voided?: boolean;
  participantShares: { userId: string; amountMinor: number }[];
}

export interface DebtMatrixResult {
  /**
   * Directed gross debts: grossDebt[fromUserId][toUserId] = total amount
   * `fromUserId` owes `toUserId` across all non-voided expenses.
   */
  grossDebt: Map<string, Map<string, number>>;
  paidMinor: Map<string, number>;
  owedMinor: Map<string, number>;
  totalExpenseMinor: number;
  /** Gross money owed toward other members (own shares excluded). */
  totalDebtMinor: number;
}

/**
 * Build the directed gross-debt matrix from expense history.
 * Self-debts (participant === payer) never create debt.
 * Personal expenses (group === null) are never part of a group dataset.
 */
export function computeDebtMatrix(expenses: BalanceExpense[]): DebtMatrixResult {
  const grossDebt = new Map<string, Map<string, number>>();
  const paidMinor = new Map<string, number>();
  const owedMinor = new Map<string, number>();
  let totalExpenseMinor = 0;
  let totalDebtMinor = 0;

  const bump = (map: Map<string, number>, key: string, amount: number): void => {
    map.set(key, (map.get(key) ?? 0) + amount);
  };

  for (const expense of expenses) {
    if (expense.voided === true) continue;
    if (!Number.isInteger(expense.amountMinor) || expense.amountMinor <= 0) continue;

    const shareTotal = expense.participantShares.reduce((acc, s) => acc + s.amountMinor, 0);
    if (shareTotal <= 0) continue;

    totalExpenseMinor += expense.amountMinor;
    bump(paidMinor, expense.payerId, expense.amountMinor);

    for (const share of expense.participantShares) {
      if (!Number.isInteger(share.amountMinor)) continue;
      bump(owedMinor, share.userId, share.amountMinor);
      if (share.userId === expense.payerId) continue;

      let inner = grossDebt.get(share.userId);
      if (!inner) {
        inner = new Map<string, number>();
        grossDebt.set(share.userId, inner);
      }
      inner.set(expense.payerId, (inner.get(expense.payerId) ?? 0) + share.amountMinor);
      totalDebtMinor += share.amountMinor;
    }
  }

  return { grossDebt, paidMinor, owedMinor, totalExpenseMinor, totalDebtMinor };
}

/**
 * Per-user net position derived purely from the debt matrix.
 * netMinor = paidMinor - owedMinor; sum over all users is always 0.
 *
 * Positions are derived from the directed gross-debt edges (NOT from the
 * paid/owed maps) so that settlement adjustments to the matrix are reflected.
 * For an expense-only matrix the result is exactly `paid - owed` (the maps and
 * the edges carry equivalent information); once completed settlements subtract
 * amounts from payer->receiver edges, positions follow the settlement-adjusted
 * pair relationships and always reconcile with `netPairwise`.
 */
export function positionsFromDebtMatrix(matrix: DebtMatrixResult): Map<string, number> {
  const positions = new Map<string, number>();
  for (const id of matrix.paidMinor.keys()) positions.set(id, 0);
  for (const id of matrix.owedMinor.keys()) positions.set(id, 0);
  for (const [from, edges] of matrix.grossDebt) {
    for (const [to, amount] of edges) {
      if (from === to) continue;
      positions.set(from, (positions.get(from) ?? 0) - amount);
      positions.set(to, (positions.get(to) ?? 0) + amount);
    }
  }
  return positions;
}

/**
 * Apply authoritative completed settlements to the debt matrix. A settlement
 * `payerId -> receiverId` of `amountMinor` reduces the directed debt the payer
 * owes the receiver. Over-settlement is allowed: the edge becomes negative,
 * which flips the pair relationship so the receiver owes the payer the excess.
 * Cancelled settlements are never passed in here — they must have NO effect.
 */
export function applySettlements(
  matrix: DebtMatrixResult,
  settlements: ReadonlyArray<{ payerId: string; receiverId: string; amountMinor: number }>,
): void {
  for (const settlement of settlements) {
    if (!Number.isInteger(settlement.amountMinor) || settlement.amountMinor <= 0) continue;
    if (settlement.payerId === settlement.receiverId) continue;

    let inner = matrix.grossDebt.get(settlement.payerId);
    if (!inner) {
      inner = new Map<string, number>();
      matrix.grossDebt.set(settlement.payerId, inner);
    }
    inner.set(settlement.receiverId, (inner.get(settlement.receiverId) ?? 0) - settlement.amountMinor);
  }
}

/**
 * Pair-netted obligations for every unordered pair.
 * One entry per pair with non-zero net; `netMinor` positive means
 * `userIdA` owes `userIdB`, negative means `userIdB` owes `userIdA`.
 */
export function netPairwise(matrix: DebtMatrixResult): PairwiseBalanceEntry[] {
  const ids = new Set<string>();
  for (const [from, inner] of matrix.grossDebt) {
    ids.add(from);
    for (const to of inner.keys()) ids.add(to);
  }
  // Only pairs that actually appear in the debt graph; deterministic order.
  const sorted = [...ids].sort();
  const entries: PairwiseBalanceEntry[] = [];
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i];
      const b = sorted[j];
      const aToB = matrix.grossDebt.get(a)?.get(b) ?? 0;
      const bToA = matrix.grossDebt.get(b)?.get(a) ?? 0;
      const net = aToB - bToA;
      if (net !== 0) {
        entries.push({ userIdA: a, userIdB: b, netMinor: net });
      }
    }
  }
  return entries;
}

/**
 * Deterministic greedy netting: repeatedly match the largest debtor with the
 * largest creditor and transfer the minimum amount until everyone is settled.
 * Ties are broken by userId (string order). Sum of `amountMinor` over the
 * result equals the total outstanding amount.
 */
export function suggestSettlements(positions: ReadonlyMap<string, number>): SuggestedSettlement[] {
  const debtors: { id: string; amount: number }[] = [];
  const creditors: { id: string; amount: number }[] = [];
  for (const [id, net] of positions) {
    if (net < 0) debtors.push({ id, amount: -net });
    if (net > 0) creditors.push({ id, amount: net });
  }

  debtors.sort((x, y) => y.amount - x.amount || x.id.localeCompare(y.id));
  creditors.sort((x, y) => y.amount - x.amount || x.id.localeCompare(y.id));

  const settlements: SuggestedSettlement[] = [];
  let di = 0;
  let ci = 0;
  while (di < debtors.length && ci < creditors.length) {
    const debtor = debtors[di];
    const creditor = creditors[ci];
    const transfer = Math.min(debtor.amount, creditor.amount);
    settlements.push({ fromUserId: debtor.id, toUserId: creditor.id, amountMinor: transfer });
    debtor.amount -= transfer;
    creditor.amount -= transfer;
    if (debtor.amount === 0) di++;
    if (creditor.amount === 0) ci++;
  }
  return settlements;
}

/* ------------------------------- read layer ------------------------------- */

const findGroupOrThrow = async (groupId: string): Promise<GroupDocument> => {
  const group = await Group.findById(groupId);
  if (!group) {
    throw new ApiError(404, "Group not found");
  }
  return group as unknown as GroupDocument;
};

const getMembership = (group: GroupDocument, userId: string) =>
  group.members.find((m) => m.userId.toString() === userId);

/**
 * Authoritative settlement projection consumed by the balance engine.
 * Only COMPLETED settlements are returned — cancelled records never affect
 * balances. Balances read settlement data (one-way); Settlements never
 * depends on Balances.
 */
export async function loadSettlementViews(groupId: string): Promise<SettlementView[]> {
  const settlements = await Settlement.find({
    group: new Types.ObjectId(groupId),
    status: "completed",
  })
    .sort({ date: -1, _id: -1 })
    .lean();

  return settlements.map((s) => ({
    groupId: s.group.toString(),
    payerId: s.payerId.toString(),
    receiverId: s.receiverId.toString(),
    amountMinor: s.amountMinor,
  }));
}

const toBalanceExpense = (expense: LeanExpense): BalanceExpense => ({
  id: expense._id.toString(),
  payerId: expense.payerId.toString(),
  amountMinor: expense.amountMinor,
  voided: expense.voided === true,
  participantShares: (expense.participantShares ?? []).map((s) => ({
    userId: s.userId.toString(),
    amountMinor: s.amountMinor,
  })),
});

/** Authoritative expense projection for balance derivation (never recalc splits). */
export interface LeanExpense {
  _id: Types.ObjectId;
  group: Types.ObjectId | null;
  createdBy: Types.ObjectId;
  title: string;
  amountMinor: number;
  currency: string;
  expenseDate: Date | string;
  payerId: Types.ObjectId;
  participantShares: { userId: Types.ObjectId | string; amountMinor: number }[];
  voided: boolean;
}

async function resolveUserNames(userIds: string[]): Promise<Map<string, string>> {
  const users = await User.find({ _id: { $in: userIds } }).select("name").lean();
  const map = new Map<string, string>();
  for (const user of users) {
    map.set(user._id.toString(), user.name);
  }
  return map;
}

/** Total money that must still move: sum of debtor |net| positions. */
export function outstandingFromPositions(positions: ReadonlyMap<string, number>): number {
  let total = 0;
  for (const net of positions.values()) {
    if (net < 0) total += -net;
  }
  return total;
}

export async function getGroupBalances(groupId: string, actorId: string): Promise<GroupBalances> {
  const group = await findGroupOrThrow(groupId);

  const actorMember = getMembership(group, actorId);
  if (!actorMember || actorMember.status !== "active") {
    throw new ApiError(403, "You are not an active member of this group");
  }

  const expenses = (await Expense.find({
    group: new Types.ObjectId(groupId),
    voided: { $ne: true },
  }).lean()) as unknown as LeanExpense[];

  const settlements = await loadSettlementViews(groupId);

  const matrix = computeDebtMatrix(expenses.map(toBalanceExpense));
  applySettlements(matrix, settlements);
  const positions = positionsFromDebtMatrix(matrix);

  // All current members (so zero-position active members appear) plus any
  // removed/declined users who still have historical positions.
  const involvedIds = [
    ...new Set<string>([...positions.keys(), ...group.members.map((m) => m.userId.toString())]),
  ];
  const userNames = await resolveUserNames(involvedIds);
  const memberStatus = new Map<string, string>();
  for (const m of group.members) {
    memberStatus.set(m.userId.toString(), m.status);
  }

  const members: GroupBalanceMember[] = involvedIds
    .sort()
    .map((userId) => {
      const paidMinor = matrix.paidMinor.get(userId) ?? 0;
      const owedMinor = matrix.owedMinor.get(userId) ?? 0;
      return {
        userId,
        name: userNames.get(userId) ?? "Unknown",
        active: memberStatus.get(userId) === "active",
        paidMinor,
        owedMinor,
        netMinor: positions.get(userId) ?? 0,
      };
    });

  const currentUser = members.find((m) => m.userId === actorId);
  if (!currentUser) {
    throw new ApiError(403, "You are not an active member of this group");
  }

  return {
    group: {
      id: group._id.toString(),
      name: group.name,
      currency: group.currency,
      archived: group.archived,
    },
    totalExpenseMinor: matrix.totalExpenseMinor,
    totalOutstandingMinor: outstandingFromPositions(positions),
    currentUser,
    members,
    pairwise: netPairwise(matrix),
    suggestedSettlements: suggestSettlements(positions),
    settlements,
  };
}