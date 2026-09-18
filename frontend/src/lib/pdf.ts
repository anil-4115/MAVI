/**
 * Dependency-free minimal PDF text writer (PDF 1.4).
 *
 * Pure generators (no DOM) so the backend export selftest can import this
 * module directly. Money is never computed here: amounts are rendered from
 * backend-authoritative integer minor units using integer math only.
 *
 * The generator emits built-in fonts (Helvetica / Helvetica-Bold, ASCII and
 * Latin-1 safe text). Non-Latin glyphs such as "₹" are transliterated to
 * ASCII so the files open reliably in any viewer without embedded fonts.
 */

export type PdfTextSize = "title" | "section" | "body";
export type PdfLineStyle = "regular" | "bold";

export interface PdfLine {
  text: string;
  size?: PdfTextSize;
  style?: PdfLineStyle;
}

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 50;
const BODY_HEIGHT = 14;
const SECTION_HEIGHT = 20;
const TITLE_HEIGHT = 28;

const SIZES: Record<PdfTextSize, number> = { title: 16, section: 12, body: 10 };
const FONT_NUMBERS: Record<PdfLineStyle, string> = { regular: "F1", bold: "F2" };

/** Transliterate Unicode text to a WinAnsi-safe approximation ("₹" → "Rs "). */
export function asciiSafe(text: string, replacement = "?"): string {
  let out = "";
  for (const char of text) {
    if (char === "₹") {
      out += "Rs ";
      continue;
    }
    const code = char.charCodeAt(0);
    if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff)) {
      out += char;
    } else {
      out += replacement;
    }
  }
  return out;
}

/** Per the PDF spec, `(`, `)` and `\` must be escaped inside literal strings. */
export function escapePdfText(text: string): string {
  return asciiSafe(text).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/**
 * Render an integer minor-unit amount as an ASCII money string using integer
 * math only, e.g. "Rs 1,23,456.50" for INR. Mirrors the display formatting
 * but avoids non-Latin glyphs in the PDF.
 */
export function asciiMoney(amountMinor: number, currency = "INR"): string {
  const sign = amountMinor < 0 ? "-" : "";
  const absolute = Math.abs(amountMinor);
  const rupees = Math.floor(absolute / 100);
  const paise = absolute % 100;
  const number = new Intl.NumberFormat("en-IN").format(rupees);
  const suffix = paise === 0 ? "" : `.${String(paise).padStart(2, "0")}`;
  const prefix = currency === "INR" ? "Rs " : `${currency} `;
  return `${sign}${prefix}${number}${suffix}`;
}

function lineHeight(line: PdfLine): number {
  return line.size === "title" ? TITLE_HEIGHT : line.size === "section" ? SECTION_HEIGHT : BODY_HEIGHT;
}

function toBytes(text: string): number[] {
  return Array.from(text, (char) => char.charCodeAt(0) & 0xff);
}

/**
 * Build a multi-page PDF document from an ordered list of lines. Pages break
 * automatically when the printable area is full. Returns raw PDF bytes.
 */
export function buildPdf(lines: PdfLine[]): Uint8Array {
  const pages: PdfLine[][] = [];
  let current: PdfLine[] = [];
  let used = 0;
  const flush = (): void => {
    if (current.length === 0) return;
    pages.push(current);
    current = [];
    used = 0;
  };
  for (const line of lines) {
    const height = lineHeight(line);
    if (used + height > PAGE_HEIGHT - MARGIN * 2 && current.length > 0) {
      flush();
    }
    current.push(line);
    used += height;
  }
  flush();
  if (pages.length === 0) pages.push([]);

  const pageCount = pages.length;
  const fontRegularObject = 3 + pageCount;
  const fontBoldObject = 4 + pageCount;
  const streamObjectStart = 5 + pageCount;
  const objectCount = streamObjectStart + pageCount;

  const chunks: { bytes: number[] }[] = [];
  const objectOffsets: number[] = []; // byte offset of each object (1-based index)
  let cursor = 0;
  const emit = (bytes: number[]): void => {
    cursor += bytes.length;
    chunks.push({ bytes });
  };
  const emitObject = (body: string): void => {
    const objectNumber = objectOffsets.length + 1;
    const chunk = toBytes(`${objectNumber} 0 obj\n${body}\nendobj\n`);
    objectOffsets.push(cursor);
    emit(chunk);
  };

  // Header first (not an object).
  const header = toBytes("%PDF-1.4\n");
  cursor = header.length;
  chunks.push({ bytes: header });

  emitObject(`<</Type/Catalog/Pages 2 0 R>>`);
  emitObject(
    `<</Type/Pages/Kids [${Array.from({ length: pageCount }, (_, index) => `${3 + index} 0 R`).join(" ")}]/Count ${pageCount}>>`,
  );

  const contentStreams = pages.map((pageLines) => {
    const commands: string[] = ["BT"];
    let y = PAGE_HEIGHT - MARGIN;
    for (const line of pageLines) {
      const size = SIZES[line.size ?? "body"];
      const font = FONT_NUMBERS[line.style ?? "regular"];
      commands.push(`/${font} ${size} Tf`, `1 0 0 1 ${MARGIN} ${y} Tm`, `(${escapePdfText(line.text)}) Tj`);
      y -= lineHeight(line);
    }
    commands.push("ET");
    return commands.join("\n");
  });

  pages.forEach((_, index) => {
    emitObject(
      `<</Type/Page/Parent 2 0 R/MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}]/Resources <</Font <</F1 ${fontRegularObject} 0 R/F2 ${fontBoldObject} 0 R>>>>/Contents ${streamObjectStart + index} 0 R>>`,
    );
  });
  emitObject(`<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>`);
  emitObject(`<</Type/Font/Subtype/Type1/BaseFont/Helvetica-Bold>>`);
  for (let index = 0; index < contentStreams.length; index += 1) {
    const content = contentStreams[index];
    emitObject(`<</Length ${content.length}>>\nstream\n${content}\nendstream`);
  }

  const xrefOffset = cursor;

  const document = concatBytes(chunks.map((chunk) => chunk.bytes));
  const xrefLines = ["xref", `0 ${objectCount + 1}`, "0000000000 65535 f "];
  for (const offset of objectOffsets) xrefLines.push(`${String(offset).padStart(10, "0")} 00000 n `);
  const trailer = `trailer\n<</Size ${objectCount + 1}/Root 1 0 R>>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return concatBytes([Array.from(document), toBytes(`${xrefLines.join("\n")}\n${trailer}`)]);
}

function concatBytes(chunks: number[][]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let cursor = 0;
  for (const chunk of chunks) {
    out.set(new Uint8Array(chunk), cursor);
    cursor += chunk.length;
  }
  return out;
}

/**
 * Trigger a browser download of the generated PDF. DOM-only; not called from
 * the selftest.
 */
export function downloadPdf(filename: string, bytes: Uint8Array): void {
  const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** Formats a download filename, e.g. "mavi-report_2026-01-01_2026-09-18.pdf". */
export function pdfFilename(prefix: string, from: string, to: string): string {
  const cleaned = prefix.trim().replace(/[^a-z0-9-]/gi, "-").replace(/-+/g, "-");
  return `${cleaned === "" ? "mavi-report" : cleaned.toLowerCase()}_${from}_${to}.pdf`;
}