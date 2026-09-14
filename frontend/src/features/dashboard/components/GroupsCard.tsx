import { Link } from "react-router-dom";
import { Avatar } from "../../../components/ui/Avatar";
import { EmptyState } from "../../../components/ui/EmptyState";
import { Icon } from "../../../components/ui/Icon";
import { formatMoney } from "../../../lib/money";
import type { DashboardGroupOverview } from "../api/dashboardApi";

interface GroupsCardProps {
  groups: DashboardGroupOverview[];
}

export function GroupsCard({ groups }: GroupsCardProps) {
  return (
    <section className="card" aria-label="Your groups">
      <div className="card__header">
        <h3 className="card__title">Your Groups</h3>
        <Link className="btn btn--sm btn--ghost" to="/groups">
          View All
        </Link>
      </div>

      {groups.length === 0 ? (
        <EmptyState
          title="No groups yet"
          description="Create your first group to start splitting expenses."
          icon="groups"
          action={
            <Link className="btn btn--sm" to="/groups">
              Create a group
            </Link>
          }
        />
      ) : (
        <ul className="dash-groups">
          {groups.map((group) => (
            <li key={group.id}>
              <Link className="dash-group" to={`/groups/${group.id}`}>
                <Avatar name={group.name} size="md" />
                <span className="dash-group__body">
                  <span className="dash-group__name">{group.name}</span>
                  <span className="dash-group__meta">
                    {group.memberCount} member{group.memberCount === 1 ? "" : "s"}
                  </span>
                </span>
                <span
                  className={`dash-group__net ${
                    group.netMinor < 0
                      ? "money--negative"
                      : group.netMinor > 0
                        ? "money--positive"
                        : "money--muted"
                  }`}
                >
                  {formatMoney(group.netMinor)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {groups.length > 0 && (
        <div className="card__footer">
          <Link className="btn btn--sm btn--ghost" to="/groups">
            <Icon name="plus" size={16} /> Create group
          </Link>
        </div>
      )}
    </section>
  );
}