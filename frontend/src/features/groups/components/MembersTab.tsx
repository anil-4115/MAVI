import { useEffect, useState } from "react";
import { EmptyState } from "../../../components/ui/EmptyState";
import { ErrorState } from "../../../components/ui/ErrorState";
import { Spinner } from "../../../components/ui/Spinner";
import { formatDate } from "../../../lib/format";
import { getErrorMessage } from "../../../services/api";
import { listGroupMembers, type PublicGroupMember } from "../api/groupsApi";

function memberBadge(member: PublicGroupMember): {
  className: string;
  label: string;
} {
  if (member.status === "active") {
    return { className: "badge--accent", label: member.role };
  }
  return { className: "badge--muted", label: member.status };
}

export function MembersTab({ groupId }: { groupId: string }) {
  const [members, setMembers] = useState<PublicGroupMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setError(null);
    setMembers(null);
    listGroupMembers(groupId)
      .then((result) => {
        if (active) {
          setMembers(result);
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

  if (!members) {
    return <Spinner label="Loading members" />;
  }

  if (members.length === 0) {
    return <EmptyState title="No members yet" />;
  }

  return (
    <ul className="rows">
      {members.map((member) => {
        const badge = memberBadge(member);
        return (
          <li key={member.userId} className="row">
            <div>
              <p className="row__primary">{member.name}</p>
              <p className="row__secondary">{member.email}</p>
            </div>
            <div className="row__meta">
              <span className={`badge ${badge.className}`}>{badge.label}</span>
              {member.status === "active" && <p>Member since {formatDate(member.joinedAt)}</p>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}