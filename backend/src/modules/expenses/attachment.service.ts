import { GridFSBucket, ObjectId } from "mongodb";
import mongoose from "mongoose";
import type { Readable } from "node:stream";
import { ApiError } from "../../utils/ApiError.js";
import type { SupportedImageType } from "./attachment.validation.js";

export const ATTACHMENT_BUCKET_NAME = "expense-attachments";

/** Metadata for a stored receipt attachment (what the expense document records). */
export interface StoredAttachment {
  fileId: string;
  filename: string;
  mimeType: SupportedImageType;
  sizeBytes: number;
  uploadedAt: Date;
}

const getBucket = (): GridFSBucket => {
  const db = mongoose.connection.db;
  if (!db) {
    throw new ApiError(500, "Storage is not configured");
  }
  return new GridFSBucket(db, { bucketName: ATTACHMENT_BUCKET_NAME, chunkSizeBytes: 255 * 1024 });
};

/**
 * Resolve the GridFS metadata document for a file. Returns null when the file
 * does not exist (e.g. the expense metadata points at a deleted file).
 */
export async function getImageInfo(fileId: string): Promise<{ length: number } | null> {
  const bucket = getBucket();
  const doc = await bucket.find({ _id: new ObjectId(fileId) }).limit(1).next();
  if (!doc) {
    return null;
  }
  return { length: Number(doc.length) };
}

/**
 * Stream the stored file at the given GridFS id. Callers must already hold the
 * expense authorization; the bucket itself is never exposed to clients.
 */
export function openDownloadStream(fileId: string): Readable {
  return getBucket().openDownloadStream(new ObjectId(fileId));
}

/** Upload an already-validated image buffer into GridFS. */
export async function storeImage(
  data: Buffer,
  filename: string,
  mimeType: SupportedImageType,
): Promise<StoredAttachment> {
  const bucket = getBucket();
  const uploadedAt = new Date();
  const id = await new Promise<ObjectId>((resolve, reject) => {
    const stream = bucket.openUploadStream(filename, {
      metadata: { mimeType, uploadedAt },
    });
    stream.once("error", (err) => reject(err));
    stream.once("finish", () => resolve(stream.id));
    stream.end(data);
  });

  return {
    fileId: id.toHexString(),
    filename,
    mimeType,
    sizeBytes: data.length,
    uploadedAt,
  };
}

/**
 * Delete a stored GridFS file by id. Missing files are treated as success so
 * cleanup during replacement/remove/void stays idempotent (no orphaned files,
 * no unhandled "not found" races). Always called with server-controlled ids
 * that came from the expense document — never from client input.
 */
export async function deleteImage(fileId: string): Promise<void> {
  const bucket = getBucket();
  const id = new ObjectId(fileId);
  try {
    await bucket.delete(id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/not found/i.test(message)) {
      return;
    }
    throw err;
  }
}