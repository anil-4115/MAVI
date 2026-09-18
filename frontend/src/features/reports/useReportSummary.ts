import { useCallback, useEffect, useState } from "react";
import { getErrorMessage } from "../../services/api";
import { getReportSummary, type ReportQuery, type ReportSummary } from "./api/reportsApi";

export interface ReportSummaryState {
  data: ReportSummary | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

/** Load a derived report for the applied query (backend aggregates every number). */
export function useReportSummary(query: ReportQuery): ReportSummaryState {
  const [data, setData] = useState<ReportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { scope, groupId, from, to } = query;

  const load = useCallback(async () => {
    setError(null);
    setData(null);
    try {
      setData(await getReportSummary({ scope, groupId, from, to }));
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    }
  }, [scope, groupId, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, error, loading: !data && !error, reload: () => void load() };
}