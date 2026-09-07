import { createHash } from "node:crypto";
import { unzipSync, strFromU8 } from "fflate";
import { XMLParser } from "fast-xml-parser";
import { ApiError } from "./errors.js";

export type HistoricalLine = {
  key: string; sheet: string; row: number; revision: string; issuedBy: string; issuedDate: string | null;
  partNumber: string; description: string; quantity: number; unit: string; brand: string; supplier: string;
  quotation: string; leadTime: string; unitPrice: number; totalPrice: number; actualCost: number | null;
  actualCostText: string; currency: string; poNumber: string; poStatus: string;
  status: "Approved" | "Pending" | "Cancelled" | "Unknown"; prIssued: boolean; remark: string;
};
export type HistoricalWorkbook = {
  sourceName: string; sourceHash: string; projectNumber: string; projectName: string; customer: string;
  documentReference: string; referenceFromFilename: boolean; estimate: number | null;
  lines: HistoricalLine[]; warnings: string[];
  totals: { approved: number; pending: number; cancelled: number; unknown: number; active: number; all: number };
};
type XNode = Record<string, unknown>;
type Cell = { value: string; formula: boolean; error: boolean; strike: boolean };
const list = (value: unknown): XNode[] => (Array.isArray(value) ? value : value ? [value] : []) as XNode[];
const node = (value: unknown): XNode => value && typeof value === "object" ? value as XNode : {};
const string = (value: unknown): string => value == null ? "" : typeof value === "object" ? string(node(value)["#text"]) : String(value);
const richText = (value: unknown): string => {
  const n = node(value);
  return n.r ? list(n.r).map(r => string(r.t)).join("") : string(n.t);
};
const truth = (value: unknown) => value != null && !["0", "false"].includes(string(node(value)["@_val"] || "1"));
const fail = (message: string): never => { throw new ApiError(400, "historical_pr_invalid", message); };
const round = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
export function historicalTotals(lines: HistoricalLine[]): HistoricalWorkbook["totals"] {
  const sum = (status: HistoricalLine["status"]) => round(lines.filter(l => l.status === status).reduce((s, l) => s + (l.actualCost ?? l.totalPrice), 0));
  // Cancelled PO value remains in history, never as an active commitment.
  const approved = sum("Approved"), pending = sum("Pending"), unknown = sum("Unknown");
  const cancelled = round(lines.filter(l => l.status === "Cancelled").reduce((s, l) => s + l.totalPrice, 0));
  return { approved, pending, unknown, cancelled, active: round(approved + pending), all: round(lines.reduce((s, l) => s + l.totalPrice, 0)) };
}

