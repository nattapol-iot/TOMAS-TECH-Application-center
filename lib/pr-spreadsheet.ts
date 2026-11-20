// The PR editor's rows and their Excel round trip: the template this app writes, and the TOMAS PR form the team already fills in.
// Pure functions; the one import is a type, so the root tests load this file directly.
import type { PrFormData } from "./pr-form";

export type PrRowKind = "Planned" | "Substitute" | "Unplanned";
export type PrBomLine = { id: number; module: string; itemCode: string; partNumber: string; description: string; brand: string; unit: string;
  remaining: number; estimatedUnitCost: number;
  /** The BOM section of the line; OUT is the estimate's Outsource category (outside labour or a service). */
  sectionCode?: string };
export type PrModuleBudget = { module: string; budget: number; requested: number };
export type PrDraftRow = { key: string; selected: boolean; lineType: PrRowKind; bomLineId: number | null; module: string; itemCode: string; partNumber: string;
  description: string; brand: string; unit: string; quantity: number; coveredQuantity: number | null; unitPrice: number; remark: string } & PrRowForm;
/**
 * What the team's PR-Form says of a line besides what is bought (migration 115). `parentKey` is the row this one is a part of: a row
 * above it that is not itself a part.
 */
export type PrRowForm = { material?: string; treatment?: string; detail?: string; quantityPerSet?: number | null; needBy?: string; attachmentUrl?: string; parentKey?: string | null };
export type PrModuleStatus = PrModuleBudget & { thisRequest: number; over: number; percent: number; level: "ok" | "manager" | "management"; lines: number };
type Cell = string | number | null | undefined;

/** The share of a module's budget the PM may approve over it; beyond this the Engineering Manager approves too (as on the server). */
export const PR_MANAGEMENT_OVERRUN_PERCENT = 10;
/** The most the Pegasus ERP takes on one PR line (ERP_MAX_QUANTITY on the server). */
export const PR_MAX_QUANTITY = 1_000_000;
export const PR_TEMPLATE_HEADER_ROW = 5;
export const PR_TEMPLATE_HEADERS = ["Buy (Y/N)", "Item code", "Description", "Part No.", "Brand", "Module", "Type", "Qty", "Unit", "Unit price", "Remark",
  "BOM line", "Estimate item", "Still to request", "Estimate unit price", "Material", "Treatment", "Detail", "Need by", "Link"];

const text = (value: Cell) => value === null || value === undefined ? "" : String(value).trim();
const same = (a: string, b: string) => a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();
const round = (value: number, places = 4) => Math.round(value * 10 ** places) / 10 ** places;
const number = (value: Cell): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const cleaned = text(value).replace(/,/g, "");
  if (!cleaned || cleaned === "-") return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
};
/** A date cell as yyyy-mm-dd: Excel's day number (counted from 1899-12-30) or text already in that form; anything else is left out. */
const dateText = (value: Cell): string => {
  if (typeof value === "number" && value > 20000 && value < 80000) return new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86_400_000).toISOString().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}/.exec(text(value))?.[0] ?? "";
};

/** What the engineer starts from: every BOM line that still needs requesting, as its own estimate item, all ticked. */
export function draftFromBom(lines: PrBomLine[]): PrDraftRow[] {
  return lines.filter((line) => line.remaining > 0).map((line) => ({ key: `bom-${line.id}`, selected: true, lineType: "Planned", bomLineId: line.id, module: line.module,
    itemCode: line.itemCode, partNumber: line.partNumber, description: line.description, brand: line.brand, unit: line.unit, quantity: line.remaining,
    coveredQuantity: null, unitPrice: line.estimatedUnitCost, remark: "" }));
}

/** A line of a saved PR, as GET /purchase-requisitions/:id returns it. */
export type PrSavedLine = { id: number; lineType: PrRowKind; bomLineId: number | null; module: string; itemCode: string; partNumber: string; description: string;
  brand: string; unit: string; quantity: number; coveredQuantity: number; unitPrice: number; remark: string | null;
  material?: string | null; treatment?: string | null; detail?: string | null; quantityPerSet?: number | null; needBy?: string | null; attachmentUrl?: string | null;
  parentLineId?: number | null };

