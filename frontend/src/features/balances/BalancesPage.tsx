import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Avatar } from "../../components/ui/Avatar";
import { EmptyState } from "../../components/ui/EmptyState";
import { ErrorState } from "../../components/ui/ErrorState";
import { Skeleton } from "../../components/ui/Skeleton";
import { formatMoney } from "../../lib/money";
import { getErrorMessage } from "../../services/api";
import { useAuth } from "../auth/useAuth";
import { getDashboard, type DashboardData } from "../dashboard/api/dashboardApi";
import type { GroupBalancesEntry } from "./useAllGroupBalances";
import { useAllGroupBalances } from "./useAllGroupBalances";
import "./balances.css";

function pairKey(from: string, to: string): string {
  return `${from}-${to}`;
}

function GroupBalanceCard({
  entry,
  currentUserId,
}: {
  entry: GroupBalancesEntry;
  currentUserId: string | null;
}) {
  const { group, balances } = entry;

  const nameOf = (userId: string): string =>
    balances.members.find((m) => m.userId === userId)?.name ?? "Member";

  const pairRows = balances.pairwise.map((e) => ({
    from: e.netMinor > 0 ? e.userIdA : e.userIdB,
    to: e.netMinor > 0 ? e.userIdB : e.userIdA,
    amount: Math.abs(e.netMinor),
  }));

  const net = balances.currentUser.netMinor;

  return (
    <section className="card" key={group.id}>
      <div className="card__header">
        <Link className="card__title" to={`/groups/${group.id}?tab=balances`}>
          <span className="card__title-icon">
            <Avatar name={group.name} size="sm" />
          </span>
          {group.name}
        </Link>
        {!group.archived && (
          <Link className="btn btn--sm btn--ghost" to={`/groups/${group.id}?tab=balances`}>
            Settle up
          </Link>
        )}
      </div>

      <div className="summary-grid" style={{ marginBottom: 12 }}>
        <div className="summary-card">
          <p className="summary-card__label">Your net</p>
          <p
            className={`summary-card__value ${net < 0 ? "money--negative" : net > 0 ? "money--positive" : ""}`}
          >
            {formatMoney(net, group.currency)}
          </p>
        </div>
        <div className="summary-card">
          <p className="summary-card__label">Outstanding</p>
          <p className="summary-card__value">{formatMoney(balances.totalOutstandingMinor, group.currency)}</p>
        </div>
      </div>

      {pairRows.length === 0 ? (
        <p className="form-hint" style={{ margin: 0 }}>
          All settled in this group.
        </p>
      ) : (
        <ul className="rows">
          {pairRows.map((row) => {
            const involvesMe = row.from === currentUserId || row.to === currentUserId;
            const label =
              row.from === currentUserId
                ? `You owe ${nameOf(row.to)}`
                : row.to === currentUserId
                  ? `${nameOf(row.from)} owes you`
                  : `${nameOf(row.from)} owes ${nameOf(row.to)}`;
            return (
              <li key={pairKey(row.from, row.to)} className="row">
                <p className="row__primary">
                  {label}
                  {!involvesMe && <span className="badge badge--muted balances-badge">other</span>}
                </p>
                <p
                  className={`row__meta ${
                    row.from === currentUserId
                      ? "money--negative"
                      : row.to === currentUserId
                        ? "money--positive"
                        : ""
                  }`}
                >
                  {formatMoney(row.amount, group.currency)}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function BalancesPage() {
  const { user } = useAuth();
  const { entries, error: groupsError, loading: groupsLoading, reload: groupsReload } = useAllGroupBalances();
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [dashError, setDashError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setDashError(null);
    try {
      setDashboard(await getDashboard());
    } catch (loadError) {
      setDashError(getErrorMessage(loadError));
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const totalToPay = dashboard?.groupSumToPayMinor ?? 0;
  const totalToReceive = dashboard?.groupSumToReceiveMinor ?? 0;
  const net = totalToReceive - totalToPay;

  if (groupsError || dashError) {
    return (
      <div className="app-page">
        <ErrorState
          message={groupsError ?? dashError ?? "Something went wrong."}
          onRetry={() => {
            groupsReload();
            void loadDashboard();
          }}
        />
      </div>
    );
  }

  if (groupsLoading || !entries) {
    return (
      <div className="app-page" aria-busy="true">
        <div className="summary-grid" style={{ marginBottom: 20 }}>
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} variant="card" />
          ))}
        </div>
        <Skeleton variant="card" />
      </div>
    );
  }

  return (
    <div className="app-page balances-page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Balances</h1>
          <p className="page-subtitle">Who owes what, across all your groups.</p>
        </div>
      </header>
      <div className="summary-grid">
        <div className="summary-card">
          <p className="summary-card__label">You owe</p>
          <p className={`summary-card__value ${totalToPay > 0 ? "money--negative" : "money--muted"}`}>
            {formatMoney(totalToPay)}
          </p>
        </div>
        <div className="summary-card">
          <p className="summary-card__label">You are owed</p>
          <p className={`summary-card__value ${totalToReceive > 0 ? "money--positive" : "money--muted"}`}>
            {formatMoney(totalToReceive)}
          </p>
        </div>
        <div className="summary-card">
          <p className="summary-card__label">Net across groups</p>
          <p className={`summary-card__value ${net < 0 ? "money--negative" : net > 0 ? "money--positive" : "money--muted"}`}>
            {formatMoney(net)}
          </p>
        </div>
      </div>

      {entries.length === 0 ? (
        <EmptyState
          title="No balances yet"
          description="Join a group and record expenses to start tracking who owes whom."
          icon="balances"
          action={
            <Link className="btn" to="/groups">
              Go to Groups
            </Link>
          }
        />
      ) : (
        entries.map((entry) => (
          <GroupBalanceCard
            key={entry.group.id}
            entry={entry}
            currentUserId={user?.id ?? null}
          />
        ))
      )}
    </div>
  );
}