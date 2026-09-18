import { formatMoney } from "../../../lib/money";
import type { ReportSummary } from "../api/reportsApi";

interface ReportGroupBreakdownProps {
  summary: ReportSummary;
}

/** Per-group spending plus the actor's paid/share/net and settlement totals. */
export function ReportGroupBreakdown({ summary }: ReportGroupBreakdownProps) {
  const money = (amountMinor: number): string => formatMoney(amountMinor, summary.currency);

  if (summary.groups.length === 0) {
    return (
      <section className="card" aria-label="Group breakdown">
        <div className="card__header">
          <h3 className="card__title">Group breakdown</h3>
        </div>
        <p className="reports-muted">No groups to report on for this selection.</p>
      </section>
    );
  }

  return (
    <section className="card" aria-label="Group breakdown">
      <div className="card__header">
        <h3 className="card__title">Group breakdown</h3>
        <span className="reports-muted">
          {summary.groups.length} group{summary.groups.length === 1 ? "" : "s"}
        </span>
      </div>

      <ul className="reports-group-rows">
        {summary.groups.map((group) => (
          <li key={group.groupId} className="reports-group-row">
            <div className="reports-group-row__head">
              <span className="reports-group-row__name">{group.groupName}</span>
              {group.archived && <span className="badge">Archived</span>}
            </div>

            <dl className="reports-group-row__metrics">
              <div>
                <dt>Spent</dt>
                <dd className="money">{money(group.spentMinor)}</dd>
              </div>
              <div>
                <dt>You paid</dt>
                <dd className="money">{money(group.myPaidMinor)}</dd>
              </div>
              <div>
                <dt>Your share</dt>
                <dd className="money">{money(group.myOwedMinor)}</dd>
              </div>
              <div>
                <dt>Your net</dt>
                <dd
                  className={`money${
                    group.myNetMinor > 0
                      ? " reports-net--positive"
                      : group.myNetMinor < 0
                        ? " reports-net--negative"
                        : ""
                  }`}
                >
                  {money(group.myNetMinor)}
                </dd>
              </div>
              <div>
                <dt>Settlements</dt>
                <dd className="money">
                  {money(group.settlementTotalMinor)}
                  <span className="reports-group-row__count"> ({group.settlementCount})</span>
                </dd>
              </div>
            </dl>

            <p className="reports-group-row__hint">
              {group.expenseCount} expense{group.expenseCount === 1 ? "" : "s"} in range
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}