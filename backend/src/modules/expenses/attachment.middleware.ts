import multer from "multer";
import type { RequestHandler } from "express";
import { ApiError } from "../../utils/ApiError.js";
import { env } from "../../config/env.js";

/**
 * Multipart parser for the single `attachment` file field, bounded to memory.
 *
 * - `fileSize` enforces the strict size cap at the parser level (5 MB default,
 *   `ATTACHMENT_MAX_BYTES` optional override), so oversized payloads never
 *   arrive in application code.
 * - `files: 1` and `fields: 0` keep the request shape strict.
 * - The declared Content-Type in `req.file.mimetype` is intentionally NOT
 *   trusted — `attachment.validation` re-sniffs magic bytes after parsing.
 */
const storage = multer.memoryStorage();
const rawUpload = multer({
  storage,
  limits: {
    fileSize: env.maxAttachmentBytes,
    files: 1,
    fields: 0,
  },
}).single("attachment");

/** Wrap multer so its errors become ApiErrors in the MAVI envelope. */
export const uploadAttachment: RequestHandler = (req, res, next) => {
  rawUpload(req, res, (err) => {
    if (!err) {
      next();
      return;
    }
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      next(new ApiError(413, `Receipt must be ${Math.floor(env.maxAttachmentBytes / (1024 * 1024))} MB or smaller`));
      return;
    }
    next(new ApiError(400, err instanceof multer.MulterError ? "Unexpected file upload payload" : "Invalid file upload"));
  });
};