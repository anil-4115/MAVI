import { useEffect, useState, type FormEvent } from "react";
import { Banner } from "../../../components/ui/Banner";
import { getErrorMessage } from "../../../services/api";
import {
  createGroupExpense,
  deleteGroupAttachment,
  getGroupAttachment,
  updateGroupExpense,
  uploadGroupAttachment,
  type CreateExpensePayload,
  type PublicExpense,
  type PublicExpenseAttachment,
  type SplitMethod,
} from "../api/expensesApi";
import {
  fromDateInputValue,
  minorToRupeesText,
  parseRupeesToMinor,
  todayDateInputValue,
  toDateInputValue,
} from "../lib/input";
import {
  buildSplitPayload,
  emptyEntry,
  readEntryByMethod,
  SPLIT_METHOD_LABELS,
  validateSplit,
  type EntryValues,
  type ItemDraft,
  type SplitFieldErrors,
} from "../lib/splitForm";
import { ReceiptAttachment } from "./ReceiptAttachment";
import { SplitEditor } from "./SplitEditor";

interface ActiveMember {
  userId: string;
  name: string;
}

interface FieldErrors extends SplitFieldErrors {
  title?: string | null;
  amount?: string | null;
  date?: string | null;
  payer?: string | null;
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

  /*
   * Receipt attachment state. In create mode there is no expense id yet, so a
   * picked file is held as `pendingFile` and uploaded only after the expense is
   * created. In edit mode the existing attachment is managed directly.
   */
  const [attachment, setAttachment] = useState<PublicExpenseAttachment | null>(initial?.attachment ?? null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

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

  const amountMinor = parseRupeesToMinor(amountText);

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

    Object.assign(errors, validateSplit({ method, currency, amountMinor, selected, entries, items }));

    setFieldErrors(errors);
    return Object.values(errors).every((value) => !value);
  };

  /* ------------------------------- submission ------------------------------ */

  const buildSplit = () => buildSplitPayload(method, selected, entries, items);

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
        const created = await createGroupExpense(groupId, buildPayload());
        if (pendingFile) {
          try {
            await uploadGroupAttachment(groupId, created.id, pendingFile);
          } catch {
            // Best-effort: an optional receipt must never fail the expense save.
          }
        }
      }
      onCompleted();
    } catch (submitFailure) {
      setSubmitError(getErrorMessage(submitFailure));
      setIsSaving(false);
    }
  };

  /* -------------------------------- rendering ------------------------------ */

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
            {SPLIT_METHOD_LABELS.map((option) => (
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

        <div className="receipt-block">
          <p className="form-hint">Receipt (optional)</p>
          {initial ? (
            <ReceiptAttachment
              attachment={attachment}
              canModify={!archived}
              getBlob={() => getGroupAttachment(groupId, initial.id)}
              onUpload={async (file) => {
                const updated = await uploadGroupAttachment(groupId, initial.id, file);
                setAttachment(updated.attachment);
              }}
              onRemove={async () => {
                const updated = await deleteGroupAttachment(groupId, initial.id);
                setAttachment(updated.attachment);
              }}
            />
          ) : (
            <ReceiptAttachment
              attachment={null}
              canModify={!archived}
              pendingFile={pendingFile}
              onPendingFileChange={setPendingFile}
            />
          )}
        </div>

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
