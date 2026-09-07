import { Schema, model, type HydratedDocument, type Types } from "mongoose";
import type { NotificationMetadata, NotificationType } from "./notification.types.js";
import { NOTIFICATION_TYPES } from "./notification.types.js";

export interface INotification {
  recipient: Types.ObjectId;
  type: NotificationType;
  group: Types.ObjectId;
  actor: Types.ObjectId;
  metadata: NotificationMetadata;
  readAt: Date | null;
}

export type NotificationDocument = HydratedDocument<INotification> & { createdAt: Date; updatedAt: Date };

const notificationSchema = new Schema<INotification>(
  {
    recipient: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    group: { type: Schema.Types.ObjectId, ref: "Group", required: true },
    actor: { type: Schema.Types.ObjectId, ref: "User", required: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
    readAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false }
);

notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, readAt: 1 });

export const Notification = model<INotification>("Notification", notificationSchema);