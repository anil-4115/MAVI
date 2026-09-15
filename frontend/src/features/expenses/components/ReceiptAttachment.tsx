import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Banner } from "../../../components/ui/Banner";
import { Spinner } from "../../../components/ui/Spinner";
import { getErrorMessage } from "../../../services/api";
import type { PublicExpenseAttachment } from "../api/expensesApi";

const ACCEPT_TYPES = "image/jpeg,image/png,image/webp";
const MAX_BYTES = 5 * 1024 * 1024;

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
 * Shared receipt attachment control: preview (+ lazy authenticated fetch),
 * replace, remove, upload-in-progress and error states. Used by the group and
 * personal expense forms (editable) and by the expense lists (read-only).
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

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [busy, setBusy] = useState<"upload" | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      setError("Receipts must be 5 MB or smaller.");
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
      .catch((uploadError: unknown) => setError(getErrorMessage(uploadError)))
      .finally(() => setBusy(null));
  };

  const handleRemove = () => {
    if (pendingMode) {
      onPendingFileChange?.(null);
      return;
    }
    if (!onRemove) {
      return;
    }
    setBusy("remove");
    setError(null);
    onRemove()
      .catch((removeError: unknown) => setError(getErrorMessage(removeError)))
      .finally(() => setBusy(null));
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
        <p className="receipt-field__meta">JPEG, PNG or WebP, up to 5 MB.</p>
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
        <p className="receipt-field__meta">JPEG, PNG or WebP, up to 5 MB.</p>
        {error && <Banner tone="error">{error}</Banner>}
      </div>
    );
  }

  return (
    <div className="receipt-field">
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
      {canModify && (
        <div className="receipt-field__actions">
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
        </div>
      )}
    </div>
  );
}