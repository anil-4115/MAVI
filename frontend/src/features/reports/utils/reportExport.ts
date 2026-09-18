import { toCsvWithHeader } from "../../../lib/csv";
import { asciiMoney, type PdfLine } from "../../../lib/pdf";
import type { ReportSummary } from "../api/reportsApi";

/**
 * Maps an authorized ReportSummary (backend-aggregated integers) onto export
 * artifacts. No money is computed here — only rendering of the integers the
 * API returned, so exports can never disagree with the on-screen report.
 */

export const CSV_HEADER = [
  "Date",
  "Description",
  "Category",
  "Type",
  "Group",
  "Payer",
  "Amount",
  "Currency",
  "Split Method",
] as const;

export function reportToCsv(summary: ReportSummary): string {
  const rows = summary.transactions.map((transaction) => [
    transaction.date.slice(0, 10),
    transaction.description,
    transaction.category,
    transaction.type === "group" ? "Group" : "Personal",
    transaction.groupName ?? (transaction.type === "group" ? "Unknown group" : "Personal"),
    transaction.payerName,
    (transaction.amountMinor / 100).toFixed(2),
    transaction.currency,
    transaction.splitMethod,
  ]);
  return toCsvWithHeader([...CSV_HEADER], rows);
}

/**
 * Report summary rendered as PDF text lines. Amounts use the ASCII money
 * formatter (`Rs ...`) because the built-in PDF fonts cannot render the rupee
 * glyph.
 */
export function reportToPdfLines(summary: ReportSummary): PdfLine[] {
  const money = (amountMinor: number): string => asciiMoney(amountMinor, summary.currency);
  const scopeLabel =
    summary.scope === "group" && summary.groupName
      ? `Group · ${summary.groupName}`
      : summary.scope === "group"
        ? "Group"
        : summary.scope === "personal"
          ? "Personal"
          : "All spending";

  const lines: PdfLine[] = [
    { text: "MAVI - Financial Report", size: "title", style: "bold" },
    { text: `${scopeLabel} | ${summary.range.from} to ${summary.range.to}` },
    { text: " ", size: "body" },
    { text: "Overview", size: "section", style: "bold" },
    { text: `Total spending: ${money(summary.totalSpentMinor)}` },
    { text: `Group spending: ${money(summary.groupSpentMinor)} (${summary.groupExpenseCount} expenses)` },
    { text: `Personal spending: ${money(summary.personalSpentMinor)} (${summary.personalExpenseCount} expenses)` },
    { text: `Expenses in range: ${summary.expenseCount}` },
  ];

  if (summary.scope !== "personal") {
    lines.push(
      { text: `You paid: ${money(summary.paidMinor)}` },
      { text: `Your share: ${money(summary.owedMinor)}` },
      { text: `Net position (settlements applied): ${money(summary.netMinor)}` },
      {
        text: `Settlements: ${summary.settlementCount} completed, ${money(summary.settlementTotalMinor)}`,
      },
    );
  }

  lines.push({ text: " ", size: "body" }, { text: "Spending by category", size: "section", style: "bold" });
  if (summary.categories.length === 0) {
    lines.push({ text: "No categorized spending in this range." });
  } else {
    for (const category of summary.categories) {
      lines.push({ text: `${category.category}: ${money(category.amountMinor)} (${category.expenseCount})` });
    }
  }

  if (summary.scope !== "personal" && summary.groups.length > 0) {
    lines.push({ text: " ", size: "body" }, { text: "Group breakdown", size: "section", style: "bold" });
    for (const group of summary.groups) {
      lines.push({ text: `${group.archived ? "[Archived] " : ""}${group.groupName}`, style: "bold" });
      lines.push({ text: `  Spent: ${money(group.spentMinor)} across ${group.expenseCount} expenses` });
      lines.push(
        { text: `  You paid: ${money(group.myPaidMinor)} | Your share: ${money(group.myOwedMinor)} | Net: ${money(group.myNetMinor)}` },
      );
      lines.push(
        { text: `  Settlements: ${group.settlementCount} completed, ${money(group.settlementTotalMinor)}` },
      );
    }
  }

  lines.push({ text: " ", size: "body" }, { text: "Transactions", size: "section", style: "bold" });
  if (summary.transactions.length === 0) {
    lines.push({ text: "No transactions in this range." });
  } else {
    for (const transaction of summary.transactions) {
      const where = transaction.groupName ?? "Personal";
      lines.push({
        text: `${transaction.date.slice(0, 10)} | ${transaction.description} | ${where} | ${transaction.payerName} | ${money(transaction.amountMinor)}`,
      });
    }
  }

  return lines;
}