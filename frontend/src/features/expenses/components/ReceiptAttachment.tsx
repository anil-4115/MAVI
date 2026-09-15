import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Banner } from "../../../components/ui/Banner";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { Spinner } from "../../../components/ui/Spinner";
import { useToast } from "../../../components/ui/Toast";
import { getErrorMessage } from "../../../services/api";
import type { PublicExpenseAttachment } from "../api/expensesApi";

const ACCEPT_TYPES = "image/jpeg,image/png,image/webp";
const MAX_BYTES = 2 * 1024 * 1024;

interface ReceiptAttachmentProps {
  /** Current receipt metadata; null when the expense has no receipt. */
  attachment: PublicExpenseAttachment | null;
  /** Whether the current user may upload, replace or remove a receipt. */
  canModify: boolean;
  /**
   * Fetch the receipt binary (authenticated blob stream). Only used when an
   * `attachment` exists; parents in pending (pre-create) mode can omit it.
   */
  getBlob?: () => Promise<Blob>;
  /**
   * Upload/replace a receipt. Only used in immediate (existing-expense) mode;
   * parents in pending (pre-create) mode can omit it.
   */
  onUpload?: (file: File) => Promise<void>;
  /**
   * Remove the receipt. Only used in immediate (existing-expense) mode;
   * parents in pending (pre-create) mode can omit it.
   */
  onRemove?: () => Promise<void>;
  /**
   * Pre-create selection mode: when `onPendingFileChange` is set, no expense
   * exists yet, so picking a file only records it (uploaded by the form after
   * the expense is created or updated).
   */
  pendingFile?: File | null;
  onPendingFileChange?: (file: File | null) => void;
}

const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/**
 * Shared receipt attachment control: lazy authenticated preview, a dedicated
 * full-size viewer, replace, remove-with-confirmation, upload-in-progress and
 * error states. Used by the group and personal expense forms (editable) and by
 * the group expense detail (read/write per authorization).
 */
