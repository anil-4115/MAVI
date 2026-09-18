const SENSITIVE_QUERY_PARAMS = new Set([
  "token",
  "code",
  "key",
  "api_key",
  "apikey",
  "access_token",
  "password",
  "secret",
  "otp",
  "auth",
]);

const decodeSafe = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

/**
 * Redacts sensitive query parameters from a URL string so secrets (e.g. the
 * email-verification `token` in `GET /auth/verify-email`) never reach the
 * request logs. The path and every non-sensitive parameter are preserved
 * byte-for-byte; URLs without a query are returned unchanged.
 */
export const sanitizeLogUrl = (url: string): string => {
  const queryIndex = url.indexOf("?");
  if (queryIndex === -1) return url;

  const path = url.slice(0, queryIndex);
  const query = url.slice(queryIndex + 1);
  if (query === "") return url;

  let changed = false;
  const sanitized = query.split("&").map((pair) => {
    const equalsIndex = pair.indexOf("=");
    const rawKey = equalsIndex === -1 ? pair : pair.slice(0, equalsIndex);
    const key = decodeSafe(rawKey).toLowerCase();
    if (SENSITIVE_QUERY_PARAMS.has(key)) {
      changed = true;
      return `${rawKey}=[REDACTED]`;
    }
    return pair;
  });

  return changed ? `${path}?${sanitized.join("&")}` : url;
};