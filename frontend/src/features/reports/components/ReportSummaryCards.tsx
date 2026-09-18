import { formatMoney } from "../../../lib/money";
import type { ReportSummary } from "../api/reportsApi";

interface ReportSummaryCardsProps {
  summary: ReportSummary;
}

/** Aggregate figures for the applied report query (all values backend-derived). */
export function ReportSummaryCards({ summary }: ReportSummaryCardsProps) {
  const money = (amountMinor: number): string => formatMoney(amountMinor, summary.currency);
  const showGroupMetrics = summary.scope !== "personal";

  return (
    <div className="summary-grid reports-summary">
      <div className="summary-card">
        <p className="summary-card__label">Total spent</p>
        <p className="summary-card__value money">{money(summary.totalSpentMinor)}</p>
        <p className="summary-card__hint">
          {summary.expenseCount} expense{summary.expenseCount === 1 ? "" : "s"} in range
        </p>
      </div>

      <div className="summary-card">
        <p className="summary-card__label">Group spending</p>
        <p className="summary-card__value money">{money(summary.groupSpentMinor)}</p>
        <p className="summary-card__hint">
          {summary.groupExpenseCount} expense{summary.groupExpenseCount === 1 ? "" : "s"}
        </p>
      </div>

      <div className="summary-card">
        <p className="summary-card__label">Personal spending</p>
        <p className="summary-card__value money">{money(summary.personalSpentMinor)}</p>
        <p className="summary-card__hint">
          {summary.personalExpenseCount} expense{summary.personalExpenseCount === 1 ? "" : "s"}
        </p>
      </div>

      {showGroupMetrics && (
        <>
          <div className="summary-card">
            <p className="summary-card__label">You paid</p>
            <p className="summary-card__value money">{money(summary.paidMinor)}</p>
            <p className="summary-card__hint">Across selected groups</p>
          </div>

          <div className="summary-card">
            <p className="summary-card__label">Your share</p>
            <p className="summary-card__value money">{money(summary.owedMinor)}</p>
            <p className="summary-card__hint">Your portion of group expenses</p>
          </div>

          <div className="summary-card">
            <p className="summary-card__label">Your net position</p>
            <p
              className={`summary-card__value money${
                summary.netMinor > 0
                  ? " reports-net--positive"
                  : summary.netMinor < 0
                    ? " reports-net--negative"
                    : ""
              }`}
            >
              {money(summary.netMinor)}
            </p>
            <p className="summary-card__hint">
              {summary.netMinor > 0
                ? "You are owed overall (settlements applied)"
                : summary.netMinor < 0
                  ? "You owe overall (settlements applied)"
                  : "All settled up (settlements applied)"}
            </p>
          </div>

          <div className="summary-card">
            <p className="summary-card__label">Settlements</p>
            <p className="summary-card__value money">{money(summary.settlementTotalMinor)}</p>
            <p className="summary-card__hint">
              {summary.settlementCount} completed settlement{summary.settlementCount === 1 ? "" : "s"}
            </p>
          </div>
        </>
      )}
    </div>
  );
}