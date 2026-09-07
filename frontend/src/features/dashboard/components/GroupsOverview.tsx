import { Link } from "react-router-dom";
import { EmptyState } from "../../../components/ui/EmptyState";
import { formatMoney } from "../../../lib/money";
import type { DashboardGroupOverview } from "../api/dashboardApi";

interface GroupsOverviewProps {
  groups: DashboardGroupOverview[];
  groupCount: number;
}

export function GroupsOverview({ groups, groupCount }: GroupsOverviewProps) {
  if (groups.length === 0) {
    return (
      <section className="section" aria-label="Your groups">
        <h2 className="section__title">Groups ({groupCount})</h2>
        <EmptyState
          title="No groups yet"
          description="Create your first group to start splitting expenses."
          action={
            <Link className="btn" to="/groups">
              Go to Groups
            </Link>
          }
        />
      </section>
    );
  }

  return (
    <section className="section" aria-label="Your groups">
      <div className="section__head">
        <h2 className="section__title">
          Groups ({groupCount})
        </h2>
        <Link className="btn btn--sm btn--ghost" to="/groups">
          All groups
        </Link>
      </div>
      <ul className="rows">
        {groups.map((group) => (
          <li key={group.id}>
            <Link className="row row--link" to={`/groups/${group.id}`}>
              <div>
                <p className="row__primary">{group.name}</p>
                <p className="row__secondary">
                  {group.memberCount} member{group.memberCount === 1 ? "" : "s"} ·{" "}
                  {formatMoney(group.outstandingMinor)} outstanding
                </p>
              </div>
              <div className="row__meta">
                <span className={`badge ${group.myRole ? "badge--accent" : "badge--muted"}`}>
                  {group.myRole ?? "no role"}
                </span>
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
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}