/** A draft reopened for editing: its own lines ticked as they were saved, then the BOM lines it does not request yet, unticked. */
export function draftFromPr(saved: PrSavedLine[], lines: PrBomLine[]): PrDraftRow[] {
  const own: PrDraftRow[] = saved.map((line) => ({ key: `pr-${line.id}`, selected: true, lineType: line.lineType, bomLineId: line.bomLineId, module: line.module,
    itemCode: line.itemCode ?? "", partNumber: line.partNumber ?? "", description: line.description ?? "", brand: line.brand ?? "", unit: line.unit ?? "",
    quantity: line.quantity, coveredQuantity: line.lineType === "Substitute" ? line.coveredQuantity : null, unitPrice: line.unitPrice, remark: line.remark ?? "",
    material: line.material ?? "", treatment: line.treatment ?? "", detail: line.detail ?? "", quantityPerSet: line.quantityPerSet ?? null, needBy: line.needBy ?? "",
    attachmentUrl: line.attachmentUrl ?? "", parentKey: line.parentLineId ? `pr-${line.parentLineId}` : null }));
  const planned = new Set(saved.filter((line) => line.lineType === "Planned").map((line) => line.bomLineId));
  return [...own, ...draftFromBom(lines.filter((line) => !planned.has(line.id))).map((row) => ({ ...row, selected: false }))];
}

/** A row turned into another make or model of the same BOM line: it keeps the line and replaces everything still to request. */
export function asSubstitute(row: PrDraftRow): PrDraftRow { return { ...row, lineType: "Substitute", coveredQuantity: null }; }

/** Back to the estimate item, with the estimate's own description and price. */
export function asPlanned(row: PrDraftRow, line: PrBomLine): PrDraftRow {
  return { ...row, lineType: "Planned", itemCode: line.itemCode, partNumber: line.partNumber, description: line.description, brand: line.brand, unit: line.unit,
    quantity: Math.min(row.quantity, line.remaining) || line.remaining, coveredQuantity: null, unitPrice: line.estimatedUnitCost };
}

/** The checks the server makes, per row, so a thousand-line PR shows what to fix before it is sent. Only ticked rows are checked. */
export function draftIssues(rows: PrDraftRow[], lines: Map<number, PrBomLine>, modules: string[]): Map<string, string> {
  const issues = new Map<string, string>(); const covered = new Map<number, number>();
  for (const row of rows) {
    if (!row.selected) continue;
    if (!(row.quantity > 0)) { issues.set(row.key, "Quantity must be more than 0"); continue; }
    if (row.quantity > PR_MAX_QUANTITY) { issues.set(row.key, "The ERP takes at most 1,000,000 on one line"); continue; }
    if (!(row.unitPrice >= 0)) { issues.set(row.key, "Unit price cannot be negative"); continue; }
    if (row.lineType === "Unplanned") {
      if (!modules.some((module) => same(module, row.module))) issues.set(row.key, "Choose the module that pays for it");
      else if (!row.description && !row.partNumber) issues.set(row.key, "Describe the item");
      else if (!row.unit) issues.set(row.key, "Enter a unit");
      continue;
    }
    const line = row.bomLineId === null ? undefined : lines.get(row.bomLineId);
    if (!line) { issues.set(row.key, "This BOM line is not on the selected BOM"); continue; }
    const left = round(line.remaining - (covered.get(line.id) ?? 0));
    const takes = row.lineType === "Planned" ? row.quantity : row.coveredQuantity ?? left;
    if (takes > left + 1e-9 || takes <= 0) { issues.set(row.key, row.lineType === "Planned" ? `Only ${left} ${line.unit} is still to request` : `It can replace up to ${left} ${line.unit}`); continue; }
    if (row.lineType === "Substitute" && !row.description && !row.partNumber && !row.itemCode) { issues.set(row.key, "Describe the substitute item"); continue; }
    covered.set(line.id, (covered.get(line.id) ?? 0) + takes);
  }
  // A part needs the line it belongs to on the same request, above it; and a link is a web link.
  const ticked = rows.filter((row) => row.selected);
  ticked.forEach((row, index) => {
    if (issues.has(row.key)) return;
    if (row.attachmentUrl && !/^https?:\/\/\S+$/i.test(row.attachmentUrl.trim())) { issues.set(row.key, "A link must start with http:// or https://"); return; }
    if (!row.parentKey) return;
    const at = ticked.findIndex((item) => item.key === row.parentKey);
    if (at < 0 || at >= index || ticked[at]!.parentKey) issues.set(row.key, "The line this part belongs to is not on this request");
  });
  return issues;
}

