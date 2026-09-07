import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ErrorState } from "../../components/ui/ErrorState";
import { EmptyState } from "../../components/ui/EmptyState";
import { Spinner } from "../../components/ui/Spinner";
import { formatRelativeTime } from "../../lib/format";
import { formatMoney } from "../../lib/money";
import { getErrorMessage } from "../../services/api";
import { useAuth } from "../auth/useAuth";
import { getDashboard, type DashboardData } from "./api/dashboardApi";

function MoneyValue({ amountMinor, testId }: { amountMinor: number; testId: string }) {
  const className =
    amountMinor < 0 ? "money--negative" : amountMinor > 0 ? "money--positive" : undefined;
  return <span className={`summary-card__value ${className ?? ""}`} data-testid={testId}>{formatMoney(amountMinor)}</span>;
}

function SummaryCard({
  label,
  amountMinor,
  testId,
}: {
  label: string;
  amountMinor: number;
  testId: string;
}) {
  return (
    <div className="summary-card">
      <p className="summary-card__label">{label}</p>
      <MoneyValue amountMinor={amountMinor} testId={testId} />
    </div>
  );
}

function RoleLabel({ role }: { role: string | null }) {
  if (!role) {
    return <span className="badge badge--muted">no role</span>;
  }
  return <span className="badge badge--accent">{role}</span>;
}

export function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setData(null);
    try {
      setData(await getDashboard());
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <div className="app-page">
        <ErrorState message={error} onRetry={() => void load()} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="app-page">
        <Spinner label="Loading dashboard" />
      </div>
    );
  }

  return (
    <div className="app-page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">
            Welcome back{user ? `, ${user.name}` : ""}. Here&apos;s how your money is moving.
          </p>
        </div>
      </header>

      <section aria-label="Summary">
        <div className="summary-grid">
          <SummaryCard label="Overall net" amountMinor={data.overallNetMinor} testId="dash-overall-net" />
          <SummaryCard label="You paid" amountMinor={data.groupSumPaidMinor} testId="dash-paid" />
          <SummaryCard label="You owe" amountMinor={data.groupSumOwedMinor} testId="dash-owed" />
          <SummaryCard label="To receive" amountMinor={data.groupSumToReceiveMinor} testId="dash-to-receive" />
          <SummaryCard label="To pay" amountMinor={data.groupSumToPayMinor} testId="dash-to-pay" />
          <SummaryCard label="Personal spending" amountMinor={data.personalSpendingMinor} testId="dash-personal" />
        </div>
      </section>

      <section className="section" aria-label="Your groups">
        <h2 className="section__title">Groups ({data.groupCount})</h2>
        {data.groups.length === 0 ? (
          <EmptyState
            title="No groups yet"
            description="Create your first group to start splitting expenses."
            action={
              <Link className="btn" to="/groups">
                Go to Groups
              </Link>
            }
          />
        ) : (
          <ul className="rows">
            {data.groups.map((group) => (
              <li key={group.id} className="row">
                <div>
                  <p className="row__primary">{group.name}</p>
                  <p className="row__secondary">
                    {group.memberCount} member{group.memberCount === 1 ? "" : "s"} ·{" "}
                    {formatMoney(group.outstandingMinor)} outstanding
                  </p>
                </div>
                <div className="row__meta">
                  <RoleLabel role={group.myRole} />
                  <p>
                    <span
                      className={
                        group.netMinor < 0
                          ? "money--negative"
                          : group.netMinor > 0
                            ? "money--positive"
                            : undefined
                      }
                    >
                      {formatMoney(group.netMinor)}
                    </span>{" "}
                    net
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section" aria-label="Recent group expenses">
        <h2 className="section__title">Recent group expenses</h2>
        {data.recentGroupExpenses.length === 0 ? (
          <EmptyState title="No group expenses yet" />
        ) : (
          <ul className="rows">
            {data.recentGroupExpenses.map((expense) => (
              <li key={expense.id} className="row">
                <div>
                  <p className="row__primary">{expense.title}</p>
                  <p className="row__secondary">
                    {expense.groupName} · {formatRelativeTime(expense.expenseDate)}
                  </p>
                </div>
                <p className="row__meta">{formatMoney(expense.amountMinor, expense.currency)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section" aria-label="Recent personal expenses">
        <h2 className="section__title">Recent personal expenses</h2>
        {data.recentPersonalExpenses.length === 0 ? (
          <EmptyState title="No personal expenses yet" />
        ) : (
          <ul className="rows">
            {data.recentPersonalExpenses.map((expense) => (
              <li key={expense.id} className="row">
                <div>
                  <p className="row__primary">{expense.title}</p>
                  <p className="row__secondary">{formatRelativeTime(expense.expenseDate)}</p>
                </div>
                <p className="row__meta">{formatMoney(expense.amountMinor, expense.currency)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section" aria-label="Recent settlements">
        <h2 className="section__title">Recent settlements</h2>
        {data.recentSettlements.length === 0 ? (
          <EmptyState title="No settlements yet" />
        ) : (
          <ul className="rows">
            {data.recentSettlements.map((settlement, index) => {
              const paidByMe = settlement.payerId === user?.id;
              const receivedByMe = settlement.receiverId === user?.id;
              const label = paidByMe
                ? "You paid a settlement"
                : receivedByMe
                  ? "You received a settlement"
                  : "Settlement recorded";
              return (
                <li key={`${settlement.groupId}-${index}`} className="row">
                  <div>
                    <p className="row__primary">{label}</p>
                    <p className="row__secondary">Group {settlement.groupId.slice(0, 6)}</p>
                  </div>
                  <p className="row__meta">{formatMoney(settlement.amountMinor)}</p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}