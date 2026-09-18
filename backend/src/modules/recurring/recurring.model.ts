import { Schema, model, type HydratedDocument } from "mongoose";
import { DEFAULT_CURRENCY } from "../common/money.js";
import { SPLIT_METHODS } from "../splitting/splitting.types.js";
import type { IRecurringGeneration, IRecurringRule } from "./recurring.types.js";
import { RECURRING_FREQUENCIES } from "./recurring.types.js";

export type RecurringRuleDocument = HydratedDocument<IRecurringRule> & { createdAt: Date; updatedAt: Date };
export type RecurringGenerationDocument = HydratedDocument<IRecurringGeneration> & { createdAt: Date; updatedAt: Date };

const recurringRuleSchema = new Schema<IRecurringRule>(
  {
    group: { type: Schema.Types.ObjectId, ref: "Group", default: null },
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true, trim: true, minlength: 1, maxlength: 120 },
    amountMinor: { type: Number, required: true, min: 1 },
    currency: { type: String, required: true, enum: [DEFAULT_CURRENCY], default: DEFAULT_CURRENCY },
    payerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    splitMethod: { type: String, enum: SPLIT_METHODS, required: true },
    splitInput: { type: Schema.Types.Mixed, required: true },
    frequency: { type: String, enum: RECURRING_FREQUENCIES, required: true },
    interval: { type: Number, required: true, default: 1, min: 1 },
    startDayKey: { type: String, required: true },
    nextOccurrence: { type: String, required: true },
    endDayKey: { type: String, default: null },
    active: { type: Boolean, default: true },
    lastGeneratedOccurrence: { type: String, default: null },
  },
  { timestamps: true, versionKey: false }
);

recurringRuleSchema.index({ owner: 1, group: 1, active: 1 });
recurringRuleSchema.index({ active: 1, nextOccurrence: 1 });
recurringRuleSchema.index({ group: 1 });

const recurringGenerationSchema = new Schema<IRecurringGeneration>(
  {
    rule: { type: Schema.Types.ObjectId, ref: "RecurringRule", required: true },
    occurrenceKey: { type: String, required: true },
    expense: { type: Schema.Types.ObjectId, ref: "Expense", default: null },
    generatedAt: { type: Date, required: true },
  },
  { timestamps: true, versionKey: false }
);

// One ledger row per rule+occurrence: the hard idempotency boundary.
recurringGenerationSchema.index({ rule: 1, occurrenceKey: 1 }, { unique: true });

export const RecurringRule = model<IRecurringRule>("RecurringRule", recurringRuleSchema);
export const RecurringGeneration = model<IRecurringGeneration>(
  "RecurringGeneration",
  recurringGenerationSchema
);