/** Each module's budget against earlier PRs plus this one, with who must approve an overrun. */
export function moduleStatus(rows: PrDraftRow[], budgets: PrModuleBudget[]): PrModuleStatus[] {
  const byModule = new Map(budgets.map((budget) => [budget.module.toLocaleLowerCase(), { ...budget, thisRequest: 0, lines: 0 }]));
  for (const row of rows) {
    if (!row.selected) continue;
    const key = row.module.toLocaleLowerCase();
    const entry = byModule.get(key) ?? { module: row.module || "—", budget: 0, requested: 0, thisRequest: 0, lines: 0 };
    entry.thisRequest += row.quantity * row.unitPrice; entry.lines += 1; byModule.set(key, entry);
  }
  return [...byModule.values()].map((entry) => {
    const over = round(entry.requested + entry.thisRequest - entry.budget, 2);
    const percent = over > 0 ? (entry.budget > 0 ? over / entry.budget * 100 : Number.POSITIVE_INFINITY) : 0;
    const level = over <= 0 || entry.thisRequest <= 0 ? "ok" as const : percent > PR_MANAGEMENT_OVERRUN_PERCENT ? "management" as const : "manager" as const;
    return { ...entry, over: Math.max(0, over), percent, level };
  }).sort((a, b) => a.module.localeCompare(b.module));
}

/**
 * The request body's lines, ticked rows only, in screen order (the server's "Line n" counts these). A part names the line it belongs to by
 * its place among these lines.
 */
export function payloadLines(rows: PrDraftRow[]) {
  const ticked = rows.filter((row) => row.selected), place = new Map(ticked.map((row, index) => [row.key, index]));
  return ticked.map((row, index) => {
    const parent = row.parentKey ? place.get(row.parentKey) : undefined;
    const form = { material: row.material?.trim() || undefined, treatment: row.treatment?.trim() || undefined, detail: row.detail?.trim() || undefined,
      quantityPerSet: row.quantityPerSet && row.quantityPerSet > 0 ? row.quantityPerSet : undefined, needBy: row.needBy || undefined, attachmentUrl: row.attachmentUrl?.trim() || undefined,
      parentIndex: parent !== undefined && parent < index ? parent : undefined };
    return row.lineType === "Planned"
      ? { lineType: "Planned", bomLineId: row.bomLineId, quantity: row.quantity, unitPrice: row.unitPrice, priceSource: "Estimate", remark: row.remark || undefined, ...form }
      : { lineType: row.lineType, bomLineId: row.lineType === "Substitute" ? row.bomLineId : undefined, module: row.lineType === "Unplanned" ? row.module : undefined,
        itemCode: row.itemCode || undefined, partNumber: row.partNumber || undefined, description: row.description || undefined, brand: row.brand || undefined,
        unit: row.unit || undefined, quantity: row.quantity, coveredQuantity: row.lineType === "Substitute" ? row.coveredQuantity ?? undefined : undefined,
        unitPrice: row.unitPrice, priceSource: "Manual", remark: row.remark || undefined, ...form };
  });
}

/** Rows a part belonged to are gone: their parts become lines of their own. */
export function withoutRows(rows: PrDraftRow[], keys: Set<string>): PrDraftRow[] {
  return rows.filter((row) => !keys.has(row.key)).map((row) => row.parentKey && keys.has(row.parentKey) ? { ...row, parentKey: null } : row);
}

/** Makes a row a part of the nearest row above it that is not a part itself, or makes a part a line of its own again. */
export function togglePart(rows: PrDraftRow[], key: string): PrDraftRow[] {
  const at = rows.findIndex((row) => row.key === key);
  if (at < 0) return rows;
  if (rows[at]!.parentKey) return rows.map((row, index) => index === at ? { ...row, parentKey: null } : row);
  // A row that has parts of its own cannot become a part: the form has one level.
  if (rows.some((row) => row.parentKey === key)) return rows;
  const parent = rows.slice(0, at).reverse().find((row) => !row.parentKey);
  return parent ? rows.map((row, index) => index === at ? { ...row, parentKey: parent.key } : row) : rows;
}

/**
 * The downloadable template, laid out for lib/export-xlsx.ts: a title in row 1, notes in rows 2-5, headers in row 6, quantities in column H and
 * prices in column J. The BOM line column ties a row to the estimate; a row without one is an unplanned item.
 */
