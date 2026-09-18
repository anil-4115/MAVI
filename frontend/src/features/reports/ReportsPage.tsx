import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "../../components/ui/EmptyState";
import { ErrorState } from "../../components/ui/ErrorState";
import { Spinner } from "../../components/ui/Spinner";
import { CategoryDonutChart } from "../analytics/components/CategoryDonutChart";
import type { CategorySpend, SpendingCategory } from "../analytics/api/analyticsApi";
import { listGroups, type PublicGroup } from "../groups/api/groupsApi";
import { buildPdf, downloadPdf, pdfFilename } from "../../lib/pdf";
import { csvFilename, downloadCsv } from "../../lib/csv";
import type { ReportQuery, ReportScope } from "./api/reportsApi";
import { ReportFilters, type ReportScopeDraft } from "./components/ReportFilters";
import { ReportGroupBreakdown } from "./components/ReportGroupBreakdown";
import { ReportSummaryCards } from "./components/ReportSummaryCards";
import { ReportTransactions } from "./components/ReportTransactions";
import { useReportSummary } from "./useReportSummary";
import { reportToCsv, reportToPdfLines } from "./utils/reportExport";
import "./reports.css";

function toDayKey(date: Date): string {
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${date.getUTCFullYear()}-${month}-${day}`;
}

function monthStartKey(): string {
  const now = new Date();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${now.getUTCFullYear()}-${month}-01`;
}

function todayKey(): string {
  return toDayKey(new Date());
}

export function ReportsPage() {
  const [scopeDraft, setScopeDraft] = useState<ReportScopeDraft>("all");
  const [groupIdDraft, setGroupIdDraft] = useState("");
  const [fromDraft, setFromDraft] = useState(monthStartKey);
  const [toDraft, setToDraft] = useState(todayKey);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [query, setQuery] = useState<ReportQuery>(() => ({
    scope: "all",
    from: monthStartKey(),
    to: todayKey(),
  }));

  const [groups, setGroups] = useState<PublicGroup[]>([]);

  useEffect(() => {
    let active = true;
    Promise.all([listGroups("active"), listGroups("archived")])
      .then(([activeGroups, archivedGroups]) => {
        if (!active) return;
        setGroups([...activeGroups, ...archivedGroups].sort((a, b) => a.name.localeCompare(b.name)));
      })
      .catch(() => {
        /* Filter degrades gracefully to "All groups". */
      });
    return () => {
      active = false;
    };
  }, []);

  const { data, error, loading, reload } = useReportSummary(query);

  const categorySpends = useMemo<CategorySpend[]>(
    () =>
      (data?.categories ?? []).map((entry) => ({
        category: entry.category as SpendingCategory,
        amountMinor: entry.amountMinor,
      })),
    [data],
  );

  const buildQuery = (): ReportQuery => {
    const scope: ReportScope = scopeDraft === "personal" ? "personal" : groupIdDraft ? "group" : "all";
    return {
      scope,
      groupId: scope === "group" ? groupIdDraft : undefined,
      from: fromDraft,
      to: toDraft,
    };
  };

  const handleApply = () => {
    if (!fromDraft || !toDraft) {
      setValidationError("Choose both a start and an end date.");
      return;
    }
    if (fromDraft > toDraft) {
      setValidationError("The start date must be on or before the end date.");
      return;
    }
    setValidationError(null);
    setQuery(buildQuery());
  };

  const handleReset = () => {
    const from = monthStartKey();
    const to = todayKey();
    setScopeDraft("all");
    setGroupIdDraft("");
    setFromDraft(from);
    setToDraft(to);
    setValidationError(null);
    setQuery({ scope: "all", from, to });
  };

  const handleScopeChange = (next: ReportScopeDraft) => {
    setScopeDraft(next);
    if (next === "personal") setGroupIdDraft("");
  };

  const handleExportCsv = () => {
    if (!data) return;
    downloadCsv(csvFilename("mavi-report", data.range.from, data.range.to), reportToCsv(data));
  };

  const handleExportPdf = () => {
    if (!data) return;
    downloadPdf(
      pdfFilename("mavi-report", data.range.from, data.range.to),
      buildPdf(reportToPdfLines(data)),
    );
  };

  const hasContent = data !== null && (data.expenseCount > 0 || data.groups.length > 0);

  return (
    <div className="app-page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Reports</h1>
          <p className="page-subtitle">Filter, understand and export your spending.</p>
        </div>
        <div className="reports-export">
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={handleExportCsv}
            disabled={!data}
          >
            Export CSV
          </button>
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={handleExportPdf}
            disabled={!data}
          >
            Export PDF
          </button>
        </div>
      </header>

      <ReportFilters
        scope={scopeDraft}
        groupId={groupIdDraft}
        from={fromDraft}
        to={toDraft}
        groups={groups}
        validationError={validationError}
        busy={loading}
        onScopeChange={handleScopeChange}
        onGroupChange={setGroupIdDraft}
        onFromChange={setFromDraft}
        onToChange={setToDraft}
        onApply={handleApply}
        onReset={handleReset}
      />

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading || !data ? (
        <Spinner label="Loading report" />
      ) : !hasContent ? (
        <EmptyState
          title="No spending in this range"
          description="Adjust the filters or add an expense to see a report."
          icon="reports"
        />
      ) : (
        <div className="reports-sections">
          <ReportSummaryCards summary={data} />

          {categorySpends.length > 0 && (
            <section className="card" aria-label="Spending by category">
              <div className="card__header">
                <h3 className="card__title">Spending by category</h3>
              </div>
              <CategoryDonutChart
                categories={categorySpends}
                totalMinor={data.totalSpentMinor}
                currency={data.currency}
              />
            </section>
          )}

          {data.scope !== "personal" && <ReportGroupBreakdown summary={data} />}

          <ReportTransactions summary={data} />
        </div>
      )}
    </div>
  );
}