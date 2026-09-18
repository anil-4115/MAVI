import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import { Avatar } from "../../../components/ui/Avatar";
import { Icon } from "../../../components/ui/Icon";
import { formatDate } from "../../../lib/format";
import type { PublicGroup, GroupRole } from "../api/groupsApi";

function roleBadge(role: GroupRole | null): string {
  switch (role) {
    case "owner":
      return "badge--accent";
    case "admin":
      return "badge--success";
    default:
      return "badge--muted";
  }
}

export function GroupCard({ group, actions }: { group: PublicGroup; actions?: ReactNode }) {
  return (
    <Link to={`/groups/${group.id}`} className="link-card">
      <div className="card group-card">
        <div className="group-card__head">
          <Avatar name={group.name} size="lg" />
          <span className={`badge ${roleBadge(group.myRole)}`}>{group.myRole ?? "member"}</span>
          {group.archived && <span className="badge badge--muted">archived</span>}
        </div>
        <h3 className="group-card__name">{group.name}</h3>
        {group.description && <p className="group-card__description">{group.description}</p>}
        <div className="group-card__meta">
          <span className="group-card__meta-chip">
            <Icon name="groups" size={14} aria-hidden="true" />
            {group.memberCount} member{group.memberCount === 1 ? "" : "s"}
          </span>
          <span className="group-card__meta-chip">
            <Icon name="calendar" size={14} aria-hidden="true" />
            {formatDate(group.createdAt)}
          </span>
        </div>
        {actions && <div className="group-card__actions">{actions}</div>}
      </div>
    </Link>
  );
}