export function templateRows(title: string, rows: PrDraftRow[], lines: Map<number, PrBomLine>): Cell[][] {
  const notes: Cell[][] = [
    [title],
    ["Buy (Y/N): N = not on this PR. Type: Planned = the estimate item · Substitute = another make/model for the same BOM line · Unplanned = not in the estimate (fill Module)."],
    ["Keep the BOM line number. To buy another item for a line, set Type to Substitute and change Item code / Description / Part No. / Brand."],
    ["A new row without a BOM line is an unplanned item: fill Module, Description, Qty, Unit and Unit price. Purchasing chooses the supplier."],
    [],
  ];
  const body = rows.map((row) => {
    const line = row.bomLineId === null ? undefined : lines.get(row.bomLineId);
    return [row.selected ? "Y" : "N", row.itemCode, row.description, row.partNumber, row.brand, row.module, row.lineType, row.quantity, row.unit, row.unitPrice, row.remark,
      row.bomLineId ?? "", line ? (line.itemCode || line.partNumber || line.description) : "", line ? line.remaining : "", line ? line.estimatedUnitCost : "",
      row.material ?? "", row.treatment ?? "", row.detail ?? "", row.needBy ?? "", row.attachmentUrl ?? ""];
  });
  return [...notes, PR_TEMPLATE_HEADERS, ...body];
}

/** A sheet's cells, keyed "A1", as rows of values. */
export function sheetRows(cells: Record<string, { value: string | number }>): Cell[][] {
  const rows: Cell[][] = [];
  for (const [reference, cell] of Object.entries(cells)) {
    const match = /^([A-Z]+)(\d+)$/i.exec(reference); if (!match) continue;
    const column = [...match[1]!.toUpperCase()].reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0) - 1;
    const row = Number(match[2]) - 1;
    (rows[row] ??= [])[column] = cell.value;
  }
  return Array.from({ length: rows.length }, (_, index) => rows[index] ?? []);
}

const HEADER_ALIASES: Record<string, string[]> = {
  buy: ["buy (y/n)", "buy", "use", "ซื้อ"], type: ["type", "ประเภท"], bomLine: ["bom line", "bom line id", "bomline"], module: ["module", "โมดูล"],
  itemCode: ["item code", "item", "code", "รหัสสินค้า", "รหัส"], partNumber: ["part no.", "part no", "part number", "model/part number", "model", "part"],
  description: ["description", "item description", "รายละเอียด", "รายการ"], brand: ["brand", "maker", "ยี่ห้อ"], qty: ["qty", "quantity", "จำนวน"],
  unit: ["unit", "หน่วย"], unitPrice: ["unit price", "price", "ราคา/หน่วย", "ราคาต่อหน่วย"], remark: ["remark", "remarks", "note", "หมายเหตุ"],
  material: ["material", "วัสดุ"], treatment: ["treatment", "surface treatment", "การชุบ"], detail: ["detail", "รายละเอียดเพิ่ม"], needBy: ["need by", "need-by", "need date", "วันที่ต้องการ"],
  attachmentUrl: ["link", "url", "drawing link"],
};
const KIND_ALIASES: Record<PrRowKind, string[]> = { Planned: ["planned", "ตรงแผน"], Substitute: ["substitute", "ทดแทน"], Unplanned: ["unplanned", "นอกแผน"] };
const kindOf = (value: Cell): PrRowKind | null => (Object.keys(KIND_ALIASES) as PrRowKind[]).find((kind) => KIND_ALIASES[kind].some((alias) => same(alias, text(value)))) ?? null;

function headerColumns(row: Cell[]): Record<string, number> | null {
  const columns: Record<string, number> = {};
  row.forEach((value, index) => {
    const label = text(value).toLocaleLowerCase();
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) if (columns[field] === undefined && aliases.includes(label)) columns[field] = index;
  });
  return columns.qty !== undefined && (columns.description !== undefined || columns.partNumber !== undefined) ? columns : null;
}

export type SheetImport = { rows: PrDraftRow[]; format: "template" | "prform" | "table"; skipped: number;
  /** PR-Form lines whose PO status says cancelled or rejected: left out. */
  cancelled?: number };

/** One row read from a file, before it is tied to the BOM. */
type SheetRecord = { key: string; buy: string; type: string; bomLine: number | null; module: string; itemCode: string; partNumber: string; description: string;
  brand: string; quantity: number | null; unit: string; unitPrice: number | null; remark: string; form?: PrRowForm };

