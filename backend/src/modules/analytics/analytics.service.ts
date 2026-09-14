import { Types } from "mongoose";
import { Group, type GroupDocument } from "../groups/group.model.js";
import { Expense } from "../expenses/expense.model.js";
import { User } from "../auth/auth.model.js";
import { DEFAULT_CURRENCY } from "../common/money.js";
import type {
  CategorySpend,
  MonthSpend,
  SpendingAnalytics,
  SpendingCategory,
  TopSpender,
} from "./analytics.types.js";

export const VALID_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

const MONTHS_TO_COMPARE = 6;
const TOP_SPENDER_LIMIT = 6;

export function currentMonthUtc(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function monthStartUtc(monthKey: string): Date {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1));
}

function monthEndUtc(monthKey: string): Date {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(year, month, 1));
}

/** Shift a "YYYY-MM" key backwards by `count` months (UTC-safe). */
export function shiftMonth(monthKey: string, count: number): string {
  const start = monthStartUtc(monthKey);
  const shifted = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - count, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

/* ---------------------- category classification ---------------------- */

const CATEGORY_KEYWORDS: { category: SpendingCategory; keywords: string[] }[] = [
  {
    category: "Food & Drinks",
    keywords: [
      "food", "restaurant", "cafe", "coffee", "lunch", "dinner", "breakfast", "snack",
      "pizza", "tiffin", "grocer", "swiggy", "zomato", "bar", "drinks", "sweet",
      "bakery", "milk", "tea", "juice", "biryani", "street", "chai", "dhaba",
    ],
  },
  {
    category: "Travel",
    keywords: [
      "travel", "trip", "uber", "ola", "cab", "taxi", "flight", "train", "bus",
      "fuel", "petrol", "diesel", "metro", "auto", "hotel", "holiday", "tour",
      "parking", "airport", "goa", "ride", "yatra",
    ],
  },
  {
    category: "Shopping",
    keywords: [
      "shop", "mall", "clothes", "dress", "amazon", "flipkart", "electronics",
      "gadget", "mobile", "shoe", "gift", "watch", "market", "t-shirt", "bag",
      "shoes", "saree", "kurta", "jeweller", "furniture",
    ],
  },
  {
    category: "Bills",
    keywords: [
      "bill", "electricity", "water", "internet", "wifi", "rent", "emi", "recharge",
      "insurance", "subscription", "phone", "broadband", "tax", "maintenance",
      "society", "scheme", "loan", "upi",
    ],
  },
  {
    category: "Entertainment",
    keywords: [
      "movie", "netflix", "prime", "spotify", "game", "gaming", "concert", "party",
      "fun", "outing", "amusement", "book", "theatre", "cinema", "show", "match",
      "cricket", "music", "pub",
    ],
  },
];

const CATEGORY_ORDER: SpendingCategory[] = [
  "Food & Drinks",
  "Travel",
  "Shopping",
  "Bills",
  "Entertainment",
  "Others",
];

export function classifySpendingCategory(title: string): SpendingCategory {
  const normalized = title.trim().toLowerCase();
  for (const entry of CATEGORY_KEYWORDS) {
    if (entry.keywords.some((keyword) => normalized.includes(keyword))) {
      return entry.category;
    }
  }
  return "Others";
}

export function orderedCategories(): SpendingCategory[] {
  return [...CATEGORY_ORDER];
}

/* ------------------------------ service ------------------------------ */

interface MonthlyAgg {
  _id: { month: string; category: SpendingCategory };
  amountMinor: number;
}

interface TopSpenderAgg {
  _id: Types.ObjectId;
  amountMinor: number;
}

/**
 * Read-only spending analytics for the actor: total spent in the requested
 * month (personal expenses + the actor's share of group expenses in their
 * active groups), category breakdown, the last six months' totals, and the
 * top spenders in the actor's groups for that month. Everything is aggregated
 * server-side from authoritative expense records; no figures are fabricated.
 */
export async function getSpendingAnalytics(
  actorId: string,
  monthKey: string
): Promise<SpendingAnalytics> {
  const actorObjectId = new Types.ObjectId(actorId);
  const activeGroups = (await Group.find({
    archived: false,
    members: { $elemMatch: { userId: actorObjectId, status: "active" } },
  }).select("_id")) as unknown as Pick<GroupDocument, "_id">[];

  const activeGroupIds = activeGroups.map((g) => g._id as Types.ObjectId);

  const compareStartKey = shiftMonth(monthKey, MONTHS_TO_COMPARE - 1);
  const rangeStart = monthStartUtc(compareStartKey);
  const rangeEnd = monthEndUtc(monthKey);

  const personalFilter = {
    group: null,
    createdBy: actorObjectId,
    voided: { $ne: true },
    expenseDate: { $gte: rangeStart, $lt: rangeEnd },
  };

  const groupFilter = {
    group: { $in: activeGroupIds },
    voided: { $ne: true },
    expenseDate: { $gte: rangeStart, $lt: rangeEnd },
  };

  /* Category derivation is done in JS from titles (deterministic mapping),
     so rows are pulled once per stream and aggregated below. */
  const personalRows = await aggregateByMonthCategory(personalFilter);
  const groupRows = await aggregateGroupShareByMonthCategory(actorId, groupFilter);

  const monthlyTotals = new Map<string, number>();
  const categoryTotals = new Map<SpendingCategory, number>();
  for (const { _id, amountMinor } of [...personalRows, ...groupRows]) {
    monthlyTotals.set(_id.month, (monthlyTotals.get(_id.month) ?? 0) + amountMinor);
    if (_id.month === monthKey) {
      categoryTotals.set(_id.category, (categoryTotals.get(_id.category) ?? 0) + amountMinor);
    }
  }

  const byMonth: MonthSpend[] = [];
  for (let offset = MONTHS_TO_COMPARE - 1; offset >= 0; offset -= 1) {
    const key = shiftMonth(monthKey, offset);
    byMonth.push({ month: key, totalMinor: monthlyTotals.get(key) ?? 0 });
  }

  const categories: CategorySpend[] = orderedCategories()
    .map((category) => ({ category, amountMinor: categoryTotals.get(category) ?? 0 }))
    .filter((entry) => entry.amountMinor > 0);

  const topSpenderAggs = await Expense.aggregate<TopSpenderAgg>([
    {
      $match: {
        group: { $in: activeGroupIds },
        voided: { $ne: true },
        expenseDate: { $gte: monthStartUtc(monthKey), $lt: monthEndUtc(monthKey) },
      },
    },
    { $unwind: "$participantShares" },
    {
      $group: {
        _id: "$participantShares.userId",
        amountMinor: { $sum: "$participantShares.amountMinor" },
      },
    },
    { $sort: { amountMinor: -1 } },
    { $limit: TOP_SPENDER_LIMIT },
  ]);

  const userNames = new Map<string, string>();
  if (topSpenderAggs.length > 0) {
    const users = await User.find({
      _id: { $in: topSpenderAggs.map((entry) => entry._id) },
    }).select("name").lean();
    for (const user of users) {
      userNames.set(user._id.toString(), user.name);
    }
  }

  const topSpenders: TopSpender[] = topSpenderAggs.map((entry, index) => ({
    userId: entry._id.toString(),
    name: userNames.get(entry._id.toString()) ?? "Member",
    amountMinor: entry.amountMinor,
    rank: index + 1,
  }));

  return {
    month: monthKey,
    currency: DEFAULT_CURRENCY,
    totalSpentMinor: monthlyTotals.get(monthKey) ?? 0,
    categories,
    byMonth,
    topSpenders,
  };
}

/** Derive month + category per personal expense (JS-side category mapping). */
async function aggregateByMonthCategory(filter: Record<string, unknown>): Promise<MonthlyAgg[]> {
  const expenses = await Expense.find(filter).select("title amountMinor expenseDate").lean();
  const result = new Map<string, { amountMinor: number }>();
  for (const expense of expenses) {
    const month = `${expense.expenseDate.getUTCFullYear()}-${String(expense.expenseDate.getUTCMonth() + 1).padStart(2, "0")}`;
    const category = classifySpendingCategory(expense.title);
    const key = `${month}|${category}`;
    result.set(key, { amountMinor: (result.get(key)?.amountMinor ?? 0) + expense.amountMinor });
  }
  return [...result.entries()].map(([key, value]) => {
    const [month, category] = key.split("|");
    return { _id: { month, category: category as SpendingCategory }, amountMinor: value.amountMinor };
  });
}

/** Derive month + category for the actor's share of group expenses. */
async function aggregateGroupShareByMonthCategory(
  actorId: string,
  filter: Record<string, unknown>
): Promise<MonthlyAgg[]> {
  const expenses = await Expense.find(filter)
    .select("title amountMinor expenseDate participantShares")
    .lean();
  const result = new Map<string, { amountMinor: number }>();
  for (const expense of expenses) {
    const mine = expense.participantShares?.find((s) => s.userId.toString() === actorId);
    if (!mine) {
      continue;
    }
    const month = `${expense.expenseDate.getUTCFullYear()}-${String(expense.expenseDate.getUTCMonth() + 1).padStart(2, "0")}`;
    const category = classifySpendingCategory(expense.title);
    const key = `${month}|${category}`;
    result.set(key, { amountMinor: (result.get(key)?.amountMinor ?? 0) + mine.amountMinor });
  }
  return [...result.entries()].map(([key, value]) => {
    const [month, category] = key.split("|");
    return { _id: { month, category: category as SpendingCategory }, amountMinor: value.amountMinor };
  });
}