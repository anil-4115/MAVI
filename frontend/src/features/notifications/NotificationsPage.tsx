import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Banner } from "../../components/ui/Banner";
import { EmptyState } from "../../components/ui/EmptyState";
import { ErrorState } from "../../components/ui/ErrorState";
import { Spinner } from "../../components/ui/Spinner";
import { formatRelativeTime } from "../../lib/format";
import { getErrorMessage } from "../../services/api";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationStatusFilter,
  type NotificationType,
  type PublicNotification,
} from "./api/notificationsApi";
import {
  describeNotification,
  notificationTargetPath,
  notificationTypeLabel,
  NOTIFICATION_TYPE_LABELS,
} from "./lib/describe";
import { useUnreadCount } from "./useUnreadCount";
import "./notifications.css";

const PAGE_SIZE = 50;

export function NotificationsPage() {
  const { count: unreadTotal, refresh: refreshUnread } = useUnreadCount();
  const [status, setStatus] = useState<NotificationStatusFilter>("all");
  const [typeFilter, setTypeFilter] = useState<NotificationType | "all">("all");
  const [items, setItems] = useState<PublicNotification[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionDone, setActionDone] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(
    async (
      targetStatus: NotificationStatusFilter,
      targetType: NotificationType | "all",
      nextPage: number,
    ): Promise<{ items: PublicNotification[]; total: number }> => {
      return listNotifications({
        page: nextPage,
        limit: PAGE_SIZE,
        status: targetStatus,
        type: targetType === "all" ? undefined : targetType,
      });
    },
    [],
  );

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError(null);
    setActionDone(null);
    load(status, typeFilter, 1)
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
  }, [status, typeFilter, load, reloadKey]);

  const handleLoadMore = async () => {
    const nextPage = Math.floor(items.length / PAGE_SIZE) + 1;
    setIsLoadingMore(true);
    setActionError(null);
    setActionDone(null);
    try {
      const result = await load(status, typeFilter, nextPage);
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
    setActionDone(null);
    try {
      const updated = await markNotificationRead(notificationId);
      setItems((existing) =>
        existing.map((item) => (item.id === notificationId ? updated : item)),
      );
    } catch (markError) {
      setActionError(getErrorMessage(markError));
    } finally {
      void refreshUnread();
    }
  };

  const handleOpen = (notification: PublicNotification) => {
    if (!notification.read) {
      void markNotificationRead(notification.id)
        .catch(() => undefined)
        .finally(() => void refreshUnread());
    }
  };

  const handleMarkAllRead = async () => {
    setActionError(null);
    setActionDone(null);
    try {
      const modified = await markAllNotificationsRead();
      setItems((existing) =>
        existing.map((item) => ({
          ...item,
          read: true,
          readAt: item.readAt ?? new Date().toISOString(),
        })),
      );
      setActionDone(modified > 0 ? "All notifications marked as read." : "There were no unread notifications to mark.");
    } catch (markError) {
      setActionError(getErrorMessage(markError));
    } finally {
      void refreshUnread();
    }
  };

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
            disabled={unreadTotal === 0}
          >
            Mark all as read
          </button>
        </div>
      </header>

      {actionDone && (
        <div className="notifications-banner">
          <Banner tone="success">{actionDone}</Banner>
        </div>
      )}
      {actionError && (
        <div className="notifications-banner">
          <Banner tone="error">{actionError}</Banner>
        </div>
      )}

      <div className="notifications-toolbar">
        <div className="tabs" role="tablist" aria-label="Notification read filters">
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
        <label className="notifications-type-filter">
          <span className="notifications-type-filter__label">Type</span>
          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value as NotificationType | "all")}
          >
            <option value="all">All types</option>
            {NOTIFICATION_TYPE_LABELS.map((entry) => (
              <option key={entry.type} value={entry.type}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={() => setReloadKey((value) => value + 1)} />
      ) : isLoading ? (
        <Spinner label="Loading notifications" />
      ) : items.length === 0 ? (
        <EmptyState
          title={status === "all" ? "No notifications" : "You're all caught up"}
          description={
            status === "all"
              ? typeFilter === "all"
                ? "Group activity will appear here."
                : `No ${notificationTypeLabel(typeFilter as NotificationType).toLowerCase()} notifications match this filter.`
              : typeFilter === "all"
                ? "There are no unread notifications right now."
                : "There are no unread notifications of this type right now."
          }
        />
      ) : (
        <>
          <ul className="rows">
            {items.map((notification) => {
              const description = describeNotification(notification);
              const target = notificationTargetPath(notification);
              return (
                <li
                  key={notification.id}
                  className={`row notification${notification.read ? "" : " notification--unread"}`}
                >
                  <div className="notification__info">
                    <p className="row__primary">
                      {description.heading}
                      <span className="notification-type-badge">{notificationTypeLabel(notification.type)}</span>
                    </p>
                    {description.detail && <p className="row__secondary">{description.detail}</p>}
                    <p className="row__secondary notification__time">
                      {formatRelativeTime(notification.createdAt)}
                    </p>
                  </div>
                  <div className="notification__actions">
                    {!notification.read && (
                      <button
                        className="btn btn--ghost btn--sm"
                        type="button"
                        onClick={() => void handleMarkRead(notification.id)}
                      >
                        Mark as read
                      </button>
                    )}
                    <Link className="btn btn--ghost btn--sm" to={target} onClick={() => handleOpen(notification)}>
                      Open group
                    </Link>
                  </div>
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