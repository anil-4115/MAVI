import { Link } from "react-router-dom";
import { EmptyState } from "../../components/ui/EmptyState";
import { ErrorState } from "../../components/ui/ErrorState";
import { Skeleton } from "../../components/ui/Skeleton";
import { formatMoney } from "../../lib/money";
import { useAllGroupBalances, type GroupBalancesEntry } from "../balances/useAllGroupBalances";
import "./settlements.css";

type FlatSettlement = {
  id: string;
  groupName: string;
  groupId: string;
  from: string;
  to: string;
  amountMinor: number;
  currency: string;
  involvesMe: boolean;
};

function flatten(entries: GroupBalancesEntry[], currentUserId: string | null): FlatSettlement[] {
  const result: FlatSettlement[] = [];
  for (const { group, balances } of entries) {
    const nameOf = (userId: string): string =>
      balances.members.find((m) => m.userId === userId)?.name ?? "Member";
    for (let i = 0; i < balances.settlements.length; i++) {
      const s = balances.settlements[i];
      const involvesMe = s.payerId === currentUserId || s.receiverId === currentUserId;
      result.push({
        id: `${s.groupId}-${s.payerId}-${s.receiverId}-${i}`,
        groupName: group.name,
        groupId: s.groupId,
        from: nameOf(s.payerId),
        to: nameOf(s.receiverId),
        amountMinor: s.amountMinor,
        currency: group.currency,
        involvesMe,
      });
    }
  }
  return result;
}

export function SettlementsPage() {
  const { entries, error, loading, reload } = useAllGroupBalances();

  if (error) {
    return (
      <div className="app-page">
        <ErrorState message={error} onRetry={reload} />
      </div>
    );
  }

  if (loading || !entries) {
    return (
      <div className="app-page" aria-busy="true">
        <Skeleton variant="card" />
      </div>
    );
  }

  // listGroupBalances returned settled as `[payerId, receiverId, amountMinor]`; we use the balances entries.
  // Need currentUserId for involvesMe — get it via the balances' currentUser.
  const currentUserId = entries[0]?.balances.currentUser.userId ?? null;
  const settlements = flatten(entries, currentUserId);

  if (settlements.length === 0) {
    return (
      <div className="app-page">
        <header className="page-header">
          <div>
            <h1 className="page-title">Settlements</h1>
            <p className="page-subtitle">Money settled between friends and family.</p>
          </div>
        </header>
        <EmptyState
          title="No settlements yet"
          description="Record settlements in your groups to see them here."
          icon="settlements"
          action={
            <Link className="btn" to="/balances">
              View balances
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="app-page settlements-page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Settlements</h1>
          <p className="page-subtitle">Money settled between friends and family.</p>
        </div>
      </header>
      <ul className="rows">
        {settlements.map((s) => (
          <li key={s.id} className="row">
            <div>
              <p className="row__primary">
                {s.from} paid {s.to}
                {s.involvesMe && (
                  <span className="badge badge--accent balances-badge">
                    {s.from === currentUserId ? "you paid" : "you received"}
                  </span>
                )}
              </p>
              <p className="row__secondary">{s.groupName}</p>
            </div>
            <p className="row__meta">{formatMoney(s.amountMinor, s.currency)}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}