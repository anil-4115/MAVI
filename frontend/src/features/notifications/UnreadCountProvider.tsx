import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { getUnreadCount } from "./api/notificationsApi";
import { UnreadCountContext } from "./unread-count-context";

const REFRESH_INTERVAL_MS = 60_000;

/**
 * Provides the header unread-notification badge and lets the notifications
 * page refresh it after mark-read actions. Silently refreshes on an interval;
 * transient failures leave the last known count untouched.
 */
export function UnreadNotificationsProvider({ children }: { children: ReactNode }) {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    try {
      setCount(await getUnreadCount());
    } catch {
      // Offline / server hiccup: keep the previous count rather than flash 0.
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const value = useMemo(() => ({ count, refresh }), [count, refresh]);

  return <UnreadCountContext.Provider value={value}>{children}</UnreadCountContext.Provider>;
}