export function ReceiptAttachment({
  attachment,
  canModify,
  getBlob,
  onUpload,
  onRemove,
  pendingFile,
  onPendingFileChange,
}: ReceiptAttachmentProps) {
  const pendingMode = onPendingFileChange !== undefined;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { addToast } = useToast();

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [busy, setBusy] = useState<"upload" | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);

  const getBlobRef = useRef(getBlob);
  useEffect(() => {
    getBlobRef.current = getBlob;
  }, [getBlob]);

  const fileKey = attachment?.fileId ?? null;
  const selectedFile = pendingMode ? (pendingFile ?? null) : null;

  useEffect(() => {
    if (!attachment) {
      setPreviewUrl(null);
      setPreviewFailed(false);
      return;
    }
    let active = true;
    let objectUrl: string | null = null;
    setPreviewUrl(null);
    setPreviewFailed(false);
    void getBlobRef.current
      ?.()?.then((blob) => {
        if (!active) {
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        setPreviewUrl(objectUrl);
      })
      .catch(() => {
        if (active) {
          setPreviewFailed(true);
        }
      });
    return () => {
      active = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [attachment, fileKey]);

  /* Close the viewer on Escape, mirroring ConfirmDialog's dialog behavior. */
  useEffect(() => {
    if (!viewerOpen) {
      return undefined;
    }
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        setViewerOpen(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [viewerOpen]);

  const openPicker = () => inputRef.current?.click();

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!file) {
      return;
    }
    if (file.size <= 0) {
      setError("That file is empty.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Receipts must be 2 MB or smaller.");
      return;
    }
    setError(null);
    if (pendingMode) {
      onPendingFileChange?.(file);
      return;
    }
    if (!onUpload) {
      return;
    }
    setBusy("upload");
    onUpload(file)
      .then(() => addToast("Receipt saved.", "success"))
      .catch((uploadError: unknown) => setError(getErrorMessage(uploadError)))
      .finally(() => setBusy(null));
  };

  const handleRemoveConfirmed = () => {
    if (!onRemove) {
      return;
    }
    setBusy("remove");
    setError(null);
    onRemove()
      .then(() => addToast("Receipt removed.", "success"))
      .catch((removeError: unknown) => setError(getErrorMessage(removeError)))
      .finally(() => {
        setBusy(null);
        setConfirmRemove(false);
      });
  };

  const handleRemove = () => {
    if (pendingMode) {
      onPendingFileChange?.(null);
      return;
    }
    setConfirmRemove(true);
  };

  if (pendingMode) {
    if (selectedFile) {
      return (
        <div className="receipt-field">
          <p className="receipt-field__name">{selectedFile.name}</p>
          <p className="receipt-field__meta">
            {formatBytes(selectedFile.size)} — will be attached when you save
          </p>
          {error && <Banner tone="error">{error}</Banner>}
          {canModify && (
            <div className="receipt-field__actions">
              <button className="btn btn--ghost btn--sm" type="button" onClick={handleRemove}>
                Remove
              </button>
            </div>
          )}
        </div>
      );
    }
    if (!canModify) {
      return null;
    }
    return (
      <div className="receipt-field">
        <input
          ref={inputRef}
          className="visually-hidden"
          type="file"
          accept={ACCEPT_TYPES}
          onChange={handleFileChange}
          aria-label="Attach a receipt image"
        />
        <button className="btn btn--secondary btn--sm" type="button" onClick={openPicker} disabled={busy !== null}>
          Attach receipt
        </button>
        <p className="receipt-field__meta">JPEG, PNG or WebP, up to 2 MB.</p>
        {error && <Banner tone="error">{error}</Banner>}
      </div>
    );
  }

  if (!attachment) {
    if (!canModify) {
      return null;
    }
    return (
      <div className="receipt-field">
        <input
          ref={inputRef}
          className="visually-hidden"
          type="file"
          accept={ACCEPT_TYPES}
          onChange={handleFileChange}
          aria-label="Attach a receipt image"
        />
        <button className="btn btn--secondary btn--sm" type="button" onClick={openPicker} disabled={busy !== null}>
          Attach receipt
        </button>
        <p className="receipt-field__meta">JPEG, PNG or WebP, up to 2 MB.</p>
        {error && <Banner tone="error">{error}</Banner>}
      </div>
    );
  }

  const viewerContent = previewUrl ? (
    <img className="receipt-lightbox__img" src={previewUrl} alt={`Receipt: ${attachment.filename}`} />
  ) : previewFailed ? (
    <p className="dialog__message">Preview unavailable.</p>
  ) : (
    <div className="receipt-lightbox__loading">
      <Spinner label="Loading receipt" />
    </div>
  );

  return (
    <div className="receipt-field">
      <span className="badge badge--success">Receipt attached</span>

      {previewUrl ? (
        <img className="receipt-field__preview" src={previewUrl} alt={`Receipt: ${attachment.filename}`} />
      ) : previewFailed ? (
        <div className="receipt-field__preview receipt-field__preview--missing">
          <p>Preview unavailable</p>
        </div>
      ) : (
        <div className="receipt-field__preview receipt-field__preview--loading">
          <Spinner label="Loading receipt" />
        </div>
      )}

      <p className="receipt-field__name">{attachment.filename}</p>
      <p className="receipt-field__meta">
        {attachment.mimeType.replace("image/", "").toUpperCase()} · {formatBytes(attachment.sizeBytes)}
      </p>

      {error && <Banner tone="error">{error}</Banner>}

      <div className="receipt-field__actions">
        <button className="btn btn--secondary btn--sm" type="button" onClick={() => setViewerOpen(true)} disabled={!previewUrl}>
          View receipt
        </button>
        {canModify && (
          <>
            <input
              ref={inputRef}
              className="visually-hidden"
              type="file"
              accept={ACCEPT_TYPES}
              onChange={handleFileChange}
              aria-label="Replace the receipt image"
            />
            <button className="btn btn--ghost btn--sm" type="button" onClick={openPicker} disabled={busy !== null}>
              {busy === "upload" ? "Uploading…" : "Replace"}
            </button>
            <button className="btn btn--danger btn--sm" type="button" onClick={handleRemove} disabled={busy !== null}>
              {busy === "remove" ? "Removing…" : "Remove"}
            </button>
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirmRemove}
        title="Remove receipt?"
        message="This permanently deletes the attached receipt from this expense and cannot be undone from the app."
        confirmLabel="Remove receipt"
        tone="danger"
        busy={busy === "remove"}
        onConfirm={handleRemoveConfirmed}
        onCancel={() => setConfirmRemove(false)}
      />

      {viewerOpen && attachment && (
        <div
          className="dialog-backdrop receipt-lightbox"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setViewerOpen(false);
            }
          }}
        >
          <div className="dialog receipt-lightbox__dialog" role="dialog" aria-modal="true" aria-label={`Receipt: ${attachment.filename}`}>
            <div className="receipt-lightbox__header">
              <h2 className="dialog__title">{attachment.filename}</h2>
              <button className="btn btn--secondary btn--sm" type="button" onClick={() => setViewerOpen(false)}>
                Close
              </button>
            </div>
            {viewerContent}
          </div>
        </div>
      )}
    </div>
  );
}