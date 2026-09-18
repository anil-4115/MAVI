import { useEffect, useState, type FormEvent } from "react";
import { Banner } from "../../../components/ui/Banner";
import { getErrorMessage } from "../../../services/api";
import {
  minorToRupeesText,
  parseRupeesToMinor,
  todayDateInputValue,
} from "../../expenses/lib/input";
import {
  buildSplitPayload,
  emptyEntry,
  readEntryByMethod,
  SPLIT_METHOD_LABELS,
  validateSplit,
  type EntryValues,
  type ItemDraft,
  type SplitFieldErrors,
  type SplitMember,
} from "../../expenses/lib/splitForm";
import { SplitEditor } from "../../expenses/components/SplitEditor";
import type { SplitMethod } from "../../expenses/api/expensesApi";
import {
  RECURRING_FREQUENCIES,
  RECURRING_FREQUENCY_LABELS,
  type CreateGroupRulePayload,
  type CreatePersonalRulePayload,
  type PublicRecurringRule,
  type RecurringFrequency,
  type UpdateRulePayload,
} from "../api/recurringApi";
import type { RecurringScope } from "../hooks/useRecurring";

interface FieldErrors extends SplitFieldErrors {
  title?: string | null;
  amount?: string | null;
  date?: string | null;
  payer?: string | null;
}

interface RecurringFormProps {
  scope: RecurringScope;
  members: SplitMember[];
  currency: string;
  currentUserId: string;
  archived: boolean;
  initial?: PublicRecurringRule | null;
  onCreate: (payload: CreatePersonalRulePayload | CreateGroupRulePayload) => Promise<PublicRecurringRule>;
  onUpdate: (ruleId: string, payload: UpdateRulePayload) => Promise<PublicRecurringRule>;
  onCompleted: () => void;
  onCancel: () => void;
}

