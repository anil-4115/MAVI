import { formatMoney } from "../../../lib/money";
import type { SplitMethod } from "../api/expensesApi";
import {
  createEmptyItem,
  exactStats,
  itemwiseStats,
  percentageStats,
  type EntryValues,
  type ItemDraft,
  type SplitFieldErrors,
  type SplitMember,
} from "../lib/splitForm";

interface SplitEditorProps {
  method: SplitMethod;
  members: SplitMember[];
  currency: string;
  amountMinor: number | null;
  selected: string[];
  entries: Record<string, EntryValues>;
  items: ItemDraft[];
  errors: SplitFieldErrors;
  onToggleParticipant: (userId: string) => void;
  onEntryChange: (userId: string, patch: Partial<EntryValues>) => void;
  onItemsChange: (items: ItemDraft[]) => void;
}

/**
 * Presentational split editor shared by the expense and recurring forms.
 * Rendering is driven entirely by props; the parent owns the state.
 */
export function SplitEditor({
  method,
  members,
  currency,
  amountMinor,
  selected,
  entries,
  items,
  errors,
  onToggleParticipant,
  onEntryChange,
  onItemsChange,
}: SplitEditorProps) {
  const memberName = (userId: string): string =>
    members.find((member) => member.userId === userId)?.name ?? "Member";

  if (method === "itemwise") {
    const stats = itemwiseStats({ amountMinor, selected, entries, items });
    return (
      <div className="expense-items" aria-label="Item-wise split">
        <p className="form-hint">
          Each item is split equally among the participants you assign to it. Item amounts must total the expense
          amount.
        </p>
        {errors.items && <p className="field__error">{errors.items}</p>}
        {stats.centsRemain !== null && (
          <p className={`expense-items__balance${stats.centsRemain === 0 ? "" : " expense-items__balance--warn"}`}>
            Items total {formatMoney(stats.sum ?? 0, currency)} of{" "}
            {amountMinor !== null ? formatMoney(amountMinor, currency) : "—"} ·{" "}
            {stats.centsRemain === 0 ? "0 remaining" : `${formatMoney(stats.centsRemain, currency)} remaining`}
          </p>
        )}
        <ul className="expense-items__list">
          {items.map((item, index) => (
            <li key={item.key} className="expense-item">
              <div className="expense-item__row">
                <div className="field expense-item__title">
                  <label htmlFor={`item-title-${item.key}`}>Item name</label>
                  <input
                    id={`item-title-${item.key}`}
                    type="text"
                    value={item.title}
                    onChange={(event) => {
                      const next = [...items];
                      next[index] = { ...next[index], title: event.target.value };
                      onItemsChange(next);
                    }}
                  />
                </div>
                <div className="field expense-item__amount">
                  <label htmlFor={`item-amount-${item.key}`}>Amount (₹)</label>
                  <input
                    id={`item-amount-${item.key}`}
                    type="text"
                    inputMode="decimal"
                    value={item.amountText}
                    onChange={(event) => {
                      const next = [...items];
                      next[index] = { ...next[index], amountText: event.target.value };
                      onItemsChange(next);
                    }}
                  />
                </div>
                <button
                  className="btn btn--danger btn--sm expense-item__remove"
                  type="button"
                  onClick={() => onItemsChange(items.filter((entry) => entry.key !== item.key))}
                  aria-label={`Remove item ${index + 1}`}
                >
                  Remove
                </button>
              </div>
              <div className="expense-item__participants">
                <p className="form-hint">Who splits this item?</p>
                <div className="expense-participant-grid">
                  {members.map((member) => {
                    const checked = item.participantIds.includes(member.userId);
                    return (
                      <label key={`${item.key}-${member.userId}`} className="expense-check">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            const next = [...items];
                            next[index] = {
                              ...next[index],
                              participantIds: checked
                                ? next[index].participantIds.filter((id) => id !== member.userId)
                                : [...next[index].participantIds, member.userId],
                            };
                            onItemsChange(next);
                          }}
                        />
                        {member.name}
                      </label>
                    );
                  })}
                </div>
              </div>
            </li>
          ))}
        </ul>
        <button
          className="btn btn--secondary btn--sm"
          type="button"
          onClick={() => onItemsChange([...items, createEmptyItem()])}
        >
          Add item
        </button>
      </div>
    );
  }

  const showEntryInputs =
    method === "quantity" || method === "exact" || method === "percentage" || method === "shares";

  const exact = method === "exact" ? exactStats({ amountMinor, selected, entries, items }) : null;
  const percentage = method === "percentage" ? percentageStats({ amountMinor, selected, entries, items }) : null;

  return (
    <div>
      <p className="form-hint">Who is involved in this expense?</p>
      {errors.participants && <p className="field__error">{errors.participants}</p>}
      <div className="expense-participant-grid">
        {members.map((member) => {
          const checked = selected.includes(member.userId);
          return (
            <label key={member.userId} className="expense-check">
              <input type="checkbox" checked={checked} onChange={() => onToggleParticipant(member.userId)} />
              {member.name}
            </label>
          );
        })}
      </div>

      {showEntryInputs && (
        <div className="expense-entries">
          {method === "quantity" &&
            selected.map((userId) => (
              <div key={userId} className="expense-entry">
                <span className="expense-entry__name">{memberName(userId)}</span>
                <div className="field expense-entry__field">
                  <label htmlFor={`entry-quantity-${userId}`}>Quantity</label>
                  <input
                    id={`entry-quantity-${userId}`}
                    type="text"
                    inputMode="numeric"
                    value={entries[userId]?.quantity ?? ""}
                    onChange={(event) => onEntryChange(userId, { quantity: event.target.value })}
                  />
                </div>
              </div>
            ))}
          {method === "shares" &&
            selected.map((userId) => (
              <div key={userId} className="expense-entry">
                <span className="expense-entry__name">{memberName(userId)}</span>
                <div className="field expense-entry__field">
                  <label htmlFor={`entry-shares-${userId}`}>Shares</label>
                  <input
                    id={`entry-shares-${userId}`}
                    type="text"
                    inputMode="numeric"
                    value={entries[userId]?.shares ?? ""}
                    onChange={(event) => onEntryChange(userId, { shares: event.target.value })}
                  />
                </div>
              </div>
            ))}
          {method === "exact" &&
            selected.map((userId) => (
              <div key={userId} className="expense-entry">
                <span className="expense-entry__name">{memberName(userId)}</span>
                <div className="field expense-entry__field">
                  <label htmlFor={`entry-exact-${userId}`}>Amount (₹)</label>
                  <input
                    id={`entry-exact-${userId}`}
                    type="text"
                    inputMode="decimal"
                    value={entries[userId]?.exact ?? ""}
                    onChange={(event) => onEntryChange(userId, { exact: event.target.value })}
                  />
                </div>
              </div>
            ))}
          {method === "percentage" &&
            selected.map((userId) => (
              <div key={userId} className="expense-entry">
                <span className="expense-entry__name">{memberName(userId)}</span>
                <div className="field expense-entry__field">
                  <label htmlFor={`entry-percentage-${userId}`}>%</label>
                  <input
                    id={`entry-percentage-${userId}`}
                    type="text"
                    inputMode="decimal"
                    value={entries[userId]?.percentage ?? ""}
                    onChange={(event) => onEntryChange(userId, { percentage: event.target.value })}
                  />
                </div>
              </div>
            ))}

          {method === "exact" && amountMinor !== null && exact && (
            <p className={`expense-balance${exact.centsRemain === 0 ? "" : " expense-balance--warn"}`}>
              Amounts total {formatMoney(exact.sum, currency)} of {formatMoney(amountMinor, currency)}.
            </p>
          )}
          {method === "percentage" && percentage && (
            <p className={`expense-balance${percentage.sumBasis === 10000 ? "" : " expense-balance--warn"}`}>
              Percentages total {(percentage.sumBasis / 100).toFixed(2)}% — must equal 100%.
            </p>
          )}
          {errors.entries && <p className="field__error">{errors.entries}</p>}
        </div>
      )}
    </div>
  );
}
