import { strFromU8, unzipSync } from "fflate";
import { XMLParser } from "fast-xml-parser";
import { ApiError } from "./errors.js";

export type EstimateWorkbookCell = { value: string | number; formula?: string; error?: boolean; missingCache?: boolean };
export type EstimateWorkbookSheet = { name: string; cells: Record<string, EstimateWorkbookCell> };
export type EstimateWorkbookLine = {
  kind: "cost" | "manhour" | "reference"; categoryCode: string; module: string; itemCode: string; description: string;
  quantity: number; unit: string; unitCost: number; brand: string; model: string; supplierName: string; source: string;
  remark: string; department?: string; costType?: "Engineering" | "Installation";
};
export type EstimateWorkbookPreview = {
  sourceRevision: string; sourceDate: string; sourceTotal: number; total: number;
  lines: EstimateWorkbookLine[]; errors: string[];
};

type XNode = Record<string, unknown>;
const list = (value: unknown): XNode[] => (Array.isArray(value) ? value : value ? [value] : []) as XNode[];
const node = (value: unknown): XNode => value && typeof value === "object" ? value as XNode : {};
const string = (value: unknown): string => value == null ? "" : typeof value === "object" ? string(node(value)["#text"]) : String(value);
const richText = (value: unknown): string => { const valueNode = node(value); return valueNode.r ? list(valueNode.r).map((part) => string(part.t)).join("") : string(valueNode.t); };
const invalid = (message: string): never => { throw new ApiError(400, "invalid_original_file", message); };

/** Read cached values only. The same workbook parts and expansion limits are used by the browser preview. */
export function readEstimateWorkbookSheets(bytes: Uint8Array): EstimateWorkbookSheet[] {
  if (bytes.length < 4 || bytes.length > 20 * 1024 * 1024) invalid("The original workbook must be a valid XLSX file no larger than 20 MB.");
  let archive: Record<string, Uint8Array> = {};
  try {
    let expanded = 0, entries = 0;
    archive = unzipSync(bytes, { filter: (entry) => {
      expanded += entry.originalSize; entries++;
      if (expanded > 80 * 1024 * 1024 || entries > 2000) invalid("The expanded workbook is too large.");
      return /^(xl\/workbook\.xml|xl\/_rels\/workbook\.xml\.rels|xl\/sharedStrings\.xml|xl\/worksheets\/[^/]+\.xml)$/.test(entry.name);
    } });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    invalid("The original file is not a readable XLSX workbook.");
  }
  if (!archive["xl/workbook.xml"] || !archive["xl/_rels/workbook.xml.rels"]) invalid("The XLSX workbook structure is incomplete.");
  const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: false, parseAttributeValue: false, trimValues: false });
  const xml = (path: string): XNode => {
    const part = archive[path]; if (!part) return {};
    const raw = strFromU8(part);
    if (/<!DOCTYPE|<!ENTITY/i.test(raw)) invalid("The workbook contains unsupported XML declarations.");
    try { return parser.parse(raw) as XNode; } catch { return invalid("The workbook contains malformed XML."); }
  };
  const workbook = node(xml("xl/workbook.xml").workbook);
  const shared = list(node(xml("xl/sharedStrings.xml").sst).si).map(richText);
  const relationships = list(node(xml("xl/_rels/workbook.xml.rels").Relationships).Relationship);
  const sheets: EstimateWorkbookSheet[] = [];
  for (const sheetNode of list(node(workbook.sheets).sheet)) {
    const relationship = relationships.find((entry) => entry["@_Id"] === sheetNode["@_r:id"]);
    const target = string(relationship?.["@_Target"]).replace(/^\//, "");
    if (!target || target.includes("..") || /^[a-z]+:/i.test(target)) invalid("The workbook contains an invalid worksheet reference.");
    const path = target.startsWith("xl/") ? target : `xl/${target}`;
    if (!/^xl\/worksheets\/[^/]+\.xml$/.test(path) || !archive[path]) invalid("A worksheet referenced by the workbook is missing.");
    const cells: Record<string, EstimateWorkbookCell> = {};
    for (const row of list(node(node(xml(path).worksheet).sheetData).row)) {
      for (const cell of list(row.c)) {
        const reference = string(cell["@_r"]); if (!/^[A-Z]{1,3}[1-9]\d{0,6}$/.test(reference)) continue;
        const type = string(cell["@_t"]), raw = string(cell.v), formula = cell.f === undefined ? undefined : string(cell.f);
        const value = type === "s" ? shared[Number(raw)] ?? "" : type === "inlineStr" ? richText(cell.is)
          : raw !== "" && type !== "e" && Number.isFinite(Number(raw)) ? Number(raw) : raw;
        cells[reference] = { value, ...(formula === undefined ? {} : { formula }), ...(type === "e" ? { error: true } : {}),
          ...(formula !== undefined && raw === "" ? { missingCache: true } : {}) };
      }
    }
    sheets.push({ name: string(sheetNode["@_name"]), cells });
  }
  if (!sheets.length) invalid("The workbook contains no readable worksheets.");
  return sheets;
}

