import { ApiError } from "../../utils/ApiError.js";

/** Safe default maximum attachment size: 5 MB (in bytes). */
export const DEFAULT_MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

/** Display filename length cap (mirrors the title caps used elsewhere). */
export const MAX_ATTACHMENT_FILENAME_LENGTH = 120;

/** MIME types the backend will accept for receipt attachments. */
export type SupportedImageType = "image/jpeg" | "image/png" | "image/webp";

export const SUPPORTED_IMAGE_TYPES: readonly SupportedImageType[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

/**
 * Sniff the actual image type from leading magic bytes.
 *
 * Returns null when the bytes do not match a supported signature, so a
 * client-provided MIME type can never authorize a file — only the content
 * itself can. Never trusts the declared Content-Type or file extension.
 */
export function sniffImageType(data: Uint8Array): SupportedImageType | null {
  if (data.length < 12) {
    return null;
  }

  // JPEG: FF D8 FF
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return "image/jpeg";
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (pngSignature.every((byte, index) => data[index] === byte)) {
    return "image/png";
  }

  // WebP: "RIFF" .... "WEBP"
  const riff = data[0] === 0x52 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x46;
  const webp = data[8] === 0x57 && data[9] === 0x45 && data[10] === 0x42 && data[11] === 0x50;
  if (riff && webp) {
    return "image/webp";
  }

  return null;
}

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;
const PATH_SEPARATORS = /[\\/]+/g;

/**
 * Reduce an untrusted display filename to a safe plain label.
 *
 * The result is used ONLY for display and is never interpreted as a filesystem
 * path — GridFS uses generated ids as its chunk keys. Only the final path
 * segment is kept (so directory components can never surface), quotes and
 * control characters are stripped, whitespace is collapsed, the string is
 * truncated to a cap, and empty results fall back to "receipt".
 */
export function sanitizeDisplayFilename(raw: unknown, maxLength = MAX_ATTACHMENT_FILENAME_LENGTH): string {
  const source = typeof raw === "string" ? raw.trim() : "";
  const segments = source.replace(PATH_SEPARATORS, " ").split(" ").filter((part) => part.length > 0);
  const basename = segments.length > 0 ? segments[segments.length - 1] : "";
  const cleaned = basename
    .replace(CONTROL_CHARS, "")
    .replace(/["'<>]/g, "")
    .trim();
  const trimmed = cleaned.slice(0, maxLength).trim();
  return trimmed.length > 0 ? trimmed : "receipt";
}

/** Result of validating an uploaded buffer before it reaches GridFS. */
export interface ValidatedAttachment {
  mimeType: SupportedImageType;
  sizeBytes: number;
}

/**
 * Validate an uploaded image buffer: strict size cap first, then magic-byte
 * MIME detection. Throws ApiError(413) for oversized payloads and ApiError(400)
 * for anything that is not a supported image (including renamed impostors).
 */
export function validateAttachmentBuffer(data: Buffer, maxBytes: number): ValidatedAttachment {
  if (data.length <= 0) {
    throw new ApiError(400, "A receipt file is required");
  }
  if (data.length > maxBytes) {
    throw new ApiError(413, `Receipt must be ${Math.floor(maxBytes / (1024 * 1024))} MB or smaller`);
  }

  const sniffed = sniffImageType(data);
  if (!sniffed) {
    throw new ApiError(400, "Only JPEG, PNG or WebP images are supported as receipts");
  }

  return { mimeType: sniffed, sizeBytes: data.length };
}