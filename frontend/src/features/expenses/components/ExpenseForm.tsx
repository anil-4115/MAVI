import { useEffect, useState, type FormEvent } from "react";
import { Banner } from "../../../components/ui/Banner";
import { formatMoney } from "../../../lib/money";
import { getErrorMessage } from "../../../services/api";
import {
  createGroupExpense,
  updateGroupExpense,
  type CreateExpensePayload,
  type ItemwiseItemInput,
  type PublicExpense,
  type SplitMethod,
  type SplitPayload,
} from "../api/expensesApi";
import {
  fromDateInputValue,
  minorToRupeesText,
  parseRupeesToMinor,
  todayDateInputValue,
  toDateInputValue,
} from "../lib/input";

interface ActiveMember {
  userId: string;
  name: string;
}

interface EntryValues {
  quantity: string;
  exact: string;
  percentage: string;
  shares: string;
}

interface ItemDraft {
  key: string;
  title: string;
  amountText: string;
  participantIds: string[];
}

interface FieldErrors {
  title?: string | null;
  amount?: string | null;
  date?: string | null;
  payer?: string | null;
  participants?: string | null;
  method?: string | null;
  entries?: string | null;
  items?: string | null;
}

interface ExpenseFormProps {
  groupId: string;
  members: ActiveMember[];
  currency: string;
  currentUserId: string;
  archived: boolean;
  /** The expense being edited, or null for create mode. */
  initial?: PublicExpense | null;
  onCompleted: () => void;
  onCancel: () => void;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readStringArray = (value: unknown): string[] | null => {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    return null;
  }
  return value as string[];
};

const readUserIdArray = (value: unknown): string[] | null => {
  if (!Array.isArray(value)) {
    return null;
  }
  const ids: string[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry["userId"] !== "string") {
      return null;
    }
    ids.push(entry["userId"] as string);
  }
  return ids;
};

const readEntryByMethod = (splitInput: unknown): { method: SplitMethod; userIds: string[]; entries: Record<string, EntryValues>; items: ItemDraft[] } | null => {
  if (!isRecord(splitInput)) {
    return null;
  }
  const method = splitInput["method"];
  if (typeof method !== "string" || !(["equal", "quantity", "exact", "percentage", "shares", "itemwise"] as const).includes(method as SplitMethod)) {
    return null;
  }
  const splitMethod = method as SplitMethod;

  const emptyEntry = (): EntryValues => ({ quantity: "", exact: "", percentage: "", shares: "" });

  if (splitMethod === "itemwise") {
    const rawItems = splitInput["itemwise"];
    if (!Array.isArray(rawItems)) {
      return null;
    }
    const items: ItemDraft[] = [];
    for (const item of rawItems) {
      if (!isRecord(item) || typeof item["amountMinor"] !== "number" || !Array.isArray(item["participants"])) {
        return null;
      }
      const participants = readStringArray(item["participants"]);
      if (!participants) {
        return null;
      }
      items.push({
        key: cryptoUniqueKey(),
        title: typeof item["title"] === "string" ? item["title"] : "",
        amountText: minorToRupeesText(item["amountMinor"] as number),
        participantIds: participants,
      });
    }
    return { method: splitMethod, userIds: [], entries: {}, items };
  }

  const userIds = readUserIdArray(splitInput[splitMethod]);
  if (!userIds) {
    return null;
  }
  const entries: Record<string, EntryValues> = {};
  for (const userId of userIds) {
    entries[userId] = emptyEntry();
  }
  return { method: splitMethod, userIds, entries, items: [] };
};

let keyCounter = 0;
const cryptoUniqueKey = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  keyCounter += 1;
  return `item-${Date.now()}-${keyCounter}`;
};

const emptyEntry = (): EntryValues => ({ quantity: "", exact: "", percentage: "", shares: "" });