const text = (sheet: EstimateWorkbookSheet, reference: string) => String(sheet.cells[reference]?.value ?? "").trim();
const numeric = (sheet: EstimateWorkbookSheet, reference: string) => {
  const cell = sheet.cells[reference];
  if (!cell || cell.error || cell.missingCache || String(cell.value).trim() === "") return null;
  const value = Number(cell.value); return Number.isFinite(value) ? value : null;
};
const formulaReference = (formula?: string) => formula?.replace(/^=/, "").match(/^'?([^'!]+)'?!\$?([A-Z]+)\$?(\d+)$/i);
const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const validName = (value: string) => Boolean(value && value !== "-" && value !== "0");

/** Mirrors the company Estimate Cost preview parser so uploaded bytes remain the authority for imported rows and totals. */
export function parseEstimateWorkbook(bytes: Uint8Array, filename: string): EstimateWorkbookPreview {
  const sheets = readEstimateWorkbookSheets(bytes);
  const summary = sheets.find((sheet) => /summary[ _]*cost/i.test(sheet.name)) ?? invalid("The workbook does not contain the company Summary cost sheet.");
  const result: EstimateWorkbookPreview = { sourceRevision: filename.match(/[_ -](R\d+)\.[^.]+$/i)?.[1] ?? "", sourceDate: "", sourceTotal: 0, total: 0, lines: [], errors: [] };
  const date = numeric(summary, "L3");
  if (date && date > 1 && date < 100000) result.sourceDate = new Date(Date.UTC(1899, 11, 30) + date * 86_400_000).toISOString().slice(0, 10);
  const totalCell = Object.entries(summary.cells).find(([reference, cell]) => /^L\d+$/.test(reference) && /^=?SUM\(\$?L9:\$?L\d+\)$/i.test(cell.formula ?? ""))
    ?? invalid("The Summary cost sheet has no cached SUM(L9:L...) total.");
  const end = Number(totalCell[0].slice(1));
  if (!Number.isSafeInteger(end) || end < 9 || end > 10_009) invalid("The Summary cost row range is too large.");
  result.sourceTotal = numeric(summary, totalCell[0]) ?? Number.NaN;
  if (!Number.isFinite(result.sourceTotal)) result.errors.push("The workbook total has no cached value.");
  let group = "Cost", visitedRows = 0;
  const visitRow = () => { visitedRows++; if (visitedRows > 20_000) invalid("The workbook contains too many rows to validate safely."); };
  const add = (sheet: EstimateWorkbookSheet, row: number, multiplier: number, summaryRow: number, kind: EstimateWorkbookLine["kind"], categoryCode: string, module: string, fixed = false) => {
    const quantity = fixed ? 1 : numeric(sheet, `K${row}`), unitCost = fixed ? numeric(sheet, `L${row}`) : numeric(sheet, `J${row}`), amount = numeric(sheet, `L${row}`);
    if (kind !== "reference" && (quantity === null || unitCost === null || amount === null || quantity <= 0 || unitCost < 0 || Math.abs(quantity * unitCost - amount) > .011)) { result.errors.push(`${sheet.name}!L${row}: quantity and price do not match the cached total.`); return; }
    const description = text(sheet, `E${row}`) || text(sheet, `D${row}`);
    const model = validName(text(sheet, `D${row}`)) && sheet !== summary ? text(sheet, `D${row}`) : "";
    const supplierName = text(sheet, `F${row}`), unit = text(sheet, `M${row}`) || (kind === "manhour" ? "Day" : "Lot");
    result.lines.push({ kind, categoryCode, module, itemCode: model || `XL-${sheet.name.slice(0, 3)}-${row}`, description,
      quantity: kind === "reference" ? multiplier : (quantity ?? 1) * multiplier, unit, unitCost: kind === "reference" ? 0 : unitCost ?? 0,
      brand: validName(text(sheet, `G${row}`)) ? text(sheet, `G${row}`) : "", model, supplierName: validName(supplierName) ? supplierName : "",
      source: `${sheet.name}!${row}`, remark: [`Summary row ${summaryRow}`, text(sheet, `N${row}`), fixed ? "Fixed amount retained from source total" : "", !text(sheet, `M${row}`) ? "Unit not stated; Lot retains quoted quantity" : "", multiplier !== 1 && kind !== "reference" ? `Detail quantity multiplied by ${multiplier} per Summary` : ""].filter(Boolean).join("; "),
      ...(kind === "manhour" ? { department: /mechan/i.test(group) ? "Mechanical" : /software|program/i.test(group) ? "Software" : "Electrical", costType: /install|test|commis|wiring/i.test(description) ? "Installation" as const : "Engineering" as const } : {}) });
  };
  for (let row = 9; row < end; row++) {
    visitRow();
    if (validName(text(summary, `D${row}`))) group = text(summary, `D${row}`).replace(/\s+/g, " ");
    const description = text(summary, `E${row}`), quantity = numeric(summary, `K${row}`), amount = numeric(summary, `L${row}`);
    if (!validName(description)) { if (amount) result.errors.push(`Summary row ${row} has a total without a description.`); continue; }
    if (!summary.cells[`J${row}`] && !summary.cells[`K${row}`] && !summary.cells[`L${row}`]) continue;
    if (quantity === 0) continue;
    if (amount === null) { result.errors.push(`Summary row ${row} has no cached total.`); continue; }
    if (amount === 0) {
      const reference = formulaReference(summary.cells[`E${row}`]?.formula), detail = reference && sheets.find((sheet) => sheet.name === reference[1]);
      const start = reference ? Number(reference[3]) : 0;
      const supplied = detail && Array.from({ length: 24 }, (_, index) => start + index).find((detailRow) => /customer\s*provid|customer\s*suppl|ลูกค้า.*จัดหา/i.test(text(detail, `N${detailRow}`)) && validName(text(detail, `E${detailRow}`)));
      if (detail && supplied && quantity && quantity > 0) add(detail, supplied, quantity, row, "reference", "01", "Customer supplied");
      continue;
    }
    if (!quantity || quantity < 0) { result.errors.push(`Summary row ${row} has an invalid quantity.`); continue; }
    const labor = /lab[oa]?u?re?|software development/i.test(group) && !/transport|packing|safety|sefety/i.test(description);
    const outsourced = labor && validName(text(summary, `F${row}`)) && !/TOMAS/i.test(text(summary, `F${row}`));
    const categoryCode = outsourced ? "07" : labor ? "06" : /transport|packing/i.test(description) ? "08" : /mechan/i.test(group) ? "04" : /elect/i.test(group) ? "03" : /safety|sefety/i.test(description) ? "10" : "01";
    const reference = formulaReference(summary.cells[`J${row}`]?.formula), detail = reference && sheets.find((sheet) => sheet.name === reference[1]);
    const detailTotal = detail && reference ? detail.cells[`${reference[2]}${reference[3]}`] : undefined;
    const range = detailTotal?.formula?.replace(/^=/, "").match(/^\(*SUM\(\$?L(\d+):\$?L(\d+)\)\)*$/i), before = result.lines.length;
    if (!labor && detail && range) {
      const rangeStart = Number(range[1]), rangeEnd = Number(range[2]);
      if (!Number.isSafeInteger(rangeStart) || !Number.isSafeInteger(rangeEnd) || rangeStart < 1 || rangeEnd < rangeStart || rangeEnd - rangeStart > 10_000) invalid("A worksheet row range is too large.");
      for (let detailRow = rangeStart; detailRow <= rangeEnd; detailRow++) {
        visitRow();
        const total = numeric(detail, `L${detailRow}`);
        if (detail.cells[`L${detailRow}`]?.error || detail.cells[`L${detailRow}`]?.missingCache) { result.errors.push(`${detail.name}!L${detailRow} has no cached value.`); continue; }
        if (total && total > 0) add(detail, detailRow, quantity, row, "cost", categoryCode, description, !numeric(detail, `K${detailRow}`) || !numeric(detail, `J${detailRow}`));
        else if (total && total < 0) result.errors.push(`${detail.name}!L${detailRow} has a negative cost.`);
      }
    } else add(summary, row, 1, row, labor && !outsourced ? "manhour" : "cost", categoryCode, labor ? group : description);
    const subtotal = result.lines.slice(before).reduce((total, line) => total + line.quantity * line.unitCost, 0);
    if (Math.abs(subtotal - amount) > .011) result.errors.push(`Summary row ${row} detail does not match its cached total.`);
  }
  result.total = money(result.lines.reduce((total, line) => total + line.quantity * line.unitCost, 0));
  if (Math.abs(result.total - result.sourceTotal) > .011) result.errors.push("Imported rows do not match the workbook total.");
  if (result.lines.length > 1000) result.errors.push("The workbook contains more than 1,000 import rows.");
  return result;
}
