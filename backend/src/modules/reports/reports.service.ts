import { Types } from "mongoose";
import { ApiError } from "../../utils/ApiError.js";
import { User } from "../auth/auth.model.js";
import { Group, type GroupDocument } from "../groups/group.model.js";
import { Expense } from "../expenses/expense.model.js";
import { Settlement } from "../settlements/settlement.model.js";
import { DEFAULT_CURRENCY } from "../common/money.js";
import { classifySpendingCategory, orderedCategories } from "../analytics/analytics.service.js";
import {
  applySettlements,
  computeDebtMatrix,
  positionsFromDebtMatrix,
  type BalanceExpense,
  type LeanExpense,
} from "../balances/balances.service.js";
import type {
  ReportCategoryRow,
  ReportGroupRow,
  ReportRange,
  ReportScope,
  ReportSummary,
  ReportTransaction,
} from "./reports.types.js";

const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Parse "YYYY-MM-DD" into a UTC midnight Date, or null when malformed/unreal. */
function parseDayKey(key: string): Date | null {
  if (!DAY_KEY_PATTERN.test(key)) return null;
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

function toDayKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Default range = the current UTC calendar month, oldest day first. */
function defaultRange(): ReportRange {
  const now = new Date();
  const from = toDayKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));
  const to = toDayKey(now);
  return { from, to };
}

/** Inclusive UTC bounds converted from day keys: [start, startOfNextDay). */
function rangeBounds(range: ReportRange): { start: Date; end: Date } {
  const start = parseDayKey(range.from);
  const endDate = parseDayKey(range.to);
  if (!start || !endDate) {
    throw new ApiError(400, "from and to must use the YYYY-MM-DD format");
  }
  if (start.getTime() > endDate.getTime()) {
    throw new ApiError(400, "from cannot be after to");
  }
  const end = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate() + 1));
  return { start, end };
}

const isActiveMember = (group: GroupDocument, userId: string): boolean =>
  group.members.some((m) => m.userId.toString() === userId && m.status === "active");

/**
 * Resolve the group(s) a report may cover. A requested groupId requires an
 * active membership — uniform 404 otherwise, exactly like every other group
 * read endpoint. With no groupId, every group the actor is an active member
 * of is included (archived groups remain readable historically, matching the
 * rest of the app).
 */
