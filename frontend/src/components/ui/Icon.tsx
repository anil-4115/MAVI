import type { ReactNode } from "react";

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
}

export type IconName =
  | "dashboard"
  | "groups"
  | "expenses"
  | "balances"
  | "settlements"
  | "reports"
  | "notifications"
  | "search"
  | "plus"
  | "menu"
  | "close"
  | "settings"
  | "logout"
  | "chevron-right"
  | "chevron-down"
  | "chevron-left"
  | "calendar"
  | "wallet"
  | "trending-up"
  | "trending-down"
  | "home"
  | "activity"
  | "user"
  | "help"
  | "check"
  | "edit"
  | "trash"
  | "alert"
  | "arrow-right"
  | "card"
  | "tag"
  | "sparkles"
  | "clock"
  | "bell-off"
  | "filter";

/* eslint-disable react/no-array-index-key */
const DASHBOARD = [
  <rect key="1" x="3" y="3" width="7.2" height="9" rx="1.6" />,
  <rect key="2" x="13.8" y="3" width="7.2" height="5.4" rx="1.6" />,
  <rect key="3" x="13.8" y="12" width="7.2" height="9" rx="1.6" />,
  <rect key="4" x="3" y="15.6" width="7.2" height="5.4" rx="1.6" />,
];

const GROUPS = [
  <circle key="1" cx="9" cy="8" r="3.4" />,
  <path key="2" d="M3.4 20c.6-3.2 2.9-5 5.6-5s5 1.8 5.6 5" />,
  <path key="3" d="M16.2 4.8a3.4 3.4 0 010 6.4" />,
  <path key="4" d="M17.9 15.1c1.7.4 3 1.9 3.4 4.3" />,
];

const EXPENSES = [
  <rect key="1" x="4" y="3" width="16" height="18" rx="2" />,
  <path key="2" d="M8 8h8M8 12h8M8 16h5" />,
];

const BALANCES = [
  <path key="1" d="M3 7h18" />,
  <circle key="2" cx="3" cy="7" r="1.6" />,
  <circle key="3" cx="21" cy="7" r="1.6" />,
  <path key="4" d="M6 7v9a2 2 0 002 2h8a2 2 0 002-2V7" />,
  <path key="5" d="M9 10h6v3H9z" />,
];

const SETTLEMENTS = [
  <path key="1" d="M14 10l-4 8H6m2-4l-2 2 2 2" />,
  <circle key="2" cx="17" cy="10" r="3.4" />,
  <path key="3" d="M12 9m-1 0a1 1 0 102 0 1 1 0 10-2 0" />,
];

const REPORTS = [
  <path key="1" d="M4 20V10" />,
  <path key="2" d="M10 20V4" />,
  <path key="3" d="M16 20v-7" />,
  <path key="4" d="M22 20H2" />,
];

const NOTIFICATIONS = [
  <path key="1" d="M18 9a6 6 0 10-12 0c0 5-2 6-2 6h16s-2-1-2-6" />,
  <path key="2" d="M10.3 19.5a2 2 0 003.4 0" />,
];

const SEARCH = [
  <circle key="1" cx="11" cy="11" r="7" />,
  <path key="2" d="M21 21l-4.35-4.35" />,
];

const PLUS = [<path key="1" d="M12 5v14M5 12h14" />];

const MENU = [<path key="1" d="M4 7h16M4 12h16M4 17h16" />];

const CLOSE = [<path key="1" d="M6 6l12 12M18 6L6 18" />];

const SETTINGS = [
  <circle key="1" cx="12" cy="12" r="3" />,
  <path
    key="2"
    d="M19.4 15a1.7 1.7 0 00.34 1.87l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.7 1.7 0 00-1.87-.34 1.7 1.7 0 00-1 1.55V21a2 2 0 11-4 0v-.09a1.7 1.7 0 00-1.06-1.58 1.7 1.7 0 00-1.87.34l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.7 1.7 0 00.34-1.87 1.7 1.7 0 00-1.55-1H3a2 2 0 110-4h.09a1.7 1.7 0 001.58-1.06 1.7 1.7 0 00-.34-1.87l-.06-.06a2 2 0 112.83-2.83l.06.06a1.7 1.7 0 001.87.34h.08a1.7 1.7 0 001-1.55V3a2 2 0 114 0v.09a1.7 1.7 0 001 1.55h.08a1.7 1.7 0 001.87-.34l.06-.06a2 2 0 112.83 2.83l-.06.06a1.7 1.7 0 00-.34 1.87v.08a1.7 1.7 0 001.55 1H21a2 2 0 110 4h-.09a1.7 1.7 0 00-1.55 1z"
  />,
];

const LOGOUT = [
  <path key="1" d="M9 21H6a2 2 0 01-2-2V5a2 2 0 012-2h3" />,
  <path key="2" d="M16 17l5-5-5-5" />,
  <path key="3" d="M21 12H9" />,
];

const CHEVRON_RIGHT = [<path key="1" d="M9 6l6 6-6 6" />];
const CHEVRON_DOWN = [<path key="1" d="M6 9l6 6 6-6" />];
const CHEVRON_LEFT = [<path key="1" d="M15 6l-6 6 6 6" />];

