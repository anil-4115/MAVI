/**
 * Self-tests for the H.6 Balances derived-calculation engine.
 * Runs offline (no DB) against the pure functions in balances.service.ts.
 *
 *   npx tsx scripts/balances-selftest.ts
 */
import {
  computeDebtMatrix,
  netPairwise,
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

/* ------------------------------ test helpers ------------------------------ */

/**
 * Build a normalized balance expense. Positions are passed exactly as
 * participantShares (which H.4/H.5 produced) — the engine only consumes them.
 */
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

const netByUser = (matrix: { paidMinor: Map<string, number>; owedMinor: Map<string, number> }) => {
  const paid = matrix.paidMinor.get.bind(matrix.paidMinor);
  const owed = matrix.owedMinor.get.bind(matrix.owedMinor);
  const ids = new Set([...matrix.paidMinor.keys(), ...matrix.owedMinor.keys()]);
  return new Map([...ids].map((id) => [id, (paid(id) ?? 0) - (owed(id) ?? 0)]));
};

const sumOf = (values: Iterable<number>): number => [...values].reduce((a, b) => a + b, 0);

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

const expectPosition = (positions: Map<string, number>, userId: string, expected: number, label: string): void => {
  check(positions.get(userId) === expected, `${label}: net(${userId}) = ${expected} (got ${positions.get(userId)})`);
};

const expectPairwise = (entries: { userIdA: string; userIdB: string; netMinor: number }[], want: [string, string, number][], label: string): void => {
  const map = new Map(entries.map((e) => [`${e.userIdA}|${e.userIdB}`, e.netMinor]));
  for (const [a, b, net] of want) {
    check(map.get(`${a}|${b}`) === net, `${label}: net(${a}->${b}) = ${net} (got ${map.get(`${a}|${b}`)})`);
  }
  check(entries.length === want.length, `${label}: pairwise entry count = ${want.length} (got ${entries.length})`);
};

/* -------------------------------- 1. one expense --------------------------- */
{
  const matrix = computeDebtMatrix([ex("e1", "A", 1000, { A: 500, B: 500 })]);
  const positions = positionsFromDebtMatrix(matrix);

  expectPosition(positions, "A", 500, "1.one-expense");
  expectPosition(positions, "B", -500, "1.one-expense");
  expectPairwise(netPairwise(matrix), [["A", "B", -500]], "1.one-expense"); // negative => B owes A

  const transfers = suggestSettlements(positions);
  check(transfers.length === 1 && transfers[0].fromUserId === "B" && transfers[0].toUserId === "A" && transfers[0].amountMinor === 500,
    "1.one-expense: single transfer B -> A 500");

  check(matrix.totalExpenseMinor === 1000 && matrix.totalDebtMinor === 500, "1.one-expense: totals (expense 1000, debt 500)");
}

/* --------------------------- 2. multiple expenses -------------------------- */
{
  // E1: A pays 1000 (B owes 500, C owes 500). E2: C pays 600 (A owes 300, B owes 300).
  const matrix = computeDebtMatrix([
    ex("e1", "A", 1000, { A: 0, B: 500, C: 500 }),
    ex("e2", "C", 600, { C: 0, A: 300, B: 300 }),
  ]);
  const positions = positionsFromDebtMatrix(matrix);
  const pairwise = netPairwise(matrix);

  expectPosition(positions, "A", 700, "2.multi");
  expectPosition(positions, "B", -800, "2.multi");
  expectPosition(positions, "C", 100, "2.multi");
  // Pair netting: B owes A 500; C owes A 200 (C->A 500 minus A->C 300); B owes C 300.
  expectPairwise(pairwise, [
    ["A", "B", -500],
    ["A", "C", -200],
    ["B", "C", 300],
  ], "2.multi");

  const transfers = suggestSettlements(positions);
  const sumTransfers = sumOf(transfers.map((t) => t.amountMinor));
  check(sumTransfers === 800, `2.multi: settlement sum = 800 (got ${sumTransfers})`);

  const t = new Map(transfers.map((s) => [`${s.fromUserId}>${s.toUserId}`, s.amountMinor]));
  check(t.get("B>A") === 700 && t.get("B>C") === 100, "2.multi: greedy resolves cycle (B->A 700, B->C 100)");

  check(matrix.totalExpenseMinor === 1600 && matrix.totalDebtMinor === 1600, "2.multi: totals (expense 1600, gross debt 1600)");
}

/* ---------------------------- 3. reciprocal debts ------------------------- */
{
  // A owes B 500 (A->B), B owes A 200 (B->A). Net: A owes B 300.
  const matrix = computeDebtMatrix([ex("e1", "B", 500, { B: 0, A: 500 }), ex("e2", "A", 200, { A: 0, B: 200 })]);
  const positions = positionsFromDebtMatrix(matrix);

  expectPosition(positions, "A", -300, "3.reciprocal");
  expectPosition(positions, "B", 300, "3.reciprocal");
  expectPairwise(netPairwise(matrix), [["A", "B", 300]], "3.reciprocal"); // positive => A owes B 300
}

/* --------------------------- 4. multiple participants --------------------- */
{
  // A pays 1000 equally among A/B/C -> shares 334/333/333 (largest remainder).
  const matrix = computeDebtMatrix([ex("e1", "A", 1000, { A: 334, B: 333, C: 333 })]);
  const positions = positionsFromDebtMatrix(matrix);

  expectPosition(positions, "A", 666, "4.multi-participants");
  expectPosition(positions, "B", -333, "4.multi-participants");
  expectPosition(positions, "C", -333, "4.multi-participants");
  expectPairwise(netPairwise(matrix), [
    ["A", "B", -333],
    ["A", "C", -333],
  ], "4.multi-participants");

  const transfers = suggestSettlements(positions);
  check(sumOf(transfers.map((t) => t.amountMinor)) === 666, "4.multi-participants: settlement sum = outstanding");
}

/* ---------------------------- 5. payer own share -------------------------- */
{
  // A pays 500 equally with B: A own share 250 must not create self-debt.
  const matrix = computeDebtMatrix([ex("e1", "A", 500, { A: 250, B: 250 })]);
  const positions = positionsFromDebtMatrix(matrix);

  check(positions.get("A") === 250 && positions.get("B") === -250, "5.self-share: A +250, B -250");
  check(matrix.totalDebtMinor === 250, "5.self-share: gross debt excludes own share (250)");
  expectPairwise(netPairwise(matrix), [["A", "B", -250]], "5.self-share");
}

/* ------------------- 6. all six split methods (via shares) ---------------- */
{
  const cases: { label: string; expense: BalanceExpense; expected: Record<string, number> }[] = [
    {
      label: "equal",
      expense: ex("eq", "A", 900, { A: 300, B: 300, C: 300 }),
      expected: { A: 600, B: -300, C: -300 },
    },
    {
      label: "quantity",
      expense: ex("q", "A", 900, { A: 150, B: 300, C: 450 }),
      expected: { A: 750, B: -300, C: -450 },
    },
    {
      label: "exact",
      expense: ex("x", "A", 900, { A: 100, B: 800 }),
      expected: { A: 800, B: -800 },
    },
    {
      label: "percentage",
      expense: ex("p", "B", 1000, { B: 550, A: 450 }),
      expected: { A: -450, B: 450 },
    },
    {
      label: "shares",
      expense: ex("s", "C", 900, { C: 300, A: 300, B: 300 }),
      expected: { A: -300, B: -300, C: 600 },
    },
    {
      label: "itemwise",
      expense: ex("i", "A", 1000, { A: 300, B: 500, C: 200 }),
      expected: { A: 700, B: -500, C: -200 },
    },
  ];

  for (const { label, expense, expected } of cases) {
    const matrix = computeDebtMatrix([expense]);
    const positions = positionsFromDebtMatrix(matrix);
    for (const [userId, want] of Object.entries(expected)) {
      expectPosition(positions, userId, want, `6.${label}`);
    }
    // payer own share excluded; conservation holds in every method.
    const sumNet = sumOf([...positions.values()]);
    check(sumNet === 0, `6.${label}: sum of nets = 0`);
  }
}

/* --------------------------- 7. voided excluded ---------------------------- */
{
  const matrix = computeDebtMatrix([
    ex("live", "A", 1000, { A: 500, B: 500 }),
    ex("voided", "A", 5000, { A: 0, B: 5000 }, true),
  ]);
  const positions = positionsFromDebtMatrix(matrix);
  expectPosition(positions, "A", 500, "7.voided");
  expectPosition(positions, "B", -500, "7.voided");
  check(matrix.totalExpenseMinor === 1000, "7.voided: expense total excludes voided (1000)");
}

/* ------------------------ 8. personal not a group debt --------------------- */
{
  // Personal expense (group-less) is never part of a group dataset.
  const matrix = computeDebtMatrix([ex("p", "A", 250, { A: 250 })]);
  check(matrix.totalExpenseMinor === 250 && matrix.totalDebtMinor === 0, "8.personal: spending without debt");
  check(positionsFromDebtMatrix(matrix).get("A") === 0, "8.personal: full self-share means no net position");
}

/* ---------------------- 9. multiple groups isolated ------------------------ */
{
  const group1 = computeDebtMatrix([ex("g1a", "A", 1000, { A: 500, B: 500 })]);
  const group2 = computeDebtMatrix([ex("g2a", "X", 600, { X: 300, Y: 300 })]);

  const p1 = positionsFromDebtMatrix(group1);
  const p2 = positionsFromDebtMatrix(group2);

  check(p1.has("A") && !p1.has("X") && !p1.has("Y"), "9.groups: group A has no group B members");
  check(p2.has("X") && p2.has("Y") && !p2.has("A") && !p2.has("B"), "9.groups: group B has no group A members");
  check(sumOf([...p1.values()]) === 0 && sumOf([...p2.values()]) === 0, "9.groups: each group conserves (sum net 0)");
}

/* ------------------------- 13. suggested settlements ----------------------- */
{
  // Deterministic ties: two creditors of equal size -> always same order.
  const positions = new Map<string, number>([
    ["zzDebtor", -150],
    ["aaCreditor", 100],
    ["bbCreditor", 50],
  ]);
  const first = suggestSettlements(positions);
  const second = suggestSettlements(positions);
  check(JSON.stringify(first) === JSON.stringify(second), "13.settlements: deterministic across runs");

  check(first[0].fromUserId === "zzDebtor" && first[0].toUserId === "aaCreditor" && first[0].amountMinor === 100,
    "13.settlements: largest debtor -> largest creditor (100)");
  check(first[1].fromUserId === "zzDebtor" && first[1].toUserId === "bbCreditor" && first[1].amountMinor === 50,
    "13.settlements: remainder to next creditor (50)");
  check(sumOf(first.map((t) => t.amountMinor)) === 150, "13.settlements: sum equals outstanding");

  // Debtor tie-break ordering with equal debts.
  const tPositions = new Map<string, number>([
    ["d2", -100],
    ["d1", -100],
    ["c1", 200],
  ]);
  const t = suggestSettlements(tPositions);
  check(t[0].fromUserId === "d2" || t[0].fromUserId === "d1", "13.settlements: tie picked deterministically");
}

/* ------------------------------- 14. rounding ------------------------------ */
{
  const matrix = computeDebtMatrix([
    ex("e1", "A", 1000, { A: 334, B: 333, C: 333 }),
    ex("e2", "B", 700, { B: 233, A: 234, C: 233 }),
  ]);
  const positions = positionsFromDebtMatrix(matrix);
  assertIntegers(
    {
      matrix: {
        paidMinor: [...matrix.paidMinor.values()],
        owedMinor: [...matrix.owedMinor.values()],
        totalExpenseMinor: matrix.totalExpenseMinor,
        totalDebtMinor: matrix.totalDebtMinor,
      },
      positions: [...positions.values()],
      pairwise: netPairwise(matrix),
      settlements: suggestSettlements(positions),
    },
    "14.rounding",
  );
}

/* ------------------------------ 15. conservation --------------------------- */
{
  const matrix = computeDebtMatrix([
    ex("e1", "A", 1000, { A: 334, B: 333, C: 333 }),
    ex("e2", "C", 600, { C: 0, A: 300, B: 300 }),
    ex("e3", "B", 250, { B: 0, A: 250 }),
  ]);
  const positions = positionsFromDebtMatrix(matrix);

  const sumPaid = sumOf(matrix.paidMinor.values());
  const sumOwed = sumOf(matrix.owedMinor.values());
  const sumNet = sumOf(positions.values());
  const sumDebtors = sumOf([...positions.values()].filter((v) => v < 0).map((v) => -v));
  const sumCreditors = sumOf([...positions.values()].filter((v) => v > 0));

  check(sumPaid === matrix.totalExpenseMinor, "15.conservation: sum(paid) === totalExpense");
  check(sumOwed === matrix.totalExpenseMinor, "15.conservation: sum(owed) === totalExpense");
  check(sumNet === 0, "15.conservation: sum(net) === 0");
  check(sumDebtors === sumCreditors, "15.conservation: sum(|debtors|) === sum(|creditors|)");

  const transfers = suggestSettlements(positions);
  check(sumOf(transfers.map((t) => t.amountMinor)) === sumDebtors, "15.conservation: settlements sum === outstanding");

  // Each member's out/in from settlements reconciles with their net position.
  const outByUser = new Map<string, number>();
  const inByUser = new Map<string, number>();
  for (const t of transfers) {
    outByUser.set(t.fromUserId, (outByUser.get(t.fromUserId) ?? 0) + t.amountMinor);
    inByUser.set(t.toUserId, (inByUser.get(t.toUserId) ?? 0) + t.amountMinor);
  }
  for (const [userId, net] of positions) {
    const out = outByUser.get(userId) ?? 0;
    const inc = inByUser.get(userId) ?? 0;
    check(inc - out === net, `15.conservation: user ${userId} in-out reconciles (${inc - out} === ${net})`);
  }
}

console.log("PASS=" + passCount.n + " FAIL=" + failures);
if (failures > 0) {
  failuresList.forEach((f) => console.log(f));
  process.exit(1);
}