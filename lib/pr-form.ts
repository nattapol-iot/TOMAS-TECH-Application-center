/**
 * The Excel PR-Form the team raised purchase requests on before this app: one workbook per Unit (a drawing number and a
 * unit name) or one for a discipline's general items, kept under "Purchase - PR-Requests" on SharePoint.
 *
 * This reads a workbook into what it says, and lists what is wrong with it. It writes nothing and knows no database: the
 * dry-run report (scripts/pr-form-dry-run.mjs) and the import of a parts list into the PR sheet both start here.
 *
 * The form was redrawn several times since 2025 (a column more or less, "PO" or "PO Number", no Rev. column at all on the
 * oldest), so nothing is read by its cell address: the line columns are found by the labels of the header row and the header
 * block by its own labels ("Project Number", "Drawing No.", "Estimate", ...). The "Summary" sheets that only add the form up
 * (often all #REF!) carry no Rev., PO or actual-cost column and are left out.
 */
export type PrFormCell = { value: string | number; formula?: string; error?: boolean };
export type PrFormSheet = { name: string; cells: Record<string, PrFormCell> };

/** What the file was called: PR-[Discipline]-[Project]-[yyyymmdd]-[seq]_[Drawing No.]-[Unit name]. */
export type PrFormFileName = {
  /** ME, EE, SW, IN or IOT; empty when the name carries something else in that place (`tag`, a customer's name as a rule). */
  discipline: string; tag: string; projectNumber: string; date: string | null; sequence: string; drawingNo: string; unitName: string;
  /** "..._Confirm": the copy someone saved after the request was confirmed. */
  confirmCopy: boolean; standard: boolean;
};

export type PrFormIssueCode = "ref_error" | "over_budget" | "no_estimate" | "missing_price" | "missing_supplier" | "missing_actual" | "unknown_unit" | "bad_currency" | "foreign_currency"
  | "malformed_po" | "unknown_po_status" | "total_mismatch" | "missing_revision" | "bad_date" | "multiple_projects" | "name_format" | "name_mismatch" | "no_form" | "duplicate_form";
export type PrFormIssue = { code: PrFormIssueCode; sheet: string; row: number | null; message: string };

/**
 * What the PO status column says, as one of a few states. "Bundled": bought inside another order (a lot, a pack, the master
 * valve set, the EE team's order), so the line has no price of its own. "Stock": taken from stock, often another project's.
 */
export type PrFormPoState = "Approved" | "Pending" | "Ordered" | "Bundled" | "Stock" | "Cancelled" | "Rejected" | "Unknown" | "";
export type PrFormLine = {
  row: number; revision: string; no: number | null; item: string; partNumber: string; description: string; material: string; treatment: string; detail: string;
  quantityPerSet: number | null; quantity: number | null; unit: string; brand: string; supplier: string; leadTime: string; leadDays: number | null; quotation: string;
  unitPrice: number | null; totalPrice: number | null; currency: string; actualCost: number | null;
  /** A PO number when the column holds one ("PO-..."); anything else written there ("Online", "Shopee") is `poNote`. */
  poNumber: string; poNote: string; poStatus: string; poState: PrFormPoState; remark: string;
  /** A row with a part number and nothing else that names it (no revision, no item letter, no description): a part of the line above, as valves are of their manifold. */
  isChild: boolean; parentRow: number | null;
};
/** One △ of the form: a round of requests on the same Unit. A form that names no Rev. at all is one round named "". */
export type PrFormRound = { revision: string; description: string; issuedBy: string; issuedDate: string | null; lines: number; totalPrice: number; actualCost: number };
export type PrFormData = {
  sheet: string; discipline: string; projectNumber: string; projectName: string; customer: string; drawingNo: string; unitName: string; deliveryDate: string | null;
  estimate: number | null; estimateParts: { discipline: string; amount: number; itemRef: string }[]; estimateLink: string;
  rounds: PrFormRound[]; lines: PrFormLine[];
  /** `committed`: each line that is not cancelled or rejected, at its actual cost where the form has one, else at its quoted price. */
  totals: { lines: number; children: number; totalPrice: number; actualCost: number; committed: number; unpriced: number; withPo: number };
};
export type PrFormFile = { path: string; fileName: string; name: PrFormFileName | null; forms: PrFormData[]; issues: PrFormIssue[] };

const DISCIPLINES = ["ME", "EE", "SW", "IN", "IOT"];
const CURRENCIES = ["THB", "USD", "JPY", "EUR", "CNY", "SGD", "MYR", "GBP"];
const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const columnIndex = (name: string) => [...name].reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0);
const columnName = (index: number) => { let name = ""; for (let n = index; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name; return name; };
const rowOf = (ref: string) => Number(ref.replace(/^[A-Z]+/, ""));
const columnOf = (ref: string) => ref.replace(/\d+$/, "");
const label = (value: string) => value.toLowerCase().replace(/[.:]/g, "").replace(/\s+/g, " ").trim();
const money = (value: number) => round2(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function isoDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date.toISOString().slice(0, 10) : null;
}

/** A workbook's dates are day numbers counted from 1899-12-30. */
function dateOf(value: string | number): string | null {
  if (typeof value === "number" || /^\d+(\.\d+)?$/.test(String(value).trim())) { const serial = Number(value); return serial > 20000 && serial < 80000 ? new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86_400_000).toISOString().slice(0, 10) : null; }
  const parsed = Date.parse(String(value)); return Number.isNaN(parsed) ? null : new Date(parsed).toISOString().slice(0, 10);
}

