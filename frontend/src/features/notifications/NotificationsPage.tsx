import { useCallback, useEffect, useState } from "react";
import { Banner } from "../../components/ui/Banner";
import { EmptyState } from "../../components/ui/EmptyState";
import { ErrorState } from "../../components/ui/ErrorState";
import { Spinner } from "../../components/ui/Spinner";
import { formatRelativeTime } from "../../lib/format";
import { formatMoney } from "../../lib/money";
import { getErrorMessage } from "../../services/api";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationStatusFilter,
  type PublicNotification,
} from "./api/notificationsApi";
import { useUnreadCount } from "./useUnreadCount";
import "./notifications.css";

const PAGE_SIZE = 50;

interface NotificationDescription {
  heading: string;
  detail?: string;
}

function readMetadataString(metadata: Record<string, unknown>, key: string): string | undefined {
  const value = metadata[key];
  return typeof value === "string" && value !== "" ? value : undefined;
}

function readMetadataMoney(metadata: Record<string, unknown>, key: string): number | undefined {
  const value = metadata[key];
  return typeof value === "number" ? value : undefined;
}

function describeNotification(notification: PublicNotification): NotificationDescription {
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

export function NotificationsPage() {
  const { refresh: refreshUnread } = useUnreadCount();
  const [status, setStatus] = useState<NotificationStatusFilter>("all");
  const [items, setItems] = useState<PublicNotification[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(
    async (targetStatus: NotificationStatusFilter, nextPage: number) => {
      const result = await listNotifications({
        page: nextPage,
        limit: PAGE_SIZE,
        status: targetStatus,
      });
      return result;
    },
    []
  );

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError(null);
    load(status, 1)
      .then((result) => {
        if (active) {
          setItems(result.items);
          setTotal(result.total);
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(getErrorMessage(loadError));
        }
      })
      .finally(() => {
        if (active) {
          setIsLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [status, load, reloadKey]);

  const handleLoadMore = async () => {
    const nextPage = Math.floor(items.length / PAGE_SIZE) + 1;
    setIsLoadingMore(true);
    setActionError(null);
    try {
      const result = await load(status, nextPage);
      setItems((existing) => [...existing, ...result.items]);
      setTotal(result.total);
    } catch (loadError) {
      setActionError(getErrorMessage(loadError));
    } finally {
      setIsLoadingMore(false);
    }
  };

  const handleMarkRead = async (notificationId: string) => {
    setActionError(null);
    try {
      const updated = await markNotificationRead(notificationId);
      setItems((existing) =>
        existing.map((item) => (item.id === notificationId ? updated : item))
      );
    } catch (markError) {
      setActionError(getErrorMessage(markError));
    } finally {
      void refreshUnread();
    }
  };

  const handleMarkAllRead = async () => {
    setActionError(null);
    try {
      await markAllNotificationsRead();
      setItems((existing) => existing.map((item) => ({ ...item, read: true, readAt: item.readAt ?? new Date().toISOString() })));
    } catch (markError) {
      setActionError(getErrorMessage(markError));
    } finally {
      void refreshUnread();
    }
  };

  const unreadCount = items.filter((item) => !item.read).length;

  return (
    <div className="app-page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Notifications</h1>
          <p className="page-subtitle">Group activity that needs your attention.</p>
        </div>
        <div className="page-header__actions">
          <button
            className="btn btn--secondary"
            type="button"
            onClick={() => void handleMarkAllRead()}
            disabled={unreadCount === 0}
          >
            Mark all as read
          </button>
        </div>
      </header>

      {actionError && (
        <div className="notifications-banner">
          <Banner tone="error">{actionError}</Banner>
        </div>
      )}

      <div className="tabs" role="tablist" aria-label="Notification filters">
        {(["all", "unread"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={status === tab}
            className={`tab${status === tab ? " tab--active" : ""}`}
            onClick={() => setStatus(tab)}
          >
            {tab === "all" ? "All" : "Unread"}
          </button>
        ))}
      </div>

      {error ? (
        <ErrorState message={error} onRetry={() => setReloadKey((value) => value + 1)} />
      ) : isLoading ? (
        <Spinner label="Loading notifications" />
      ) : items.length === 0 ? (
        <EmptyState
          title={status === "all" ? "No notifications yet" : "You're all caught up"}
          description={
            status === "all"
              ? "Group activity will appear here."
              : "There are no unread notifications right now."
          }
        />
      ) : (
        <>
          <ul className="rows">
            {items.map((notification) => {
              const description = describeNotification(notification);
              return (
                <li
                  key={notification.id}
                  className={`row notification${notification.read ? "" : " notification--unread"}`}
                >
                  <div>
                    <p className="row__primary">{description.heading}</p>
                    {description.detail && (
                      <p className="row__secondary">{description.detail}</p>
                    )}
                    <p className="row__secondary">
                      {formatRelativeTime(notification.createdAt)}
                    </p>
                  </div>
                  {!notification.read && (
                    <button
                      className="btn btn--ghost btn--sm"
                      type="button"
                      onClick={() => void handleMarkRead(notification.id)}
                    >
                      Mark as read
                    </button>
                  )}
                </li>
              );
            })}
          </ul>

          {items.length < total && (
            <div className="notifications-more">
              {isLoadingMore ? (
                <Spinner label="Loading more" />
              ) : (
                <button className="btn btn--secondary" type="button" onClick={() => void handleLoadMore()}>
                  Load more
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}