export function RecurringForm({
  scope,
  members,
  currency,
  currentUserId,
  archived,
  initial,
  onCreate,
  onUpdate,
  onCompleted,
  onCancel,
}: RecurringFormProps) {
  const isGroup = scope.type === "group";
  const isEditing = Boolean(initial);

  const [title, setTitle] = useState(initial?.title ?? "");
  const [amountText, setAmountText] = useState(initial ? minorToRupeesText(initial.amountMinor) : "");
  const [frequency, setFrequency] = useState<RecurringFrequency>(initial?.frequency ?? "monthly");
  const [startDate, setStartDate] = useState(initial ? initial.startDate : todayDateInputValue());
  const [endDate, setEndDate] = useState(initial?.endDate ?? "");
  const [payerId, setPayerId] = useState(
    initial?.payerId ?? (members.some((member) => member.userId === currentUserId) ? currentUserId : members[0]?.userId ?? ""),
  );
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

  useEffect(() => {
    if (payerId && !members.some((member) => member.userId === payerId) && members.length > 0) {
      setPayerId(members[0].userId);
    }
  }, [members, payerId]);

  useEffect(() => {
    if (method !== "quantity" && method !== "shares") {
      return;
    }
    setEntries((current) => {
      const next = { ...current };
      let changed = false;
      for (const userId of selected) {
        if (!next[userId]) {
          next[userId] = emptyEntry();
          changed = true;
        }
        if (method === "quantity" && next[userId].quantity === "") {
          next[userId] = { ...next[userId], quantity: "1" };
          changed = true;
        }
        if (method === "shares" && next[userId].shares === "") {
          next[userId] = { ...next[userId], shares: "1" };
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [method, selected]);

  const amountMinor = parseRupeesToMinor(amountText);

  const toggleParticipant = (userId: string) => {
    setSelected((current) =>
      current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId],
    );
  };

  const setEntry = (userId: string, patch: Partial<EntryValues>) => {
    setEntries((current) => ({ ...current, [userId]: { ...emptyEntry(), ...current[userId], ...patch } }));
  };

  const validate = (): boolean => {
    const errors: FieldErrors = {};
    const trimmedTitle = title.trim();

    if (trimmedTitle.length < 1 || trimmedTitle.length > 120) {
      errors.title = "Title must be between 1 and 120 characters.";
    }
    if (amountMinor === null || amountMinor < 1) {
      errors.amount = "Enter a valid amount greater than zero.";
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      errors.date = "Pick a valid start date.";
    }
    if (endDate !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      errors.date = "Pick a valid end date.";
    }
    if (endDate !== "" && endDate < startDate) {
      errors.date = "End date cannot be before the start date.";
    }

    if (isGroup) {
      if (!members.some((member) => member.userId === payerId)) {
        errors.payer = "Select a payer who is an active member.";
      }
      Object.assign(errors, validateSplit({ method, currency, amountMinor, selected, entries, items }));
    }

    setFieldErrors(errors);
    return Object.values(errors).every((value) => !value);
  };

  const buildCommon = () => ({
    title: title.trim(),
    amountMinor: amountMinor ?? 0,
    currency,
    frequency,
    startDate,
    endDate: endDate.trim() === "" ? null : endDate,
  });

  const buildSplit = () => buildSplitPayload(method, selected, entries, items);

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
      if (isGroup) {
        const payload: CreateGroupRulePayload = { ...buildCommon(), payerId, split: buildSplit() };
        if (initial) {
          await onUpdate(initial.id, payload);
        } else {
          await onCreate(payload);
        }
      } else {
        const payload: CreatePersonalRulePayload = buildCommon();
        if (initial) {
          await onUpdate(initial.id, payload);
        } else {
          await onCreate(payload);
        }
      }
      onCompleted();
    } catch (submitFailure) {
      setSubmitError(getErrorMessage(submitFailure));
      setIsSaving(false);
    }
  };

  return (
    <form className="card expense-form" onSubmit={handleSubmit} noValidate>
      <h2 className="card__title">{isEditing ? "Edit recurring rule" : "New recurring rule"}</h2>

      {archived && <Banner tone="error">Archived groups are read-only; recurring rules can&apos;t be changed.</Banner>}
      {submitError && <Banner tone="error">{submitError}</Banner>}

      <div className="form">
        <div className={`field${fieldErrors.title ? " field--invalid" : ""}`}>
          <label htmlFor="recurring-title">Title</label>
          <input
            id="recurring-title"
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Rent, subscription, EMI…"
          />
          {fieldErrors.title && <p className="field__error">{fieldErrors.title}</p>}
        </div>

        <div className="expense-form__row">
          <div className={`field${fieldErrors.amount ? " field--invalid" : ""}`}>
            <label htmlFor="recurring-amount">Amount (₹)</label>
            <input
              id="recurring-amount"
              type="text"
              inputMode="decimal"
              value={amountText}
              onChange={(event) => setAmountText(event.target.value)}
              placeholder="0.00"
            />
            {fieldErrors.amount && <p className="field__error">{fieldErrors.amount}</p>}
          </div>
          <div className="field">
            <label htmlFor="recurring-frequency">Repeats</label>
            <select
              id="recurring-frequency"
              value={frequency}
              onChange={(event) => setFrequency(event.target.value as RecurringFrequency)}
            >
              {RECURRING_FREQUENCIES.map((option) => (
                <option key={option} value={option}>
                  {RECURRING_FREQUENCY_LABELS[option]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="expense-form__row">
          <div className={`field${fieldErrors.date ? " field--invalid" : ""}`}>
            <label htmlFor="recurring-start">Starts</label>
            <input
              id="recurring-start"
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </div>
          <div className={`field${fieldErrors.date ? " field--invalid" : ""}`}>
            <label htmlFor="recurring-end">Ends (optional)</label>
            <input
              id="recurring-end"
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </div>
        </div>
        {fieldErrors.date && <p className="field__error">{fieldErrors.date}</p>}

        {isGroup && (
          <>
            <div className={`field${fieldErrors.payer ? " field--invalid" : ""}`}>
              <label htmlFor="recurring-payer">Paid by</label>
              <select id="recurring-payer" value={payerId} onChange={(event) => setPayerId(event.target.value)}>
                {members.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.name}
                  </option>
                ))}
              </select>
              {fieldErrors.payer && <p className="field__error">{fieldErrors.payer}</p>}
            </div>

            <div>
              <p className="form-hint">How is this split?</p>
              <div className="expense-methods" role="group" aria-label="Split method">
                {SPLIT_METHOD_LABELS.map((option) => (
                  <label
                    key={option.id}
                    className={`expense-method${method === option.id ? " expense-method--active" : ""}`}
                  >
                    <input
                      type="radio"
                      name="recurring-split-method"
                      value={option.id}
                      checked={method === option.id}
                      onChange={() => setMethod(option.id)}
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </div>

            <SplitEditor
              method={method}
              members={members}
              currency={currency}
              amountMinor={amountMinor}
              selected={selected}
              entries={entries}
              items={items}
              errors={fieldErrors}
              onToggleParticipant={toggleParticipant}
              onEntryChange={setEntry}
              onItemsChange={setItems}
            />
          </>
        )}

        <p className="form-hint">
          Generated automatically on the scheduled date with no notification. Use Generate now to create today&apos;s
          occurrence immediately.
        </p>

        <div className="form__actions">
          <button className="btn" type="submit" disabled={isSaving || archived}>
            {isSaving ? "Saving…" : isEditing ? "Save changes" : "Create rule"}
          </button>
          <button className="btn btn--secondary" type="button" onClick={onCancel} disabled={isSaving}>
            Cancel
          </button>
        </div>
      </div>
    </form>
  );
}
