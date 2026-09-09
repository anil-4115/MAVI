import { EmptyState } from "../../../components/ui/EmptyState";
import { formatMoney } from "../../../lib/money";
import type { DashboardGroupOverview, SettlementView } from "../api/dashboardApi";

interface RecentSettlementsProps {
  settlements: SettlementView[];
  groups: DashboardGroupOverview[];
  currentUserId: string | null;
}

export function RecentSettlements({ settlements, groups, currentUserId }: RecentSettlementsProps) {
  if (settlements.length === 0) {
    return (
      <section className="section" aria-label="Recent settlements">
        <h2 className="section__title">Recent settlements</h2>
        <EmptyState title="No settlements yet" description="Settlements you record between group members will show up here." />
      </section>
    );
  }

  const groupName = (groupId: string): string =>
    groups.find((group) => group.id === groupId)?.name ?? "a group";

  return (
    <section className="section" aria-label="Recent settlements">
      <h2 className="section__title">Recent settlements</h2>
      <ul className="rows">
        {settlements.map((settlement, index) => {
          const paidByMe = settlement.payerId === currentUserId;
          const receivedByMe = settlement.receiverId === currentUserId;
          const label = paidByMe
            ? "You paid a settlement"
            : receivedByMe
              ? "You received a settlement"
              : "Settlement recorded";
          return (
            <li key={`${settlement.groupId}-${index}`} className="row">
              <div>
                <p className="row__primary">{label}</p>
                <p className="row__secondary">{groupName(settlement.groupId)}</p>
              </div>
              <p className="row__meta">{formatMoney(settlement.amountMinor)}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}