/**
 * The date in a file name. The standard is yyyymmdd; older names used ddmmyyyy, ddmmyy or yymmdd. Of the readings that are a
 * real date, the first between 2020 and a year from `today` wins: "250829" is 2025-08-29, not 2029-08-25.
 */
function fileNameDate(digits: string, today: Date): string | null {
  const n = (from: number, to: number) => Number(digits.slice(from, to));
  const readings = digits.length === 8 ? [isoDate(n(0, 4), n(4, 6), n(6, 8)), isoDate(n(4, 8), n(2, 4), n(0, 2))]
    : digits.length === 6 ? [isoDate(2000 + n(4, 6), n(2, 4), n(0, 2)), isoDate(2000 + n(0, 2), n(2, 4), n(4, 6))] : [];
  const latest = new Date(today.getTime() + 366 * 86_400_000).toISOString().slice(0, 10);
  return readings.find((date) => date !== null && date >= "2020-01-01" && date <= latest) ?? null;
}

/** "39 D", "3D", "6W", "7 Day", "10-14 Day", "1.5-2 M", "Same Day": the lead time in days, the longer end of a range. Free text that is none of these stays text only. */
export function leadDaysOf(text: string): number | null {
  const value = text.trim().toLowerCase();
  if (/^same ?day$/.test(value)) return 0;
  const found = /^(\d+(?:\.\d+)?)(?:\s*-\s*(\d+(?:\.\d+)?))?\s*(d|day|days|w|wk|wks|week|weeks|m|mo|month|months)\.?$/.exec(value);
  if (!found) return null;
  const amount = Number(found[2] ?? found[1]), unit = found[3]!;
  return Math.round(amount * (unit.startsWith("w") ? 7 : unit.startsWith("m") ? 30 : 1));
}

const UNITS: Record<string, string> = { pcs: "Pcs", pc: "Pcs", piece: "Pcs", pieces: "Pcs", ea: "Pcs", set: "Set", sets: "Set", lot: "Lot", lots: "Lot", meter: "Meter", meters: "Meter", m: "Meter",
  pack: "Pack", packs: "Pack", job: "Job", box: "Box", roll: "Roll", sheet: "Sheet", seet: "Sheet", kg: "Kg", pair: "Pair", bottle: "Bottle", can: "Can", unit: "Unit", l: "Litre", litre: "Litre",
  cart: "Cart", car: "Car", person: "Person", day: "Day", days: "Day" };
/** The unit of measure as one of the app's own, or null when the form's text is none of them ("Pcs." is Pcs). */
export const prFormUnit = (text: string): string | null => UNITS[label(text)] ?? null;

/** "PO-20260800063": PO-, then eleven digits (year, month, running number). */
export const isPrFormPoNumber = (text: string): boolean => /^PO-\d{11}$/.test(text.trim());

/** The PO status as the forms spell it ("Already Approve", "Already Apporve", "Order Lots", "OrderMastervalve", ...). */
export function prFormPoState(text: string): PrFormPoState {
  const value = text.toLowerCase().replace(/[^a-z]/g, "");
  if (!value) return "";
  if (value.startsWith("alreadyap")) return "Approved";
  if (value.startsWith("alreadyorder") || value === "ordered") return "Ordered";
  if (value.startsWith("wait")) return "Pending";
  if (value.startsWith("cancel")) return "Cancelled";
  if (value.startsWith("reject")) return "Rejected";
  if (value.startsWith("stock")) return "Stock";
  if (value.includes("order")) return "Bundled";
  return "Unknown";
}
/** A status written in the PO column ("Order Master Valve") counts; a shop or channel ("Online", "Shopee") is no status. */
const noteState = (note: string): PrFormPoState => { const state = prFormPoState(note); return state === "Unknown" ? "" : state; };
/** States whose line was not bought on a price of its own, so a missing price, supplier or actual cost is expected. */
const NOT_PRICED_HERE: PrFormPoState[] = ["Bundled", "Stock", "Cancelled", "Rejected"];

/**
 * The file name, read with tolerance for how people really wrote it: brackets or none, "-" or "_" or spaces between the
 * parts, doubled spaces, older date orders, a customer's name where the discipline goes. `standard` says whether it is exactly
 * PR-[XX]-[PJnnnnnn]-yyyymmdd-nnn[_Drawing-Unit name].
 */
export function parsePrFormFileName(fileName: string, today: Date = new Date()): PrFormFileName | null {
  const base = fileName.replace(/^.*[\\/]/, "").replace(/\.xlsx?$/i, "");
  const found = /^PR[\s_-]*(?:\[\s*([^\]]+?)\s*\]|([A-Za-z]{2,4}))[\s_-]*\[?\s*([A-Za-z]{1,4}\d{3,10})\s*\]?[\s_-]*(\d{6,9})[\s_-]*(\d{1,4})(?:[\s_-]+(.*))?$/i.exec(base.trim());
  if (!found) return null;
  const slot = (found[1] ?? found[2]!).trim(), discipline = DISCIPLINES.includes(slot.toUpperCase()) ? slot.toUpperCase() : "";
  let rest = (found[6] ?? "").replace(/\s+/g, " ").trim();
  const confirmCopy = /(^|[\s_-])conf(i?r|ri)i?m(ed)?$/i.test(rest);
  if (confirmCopy) rest = rest.replace(/[\s_-]*conf(i?r|ri)i?m(ed)?$/i, "").trim();
  // The drawing number is the leading run of dash-joined codes that each carry a digit ("MZ08-U001"); the unit name is what follows.
  const drawing = /^([A-Za-z]*\d[A-Za-z0-9]*(?:-[A-Za-z]*\d[A-Za-z0-9]*)*)(?:[\s_-]+(.*))?$/.exec(rest);
  const date = fileNameDate(found[4]!, today);
  return { discipline, tag: discipline ? "" : slot, projectNumber: found[3]!.toUpperCase(), date, sequence: found[5]!.padStart(3, "0"),
    drawingNo: (drawing?.[1] ?? "").toUpperCase(), unitName: (drawing ? drawing[2] ?? "" : rest).trim(), confirmCopy,
    standard: Boolean(discipline) && /^PR-\[[A-Z]{2,3}\]-\[[A-Z]{1,4}\d{3,10}\]-\d{8}-\d{3}(_[^\s_][^_]*)?$/.test(base) && date === `${found[4]!.slice(0, 4)}-${found[4]!.slice(4, 6)}-${found[4]!.slice(6, 8)}` && !/\s{2,}/.test(base) && !confirmCopy };
}

