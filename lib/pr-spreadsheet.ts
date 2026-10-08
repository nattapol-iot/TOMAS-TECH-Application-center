// The PR editor's rows and their Excel round trip: the template this app writes, and the TOMAS PR form the team already fills in.
// Pure functions, no imports, so the root tests load this file directly.

export type PrRowKind = "Planned" | "Substitute" | "Unplanned";
export type PrBomLine = { id: number; module: string; itemCode: string; partNumber: string; description: string; brand: string; unit: string;
  remaining: number; estimatedUnitCost: number };
export type PrModuleBudget = { module: string; budget: number; requested: number };
export type PrDraftRow = { key: string; selected: boolean; lineType: PrRowKind; bomLineId: number | null; module: string; itemCode: string; partNumber: string;
  description: string; brand: string; unit: string; quantity: number; coveredQuantity: number | null; unitPrice: number; remark: string };
export type PrModuleStatus = PrModuleBudget & { thisRequest: number; over: number; percent: number; level: "ok" | "manager" | "management"; lines: number };
type Cell = string | number | null | undefined;

/** The share of a module's budget the PM may approve over it; beyond this the Engineering Manager approves too (as on the server). */
export const PR_MANAGEMENT_OVERRUN_PERCENT = 10;
export const PR_TEMPLATE_HEADER_ROW = 5;
export const PR_TEMPLATE_HEADERS = ["Buy (Y/N)", "Item code", "Description", "Part No.", "Brand", "Module", "Type", "Qty", "Unit", "Unit price", "Remark",
  "BOM line", "Estimate item", "Still to request", "Estimate unit price"];

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

/** What the engineer starts from: every BOM line that still needs requesting, as its own estimate item, all ticked. */
export function draftFromBom(lines: PrBomLine[]): PrDraftRow[] {
  return lines.filter((line) => line.remaining > 0).map((line) => ({ key: `bom-${line.id}`, selected: true, lineType: "Planned", bomLineId: line.id, module: line.module,
    itemCode: line.itemCode, partNumber: line.partNumber, description: line.description, brand: line.brand, unit: line.unit, quantity: line.remaining,
    coveredQuantity: null, unitPrice: line.estimatedUnitCost, remark: "" }));
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

/** The request body's lines, ticked rows only, in screen order (the server's "Line n" counts these). */
export function payloadLines(rows: PrDraftRow[]) {
  return rows.filter((row) => row.selected).map((row) => row.lineType === "Planned"
    ? { lineType: "Planned", bomLineId: row.bomLineId, quantity: row.quantity, unitPrice: row.unitPrice, priceSource: "Estimate", remark: row.remark || undefined }
    : { lineType: row.lineType, bomLineId: row.lineType === "Substitute" ? row.bomLineId : undefined, module: row.lineType === "Unplanned" ? row.module : undefined,
      itemCode: row.itemCode || undefined, partNumber: row.partNumber || undefined, description: row.description || undefined, brand: row.brand || undefined,
      unit: row.unit || undefined, quantity: row.quantity, coveredQuantity: row.lineType === "Substitute" ? row.coveredQuantity ?? undefined : undefined,
      unitPrice: row.unitPrice, priceSource: "Manual", remark: row.remark || undefined });
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
      row.bomLineId ?? "", line ? (line.itemCode || line.partNumber || line.description) : "", line ? line.remaining : "", line ? line.estimatedUnitCost : ""];
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

export type SheetImport = { rows: PrDraftRow[]; format: "template" | "tomas" | "table"; skipped: number };

/**
 * Reads a sheet into editor rows. The TOMAS PR form (header "Model/Part Number" in E8) and any table whose header row has a description or part
 * number and a quantity are read; a row is tied to a BOM line by the BOM line column, or else by an exact item code or part number. A tied row whose
 * item differs from the estimate's becomes a substitute; an untied one is unplanned and needs a module if the file did not name one.
 */
export function draftFromSheet(rows: Cell[][], lines: PrBomLine[], modules: string[]): SheetImport | null {
  const byId = new Map(lines.map((line) => [line.id, line]));
  const byCode = (code: string) => { const matches = code ? lines.filter((line) => same(line.itemCode, code) || same(line.partNumber, code)) : []; return matches.length === 1 ? matches[0] : undefined; };
  const moduleName = (value: string) => modules.find((module) => same(module, value)) ?? "";
  let format: SheetImport["format"]; let start: number; let columns: Record<string, number>;
  if (same(text(rows[7]?.[4]), "Model/Part Number")) {
    // TOMAS PR form: E part number, F+G description, L quantity, M unit, N brand, R unit price, X remark.
    format = "tomas"; start = 8; columns = { partNumber: 4, description: 5, qty: 11, unit: 12, brand: 13, unitPrice: 17, remark: 23 };
  } else {
    const headerIndex = rows.slice(0, 20).findIndex((row) => headerColumns(row) !== null);
    if (headerIndex < 0) return null;
    columns = headerColumns(rows[headerIndex]!)!; start = headerIndex + 1; format = columns.bomLine !== undefined ? "template" : "table";
  }
  const value = (row: Cell[], field: string) => columns[field] === undefined ? "" : text(row[columns[field]!]);
  const result: PrDraftRow[] = []; let skipped = 0;
  rows.slice(start).forEach((row, offset) => {
    const description = format === "tomas" ? [text(row[5]), text(row[6])].filter(Boolean).join(" ") : value(row, "description");
    const partNumber = value(row, "partNumber"), itemCode = value(row, "itemCode"), quantity = number(row[columns.qty!]);
    if (!description && !partNumber && !itemCode) return;
    if (quantity === null || quantity <= 0) { skipped += 1; return; }
    const declared = kindOf(value(row, "type"));
    const tied = byId.get(number(row[columns.bomLine ?? -1]) ?? -1) ?? (declared === "Unplanned" ? undefined : byCode(itemCode) ?? byCode(partNumber));
    const price = number(row[columns.unitPrice ?? -1]);
    const base = { key: `xl-${start + offset + 1}`, selected: !["n", "no", "ไม่"].includes(value(row, "buy").toLocaleLowerCase()), remark: value(row, "remark"),
      quantity, brand: value(row, "brand"), unit: value(row, "unit") };
    if (!tied) {
      result.push({ ...base, lineType: "Unplanned", bomLineId: null, module: moduleName(value(row, "module")), itemCode, partNumber, description, unitPrice: price ?? 0, coveredQuantity: null });
      return;
    }
    const differs = (itemCode && !same(itemCode, tied.itemCode)) || (partNumber && !same(partNumber, tied.partNumber) && !same(partNumber, tied.itemCode))
      || (format === "template" && description && !same(description, tied.description));
    const lineType: PrRowKind = declared === "Substitute" || (declared !== "Planned" && differs) ? "Substitute" : "Planned";
    result.push(lineType === "Planned"
      ? { ...base, lineType, bomLineId: tied.id, module: tied.module, itemCode: tied.itemCode, partNumber: tied.partNumber, description: tied.description,
        brand: tied.brand, unit: tied.unit, unitPrice: price ?? tied.estimatedUnitCost, coveredQuantity: null }
      : { ...base, lineType, bomLineId: tied.id, module: tied.module, itemCode, partNumber, description: description || tied.description,
        unit: base.unit || tied.unit, unitPrice: price ?? tied.estimatedUnitCost, coveredQuantity: null });
  });
  return { rows: result, format, skipped };
}