/**
 * File rows as editor rows. A row is tied to a BOM line by the BOM line column, or else by an exact item code or part number. A tied row whose item
 * differs from the estimate's becomes a substitute; an untied one is unplanned and needs a module if the file did not name one.
 */
function draftFromRecords(records: SheetRecord[], lines: PrBomLine[], modules: string[], format: SheetImport["format"]): SheetImport {
  const byId = new Map(lines.map((line) => [line.id, line]));
  const byCode = (code: string) => { const matches = code ? lines.filter((line) => same(line.itemCode, code) || same(line.partNumber, code)) : []; return matches.length === 1 ? matches[0] : undefined; };
  const moduleName = (value: string) => modules.find((module) => same(module, value)) ?? "";
  const result: PrDraftRow[] = []; let skipped = 0;
  for (const record of records) {
    const { partNumber, itemCode, description, quantity } = record;
    if (!description && !partNumber && !itemCode) continue;
    if (quantity === null || quantity <= 0) { skipped += 1; continue; }
    const declared = kindOf(record.type);
    const tied = byId.get(record.bomLine ?? -1) ?? (declared === "Unplanned" ? undefined : byCode(itemCode) ?? byCode(partNumber));
    const price = record.unitPrice;
    const base = { key: record.key, selected: !["n", "no", "ไม่"].includes(record.buy.toLocaleLowerCase()), remark: record.remark, quantity, brand: record.brand, unit: record.unit, ...record.form };
    if (!tied) {
      result.push({ ...base, lineType: "Unplanned", bomLineId: null, module: moduleName(record.module), itemCode, partNumber, description, unitPrice: price ?? 0, coveredQuantity: null });
      continue;
    }
    const differs = (itemCode && !same(itemCode, tied.itemCode)) || (partNumber && !same(partNumber, tied.partNumber) && !same(partNumber, tied.itemCode))
      || (format === "template" && description && !same(description, tied.description));
    const lineType: PrRowKind = declared === "Substitute" || (declared !== "Planned" && differs) ? "Substitute" : "Planned";
    result.push(lineType === "Planned"
      ? { ...base, lineType, bomLineId: tied.id, module: tied.module, itemCode: tied.itemCode, partNumber: tied.partNumber, description: tied.description,
        brand: tied.brand, unit: tied.unit, unitPrice: price ?? tied.estimatedUnitCost, coveredQuantity: null }
      : { ...base, lineType, bomLineId: tied.id, module: tied.module, itemCode, partNumber, description: description || tied.description,
        unit: base.unit || tied.unit, unitPrice: price ?? tied.estimatedUnitCost, coveredQuantity: null });
  }
  return { rows: result, format, skipped };
}

/**
 * Reads a sheet into editor rows: any table whose header row has a description or part number and a quantity, the template this app writes among
 * them. The team's PR-Form is read by lib/pr-form.ts and draftFromPrForm instead, because its columns moved between versions of the form.
 */
export function draftFromSheet(rows: Cell[][], lines: PrBomLine[], modules: string[]): SheetImport | null {
  const headerIndex = rows.slice(0, 20).findIndex((row) => headerColumns(row) !== null);
  if (headerIndex < 0) return null;
  const columns = headerColumns(rows[headerIndex]!)!, start = headerIndex + 1;
  const value = (row: Cell[], field: string) => columns[field] === undefined ? "" : text(row[columns[field]!]);
  const records = rows.slice(start).map((row, offset): SheetRecord => ({ key: `xl-${start + offset + 1}`, buy: value(row, "buy"), type: value(row, "type"),
    bomLine: number(row[columns.bomLine ?? -1]), module: value(row, "module"), itemCode: value(row, "itemCode"), partNumber: value(row, "partNumber"),
    description: value(row, "description"), brand: value(row, "brand"), quantity: number(row[columns.qty!]), unit: value(row, "unit"),
    unitPrice: number(row[columns.unitPrice ?? -1]), remark: value(row, "remark"),
    form: { material: value(row, "material"), treatment: value(row, "treatment"), detail: value(row, "detail"), needBy: dateText(row[columns.needBy ?? -1]), attachmentUrl: value(row, "attachmentUrl") } }));
  return draftFromRecords(records, lines, modules, columns.bomLine !== undefined ? "template" : "table");
}

