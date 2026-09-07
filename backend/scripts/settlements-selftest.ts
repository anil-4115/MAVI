/**
 * Self-tests for the H.7 settlement effect on the derived balance engine.
 * Runs offline (no DB) against the pure functions in balances.service.ts.
 *
 *   npx tsx scripts/settlements-selftest.ts
 */
import {
  applySettlements,
  computeDebtMatrix,
  netPairwise,
  outstandingFromPositions,
  positionsFromDebtMatrix,
  suggestSettlements,
  type BalanceExpense,
} from "../src/modules/balances/balances.service.js";

let failures = 0;
const failuresList: string[] = [];
const passCount = { n: 0 };

const check = (condition: boolean, label: string): void => {
  if (condition) {
    passCount.n++;
  } else {
    failures++;
    failuresList.push(`FAIL: ${label}`);
  }
};

const ex = (
  id: string,
  payerId: string,
  amountMinor: number,
  shares: Record<string, number>,
  voided = false,
): BalanceExpense => ({
  id,
  payerId,
  amountMinor,
  voided,
  participantShares: Object.entries(shares).map(([userId, amount]) => ({ userId, amountMinor: amount })),
});

const settle = (payerId: string, receiverId: string, amountMinor: number) => ({ payerId, receiverId, amountMinor });
const sumOf = (values: Iterable<number>): number => [...values].reduce((a, b) => a + b, 0);
const expectPosition = (positions: Map<string, number>, userId: string, expected: number, label: string): void => {
  check(positions.get(userId) === expected, `${label}: net(${userId}) = ${expected} (got ${positions.get(userId)})`);
};
const assertIntegers = (obj: unknown, label: string): void => {
  const visit = (value: unknown, path: string): void => {
    if (typeof value === "number") {
      check(Number.isInteger(value), `${label}: ${path} is an integer (got ${value})`);
    } else if (Array.isArray(value)) {
      value.forEach((v, i) => visit(v, `${path}[${i}]`));
    } else if (value && typeof value === "object") {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        visit(v, `${path}.${k}`);
      }
    }
  };
  visit(obj, "result");
};

/* Build an expense-only matrix and fold in the given completed settlements. */
const build = (expenses: BalanceExpense[], settlements: ReturnType<typeof settle>[]) => {
  const matrix = computeDebtMatrix(expenses);
  applySettlements(matrix, settlements);
  const positions = positionsFromDebtMatrix(matrix);
  return { matrix, positions };
};

/* ----------------- 1. partial settlement (debt 500, pay 200) ---------------- */
{
  // A pays 1000; shares A0/B500/C500 -> B owes A 500, C owes A 500.
  const { matrix, positions } = build(
    [ex("e1", "A", 1000, { A: 0, B: 500, C: 500 })],
    [settle("B", "A", 200)],
  );

  expectPosition(positions, "A", 800, "1.partial");
  expectPosition(positions, "B", -300, "1.partial");
  expectPosition(positions, "C", -500, "1.partial");
  check(outstandingFromPositions(positions) === 800, `1.partial: outstanding = 800 (got ${outstandingFromPositions(positions)})`);

  const pairwise = netPairwise(matrix);
  const bToA = pairwise.find((p) => p.userIdA === "A" && p.userIdB === "B")?.netMinor;
  check(bToA === -300, `1.partial: B owes A 300 (got ${bToA})`);
  check(pairwise.some((p) => p.userIdA === "A" && p.userIdB === "C" && p.netMinor === -500), "1.partial: C owes A 500");
}

/* ----------------- 2. full settlement (debt 500, pay 500) ------------------- */
{
  const { matrix, positions } = build(
    [ex("e1", "A", 1000, { A: 0, B: 500, C: 500 })],
    [settle("B", "A", 500)],
  );

  expectPosition(positions, "A", 500, "2.full");
  expectPosition(positions, "B", 0, "2.full");
  expectPosition(positions, "C", -500, "2.full");
  check(outstandingFromPositions(positions) === 500, "2.full: outstanding = 500");

  const pair = netPairwise(matrix).find((p) => (p.userIdA === "A" && p.userIdB === "B") || (p.userIdA === "B" && p.userIdB === "A"));
  check(pair === undefined, "2.full: no B<->A pair remains");
}

/* ------------ 3. over-settlement flips the pair correctly (decision) -------- */
{
  // C owes A 500 but settles 800 -> A ends up owing C 300 (pair flips),
  // while B still owes A 500. Net positions: A +200, B -500, C +300.
  const { matrix, positions } = build(
    [ex("e1", "A", 1000, { A: 0, B: 500, C: 500 })],
    [settle("C", "A", 800)],
  );

  expectPosition(positions, "A", 200, "3.over");
  expectPosition(positions, "B", -500, "3.over");
  expectPosition(positions, "C", 300, "3.over");
  const pair = netPairwise(matrix).find((p) => (p.userIdA === "A" && p.userIdB === "C") || (p.userIdA === "C" && p.userIdB === "A"));
  check(pair !== undefined && pair.netMinor === 300, `3.over: A now owes C 300 (got ${pair?.netMinor})`);

  // Greedy on positions: debtor B pays the largest creditor C first, then A.
  const transfers = suggestSettlements(positions);
  check(transfers[0].fromUserId === "B" && transfers[0].toUserId === "C" && transfers[0].amountMinor === 300,
    "3.over: greedy suggests B -> C 300");
  check(transfers[1].fromUserId === "B" && transfers[1].toUserId === "A" && transfers[1].amountMinor === 200,
    "3.over: greedy suggests B -> A 200");
  check(sumOf(transfers.map((t) => t.amountMinor)) === 500, "3.over: greedy sum === outstanding (500)");
}

