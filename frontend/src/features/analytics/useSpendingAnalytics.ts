import { useCallback, useEffect, useState } from "react";
import { getErrorMessage } from "../../services/api";
import { getSpendingAnalytics, type SpendingAnalytics } from "./api/analyticsApi";

export interface SpendingAnalyticsState {
  data: SpendingAnalytics | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

/** Load monthly spending analytics for a given month key (YYYY-MM). */
export function useSpendingAnalytics(monthKey: string): SpendingAnalyticsState {
  const [data, setData] = useState<SpendingAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setData(null);
    try {
      setData(await getSpendingAnalytics(monthKey));
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    }
  }, [monthKey]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, error, loading: !data && !error, reload: () => void load() };
}