import { calculateShares } from "../src/modules/splitting/splitting.js";
import { validateSplitInput } from "../src/modules/splitting/splitting.validation.js";
import type { SplitRequest, SplitShare } from "../src/modules/splitting/splitting.types.js";
import { SplitValidationError } from "../src/modules/splitting/splitting.types.js";

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

const checkError = (fn: () => unknown, label: string, contains?: string): boolean => {
  try {
    fn();
    failures++;
    failuresList.push(`FAIL (expected error): ${label}`);
    return false;
  } catch (err) {
    if (err instanceof SplitValidationError) {
      if (contains && !String(err.message).includes(contains)) {
        failures++;
        failuresList.push(`FAIL (wrong message for [${label}]): ${err.message}`);
        return false;
      }
      passCount.n++;
      return true;
    }
    failures++;
    failuresList.push(`FAIL (wrong error type for ${label}): ${String(err)}`);
    return false;
  }
};

const split = (raw: unknown): SplitShare[] => calculateShares(validateSplitInput(raw));

const sum = (shares: SplitShare[]): number => shares.reduce((a, s) => a + s.amountMinor, 0);

const asMap = (shares: SplitShare[]): Map<string, number> => new Map(shares.map((s) => [s.userId, s.amountMinor]));

const assertInvariant = (raw: unknown, label: string): void => {
  const input = validateSplitInput(raw);
  const shares = calculateShares(input);
  check(sum(shares) === input.totalMinor, `${label}: sum(amountMinor) === totalMinor`);
};

const assertDeterministic = (raw: unknown, label: string): void => {
  const first = split(raw);
  const second = split(raw);
  check(JSON.stringify(first) === JSON.stringify(second), `${label}: deterministic for identical input`);
};

/* ---------------- equal ---------------- */

{
  const r = split({ method: "equal", totalMinor: 10000, equal: ["a", "b", "c", "d"].map((u) => ({ userId: u })) });
  check(JSON.stringify(r) === JSON.stringify([
    { userId: "a", amountMinor: 2500 },
    { userId: "b", amountMinor: 2500 },
    { userId: "c", amountMinor: 2500 },
    { userId: "d", amountMinor: 2500 },
  ]), "equal: 4 x 10000 -> 2500 each");
  assertInvariant({ method: "equal", totalMinor: 10000, equal: ["a", "b", "c", "d"].map((u) => ({ userId: u })) }, "equal 4x10000");

  const r2 = split({ method: "equal", totalMinor: 100, equal: ["a", "b", "c"].map((u) => ({ userId: u })) });
  check(JSON.stringify(r2) === JSON.stringify([
    { userId: "a", amountMinor: 34 },
    { userId: "b", amountMinor: 33 },
    { userId: "c", amountMinor: 33 },
  ]), "equal: 3 x 100 -> 34/33/33");
  assertInvariant({ method: "equal", totalMinor: 100, equal: ["a", "b", "c"].map((u) => ({ userId: u })) }, "equal 3x100");
}

/* ---------------- quantity ---------------- */

{
  const r = split({ method: "quantity", totalMinor: 1000, quantity: [{ userId: "a", quantity: 1 }, { userId: "b", quantity: 2 }] });
  check(JSON.stringify(r) === JSON.stringify([
    { userId: "a", amountMinor: 333 },
    { userId: "b", amountMinor: 667 },
  ]), "quantity: 1:2 on 1000 -> 333/667");
  assertInvariant({ method: "quantity", totalMinor: 1000, quantity: [{ userId: "a", quantity: 1 }, { userId: "b", quantity: 2 }] }, "quantity 1:2");

  const zero = split({ method: "quantity", totalMinor: 100, quantity: [{ userId: "a", quantity: 0 }, { userId: "b", quantity: 1 }] });
  check(JSON.stringify(zero) === JSON.stringify([
    { userId: "a", amountMinor: 0 },
    { userId: "b", amountMinor: 100 },
  ]), "quantity: zero quantity receives 0");
  assertInvariant({ method: "quantity", totalMinor: 100, quantity: [{ userId: "a", quantity: 0 }, { userId: "b", quantity: 1 }] }, "quantity zero quantity");

  checkError(() => split({ method: "quantity", totalMinor: 100, quantity: [{ userId: "a", quantity: 0 }, { userId: "b", quantity: 0 }] }), "quantity: all zero -> invalid", "At least one quantity");
  checkError(() => split({ method: "quantity", totalMinor: 100, quantity: [{ userId: "a", quantity: -1 }, { userId: "b", quantity: 2 }] }), "quantity: negative -> invalid");
}

