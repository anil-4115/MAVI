import { Schema, model, type HydratedDocument, type Types } from "mongoose";
import { DEFAULT_CURRENCY } from "../common/money.js";
import { SPLIT_METHODS, type SplitMethod, type SplitRequest } from "../splitting/splitting.types.js";
import type { ExpenseParticipantShare } from "./expense.types.js";

/** Metadata for the single optional receipt attachment stored in GridFS. */
export interface IExpenseAttachment {
  fileId: Types.ObjectId;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: Date;
}

export interface IExpense {
  group: Types.ObjectId | null;
  createdBy: Types.ObjectId;
  title: string;
  amountMinor: number;
  currency: string;
  expenseDate: Date;
  payerId: Types.ObjectId;
  splitMethod: SplitMethod;
  splitInput: SplitRequest | null;
  participantShares: ExpenseParticipantShare[];
  attachment: IExpenseAttachment | null;
  voided: boolean;
  voidedAt: Date | null;
  voidedBy: Types.ObjectId | null;
}

export type ExpenseDocument = HydratedDocument<IExpense> & { createdAt: Date; updatedAt: Date };

const participantShareSchema = new Schema<ExpenseParticipantShare>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    amountMinor: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const attachmentSchema = new Schema<IExpenseAttachment>(
  {
    fileId: { type: Schema.Types.ObjectId, required: true },
    filename: { type: String, required: true, trim: true, maxlength: 120 },
    mimeType: {
      type: String,
      required: true,
      enum: ["image/jpeg", "image/png", "image/webp"],
    },
    sizeBytes: { type: Number, required: true, min: 1 },
    uploadedAt: { type: Date, required: true },
  },
  { _id: false }
);

const expenseSchema = new Schema<IExpense>(
  {
    group: { type: Schema.Types.ObjectId, ref: "Group", default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true, trim: true, minlength: 1, maxlength: 120 },
    amountMinor: { type: Number, required: true, min: 1 },
    currency: { type: String, default: DEFAULT_CURRENCY },
    expenseDate: { type: Date, required: true },
    payerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    splitMethod: { type: String, enum: SPLIT_METHODS, required: true },
    splitInput: { type: Schema.Types.Mixed, default: null },
    participantShares: { type: [participantShareSchema], required: true, default: [] },
    attachment: { type: attachmentSchema, default: null },
    voided: { type: Boolean, default: false },
    voidedAt: { type: Date, default: null },
    voidedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true, versionKey: false }
);

expenseSchema.index({ group: 1, expenseDate: -1 });
expenseSchema.index({ createdBy: 1, expenseDate: -1 });

export const Expense = model<IExpense>("Expense", expenseSchema);