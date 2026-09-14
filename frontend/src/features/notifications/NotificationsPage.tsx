import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Banner } from "../../components/ui/Banner";
import { EmptyState } from "../../components/ui/EmptyState";
import { ErrorState } from "../../components/ui/ErrorState";
import { Icon, type IconName } from "../../components/ui/Icon";
import { Spinner } from "../../components/ui/Spinner";
import { useToast } from "../../components/ui/Toast";
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

const TYPE_ICONS: Record<NotificationType, IconName> = {
  group_invitation: "groups",
  invitation_accepted: "check",
  member_removed: "logout",
  member_left: "logout",
  role_changed: "settings",
  ownership_transferred: "user",
  group_archived: "bell-off",
  expense_created: "expenses",
  settlement_recorded: "settlements",
};

interface TypeFilterMenuProps {
  value: NotificationType | "all";
  onChange: (value: NotificationType | "all") => void;
}

/** Custom dropdown filter (replaces the native-looking type select). */
function TypeFilterMenu({ value, onChange }: TypeFilterMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const closeOnOutsideClick = (event: MouseEvent): void => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const label = value === "all" ? "All types" : notificationTypeLabel(value);

  return (
    <div className="type-filter" ref={ref}>
      <button
        type="button"
        className={`type-filter__trigger${open ? " type-filter__trigger--open" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <Icon name="filter" size={15} aria-hidden="true" />
        <span>{label}</span>
        <Icon name="chevron-down" size={15} className="type-filter__chevron" aria-hidden="true" />
      </button>

      {open && (
        <ul className="type-filter__menu" role="listbox" aria-label="Filter by notification type">
          <li>
            <button
              type="button"
              role="option"
              aria-selected={value === "all"}
              className={`type-filter__option${value === "all" ? " type-filter__option--selected" : ""}`}
              onClick={() => {
                onChange("all");
                setOpen(false);
              }}
            >
              All types
              {value === "all" && <Icon name="check" size={15} aria-hidden="true" />}
            </button>
          </li>
          {NOTIFICATION_TYPE_LABELS.map((entry) => {
            const selected = value === entry.type;
            return (
              <li key={entry.type}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={`type-filter__option${selected ? " type-filter__option--selected" : ""}`}
                  onClick={() => {
                    onChange(entry.type);
                    setOpen(false);
                  }}
                >
                  <span className="type-filter__option-label">
                    <Icon name={TYPE_ICONS[entry.type]} size={15} aria-hidden="true" />
                    {entry.label}
                  </span>
                  {selected && <Icon name="check" size={15} aria-hidden="true" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

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
  const [reloadKey, setReloadKey] = useState(0);
  const { addToast } = useToast();

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
    try {
      const modified = await markAllNotificationsRead();
      setItems((existing) =>
        existing.map((item) => ({
          ...item,
          read: true,
          readAt: item.readAt ?? new Date().toISOString(),
        })),
      );
      addToast(
        modified > 0 ? "All notifications marked as read." : "There were no unread notifications to mark.",
        "success",
      );
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
        <TypeFilterMenu value={typeFilter} onChange={setTypeFilter} />
      </div>

      {error ? (
        <ErrorState message={error} onRetry={() => setReloadKey((value) => value + 1)} />
      ) : isLoading ? (
        <Spinner label="Loading notifications" />
      ) : items.length === 0 ? (
        <EmptyState
          title={status === "all" ? "No notifications" : "You're all caught up"}
          icon="notifications"
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
                  <span
                    className={`notification__icon${
                      notification.read ? "" : " notification__icon--unread"
                    }`}
                    aria-hidden="true"
                  >
                    <Icon name={TYPE_ICONS[notification.type]} size={16} />
                  </span>
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