type LineColumn = "revision" | "no" | "item" | "partNumber" | "description" | "material" | "treatment" | "detail" | "quantityPerSet" | "quantity" | "unit" | "brand" | "supplier"
  | "leadTime" | "quotation" | "unitPrice" | "totalPrice" | "currency" | "actualCost" | "poNumber" | "poStatus" | "remark";
const LINE_LABELS: Record<string, LineColumn> = { rev: "revision", no: "no", item: "item", "model/part number": "partNumber", "part number": "partNumber", discription: "description", description: "description",
  "discription/detial": "description", material: "material", treatment: "treatment", detail: "detail", quantity: "quantityPerSet", total: "quantity", brand: "brand", supplier: "supplier", suppier: "supplier",
  "lead time": "leadTime", "quotation no": "quotation", "quote rev": "quotation", "qt no": "quotation", "unit price": "unitPrice", "total price": "totalPrice", "total (bath)": "totalPrice", "total (baht)": "totalPrice",
  "actual cost": "actualCost", "po number": "poNumber", po: "poNumber", "po no": "poNumber", "po status": "poStatus", remark: "remark" };

/**
 * The row that names the line columns, and where each is. "Unit" comes twice: the unit of measure first, the currency after
 * the prices. Gaps people left are filled from the neighbours: the Rev. column left of "No.", the part number right of
 * "Item" (one form had a part number typed over its label), the PO status right of the PO number.
 */
function lineColumns(byRow: Map<number, string[]>, text: (ref: string) => string): { row: number; columns: Partial<Record<LineColumn, string>> } | null {
  for (const row of [8, 9, 7, 10, 6, 11, 5, 12]) {
    const refs = (byRow.get(row) ?? []).slice().sort((a, b) => columnIndex(columnOf(a)) - columnIndex(columnOf(b)));
    const columns: Partial<Record<LineColumn, string>> = {}, labelled = new Set<number>();
    for (const ref of refs) { const name = label(text(ref)), column = columnOf(ref); if (name) labelled.add(columnIndex(column));
      if (name === "unit") { if (!columns.unit) columns.unit = column; else if (!columns.currency) columns.currency = column; continue; }
      const key = LINE_LABELS[name]; if (key && !columns[key]) columns[key] = column; }
    const used = () => new Set(Object.values(columns).map(columnIndex));
    const free = (index: number) => index > 0 && !used().has(index);
    if (!columns.quantity && columns.quantityPerSet) { columns.quantity = columns.quantityPerSet; delete columns.quantityPerSet; }
    if (!columns.revision && columns.no && free(columnIndex(columns.no) - 1)) columns.revision = columnName(columnIndex(columns.no) - 1);
    if (!columns.partNumber && columns.item && free(columnIndex(columns.item) + 1)) columns.partNumber = columnName(columnIndex(columns.item) + 1);
    if (!columns.poStatus && columns.poNumber && free(columnIndex(columns.poNumber) + 1) && !labelled.has(columnIndex(columns.poNumber) + 1)) columns.poStatus = columnName(columnIndex(columns.poNumber) + 1);
    if ((columns.partNumber || columns.description) && columns.quantity && columns.unitPrice && (columns.revision || columns.poNumber || columns.actualCost)) return { row, columns };
  }
  return null;
}

