import { formatDate } from "../../../lib/format";
import { formatMoney } from "../../../lib/money";
import type { ReportSummary } from "../api/reportsApi";

interface ReportTransactionsProps {
  summary: ReportSummary;
  limit?: number;
}

/** Compact preview of the authorized line items that CSV/PDF export. */
export function ReportTransactions({ summary, limit = 12 }: ReportTransactionsProps) {
  if (summary.transactions.length === 0) {
    return (
      <section className="card" aria-label="Transactions">
        <div className="card__header">
          <h3 className="card__title">Transactions</h3>
        </div>
        <p className="reports-muted">No transactions in this range.</p>
      </section>
    );
  }

  const visible = summary.transactions.slice(0, limit);
  const truncated = summary.transactions.length - visible.length;

  return (
    <section className="card" aria-label="Transactions">
      <div className="card__header">
        <h3 className="card__title">Transactions</h3>
        <span className="reports-muted">{summary.transactions.length} in range</span>
      </div>

      <ul className="reports-transactions">
        {visible.map((transaction) => (
          <li key={transaction.id} className="reports-transaction">
            <div className="reports-transaction__main">
              <span className="reports-transaction__title">{transaction.description}</span>
              <span className="reports-transaction__meta">
                {formatDate(transaction.date)} · {transaction.category} ·{" "}
                {transaction.groupName ?? "Personal"}
              </span>
            </div>
            <div className="reports-transaction__side">
              <span className="reports-transaction__amount money">
                {formatMoney(transaction.amountMinor, transaction.currency)}
              </span>
              <span className="reports-transaction__payer">Paid by {transaction.payerName}</span>
            </div>
          </li>
        ))}
      </ul>

      {truncated > 0 && (
        <p className="reports-transactions__note">
          Showing {visible.length} of {summary.transactions.length} — export CSV or PDF for the full list.
        </p>
      )}
    </section>
  );
}