/** Read workbook data only. Strikethrough means PR issued, not cancelled demand. */
export function parseHistoricalPr(bytes: Uint8Array, sourceName: string): HistoricalWorkbook {
  if (!/\.xlsx$/i.test(sourceName) || bytes.length > 8 * 1024 * 1024 || bytes.length < 4) fail("รองรับไฟล์ .xlsx ขนาดไม่เกิน 8 MB");
  let archive: Record<string, Uint8Array>;
  try {
    let expanded = 0, entries = 0;
    archive = unzipSync(bytes, { filter: entry => {
      expanded += entry.originalSize; entries++;
      if (expanded > 32 * 1024 * 1024 || entries > 1000) fail("ข้อมูลภายใน Excel มีขนาดใหญ่เกินกำหนด");
      return /^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|styles\.xml|worksheets\/[^/]+\.xml)$/.test(entry.name);
    } });
  } catch (error) { if (error instanceof ApiError) throw error; fail("อ่านไฟล์ Excel ไม่ได้ กรุณาตรวจไฟล์แล้วลองใหม่"); }
  const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: false, parseAttributeValue: false, trimValues: false });
  const xml = (path: string): XNode => {
    if (!archive[path]) return {};
    const raw = strFromU8(archive[path]);
    if (/<!DOCTYPE|<!ENTITY/i.test(raw)) fail("ไฟล์ XML มีโครงสร้างที่ไม่รองรับ");
    try { return parser.parse(raw) as XNode; } catch { return fail("โครงสร้าง XML ใน Excel ไม่สมบูรณ์"); }
  };
  const workbook = node(xml("xl/workbook.xml").workbook);
  const epoch = ["1", "true"].includes(string(node(workbook.workbookPr)["@_date1904"])) ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  const shared = list(node(xml("xl/sharedStrings.xml").sst).si).map(richText);
  const styles = node(xml("xl/styles.xml").styleSheet);
  const fonts = list(node(styles.fonts).font).map(f => truth(f.strike));
  const strikes = list(node(styles.cellXfs).xf).map(f => fonts[Number(f["@_fontId"])] ?? false);
  const rels = list(node(xml("xl/_rels/workbook.xml.rels").Relationships).Relationship);
  const result: HistoricalWorkbook = { sourceName, sourceHash: createHash("sha256").update(bytes).digest("hex"),
    projectNumber: "", projectName: "", customer: "", documentReference: sourceName.replace(/\.xlsx$/i, ""), referenceFromFilename: true,
    estimate: null, lines: [], warnings: [], totals: historicalTotals([]) };
  for (const s of list(node(workbook.sheets).sheet)) {
    const sheet = string(s["@_name"]);
    if (["hidden", "veryHidden"].includes(string(s["@_state"]))) continue;
    const rel = rels.find(r => r["@_Id"] === s["@_r:id"]);
    const target = string(rel?.["@_Target"]).replace(/^\//, "");
    const path = target.startsWith("xl/") ? target : `xl/${target}`;
    const cells: Record<string, Cell> = {};
    for (const row of list(node(node(xml(path).worksheet).sheetData).row)) {
      for (const c of list(row.c)) {
        const type = string(c["@_t"]), raw = string(c.v);
        cells[string(c["@_r"])] = { value: type === "s" ? shared[Number(raw)] ?? "" : type === "inlineStr" ? richText(c.is) : raw,
          formula: c.f !== undefined, error: type === "e", strike: strikes[Number(c["@_s"] ?? 0)] ?? false };
      }
    }
    const text = (ref: string) => cells[ref]?.value.trim() ?? "";
    if (text("E8") !== "Model/Part Number" || text("V8") !== "PO Number" || text("C2") !== "Project Number") continue;
    const number = (ref: string, required = false): number | null => {
      const c = cells[ref], v = text(ref);
      if (c?.error || (c?.formula && !v)) fail(`${sheet}!${ref}: กรุณาคำนวณสูตรและบันทึกใน Excel ใหม่`);
      if (!v || v === "-") { if (required) fail(`${sheet}!${ref}: ไม่มีจำนวนหรือราคา`); return null; }
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0 || n > 1e12) fail(`${sheet}!${ref}: ตัวเลขไม่ถูกต้อง`);
      return n;
    };
    if (!text("F2")) fail(`${sheet}: ไม่พบเลข Project`);
    if (text("F2").length > 100) fail(`${sheet}!F2: เลข Project ยาวเกิน 100 ตัวอักษร`);
    if (result.projectNumber && result.projectNumber.toLowerCase() !== text("F2").toLowerCase()) fail("ไฟล์มีหลาย Project กรุณาแยกไฟล์ต่อ Project");
    result.projectNumber = text("F2"); result.projectName = text("F3"); result.customer = text("F4");
    if (text("H5") && text("H5") !== "-") { result.documentReference = text("H5"); result.referenceFromFilename = false; }
    const estimate = number("T3"); if (estimate && estimate > 0) result.estimate = (result.estimate ?? 0) + estimate;
    const revisions = new Map<string, { issuedBy: string; issuedDate: string | null }>();
    for (let r = 3; r <= 7; r++) {
      const rawDate = text(`N${r}`); let issuedDate: string | null = null;
      if (rawDate && rawDate !== "-") {
        const serial = Number(rawDate);
        if (Number.isFinite(serial) && serial > 0 && serial < 100000) issuedDate = new Date(epoch + Math.floor(serial) * 86400000).toISOString().slice(0, 10);
        else if (/^\d{4}-\d{2}-\d{2}/.test(rawDate) && !Number.isNaN(Date.parse(rawDate))) issuedDate = new Date(rawDate).toISOString().slice(0, 10);
        else result.warnings.push(`${sheet}!N${r}: อ่านวันที่ไม่ได้ (${rawDate})`);
      }
      if (text(`I${r}`)) revisions.set(text(`I${r}`), { issuedBy: text(`M${r}`), issuedDate });
    }
    const rowNumbers = [...new Set(Object.keys(cells).map(c => Number(c.replace(/^[A-Z]+/, ""))))].filter(r => r >= 9).sort((a, b) => a - b);
    for (const r of rowNumbers) {
      const partNumber = text(`E${r}`), description = [text(`F${r}`), text(`G${r}`)].filter(Boolean).join("\n");
      if (!partNumber && !description) continue;
      const quantity = number(`L${r}`, true)!, unitPrice = number(`R${r}`, true)!, totalPrice = number(`S${r}`, true)!;
      if (quantity <= 0 || Math.abs(round(quantity * unitPrice) - totalPrice) > .011) fail(`${sheet}!S${r}: จำนวน × ราคาไม่ตรงยอด หรือจำนวนเป็นศูนย์`);
      const poStatus = text(`W${r}`), lowered = poStatus.toLowerCase();
      const status = lowered === "already approved" ? "Approved" : ["wait approved", "waiting approval"].includes(lowered) ? "Pending" : ["cancelled", "canceled"].includes(lowered) ? "Cancelled" : "Unknown";
      const revision = text(`B${r}`), issued = revisions.get(revision) ?? { issuedBy: "", issuedDate: null };
      const currency = text(`T${r}`).toUpperCase();
      if (currency !== "THB") fail(`${sheet}!T${r}: รุ่นนี้รองรับสกุลเงิน THB กรุณาระบุสกุลเงินให้ครบ`);
      const actualCost = number(`U${r}`);
      if (status === "Unknown") result.warnings.push(`${sheet}!W${r}: สถานะ PO ยังไม่ทราบ (${poStatus || "ว่าง"})`);
      if (actualCost === null && status !== "Cancelled") result.warnings.push(`${sheet}!U${r}: ยังไม่ระบุ Actual cost ใช้ Total price เป็นยอดอ้างอิง`);
      if (!text(`V${r}`)) result.warnings.push(`${sheet}!V${r}: ยังไม่มีเลข PO`);
      if (!issued.issuedDate) result.warnings.push(`${sheet} แถว ${r}: ไม่มีวันที่ของ revision`);
      result.lines.push({ key: `${sheet}!${r}`, sheet, row: r, revision, ...issued, partNumber, description,
        quantity, unit: text(`M${r}`), brand: text(`N${r}`), supplier: text(`O${r}`), quotation: text(`Q${r}`), leadTime: text(`P${r}`),
        unitPrice, totalPrice, actualCost, actualCostText: text(`U${r}`), currency, poNumber: text(`V${r}`), poStatus, status,
        prIssued: cells[`E${r}`]?.strike === true || cells[`F${r}`]?.strike === true || Boolean(text(`V${r}`)), remark: text(`X${r}`) });
    }
  }
  if (!result.lines.length) fail("ไม่พบรายการในฟอร์ม PR ที่รองรับ (หัวตาราง Model/Part Number และ PO Number แถว 8)");
  if (result.lines.length > 1000) fail("รองรับไม่เกิน 1,000 รายการต่อไฟล์");
  if (result.documentReference.length > 200) fail("ชื่ออ้างอิงเอกสารยาวเกิน 200 ตัวอักษร");
  if (result.referenceFromFilename) result.warnings.push("Document Ref. ว่าง ใช้ชื่อไฟล์เป็นอ้างอิง สามารถแก้ใน Preview ได้");
  if (result.estimate === null) result.warnings.push("Estimate ว่างหรือเป็น 0 ยังสรุปเกินงบจากไฟล์นี้ไม่ได้");
  result.totals = historicalTotals(result.lines);
  return result;
}