/** One PR-Form sheet. `issues` takes what is wrong with it. */
function readSheet(sheet: PrFormSheet, issues: PrFormIssue[]): Omit<PrFormData, "discipline"> | null {
  if (/summary/i.test(sheet.name)) return null;
  const { cells } = sheet, byRow = new Map<number, string[]>();
  for (const ref of Object.keys(cells)) { const row = rowOf(ref); byRow.set(row, [...(byRow.get(row) ?? []), ref]); }
  const at = (ref: string) => cells[ref];
  const text = (ref: string) => { const cell = at(ref); return cell === undefined || cell.error ? "" : String(cell.value).replace(/\s+/g, " ").trim(); };
  const found = lineColumns(byRow, text); if (!found) return null;
  const { row: headerRow, columns } = found;
  const dash = (value: string) => value === "-" ? "" : value;
  const issue = (code: PrFormIssueCode, row: number | null, message: string) => issues.push({ code, sheet: sheet.name, row, message });
  const number = (ref: string): number | null => { const cell = at(ref); if (!cell || cell.error) return null; const value = typeof cell.value === "number" ? cell.value : Number(String(cell.value).replace(/,/g, "").trim());
    return String(cell.value).trim() !== "" && Number.isFinite(value) ? value : null; };

  // The header block: each label has its value in one of the next three cells of its row.
  const above = Object.keys(cells).filter((ref) => rowOf(ref) < headerRow);
  const beside = (wanted: string[], reach = 3): string => { for (const ref of above) { if (!wanted.includes(label(text(ref)))) continue;
    const start = columnIndex(columnOf(ref));
    for (let step = 1; step <= reach; step += 1) { const value = text(`${columnName(start + step)}${rowOf(ref)}`); if (value) return value; } }
    return ""; };
  const besideRef = (wanted: string[]): string | null => { for (const ref of above) if (wanted.includes(label(text(ref)))) return `${columnName(columnIndex(columnOf(ref)) + 1)}${rowOf(ref)}`; return null; };
  const deliveryText = beside(["part delivery date"]);
  const estimateRef = besideRef(["estimate"]), estimate = estimateRef ? number(estimateRef) : null;
  if (estimateRef && at(estimateRef)?.error) issue("ref_error", rowOf(estimateRef), `${estimateRef}: the estimate is a broken formula (#REF!).`);
  const projectText = beside(["project number"]), projectNumbers = [...new Set((projectText.match(/[A-Z]{2}\d{5,8}/gi) ?? []).map((value) => value.toUpperCase()))];
  if (projectNumbers.length > 1) issue("multiple_projects", null, `The form names ${projectNumbers.length} projects (${projectText}); it is counted under ${projectNumbers[0]}.`);

  // What the estimate is made of, where the form says (ME: "ME | 800000 | Item 22-30" far to the right of the header block).
  const estimateParts = above.flatMap((ref) => { const column = columnIndex(columnOf(ref)), row = rowOf(ref); const amount = number(ref);
    if (column < 28 || amount === null || amount <= 0) return [];
    const discipline = text(`${columnName(column - 1)}${row}`); return discipline ? [{ discipline, amount, itemRef: text(`${columnName(column + 1)}${row}`) }] : []; });

  // The △ block: the row above it names its columns ("Rev.", "Discription", "Issue by", "Issue date").
  const roundColumns: Partial<Record<"rev" | "description" | "by" | "date", string>> = {}; let roundHeader = 0;
  for (const ref of above) { const key = ({ rev: "rev", discription: "description", description: "description", "issue by": "by", creator: "by", "issue date": "date", date: "date" } as const)[label(text(ref))];
    if (key && !roundColumns[key]) { roundColumns[key] = columnOf(ref); if (key === "rev") roundHeader = rowOf(ref); } }
  const declared = new Map<string, { description: string; issuedBy: string; issuedDate: string | null }>();
  if (roundColumns.rev && roundHeader) for (let row = roundHeader + 1; row < headerRow; row += 1) { const name = text(`${roundColumns.rev}${row}`); if (!name) continue;
    const raw = roundColumns.date ? at(`${roundColumns.date}${row}`) : undefined, written = raw && !raw.error && String(raw.value).trim() !== "" && raw.value !== "-";
    const issuedDate = written ? dateOf(raw.value) : null;
    if (written && !issuedDate) issue("bad_date", row, `${roundColumns.date}${row}: the issue date of ${name} cannot be read (${String(raw.value)}).`);
    declared.set(name, { description: roundColumns.description ? text(`${roundColumns.description}${row}`) : "", issuedBy: roundColumns.by ? text(`${roundColumns.by}${row}`) : "", issuedDate }); }

  // The lines: every row under the header with a part number or a description, up to the form's own "Summary" row.
  const lines: PrFormLine[] = []; let parent: PrFormLine | null = null, lastRevision = "";
  const wrongCurrency = new Map<string, number[]>(), inherited: number[] = [], unnamed: number[] = [];
  for (const row of [...byRow.keys()].filter((value) => value > headerRow).sort((a, b) => a - b)) {
    const refs = byRow.get(row)!;
    if (refs.some((ref) => label(text(ref)) === "summary")) break;
    const cell = (key: LineColumn) => columns[key] ? `${columns[key]}${row}` : "";
    const partNumber = text(cell("partNumber")), description = text(cell("description"));
    if (!partNumber && !description) continue;
    const revisionText = text(cell("revision")), item = text(cell("item"));
    if (revisionText) lastRevision = revisionText;
    const quantity = number(cell("quantity")), unitPrice = number(cell("unitPrice")), totalPrice = number(cell("totalPrice")), actualCost = number(cell("actualCost"));
    // A row with no quantity, no price, no PO and no actual cost asks for nothing: the page headings the older multi-page form
    // repeats ("Vision camera (IV4)", the project number, "Model/Part Number" again) and a sheet that only points at another file.
    if (!((quantity ?? 0) > 0) && !((unitPrice ?? 0) > 0) && !((totalPrice ?? 0) > 0) && !text(cell("poNumber")) && actualCost === null) continue;
    const broken = refs.filter((ref) => cells[ref]!.error);
    if (broken.length) issue("ref_error", row, `Row ${row}: ${broken.join(", ")} ${broken.length > 1 ? "are" : "is"} a broken formula (#REF!).`);
    const isChild = Boolean(parent) && !revisionText && !item && !description;
    // A line with no Rev. of its own belongs to the round of the line above: the older forms wrote △ on a round's first line only.
    if (!isChild && !revisionText) (lastRevision ? inherited : unnamed).push(row);
    const unitText = text(cell("unit")), currencyText = text(cell("currency")), poText = text(cell("poNumber")), poStatus = text(cell("poStatus")), supplier = text(cell("supplier")), leadTime = text(cell("leadTime"));
    const poNumber = /^PO/i.test(poText) ? poText : "", poNote = poNumber ? "" : poText, currencyCode = currencyText.toUpperCase().replace(/\./g, "");
    const currency = CURRENCIES.includes(currencyCode) ? currencyCode : "THB";
    const line: PrFormLine = { row, revision: isChild ? parent!.revision : revisionText || lastRevision, no: number(cell("no")), item, partNumber, description, material: dash(text(cell("material"))),
      treatment: dash(text(cell("treatment"))), detail: dash(text(cell("detail"))), quantityPerSet: number(cell("quantityPerSet")), quantity, unit: prFormUnit(unitText) ?? unitText, brand: text(cell("brand")),
      supplier, leadTime, leadDays: leadDaysOf(leadTime), quotation: text(cell("quotation")), unitPrice, totalPrice, currency, actualCost, poNumber, poNote, poStatus,
      poState: prFormPoState(poStatus) || noteState(poNote), remark: text(cell("remark")), isChild, parentRow: isChild ? parent!.row : null };
    lines.push(line); if (!isChild) parent = line;
    const name = partNumber || description, pricedHere = !NOT_PRICED_HERE.includes(line.poState), priced = (unitPrice ?? 0) > 0;
    if (unitText && !prFormUnit(unitText)) issue("unknown_unit", row, `Row ${row} (${name}): unit "${unitText}" is not a known unit of measure.`);
    if ((quantity ?? 0) > 0 && !priced && pricedHere) issue("missing_price", row, `Row ${row} (${name}): no unit price.`);
    if ((quantity ?? 0) > 0 && !supplier && pricedHere) issue("missing_supplier", row, `Row ${row} (${name}): no supplier.`);
    if (priced && !CURRENCIES.includes(currencyCode)) wrongCurrency.set(currencyText, [...(wrongCurrency.get(currencyText) ?? []), row]);
    if (priced && currency !== "THB") issue("foreign_currency", row, `Row ${row} (${name}): priced in ${currency}; the totals add it as written, not in THB.`);
    if (priced && quantity && totalPrice !== null && Math.abs(round2(unitPrice! * quantity) - totalPrice) > 0.011) issue("total_mismatch", row, `Row ${row} (${name}): ${quantity} x ${unitPrice} is not the total price ${totalPrice}.`);
    if (priced && actualCost === null && pricedHere && (poNumber || line.poState === "Approved" || line.poState === "Ordered")) issue("missing_actual", row, `Row ${row} (${name}): ordered, but no actual cost.`);
    if (poNumber && !isPrFormPoNumber(poNumber)) issue("malformed_po", row, `Row ${row} (${name}): PO number "${poNumber}" is not PO- and eleven digits.`);
    if (line.poState === "Unknown") issue("unknown_po_status", row, `Row ${row} (${name}): PO status "${poStatus || poNote}" is not one this reader knows.`);
  }
  if (!lines.length) return null;
  // A whole column filled with the wrong word ("Set" where the currency goes) is one thing to fix, not one per line.
  const span = (at: number[]) => at.length > 1 ? `rows ${at[0]}-${at.at(-1)}` : `row ${at[0]}`;
  for (const [value, at] of wrongCurrency) issue("bad_currency", at[0]!, `${at.length} priced line${at.length > 1 ? "s say" : " says"} "${value || "(empty)"}" in the currency column, not a currency; taken as THB (${span(at)}).`);
  if (unnamed.length === lines.filter((line) => !line.isChild).length) issue("missing_revision", unnamed[0]!, `No line names a Rev.; all ${unnamed.length} are taken as one request.`);
  else if (unnamed.length) issue("missing_revision", unnamed[0]!, `${unnamed.length} line${unnamed.length > 1 ? "s" : ""} before the first Rev. belong to no round (${span(unnamed)}).`);
  if (inherited.length) issue("missing_revision", inherited[0]!, `${inherited.length} line${inherited.length > 1 ? "s have" : " has"} no Rev. of ${inherited.length > 1 ? "their" : "its"} own; ${inherited.length > 1 ? "each is" : "it is"} taken as the round of the line above (${span(inherited)}).`);

  const sum = (pick: (line: PrFormLine) => number | null, of: PrFormLine[] = lines) => round2(of.reduce((total, line) => total + (pick(line) ?? 0), 0));
  const names = [...new Set([...declared.keys(), ...lines.map((line) => line.revision)])].filter((name) => lines.some((line) => line.revision === name));
  const rounds = names.map((name) => { const own = lines.filter((line) => line.revision === name), said = declared.get(name);
    return { revision: name, description: said?.description ?? "", issuedBy: said?.issuedBy ?? "", issuedDate: said?.issuedDate ?? null, lines: own.length, totalPrice: sum((line) => line.totalPrice, own), actualCost: sum((line) => line.actualCost, own) }; });
  const totals = { lines: lines.length, children: lines.filter((line) => line.isChild).length, totalPrice: sum((line) => line.totalPrice), actualCost: sum((line) => line.actualCost),
    committed: sum((line) => line.poState === "Cancelled" || line.poState === "Rejected" ? 0 : line.actualCost ?? line.totalPrice),
    unpriced: lines.filter((line) => (line.quantity ?? 0) > 0 && !((line.unitPrice ?? 0) > 0) && !NOT_PRICED_HERE.includes(line.poState)).length, withPo: lines.filter((line) => line.poNumber).length };
  // The form's own "Remain" counts actual cost alone, so a line priced but not ordered yet is missing from it. Both are said.
  if (estimate === null || estimate <= 0) issue("no_estimate", null, "No estimate on the form, so it cannot be checked against a budget.");
  else if (totals.committed > estimate + 0.005) issue("over_budget", null, `Over budget by THB ${money(totals.committed - estimate)}: estimate ${money(estimate)}, committed ${money(totals.committed)} (actual cost, or the quoted price of a line with none).`
    + (totals.actualCost !== totals.committed && totals.actualCost > estimate ? ` On actual cost alone, as the form's Remain counts: over by ${money(totals.actualCost - estimate)}.` : ""));
  return { sheet: sheet.name, projectNumber: projectNumbers[0] ?? projectText, projectName: beside(["project name"]), customer: beside(["custumer name", "customer name", "custumer", "customer"]),
    drawingNo: dash(beside(["drawing no"])), unitName: dash(beside(["unit name"])), deliveryDate: deliveryText && deliveryText !== "-" ? dateOf(deliveryText) : null,
    estimate, estimateParts, estimateLink: above.map(text).find((value) => /^https?:\/\//i.test(value)) ?? "", rounds, lines, totals };
}

/**
 * A whole workbook: every sheet that is a PR-Form, and what is wrong with the file. `filePath` may carry the folders the
 * file sits in ("ME-PJ260091/PR-...xlsx"): a form whose name and sheet say no discipline takes it from them.
 */
export function readPrForm(sheets: PrFormSheet[], filePath: string, today: Date = new Date()): PrFormFile {
  const issues: PrFormIssue[] = [], fileName = filePath.replace(/^.*[\\/]/, ""), name = parsePrFormFileName(fileName, today);
  const folderDiscipline = (/(?:^|[\\/])(EE|ME|SW|IN)\s*[-_ ]/i.exec(filePath.slice(0, filePath.length - fileName.length))?.[1] ?? "").toUpperCase();
  const forms = sheets.flatMap((sheet) => { const data = readSheet(sheet, issues); if (!data) return [];
    const discipline = name?.discipline || (/(?:^|[_\s-])(EE|ME|SW|IN)$/i.exec(sheet.name)?.[1] ?? "").toUpperCase() || folderDiscipline;
    return [{ ...data, discipline }]; });
  if (!forms.length) issues.push({ code: "no_form", sheet: "", row: null, message: "No sheet of this workbook is a PR-Form (a header row with Model/Part Number, Quantity, Unit price and a Rev., PO or Actual cost column)." });
  if (!name) issues.push({ code: "name_format", sheet: "", row: null, message: `The file name "${fileName}" cannot be read as PR-[Discipline]-[Project]-yyyymmdd-nnn[_Drawing-Unit name].` });
  else {
    if (!name.standard) issues.push({ code: "name_format", sheet: "", row: null, message: `The file name is readable but not standard${name.tag ? ` ("${name.tag}" where the discipline goes)` : ""}${name.date ? "" : " (no readable date)"}${name.confirmCopy ? " (a _Confirm copy)" : ""}: "${fileName}".` });
    for (const form of forms) {
      if (form.projectNumber && form.projectNumber.toUpperCase() !== name.projectNumber) issues.push({ code: "name_mismatch", sheet: form.sheet, row: null, message: `The file is named for ${name.projectNumber} but the form says project ${form.projectNumber}.` });
      if (name.drawingNo && form.drawingNo && form.drawingNo.toUpperCase() !== name.drawingNo) issues.push({ code: "name_mismatch", sheet: form.sheet, row: null, message: `The file is named for drawing ${name.drawingNo} but the form says ${form.drawingNo}.` });
    }
  }
  return { path: filePath, fileName, name, forms, issues };
}

export type PrFormReportForm = {
  path: string; sheet: string; discipline: string; projectNumber: string; drawingNo: string; unitName: string; rounds: number; lines: number; estimate: number | null;
  totalPrice: number; actualCost: number; committed: number;
  /** "path › sheet" of the form this one is an earlier or identical copy of: left out of the project's totals. */
  copyOf: string | null;
};
export type PrFormReport = {
  files: number; unreadable: { path: string; error: string }[];
  projects: { projectNumber: string; projectName: string; customer: string; files: number; forms: number; units: number; requests: number; lines: number; estimate: number; totalPrice: number; actualCost: number; committed: number;
    /** `sharedEstimate`: several forms of the discipline carry the same estimate (the discipline's budget, not a Unit's), so it is counted once. */
    disciplines: { discipline: string; forms: number; estimate: number; sharedEstimate: boolean; totalPrice: number; actualCost: number; committed: number }[] }[];
  forms: PrFormReportForm[];
  perFile: { path: string; fileName: string; forms: number; issues: PrFormIssue[] }[];
  issueCounts: Partial<Record<PrFormIssueCode, number>>;
};

/**
 * Later files often copy an earlier one whole and add to it, and one workbook sometimes holds copies of other files' sheets.
 * A form whose lines (part, description, quantity, price) are nine in ten inside another form of the same project is a copy
 * of it: of two equal forms the later file is kept.
 */
function findCopies(forms: { key: string; project: string; date: string; lines: PrFormLine[] }[]): Map<number, number> {
  const prints = forms.map((form) => new Set(form.lines.map((line) => [line.partNumber, line.description, line.quantity, line.unitPrice].join("|"))));
  const copyOf = new Map<number, number>();
  for (let a = 0; a < forms.length; a += 1) for (let b = 0; b < forms.length; b += 1) {
    if (a === b || copyOf.has(a) || !forms[a]!.project || forms[a]!.project !== forms[b]!.project || copyOf.get(b) === a) continue;
    const mine = prints[a]!, theirs = prints[b]!; if (!mine.size) continue;
    let shared = 0; for (const print of mine) if (theirs.has(print)) shared += 1;
    if (shared < mine.size * 0.9) continue;
    const later = (forms[b]!.date || "") > (forms[a]!.date || "") || ((forms[b]!.date || "") === (forms[a]!.date || "") && forms[b]!.key > forms[a]!.key);
    if (theirs.size > mine.size || (theirs.size === mine.size && later)) copyOf.set(a, b);
  }
  return copyOf;
}

/** What a dry run of the import would bring in: projects, Units, requests (△ rounds), lines and totals, copies left out, and every file's issues. */
export function prFormReport(read: (PrFormFile | { path: string; error: string })[]): PrFormReport {
  const files = read.filter((item): item is PrFormFile => "forms" in item);
  const all = files.flatMap((file) => file.forms.map((form) => ({ file, form, key: `${file.path} › ${form.sheet}`, project: form.projectNumber.toUpperCase() || file.name?.projectNumber || "", date: file.name?.date ?? "" })));
  const copies = findCopies(all.map((item) => ({ key: item.key, project: item.project, date: item.date, lines: item.form.lines })));
  // A copy of a copy names the form that is kept.
  const kept = (index: number) => { let at = index; for (let step = 0; copies.has(at) && step < all.length; step += 1) at = copies.get(at)!; return at; };
  const extra = new Map<PrFormFile, PrFormIssue[]>();
  for (const index of copies.keys()) { const item = all[index]!, other = all[kept(index)]!;
    extra.set(item.file, [...(extra.get(item.file) ?? []), { code: "duplicate_form", sheet: item.form.sheet, row: null, message: `A copy of ${other.key}: its lines are there too, so it is left out of the project's totals.` }]); }
  const forms: PrFormReportForm[] = all.map((item, index) => ({ path: item.file.path, sheet: item.form.sheet, discipline: item.form.discipline, projectNumber: item.project, drawingNo: item.form.drawingNo,
    unitName: item.form.unitName, rounds: item.form.rounds.length, lines: item.form.totals.lines, estimate: item.form.estimate, totalPrice: item.form.totals.totalPrice, actualCost: item.form.totals.actualCost,
    committed: item.form.totals.committed, copyOf: copies.has(index) ? all[kept(index)]!.key : null }));
  const counted = forms.filter((form) => !form.copyOf);
  const total = (of: PrFormReportForm[], pick: (form: PrFormReportForm) => number) => round2(of.reduce((sum, form) => sum + pick(form), 0));
  const projects = [...new Set(counted.map((form) => form.projectNumber).filter(Boolean))].sort().map((projectNumber) => {
    const own = counted.filter((form) => form.projectNumber === projectNumber), first = all.find((item) => item.project === projectNumber)?.form;
    const disciplines = [...new Set(own.map((form) => form.discipline))].sort().map((discipline) => { const of = own.filter((form) => form.discipline === discipline);
      const estimates = of.map((form) => form.estimate ?? 0).filter((value) => value > 0), distinct = [...new Set(estimates)];
      return { discipline, forms: of.length, estimate: round2(distinct.reduce((sum, value) => sum + value, 0)), sharedEstimate: distinct.length < estimates.length,
        totalPrice: total(of, (form) => form.totalPrice), actualCost: total(of, (form) => form.actualCost), committed: total(of, (form) => form.committed) }; });
    return { projectNumber, projectName: first?.projectName ?? "", customer: first?.customer ?? "", files: new Set(own.map((form) => form.path)).size, forms: own.length,
      units: new Set(own.map((form) => `${form.discipline}|${form.drawingNo}|${form.unitName}`.toUpperCase())).size, requests: total(own, (form) => form.rounds), lines: total(own, (form) => form.lines),
      estimate: round2(disciplines.reduce((sum, item) => sum + item.estimate, 0)), totalPrice: total(own, (form) => form.totalPrice), actualCost: total(own, (form) => form.actualCost),
      committed: total(own, (form) => form.committed), disciplines };
  });
  const perFile = files.map((file) => ({ path: file.path, fileName: file.fileName, forms: file.forms.length, issues: [...file.issues, ...(extra.get(file) ?? [])] }));
  const issueCounts: PrFormReport["issueCounts"] = {};
  for (const file of perFile) for (const item of file.issues) issueCounts[item.code] = (issueCounts[item.code] ?? 0) + 1;
  return { files: read.length, unreadable: read.filter((item): item is { path: string; error: string } => "error" in item), projects, forms, perFile, issueCounts };
}

/** The report as text for a terminal or a file. `detail`: how many issues to print per file before "and n more". */
export function formatPrFormReport(report: PrFormReport, detail = 12): string {
  const thb = (value: number | null) => value === null ? "-" : money(value);
  const out: string[] = ["PR-Form import: dry run. Nothing was written.", "", `Files read: ${report.files} (${report.unreadable.length} could not be read). Forms: ${report.forms.length}, of which ${report.forms.filter((form) => form.copyOf).length} are copies left out of the totals.`, ""];
  out.push(`Projects: ${report.projects.length}`);
  for (const project of report.projects) {
    out.push(`  ${project.projectNumber}  ${project.projectName}${project.customer ? `  (${project.customer})` : ""}`);
    out.push(`    files ${project.files}, forms ${project.forms}, units ${project.units}, requests (rounds) ${project.requests}, lines ${project.lines}`);
    out.push(`    estimate THB ${thb(project.estimate)}, total price ${thb(project.totalPrice)}, actual cost ${thb(project.actualCost)}, committed ${thb(project.committed)}`);
    for (const item of project.disciplines) out.push(`    ${item.discipline || "(no discipline)"}: forms ${item.forms}, estimate ${thb(item.estimate)}${item.sharedEstimate ? " (the same figure on several forms, counted once)" : ""}, committed ${thb(item.committed)}, remain ${item.estimate > 0 ? thb(round2(item.estimate - item.committed)) : "-"}`);
  }
  out.push("", "Issues by kind");
  for (const [code, count] of Object.entries(report.issueCounts).sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))) out.push(`  ${code}: ${count}`);
  if (!Object.keys(report.issueCounts).length) out.push("  none");
  out.push("", "Files");
  for (const file of report.perFile) {
    out.push(`  ${file.path}`);
    for (const form of report.forms.filter((item) => item.path === file.path)) out.push(`    ${form.sheet}: ${form.discipline || "?"} ${form.projectNumber} ${[form.drawingNo, form.unitName].filter(Boolean).join(" ") || "(general)"}, requests ${form.rounds}, lines ${form.lines}, estimate ${thb(form.estimate)}, total price ${thb(form.totalPrice)}, actual ${thb(form.actualCost)}${form.copyOf ? "  [copy, not counted]" : ""}`);
    for (const item of file.issues.slice(0, detail)) out.push(`    [${item.code}]${item.sheet ? ` ${item.sheet}:` : ""} ${item.message}`);
    if (file.issues.length > detail) out.push(`    ... and ${file.issues.length - detail} more`);
    if (!file.issues.length) out.push("    no issues");
  }
  for (const file of report.unreadable) out.push(`  ${file.path}`, `    [unreadable] ${file.error}`);
  return out.join("\n");
}

