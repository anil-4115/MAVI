import { Schema, model, type HydratedDocument, type Types } from "mongoose";
import { DEFAULT_CURRENCY } from "../common/money.js";
import { SETTLEMENT_STATUSES, type SettlementStatus } from "./settlement.types.js";

export interface ISettlement {
  group: Types.ObjectId;
  payerId: Types.ObjectId;
  receiverId: Types.ObjectId;
  amountMinor: number;
  currency: string;
  date: Date;
  note?: string;
  /**
   * Client-owned idempotency key (unique per group). Replaying the same key
   * returns the original record instead of creating a duplicate.
   */
  idempotencyKey?: string;
  createdBy: Types.ObjectId;
  status: SettlementStatus;
}

export type SettlementDocument = HydratedDocument<ISettlement> & { createdAt: Date; updatedAt: Date };

const settlementSchema = new Schema<ISettlement>(
  {
    group: { type: Schema.Types.ObjectId, ref: "Group", required: true },
    payerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    receiverId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    amountMinor: { type: Number, required: true, min: 1 },
    currency: { type: String, required: true, enum: [DEFAULT_CURRENCY], default: DEFAULT_CURRENCY },
    date: { type: Date, required: true },
    note: { type: String, trim: true, maxlength: 300, default: undefined },
    idempotencyKey: { type: String, trim: true, maxlength: 100, default: undefined },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    status: { type: String, enum: SETTLEMENT_STATUSES, required: true, default: "completed" },
  },
  { timestamps: true, versionKey: false }
);

settlementSchema.index({ group: 1, date: -1 });
// Sparse so legacy records without a key are untouched; the key only needs to
// be unique within a group (the same client key is fine across groups).
settlementSchema.index({ group: 1, idempotencyKey: 1 }, { unique: true, sparse: true });

export const Settlement = model<ISettlement>("Settlement", settlementSchema);