/* ---------------- exact ---------------- */

{
  const r = split({ method: "exact", totalMinor: 1000, exact: [{ userId: "a", amountMinor: 400 }, { userId: "b", amountMinor: 600 }] });
  check(JSON.stringify(r) === JSON.stringify([
    { userId: "a", amountMinor: 400 },
    { userId: "b", amountMinor: 600 },
  ]), "exact: 400/600 valid, values preserved");
  assertInvariant({ method: "exact", totalMinor: 1000, exact: [{ userId: "a", amountMinor: 400 }, { userId: "b", amountMinor: 600 }] }, "exact valid");

  checkError(() => split({ method: "exact", totalMinor: 1000, exact: [{ userId: "a", amountMinor: 400 }, { userId: "b", amountMinor: 500 }] }), "exact: 400/500 vs 1000 -> invalid", "must total exactly");

  const withZero = split({ method: "exact", totalMinor: 500, exact: [{ userId: "a", amountMinor: 0 }, { userId: "b", amountMinor: 500 }] });
  check(JSON.stringify(withZero) === JSON.stringify([
    { userId: "a", amountMinor: 0 },
    { userId: "b", amountMinor: 500 },
  ]), "exact: zero amount participant allowed");
}

/* ---------------- percentage ---------------- */

{
  const r = split({ method: "percentage", totalMinor: 1000, percentage: [{ userId: "a", percentage: 60 }, { userId: "b", percentage: 40 }] });
  check(JSON.stringify(r) === JSON.stringify([
    { userId: "a", amountMinor: 600 },
    { userId: "b", amountMinor: 400 },
  ]), "percentage: 60/40 on 1000 -> 600/400");
  assertInvariant({ method: "percentage", totalMinor: 1000, percentage: [{ userId: "a", percentage: 60 }, { userId: "b", percentage: 40 }] }, "percentage 60/40");

  const three = split({
    method: "percentage",
    totalMinor: 100,
    percentage: [
      { userId: "a", percentage: 33.33 },
      { userId: "b", percentage: 33.33 },
      { userId: "c", percentage: 33.34 },
    ],
  });
  check(JSON.stringify(three) === JSON.stringify([
    { userId: "a", amountMinor: 33 },
    { userId: "b", amountMinor: 33 },
    { userId: "c", amountMinor: 34 },
  ]), "percentage: 33.33/33.33/33.34 on 100 -> 33/33/34");
  assertInvariant({
    method: "percentage",
    totalMinor: 100,
    percentage: [
      { userId: "a", percentage: 33.33 },
      { userId: "b", percentage: 33.33 },
      { userId: "c", percentage: 33.34 },
    ],
  }, "percentage 33.33/33.33/33.34");

  checkError(() => split({ method: "percentage", totalMinor: 500, percentage: [{ userId: "a", percentage: 60 }, { userId: "b", percentage: 39 }] }), "percentage: totals 99 -> invalid", "exactly 100");
  checkError(() => split({ method: "percentage", totalMinor: 500, percentage: [{ userId: "a", percentage: 101 }, { userId: "b", percentage: -1 }] }), "percentage: 101 -> invalid");
  checkError(() => split({ method: "percentage", totalMinor: 500, percentage: [{ userId: "a", percentage: 0 }, { userId: "b", percentage: 100 }] }), "percentage: 0 -> invalid");
  checkError(() => split({ method: "percentage", totalMinor: 500, percentage: [{ userId: "a", percentage: 33.333 }, { userId: "b", percentage: 66.667 }] }), "percentage: 3 decimals -> invalid", "2 decimal places");
}

