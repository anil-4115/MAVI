import { useCallback, useEffect, useState } from "react";
import { EmptyState } from "../../../components/ui/EmptyState";
import { ErrorState } from "../../../components/ui/ErrorState";
import { Spinner } from "../../../components/ui/Spinner";
import { formatMoney } from "../../../lib/money";
import { getErrorMessage } from "../../../services/api";
import { getGroupBalances, type GroupBalances } from "../api/balancesApi";

interface BalancesTabProps {
  groupId: string;
  currency: string;
  archived: boolean;
  currentUserId: string | null;
}

interface PairRow {
  fromUserId: string;
  toUserId: string;
  amountMinor: number;
  involvesMe: boolean;
}

export function BalancesTab({ groupId, currency, archived, currentUserId }: BalancesTabProps) {
  const [balances, setBalances] = useState<GroupBalances | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    setBalances(null);
    getGroupBalances(groupId)
      .then(setBalances)
      .catch((loadError: unknown) => {
        setError(getErrorMessage(loadError));
      });
  }, [groupId]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return <ErrorState message={error} onRetry={load} />;
  }

  if (!balances) {
    return <Spinner label="Loading balances" />;
  }

  const nameOf = (userId: string): string => {
    const member = balances.members.find((item) => item.userId === userId);
    return member?.name ?? "Member";
  };

  /* Pairwise entries are one per unordered pair with non-zero net; normalize
     each to a single payer->receiver direction for display (abs of a backend
     integer for formatting only — the amounts themselves come from the API). */
  const pairRows: PairRow[] = balances.pairwise.map((entry) => {
    const from = entry.netMinor > 0 ? entry.userIdA : entry.userIdB;
    const to = entry.netMinor > 0 ? entry.userIdB : entry.userIdA;
    return {
      fromUserId: from,
      toUserId: to,
      amountMinor: Math.abs(entry.netMinor),
      involvesMe: from === currentUserId || to === currentUserId,
    };
  });

  const youOwe = pairRows.filter((row) => row.fromUserId === currentUserId);
  const owedToYou = pairRows.filter((row) => row.toUserId === currentUserId);
  const betweenOthers = pairRows.filter((row) => !row.involvesMe);

  const pairLabel = (row: PairRow): string => {
    if (row.fromUserId === currentUserId) {
      return `You owe ${nameOf(row.toUserId)}`;
    }
    if (row.toUserId === currentUserId) {
      return `${nameOf(row.fromUserId)} owes you`;
    }
    return `${nameOf(row.fromUserId)} owes ${nameOf(row.toUserId)}`;
  };

  const settlementLabel = (fromUserId: string, toUserId: string): string => {
    if (fromUserId === currentUserId) {
      return `You should pay ${nameOf(toUserId)}`;
    }
    if (toUserId === currentUserId) {
      return `${nameOf(fromUserId)} should pay you`;
    }
    return `${nameOf(fromUserId)} should pay ${nameOf(toUserId)}`;
  };

  const net = balances.currentUser.netMinor;

  if (balances.totalExpenseMinor === 0) {
    return (
      <div>
        {archived && (
          <p className="form-hint">
            This group is archived, so balances are read-only and reflect the recorded history.
          </p>
        )}
        <EmptyState
          title="No balances yet"
          description="Record an expense in this group to start tracking who owes whom."
        />
      </div>
    );
  }

  return (
    <div>
      {archived && (
        <p className="form-hint">
          This group is archived, so balances are read-only and reflect the recorded history.
        </p>
      )}

      <div className="summary-grid">
        <div className="summary-card">
          <p className="summary-card__label">Total expense</p>
          <p className="summary-card__value">{formatMoney(balances.totalExpenseMinor, currency)}</p>
        </div>
        <div className="summary-card">
          <p className="summary-card__label">Outstanding</p>
          <p className="summary-card__value">{formatMoney(balances.totalOutstandingMinor, currency)}</p>
        </div>
        <div className="summary-card">
          <p className="summary-card__label">You paid</p>
          <p className="summary-card__value">{formatMoney(balances.currentUser.paidMinor, currency)}</p>
        </div>
        <div className="summary-card">
          <p className="summary-card__label">Your share</p>
          <p className="summary-card__value">{formatMoney(balances.currentUser.owedMinor, currency)}</p>
        </div>
        <div className="summary-card">
          <p className="summary-card__label">Your net</p>
          <p
            className={`summary-card__value ${net < 0 ? "money--negative" : net > 0 ? "money--positive" : ""}`}
          >
            {formatMoney(net, currency)}
          </p>
        </div>
      </div>

      <section className="section">
        <h2 className="section__title">Who owes whom</h2>
        {pairRows.length === 0 ? (
          <EmptyState
            title="All settled"
            description="Every member is at zero here — nothing is owed between anyone in this group."
          />
        ) : (
          <div className="balances-groups">
            {youOwe.length > 0 && (
              <div className="balances-section">
                <h3 className="balances-section__heading">You owe</h3>
                <ul className="rows">
                  {youOwe.map((row) => (
                    <li key={`${row.fromUserId}-${row.toUserId}`} className="row">
                      <p className="row__primary">{pairLabel(row)}</p>
                      <p className="row__meta money--negative">
                        {formatMoney(row.amountMinor, currency)}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {owedToYou.length > 0 && (
              <div className="balances-section">
                <h3 className="balances-section__heading">Owed to you</h3>
                <ul className="rows">
                  {owedToYou.map((row) => (
                    <li key={`${row.fromUserId}-${row.toUserId}`} className="row">
                      <p className="row__primary">{pairLabel(row)}</p>
                      <p className="row__meta money--positive">
                        {formatMoney(row.amountMinor, currency)}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {betweenOthers.length > 0 && (
              <div className="balances-section">
                <h3 className="balances-section__heading">Between others</h3>
                <ul className="rows">
                  {betweenOthers.map((row) => (
                    <li key={`${row.fromUserId}-${row.toUserId}`} className="row">
                      <p className="row__primary">{pairLabel(row)}</p>
                      <p className="row__meta">{formatMoney(row.amountMinor, currency)}</p>
                    </li>
                  ))}
                </ul>
                {youOwe.length === 0 && owedToYou.length === 0 && (
                  <p className="balances-note">You are all settled — nothing is owed from you or to you.</p>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {balances.totalOutstandingMinor > 0 && balances.suggestedSettlements.length > 0 && (
        <section className="section">
          <h2 className="section__title">Suggested settlements</h2>
          <p className="balances-note">
            Deterministic suggestions from the backend based on recorded history.
          </p>
          <ul className="rows">
            {balances.suggestedSettlements.map((settlement, index) => (
              <li key={`${settlement.fromUserId}-${settlement.toUserId}-${index}`} className="row">
                <p className="row__primary">{settlementLabel(settlement.fromUserId, settlement.toUserId)}</p>
                <p className="row__meta">{formatMoney(settlement.amountMinor, currency)}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="section">
        <h2 className="section__title">Member balances</h2>
        <ul className="rows">
          {balances.members.map((member) => (
            <li key={member.userId} className="row">
              <div>
                <p className="row__primary">
                  {member.name}
                  {member.userId === currentUserId && (
                    <span className="badge badge--accent balances-badge">you</span>
                  )}
                  {!member.active && <span className="badge badge--muted balances-badge">left</span>}
                </p>
                <p className="row__secondary">
                  paid {formatMoney(member.paidMinor, currency)} · share{" "}
                  {formatMoney(member.owedMinor, currency)}
                </p>
              </div>
              <p
                className={`row__meta ${member.netMinor < 0 ? "money--negative" : member.netMinor > 0 ? "money--positive" : ""}`}
              >
                {formatMoney(member.netMinor, currency)}
              </p>
            </li>
          ))}
        </ul>
      </section>

      {balances.settlements.length > 0 && (
        <section className="section">
          <h2 className="section__title">Recent settlements</h2>
          <p className="balances-note">Completed settlements already factored into the balances above.</p>
          <ul className="rows">
            {balances.settlements.map((settlement, index) => (
              <li key={`${settlement.payerId}-${settlement.receiverId}-${index}`} className="row">
                <p className="row__primary">
                  {nameOf(settlement.payerId)} paid {nameOf(settlement.receiverId)}
                </p>
                <p className="row__meta">{formatMoney(settlement.amountMinor, currency)}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}