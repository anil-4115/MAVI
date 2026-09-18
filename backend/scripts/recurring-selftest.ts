/**
 * Offline self-tests for the recurring-expense engine (no DB, no HTTP).
 *
 * Covers:
 *   - Day-key validation and UTC conversions.
 *   - Month/year clamping (month-end policy) and cadence advances.
 *   - Missed-occurrence skipping via firstOccurrenceOnOrAfter.
 *   - Deterministic split reproduction: a stored rule split re-validated and
 *     re-computed produces byte-identical shares.
 *
 *   npx tsx scripts/recurring-selftest.ts
 */
import { allocateTotal } from "../src/modules/common/money.js";
import { calculateShares } from "../src/modules/splitting/splitting.js";
import { SplitValidationError, type SplitRequest } from "../src/modules/splitting/splitting.types.js";
import { validateSplitPayload } from "../src/modules/expenses/expense.validation.js";
import {
  addDays,
  addMonthsClamped,
  addYearsClamped,
  advanceOccurrence,
  dayKeyToUtcDate,
  firstOccurrenceOnOrAfter,
  isValidDayKey,
  lastDayOfMonth,
  todayUtcDayKey,
  utcDateToDayKey,
} from "../src/modules/recurring/recurrence.js";

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

const eq = (actual: unknown, expected: unknown, label: string): void => {
  check(actual === expected, `${label} (expected ${String(expected)}, got ${String(actual)})`);
};

/* ------------------------- 1. day-key validation -------------------------- */
{
  check(isValidDayKey("2024-02-29"), "validDayKey: leap day accepted");
  check(!isValidDayKey("2023-02-29"), "validDayKey: non-leap Feb 29 rejected");
  check(!isValidDayKey("2024-04-31"), "validDayKey: Apr 31 rejected");
  check(!isValidDayKey("2024-13-01"), "validDayKey: month 13 rejected");
  check(!isValidDayKey("2024-00-10"), "validDayKey: month 0 rejected");
  check(!isValidDayKey("2024-2-9"), "validDayKey: unpadded rejected");
  check(!isValidDayKey(""), "validDayKey: empty rejected");
  check(!isValidDayKey(null), "validDayKey: null rejected");
  check(!isValidDayKey(20240101), "validDayKey: number rejected");
}

/* --------------------- 2. UTC day-key conversions ------------------------- */
{
  eq(dayKeyToUtcDate("2024-03-15").toISOString(), "2024-03-15T00:00:00.000Z", "convert: dayKey -> UTC midnight");
  eq(utcDateToDayKey(new Date("2024-03-15T23:59:59.999Z")), "2024-03-15", "convert: UTC instant -> dayKey");
  eq(utcDateToDayKey(new Date("2024-03-15T00:00:00.000Z")), "2024-03-15", "convert: exact midnight -> dayKey");
  eq(todayUtcDayKey(new Date("2025-01-02T00:30:00.000Z")), "2025-01-02", "convert: todayUtcDayKey from instant");
  eq(lastDayOfMonth(2024, 1), 29, "convert: Feb 2024 length");
  eq(lastDayOfMonth(2023, 1), 28, "convert: Feb 2023 length");
  eq(lastDayOfMonth(2024, 0), 31, "convert: Jan length");
}

/* --------------------------- 3. add days ---------------------------------- */
{
  eq(addDays("2024-12-31", 1), "2025-01-01", "addDays: year rollover");
  eq(addDays("2024-03-01", -1), "2024-02-29", "addDays: negative into leap Feb");
  eq(addDays("2024-01-01", 366), "2025-01-01", "addDays: across leap year");
}

/* ---------------------- 4. monthly clamping policy ------------------------ */
{
  eq(addMonthsClamped("2024-01-31", 1), "2024-02-29", "monthly: Jan31 -> leap Feb29");
  eq(addMonthsClamped("2023-01-31", 1), "2023-02-28", "monthly: Jan31 -> Feb28");
  eq(addMonthsClamped("2024-02-29", 1), "2024-03-29", "monthly: clamp from CURRENT day (Feb29 -> Mar29)");
  eq(addMonthsClamped("2024-03-31", 1), "2024-04-30", "monthly: Mar31 -> Apr30");
  eq(addMonthsClamped("2024-01-31", 2), "2024-03-31", "monthly: Jan31 +2 -> Mar31");
  eq(addMonthsClamped("2024-01-15", 12), "2025-01-15", "monthly: +12 months keeps day");
  // Chained clamp reproduces the documented Feb 28 -> Mar 28 behavior.
  eq(addMonthsClamped(addMonthsClamped("2024-01-31", 1), 1), "2024-03-29", "monthly: chained clamp");
}

/* ---------------------- 5. yearly clamping policy ------------------------- */
{
  eq(addYearsClamped("2024-02-29", 1), "2025-02-28", "yearly: leap day -> Feb28");
  eq(addYearsClamped("2024-02-29", 4), "2028-02-29", "yearly: leap day -> next leap day");
  eq(addYearsClamped("2024-06-15", 1), "2025-06-15", "yearly: normal day preserved");
}

