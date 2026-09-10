/**
 * Client-side supplier quotation PDF parser.
 * Uses pdfjs-dist (already a project dependency) to extract text, then applies
 * pattern-based heuristics derived from analysing real TOMAS TECH supplier PDFs
 * (MISUMI, Keyence, O THREE PRO, EMMA Electric, Thai System Research, etc.).
 *
 * The parser is intentionally lenient: it returns partial results and a
 * confidence map so the UI can show which fields need manual correction.
 *
 * NOTE: All pdfjs-dist imports are lazy (inside the async function) to avoid
 * the "window is not defined" SSR crash when vinext pre-renders the parent page.
 */

export type ParsedLine = {
  lineNo: number;
  itemCode: string;
  description: string;
  brand: string;
  model: string;
  qty: number;
  unit: string;
  unitPrice: number;
  currency: string;
  remark: string;
};

export type ParsedQuotation = {
  supplierName: string;
  supplierTaxId: string;
  quotationNumber: string;
  receivedDate: string;      // ISO yyyy-mm-dd or ""
  validUntil: string;        // ISO yyyy-mm-dd or ""
  currency: "THB" | "JPY" | "USD" | "EUR";
  totalAmount: number;
  lines: ParsedLine[];
  rawText: string;
  requiresOcr: boolean;      // true when no embedded text was found
  confidence: Record<string, "high" | "low" | "none">;
};

// ── Helpers ────────────────────────────────────────────────────────────────

function stripCommas(s: string): string { return s.replace(/,/g, ""); }

/** Convert Buddhist Era (พ.ศ.) year → CE if year > 2500 */
function beToCe(year: number): number { return year > 2500 ? year - 543 : year; }

const MONTH_MAP: Record<string, number> = {
  jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12,
  january:1, february:2, march:3, april:4, june:6, july:7, august:8, september:9,
  october:10, november:11, december:12,
  // Thai short abbreviations (with dot stripped)
  "มค":1, "กพ":2, "มีค":3, "เมย":4, "พค":5, "มิย":6, "กค":7, "สค":8, "กย":9, "ตค":10, "พย":11, "ธค":12,
  // Thai short with dot (matched after stripping dot)
  "ม.ค":1, "ก.พ":2, "มี.ค":3, "เม.ย":4, "พ.ค":5, "มิ.ย":6, "ก.ค":7, "ส.ค":8, "ก.ย":9, "ต.ค":10, "พ.ย":11, "ธ.ค":12,
  // Thai full month names
  "มกราคม":1, "กุมภาพันธ์":2, "มีนาคม":3, "เมษายน":4, "พฤษภาคม":5, "มิถุนายน":6,
  "กรกฎาคม":7, "สิงหาคม":8, "กันยายน":9, "ตุลาคม":10, "พฤศจิกายน":11, "ธันวาคม":12,
};

function parseDate(raw: string): string {
  raw = raw.trim();
  // DD/MM/YYYY or DD-MM-YYYY
  let m = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    const d = m[1]!.padStart(2, "0"), mo = m[2]!.padStart(2, "0");
    const y = beToCe(Number(m[3]!.length === 2 ? `20${m[3]}` : m[3]));
    return `${y}-${mo}-${d}`;
  }
  // D Mon YYYY or DD-Mon-YYYY (handles Thai full/short month names and English)
  m = raw.match(/^(\d{1,2})[\s\-]([^\s\d\-\/]{2,20})[\s\-](\d{2,4})$/);
  if (m) {
    const d = m[1]!.padStart(2, "0");
    const monthKey = m[2]!.toLowerCase().replace(/\./g, "");
    const mo = MONTH_MAP[monthKey] ?? MONTH_MAP[m[2]!] ?? 1;
    const y = beToCe(Number(m[3]!.length === 2 ? `20${m[3]}` : m[3]));
    return `${y}-${String(mo).padStart(2, "0")}-${d}`;
  }
  // YYYY-MM-DD (ISO)
  m = raw.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (m) {
    const y = beToCe(Number(m[1]));
    return `${y}-${m[2]!.padStart(2,"0")}-${m[3]!.padStart(2,"0")}`;
  }
  return "";
}

function detectCurrency(text: string): "THB" | "JPY" | "USD" | "EUR" {
  if (/\bJPY\b|\bYEN\b|¥/i.test(text)) return "JPY";
  if (/\bUSD\b|\bUS\$|\$\d/i.test(text)) return "USD";
  if (/\bEUR\b|€/i.test(text)) return "EUR";
  return "THB";
}

