import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ErrorState } from "../../components/ui/ErrorState";
import { Icon } from "../../components/ui/Icon";
import { Skeleton, SkeletonSummary } from "../../components/ui/Skeleton";
import { getErrorMessage } from "../../services/api";
import { SpendingAnalyticsCard } from "../analytics/components/SpendingAnalyticsCard";
import { currentMonthKey, monthLabel } from "../analytics/api/analyticsApi";
import { useSpendingAnalytics } from "../analytics/useSpendingAnalytics";
import { useAuth } from "../auth/useAuth";
import { getDashboard, type DashboardData } from "./api/dashboardApi";
import { GroupsCard } from "./components/GroupsCard";
import { RecentActivity } from "./components/RecentActivity";
import { SummaryCards } from "./components/SummaryCards";
import { UpcomingPayments } from "./components/UpcomingPayments";
import "./dashboard.css";

export function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [monthKey, setMonthKey] = useState<string>(() => currentMonthKey());
  const analytics = useSpendingAnalytics(monthKey);

  const firstName = user?.name?.trim().split(/\s+/)[0] ?? "there";
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? `Good morning, ${firstName}` : hour < 17 ? `Good afternoon, ${firstName}` : `Good evening, ${firstName}`;

  const load = useCallback(async () => {
    setError(null);
    setData(null);
    try {
      setData(await getDashboard());
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <div className="app-page">
        <ErrorState message={error} onRetry={() => void load()} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="app-page dash-page" aria-busy="true" aria-label="Loading dashboard">
        <div className="dash-hero">
          <div className="dash-hero__copy">
            <Skeleton variant="title" />
            <Skeleton variant="text" />
          </div>
        </div>
        <SkeletonSummary cards={4} />
        <div className="dash-grid">
          <div style={{ height: 340 }}>
            <Skeleton variant="card" />
          </div>
          <div className="dash-rail">
            <div style={{ height: 240 }}>
              <Skeleton variant="card" />
            </div>
            <div style={{ height: 150 }}>
              <Skeleton variant="card" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  const groupCount = data.groupCount;
  const spentHint = analytics.data ? `In ${monthLabel(analytics.data.month)}` : "Personal and group total";

  return (
    <div className="app-page dash-page">
      <section className="dash-hero">
        <div className="dash-hero__copy">
          <h2 className="dash-hero__greeting">{greeting} 👋</h2>
          <p className="dash-hero__subtitle">Here&apos;s how your money is moving.</p>
        </div>
        <div className="dash-hero__actions">
          <Link className="btn" to="/expenses?add=1">
            <Icon name="plus" size={18} /> Add expense
          </Link>
        </div>
      </section>

      <SummaryCards
        balanceMinor={data.overallNetMinor}
        oweMinor={data.groupSumToPayMinor}
        owedMinor={data.groupSumToReceiveMinor}
        spentThisMonthMinor={analytics.data?.totalSpentMinor ?? null}
        balanceHint={`Net across ${groupCount} group${groupCount === 1 ? "" : "s"}`}
        oweHint={oweHintFor(data)}
        owedHint="Awaiting settlement"
        spentHint={spentHint}
      />

      <div className="dash-grid">
        <SpendingAnalyticsCard
          monthKey={monthKey}
          onMonthChange={setMonthKey}
          data={analytics.data}
          error={analytics.error}
          loading={analytics.loading}
          onRetry={analytics.reload}
        />
        <div className="dash-rail">
          <GroupsCard groups={data.groups} />
          <UpcomingPayments
            oweMinor={data.groupSumToPayMinor}
            owedMinor={data.groupSumToReceiveMinor}
            groupCount={groupCount}
          />
        </div>
      </div>

      <RecentActivity
        groupExpenses={data.recentGroupExpenses}
        personalExpenses={data.recentPersonalExpenses}
        settlements={data.recentSettlements}
        groups={data.groups}
        currentUserId={user?.id ?? null}
      />
    </div>
  );
}

/** Real secondary line for the "You Owe" card based on outstanding balances. */
function oweHintFor(data: DashboardData): string {
  if (data.groupSumToPayMinor === 0) {
    return "Nothing due right now";
  }
  return "Due across your group balances";
}