/* ---------------- shares ---------------- */

{
  const r = split({ method: "shares", totalMinor: 1000, shares: [{ userId: "a", shares: 1 }, { userId: "b", shares: 2 }] });
  check(JSON.stringify(r) === JSON.stringify([
    { userId: "a", amountMinor: 333 },
    { userId: "b", amountMinor: 667 },
  ]), "shares: 1:2 on 1000 -> 333/667");
  assertInvariant({ method: "shares", totalMinor: 1000, shares: [{ userId: "a", shares: 1 }, { userId: "b", shares: 2 }] }, "shares 1:2");

  const oneOneOne = split({ method: "shares", totalMinor: 300, shares: [{ userId: "a", shares: 1 }, { userId: "b", shares: 1 }, { userId: "c", shares: 1 }] });
  check(JSON.stringify(oneOneOne) === JSON.stringify([
    { userId: "a", amountMinor: 100 },
    { userId: "b", amountMinor: 100 },
    { userId: "c", amountMinor: 100 },
  ]), "shares: 1:1:1 on 300 -> 100 each");
  assertInvariant({ method: "shares", totalMinor: 300, shares: [{ userId: "a", shares: 1 }, { userId: "b", shares: 1 }, { userId: "c", shares: 1 }] }, "shares 1:1:1");

  const rounding = split({ method: "shares", totalMinor: 100, shares: [{ userId: "a", shares: 1 }, { userId: "b", shares: 1 }, { userId: "c", shares: 1 }] });
  check(sum(rounding) === 100, "shares: 1:1:1 on 100 still sums to 100");

  checkError(() => split({ method: "shares", totalMinor: 100, shares: [{ userId: "a", shares: 0 }, { userId: "b", shares: 1 }] }), "shares: 0 -> invalid");
  checkError(() => split({ method: "shares", totalMinor: 100, shares: [{ userId: "a", shares: -2 }, { userId: "b", shares: 2 }] }), "shares: negative -> invalid");
}

/* ---------------- itemwise ---------------- */

{
  const oneItem = split({
    method: "itemwise",
    totalMinor: 600,
    itemwise: [{ amountMinor: 600, participants: ["a", "b"] }],
  });
  check(JSON.stringify(oneItem) === JSON.stringify([
    { userId: "a", amountMinor: 300 },
    { userId: "b", amountMinor: 300 },
  ]), "itemwise: single item split equally");
  assertInvariant({ method: "itemwise", totalMinor: 600, itemwise: [{ amountMinor: 600, participants: ["a", "b"] }] }, "itemwise single");

  const multi = split({
    method: "itemwise",
    totalMinor: 1000,
    itemwise: [
      { title: "Item A", amountMinor: 600, participants: ["a", "b"] },
      { title: "Item B", amountMinor: 400, participants: ["b", "c"] },
    ],
  });
  check(JSON.stringify(multi) === JSON.stringify([
    { userId: "a", amountMinor: 300 },
    { userId: "b", amountMinor: 500 },
    { userId: "c", amountMinor: 200 },
  ]), "itemwise: overlapping participants aggregate (A=300, B=500, C=200)");
  assertInvariant({ method: "itemwise", totalMinor: 1000, itemwise: [{ amountMinor: 600, participants: ["a", "b"] }, { amountMinor: 400, participants: ["b", "c"] }] }, "itemwise overlapping");

  const unequalSplit = split({
    method: "itemwise",
    totalMinor: 100,
    itemwise: [
      { amountMinor: 1, participants: ["a", "b", "c"] },
      { amountMinor: 99, participants: ["d"] },
    ],
  });
  check(JSON.stringify(unequalSplit) === JSON.stringify([
    { userId: "a", amountMinor: 1 },
    { userId: "b", amountMinor: 0 },
    { userId: "c", amountMinor: 0 },
    { userId: "d", amountMinor: 99 },
  ]), "itemwise: tiny item allocates remainder deterministically (1/0/0)");
  assertInvariant({ method: "itemwise", totalMinor: 100, itemwise: [{ amountMinor: 1, participants: ["a", "b", "c"] }, { amountMinor: 99, participants: ["d"] }] }, "itemwise tiny item");

  checkError(() => split({ method: "itemwise", totalMinor: 500, itemwise: [{ amountMinor: 600, participants: ["a", "b"] }] }), "itemwise: item totals mismatch -> invalid", "must total exactly");
  checkError(() => split({ method: "itemwise", totalMinor: 500, itemwise: [{ amountMinor: 500, participants: [] }] }), "itemwise: item with no participants -> invalid", "at least one participant");
  checkError(() => split({ method: "itemwise", totalMinor: 500, itemwise: [{ amountMinor: 0, participants: ["a"] }] }), "itemwise: zero item amount -> invalid");
  checkError(() => split({ method: "itemwise", totalMinor: 500, itemwise: [{ amountMinor: 250, participants: ["a", "a"] }, { amountMinor: 250, participants: ["b"] }] }), "itemwise: duplicate participants in an item -> invalid", "Duplicate participant");
}

