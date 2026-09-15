/**
 * Expense attachment validation pure self-test — offline, no DB, no network.
 * Covers magic-byte MIME sniffing (JPEG/PNG/WebP), the strict size cap, and
 * display-filename sanitization (path traversal, control characters, caps).
 *
 *   npx tsx scripts/attachment-validation-selftest.ts
 */
import { ApiError } from "../src/utils/ApiError.js";
import {
  DEFAULT_MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_FILENAME_LENGTH,
  SUPPORTED_IMAGE_TYPES,
  sanitizeDisplayFilename,
  sniffImageType,
  validateAttachmentBuffer,
} from "../src/modules/expenses/attachment.validation.js";

let failures = 0;
const failuresList: string[] = [];
const passCount = { n: 0 };

const check = (condition: boolean, label: string): void => {
  if (condition) {
    passCount.n++;
  } else {
    failures++;
    failuresList.push(`FAIL: ${label}`);
  }
};

/* -------------------------------------------------------------------------- */
/*                     Constants & supported type contract                     */
/* -------------------------------------------------------------------------- */
check(DEFAULT_MAX_ATTACHMENT_BYTES === 2 * 1024 * 1024, "DEFAULT_MAX_ATTACHMENT_BYTES is 2 MB");
check(MAX_ATTACHMENT_FILENAME_LENGTH === 120, "MAX_ATTACHMENT_FILENAME_LENGTH is 120");
check(
  SUPPORTED_IMAGE_TYPES.length === 3 &&
    SUPPORTED_IMAGE_TYPES.includes("image/jpeg") &&
    SUPPORTED_IMAGE_TYPES.includes("image/png") &&
    SUPPORTED_IMAGE_TYPES.includes("image/webp"),
  "SUPPORTED_IMAGE_TYPES = {jpeg, png, webp}",
);

/* -------------------------------------------------------------------------- */
/*                           Magic-byte sniffing                               */
/* -------------------------------------------------------------------------- */

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0, 0]);

check(sniffImageType(jpeg) === "image/jpeg", "sniff: JPEG signature -> image/jpeg");
check(sniffImageType(png) === "image/png", "sniff: PNG signature -> image/png");
check(sniffImageType(webp) === "image/webp", "sniff: WebP signature -> image/webp");

check(sniffImageType(new Uint8Array(0)) === null, "sniff: empty buffer -> null");
check(sniffImageType(new Uint8Array([0xff, 0xd8])) === null, "sniff: short JPEG (<12 bytes) -> null");
check(sniffImageType(new Uint8Array([0x89, 0x50])) === null, "sniff: short PNG (<12 bytes) -> null");

/* A renamed impostor: valid JPEG header followed by garbage is still accepted
   as a JPEG (header-sniffing only checks the signature, which is correct —
   deeper decoding is a full image-parser concern out of scope). What MUST be
   rejected is anything whose first bytes are not a real signature. */
check(sniffImageType(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])) === null, "sniff: random bytes -> null");

/* Text file (classic MIME-spoofing attempt with text content). */
const text = new TextEncoder().encode("hello world, definitely not an image");
check(sniffImageType(text) === null, "sniff: plain text -> null");

/* WebP must require the exact RIFF....WEBP layout, not just 'RIFF'. */
const riffButNotWebp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x58, 0x58, 0x58, 0x58]);
check(sniffImageType(riffButNotWebp) === null, "sniff: RIFF without WEBP -> null");

/* JPEG is prefix-only (FF D8 FF), so later bytes cannot break it. */
const pngJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...Array.from(png)]);
check(sniffImageType(pngJpeg) === "image/jpeg", "sniff: JPEG-prefixed payload -> jpeg (prefix wins)");

/* -------------------------------------------------------------------------- */
/*                       validateAttachmentBuffer (size + type)                */
/* -------------------------------------------------------------------------- */

const tryValidate = (buffer: Buffer, maxBytes: number): { ok: boolean; status?: number; mimeType?: string; sizeBytes?: number } => {
  try {
    const result = validateAttachmentBuffer(buffer, maxBytes);
    return { ok: true, mimeType: result.mimeType, sizeBytes: result.sizeBytes };
  } catch (err) {
    if (err instanceof ApiError) {
      return { ok: false, status: err.statusCode };
    }
    return { ok: false };
  }
};

const MAX = DEFAULT_MAX_ATTACHMENT_BYTES;

