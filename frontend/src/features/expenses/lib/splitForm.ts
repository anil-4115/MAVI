/**
 * Shared split-form logic for expense and recurring-expense forms.
 *
 * Pure helpers only: value parsing, method-specific live stats, payload
 * building and field validation. React state lives in the calling form; the
 * presentational editor lives in `components/SplitEditor.tsx`. All amounts are
 * integer minor units (paise) and the backend stays authoritative for the
 * actual split math.
 */
import { formatMoney } from "../../../lib/money";
import { minorToRupeesText, parseRupeesToMinor } from "./input";
import type { ItemwiseItemInput, SplitMethod, SplitPayload } from "../api/expensesApi";

export interface EntryValues {
  quantity: string;
  exact: string;
  percentage: string;
  shares: string;
}

export interface ItemDraft {
  key: string;
  title: string;
  amountText: string;
  participantIds: string[];
}

export interface SplitFieldErrors {
  participants?: string | null;
  method?: string | null;
  entries?: string | null;
  items?: string | null;
}

export interface SplitMember {
  userId: string;
  name: string;
}

export const SPLIT_METHOD_LABELS: { id: SplitMethod; label: string }[] = [
  { id: "equal", label: "Equal" },
  { id: "quantity", label: "Quantity" },
  { id: "exact", label: "Exact amount" },
  { id: "percentage", label: "Percentage" },
  { id: "shares", label: "Shares" },
  { id: "itemwise", label: "By items" },
];

export const SPLIT_METHODS: SplitMethod[] = ["equal", "quantity", "exact", "percentage", "shares", "itemwise"];

export const emptyEntry = (): EntryValues => ({ quantity: "", exact: "", percentage: "", shares: "" });

export const createEmptyItem = (): ItemDraft => ({
  key: cryptoUniqueKey(),
  title: "",
  amountText: "",
  participantIds: [],
});

let keyCounter = 0;
export const cryptoUniqueKey = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  keyCounter += 1;
  return `item-${Date.now()}-${keyCounter}`;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readStringArray = (value: unknown): string[] | null => {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    return null;
  }
  return value as string[];
};

const readUserIdArray = (value: unknown): string[] | null => {
  if (!Array.isArray(value)) {
    return null;
  }
  const ids: string[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry["userId"] !== "string") {
      return null;
    }
    ids.push(entry["userId"] as string);
  }
  return ids;
};

export interface SeededSplit {
  method: SplitMethod;
  userIds: string[];
  entries: Record<string, EntryValues>;
  items: ItemDraft[];
}

/** Seed form state from a stored split request (e.g. an expense being edited). */
export function readEntryByMethod(
  splitInput: unknown,
): SeededSplit | null {
  if (!isRecord(splitInput)) {
    return null;
  }
  const method = splitInput["method"];
  if (typeof method !== "string" || !SPLIT_METHODS.includes(method as SplitMethod)) {
    return null;
  }
  const splitMethod = method as SplitMethod;

  if (splitMethod === "itemwise") {
    const rawItems = splitInput["itemwise"];
    if (!Array.isArray(rawItems)) {
      return null;
    }
    const items: ItemDraft[] = [];
    for (const item of rawItems) {
      if (!isRecord(item) || typeof item["amountMinor"] !== "number" || !Array.isArray(item["participants"])) {
        return null;
      }
      const participants = readStringArray(item["participants"]);
      if (!participants) {
        return null;
      }
      items.push({
        key: cryptoUniqueKey(),
        title: typeof item["title"] === "string" ? item["title"] : "",
        amountText: minorToRupeesText(item["amountMinor"] as number),
        participantIds: participants,
      });
    }
    return { method: splitMethod, userIds: [], entries: {}, items };
  }

  const userIds = readUserIdArray(splitInput[splitMethod]);
  if (!userIds) {
    return null;
  }
  const entries: Record<string, EntryValues> = {};
  for (const userId of userIds) {
    entries[userId] = emptyEntry();
  }
  return { method: splitMethod, userIds, entries, items: [] };
}

/* --------------------------- live split stats ----------------------------- */

export interface SplitStatsContext {
  amountMinor: number | null;
  selected: string[];
  entries: Record<string, EntryValues>;
  items: ItemDraft[];
}

export function exactStats(ctx: SplitStatsContext): { sum: number; centsRemain: number | null; entries: number[] } {
  let sum = 0;
  const entryValues: number[] = [];
  for (const userId of ctx.selected) {
    const parsed = parseRupeesToMinor(ctx.entries[userId]?.exact ?? "");
    if (parsed === null) {
      entryValues.push(0);
      continue;
    }
    sum += parsed;
    entryValues.push(parsed);
  }
  return {
    sum,
    centsRemain: ctx.amountMinor === null ? null : ctx.amountMinor - sum,
    entries: entryValues,
  };
}

export function percentageStats(ctx: SplitStatsContext): {
  sumBasis: number;
  remain: number;
  entries: { userId: string; pct: number | null }[];
} {
  const all = ctx.selected.map((userId) => ({
    userId,
    pct: /^\d{1,3}(\.\d{1,2})?$/.test(ctx.entries[userId]?.percentage ?? "")
      ? Number(ctx.entries[userId]?.percentage)
      : null,
  }));
  let sum = 0;
  for (const entry of all) {
    sum += entry.pct === null ? 0 : Math.round(entry.pct * 100);
  }
  return { sumBasis: sum, remain: 10000 - sum, entries: all };
}

