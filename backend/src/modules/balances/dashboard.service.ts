import { Types } from "mongoose";
import { Group, type GroupDocument } from "../groups/group.model.js";
import { Expense } from "../expenses/expense.model.js";
import { Settlement } from "../settlements/settlement.model.js";
import {
  applySettlements,
  computeDebtMatrix,
  loadSettlementViews,
  outstandingFromPositions,
  positionsFromDebtMatrix,
  type BalanceExpense,
  type LeanExpense,
} from "./balances.service.js";
import type {
  DashboardData,
  DashboardGroupOverview,
  RecentGroupExpenseSummary,
  RecentPersonalExpenseSummary,
  SettlementView,
} from "./balances.types.js";

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

/**
 * Aggregate dashboard derived from authoritative expense records.
 * Personal expenses count as spending only (never as group debt).
 * Settlements are exposed as an empty future-compatible list until H.7.
 */
export async function getDashboard(actorId: string): Promise<DashboardData> {
  const activeGroups = (await Group.find({
    archived: false,
    members: { $elemMatch: { userId: actorId as unknown as Types.ObjectId, status: "active" } },
  }).sort({ createdAt: -1 })) as unknown as GroupDocument[];

  const activeGroupIds = activeGroups.map((g) => g._id);

  const groups: DashboardGroupOverview[] = [];
  let groupSumPaidMinor = 0;
  let groupSumOwedMinor = 0;
  let groupSumToReceiveMinor = 0;
  let groupSumToPayMinor = 0;

  for (const group of activeGroups) {
    const [expenses, settlements] = await Promise.all([
      Expense.find({
        group: group._id,
        voided: { $ne: true },
      }).lean() as unknown as Promise<LeanExpense[]>,
      loadSettlementViews(group._id.toString()),
    ]);

    const matrix = computeDebtMatrix(expenses.map(toBalanceExpense));
    applySettlements(matrix, settlements);
    const positions = positionsFromDebtMatrix(matrix);
    const myNet = positions.get(actorId) ?? 0;

    const myMembership = group.members.find((m) => m.userId.toString() === actorId);
    const memberCount = group.members.filter((m) => m.status === "active").length;

    groups.push({
      id: group._id.toString(),
      name: group.name,
      memberCount,
      myRole: myMembership?.role ?? null,
      netMinor: myNet,
      outstandingMinor: outstandingFromPositions(positions),
    });

    groupSumPaidMinor += matrix.paidMinor.get(actorId) ?? 0;
    groupSumOwedMinor += matrix.owedMinor.get(actorId) ?? 0;
    if (myNet >= 0) {
      groupSumToReceiveMinor += myNet;
    } else {
      groupSumToPayMinor += -myNet;
    }
  }

  const personalFilter = {
    group: null,
    createdBy: new Types.ObjectId(actorId),
    voided: { $ne: true },
  };

  const [personalExpenses, personalTotal, recentGroupExpenses] = await Promise.all([
    Expense.find(personalFilter).sort({ expenseDate: -1, _id: -1 }).limit(5).lean() as unknown as Promise<LeanExpense[]>,
    Expense.aggregate<{ total: number }>([
      { $match: personalFilter },
      { $group: { _id: null, total: { $sum: "$amountMinor" } } },
    ]),
    Expense.find({ group: { $in: activeGroupIds }, voided: { $ne: true } })
      .sort({ expenseDate: -1, _id: -1 })
      .limit(10)
      .lean() as unknown as Promise<LeanExpense[]>,
  ]);

  const groupNameById = new Map(activeGroups.map((g) => [g._id.toString(), g.name]));

  const recentGroupExpenseSummaries: RecentGroupExpenseSummary[] = recentGroupExpenses.map((e) => ({
    id: e._id.toString(),
    groupId: e.group ? e.group.toString() : "",
    groupName: groupNameById.get(e.group ? e.group.toString() : "") ?? "",
    title: e.title,
    amountMinor: e.amountMinor,
    currency: e.currency,
    expenseDate: toIso(e.expenseDate),
    payerId: e.payerId.toString(),
  }));

  const recentPersonalExpenseSummaries: RecentPersonalExpenseSummary[] = personalExpenses.map((e) => ({
    id: e._id.toString(),
    title: e.title,
    amountMinor: e.amountMinor,
    currency: e.currency,
    expenseDate: toIso(e.expenseDate),
  }));

  const recentCompletedSettlements = await Settlement.find({
    group: { $in: activeGroupIds },
    status: "completed",
  })
    .sort({ date: -1, _id: -1 })
    .limit(10)
    .lean();

  const recentSettlements: SettlementView[] = recentCompletedSettlements.map((s) => ({
    groupId: s.group.toString(),
    payerId: s.payerId.toString(),
    receiverId: s.receiverId.toString(),
    amountMinor: s.amountMinor,
  }));

  return {
    personalSpendingMinor: personalTotal.length > 0 ? personalTotal[0].total : 0,
    groupSumPaidMinor,
    groupSumOwedMinor,
    groupSumToReceiveMinor,
    groupSumToPayMinor,
    overallNetMinor: groupSumToReceiveMinor - groupSumToPayMinor,
    groupCount: activeGroups.length,
    groups,
    recentGroupExpenses: recentGroupExpenseSummaries,
    recentPersonalExpenses: recentPersonalExpenseSummaries,
    recentSettlements,
  };
}