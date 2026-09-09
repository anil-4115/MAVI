import { useCallback, useEffect, useState } from "react";
import { Spinner } from "../../components/ui/Spinner";
import { ErrorState } from "../../components/ui/ErrorState";
import { getErrorMessage } from "../../services/api";
import { useAuth } from "../auth/useAuth";
import { getDashboard, type DashboardData } from "./api/dashboardApi";
import { NetHero } from "./components/NetHero";
import { SummaryGrid } from "./components/SummaryGrid";
import { GroupsOverview } from "./components/GroupsOverview";
import { RecentGroupExpenses } from "./components/RecentGroupExpenses";
import { RecentPersonalExpenses } from "./components/RecentPersonalExpenses";
import { RecentSettlements } from "./components/RecentSettlements";
import "./dashboard.css";

export function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      <div className="app-page">
        <Spinner label="Loading dashboard" />
      </div>
    );
  }

  return (
    <div className="app-page">
      <header className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">Here&apos;s how your money is moving.</p>
      </header>

      <NetHero
        name={user?.name ?? null}
        netMinor={data.overallNetMinor}
        toReceiveMinor={data.groupSumToReceiveMinor}
        toPayMinor={data.groupSumToPayMinor}
        groupCount={data.groupCount}
      />

      <SummaryGrid
        paidMinor={data.groupSumPaidMinor}
        owedMinor={data.groupSumOwedMinor}
        toReceiveMinor={data.groupSumToReceiveMinor}
        toPayMinor={data.groupSumToPayMinor}
        personalSpendingMinor={data.personalSpendingMinor}
      />

      <GroupsOverview groups={data.groups} groupCount={data.groupCount} />

      <RecentGroupExpenses expenses={data.recentGroupExpenses} />

      <RecentPersonalExpenses expenses={data.recentPersonalExpenses} />

      <RecentSettlements
        settlements={data.recentSettlements}
        groups={data.groups}
        currentUserId={user?.id ?? null}
      />
    </div>
  );
}