/* ---------------------- 6. advanceOccurrence cadences --------------------- */
{
  eq(advanceOccurrence("2024-01-01", "daily"), "2024-01-02", "advance: daily");
  eq(advanceOccurrence("2024-01-01", "weekly"), "2024-01-08", "advance: weekly");
  eq(advanceOccurrence("2024-01-31", "monthly"), "2024-02-29", "advance: monthly clamps");
  eq(advanceOccurrence("2024-02-29", "yearly"), "2025-02-28", "advance: yearly clamps");
  eq(advanceOccurrence("2024-01-01", "daily", 1), "2024-01-02", "advance: interval=1 explicit");
}

/* ---------------- 7. missed-occurrence skip / first on-or-after ----------- */
{
  eq(
    firstOccurrenceOnOrAfter("2024-01-01", "daily", 1, "2024-01-05"),
    "2024-01-05",
    "firstOnOrAfter: daily catches up to today",
  );
  eq(
    firstOccurrenceOnOrAfter("2024-01-01", "weekly", 1, "2024-01-10"),
    "2024-01-15",
    "firstOnOrAfter: weekly respects anchor weekday",
  );
  eq(
    firstOccurrenceOnOrAfter("2024-01-31", "monthly", 1, "2024-03-05"),
    "2024-03-29",
    "firstOnOrAfter: monthly clamps through missed months",
  );
  eq(
    firstOccurrenceOnOrAfter("2025-01-01", "daily", 1, "2024-12-31"),
    "2025-01-01",
    "firstOnOrAfter: future start preserved",
  );
  eq(
    firstOccurrenceOnOrAfter("2024-06-10", "monthly", 1, "2024-06-10"),
    "2024-06-10",
    "firstOnOrAfter: start === today returns start",
  );

  // Simulate the scheduler skip loop: walk forward without generating until
  // the occurrence meets/exceeds today.
  let next = "2024-01-01";
  const today = "2024-01-05";
  while (next < today) next = advanceOccurrence(next, "daily", 1);
  eq(next, today, "skip: daily walk lands on today (generate)");

  let weekly = "2024-01-01";
  while (weekly < "2024-01-10") weekly = advanceOccurrence(weekly, "weekly", 1);
  eq(weekly, "2024-01-15", "skip: weekly walk overshoots (no generation)");
}

/* ------------- 8. deterministic split reproduction ------------------------ */
{
  const U1 = "64b000000000000000000001";
  const U2 = "64b000000000000000000002";
  const U3 = "64b000000000000000000003";
  const raw = {
    method: "exact",
    exact: [
      { userId: U1, amountMinor: 300 },
      { userId: U2, amountMinor: 700 },
    ],
  };
  const stored = validateSplitPayload(raw, 1000, "INR");
  // Re-validating the already-stored split (as the generator does) must be stable.
  const revalidated = validateSplitPayload(stored, 1000, "INR");
  const sharesA = calculateShares(stored);
  const sharesB = calculateShares(revalidated);
  eq(JSON.stringify(sharesA), JSON.stringify(sharesB), "split: re-validated split reproduces identical shares");

  const equal: SplitRequest = {
    method: "equal",
    totalMinor: 1000,
    currency: "INR",
    equal: [{ userId: U1 }, { userId: U2 }, { userId: U3 }],
  };
  const equalShares = calculateShares(equal).map((s) => s.amountMinor);
  eq(JSON.stringify(equalShares), JSON.stringify([334, 333, 333]), "split: equal allocates largest remainder");
  eq(
    JSON.stringify(allocateTotal(1000, [1, 1, 1])),
    JSON.stringify([334, 333, 333]),
    "split: allocateTotal is deterministic",
  );

  const percentage: SplitRequest = {
    method: "percentage",
    totalMinor: 1000,
    currency: "INR",
    percentage: [
      { userId: U1, percentage: 33.33 },
      { userId: U2, percentage: 33.33 },
      { userId: U3, percentage: 33.34 },
    ],
  };
  const pShares = calculateShares(percentage);
  eq(
    pShares.reduce((a, s) => a + s.amountMinor, 0),
    1000,
    "split: percentage shares sum to total",
  );
  eq(
    JSON.stringify(calculateShares(percentage)),
    JSON.stringify(pShares),
    "split: percentage reproduction is stable",
  );

  // Stored split re-validated against a CHANGED amount must fail for fixed-sum
  // methods, so rule edits cannot silently produce invalid splits.
  let exactRejected = false;
  try {
    validateSplitPayload(stored, 500, "INR");
  } catch (err) {
    exactRejected = err instanceof Error;
  }
  check(exactRejected, "split: exact split rejected when amount changes");
}

/* --------------------- 9. split validator error type ---------------------- */
{
  let splitError = false;
  try {
    validateSplitPayload({ method: "equal", equal: [] }, 100, "INR");
  } catch (err) {
    splitError = err instanceof SplitValidationError || err instanceof Error;
  }
  check(splitError, "split: invalid payload throws");
}

console.log("PASS=" + passCount.n + " FAIL=" + failures);
if (failures > 0) {
  failuresList.forEach((f) => console.log(f));
  process.exit(1);
}
