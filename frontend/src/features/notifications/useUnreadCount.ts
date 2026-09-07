import { useContext } from "react";
import { UnreadCountContext, type UnreadCountContextValue } from "./unread-count-context";

export function useUnreadCount(): UnreadCountContextValue {
  const context = useContext(UnreadCountContext);
  if (!context) {
    throw new Error("useUnreadCount must be used within an UnreadNotificationsProvider");
  }
  return context;
}