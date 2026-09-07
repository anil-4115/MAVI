/**
 * Frontend money helpers.
 *
 * The backend stores money as integer minor units (paise for INR) and all
 * financial calculations happen server-side. The frontend only FORMATS those
 * integers for display — it never performs financial arithmetic. Converting
 * minor units to rupees is done with integer math only (not floats).
 */

/** Format an integer minor-unit amount as Indian-style rupees, e.g. ₹1,23,456.50. */
export function formatMoney(amountMinor: number, currency = "INR"): string {
  const sign = amountMinor < 0 ? "-" : "";
  const absolute = Math.abs(amountMinor);
  const rupees = Math.floor(absolute / 100);
  const paise = absolute % 100;

  const number = new Intl.NumberFormat("en-IN").format(rupees);
  const suffix = paise === 0 ? "" : `.${String(paise).padStart(2, "0")}`;
  const symbol = currency === "INR" ? "₹" : `${currency} `;

  return `${sign}${symbol}${number}${suffix}`;
}

/** Short money label used inside compact cards/badges, e.g. "₹1,23,456". */
export function formatMoneyCompact(amountMinor: number, currency = "INR"): string {
  return formatMoney(amountMinor, currency);
}