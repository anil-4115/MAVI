/**
 * Dependency-free CSV helpers (RFC 4180).
 *
 * Pure — no DOM access — so the same module can be exercised by the backend
 * export selftest. Money is never computed here: the module only serializes
 * "-prepared rows. Prepared numbers are strings (exported amounts are already
 * backend-authoritative integers rendered as text).
 */

/** Escape a single CSV field per RFC 4180. */
export function escapeCsvField(value: unknown): string {
  const text = String(value ?? "");
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/** Serialize rows into a CSV document using CRLF record separators. */
export function toCsv(rows: unknown[][]): string {
  const records = rows.map((row) => row.map(escapeCsvField).join(","));
  return records.length > 0 ? `${records.join("\r\n")}\r\n` : "";
}

/**
 * Schema-safe default: quote any column that needs it, but always include the
 * header row so exported files are readable in any spreadsheet.
 */
export function toCsvWithHeader(header: string[], rows: unknown[][]): string {
  return toCsv([header, ...rows]);
}

/** Formats a download filename, e.g. "mavi-report_2026-01-01_2026-09-18.csv". */
export function csvFilename(prefix: string, from: string, to: string): string {
  return `${sanitizeFilePrefix(prefix)}_${from}_${to}.csv`;
}

function sanitizeFilePrefix(prefix: string): string {
  const cleaned = prefix.trim().replace(/[^a-z0-9-]/gi, "-").replace(/-+/g, "-");
  return cleaned === "" ? "mavi-report" : cleaned.toLowerCase();
}

/**
 * Trigger a browser download of a UTF-8 CSV (with BOM so Excel and similar
 * tools detect the encoding). DOM-only; not called from the selftest.
 */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}