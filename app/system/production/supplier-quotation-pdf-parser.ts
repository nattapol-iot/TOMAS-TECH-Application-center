/**
 * Client-side supplier quotation PDF parser.
 * Uses pdfjs-dist (already a project dependency) to extract text, then applies
 * pattern-based heuristics derived from analysing real TOMAS TECH supplier PDFs
 * (MISUMI, Keyence, O THREE PRO, EMMA Electric, Thai System Research, etc.).
 *
 * The parser is intentionally lenient: it returns partial results and a
 * confidence map so the UI can show which fields need manual correction.
 */

import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

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
  "ม.ค":1, "ก.พ":2, "มี.ค":3, "เม.ย":4, "พ.ค":5, "มิ.ย":6, "ก.ค":7, "ส.ค":8, "ก.ย":9, "ต.ค":10, "พ.ย":11, "ธ.ค":12,
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
  // D Mon YYYY or DD-Mon-YYYY
  m = raw.match(/^(\d{1,2})[\s\-]([A-Za-zก-๙\.]+)[\s\-](\d{2,4})$/);
  if (m) {
    const d = m[1]!.padStart(2, "0");
    const mo = MONTH_MAP[m[2]!.toLowerCase().replace(".", "")] ?? 1;
    const y = beToCe(Number(m[3]!.length === 2 ? `20${m[3]}` : m[3]));
    return `${y}-${String(mo).padStart(2, "0")}-${d}`;
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
  const labeled = text.match(/(?:quotation\s*(?:no\.?|number:?)|QT(?:NO)?|BT NO|SQ NO)[:\s]+([A-Z0-9\-\/]+)/i);
  if (labeled) return labeled[1]!.trim();
  // Common prefixes
  const prefixed = text.match(/\b(QT\d[\w\-]{4,}|SQ[\d\-]{4,}|BT\d{2}[-\d]{5,}|OTP\d{6,}|TMTS\d{2}-\d+|FA\d+[A-Z]+|QCA\d+)/);
  if (prefixed) return prefixed[1]!;
  // Fallback: any token that looks like a document number near "No."
  const generic = text.match(/(?:No\.|NO\.)\s*([A-Z0-9\-\/]{5,20})/i);
  return generic ? generic[1]!.trim() : "";
}

function extractSupplierName(lines: string[]): string {
  // The first non-empty line that looks like a company name (contains CO.,LTD / Co.,Ltd / จำกัด / COMPANY / INC)
  for (const line of lines.slice(0, 20)) {
    const t = line.trim();
    if (!t || t.length < 5) continue;
    if (/(?:co\.,?\s*ltd|จำกัด|company|corporation|inc\.|gmbh|co\.th)/i.test(t)) return t;
  }
  // Fallback: first non-empty line that's fully uppercase (many Thai supplier names are in all-caps)
  for (const line of lines.slice(0, 10)) {
    const t = line.trim();
    if (t.length >= 5 && t === t.toUpperCase() && /[A-Z]/.test(t)) return t;
  }
  return "";
}

function extractDate(text: string, keywords: string[]): string {
  for (const kw of keywords) {
    const pattern = new RegExp(`${kw}[:\\s]+([\\d]{1,2}[\\s\\/\\-][\\w\\.]+[\\s\\/\\-][\\d]{2,4})`, "i");
    const m = text.match(pattern);
    if (m) { const d = parseDate(m[1]!); if (d) return d; }
  }
  // Fallback: first date-like string
  const m = text.match(/\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b/);
  return m ? parseDate(m[1]!) : "";
}

function extractTotal(text: string): number {
  const patterns = [
    /(?:grand\s*total|total\s*net|net\s*total|ยอดรวมทั้งหมด|ยอดสุทธิ)[^\d]*([\d,]+\.?\d*)/i,
    /(?:total\s*amount|total)[^\d]*([\d,]+\.?\d*)/i,
  ];
  for (const pat of patterns) {
    const m = text.match(pat);
    if (m) { const v = Number(stripCommas(m[1]!)); if (v > 0) return v; }
  }
  return 0;
}

// ── Line item parser ───────────────────────────────────────────────────────