/**
 * A PR-Form sheet, as lib/pr-form.ts reads it, as editor rows: every line that asks for something and is not cancelled or rejected, tied to the BOM
 * by its part number like any other import. A line the BOM does not have goes to `module` (the chosen Unit's Module) when there is one. Material,
 * treatment, detail, quantity per set and the line a part belongs to come with it.
 */
export function draftFromPrForm(form: Pick<PrFormData, "lines">, lines: PrBomLine[], modules: string[], module = ""): SheetImport {
  const byRow = new Map(form.lines.map((line) => [line.row, line]));
  let cancelled = 0;
  const records = form.lines.flatMap((line): SheetRecord[] => {
    if (line.poState === "Cancelled" || line.poState === "Rejected") { cancelled += 1; return []; }
    const parent = line.parentRow === null ? undefined : byRow.get(line.parentRow);
    const kept = parent && parent.poState !== "Cancelled" && parent.poState !== "Rejected";
    return [{ key: `pf-${line.row}`, buy: "", type: "", bomLine: null, module, itemCode: "", partNumber: line.partNumber, description: line.description || line.partNumber,
      brand: line.brand, quantity: line.quantity, unit: line.unit, unitPrice: line.unitPrice, remark: line.remark,
      form: { material: line.material, treatment: line.treatment, detail: line.detail, quantityPerSet: line.quantityPerSet, parentKey: kept ? `pf-${parent.row}` : null } }];
  });
  return { ...draftFromRecords(records, lines, modules, "prform"), cancelled };
}

/** An unplanned row nobody has typed into yet: the sheet adds these in bulk, and a save leaves them out. */
export const isBlankPrRow = (row: PrDraftRow) => row.lineType === "Unplanned" && !row.itemCode && !row.partNumber && !row.description && !row.brand && !row.remark && !row.unitPrice
  && !row.material && !row.treatment && !row.detail && !row.attachmentUrl;

/** Cells copied from Excel or Google Sheets: rows on line breaks, cells on tabs; the empty line a copy ends with is dropped. */
export function clipboardRows(pasted: string): Cell[][] {
  const rows = pasted.replace(/\r\n?/g, "\n").split("\n").map((line) => line.split("\t").map((cell) => cell.trim()));
  while (rows.length && rows.at(-1)!.every((cell) => !cell)) rows.pop();
  return rows;
}

/**
 * The header a pasted block would have had, worked out from its columns when it was copied without one. The first column that is
 * mostly numbers and has text before it is the quantity. Before it: the description alone, or part number + description, then
 * brand, with an item code first when there are four. After it: the unit when it is text, the next number as the unit price,
 * then a remark.
 */
function guessedHeader(rows: Cell[][]): Cell[] | null {
  const width = Math.max(0, ...rows.map((row) => row.length));
  const numeric = Array.from({ length: width }, (_, column) => {
    const filled = rows.map((row) => text(row[column])).filter(Boolean);
    return filled.length > 0 && filled.filter((cell) => number(cell) !== null).length / filled.length >= 0.8;
  });
  const qty = numeric.findIndex((isNumber, column) => isNumber && column > 0 && numeric.slice(0, column).some((before) => !before));
  if (qty < 0) return null;
  const header: Cell[] = Array.from({ length: width }, () => "");
  // A column of numbers before the quantity (a running No.) names nothing.
  const before = Array.from({ length: qty }, (_, column) => column).filter((column) => !numeric[column]).slice(-4);
  const names = [["description"], ["part no.", "description"], ["part no.", "description", "brand"], ["item code", "part no.", "description", "brand"]][before.length - 1] ?? [];
  before.forEach((column, index) => { header[column] = names[index]!; });
  header[qty] = "qty";
  let next = qty + 1;
  if (next < width && !numeric[next]) { header[next] = "unit"; next += 1; }
  if (next < width && numeric[next]) { header[next] = "unit price"; next += 1; }
  if (next < width && !numeric[next]) header[next] = "remark";
  return header;
}

/**
 * Rows pasted from a spreadsheet, read like an imported file: by their header row when the copy has one, else by guessedHeader.
 * An unplanned row the paste gave no module takes `module` (the sheet's module filter, or the BOM's only module).
 */