const CALENDAR = [
  <rect key="1" x="3" y="5" width="18" height="16" rx="2" />,
  <path key="2" d="M8 3v4M16 3v4M3 9.5h18" />,
];

const WALLET = [
  <path key="1" d="M3 7a2 2 0 012-2h13a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2z" />,
  <path key="2" d="M16 12h.01" />,
  <path key="3" d="M3 9h18" />,
];

const TRENDING_UP = [
  <path key="1" d="M3 17l6-6 4 4 8-8" />,
  <path key="2" d="M16 7h5v5" />,
];

const TRENDING_DOWN = [
  <path key="1" d="M3 7l6 6 4-4 8 8" />,
  <path key="2" d="M21 12v5h-5" />,
];

const HOME = [
  <path key="1" d="M4 11l8-7 8 7" />,
  <path key="2" d="M6 10v10h12V10" />,
];

const ACTIVITY = [<path key="1" d="M3 12h4l2.5-7 5 14L17 12h4" />];

const USER = [
  <circle key="1" cx="12" cy="8" r="4" />,
  <path key="2" d="M4.5 21c.8-3.6 3.3-5.5 7.5-5.5s6.7 1.9 7.5 5.5" />,
];

const HELP = [
  <circle key="1" cx="12" cy="12" r="9" />,
  <path key="2" d="M9.2 9a3 3 0 015.9 1c0 2-3 2.5-3 4" />,
  <path key="3" d="M12 17.5h.01" />,
];

const CHECK = [<path key="1" d="M5 13l4 4L19 7" />];

const EDIT = [
  <path key="1" d="M4 20h4L20.5 7.5a2.1 2.1 0 00-3-3L5 17z" />,
  <path key="2" d="M14 6l3 3" />,
];

const TRASH = [
  <path key="1" d="M4 7h16" />,
  <path key="2" d="M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2" />,
  <path key="3" d="M6 7l1 13a1 1 0 001 1h8a1 1 0 001-1l1-13" />,
  <path key="4" d="M10 11v6M14 11v6" />,
];

const ALERT = [
  <path key="1" d="M12 3l10 17H2z" />,
  <path key="2" d="M12 9.5V14" />,
  <path key="3" d="M12 17h.01" />,
];

const ARROW_RIGHT = [<path key="1" d="M4 12h16" />, <path key="2" d="M14 6l6 6-6 6" />];

const CARD = [
  <rect key="1" x="3" y="5" width="18" height="14" rx="2" />,
  <path key="2" d="M3 10h18M7 15h3" />,
];

const TAG = [
  <path key="1" d="M3 11V5a2 2 0 012-2h6l10 10-8 8z" />,
  <circle key="2" cx="8" cy="8" r="1.4" />,
];

const SPARKLES = [
  <path key="1" d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" />,
  <path key="2" d="M19 17l1 2 2 1-2 1-1 2-1-2-2-1 2-1z" />,
];

const CLOCK = [
  <circle key="1" cx="12" cy="12" r="9" />,
  <path key="2" d="M12 7v5l3 3" />,
];

const BELL_OFF = [
  <path key="1" d="M8 19a4 4 0 008 0" />,
  <path key="2" d="M18 9a6 6 0 00-5.5-5.9" />,
  <path key="3" d="M20 5L4 21" />,
  <path key="4" d="M6 9v4c0 2-1.6 3-1.6 3h12.1" />,
];

const FILTER = [
  <path key="1" d="M4 6h16" />,
  <path key="2" d="M7 12h10" />,
  <path key="3" d="M10 18h4" />,
];

const ICONS: Record<string, ReactNode[]> = {
  dashboard: DASHBOARD,
  groups: GROUPS,
  expenses: EXPENSES,
  balances: BALANCES,
  settlements: SETTLEMENTS,
  reports: REPORTS,
  notifications: NOTIFICATIONS,
  search: SEARCH,
  plus: PLUS,
  menu: MENU,
  close: CLOSE,
  settings: SETTINGS,
  logout: LOGOUT,
  "chevron-right": CHEVRON_RIGHT,
  "chevron-down": CHEVRON_DOWN,
  "chevron-left": CHEVRON_LEFT,
  calendar: CALENDAR,
  wallet: WALLET,
  "trending-up": TRENDING_UP,
  "trending-down": TRENDING_DOWN,
  home: HOME,
  activity: ACTIVITY,
  user: USER,
  help: HELP,
  check: CHECK,
  edit: EDIT,
  trash: TRASH,
  alert: ALERT,
  "arrow-right": ARROW_RIGHT,
  card: CARD,
  tag: TAG,
  sparkles: SPARKLES,
  clock: CLOCK,
  "bell-off": BELL_OFF,
  filter: FILTER,
};

export function Icon({ name, size = 20, className, "aria-hidden": ariaHidden }: IconProps) {
  const children = ICONS[name];
  if (!children) {
    return null;
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={ariaHidden ?? true}
      focusable="false"
    >
      {children}
    </svg>
  );
}