function extractTaxId(text: string): string {
  // 13-digit run (sometimes hyphen-separated)
  const m = text.match(/\b(\d{13})\b/) ?? text.match(/(\d{1}-\d{4}-\d{5}-\d{1,2}-\d{1})/);
  return m ? m[1]!.replace(/-/g, "") : "";
}

function extractQuotationNumber(text: string): string {
  // Explicit label
  const labeled = text.match(/(?:quotation\s*(?:no\.?|number:?|date:?)|ใบเสนอราคา(?:เลขที่)?|QT(?:NO)?|BT\s*NO|SQ\s*NO)[:\s#]+([A-Z0-9\-\/]+)/i);
  if (labeled) return labeled[1]!.trim();
  // Common prefixes
  const prefixed = text.match(/\b(QT\d[\w\-]{4,}|SQ[\d\-]{4,}|BT\d{2}[-\d]{5,}|OTP\d{6,}|TMTS\d{2}-\d+|FA\d+[A-Z]+|QCA\d+|Q\d{6,}|INV\d+)/);
  if (prefixed) return prefixed[1]!;
  // Fallback: any token that looks like a document number near "No."
  const generic = text.match(/(?:No\.|NO\.|เลขที่)[:\s]*([A-Z0-9\-\/]{5,20})/i);
  return generic ? generic[1]!.trim() : "";
}

function extractSupplierName(lines: string[]): string {
  // The first non-empty line that looks like a company name
  for (const line of lines.slice(0, 25)) {
    const t = line.trim();
    if (!t || t.length < 5) continue;
    if (/(?:co\.,?\s*ltd|จำกัด|company|corporation|inc\.|gmbh|co\.th|บริษัท)/i.test(t)) return t;
  }
  // Fallback: first non-empty line that's fully uppercase
  for (const line of lines.slice(0, 12)) {
    const t = line.trim();
    if (t.length >= 5 && t === t.toUpperCase() && /[A-Z]/.test(t)) return t;
  }
  return "";
}

function extractDate(text: string, keywords: string[]): string {
  for (const kw of keywords) {
    // Escape special regex chars in keyword
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(
      `${escaped}[:\\s]*([\\d]{1,2}[\\s\\/\\-][^\\d\\n\\r]{2,12}[\\s\\/\\-][\\d]{2,4})`,
      "i"
    );
    const m = text.match(pattern);
    if (m) { const d = parseDate(m[1]!.trim()); if (d) return d; }
  }
  // Fallback: first date-like string in text
  const m = text.match(/\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b/);
  return m ? parseDate(m[1]!) : "";
}

function extractTotal(text: string): number {
  const patterns = [
    /(?:grand\s*total|total\s*net|net\s*total|ยอดรวมทั้งหมด|ยอดสุทธิ|ยอดชำระ|รวมทั้งสิ้น)[^\d\n]*([\d,]+\.?\d*)/i,
    /(?:total\s*amount|total)[^\d\n]*([\d,]+\.?\d*)/i,
    /(?:รวม)[^\d\n]*([\d,]+\.?\d*)/i,
  ];
  for (const pat of patterns) {
    const m = text.match(pat);
    if (m) { const v = Number(stripCommas(m[1]!)); if (v > 0) return v; }
  }
  return 0;
}

// ── Text extraction with Y-position grouping ───────────────────────────────

type TextItem = { text: string; x: number; y: number; width: number };

/**
 * Reconstruct logical text lines from pdfjs text items using Y-position grouping.
 * Items within ±2pt of the same Y are considered on the same visual row.
 * This produces far better results than simple space-joining for table PDFs.
 */
function reconstructLines(items: TextItem[]): string[] {
  if (items.length === 0) return [];

  const Y_TOLERANCE = 3; // pt
  const rows: { y: number; items: TextItem[] }[] = [];

  for (const item of items) {
    if (!item.text.trim()) continue;
    const existing = rows.find((r) => Math.abs(r.y - item.y) <= Y_TOLERANCE);
    if (existing) {
      existing.items.push(item);
    } else {
      rows.push({ y: item.y, items: [item] });
    }
  }

  // Sort rows top-to-bottom (PDF y=0 is bottom of page, larger y = higher up)
  rows.sort((a, b) => b.y - a.y);

  return rows.map((row) => {
    // Sort left-to-right within row, then join with space when gap > typical char width
    row.items.sort((a, b) => a.x - b.x);
    let line = "";
    let prevRight = -Infinity;
    for (const it of row.items) {
      const gap = it.x - prevRight;
      // Large gap between items → add extra space (column separator)
      line += (line && gap > 5 ? "  " : line ? "" : "") + it.text;
      prevRight = it.x + it.width;
    }
    return line.trim();
  }).filter((l) => l.length > 0);
}

// ── Line item parser ───────────────────────────────────────────────────────

function parseLineItems(textLines: string[], defaultCurrency: string): ParsedLine[] {
  const results: ParsedLine[] = [];
  let lineNo = 1;

  const units = new Set([
    "ea", "pcs", "pc", "m", "lot", "set", "unit", "units", "kg", "l", "roll",
    "sheet", "pair", "box", "bag", "reel", "meter", "meters", "ft", "inch",
    "ชิ้น", "อัน", "ชุด", "กล่อง", "ม้วน",
  ]);

  // Row patterns in order of specificity (most specific first)

  // MISUMI-style: line_no  CODE  qty  unit  unit_price  amount  (description on next line)
  const misumiPat = /^\s*(\d+)\s{2,}([A-Z0-9\-]{5,40})\s{2,}(\d[\d,]*)\s{1,6}(\w{1,10})\s{2,}([\d,]+\.?\d*)\s{2,}([\d,]+\.?\d*)\s*$/;

  // Full: line_no  code  description  qty  unit  unit_price  amount
  const fullPat = /^\s*(\d{1,4})\s{2,}([A-Z0-9\-\/\.]{2,40})\s{2,}(.{3,80}?)\s{2,}([\d,]+\.?\d*)\s{1,6}([A-Za-zชิ้นอันชุดEA\w\/]{1,15})\s{2,}([\d,]+\.?\d*)\s{2,}([\d,]+\.?\d*)\s*$/i;

  // Simple Thai: line_no  description  qty  unit_price  amount
  const simplePat = /^\s*(\d{1,3})\s{2,}(.{5,80}?)\s{2,}(\d[\d,]*)\s{2,}([\d,]+\.?\d*)\s{2,}([\d,]+\.?\d*)\s*$/;

  // Minimal: line_no  description  unit_price  amount (2 numbers at end)
  const minPat = /^\s*(\d{1,4})\s+(.{3,80?}?)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)\s*$/;

  const headerPat = /(?:item|description|qty|unit\s*price|amount|total|vat|subtotal|quotation|date|customer|supplier|payment|valid|no\.|ลำดับ|รายการ|จำนวน|ราคา|หน่วย)/i;

  for (let i = 0; i < textLines.length; i++) {
    const raw = textLines[i]!;
    // Skip header/total rows that don't start with a digit
    if (headerPat.test(raw) && !/^\s*\d/.test(raw)) continue;
    if (/(?:sub\s*total|grand\s*total|รวมก่อน|ภาษี|vat|discount)/i.test(raw)) continue;

    // MISUMI
    const mm = raw.match(misumiPat);
    if (mm) {
      const qty = Number(stripCommas(mm[3]!));
      const unitPrice = Number(stripCommas(mm[5]!));
      const desc = textLines[i + 1]?.trim() ?? "";
      results.push({ lineNo: lineNo++, itemCode: mm[2]!, description: desc || mm[2]!, brand: "", model: mm[2]!, qty, unit: mm[4]!, unitPrice, currency: defaultCurrency, remark: "" });
      i++;
      continue;
    }

    // Full code+desc+qty+unit+price+amount
    const fm = raw.match(fullPat);
    if (fm) {
      const qty = Number(stripCommas(fm[4]!));
      const unit = fm[5]!.toLowerCase().replace(/s$/, "");
      const unitPrice = Number(stripCommas(fm[6]!));
      if (qty > 0 && unitPrice >= 0 && units.has(unit)) {
        results.push({ lineNo: lineNo++, itemCode: fm[2]!, description: fm[3]!.trim(), brand: "", model: fm[2]!, qty, unit: fm[5]!, unitPrice, currency: defaultCurrency, remark: "" });
        continue;
      }
    }

    // Simple Thai (qty + price + amount as last 3 numbers)
    const sp = raw.match(simplePat);
    if (sp) {
      const qty = Number(stripCommas(sp[3]!));
      const price = Number(stripCommas(sp[4]!));
      const amount = Number(stripCommas(sp[5]!));
      if (qty > 0 && price > 0 && Math.abs(qty * price - amount) < amount * 0.02 + 1) {
        results.push({ lineNo: lineNo++, itemCode: "", description: sp[2]!.trim(), brand: "", model: "", qty, unit: "EA", unitPrice: price, currency: defaultCurrency, remark: "" });
        continue;
      }
    }

    // Minimal fallback: 2 numbers at end → unit_price + amount
    const mp = raw.match(minPat);
    if (mp) {
      const price = Number(stripCommas(mp[3]!));
      const amount = Number(stripCommas(mp[4]!));
      const inferredQty = price > 0 && amount >= price ? Math.round((amount / price) * 100) / 100 : 1;
      const desc = mp[2]!.trim();
      if (desc.length >= 3 && (price > 0 || amount > 0)) {
        results.push({ lineNo: lineNo++, itemCode: "", description: desc, brand: "", model: "", qty: inferredQty, unit: "EA", unitPrice: price, currency: defaultCurrency, remark: "" });
      }
    }
  }

  return results;
}

// ── Main export ────────────────────────────────────────────────────────────

export async function parsePdfQuotation(file: File): Promise<ParsedQuotation> {
  // Guard: pdfjs requires a browser environment (has Worker, window, etc.)
  if (typeof window === "undefined") {
    throw new Error("parsePdfQuotation must be called in a browser environment.");
  }

  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  // Lazy import: keeps pdfjs out of the SSR module graph entirely
  const [{ getDocument, GlobalWorkerOptions }, { default: workerUrl }] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url") as Promise<{ default: string }>,
  ]);
  GlobalWorkerOptions.workerSrc = workerUrl;

  const pdf = await getDocument({ data: bytes.slice() }).promise;

  // Collect positioned text items across all pages
  const allItems: TextItem[] = [];
  let rawText = "";

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1 });

    for (const it of content.items) {
      if (!("str" in it) || !it.str) continue;
      const transform = (it as { str: string; transform: number[]; width: number }).transform;
      allItems.push({
        text: it.str,
        x: transform[4] ?? 0,
        // Flip Y so 0 = top of page (PDF origin is bottom-left)
        y: viewport.height - (transform[5] ?? 0),
        width: (it as { width: number }).width ?? 0,
      });
      rawText += it.str + " ";
    }
    rawText += "\n";
  }

  const requiresOcr = rawText.trim().length < 80;
  const textLines = requiresOcr ? [] : reconstructLines(allItems);
  const rawLines = rawText.split(/[\n\r]+/);

  const currency = detectCurrency(rawText);
  const supplierName = extractSupplierName(rawLines);
  const supplierTaxId = extractTaxId(rawText);
  const quotationNumber = extractQuotationNumber(rawText);
  const receivedDate = extractDate(rawText, [
    "วันที่", "date", "DATE", "Quotation Date", "Date:", "issued", "ออกเมื่อ",
  ]);
  const validUntil = extractDate(rawText, [
    "valid until", "valid to", "Valid Until", "หมดอายุ", "expiry", "expires",
    "valid", "ใช้ได้ถึง",
  ]);
  const totalAmount = extractTotal(rawText);
  const lines = requiresOcr ? [] : parseLineItems(textLines, currency);

  const confidence: Record<string, "high" | "low" | "none"> = {
    supplierName: supplierName.length > 5 ? "high" : supplierName ? "low" : "none",
    supplierTaxId: supplierTaxId.length === 13 ? "high" : supplierTaxId ? "low" : "none",
    quotationNumber: quotationNumber.length >= 5 ? "high" : quotationNumber ? "low" : "none",
    receivedDate: receivedDate ? "high" : "none",
    validUntil: validUntil ? "high" : "none",
    totalAmount: totalAmount > 0 ? "high" : "none",
    lines: lines.length > 0 ? "high" : lines.length === 0 && !requiresOcr ? "low" : "none",
  };

  return {
    supplierName, supplierTaxId, quotationNumber, receivedDate, validUntil,
    currency, totalAmount, lines, rawText, requiresOcr, confidence,
  };
}
