interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "danger" | "accent";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Lightweight modal confirm used for destructive/irreversible group actions
 * (archive, remove member, leave group, transfer ownership). Renders nothing
 * while closed. Uses the shared design tokens and existing button styles.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel = "Cancel",
  tone = "danger",
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) {
    return null;
  }

  const confirmClass = tone === "danger" ? "btn btn--danger" : "btn";

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
      <div className="dialog" role="alertdialog" aria-modal="true" aria-label={title}>
        <h2 className="dialog__title">{title}</h2>
        {message && <p className="dialog__message">{message}</p>}
        <div className="dialog__actions">
          <button className="btn btn--secondary" type="button" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button className={confirmClass} type="button" onClick={onConfirm} disabled={busy}>
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}