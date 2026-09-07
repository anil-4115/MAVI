import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Banner } from "../../components/ui/Banner";
import { ErrorState } from "../../components/ui/ErrorState";
import { Spinner } from "../../components/ui/Spinner";
import { formatDate } from "../../lib/format";
import { getErrorMessage } from "../../services/api";
import { getGroup, type PublicGroup } from "./api/groupsApi";
import { ComingSoonTab } from "./components/ComingSoonTab";
import { MembersTab } from "./components/MembersTab";
import { OverviewTab } from "./components/OverviewTab";
import "./groups.css";

type TabId = "overview" | "expenses" | "balances" | "settlements" | "members" | "activity";

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "expenses", label: "Expenses" },
  { id: "balances", label: "Balances" },
  { id: "settlements", label: "Settlements" },
  { id: "members", label: "Members" },
  { id: "activity", label: "Activity" },
];

export function GroupDetailPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const [group, setGroup] = useState<PublicGroup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  useEffect(() => {
    if (!groupId) {
      return;
    }
    let active = true;
    setError(null);
    setGroup(null);
    getGroup(groupId)
      .then((result) => {
        if (active) {
          setGroup(result);
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
    return (
      <div className="app-page">
        <ErrorState message={error} />
        <Link className="btn btn--secondary" to="/groups">
          Back to groups
        </Link>
      </div>
    );
  }

  if (!group) {
    return (
      <div className="app-page">
        <Spinner label="Loading group" />
      </div>
    );
  }

  return (
    <div className="app-page">
      <Link className="group-detail__back" to="/groups">
        ← Back to groups
      </Link>

      <header className="page-header">
        <div>
          <div className="group-detail__title-row">
            <h1 className="page-title">{group.name}</h1>
            {group.archived && <span className="badge badge--muted">archived</span>}
            {group.myRole && <span className="badge badge--accent">{group.myRole}</span>}
          </div>
          {group.description && <p className="page-subtitle">{group.description}</p>}
          <p className="group-detail__meta">
            {group.memberCount} member{group.memberCount === 1 ? "" : "s"} · {group.currency} ·
            created {formatDate(group.createdAt)}
          </p>
        </div>
      </header>

      {group.archived && (
        <Banner tone="error">
          This group is archived. It is read-only; new expenses and settlements can&apos;t be
          added.
        </Banner>
      )}

      <div className="tabs" role="tablist" aria-label="Group sections">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`tab${activeTab === tab.id ? " tab--active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "overview" && <OverviewTab groupId={group.id} />}
      {activeTab === "members" && <MembersTab groupId={group.id} />}
      {activeTab === "expenses" && (
        <ComingSoonTab
          phase="F.4"
          description="The full group expenses list and create/edit/void flow lands in F.4."
        />
      )}
      {activeTab === "balances" && (
        <ComingSoonTab
          phase="F.5"
          description="Member-by-member balances, pairwise obligations and suggestions land in F.5."
        />
      )}
      {activeTab === "settlements" && (
        <ComingSoonTab
          phase="F.6"
          description="Recording and cancelling settlements lands in F.6."
        />
      )}
      {activeTab === "activity" && (
        <ComingSoonTab
          phase="F.7"
          description="Group-scoped activity and notifications land in F.7."
        />
      )}
    </div>
  );
}