export function ExpenseForm({
  groupId,
  members,
  currency,
  currentUserId,
  archived,
  initial,
  onCompleted,
  onCancel,
}: ExpenseFormProps) {
  const isEditing = Boolean(initial);

  const [title, setTitle] = useState(initial?.title ?? "");
  const [amountText, setAmountText] = useState(initial ? minorToRupeesText(initial.amountMinor) : "");
  const [expenseDate, setExpenseDate] = useState(initial ? toDateInputValue(initial.expenseDate) : todayDateInputValue());
  const [payerId, setPayerId] = useState(initial?.payerId ?? currentUserId);
  const [method, setMethod] = useState<SplitMethod>(initial?.splitMethod ?? "equal");

  const [selected, setSelected] = useState<string[]>(() => {
    const seeded = readEntryByMethod(initial?.splitInput ?? null);
    if (seeded && seeded.method !== "itemwise") {
      return seeded.userIds;
    }
    return members.map((member) => member.userId);
  });
  const [entries, setEntries] = useState<Record<string, EntryValues>>(() => {
    const seeded = readEntryByMethod(initial?.splitInput ?? null);
    if (seeded && seeded.method !== "itemwise") {
      return seeded.entries;
    }
    return {};
  });
  const [items, setItems] = useState<ItemDraft[]>(() => {
    const seeded = readEntryByMethod(initial?.splitInput ?? null);
    return seeded && seeded.method === "itemwise" ? seeded.items : [];
  });

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const memberName = (userId: string): string =>
    members.find((member) => member.userId === userId)?.name ?? "Member";

  const isParticipant = (userId: string): boolean => selected.includes(userId);

  const toggleParticipant = (userId: string) => {
    setSelected((current) =>
      current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId],
    );
  };

  const setEntry = (userId: string, patch: Partial<EntryValues>) => {
    setEntries((current) => ({ ...current, [userId]: { ...emptyEntry(), ...current[userId], ...patch } }));
  };

  useEffect(() => {
    // Keep the payer selection valid when the member set changes.
    if (payerId && !members.some((member) => member.userId === payerId) && members.length > 0) {
      setPayerId(members[0].userId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members]);

  useEffect(() => {
    if (method === "quantity") {
      // Seed quantities to 1 for participants without a value.
      setEntries((current) => {
        const next = { ...current };
        let changed = false;
        for (const userId of selected) {
          if (!next[userId]) {
            next[userId] = emptyEntry();
          }
          if (next[userId].quantity === "") {
            next[userId] = { ...next[userId], quantity: "1" };
            changed = true;
          }
        }
        return changed ? next : current;
      });
    } else if (method === "shares") {
      setEntries((current) => {
        const next = { ...current };
        let changed = false;
        for (const userId of selected) {
          if (!next[userId]) {
            next[userId] = emptyEntry();
          }
          if (next[userId].shares === "") {
            next[userId] = { ...next[userId], shares: "1" };
            changed = true;
          }
        }
        return changed ? next : current;
      });
    }
  }, [method, selected]);

  /* ---------------- computed split stats for live feedback ---------------- */

  const amountMinor = parseRupeesToMinor(amountText);

  const exactStats = (): { sum: number; centsRemain: number | null; entries: number[] } => {
    let sum = 0;
    let valid = 0;
    const entryValues: number[] = [];
    for (const userId of selected) {
      const parsed = parseRupeesToMinor(entries[userId]?.exact ?? "");
      if (parsed === null) {
        entryValues.push(0);
        continue;
      }
      sum += parsed;
      valid += 1;
      entryValues.push(parsed);
    }
    return {
      sum,
      centsRemain: amountMinor === null ? null : amountMinor - sum,
      entries: entryValues,
    };
  };

  const percentageStats = (): { sumBasis: number; remain: number; entries: { userId: string; pct: number | null }[] } => {
    const all = selected.map((userId) => ({ userId, pct: /^\d{1,3}(\.\d{1,2})?$/.test(entries[userId]?.percentage ?? "") ? Number(entries[userId]?.percentage) : null }));
    let sum = 0;
    for (const entry of all) {
      sum += entry.pct === null ? 0 : Math.round(entry.pct * 100);
    }
    return { sumBasis: sum, remain: 10000 - sum, entries: all };
  };

  const itemwiseStats = (): { sum: number | null; centsRemain: number | null } => {
    let sum = 0;
    for (const item of items) {
      const parsed = parseRupeesToMinor(item.amountText);
      if (parsed === null) {
        return { sum: null, centsRemain: null };
      }
      sum += parsed;
    }
    return { sum, centsRemain: amountMinor === null ? null : amountMinor - sum };
  };

  /* -------------------------------- validation ----------------------------- */

  const validate = (): boolean => {
    const errors: FieldErrors = {};
    const trimmedTitle = title.trim();

    if (trimmedTitle.length < 1 || trimmedTitle.length > 120) {
      errors.title = "Title must be between 1 and 120 characters.";
    }
    if (amountMinor === null || amountMinor < 1) {
      errors.amount = "Enter a valid amount greater than zero.";
    }
    if (fromDateInputValue(expenseDate) === undefined) {
      errors.date = "Pick a valid date.";
    }
    if (!members.some((member) => member.userId === payerId)) {
      errors.payer = "Select a payer who is an active member.";
    }

    if (selected.length === 0) {
      errors.participants = "Select at least one participant.";
    }

    switch (method) {
      case "equal":
        break;
      case "quantity": {
        let positive = 0;
        for (const userId of selected) {
          const raw = entries[userId]?.quantity ?? "";
          if (!/^\d+$/.test(raw) || Number(raw) < 0) {
            errors.entries = "Quantities must be whole numbers (0 or more).";
            break;
          }
          if (Number(raw) > 0) {
            positive += 1;
          }
        }
        if (!errors.entries && positive === 0) {
          errors.entries = "At least one quantity must be greater than 0.";
        }
        break;
      }
      case "exact": {
        if (amountMinor !== null) {
          const stats = exactStats();
          const allValid = selected.every((userId) => {
            const parsed = parseRupeesToMinor(entries[userId]?.exact ?? "");
            return parsed !== null && parsed >= 0;
          });
          if (!allValid) {
            errors.entries = "Enter a valid amount for every participant.";
          } else if (stats.sum !== amountMinor) {
            errors.entries = `Amounts must total ${formatMoney(amountMinor, currency)} (currently ${formatMoney(stats.sum, currency)}).`;
          }
        }
        break;
      }
      case "percentage": {
        const stats = percentageStats();
        const allValid = selected.every((userId) => {
          const raw = entries[userId]?.percentage ?? "";
          if (!/^\d{1,3}(\.\d{1,2})?$/.test(raw)) {
            return false;
          }
          const parsed = Number(raw);
          return parsed > 0 && parsed <= 100;
        });
        if (!allValid) {
          errors.entries = "Every participant needs a percentage between 0 and 100 (up to 2 decimals).";
        } else if (stats.sumBasis !== 10000) {
          errors.entries = `Percentages must total exactly 100% (currently ${(stats.sumBasis / 100).toFixed(2)}%).`;
        }
        break;
      }
      case "shares": {
        for (const userId of selected) {
          const raw = entries[userId]?.shares ?? "";
          if (!/^\d+$/.test(raw) || Number(raw) < 1) {
            errors.entries = "Shares must be positive whole numbers.";
            break;
          }
        }
        break;
      }
      case "itemwise": {
        if (items.length === 0) {
          errors.items = "Add at least one item.";
        } else if (amountMinor !== null) {
          const stats = itemwiseStats();
          const amountsValid = stats.sum !== null;
          const participantsValid = items.every((item) => item.participantIds.length > 0);
          if (!amountsValid) {
            errors.items = "Every item needs a valid amount greater than zero.";
          } else if (!participantsValid) {
            errors.items = "Every item needs at least one participant.";
          } else if (stats.sum !== amountMinor) {
            errors.items = `Item amounts must total ${formatMoney(amountMinor, currency)} (currently ${formatMoney(stats.sum ?? 0, currency)}).`;
          }
        }
        break;
      }
    }

    setFieldErrors(errors);
    return Object.values(errors).every((value) => !value);
  };

  /* ------------------------------- submission ------------------------------ */

  const buildSplit = (): SplitPayload => {
    switch (method) {
      case "equal":
        return { method, equal: selected.map((userId) => ({ userId })) };
      case "quantity":
        return { method, quantity: selected.map((userId) => ({ userId, quantity: Number(entries[userId]?.quantity ?? 0) })) };
      case "exact":
        return { method, exact: selected.map((userId) => ({ userId, amountMinor: parseRupeesToMinor(entries[userId]?.exact ?? "0") ?? 0 })) };
      case "percentage":
        return { method, percentage: selected.map((userId) => ({ userId, percentage: Number(entries[userId]?.percentage ?? 0) })) };
      case "shares":
        return { method, shares: selected.map((userId) => ({ userId, shares: Number(entries[userId]?.shares ?? 1) })) };
      case "itemwise": {
        const itemwise: ItemwiseItemInput[] = items.map((item) => ({
          title: item.title.trim() || undefined,
          amountMinor: parseRupeesToMinor(item.amountText) ?? 0,
          participants: item.participantIds,
        }));
        return { method, itemwise };
      }
    }
  };

  const buildPayload = (): CreateExpensePayload => ({
    title: title.trim(),
    amountMinor: amountMinor ?? 0,
    currency,
    expenseDate: fromDateInputValue(expenseDate),
    payerId,
    split: buildSplit(),
  });

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (archived) {
      setSubmitError("Archived groups are read-only.");
      return;
    }
    setSubmitError(null);
    if (!validate()) {
      return;
    }
    setIsSaving(true);
    try {
      if (initial) {
        await updateGroupExpense(
          groupId,
          initial.id,
          { title: buildPayload().title, amountMinor: buildPayload().amountMinor, expenseDate: buildPayload().expenseDate, payerId, split: buildSplit() },
        );
      } else {
        await createGroupExpense(groupId, buildPayload());
      }
      onCompleted();
    } catch (submitFailure) {
      setSubmitError(getErrorMessage(submitFailure));
      setIsSaving(false);
    }
  };

  /* -------------------------------- rendering ------------------------------ */

  const METHOD_LABELS: { id: SplitMethod; label: string }[] = [
    { id: "equal", label: "Equal" },
    { id: "quantity", label: "Quantity" },
    { id: "exact", label: "Exact amount" },
    { id: "percentage", label: "Percentage" },
    { id: "shares", label: "Shares" },
    { id: "itemwise", label: "By items" },
  ];

  const renderSplitEditor = () => {
    if (method === "itemwise") {
      const stats = itemwiseStats();
      return (
        <div className="expense-items" aria-label="Item-wise split">
          <p className="form-hint">
            Each item is split equally among the participants you assign to it. Item amounts must total the
            expense amount.
          </p>
          {fieldErrors.items && <p className="field__error">{fieldErrors.items}</p>}
          {stats.centsRemain !== null && (
            <p className={`expense-items__balance${stats.centsRemain === 0 ? "" : " expense-items__balance--warn"}`}>
              Items total {formatMoney(stats.sum ?? 0, currency)} of {amountMinor !== null ? formatMoney(amountMinor, currency) : "—"} ·{" "}
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
                        setItems(next);
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
                        setItems(next);
                      }}
                    />
                  </div>
                  <button
                    className="btn btn--danger btn--sm expense-item__remove"
                    type="button"
                    onClick={() => setItems((current) => current.filter((entry) => entry.key !== item.key))}
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
                              setItems(next);
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
            onClick={() =>
              setItems((current) => [
                ...current,
                { key: cryptoUniqueKey(), title: "", amountText: "", participantIds: [] },
              ])
            }
          >
            Add item
          </button>
        </div>
      );
    }

    const showEntryInputs =
      method === "quantity" || method === "exact" || method === "percentage" || method === "shares";

    return (
      <div>
        <p className="form-hint">Who is involved in this expense?</p>
        {fieldErrors.participants && <p className="field__error">{fieldErrors.participants}</p>}
        <div className="expense-participant-grid">
          {members.map((member) => {
            const checked = isParticipant(member.userId);
            return (
              <label key={member.userId} className="expense-check">
                <input type="checkbox" checked={checked} onChange={() => toggleParticipant(member.userId)} />
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
                      onChange={(event) => setEntry(userId, { quantity: event.target.value })}
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
                      onChange={(event) => setEntry(userId, { shares: event.target.value })}
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
                      onChange={(event) => setEntry(userId, { exact: event.target.value })}
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
                      onChange={(event) => setEntry(userId, { percentage: event.target.value })}
                    />
                  </div>
                </div>
              ))}

            {method === "exact" && amountMinor !== null && (
              <p
                className={`expense-balance${exactStats().centsRemain === 0 ? "" : " expense-balance--warn"}`}
              >
                Amounts total {formatMoney(exactStats().sum, currency)} of {formatMoney(amountMinor, currency)}.
              </p>
            )}
            {method === "percentage" && (
              <p
                className={`expense-balance${percentageStats().sumBasis === 10000 ? "" : " expense-balance--warn"}`}
              >
                Percentages total {(percentageStats().sumBasis / 100).toFixed(2)}% — must equal 100%.
              </p>
            )}
            {fieldErrors.entries && <p className="field__error">{fieldErrors.entries}</p>}
          </div>
        )}
      </div>
    );
  };

  return (
    <form className="card expense-form" onSubmit={handleSubmit} noValidate>
      <h2 className="card__title">{isEditing ? "Edit expense" : "Add expense"}</h2>

      {archived && <Banner tone="error">Archived groups are read-only; expenses can&apos;t be added or changed.</Banner>}
      {submitError && <Banner tone="error">{submitError}</Banner>}

      <div className="form">
        <div className={`field${fieldErrors.title ? " field--invalid" : ""}`}>
          <label htmlFor="expense-title">Title</label>
          <input
            id="expense-title"
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="What was it for?"
          />
          {fieldErrors.title && <p className="field__error">{fieldErrors.title}</p>}
        </div>

        <div className="expense-form__row">
          <div className={`field${fieldErrors.amount ? " field--invalid" : ""}`}>
            <label htmlFor="expense-amount">Amount (₹)</label>
            <input
              id="expense-amount"
              type="text"
              inputMode="decimal"
              value={amountText}
              onChange={(event) => setAmountText(event.target.value)}
              placeholder="0.00"
            />
            {fieldErrors.amount && <p className="field__error">{fieldErrors.amount}</p>}
          </div>
          <div className={`field${fieldErrors.date ? " field--invalid" : ""}`}>
            <label htmlFor="expense-date">Date</label>
            <input
              id="expense-date"
              type="date"
              value={expenseDate}
              onChange={(event) => setExpenseDate(event.target.value)}
            />
            {fieldErrors.date && <p className="field__error">{fieldErrors.date}</p>}
          </div>
          <div className={`field${fieldErrors.payer ? " field--invalid" : ""}`}>
            <label htmlFor="expense-payer">Paid by</label>
            <select id="expense-payer" value={payerId} onChange={(event) => setPayerId(event.target.value)}>
              {members.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.name}
                </option>
              ))}
            </select>
            {fieldErrors.payer && <p className="field__error">{fieldErrors.payer}</p>}
          </div>
        </div>

        <div>
          <p className="form-hint">How is this split?</p>
          <div className="expense-methods" role="group" aria-label="Split method">
            {METHOD_LABELS.map((option) => (
              <label
                key={option.id}
                className={`expense-method${method === option.id ? " expense-method--active" : ""}`}
              >
                <input
                  type="radio"
                  name="split-method"
                  value={option.id}
                  checked={method === option.id}
                  onChange={() => setMethod(option.id)}
                />
                {option.label}
              </label>
            ))}
          </div>
        </div>

        {renderSplitEditor()}

        <div className="form__actions">
          <button className="btn" type="submit" disabled={isSaving}>
            {isSaving ? "Saving…" : isEditing ? "Save changes" : "Add expense"}
          </button>
          <button className="btn btn--secondary" type="button" onClick={onCancel} disabled={isSaving}>
            Cancel
          </button>
        </div>
      </div>
    </form>
  );
}