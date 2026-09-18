/**
 * Shared notification presentation helpers for the notification center and the
 * group Activity tab. All phrasing derives ONLY from backend-provided data:
 * the `type` enum, the `group` id, `read`/timestamps, and the `metadata` fields
 * the backend actually emits. No display names are invented — actor/participant
 * names are never synthesized from ids, and no deep link is built from a value
 * the backend does not return.
 */
import { formatMoney } from "../../../lib/money";
import type { NotificationType, PublicNotification } from "../api/notificationsApi";

export interface NotificationDescription {
  heading: string;
  detail?: string;
}

/** Human labels for the backend notification type enum (authoritative list). */
export const NOTIFICATION_TYPE_LABELS: { type: NotificationType; label: string }[] = [
  { type: "group_invitation", label: "Group invitations" },
  { type: "invitation_accepted", label: "Invitation accepted" },
  { type: "member_removed", label: "Member removed" },
  { type: "member_left", label: "Member left" },
  { type: "role_changed", label: "Role changed" },
  { type: "ownership_transferred", label: "Ownership transfer" },
  { type: "group_archived", label: "Group archived" },
  { type: "group_restored", label: "Group restored" },
  { type: "expense_created", label: "Expenses" },
  { type: "settlement_recorded", label: "Settlements" },
];

export const notificationTypeLabel = (type: NotificationType): string =>
  NOTIFICATION_TYPE_LABELS.find((entry) => entry.type === type)?.label ?? type;

function readMetadataString(metadata: Record<string, unknown>, key: string): string | undefined {
  const value = metadata[key];
  return typeof value === "string" && value !== "" ? value : undefined;
}

function readMetadataMoney(metadata: Record<string, unknown>, key: string): number | undefined {
  const value = metadata[key];
  return typeof value === "number" ? value : undefined;
}

/**
 * Build a recipient-centric line for a notification. `currentUserId` only
 * enables phrasing that compares the CURRENT USER against backend metadata ids
 * (e.g. "You received ₹X") — it never injects any other user's name.
 */
export function describeNotification(
  notification: PublicNotification,
  currentUserId?: string | null,
): NotificationDescription {
  const metadata = notification.metadata;
  const groupName = readMetadataString(metadata, "groupName");

  switch (notification.type) {
    case "group_invitation":
      return { heading: groupName ? `You were invited to ${groupName}` : "You were invited to a group" };
    case "invitation_accepted":
      return { heading: groupName ? `${groupName}: an invitation was accepted` : "An invitation was accepted" };
    case "member_removed":
      return { heading: groupName ? `You were removed from ${groupName}` : "You were removed from a group" };
    case "member_left":
      return { heading: groupName ? `${groupName}: a member left the group` : "A member left the group" };
    case "role_changed": {
      const role = readMetadataString(metadata, "role");
      return {
        heading: "Your role changed",
        detail: role ? `You are now ${role} in ${groupName ?? "the group"}` : (groupName ?? "In a group"),
      };
    }
    case "ownership_transferred":
      return { heading: groupName ? `You are now the owner of ${groupName}` : "You are now the group owner" };
    case "group_archived":
      return { heading: groupName ? `${groupName} was archived` : "A group was archived" };
    case "group_restored":
      return { heading: groupName ? `${groupName} is active again` : "A group was restored" };
    case "expense_created": {
      const title = readMetadataString(metadata, "title");
      const amountMinor = readMetadataMoney(metadata, "amountMinor");
      const currency = readMetadataString(metadata, "currency") ?? "INR";
      return {
        heading: title ? `${title} added` : "A new expense was added",
        detail: [groupName, amountMinor !== undefined ? formatMoney(amountMinor, currency) : undefined]
          .filter(Boolean)
          .join(" · "),
      };
    }
    case "settlement_recorded": {
      const amountMinor = readMetadataMoney(metadata, "amountMinor");
      const currency = readMetadataString(metadata, "currency") ?? "INR";
      const payerId = readMetadataString(metadata, "payerId");
      const receiverId = readMetadataString(metadata, "receiverId");
      if (currentUserId && amountMinor !== undefined) {
        if (payerId === currentUserId) {
          return {
            heading: `You paid ${formatMoney(amountMinor, currency)} in a settlement`,
            detail: groupName,
          };
        }
        if (receiverId === currentUserId) {
          return {
            heading: `You received ${formatMoney(amountMinor, currency)} in a settlement`,
            detail: groupName,
          };
        }
      }
      return {
        heading:
          amountMinor !== undefined
            ? `A settlement of ${formatMoney(amountMinor, currency)} was recorded`
            : "A settlement was recorded",
        detail: groupName,
      };
    }
    default:
      return { heading: "Notification" };
  }
}

export interface NotificationTarget {
  /** Route path (always the backend-provided `group` id). */
  path: string;
  /** Optional group tab to deep-link into (id is validated by the page). */
  tab?: "expenses" | "settlements";
}

/**
 * Deep-link target for a notification. Built only from ids the backend returns:
 * `group` is always present, and the expense/settlement ids gate the tab hint.
 */
export function notificationTarget(notification: PublicNotification): NotificationTarget {
  const path = `/groups/${notification.group}`;
  if (notification.type === "expense_created") {
    return { path, tab: "expenses" };
  }
  if (notification.type === "settlement_recorded") {
    return { path, tab: "settlements" };
  }
  return { path };
}

export const notificationTargetPath = (notification: PublicNotification): string => {
  const target = notificationTarget(notification);
  return target.tab ? `${target.path}?tab=${target.tab}` : target.path;
};