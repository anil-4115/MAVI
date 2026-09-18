/**
 * Reports export selftest — PURE (no database, no HTTP, no browser).
 *
 * Exercises the dependency-free export modules that the Reports page uses for
 * CSV and PDF downloads:
 *   - frontend/src/lib/csv.ts       RFC 4180 escaping / CRLF / filenames
 *   - frontend/src/lib/pdf.ts       ASCII-safe minimal PDF writer
 *   - frontend/src/features/reports/utils/reportExport.ts
 *                                   report → CSV rows / PDF text lines
 *
 * Asserts escaping, UTF-8-safe text, PDF structural integrity (header, object
 * offsets, xref, trailer) and that backend-aggregated integers render exactly.
 *
 *   npx tsx scripts/export-selftest.ts
 */
import { escapeCsvField, toCsv, toCsvWithHeader, csvFilename } from "../../frontend/src/lib/csv.ts";
import {
  asciiSafe,
  asciiMoney,
  buildPdf,
  escapePdfText,
  pdfFilename,
} from "../../frontend/src/lib/pdf.ts";
import {
  CSV_HEADER,
  reportToCsv,
  reportToPdfLines,
} from "../../frontend/src/features/reports/utils/reportExport.ts";
import type { ReportSummary } from "../../frontend/src/features/reports/api/reportsApi.ts";

let failures = 0;
const failuresList: string[] = [];
const passCount = { n: 0 };

const check = (condition: boolean, label: string): void => {
  if (condition) {
    passCount.n++;
  } else {
    failures++;
    failuresList.push(`FAIL: ${label}`);
  }
};

const fixture: ReportSummary = {
  range: { from: "2026-01-01", to: "2026-01-31" },
  scope: "all",
  groupId: null,
  groupName: null,
  currency: "INR",
  expenseCount: 2,
  groupExpenseCount: 1,
  personalExpenseCount: 1,
  totalSpentMinor: 160000,
  groupSpentMinor: 100000,
  personalSpentMinor: 60000,
  paidMinor: 100000,
  owedMinor: 50000,
  netMinor: 50000,
  settlementCount: 1,
  settlementTotalMinor: 10000,
  categories: [{ category: "Food & Drinks", amountMinor: 160000, expenseCount: 2 }],
  groups: [
    {
      groupId: "g1",
      groupName: 'Trip, group "A"',
      archived: false,
      expenseCount: 1,
      spentMinor: 100000,
      myPaidMinor: 100000,
      myOwedMinor: 50000,
      myNetMinor: 50000,
      settlementCount: 1,
      settlementTotalMinor: 10000,
    },
  ],
  transactions: [
    {
      id: "t1",
      date: "2026-01-31T00:00:00.000Z",
      description: 'Lunch, "special"',
      category: "Food & Drinks",
      type: "group",
      groupId: "g1",
      groupName: 'Trip, group "A"',
      payerId: "u1",
      payerName: "Asha",
      amountMinor: 100000,
      currency: "INR",
      splitMethod: "equal",
    },
    {
      id: "t2",
      date: "2026-01-05T00:00:00.000Z",
      description: "Groceries",
      category: "Food & Drinks",
      type: "personal",
      groupId: null,
      groupName: null,
      payerId: "u1",
      payerName: "Asha",
      amountMinor: 60000,
      currency: "INR",
      splitMethod: "equal",
    },
  ],
};

/* -------------------------------- CSV ----------------------------------- */
check(escapeCsvField("plain") === "plain", "CSV: plain field unchanged");
check(escapeCsvField("a,b") === '"a,b"', "CSV: comma triggers quoting");
check(escapeCsvField('say "hi"') === '"say ""hi"""', "CSV: quotes are doubled");
check(escapeCsvField("line\nbreak") === '"line\nbreak"', "CSV: newline triggers quoting");
check(escapeCsvField("car\rriage") === '"car\rriage"', "CSV: carriage return triggers quoting");
check(escapeCsvField(undefined) === "" && escapeCsvField(null) === "", "CSV: null/undefined render empty");

const csvDoc = toCsv([
  ["a", "b"],
  ["c", "d"],
]);
check(csvDoc === "a,b\r\nc,d\r\n", `CSV: CRLF records + trailing newline (got ${JSON.stringify(csvDoc)})`);
check(toCsv([]) === "", "CSV: empty input yields empty output");

const headed = toCsvWithHeader(["H1", "H2"], [["x", "y"]]);
check(headed === "H1,H2\r\nx,y\r\n", "CSV: header always first");

check(csvFilename("MAVI Report", "2026-01-01", "2026-01-31") === "mavi-report_2026-01-01_2026-01-31.csv", "CSV: filename sanitized");
check(csvFilename("", "2026-01-01", "2026-01-31") === "mavi-report_2026-01-01_2026-01-31.csv", "CSV: filename fallback prefix");
check(pdfFilename("MAVI Report", "2026-01-01", "2026-01-31") === "mavi-report_2026-01-01_2026-01-31.pdf", "PDF: filename sanitized");

