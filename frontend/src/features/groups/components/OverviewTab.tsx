import { useEffect, useState } from "react";
import { Spinner } from "../../../components/ui/Spinner";
import { ErrorState } from "../../../components/ui/ErrorState";
import { formatMoney } from "../../../lib/money";
import { getErrorMessage } from "../../../services/api";
import { getGroupBalances } from "../api/groupBalancesApi";

export function OverviewTab({ groupId }: { groupId: string }) {
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof getGroupBalances>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setError(null);
    setSummary(null);
    getGroupBalances(groupId)
      .then((result) => {
        if (active) {
          setSummary(result);
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(getErrorMessage(loadError));
        }
      });
    return () => {
      active = false;
    };
  }, [groupId]);

  if (error) {
    return <ErrorState message={error} />;
  }

  if (!summary) {
    return <Spinner label="Loading overview" />;
  }

  const net = summary.currentUser.netMinor;

  return (
    <div>
      <div className="summary-grid">
        <div className="summary-card">
          <p className="summary-card__label">Total expense</p>
          <p className="summary-card__value">{formatMoney(summary.totalExpenseMinor)}</p>
        </div>
        <div className="summary-card">
          <p className="summary-card__label">Outstanding</p>
          <p className="summary-card__value">{formatMoney(summary.totalOutstandingMinor)}</p>
        </div>
        <div className="summary-card">
          <p className="summary-card__label">You paid</p>
          <p className="summary-card__value">{formatMoney(summary.currentUser.paidMinor)}</p>
        </div>
        <div className="summary-card">
          <p className="summary-card__label">You owe</p>
          <p className="summary-card__value">{formatMoney(summary.currentUser.owedMinor)}</p>
        </div>
        <div className="summary-card">
          <p className="summary-card__label">Your net</p>
          <p
            className={`summary-card__value ${net < 0 ? "money--negative" : net > 0 ? "money--positive" : ""}`}
          >
            {formatMoney(net)}
          </p>
        </div>
      </div>
    </div>
  );
}