export function itemwiseStats(ctx: SplitStatsContext): { sum: number | null; centsRemain: number | null } {
  let sum = 0;
  for (const item of ctx.items) {
    const parsed = parseRupeesToMinor(item.amountText);
    if (parsed === null) {
      return { sum: null, centsRemain: null };
    }
    sum += parsed;
  }
  return { sum, centsRemain: ctx.amountMinor === null ? null : ctx.amountMinor - sum };
}

/* ------------------------------ payload build ----------------------------- */

export function buildSplitPayload(
  method: SplitMethod,
  selected: string[],
  entries: Record<string, EntryValues>,
  items: ItemDraft[],
): SplitPayload {
  switch (method) {
    case "equal":
      return { method, equal: selected.map((userId) => ({ userId })) };
    case "quantity":
      return {
        method,
        quantity: selected.map((userId) => ({ userId, quantity: Number(entries[userId]?.quantity ?? 0) })),
      };
    case "exact":
      return {
        method,
        exact: selected.map((userId) => ({
          userId,
          amountMinor: parseRupeesToMinor(entries[userId]?.exact ?? "0") ?? 0,
        })),
      };
    case "percentage":
      return {
        method,
        percentage: selected.map((userId) => ({ userId, percentage: Number(entries[userId]?.percentage ?? 0) })),
      };
    case "shares":
      return {
        method,
        shares: selected.map((userId) => ({ userId, shares: Number(entries[userId]?.shares ?? 1) })),
      };
    case "itemwise": {
      const itemwise: ItemwiseItemInput[] = items.map((item) => ({
        title: item.title.trim() || undefined,
        amountMinor: parseRupeesToMinor(item.amountText) ?? 0,
        participants: item.participantIds,
      }));
      return { method, itemwise };
    }
  }
}

/* ------------------------------- validation ------------------------------- */

export interface ValidateSplitArgs extends SplitStatsContext {
  method: SplitMethod;
  currency: string;
}

/** Validate the split portion of a form; returns per-field messages. */
export function validateSplit(args: ValidateSplitArgs): SplitFieldErrors {
  const { method, currency, amountMinor, selected, entries, items } = args;
  const errors: SplitFieldErrors = {};

  if (selected.length === 0) {
    errors.participants = "Select at least one participant.";
  }

  switch (method) {
    case "equal":
      break;
    case "quantity": {
      let positive = 0;
      for (const userId of selected) {
        const raw = entries[userId]?.quantity ?? "";
        if (!/^\d+$/.test(raw) || Number(raw) < 0) {
          errors.entries = "Quantities must be whole numbers (0 or more).";
          break;
        }
        if (Number(raw) > 0) {
          positive += 1;
        }
      }
      if (!errors.entries && positive === 0) {
        errors.entries = "At least one quantity must be greater than 0.";
      }
      break;
    }
    case "exact": {
      if (amountMinor !== null) {
        const stats = exactStats(args);
        const allValid = selected.every((userId) => {
          const parsed = parseRupeesToMinor(entries[userId]?.exact ?? "");
          return parsed !== null && parsed >= 0;
        });
        if (!allValid) {
          errors.entries = "Enter a valid amount for every participant.";
        } else if (stats.sum !== amountMinor) {
          errors.entries = `Amounts must total ${formatMoney(amountMinor, currency)} (currently ${formatMoney(stats.sum, currency)}).`;
        }
      }
      break;
    }
    case "percentage": {
      const stats = percentageStats(args);
      const allValid = selected.every((userId) => {
        const raw = entries[userId]?.percentage ?? "";
        if (!/^\d{1,3}(\.\d{1,2})?$/.test(raw)) {
          return false;
        }
        const parsed = Number(raw);
        return parsed > 0 && parsed <= 100;
      });
      if (!allValid) {
        errors.entries = "Every participant needs a percentage between 0 and 100 (up to 2 decimals).";
      } else if (stats.sumBasis !== 10000) {
        errors.entries = `Percentages must total exactly 100% (currently ${(stats.sumBasis / 100).toFixed(2)}%).`;
      }
      break;
    }
    case "shares": {
      for (const userId of selected) {
        const raw = entries[userId]?.shares ?? "";
        if (!/^\d+$/.test(raw) || Number(raw) < 1) {
          errors.entries = "Shares must be positive whole numbers.";
          break;
        }
      }
      break;
    }
    case "itemwise": {
      if (items.length === 0) {
        errors.items = "Add at least one item.";
      } else if (amountMinor !== null) {
        const stats = itemwiseStats(args);
        const amountsValid = stats.sum !== null;
        const participantsValid = items.every((item) => item.participantIds.length > 0);
        if (!amountsValid) {
          errors.items = "Every item needs a valid amount greater than zero.";
        } else if (!participantsValid) {
          errors.items = "Every item needs at least one participant.";
        } else if (stats.sum !== amountMinor) {
          errors.items = `Item amounts must total ${formatMoney(amountMinor, currency)} (currently ${formatMoney(stats.sum ?? 0, currency)}).`;
        }
      }
      break;
    }
  }

  return errors;
}