export function draftFromPaste(pasted: string, lines: PrBomLine[], modules: string[], module: string): SheetImport | null {
  const rows = clipboardRows(pasted);
  if (!rows.length) return null;
  const read = draftFromSheet(rows, lines, modules) ?? (() => { const header = guessedHeader(rows); return header ? draftFromSheet([header, ...rows], lines, modules) : null; })();
  if (!read) return null;
  return { ...read, rows: read.rows.map((row) => row.lineType === "Unplanned" ? { ...row, module: row.module || module, unit: row.unit || "pcs" } : row) };
}

/**
 * Adds pasted rows to the sheet instead of replacing it. A planned row for a BOM line the sheet already holds updates that row
 * (ticked, with the pasted quantity, price and remark); substitutes and unplanned items are appended. `stamp` keeps the new keys apart.
 */
export function addPastedRows(rows: PrDraftRow[], pasted: PrDraftRow[], stamp: string): PrDraftRow[] {
  const next = rows.filter((row) => !isBlankPrRow(row));
  pasted.forEach((row, index) => {
    const held = row.lineType === "Planned" ? next.findIndex((item) => item.lineType === "Planned" && item.bomLineId === row.bomLineId) : -1;
    if (held >= 0) next[held] = { ...next[held]!, selected: true, quantity: row.quantity, unitPrice: row.unitPrice, remark: row.remark || next[held]!.remark };
    else next.push({ ...row, key: `paste-${stamp}-${index}`, selected: true });
  });
  return next;
}

/** Empty rows to type into: what a new PR's sheet starts with, since most of what is bought is not the estimate's own item (owner 2026-11-19). */
export function blankPrRows(count: number, module: string, stamp: string): PrDraftRow[] {
  return Array.from({ length: count }, (_, index) => ({ key: `new-${stamp}-${index}`, selected: true, lineType: "Unplanned" as const, bomLineId: null, module,
    itemCode: "", partNumber: "", description: "", brand: "", unit: "pcs", quantity: 1, coveredQuantity: null, unitPrice: 0, remark: "" }));
}

/** An empty row right under the row with this key (at the end when the key is gone): an item is typed where it belongs in the list (owner 2026-11-20). */
export function insertBlankPrRow(rows: PrDraftRow[], afterKey: string, module: string, stamp: string): { rows: PrDraftRow[]; key: string } {
  const blank = blankPrRows(1, module, `${stamp}-in`)[0]!;
  const at = rows.findIndex((row) => row.key === afterKey);
  const index = at < 0 ? rows.length : at + 1;
  return { rows: [...rows.slice(0, index), blank, ...rows.slice(index)], key: blank.key };
}

/**
 * An estimate line brought into the sheet. While the line is still to request and not in the sheet already, the row stays tied to it
 * (Planned), so the BOM knows it was bought. Otherwise it is a free copy, for buying more of the same.
 */
export function rowFromBomLine(line: PrBomLine, rows: PrDraftRow[], stamp: string): PrDraftRow {
  const tied = line.remaining > 0 && !rows.some((row) => row.bomLineId === line.id);
  return { key: tied ? `bom-${line.id}` : `copy-${line.id}-${stamp}`, selected: true, lineType: tied ? "Planned" : "Unplanned", bomLineId: tied ? line.id : null, module: line.module,
    itemCode: line.itemCode, partNumber: line.partNumber, description: line.description, brand: line.brand, unit: line.unit, quantity: tied ? line.remaining : 1,
    coveredQuantity: null, unitPrice: line.estimatedUnitCost, remark: "" };
}

/**
 * What a new sheet opens with: the BOM lines the engineer ticked on the BOM (each tied to its line, with what it still needs),
 * then empty rows to type into. With nothing ticked it is the empty table.
 */
export function startingPrRows(lines: PrBomLine[], lineIds: number[], module: string, stamp: string): PrDraftRow[] {
  const rows: PrDraftRow[] = [];
  for (const line of lines) if (lineIds.includes(line.id) && line.remaining > 0) rows.push(rowFromBomLine(line, rows, stamp));
  return [...rows, ...blankPrRows(rows.length ? 5 : 10, module, stamp)];
}

/**
 * A row tied to an estimate line, after an edit: once it names another item, or asks for more than the line still needs, it buys
 * something in the line's place (Substitute). The engineer types over a row; no button turns it first.
 */
export function afterEdit(row: PrDraftRow, line: PrBomLine | undefined, itemEdited: boolean): PrDraftRow {
  if (row.lineType !== "Planned" || !line) return row;
  return itemEdited || row.quantity > line.remaining ? { ...row, lineType: "Substitute", coveredQuantity: null } : row;
}
