import { useEffect, useRef, useState } from "react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "danger" | "accent";
  busy?: boolean;
  /** When set, the confirm button stays disabled until this exact word is typed. */
  requireKeyword?: string;
  keywordLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Lightweight modal confirm used for destructive/irreversible group actions
 * (archive, permanent delete, remove member, leave group, transfer ownership).
 * Renders nothing while closed. Uses the shared design tokens and existing
 * button styles. For the most destructive actions pass `requireKeyword` so the
 * user must type the keyword (e.g. "DELETE") before confirming.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel = "Cancel",
  tone = "danger",
  busy = false,
  requireKeyword,
  keywordLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [keywordInput, setKeywordInput] = useState("");

  useEffect(() => {
    if (open) {
      setKeywordInput("");
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const timer = window.setTimeout(() => {
      dialogRef.current?.focus();
    }, 0);
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape" && !busy) {
        event.preventDefault();
        onCancel();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [open, busy, onCancel]);

  if (!open) {
    return null;
  }

  const confirmClass = tone === "danger" ? "btn btn--danger" : "btn";
  const keywordConfirmed = !requireKeyword || keywordInput === requireKeyword;

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) {
          onCancel();
        }
      }}
    >
      <div
        ref={dialogRef}
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <h2 className="dialog__title">{title}</h2>
        {message && <p className="dialog__message">{message}</p>}
        {requireKeyword && (
          <div className="field dialog__keyword">
            <label htmlFor="dialog-keyword">{keywordLabel ?? `Type ${requireKeyword} to confirm`}</label>
            <input
              id="dialog-keyword"
              type="text"
              value={keywordInput}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setKeywordInput(event.target.value)}
            />
          </div>
        )}
        <div className="dialog__actions">
          <button className="btn btn--secondary" type="button" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            className={confirmClass}
            type="button"
            onClick={onConfirm}
            disabled={busy || !keywordConfirmed}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}