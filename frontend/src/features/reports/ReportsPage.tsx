import { useState } from "react";
import { currentMonthKey } from "../analytics/api/analyticsApi";
import { useSpendingAnalytics } from "../analytics/useSpendingAnalytics";
import { SpendingAnalyticsCard } from "../analytics/components/SpendingAnalyticsCard";

export function ReportsPage() {
  const [monthKey, setMonthKey] = useState<string>(() => currentMonthKey());
  const analytics = useSpendingAnalytics(monthKey);

  return (
    <div className="app-page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Analytics</h1>
          <p className="page-subtitle">Understand how your money is being spent.</p>
        </div>
      </header>
      <SpendingAnalyticsCard
        monthKey={monthKey}
        onMonthChange={setMonthKey}
        data={analytics.data}
        error={analytics.error}
        loading={analytics.loading}
        onRetry={analytics.reload}
      />
    </div>
  );
}