const reportCsv = reportToCsv(fixture);
const csvLines = reportCsv.split("\r\n").filter((line) => line.length > 0);
check(csvLines.length === fixture.transactions.length + 1, `CSV: header + one row per transaction (got ${csvLines.length})`);
check(csvLines[0] === CSV_HEADER.join(","), "CSV: header matches schema");
check(csvLines[1].includes('"Lunch, ""special"""'), `CSV: description escaped in output (got ${csvLines[1]})`);
check(csvLines[1].includes('"Trip, group ""A"""'), "CSV: group name escaped in output");
check(csvLines[1].includes("1000.00"), "CSV: integer minor units rendered exactly");
check(csvLines[2].includes("Personal"), "CSV: personal type labelled");
check(!reportCsv.includes("\uFFFD"), "CSV: no replacement characters");

/* -------------------------------- PDF ----------------------------------- */
check(asciiSafe("₹1,000") === "Rs 1,000", `PDF: rupee transliterated (got ${asciiSafe("₹1,000")})`);
check(asciiSafe("café") === "café", "PDF: latin-1 accents preserved");
check(asciiSafe("party 🎉") === "party ?", `PDF: unsupported glyph replaced (got ${asciiSafe("party 🎉")})`);
check(escapePdfText("a(b)c\\d") === "a\\(b\\)c\\\\d", "PDF: literal-string escapes applied");
check(asciiMoney(123456) === "Rs 1,234.56", `PDF: money with paise (got ${asciiMoney(123456)})`);
check(asciiMoney(100000) === "Rs 1,000", "PDF: whole rupees omit decimals");
check(asciiMoney(-5000) === "-Rs 50", "PDF: negative amounts keep sign");

const lines = reportToPdfLines(fixture);
check(lines.every((line) => !/[^\u0020-\u00ff]/.test(escapePdfText(line.text))), "PDF: every text line sanitizes to WinAnsi-safe bytes");
check(lines.some((line) => line.text.includes("MAVI")), "PDF: report title present");
check(lines.some((line) => line.text.includes("2026-01-01") && line.text.includes("2026-01-31")), "PDF: range present");
check(lines.some((line) => line.text.includes("Food & Drinks")), "PDF: category present");
check(lines.some((line) => line.text.includes("Trip, group")), "PDF: group name present");
check(lines.some((line) => line.text.includes("Rs 1,600")), "PDF: total rendered via ascii money");
check(lines.some((line) => line.text.includes("Settlements")), "PDF: settlement section present");

const pdfBytes = buildPdf(lines);
const pdfText = Buffer.from(pdfBytes).toString("latin1");
check(pdfText.startsWith("%PDF-1.4"), "PDF: header version");
check(pdfText.trimEnd().endsWith("%%EOF"), "PDF: EOF marker");
check(pdfText.includes("/Type/Catalog"), "PDF: catalog object");
check(pdfText.includes("/Type/Pages"), "PDF: pages tree");
check(pdfText.includes("/Type/Page/"), "PDF: page object");
check(pdfText.includes("/BaseFont/Helvetica") && pdfText.includes("/BaseFont/Helvetica-Bold"), "PDF: built-in fonts declared");
check(pdfText.includes("stream") && pdfText.includes("endstream"), "PDF: content stream markers");
check(pdfText.includes("trailer") && pdfText.includes("/Root 1 0 R"), "PDF: trailer references catalog");

const startxrefIndex = pdfText.lastIndexOf("startxref");
const xrefOffset = Number.parseInt(pdfText.slice(startxrefIndex + "startxref".length).trim(), 10);
check(Number.isInteger(xrefOffset), "PDF: startxref offset is an integer");
check(pdfText.slice(xrefOffset, xrefOffset + 4) === "xref", `PDF: startxref points at the xref table (got ${pdfText.slice(xrefOffset, xrefOffset + 8)})`);
check(pdfText.slice(xrefOffset).includes("0000000000 65535 f"), "PDF: xref free entry present");
check(/0000000\d{3} 00000 n/.test(pdfText.slice(xrefOffset)), "PDF: xref object entries present");

const streamLengthMatches = [...pdfText.matchAll(/<<\/Length (\d+)>>\nstream\n([\s\S]*?)\nendstream/g)].every(
  (match) => Number.parseInt(match[1], 10) === match[2].length,
);
check(streamLengthMatches, "PDF: declared stream lengths match content");

const manyLines = Array.from({ length: 200 }, (_, index) => ({ text: `Row ${index}` }));
const multiPage = Buffer.from(buildPdf(manyLines)).toString("latin1");
const pageObjectCount = (multiPage.match(/\/Type\/Page\//g) ?? []).length;
check(pageObjectCount >= 2, `PDF: long reports paginate (got ${pageObjectCount} pages)`);
check(multiPage.includes("/Count" ) && multiPage.includes(`/Count ${pageObjectCount}`), "PDF: page count matches pages tree");

console.log(`\nexport selftest checks passed: ${passCount.n}`);
if (failures > 0) {
  console.log(`\nFAILURES (${failures}):\n- ${failuresList.join("\n- ")}\n`);
  console.log("ALL EXPORT SELFTESTS FAILED");
  process.exit(1);
}
console.log("\nALL EXPORT SELFTESTS PASSED");