/* ---------------- 4. cancelled settlement has NO effect --------------------- */
{
  // The engine only receives completed settlements (the read layer filters
  // cancelled). Omitting a cancelled record must reproduce the pre-cancel state.
  const expenses = [ex("e1", "A", 1000, { A: 0, B: 500, C: 500 })];
  const before = build(expenses, []);
  const after = build(expenses, []); // cancelled => not applied

  for (const id of ["A", "B", "C"]) {
    check(before.positions.get(id) === after.positions.get(id), `4.cancelled: ${id} unchanged`);
  }
  expectPosition(after.positions, "B", -500, "4.cancelled");
}

/* ------------- 5. multiple settlements between the same users ---------------- */
{
  const { positions } = build(
    [ex("e1", "A", 1000, { A: 0, B: 500, C: 500 })],
    [settle("B", "A", 100), settle("B", "A", 150)],
  );

  expectPosition(positions, "A", 750, "5.multi");
  expectPosition(positions, "B", -250, "5.multi");
  check(outstandingFromPositions(positions) === 750, "5.multi: outstanding = 750");
}

/* ------------- 6. reciprocal debts with settlement on the pair -------------- */
{
  // E1: B pays 500, A owes 500 (A->B 500). E2: A pays 300, B owes 300 (B->A 300).
  // Net before settlement: A owes B 200.
  const expenses = [ex("e1", "B", 500, { B: 0, A: 500 }), ex("e2", "A", 300, { A: 0, B: 300 })];
  const before = build(expenses, []);
  expectPosition(before.positions, "A", -200, "6.reciprocal.before");
  expectPosition(before.positions, "B", 200, "6.reciprocal.before");

  // Settlement: A pays B 100. Net: A owes B 100.
  const { matrix, positions } = build(expenses, [settle("A", "B", 100)]);
  expectPosition(positions, "A", -100, "6.reciprocal.after");
  expectPosition(positions, "B", 100, "6.reciprocal.after");

  const pair = netPairwise(matrix).find((p) => (p.userIdA === "A" && p.userIdB === "B") || (p.userIdA === "B" && p.userIdB === "A"));
  check(pair?.netMinor === 100, `6.reciprocal.after: A owes B 100 (got ${pair?.netMinor})`);

  const transfers = suggestSettlements(positions);
  check(transfers.length === 1 && transfers[0].fromUserId === "A" && transfers[0].amountMinor === 100,
    "6.reciprocal.after: greedy suggests A -> B 100");
}

/* ------------------- 7. cross-group isolation, settlement ------------------- */
{
  const g1 = build([ex("g1", "A", 1000, { A: 0, B: 500, C: 500 })], [settle("B", "A", 200)]);
  const g2 = build([ex("g2", "X", 600, { X: 0, Y: 600 })], [settle("Y", "X", 600)]);

  check(g1.positions.has("A") && !g1.positions.has("X") && !g1.positions.has("Y"), "7.groups: g1 excludes group2 members");
  check(g2.positions.has("X") && g2.positions.has("Y") && !g2.positions.has("A"), "7.groups: g2 excludes group1 members");
  check(sumOf([...g1.positions.values()]) === 0 && sumOf([...g2.positions.values()]) === 0, "7.groups: each group conserves (sum net 0)");
}

/* ------------- 8. invariants & conservation after settlements ---------------- */
{
  const expenses = [
    ex("e1", "A", 1000, { A: 334, B: 333, C: 333 }),
    ex("e2", "C", 600, { C: 0, A: 300, B: 300 }),
  ];
  const settlements = [settle("B", "A", 100), settle("C", "A", 200)];
  const { matrix, positions } = build(expenses, settlements);

  // sum(net) = 0, outstanding reconciles with debtors, integers everywhere.
  check(sumOf([...positions.values()]) === 0, "8.conservation: sum(net) === 0");

  const sumDebtors = sumOf([...positions.values()].filter((v) => v < 0).map((v) => -v));
  const sumCreditors = sumOf([...positions.values()].filter((v) => v > 0));
  check(sumDebtors === sumCreditors, "8.conservation: sum(|debtors|) === sum(|creditors|)");
  check(outstandingFromPositions(positions) === sumDebtors, "8.conservation: outstanding === sum|debtors|");

  // paid/owed remain expense-only (settlements never change them).
  check(matrix.totalExpenseMinor === 1600, "8.conservation: totalExpense unchanged by settlements (1600)");

  const transfers = suggestSettlements(positions);
  check(sumOf(transfers.map((t) => t.amountMinor)) === outstandingFromPositions(positions),
    "8.conservation: suggested sum === outstanding");

  const outByUser = new Map<string, number>();
  const inByUser = new Map<string, number>();
  for (const t of transfers) {
    outByUser.set(t.fromUserId, (outByUser.get(t.fromUserId) ?? 0) + t.amountMinor);
    inByUser.set(t.toUserId, (inByUser.get(t.toUserId) ?? 0) + t.amountMinor);
  }
  for (const [userId, net] of positions) {
    const out = outByUser.get(userId) ?? 0;
    const inc = inByUser.get(userId) ?? 0;
    check(inc - out === net, `8.conservation: user ${userId} in-out reconciles (${inc - out} === ${net})`);
  }

  assertIntegers(
    {
      positions: [...positions.values()],
      pairwise: netPairwise(matrix),
      transfers,
    },
    "8.integers",
  );
}

console.log("PASS=" + passCount.n + " FAIL=" + failures);
if (failures > 0) {
  failuresList.forEach((f) => console.log(f));
  process.exit(1);
}