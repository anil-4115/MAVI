import { Link } from "react-router-dom";
import { EmptyState } from "../../../components/ui/EmptyState";
import { formatRelativeTime } from "../../../lib/format";
import { formatMoney } from "../../../lib/money";
import type { RecentGroupExpenseSummary } from "../api/dashboardApi";

interface RecentGroupExpensesProps {
  expenses: RecentGroupExpenseSummary[];
}

export function RecentGroupExpenses({ expenses }: RecentGroupExpensesProps) {
  if (expenses.length === 0) {
    return (
      <section className="section" aria-label="Recent group expenses">
        <h2 className="section__title">Recent group expenses</h2>
        <EmptyState title="No group expenses yet" description="Expenses you split with groups will show up here." />
      </section>
    );
  }

  return (
    <section className="section" aria-label="Recent group expenses">
      <h2 className="section__title">Recent group expenses</h2>
      <ul className="rows">
        {expenses.map((expense) => (
          <li key={expense.id}>
            <Link className="row row--link" to={`/groups/${expense.groupId}`}>
              <div>
                <p className="row__primary">{expense.title}</p>
                <p className="row__secondary">
                  {expense.groupName} · {formatRelativeTime(expense.expenseDate)}
                </p>
              </div>
              <p className="row__meta">{formatMoney(expense.amountMinor, expense.currency)}</p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}