/* ---------------- edge cases ---------------- */

{
  const r = split({ method: "equal", totalMinor: 1, equal: [{ userId: "a" }] });
  check(JSON.stringify(r) === JSON.stringify([{ userId: "a", amountMinor: 1 }]), "edge: 1 minor unit, 1 participant -> [1]");
  assertInvariant({ method: "equal", totalMinor: 1, equal: [{ userId: "a" }] }, "edge 1 unit 1 user");

  const oneUnitMany = split({ method: "equal", totalMinor: 1, equal: ["a", "b", "c"].map((u) => ({ userId: u })) });
  check(sum(oneUnitMany) === 1, "edge: 1 minor unit over 3 -> sums to 1");
  assertInvariant({ method: "equal", totalMinor: 1, equal: ["a", "b", "c"].map((u) => ({ userId: u })) }, "edge 1 unit 3 users");

  const manyUsers = split({ method: "equal", totalMinor: 100, equal: Array.from({ length: 37 }, (_, i) => ({ userId: `u${i}` })) });
  check(manyUsers.length === 37 && sum(manyUsers) === 100, "edge: 37 participants on 100 -> sums to 100");
  assertInvariant({ method: "equal", totalMinor: 100, equal: Array.from({ length: 37 }, (_, i) => ({ userId: `u${i}` })) }, "edge 37 users");

  const heavy = split({ method: "equal", totalMinor: 10000, equal: Array.from({ length: 7 }, (_, i) => ({ userId: `u${i}` })) });
  check(sum(heavy) === 10000, "edge: rounding-heavy equal over 7 -> sums exactly");
  assertInvariant({ method: "equal", totalMinor: 10000, equal: Array.from({ length: 7 }, (_, i) => ({ userId: `u${i}` })) }, "edge heavy rounding");

  const large = split({ method: "equal", totalMinor: 100_000_000_000, equal: Array.from({ length: 7 }, (_, i) => ({ userId: `u${i}` })) });
  check(sum(large) === 100_000_000_000, "edge: very large total stays exact");
  assertInvariant({ method: "equal", totalMinor: 100_000_000_000, equal: Array.from({ length: 7 }, (_, i) => ({ userId: `u${i}` })) }, "edge large total");

  checkError(() => split({ method: "equal", totalMinor: 0, equal: [{ userId: "a" }] }), "edge: total 0 -> invalid");
  checkError(() => split({ method: "equal", totalMinor: -5, equal: [{ userId: "a" }] }), "edge: negative total -> invalid");
  checkError(() => split({ method: "equal", totalMinor: 100, equal: [] }), "edge: empty participant list -> invalid");
  checkError(() => split({ method: "bogus", totalMinor: 100, equal: [{ userId: "a" }] }), "edge: unknown method -> invalid", "Unknown split method");
  checkError(() => split(null), "edge: null input -> invalid");
  checkError(() => split("nope"), "edge: non-object input -> invalid");
  checkError(() => split({ method: "equal", totalMinor: 100, equal: [{ userId: "" }] }), "edge: empty userId -> invalid");
  checkError(() => split({ method: "equal", totalMinor: 100, equal: [{ userId: "a" }, { userId: "a" }] }), "edge: duplicate userIds -> invalid", "Duplicate participant");
  checkError(() => split({ method: "percentage", totalMinor: 100, percentage: [{ userId: "a", percentage: 50 }, { userId: "a", percentage: 50 }] }), "edge: duplicate percentage userIds -> invalid");
  checkError(() => split({ method: "equal", totalMinor: 100, currency: "USD", equal: [{ userId: "a" }] }), "edge: unsupported currency -> invalid", "INR");
}