async function resolveAuthorizedGroups(actorId: string, groupId: string | null): Promise<GroupDocument[]> {
  const actorObjectId = new Types.ObjectId(actorId);
  if (groupId) {
    const group = await Group.findById(new Types.ObjectId(groupId));
    if (!group || !isActiveMember(group as unknown as GroupDocument, actorId)) {
      throw new ApiError(404, "Group not found");
    }
    return [group as unknown as GroupDocument];
  }
  return (await Group.find({
    members: { $elemMatch: { userId: actorObjectId, status: "active" } },
  }).sort({ name: 1, _id: 1 })) as unknown as GroupDocument[];
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

const toIso = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

/** Expense rows projected for report aggregation, incl. the split method label. */
interface ReportLeanExpense extends LeanExpense {
  splitMethod: string;
}

export interface ReportQuery {
  scope: ReportScope;
  groupId: string | null;
  range: ReportRange;
}

/**
 * Read-only, derived financial report for the actor.
 *
 * Data isolation / authorization mirrors the rest of the app:
 * - personal scope touches ONLY the actor's own `group: null` expenses;
 * - group scope touches ONLY groups the actor is an active member of;
 * - a specific groupId is gated by active membership (uniform 404);
 * - archived groups stay readable because the actor is still an active member;
 * - completed settlements are read (never mutated) for settlement totals and
 *   the debt-matrix net positions — settlement idempotency is untouched.
 *
 * All money stays in integer minor units; every figure is summed server-side
 * from non-voided expense records (and completed settlements). Nothing is
 * invented that the database cannot already answer.
 */
export async function getReportSummary(actorId: string, query: ReportQuery): Promise<ReportSummary> {
  const { start, end } = rangeBounds(query.range);
  const actorObjectId = new Types.ObjectId(actorId);

  const includePersonal = query.scope === "all" || query.scope === "personal";
  const includeGroups = query.scope === "all" || query.scope === "group";

  const groups = includeGroups ? await resolveAuthorizedGroups(actorId, query.groupId) : [];
  const groupIds = groups.map((g) => g._id as Types.ObjectId);

  const rangeFilter = { $gte: start, $lt: end };

  const [personalExpenses, groupExpenses] = await Promise.all([
    includePersonal
      ? (Expense.find({
          group: null,
          createdBy: actorObjectId,
          voided: { $ne: true },
          expenseDate: rangeFilter,
        })
          .sort({ expenseDate: -1, _id: -1 })
          .lean() as unknown as Promise<ReportLeanExpense[]>)
      : Promise.resolve([] as ReportLeanExpense[]),
    includeGroups
      ? (Expense.find({
          group: { $in: groupIds },
          voided: { $ne: true },
          expenseDate: rangeFilter,
        })
          .sort({ expenseDate: -1, _id: -1 })
          .lean() as unknown as Promise<ReportLeanExpense[]>)
      : Promise.resolve([] as ReportLeanExpense[]),
  ]);

  const personalSpentMinor = personalExpenses.reduce((sum, e) => sum + e.amountMinor, 0);
  const groupSpentMinor = groupExpenses.reduce((sum, e) => sum + e.amountMinor, 0);

  /* ---------------- category breakdown (keyword-derived, full amounts) ----- */
  const categoryTotals = new Map<string, { amountMinor: number; expenseCount: number }>();
  const addToCategories = (title: string, amountMinor: number): void => {
    const category = classifySpendingCategory(title);
    const entry = categoryTotals.get(category) ?? { amountMinor: 0, expenseCount: 0 };
    entry.amountMinor += amountMinor;
    entry.expenseCount += 1;
    categoryTotals.set(category, entry);
  };
  for (const expense of personalExpenses) addToCategories(expense.title, expense.amountMinor);
  for (const expense of groupExpenses) addToCategories(expense.title, expense.amountMinor);

  const categories: ReportCategoryRow[] = orderedCategories()
    .map((category) => {
      const entry = categoryTotals.get(category) ?? { amountMinor: 0, expenseCount: 0 };
      return { category, amountMinor: entry.amountMinor, expenseCount: entry.expenseCount };
    })
    .filter((entry) => entry.amountMinor > 0);

  /* ---------------- per-group rows + actor rollups -------------------------- */
  const groupNameById = new Map(groups.map((g) => [g._id.toString(), g.name]));

  const groupRows: ReportGroupRow[] = [];
  let paidMinor = 0;
  let owedMinor = 0;
  let netMinor = 0;
  let settlementCount = 0;
  let settlementTotalMinor = 0;

  for (const group of groups) {
    const groupObjectId = group._id as Types.ObjectId;
    const groupIdKey = groupObjectId.toString();
    const expenses = groupExpenses.filter((e) => e.group && e.group.toString() === groupIdKey);

    const settlements = (await Settlement.find({
      group: groupObjectId,
      status: "completed",
      date: rangeFilter,
    }).lean()) as unknown as Array<{ payerId: Types.ObjectId; receiverId: Types.ObjectId; amountMinor: number }>;

    const matrix = computeDebtMatrix(expenses.map(toBalanceExpense));
    applySettlements(
      matrix,
      settlements.map((s) => ({
        payerId: s.payerId.toString(),
        receiverId: s.receiverId.toString(),
        amountMinor: s.amountMinor,
      })),
    );
    const positions = positionsFromDebtMatrix(matrix);

    const spentMinor = expenses.reduce((sum, e) => sum + e.amountMinor, 0);
    const rowSettlementTotal = settlements.reduce((sum, s) => sum + s.amountMinor, 0);
    const myNet = positions.get(actorId) ?? 0;

    groupRows.push({
      groupId: groupIdKey,
      groupName: group.name,
      archived: group.archived,
      expenseCount: expenses.length,
      spentMinor,
      myPaidMinor: matrix.paidMinor.get(actorId) ?? 0,
      myOwedMinor: matrix.owedMinor.get(actorId) ?? 0,
      myNetMinor: myNet,
      settlementCount: settlements.length,
      settlementTotalMinor: rowSettlementTotal,
    });

    paidMinor += matrix.paidMinor.get(actorId) ?? 0;
    owedMinor += matrix.owedMinor.get(actorId) ?? 0;
    netMinor += myNet;
    settlementCount += settlements.length;
    settlementTotalMinor += rowSettlementTotal;
  }

  /* ---------------- authorized line items (CSV/PDF source) ------------------- */
  const payerIds = new Set<string>();
  for (const expense of [...groupExpenses, ...personalExpenses]) {
    payerIds.add(expense.payerId.toString());
  }
  const payerNames = new Map<string, string>();
  if (payerIds.size > 0) {
    const users = (await User.find({ _id: { $in: [...payerIds] } }).select("name").lean()) as unknown as Array<{
      _id: Types.ObjectId;
      name: string;
    }>;
    for (const user of users) payerNames.set(user._id.toString(), user.name);
  }

  const transactions: ReportTransaction[] = [
    ...groupExpenses.map((expense) => {
      const groupKey = expense.group ? expense.group.toString() : null;
      return {
        id: expense._id.toString(),
        date: toIso(expense.expenseDate),
        description: expense.title,
        category: classifySpendingCategory(expense.title),
        type: "group" as const,
        groupId: groupKey,
        groupName: groupKey ? (groupNameById.get(groupKey) ?? "") : null,
        payerId: expense.payerId.toString(),
        payerName: payerNames.get(expense.payerId.toString()) ?? "Unknown",
        amountMinor: expense.amountMinor,
        currency: expense.currency || DEFAULT_CURRENCY,
        splitMethod: expense.splitMethod,
      };
    }),
    ...personalExpenses.map((expense) => ({
      id: expense._id.toString(),
      date: toIso(expense.expenseDate),
      description: expense.title,
      category: classifySpendingCategory(expense.title),
      type: "personal" as const,
      groupId: null,
      groupName: null,
      payerId: expense.payerId.toString(),
      payerName: payerNames.get(expense.payerId.toString()) ?? "Unknown",
      amountMinor: expense.amountMinor,
      currency: expense.currency || DEFAULT_CURRENCY,
      splitMethod: expense.splitMethod,
    })),
  ];
  transactions.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));

  return {
    range: query.range,
    scope: query.scope,
    groupId: query.groupId,
    groupName: query.groupId ? (groupNameById.get(query.groupId) ?? null) : null,
    currency: DEFAULT_CURRENCY,
    expenseCount: personalExpenses.length + groupExpenses.length,
    groupExpenseCount: groupExpenses.length,
    personalExpenseCount: personalExpenses.length,
    totalSpentMinor: personalSpentMinor + groupSpentMinor,
    groupSpentMinor,
    personalSpentMinor,
    paidMinor,
    owedMinor,
    netMinor,
    settlementCount,
    settlementTotalMinor,
    categories,
    groups: groupRows,
    transactions,
  };
}

/* ------------------------------ query parsing ------------------------------ */

export function parseReportScope(raw: unknown): ReportScope | null {
  if (typeof raw !== "string") return null;
  if (raw === "all" || raw === "group" || raw === "personal") return raw;
  return null;
}

export function parseReportRange(
  rawFrom: unknown,
  rawTo: unknown,
): ReportRange | null {
  if (rawFrom === undefined && rawTo === undefined) return defaultRange();
  if (typeof rawFrom !== "string" || typeof rawTo !== "string") return null;
  if (!DAY_KEY_PATTERN.test(rawFrom) || !DAY_KEY_PATTERN.test(rawTo)) return null;
  if (!parseDayKey(rawFrom) || !parseDayKey(rawTo)) return null;
  return { from: rawFrom, to: rawTo };
}