import { useCallback, useEffect, useState } from "react";
import { Banner } from "../../../components/ui/Banner";
import { EmptyState } from "../../../components/ui/EmptyState";
import { ErrorState } from "../../../components/ui/ErrorState";
import { Spinner } from "../../../components/ui/Spinner";
import { formatRelativeTime } from "../../../lib/format";
import { getErrorMessage } from "../../../services/api";
import {
  listNotifications,
  markNotificationRead,
  type NotificationStatusFilter,
  type PublicNotification,
} from "../api/notificationsApi";
import { describeNotification, notificationTypeLabel } from "../lib/describe";
import { useUnreadCount } from "../useUnreadCount";

interface ActivityTabProps {
  groupId: string;
  currentUserId: string | null;
}

const PAGE_SIZE = 50;

/**
 * Group-scoped activity view. The backend notification API lists the current
 * user's notifications (with `?status=unread` / `?type=` server filters); the
 * Activity tab additionally scopes to one group using ONLY the backend-returned
 * `group` id — no cross-group data ever reaches this view, and no financial
 * values are computed here.
 */
export function ActivityTab({ groupId, currentUserId }: ActivityTabProps) {
  const { refresh: refreshUnread } = useUnreadCount();
  const [filter, setFilter] = useState<NotificationStatusFilter>("all");
  const [items, setItems] = useState<PublicNotification[]>([]);
  const [nextPage, setNextPage] = useState(2);
  const [totalPages, setTotalPages] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const loadFirst = useCallback(() => {
    setIsLoading(true);
    setError(null);
    setActionError(null);
    setItems([]);
    const run = async () => {
      const collected: PublicNotification[] = [];
      let page = 1;
      let lastTotalPages = 0;
      for (;;) {
        const result = await listNotifications({
          page,
          limit: PAGE_SIZE,
          status: filter,
        });
        lastTotalPages = result.totalPages;
        collected.push(...result.items.filter((notification) => notification.group === groupId));
        if (collected.length > 0 || page >= lastTotalPages) {
          break;
        }
        page += 1;
      }
      setItems(collected);
      setNextPage(page + 1);
      setTotalPages(lastTotalPages);
    };
    run()
      .catch((loadError: unknown) => setError(getErrorMessage(loadError)))
      .finally(() => setIsLoading(false));
  }, [groupId, filter]);

  useEffect(() => {
    loadFirst();
  }, [loadFirst, reloadKey]);

  const handleLoadMore = () => {
    if (isLoadingMore) {
      return;
    }
    setIsLoadingMore(true);
    setActionError(null);
    listNotifications({
      page: nextPage,
      limit: PAGE_SIZE,
      status: filter,
    })
      .then((result) => {
        setTotalPages(result.totalPages);
        setItems((existing) => [
          ...existing,
          ...result.items.filter((notification) => notification.group === groupId),
        ]);
        setNextPage((page) => page + 1);
      })
      .catch((loadError: unknown) => setActionError(getErrorMessage(loadError)))
      .finally(() => setIsLoadingMore(false));
  };

  const handleMarkRead = async (notificationId: string) => {
    setActionError(null);
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

  const hasMore = nextPage <= totalPages;

  return (
    <div>
      {actionError && (
        <div className="notifications-banner">
          <Banner tone="error">{actionError}</Banner>
        </div>
      )}

      <div className="tabs" role="tablist" aria-label="Activity filters">
        {(["all", "unread"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={filter === tab}
            className={`tab${filter === tab ? " tab--active" : ""}`}
            onClick={() => setFilter(tab)}
          >
            {tab === "all" ? "All activity" : "Unread"}
          </button>
        ))}
      </div>

      {error ? (
        <ErrorState message={error} onRetry={() => setReloadKey((value) => value + 1)} />
      ) : isLoading ? (
        <Spinner label="Loading activity" />
      ) : items.length === 0 ? (
        <EmptyState
          title={filter === "all" ? "No activity in this group yet" : "No unread activity"}
          description={
            filter === "all"
              ? "Expenses, settlements, member changes and more from this group will appear here."
              : "There are no unread notifications for this group right now."
          }
        />
      ) : (
        <ul className="rows">
          {items.map((notification) => {
            const description = describeNotification(notification, currentUserId);
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
      )}

      {!isLoading && hasMore && (
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
    </div>
  );
}