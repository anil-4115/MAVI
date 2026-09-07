const DATE_FORMAT = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const DATE_TIME_FORMAT = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/** "12 Mar 2026" */
export function formatDate(iso: string): string {
  return DATE_FORMAT.format(new Date(iso));
}

/** "12 Mar 2026, 4:30 pm" */
export function formatDateTime(iso: string): string {
  return DATE_TIME_FORMAT.format(new Date(iso));
}

/** "just now", "5 minutes ago", "3 hours ago", "2 days ago", then a date. */
export function formatRelativeTime(iso: string): string {
  const timestamp = new Date(iso).getTime();
  const differenceMs = Date.now() - timestamp;
  const seconds = Math.floor(differenceMs / 1000);

  if (seconds < 45) {
    return "just now";
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }
  const days = Math.floor(hours / 24);
  if (days < 7) {
    return `${days} day${days === 1 ? "" : "s"} ago`;
  }
  return formatDate(iso);
}