/* ---------------- determinism sweep ---------------- */

{
  const cases: unknown[] = [
    { method: "equal", totalMinor: 100, equal: ["a", "b", "c", "d", "e"].map((u) => ({ userId: u })) },
    { method: "quantity", totalMinor: 100, quantity: [{ userId: "a", quantity: 1 }, { userId: "b", quantity: 3 }, { userId: "c", quantity: 1 }] },
    { method: "percentage", totalMinor: 100, percentage: [{ userId: "a", percentage: 50 }, { userId: "b", percentage: 33.33 }, { userId: "c", percentage: 16.67 }] },
    { method: "shares", totalMinor: 100, shares: [{ userId: "a", shares: 5 }, { userId: "b", shares: 3 }] },
    { method: "exact", totalMinor: 100, exact: [{ userId: "a", amountMinor: 10 }, { userId: "b", amountMinor: 90 }] },
    {
      method: "itemwise",
      totalMinor: 100,
      itemwise: [
        { amountMinor: 1, participants: ["a", "b", "c"] },
        { amountMinor: 99, participants: ["b", "c", "d"] },
      ],
    },
  ];
  cases.forEach((c) => assertDeterministic(c, `determinism ${(c as SplitRequest).method}`));
}

/* ---------------- summary ---------------- */

console.log(`\nchecks passed: ${passCount.n}`);
if (failures > 0) {
  failuresList.forEach((line) => console.error(line));
  console.error(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log("ALL SPLITTING SELF-TESTS PASSED");

const verifyTotalPrint = (label: string, input: SplitRequest): void => {
  const shares = calculateShares(validateSplitInput(input));
  const total = shares.reduce((a, s) => a + s.amountMinor, 0);
  console.log(`  ${label}: ${JSON.stringify(shares)}  sum=${total}`);
};

console.log("\nsample results:");
verifyTotalPrint("equal 100/3", { method: "equal", totalMinor: 100, equal: ["a", "b", "c"].map((u) => ({ userId: u })) });
verifyTotalPrint("quantity 1:2 1000", { method: "quantity", totalMinor: 1000, quantity: [{ userId: "a", quantity: 1 }, { userId: "b", quantity: 2 }] });
verifyTotalPrint("pct 33.33/33.33/33.34 100", {
  method: "percentage",
  totalMinor: 100,
  percentage: [{ userId: "a", percentage: 33.33 }, { userId: "b", percentage: 33.33 }, { userId: "c", percentage: 33.34 }],
});
verifyTotalPrint("itemwise 600/400", {
  method: "itemwise",
  totalMinor: 1000,
  itemwise: [{ amountMinor: 600, participants: ["a", "b"] }, { amountMinor: 400, participants: ["b", "c"] }],
});