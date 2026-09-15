import type { Types } from "mongoose";
import type { SplitMethod, SplitRequest } from "../splitting/splitting.types.js";

/** Stored participant share entry (authoritative snapshot of the split). */
export interface ExpenseParticipantShare {
  userId: Types.ObjectId | string;
  amountMinor: number;
}

/** Safe public view of a single participant share. */
export interface PublicExpenseParticipantShare {
  userId: string;
  amountMinor: number;
}

/**
 * Safe, serialized metadata for the single optional receipt attachment.
 * Never contains file contents — binary is served only through dedicated,
 * authenticate-gated attachment endpoints.
 */
export interface PublicExpenseAttachment {
  fileId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
}

/** Safe, serialized expense. Never includes sensitive fields. */
export interface PublicExpense {
  id: string;
  group: string | null;
  createdBy: string;
  title: string;
  amountMinor: number;
  currency: string;
  expenseDate: string;
  payerId: string;
  splitMethod: SplitMethod;
  splitInput: SplitRequest | null;
  participantShares: PublicExpenseParticipantShare[];
  attachment: PublicExpenseAttachment | null;
  voided: boolean;
  voidedAt: string | null;
  createdAt: string;
  updatedAt: string;
}