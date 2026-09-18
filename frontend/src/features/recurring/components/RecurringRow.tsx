import { Icon } from "../../../components/ui/Icon";
import { formatMoney } from "../../../lib/money";
import { SPLIT_METHOD_LABELS } from "../../expenses/lib/splitForm";
import { RECURRING_FREQUENCY_LABELS, type PublicRecurringRule } from "../api/recurringApi";

const DAY_LABEL = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** Render a UTC day key (`YYYY-MM-DD`) without a local-timezone day shift. */
function formatDayKey(dayKey: string): string {
  const [year, month, day] = dayKey.split("-").map(Number);
  if (!year || !month || !day) {
    return dayKey;
  }
  return DAY_LABEL.format(new Date(Date.UTC(year, month - 1, day)));
}

const splitLabel = (rule: PublicRecurringRule): string =>
  rule.group === null
    ? "Personal"
    : SPLIT_METHOD_LABELS.find((entry) => entry.id === rule.splitMethod)?.label ?? rule.splitMethod;

interface RecurringRowProps {
  rule: PublicRecurringRule;
  currency: string;
  memberName: (userId: string) => string;
  archived: boolean;
  busy: boolean;
  onEdit: () => void;
  onToggleActive: () => void;
  onGenerateNow: () => void;
  onDelete: () => void;
}

export function RecurringRow({
  rule,
  currency,
  memberName,
  archived,
  busy,
  onEdit,
  onToggleActive,
  onGenerateNow,
  onDelete,
}: RecurringRowProps) {
  const canAct = rule.canManage && !archived;

  return (
    <li className="recurring-row">
      <div className="recurring-row__main">
        <div>
          <p className="row__primary">
            {rule.title}
            <span className={`badge ${rule.active ? "badge--accent" : "badge--muted"}`}>
              {rule.active ? "Active" : "Paused"}
            </span>
          </p>
          <p className="row__secondary">
            {RECURRING_FREQUENCY_LABELS[rule.frequency]} · {splitLabel(rule)}
            {rule.group !== null && ` · ${memberName(rule.payerId)} pays`}
          </p>
          <p className="row__secondary">
            {rule.active ? `Next on ${formatDayKey(rule.nextOccurrence)}` : "Not scheduled"}
            {rule.endDate && ` · until ${formatDayKey(rule.endDate)}`}
          </p>
        </div>
        <p className="row__meta recurring-row__amount">{formatMoney(rule.amountMinor, currency)}</p>
      </div>

      {canAct && (
        <div className="recurring-row__actions">
          <button className="btn btn--secondary btn--sm" type="button" disabled={busy} onClick={onGenerateNow}>
            <Icon name="clock" size={15} /> Generate now
          </button>
          <button className="btn btn--ghost btn--sm" type="button" disabled={busy} onClick={onToggleActive}>
            {rule.active ? "Pause" : "Resume"}
          </button>
          <button className="btn btn--ghost btn--sm" type="button" disabled={busy} onClick={onEdit}>
            <Icon name="edit" size={15} /> Edit
          </button>
          <button className="btn btn--danger btn--sm" type="button" disabled={busy} onClick={onDelete}>
            <Icon name="trash" size={15} /> Delete
          </button>
        </div>
      )}
    </li>
  );
}