/* Empty buffer -> 400. */
const empty = tryValidate(Buffer.alloc(0), MAX);
check(!empty.ok && empty.status === 400, "validate: empty buffer -> 400");

/* Oversize -> 413. Exactly at the cap is allowed; cap+1 is not. */
const tinyJpeg = Buffer.from(jpeg);
const exactSize = tryValidate(Buffer.concat([tinyJpeg, Buffer.alloc(MAX - tinyJpeg.length, 1)]), MAX);
check(exactSize.ok && exactSize.mimeType === "image/jpeg", "validate: exactly at cap -> accepted jpeg");
const overSize = tryValidate(Buffer.concat([Buffer.alloc(MAX, 1), Buffer.from(png)]), MAX);
check(!overSize.ok && overSize.status === 413, "validate: cap+something -> 413");

/* Renamed text file -> 400 (even though size is fine). */
const textBuf = Buffer.from(text);
const renamed = tryValidate(textBuf, MAX);
check(!renamed.ok && renamed.status === 400, "validate: text file renamed *.jpg -> 400");

/* Valid buffers return sniffed mime + byte length. */
const jpegValid = tryValidate(Buffer.from(jpeg), MAX);
check(jpegValid.ok && jpegValid.mimeType === "image/jpeg" && jpegValid.sizeBytes === jpeg.length, "validate: jpeg -> mime + sizeBytes");
const webpValid = tryValidate(Buffer.from(webp), MAX);
check(webpValid.ok && webpValid.mimeType === "image/webp", "validate: webp -> mime");

/* Validation honors a caller-supplied cap (mirrors env override). */
const smallCap = tryValidate(Buffer.from(jpeg), 100);
check(smallCap.ok, "validate: under small custom cap -> ok");
const smallCapOver = tryValidate(Buffer.from(jpeg), 10);
check(!smallCapOver.ok && smallCapOver.status === 413, "validate: over small custom cap -> 413");

/* -------------------------------------------------------------------------- */
/*                      sanitizeDisplayFilename                                */
/* -------------------------------------------------------------------------- */

check(sanitizeDisplayFilename("receipt.jpg") === "receipt.jpg", "sanitize: plain name kept");
check(sanitizeDisplayFilename("  receipt.jpg  ") === "receipt.jpg", "sanitize: surrounding whitespace trimmed");
check(
  sanitizeDisplayFilename("C:\\Users\\alice\\Desktop\\receipts\\bill.png") === "bill.png",
  "sanitize: Windows path -> last segment only",
);
check(
  sanitizeDisplayFilename("../../etc/passwd.png") === "passwd.png",
  "sanitize: dotdot path -> last segment only",
);
check(sanitizeDisplayFilename("photo   one.jpg") === "one.jpg", "sanitize: whitespace split -> final segment kept");
check(sanitizeDisplayFilename('my"quote\'<>receipt.png') === "myquotereceipt.png", "sanitize: quotes/angles stripped");
check(
  sanitizeDisplayFilename("split\\both/segments.jpg") === "segments.jpg",
  "sanitize: mixed separators -> last segment",
);
check(sanitizeDisplayFilename("") === "receipt", "sanitize: empty -> fallback 'receipt'");
check(sanitizeDisplayFilename("   ") === "receipt", "sanitize: whitespace only -> fallback 'receipt'");
check(sanitizeDisplayFilename(null) === "receipt", "sanitize: null -> fallback 'receipt'");
check(sanitizeDisplayFilename(undefined) === "receipt", "sanitize: undefined -> fallback 'receipt'");

const long = "a".repeat(300);
check(sanitizeDisplayFilename(long).length === MAX_ATTACHMENT_FILENAME_LENGTH, "sanitize: long name truncated to cap");
check(sanitizeDisplayFilename("a".repeat(50), 20).length === 20, "sanitize: custom maxLength respected");
check(sanitizeDisplayFilename("emoji-\u{1f4be}.jpg") === "emoji-\u{1f4be}.jpg", "sanitize: unicode preserved");

/* Control characters must never survive (multipart header injection). */
check(!sanitizeDisplayFilename("a\nb.jpg").includes("\n"), "sanitize: newline stripped");
check(!sanitizeDisplayFilename("a\r\nb.jpg").includes("\r"), "sanitize: carriage return stripped");

/* -------------------------------------------------------------------------- */

console.log(`attachment-validation-selftest: ${passCount.n} checks passed, ${failures} failed`);
if (failures > 0) {
  console.error(failuresList.join("\n"));
  process.exit(1);
}