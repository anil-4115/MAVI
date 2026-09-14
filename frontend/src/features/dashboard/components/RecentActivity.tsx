import { Link } from "react-router-dom";
import { EmptyState } from "../../../components/ui/EmptyState";
import { Icon, type IconName } from "../../../components/ui/Icon";
import { formatRelativeTime } from "../../../lib/format";
import { formatMoney } from "../../../lib/money";
import type {
  DashboardGroupOverview,
  RecentGroupExpenseSummary,
  RecentPersonalExpenseSummary,
  SettlementView,
} from "../api/dashboardApi";

interface RecentActivityProps {
  groupExpenses: RecentGroupExpenseSummary[];
  personalExpenses: RecentPersonalExpenseSummary[];
  settlements: SettlementView[];
  groups: DashboardGroupOverview[];
  currentUserId: string | null;
}

type ActivityEntry = {
  id: string;
  title: string;
  caption: string;
  badge: string;
  icon: IconName;
  amountMinor: number;
  currency: string;
  href: string;
  tone: "neutral" | "negative" | "positive";
  sortKey: number;
};

function renderEntries(entries: ActivityEntry[]): ActivityEntry[] {
  return [...entries].sort((a, b) => b.sortKey - a.sortKey);
}

export function RecentActivity({
  groupExpenses,
  personalExpenses,
  settlements,
  groups,
  currentUserId,
}: RecentActivityProps) {
  const groupNameById = new Map(groups.map((group) => [group.id, group.name]));

  const entries: ActivityEntry[] = [
    ...personalExpenses.map(
      (expense): ActivityEntry => ({
        id: `p-${expense.id}`,
        title: expense.title,
        caption: formatRelativeTime(expense.expenseDate),
        badge: "Personal",
        icon: "expenses",
        amountMinor: expense.amountMinor,
        currency: expense.currency,
        href: "/expenses/personal",
        tone: "negative",
        sortKey: new Date(expense.expenseDate).getTime(),
      }),
    ),
    ...groupExpenses.map(
      (expense): ActivityEntry => ({
        id: `g-${expense.id}`,
        title: expense.title,
        caption:
          expense.payerId === currentUserId
            ? `You paid · ${expense.groupName} · ${formatRelativeTime(expense.expenseDate)}`
            : `${expense.groupName} · ${formatRelativeTime(expense.expenseDate)}`,
        badge: "Group",
        icon: "groups",
        amountMinor: expense.amountMinor,
        currency: expense.currency,
        href: `/groups/${expense.groupId}`,
        tone: "neutral",
        sortKey: new Date(expense.expenseDate).getTime(),
      }),
    ),
    ...settlements.map(
      (settlement, index): ActivityEntry => {
        const received = settlement.payerId === currentUserId ? "You paid" : "You received";
        return {
          id: `s-${settlement.payerId}-${settlement.receiverId}-${index}`,
          title: `${received} ${formatMoney(settlement.amountMinor)}`,
          caption: `Settlement · ${groupNameById.get(settlement.groupId) ?? "Group"}`,
          badge: "Settlement",
          icon: "settlements",
          amountMinor: settlement.payerId === currentUserId ? -settlement.amountMinor : settlement.amountMinor,
          currency: "INR",
          href: groupNameById.has(settlement.groupId) ? `/groups/${settlement.groupId}` : "/balances",
          tone: settlement.payerId === currentUserId ? "negative" : "positive",
          sortKey: 0,
        };
      },
    ),
  ];

  const sorted = renderEntries(entries);

  if (sorted.length === 0) {
    return (
      <section className="card" aria-label="Recent activity">
        <div className="card__header">
          <h3 className="card__title">Recent Activity</h3>
        </div>
        <EmptyState
          title="Nothing here yet"
          description="Expenses, group activity and settlements will appear here."
          icon="activity"
        />
      </section>
    );
  }

  return (
    <section className="card" aria-label="Recent activity">
      <div className="card__header">
        <h3 className="card__title">
          <span className="card__title-icon">
            <Icon name="activity" size={16} />
          </span>
          Recent Activity
        </h3>
        <Link className="btn btn--sm btn--ghost" to="/expenses">
          View All
        </Link>
      </div>
      <ul className="activity-list">
        {sorted.map((entry) => (
          <li key={entry.id}>
            <Link className="activity-row" to={entry.href}>
              <span className={`activity-row__icon activity-row__icon--${entry.tone}`}>
                <Icon name={entry.icon} size={16} />
              </span>
              <span className="activity-row__body">
                <span className="activity-row__title">{entry.title}</span>
                <span className="activity-row__caption">
                  <span className="badge badge--muted">{entry.badge}</span>
                  {entry.caption}
                </span>
              </span>
              <span
                className={`activity-row__amount activity-row__amount--${entry.tone}`}
              >
                {formatMoney(entry.amountMinor, entry.currency)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}