export type PrFormReportSheet = { name: string; columns: { header: string; width: number }[]; rows: (string | number | null)[][] };

/**
 * The dry run as a workbook to review and mark up: the projects, each form (with an Import column the reviewer fills in; copies
 * start at N), every issue, and every line as read. Cells only: lib-free, so the script writes it with any xlsx writer.
 */
export function prFormReportSheets(report: PrFormReport, files: PrFormFile[]): PrFormReportSheet[] {
  const column = (header: string, width = 14) => ({ header, width });
  const money = (value: number | null) => value === null ? null : round2(value);
  const copyOf = new Map(report.forms.map((form) => [`${form.path} › ${form.sheet}`, form.copyOf]));
  const projects: PrFormReportSheet = {
    name: "Projects",
    columns: [column("Project", 12), column("Name", 40), column("Customer", 32), column("Files", 7), column("Forms", 7), column("Units", 7), column("Requests (△)", 12),
      column("Lines", 8), column("Estimate"), column("Total price"), column("Actual cost"), column("Committed"), column("Remain"), column("By discipline", 60)],
    rows: report.projects.map((project) => [project.projectNumber, project.projectName, project.customer, project.files, project.forms, project.units, project.requests, project.lines,
      money(project.estimate), money(project.totalPrice), money(project.actualCost), money(project.committed), project.estimate > 0 ? money(project.estimate - project.committed) : null,
      project.disciplines.map((item) => `${item.discipline || "?"} ${round2(item.estimate).toLocaleString("en-US")}${item.sharedEstimate ? " (shared)" : ""} / committed ${round2(item.committed).toLocaleString("en-US")}`).join(" · ")]),
  };
  const issuesOf = new Map(report.perFile.map((file) => [file.path, file.issues]));
  const forms: PrFormReportSheet = {
    name: "Forms",
    columns: [column("Import (Y/N)", 11), column("File", 60), column("Sheet", 24), column("Discipline", 10), column("Project", 12), column("Drawing No.", 14), column("Unit name", 30),
      column("Requests (△)", 12), column("Lines", 8), column("Estimate"), column("Total price"), column("Actual cost"), column("Committed"), column("Copy of", 60), column("Issues", 8)],
    rows: report.forms.map((form) => [form.copyOf ? "N" : null, form.path, form.sheet, form.discipline, form.projectNumber, form.drawingNo, form.unitName, form.rounds, form.lines,
      money(form.estimate), money(form.totalPrice), money(form.actualCost), money(form.committed), form.copyOf,
      (issuesOf.get(form.path) ?? []).filter((issue) => !issue.sheet || issue.sheet === form.sheet).length]),
  };
  const issues: PrFormReportSheet = {
    name: "Issues",
    columns: [column("File", 60), column("Sheet", 24), column("Row", 7), column("Kind", 18), column("Message", 110)],
    rows: report.perFile.flatMap((file) => file.issues.map((issue) => [file.path, issue.sheet, issue.row, issue.code, issue.message])),
  };
  const lines: PrFormReportSheet = {
    name: "Lines",
    columns: [column("File", 50), column("Sheet", 20), column("Project", 12), column("Drawing No.", 14), column("Rev.", 7), column("Row", 7), column("No.", 6), column("Item", 6),
      column("Part number", 28), column("Description", 36), column("Material", 12), column("Treatment", 12), column("Detail", 20), column("Qty / set", 9), column("Qty", 8),
      column("Unit", 8), column("Brand", 14), column("Supplier", 20), column("Lead time", 10), column("Quotation", 18), column("Unit price"), column("Total price"), column("Currency", 9),
      column("Actual cost"), column("PO number", 16), column("PO note", 14), column("PO status", 16), column("State", 10), column("Part of row", 10), column("Remark", 30), column("Copy", 6)],
    rows: files.flatMap((file) => file.forms.flatMap((form) => { const copy = copyOf.get(`${file.path} › ${form.sheet}`) ? "Y" : null;
      return form.lines.map((line) => [file.path, form.sheet, form.projectNumber, form.drawingNo, line.revision, line.row, line.no, line.item, line.partNumber, line.description,
        line.material, line.treatment, line.detail, line.quantityPerSet, line.quantity, line.unit, line.brand, line.supplier, line.leadTime, line.quotation, line.unitPrice,
        line.totalPrice, line.currency, line.actualCost, line.poNumber, line.poNote, line.poStatus, line.poState, line.parentRow, line.remark, copy]); })),
  };
  return [projects, forms, issues, lines];
}
