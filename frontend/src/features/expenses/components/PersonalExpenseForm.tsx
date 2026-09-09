import { useState, type FormEvent } from "react";
import { Banner } from "../../../components/ui/Banner";
import { getErrorMessage } from "../../../services/api";
import {
  createPersonalExpense,
  updatePersonalExpense,
  type PublicExpense,
} from "../api/expensesApi";
import {
  fromDateInputValue,
  minorToRupeesText,
  parseRupeesToMinor,
  todayDateInputValue,
  toDateInputValue,
} from "../lib/input";

interface FieldErrors {
  title?: string | null;
  amount?: string | null;
  date?: string | null;
}

interface PersonalExpenseFormProps {
  /** The expense being edited, or null for create mode. */
  initial?: PublicExpense | null;
  onCompleted: () => void;
  onCancel: () => void;
}

/**
 * Create/edit form for a personal expense. Mirrors the backend validation
 * (title 1-120 chars, positive integer minor-unit amount, valid date) without
 * duplicating any business/split logic — the backend remains authoritative.
 */
export function PersonalExpenseForm({ initial, onCompleted, onCancel }: PersonalExpenseFormProps) {
  const isEditing = Boolean(initial);

  const [title, setTitle] = useState(initial?.title ?? "");
  const [amountText, setAmountText] = useState(initial ? minorToRupeesText(initial.amountMinor) : "");
  const [expenseDate, setExpenseDate] = useState(initial ? toDateInputValue(initial.expenseDate) : todayDateInputValue());
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const amountMinor = parseRupeesToMinor(amountText);

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
    setFieldErrors(errors);
    return Object.values(errors).every((value) => !value);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitError(null);
    if (!validate()) {
      return;
    }
    setIsSaving(true);
    try {
      const payload = {
        title: title.trim(),
        amountMinor: amountMinor ?? 0,
        expenseDate: fromDateInputValue(expenseDate),
      };
      if (initial) {
        await updatePersonalExpense(initial.id, payload);
      } else {
        await createPersonalExpense(payload);
      }
      onCompleted();
    } catch (submitFailure) {
      setSubmitError(getErrorMessage(submitFailure));
      setIsSaving(false);
    }
  };

  return (
    <form className="card expense-form" onSubmit={handleSubmit} noValidate>
      <h2 className="card__title">{isEditing ? "Edit expense" : "Add expense"}</h2>

      {submitError && <Banner tone="error">{submitError}</Banner>}

      <div className="form">
        <div className={`field${fieldErrors.title ? " field--invalid" : ""}`}>
          <label htmlFor="personal-expense-title">Title</label>
          <input
            id="personal-expense-title"
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="What was it for?"
          />
          {fieldErrors.title && <p className="field__error">{fieldErrors.title}</p>}
        </div>

        <div className="personal-form__row">
          <div className={`field${fieldErrors.amount ? " field--invalid" : ""}`}>
            <label htmlFor="personal-expense-amount">Amount (₹)</label>
            <input
              id="personal-expense-amount"
              type="text"
              inputMode="decimal"
              value={amountText}
              onChange={(event) => setAmountText(event.target.value)}
              placeholder="0.00"
            />
            {fieldErrors.amount && <p className="field__error">{fieldErrors.amount}</p>}
          </div>
          <div className={`field${fieldErrors.date ? " field--invalid" : ""}`}>
            <label htmlFor="personal-expense-date">Date</label>
            <input
              id="personal-expense-date"
              type="date"
              value={expenseDate}
              onChange={(event) => setExpenseDate(event.target.value)}
            />
            {fieldErrors.date && <p className="field__error">{fieldErrors.date}</p>}
          </div>
        </div>

        <p className="form-hint">Personal expenses are yours alone and aren&apos;t split with a group.</p>

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