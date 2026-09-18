/**
 * Pure recurrence date engine.
 *
 * All recurrence math operates on `YYYY-MM-DD` "day keys" interpreted as UTC
 * calendar days. This matches the analytics/reports UTC convention and makes
 * recurrence deterministic regardless of server timezone. Generated expenses
 * are stamped with the occurrence day at UTC midnight.
 *
 * Month-end policy: CLAMP. Stepping one month from the 31st yields the last
 * day of the following month (e.g. Jan 31 -> Feb 28/29); the day is clamped
 * from the CURRENT occurrence, not the original anchor, so Feb 28 -> Mar 28.
 */
import { RECURRING_FREQUENCIES, type RecurringFrequency } from "./recurring.types.js";

const DAY_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True when `value` is a real `YYYY-MM-DD` calendar day (UTC). */
export function isValidDayKey(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = DAY_KEY_PATTERN.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;

  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/** Convert a validated day key to a UTC-midnight Date. */
export function dayKeyToUtcDate(dayKey: string): Date {
  const [year, month, day] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/** Convert an instant to its UTC calendar day key. */
export function utcDateToDayKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Today's UTC day key. */
export function todayUtcDayKey(now: Date = new Date()): string {
  return utcDateToDayKey(now);
}

/** Number of days in a month (monthIndex is 0-based). */
export function lastDayOfMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/** Add a whole number of days to a day key. */
export function addDays(dayKey: string, days: number): string {
  const date = dayKeyToUtcDate(dayKey);
  date.setUTCDate(date.getUTCDate() + days);
  return utcDateToDayKey(date);
}

/** Add months, clamping the day to the target month's length. */
export function addMonthsClamped(dayKey: string, months: number): string {
  const [year, month, day] = dayKey.split("-").map(Number);
  const totalMonths = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonthIndex = totalMonths % 12;
  const clampedDay = Math.min(day, lastDayOfMonth(targetYear, targetMonthIndex));
  const mm = String(targetMonthIndex + 1).padStart(2, "0");
  const dd = String(clampedDay).padStart(2, "0");
  return `${targetYear}-${mm}-${dd}`;
}

/** Add years, clamping Feb 29 to Feb 28 on non-leap target years. */
export function addYearsClamped(dayKey: string, years: number): string {
  const [year, month, day] = dayKey.split("-").map(Number);
  const targetYear = year + years;
  const clampedDay = Math.min(day, lastDayOfMonth(targetYear, month - 1));
  const mm = String(month).padStart(2, "0");
  const dd = String(clampedDay).padStart(2, "0");
  return `${targetYear}-${mm}-${dd}`;
}

/** Next occurrence strictly after `dayKey` for a cadence (interval defaults to 1). */
export function advanceOccurrence(
  dayKey: string,
  frequency: RecurringFrequency,
  interval = 1,
): string {
  switch (frequency) {
    case "daily":
      return addDays(dayKey, interval);
    case "weekly":
      return addDays(dayKey, 7 * interval);
    case "monthly":
      return addMonthsClamped(dayKey, interval);
    case "yearly":
      return addYearsClamped(dayKey, interval);
    default: {
      // Exhaustiveness guard for unexpected runtime input.
      throw new Error(`Unsupported frequency: ${String(frequency)}`);
    }
  }
}

/**
 * First occurrence on or after `targetDayKey`, aligned to the series that
 * starts at `startDayKey`. Used when creating/editing a rule so a start date in
 * the past resumes at the next valid occurrence (missed occurrences are never
 * backfilled).
 */
export function firstOccurrenceOnOrAfter(
  startDayKey: string,
  frequency: RecurringFrequency,
  interval: number,
  targetDayKey: string,
): string {
  let current = startDayKey;
  while (current < targetDayKey) {
    current = advanceOccurrence(current, frequency, interval);
  }
  return current;
}

export { RECURRING_FREQUENCIES };
export type { RecurringFrequency };
