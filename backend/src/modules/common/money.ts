export const DEFAULT_CURRENCY = "INR" as const;

const CURRENCY_SYMBOLS: Record<string, string> = {
  INR: "\u20B9",
  USD: "$",
  EUR: "\u20AC",
};

/**
 * Largest-remainder allocation: distribute `total` integer units among `n`
 * participants using `weights` so that the sum of all shares equals exactly
 * `total`. All weights must be non-negative integers; at least one must be > 0.
 *
 * Algorithm:
 * 1. Compute exact (float) share for each participant: total * weight / sum.
 * 2. Floor every share.
 * 3. Distribute leftover units one-by-one to the participants with the
 *    largest fractional part, preserving a stable index order for ties
 *    (earlier participants win ties).
 */
export function allocateTotal(total: number, weights: number[]): number[] {
  if (!Number.isInteger(total) || total < 0) {
    throw new Error("Total must be a non-negative integer");
  }
  if (weights.length === 0) {
    throw new Error("Weights array must not be empty");
  }
  if (weights.some((w) => !Number.isInteger(w) || w < 0)) {
    throw new Error("All weights must be non-negative integers");
  }

  if (total === 0) return weights.map(() => 0);

  const weightSum = weights.reduce((a, b) => a + b, 0);
  if (weightSum === 0) {
    throw new Error("Sum of weights must be positive");
  }

  const shares = weights.map((w) => {
    const exact = (total * w) / weightSum;
    const floor = Math.floor(exact);
    return { floor, fraction: exact - floor };
  });

  let allocated = 0;
  const result = shares.map((s) => {
    allocated += s.floor;
    return s.floor;
  });

  const remaining = total - allocated;

  const indices = shares
    .map((_, i) => i)
    .sort((a, b) => shares[b].fraction - shares[a].fraction || a - b);

  for (let i = 0; i < remaining; i++) {
    result[indices[i]]++;
  }

  return result;
}

/**
 * Convert a decimal major-unit amount (e.g. "1050.50" rupees) into integer
 * minor units (paise). Accepts a number or string. Rejects non-positive values.
 *
 * String parsing avoids floating-point precision issues that arise from
 * `parseFloat("1050.50") * 100`.
 */
export function toMinorUnits(amount: number | string): number {
  let paise: number;

  if (typeof amount === "string") {
    const trimmed = amount.trim();
    if (trimmed === "") throw new Error("Amount must be a positive value");

    const sign = trimmed.startsWith("-") ? -1 : 1;
    const unsigned = sign === -1 ? trimmed.slice(1) : trimmed;
    const [rupeePart, paisePart] = unsigned.split(".");

    const rupees = parseInt(rupeePart ?? "0", 10) || 0;
    const rawPaise = paisePart !== undefined ? paisePart.padEnd(2, "0").slice(0, 2) : "00";
    const paiseDigits = parseInt(rawPaise, 10) || 0;

    paise = sign * (rupees * 100 + paiseDigits);
  } else {
    paise = Math.round(amount * 100);
  }

  if (!Number.isInteger(paise) || paise <= 0) {
    throw new Error("Amount must be a positive value in minor units");
  }

  return paise;
}

/**
 * Validate that `value` is a positive integer suitable as an amount in minor
 * units (paise / cents). Throws otherwise.
 */
export function validateMinorUnits(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error("Amount must be a positive integer in minor units (paise)");
  }
  return value;
}

/**
 * Format minor units for display: "₹1,050.50".
 */
export function formatMinorUnits(amountMinor: number, currency: string = DEFAULT_CURRENCY): string {
  const major = Math.floor(amountMinor / 100);
  const minor = amountMinor % 100;
  const symbol = CURRENCY_SYMBOLS[currency] ?? `${currency} `;

  const majorStr = major.toLocaleString("en-IN");
  return `${symbol}${majorStr}.${minor.toString().padStart(2, "0")}`;
}

/**
 * Parse a search-query string into a safe, trimmed regex-ready literal.
 * Escapes all special characters so user input cannot create regex patterns.
 */
export function escapeRegexLiteral(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