function parseLineItems(text: string, defaultCurrency: string): ParsedLine[] {
  const lines = text.split("\n");
  const results: ParsedLine[] = [];
  let lineNo = 1;

  // Pattern: starts with a digit, then has at least two decimal numbers at end of line
  // Captures: (number) (code or desc) ... (qty) (unit) (price) (amount) — amounts are the last two
  const rowPattern = /^\s*(\d{1,4})\s+(.{3,60?}?)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)\s*$/;
  const codeDescPattern = /^\s*(\d{1,4})\s+([A-Z0-9\-\/]{2,30})\s+(.{3,80?}?)\s+([\d,.]+)\s+([A-Za-zชิ้นEA\w\/]+)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)\s*$/i;
  // MISUMI-style: line_no  CODE  (later  description)  qty  unit  price  amount
  const misumiPattern = /^\s*(\d+)\s+([A-Z0-9\-]{5,30})\s+(\d+)\s+(\w{1,10})\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)/;

  const units = new Set(["ea", "pcs", "pc", "m", "lot", "set", "unit", "units", "kg", "l", "roll", "sheet", "pair", "ชิ้น", "อัน", "ชุด"]);

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;

    // Skip header/total rows
    if (/(?:item|description|qty|unit\s*price|amount|total|vat|subtotal|quotation|date|customer|supplier|payment|valid|no\.|ลำดับ|รายการ|จำนวน|ราคา)/i.test(raw) && !/^\s*\d/.test(raw)) continue;

    // Try MISUMI-style (code + qty + unit + price + amount on one row, description on next)
    const mm = raw.match(misumiPattern);
    if (mm) {
      const qty = Number(stripCommas(mm[3]!));
      const unitPrice = Number(stripCommas(mm[5]!));
      const desc = lines[i + 1]?.trim() ?? "";
      results.push({ lineNo: lineNo++, itemCode: mm[2]!, description: desc || mm[2]!, brand: "", model: mm[2]!, qty, unit: mm[4]!, unitPrice, currency: defaultCurrency, remark: "" });
      i++; // skip description line
      continue;
    }

    // Try full code+desc+qty+unit+price+amount on one row
    const fm = raw.match(codeDescPattern);
    if (fm) {
      const qty = Number(stripCommas(fm[4]!));
      const unit = fm[5]!.toLowerCase();
      const unitPrice = Number(stripCommas(fm[6]!));
      if (qty > 0 && unitPrice >= 0 && units.has(unit.replace(/s$/, ""))) {
        results.push({ lineNo: lineNo++, itemCode: fm[2]!, description: fm[3]!.trim(), brand: "", model: fm[2]!, qty, unit: fm[5]!, unitPrice, currency: defaultCurrency, remark: "" });
        continue;
      }
    }

    // Simple: digit + description + price + amount (last two numbers)
    const sm = raw.match(rowPattern);
    if (sm) {
      const price = Number(stripCommas(sm[3]!));
      const amount = Number(stripCommas(sm[4]!));
      // amount ≈ qty × price means the two numbers are price & total
      const inferredQty = price > 0 && amount >= price ? Math.round(amount / price) : 1;
      const desc = sm[2]!.trim();
      if (desc.length >= 3 && (price > 0 || amount > 0)) {
        results.push({ lineNo: lineNo++, itemCode: "", description: desc, brand: "", model: "", qty: inferredQty, unit: "EA", unitPrice: price, currency: defaultCurrency, remark: "" });
      }
    }
  }

  return results;
}

// ── Main export ────────────────────────────────────────────────────────────

export async function parsePdfQuotation(file: File): Promise<ParsedQuotation> {
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist");
  GlobalWorkerOptions.workerSrc = workerUrl;

  const pdf = await getDocument({ data: bytes.slice() }).promise;
  let rawText = "";
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    rawText += content.items.map((it) => ("str" in it ? it.str : "")).join(" ") + "\n";
  }

  const requiresOcr = rawText.trim().length < 80;
  const textLines = rawText.split(/[\n\r]+/);

  const currency = detectCurrency(rawText);
  const supplierName = extractSupplierName(textLines);
  const supplierTaxId = extractTaxId(rawText);
  const quotationNumber = extractQuotationNumber(rawText);
  const receivedDate = extractDate(rawText, ["date", "DATE", "Quotation Date", "วันที่", "Date:"]);
  const validUntil = extractDate(rawText, ["valid until", "valid to", "Valid Until", "หมดอายุ", "expiry"]);
  const totalAmount = extractTotal(rawText);
  const lines = requiresOcr ? [] : parseLineItems(rawText, currency);

  const confidence: Record<string, "high" | "low" | "none"> = {
    supplierName: supplierName.length > 5 ? "high" : supplierName ? "low" : "none",
    supplierTaxId: supplierTaxId.length === 13 ? "high" : supplierTaxId ? "low" : "none",
    quotationNumber: quotationNumber.length >= 5 ? "high" : quotationNumber ? "low" : "none",
    receivedDate: receivedDate ? "high" : "none",
    validUntil: validUntil ? "high" : "none",
    totalAmount: totalAmount > 0 ? "high" : "none",
    lines: lines.length > 0 ? "high" : "none",
  };

  return { supplierName, supplierTaxId, quotationNumber, receivedDate, validUntil, currency, totalAmount, lines, rawText, requiresOcr, confidence };
}
