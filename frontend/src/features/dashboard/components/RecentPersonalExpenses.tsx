import { EmptyState } from "../../../components/ui/EmptyState";
import { formatRelativeTime } from "../../../lib/format";
import { formatMoney } from "../../../lib/money";
import type { RecentPersonalExpenseSummary } from "../api/dashboardApi";

interface RecentPersonalExpensesProps {
  expenses: RecentPersonalExpenseSummary[];
}

export function RecentPersonalExpenses({ expenses }: RecentPersonalExpensesProps) {
  if (expenses.length === 0) {
    return (
      <section className="section" aria-label="Recent personal expenses">
        <h2 className="section__title">Recent personal expenses</h2>
        <EmptyState title="No personal expenses yet" description="Personal expenses you record will show up here." />
      </section>
    );
  }

  return (
    <section className="section" aria-label="Recent personal expenses">
      <h2 className="section__title">Recent personal expenses</h2>
      <ul className="rows">
        {expenses.map((expense) => (
          <li key={expense.id} className="row">
            <div>
              <p className="row__primary">{expense.title}</p>
              <p className="row__secondary">{formatRelativeTime(expense.expenseDate)}</p>
            </div>
            <p className="row__meta">{formatMoney(expense.amountMinor, expense.currency)}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}