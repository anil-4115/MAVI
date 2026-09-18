import { Icon } from "../../../components/ui/Icon";
import type { PublicGroup } from "../../groups/api/groupsApi";

export type ReportScopeDraft = "all" | "personal";

interface ReportFiltersProps {
  scope: ReportScopeDraft;
  groupId: string;
  from: string;
  to: string;
  groups: PublicGroup[];
  validationError: string | null;
  busy: boolean;
  onScopeChange: (scope: ReportScopeDraft) => void;
  onGroupChange: (groupId: string) => void;
  onFromChange: (from: string) => void;
  onToChange: (to: string) => void;
  onApply: () => void;
  onReset: () => void;
}

/** Filter card: date range, scope toggle and group selector. */
export function ReportFilters({
  scope,
  groupId,
  from,
  to,
  groups,
  validationError,
  busy,
  onScopeChange,
  onGroupChange,
  onFromChange,
  onToChange,
  onApply,
  onReset,
}: ReportFiltersProps) {
  return (
    <section className="card reports-filters" aria-label="Report filters">
      <div className="reports-filters__row">
        <div className="field reports-filters__dates">
          <label htmlFor="report-from">From</label>
          <input
            id="report-from"
            type="date"
            value={from}
            max={to || undefined}
            onChange={(event) => onFromChange(event.target.value)}
          />
        </div>
        <div className="field reports-filters__dates">
          <label htmlFor="report-to">To</label>
          <input
            id="report-to"
            type="date"
            value={to}
            min={from || undefined}
            onChange={(event) => onToChange(event.target.value)}
          />
        </div>

        <div className="field reports-filters__scope">
          <span className="reports-filters__label">Scope</span>
          <div className="segmented" role="group" aria-label="Report scope">
            <button
              type="button"
              className={`segmented__option${scope === "all" ? " segmented__option--active" : ""}`}
              aria-pressed={scope === "all"}
              onClick={() => onScopeChange("all")}
            >
              All
            </button>
            <button
              type="button"
              className={`segmented__option${scope === "personal" ? " segmented__option--active" : ""}`}
              aria-pressed={scope === "personal"}
              onClick={() => onScopeChange("personal")}
            >
              Personal only
            </button>
          </div>
        </div>

        <div className="field reports-filters__group">
          <label htmlFor="report-group">Group</label>
          <select
            id="report-group"
            value={groupId}
            disabled={scope === "personal"}
            onChange={(event) => onGroupChange(event.target.value)}
          >
            <option value="">All groups</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.archived ? `${group.name} (archived)` : group.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {validationError && (
        <p className="reports-filters__error" role="alert">
          <Icon name="alert" size={15} /> {validationError}
        </p>
      )}

      <div className="reports-filters__actions">
        <button type="button" className="btn btn--ghost btn--sm" onClick={onReset} disabled={busy}>
          Reset
        </button>
        <button type="button" className="btn btn--sm" onClick={onApply} disabled={busy}>
          <Icon name="filter" size={15} /> Apply filters
        </button>
      </div>
    </section>
  );
}