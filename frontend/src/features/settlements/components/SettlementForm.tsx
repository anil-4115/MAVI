import { useRef, useState, type FormEvent } from "react";
import { Banner } from "../../../components/ui/Banner";
import { formatMoney } from "../../../lib/money";
import { getErrorMessage } from "../../../services/api";
import type { SuggestedSettlement } from "../../balances/api/balancesApi";
import { fromDateInputValue, minorToRupeesText, parseRupeesToMinor, todayDateInputValue } from "../../expenses/lib/input";
import { createSettlement, newIdempotencyKey, type CreateSettlementPayload } from "../api/settlementsApi";

interface ActiveMember {
  userId: string;
  name: string;
}

interface FieldErrors {
  payer?: string | null;
  receiver?: string | null;
  amount?: string | null;
  date?: string | null;
  note?: string | null;
}

interface SettlementFormProps {
  groupId: string;
  currency: string;
  members: ActiveMember[];
  currentUserId: string | null;
  archived: boolean;
  /** A backend suggested transfer to prefill; the user can edit every field. */
  prefill: SuggestedSettlement | null;
  onCompleted: () => void;
  onCancel: () => void;
}

const memberSuffix = (userId: string, currentUserId: string | null, name: string): string =>
  userId === currentUserId ? `${name} (you)` : name;

export function SettlementForm({
  groupId,
  currency,
  members,
  currentUserId,
  archived,
  prefill,
  onCompleted,
  onCancel,
}: SettlementFormProps) {
  const [payerId, setPayerId] = useState<string>(prefill?.fromUserId ?? currentUserId ?? members[0]?.userId ?? "");
  const [receiverId, setReceiverId] = useState<string>(() => {
    const preferred = prefill?.toUserId;
    if (preferred && preferred !== payerId && members.some((member) => member.userId === preferred)) {
      return preferred;
    }
    return members.find((member) => member.userId !== payerId)?.userId ?? payerId;
  });
  const [amountText, setAmountText] = useState<string>(prefill ? minorToRupeesText(prefill.amountMinor) : "");
  const [dateValue, setDateValue] = useState<string>(todayDateInputValue());
  const [note, setNote] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  // One key per logical submission; it is reused on retry so a resend after a
  // network blip never creates a duplicate. The form unmounts on success, and a
  // freshly opened dialog starts with a new key.
  const idempotencyKeyRef = useRef<string>(newIdempotencyKey());

  const memberLabel = (userId: string): string => {
    const member = members.find((entry) => entry.userId === userId);
    return member ? memberSuffix(userId, currentUserId, member.name) : "Member";
  };

  const amountMinor = parseRupeesToMinor(amountText);
  const dateIso = fromDateInputValue(dateValue);

  const validate = (): boolean => {
    const errors: FieldErrors = {};
    if (!members.some((member) => member.userId === payerId)) {
      errors.payer = "Select a payer who is an active member.";
    }
    if (!members.some((member) => member.userId === receiverId)) {
      errors.receiver = "Select a receiver who is an active member.";
    }
    if (payerId === receiverId) {
      errors.receiver = "The payer must be different from the receiver.";
    }
    if (amountMinor === null || amountMinor < 1) {
      errors.amount = "Enter a valid amount greater than zero.";
    }
    if (dateIso === undefined) {
      errors.date = "Pick a valid date.";
    }
    if (note.length > 300) {
      errors.note = "Note must be at most 300 characters.";
    }
    setFieldErrors(errors);
    return Object.values(errors).every((value) => !value);
  };

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
    const trimmedNote = note.trim();
    const payload: CreateSettlementPayload = {
      payerId,
      receiverId,
      amountMinor: amountMinor ?? 0,
      currency,
      date: dateIso,
      note: trimmedNote === "" ? undefined : trimmedNote,
      idempotencyKey: idempotencyKeyRef.current,
    };
    setIsSaving(true);
    try {
      await createSettlement(groupId, payload);
      onCompleted();
    } catch (submitFailure) {
      setSubmitError(getErrorMessage(submitFailure));
      setIsSaving(false);
    }
  };

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isSaving) {
          onCancel();
        }
      }}
    >
      <form className="dialog settlement-form" onSubmit={handleSubmit} noValidate aria-label="Record settlement">
        <h2 className="dialog__title">Record settlement</h2>

        {archived && <Banner tone="error">Archived groups are read-only; settlements can&apos;t be added.</Banner>}
        {submitError && <Banner tone="error">{submitError}</Banner>}
        {prefill && (
          <p className="form-hint">
            Prefilled from the suggested transfer — {memberLabel(prefill.fromUserId)} should pay{" "}
            {memberLabel(prefill.toUserId)} {formatMoney(prefill.amountMinor, currency)}. You can adjust anything.
          </p>
        )}

        <div className="form">
          <div className="settlement-form__row">
            <div className={`field${fieldErrors.payer ? " field--invalid" : ""}`}>
              <label htmlFor="settlement-payer">Payer</label>
              <select
                id="settlement-payer"
                value={payerId}
                onChange={(event) => {
                  const next = event.target.value;
                  setPayerId(next);
                  if (next === receiverId) {
                    setReceiverId(members.find((member) => member.userId !== next)?.userId ?? "");
                  }
                }}
              >
                {members.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {memberSuffix(member.userId, currentUserId, member.name)}
                  </option>
                ))}
              </select>
              {fieldErrors.payer && <p className="field__error">{fieldErrors.payer}</p>}
            </div>

            <div className={`field${fieldErrors.receiver ? " field--invalid" : ""}`}>
              <label htmlFor="settlement-receiver">Receiver</label>
              <select
                id="settlement-receiver"
                value={receiverId}
                onChange={(event) => {
                  const next = event.target.value;
                  setReceiverId(next);
                  if (next === payerId) {
                    setPayerId(members.find((member) => member.userId !== next)?.userId ?? "");
                  }
                }}
              >
                {members.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {memberSuffix(member.userId, currentUserId, member.name)}
                  </option>
                ))}
              </select>
              {fieldErrors.receiver && <p className="field__error">{fieldErrors.receiver}</p>}
            </div>
          </div>

          <div className="settlement-form__row">
            <div className={`field${fieldErrors.amount ? " field--invalid" : ""}`}>
              <label htmlFor="settlement-amount">Amount (₹)</label>
              <input
                id="settlement-amount"
                type="text"
                inputMode="decimal"
                value={amountText}
                onChange={(event) => setAmountText(event.target.value)}
                placeholder="0.00"
              />
              {fieldErrors.amount && <p className="field__error">{fieldErrors.amount}</p>}
            </div>

            <div className={`field${fieldErrors.date ? " field--invalid" : ""}`}>
              <label htmlFor="settlement-date">Date</label>
              <input
                id="settlement-date"
                type="date"
                value={dateValue}
                onChange={(event) => setDateValue(event.target.value)}
              />
              {fieldErrors.date && <p className="field__error">{fieldErrors.date}</p>}
            </div>
          </div>

          <div className={`field${fieldErrors.note ? " field--invalid" : ""}`}>
            <label htmlFor="settlement-note">Note (optional)</label>
            <textarea
              id="settlement-note"
              rows={2}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="e.g. UPI transfer"
            />
            {fieldErrors.note && <p className="field__error">{fieldErrors.note}</p>}
          </div>

          <div className="form__actions">
            <button className="btn" type="submit" disabled={isSaving}>
              {isSaving ? "Recording…" : "Record settlement"}
            </button>
            <button className="btn btn--secondary" type="button" onClick={onCancel} disabled={isSaving}>
              Cancel
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}