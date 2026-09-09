/**
 * Expense input helpers.
 *
 * Money stays integer minor units (paise) everywhere. The only transformation
 * below converts a user-typed rupee string ("500.50") into minor units using
 * integer arithmetic — no floats, no financial calculation. The backend is
 * still authoritative for split math.
 */

/** Parse "500", "500.50", ".50", "500." into integer minor units (paise). Returns null when invalid. */
export function parseRupeesToMinor(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") {
    return null;
  }
  if (!/^\d+(\.\d{0,2})?$/.test(trimmed)) {
    return null;
  }
  const [whole, fraction = ""] = trimmed.split(".");
  const wholeMinor = Number(whole) * 100;
  if (!Number.isSafeInteger(wholeMinor)) {
    return null;
  }
  const fractionMinor = fraction === "" ? 0 : Number(fraction.padEnd(2, "0"));
  return wholeMinor + fractionMinor;
}

/** Minor units -> plain editable rupee text ("50050" -> "500.50", "50000" -> "500"). */
export function minorToRupeesText(amountMinor: number): string {
  const absolute = Math.abs(Math.floor(amountMinor));
  const rupees = Math.floor(absolute / 100);
  const paise = absolute % 100;
  return paise === 0 ? String(rupees) : `${rupees}.${String(paise).padStart(2, "0")}`;
}

/** Date -> "YYYY-MM-DD" for <input type="date">. */
export function toDateInputValue(date: Date | string): string {
  const parsed = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** "YYYY-MM-DD" from a date input -> ISO string for the backend. */
export function fromDateInputValue(value: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return undefined;
  }
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  return date.toISOString();
}

/** Today's local date as "YYYY-MM-DD". */
export function todayDateInputValue(): string {
  return toDateInputValue(new Date());
}