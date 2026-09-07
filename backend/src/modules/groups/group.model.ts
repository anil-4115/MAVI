import { Schema, model, type HydratedDocument, type Types } from "mongoose";
import { DEFAULT_CURRENCY } from "../common/money.js";
import {
  type GroupMemberInput,
  GroupRoles,
  MemberStatuses,
} from "./group.types.js";

export interface IGroup {
  name: string;
  description?: string;
  currency: string;
  createdBy: Types.ObjectId;
  members: GroupMemberInput[];
  archived: boolean;
  archivedAt: Date | null;
}

export type GroupDocument = HydratedDocument<IGroup> & { createdAt: Date; updatedAt: Date };

const memberSchema = new Schema<GroupMemberInput>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, enum: GroupRoles, required: true },
    status: { type: String, enum: MemberStatuses, required: true },
    joinedAt: { type: Date, required: true },
    addedBy: { type: Schema.Types.ObjectId, ref: "User", default: undefined },
  },
  { _id: false }
);

const groupSchema = new Schema<IGroup>(
  {
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 80 },
    description: { type: String, trim: true, maxlength: 300, default: undefined },
    currency: { type: String, default: DEFAULT_CURRENCY, immutable: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    members: {
      type: [memberSchema],
      default: [],
      validate: {
        validator: (value: GroupMemberInput[]) => {
          const userIds = value.filter((m) => m.status !== "declined").map((m) => m.userId.toString());
          return new Set(userIds).size === userIds.length;
        },
        message: "A member can only appear once per group",
      },
    },
    archived: { type: Boolean, default: false },
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false }
);

groupSchema.index({ "members.userId": 1 });

export const Group = model<IGroup>("Group", groupSchema);
