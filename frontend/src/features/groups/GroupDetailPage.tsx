import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Banner } from "../../components/ui/Banner";
import { ErrorState } from "../../components/ui/ErrorState";
import { Spinner } from "../../components/ui/Spinner";
import { useToast } from "../../components/ui/Toast";
import { formatDate } from "../../lib/format";
import { getErrorMessage } from "../../services/api";
import { useAuth } from "../auth/useAuth";
import { getGroup, getGroupInvitePreview, type GroupInvitePreview, type PublicGroup } from "./api/groupsApi";
import { GroupInvitation } from "./components/GroupInvitation";
import { GroupSettings } from "./components/GroupSettings";
import { MembersTab } from "./components/MembersTab";
import { OverviewTab } from "./components/OverviewTab";
import { ExpensesTab } from "../expenses/components/ExpensesTab";
import { BalancesTab } from "../balances/components/BalancesTab";
import { SettlementsTab } from "../settlements/components/SettlementsTab";
import { ActivityTab } from "../notifications/components/ActivityTab";
import "../expenses/expenses.css";
import "../balances/balances.css";
import "../settlements/settlements.css";
import "../notifications/notifications.css";
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

const isTabId = (value: string | null): value is TabId =>
  value !== null && TABS.some((tab) => tab.id === value);

export function GroupDetailPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [searchParams] = useSearchParams();
  const urlTab = searchParams.get("tab");

  const [group, setGroup] = useState<PublicGroup | null>(null);
  const [invite, setInvite] = useState<GroupInvitePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>(isTabId(urlTab) ? urlTab : "overview");
  const [reloadKey, setReloadKey] = useState(0);

  /* Deep links (`/groups/:id?tab=expenses` from notification targets) switch the
     active tab only when the URL tab value changes, so in-page tab clicks are
     never overridden. */
  useEffect(() => {
    if (isTabId(urlTab)) {
      setActiveTab(urlTab);
    }
  }, [urlTab]);

  useEffect(() => {
    if (!groupId) {
      return;
    }
    let active = true;
    void getGroup(groupId)
      .then((result) => {
        if (active) {
          setGroup(result);
          setInvite(null);
        }
      })
      .catch(async (loadError: unknown) => {
        const original = getErrorMessage(loadError);
        try {
          const preview = await getGroupInvitePreview(groupId);
          if (active) {
            setInvite(preview);
            setError(null);
          }
        } catch {
          if (active) {
            setError(original);
          }
        }
      });
    setError(null);
    return () => {
      active = false;
    };
  }, [groupId, reloadKey]);

  const refresh = () => {
    setGroup(null);
    setReloadKey((key) => key + 1);
  };

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

  if (invite && user) {
    return (
      <GroupInvitation
        preview={invite}
        currentUserId={user.id}
        onAccepted={refresh}
        onDeclined={() => navigate("/groups")}
      />
    );
  }

  if (!group) {
    return (
      <div className="app-page">
        <Spinner label="Loading group" />
      </div>
    );
  }

  const showSettings = group.myRole === "owner" || group.myRole === "admin";

  const handleDeleted = () => {
    addToast("Group permanently deleted.", "success");
    navigate("/groups");
  };

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
            {group.myRole && (
              <span
                className={`badge ${group.myRole === "owner" ? "badge--accent" : group.myRole === "admin" ? "badge--success" : "badge--muted"}`}
              >
                {group.myRole}
              </span>
            )}
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

      {showSettings && (
        <GroupSettings
          group={group}
          onSaved={(updated) => {
            setGroup(updated);
          }}
          onArchived={(updated) => {
            setGroup(updated);
          }}
          onDeleted={handleDeleted}
        />
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
      {activeTab === "members" && (
        <MembersTab
          groupId={group.id}
          myRole={group.myRole}
          currentUserId={user?.id ?? null}
          reloadKey={reloadKey}
          onGroupChanged={refresh}
        />
      )}
      {activeTab === "expenses" && (
        <ExpensesTab
          groupId={group.id}
          currency={group.currency}
          archived={group.archived}
          myRole={group.myRole}
          currentUserId={user?.id ?? null}
          onGroupChanged={refresh}
        />
      )}
      {activeTab === "balances" && (
        <BalancesTab
          groupId={group.id}
          currency={group.currency}
          archived={group.archived}
          currentUserId={user?.id ?? null}
        />
      )}
      {activeTab === "settlements" && (
        <SettlementsTab
          groupId={group.id}
          currency={group.currency}
          archived={group.archived}
          myRole={group.myRole}
          currentUserId={user?.id ?? null}
          onGroupChanged={refresh}
        />
      )}
      {activeTab === "activity" && (
        <ActivityTab groupId={group.id} currentUserId={user?.id ?? null} />
      )}
    </div>
  );
}