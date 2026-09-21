import { zipSync, strToU8 } from "fflate";

export const ERP_COST_CATEGORIES = [
  "Hardware",
  "Software",
  "Service",
  "Installation",
  "License",
  "Maintenance",
  "Training",
] as const;

export type ErpCostCategory = (typeof ERP_COST_CATEGORIES)[number];

export type ErpEstimateSourceType =
  | "CostItem"
  | "ManhourLine"
  | "ExpenseLine"
  | "OtherCostLine"
  | "Contingency";

export type ErpEstimateWorkbookRow = {
  sourceType: ErpEstimateSourceType;
  sourceId: number | null;
  internalCategory: string;
  amount: number;
  erpCategory: ErpCostCategory | "Unmapped";
  mappingRowVersion: string | null;
  copiedFromRevision: number | null;
  item?: string | number;
  modelPartNumber?: string;
  description: string;
  supplier?: string;
  brand?: string;
  leadTime?: string;
  quoteRevision?: string;
  unitPrice?: number;
  quantity?: number;
  unit?: string;
  remark?: string;
};

export type ErpEstimateWorkbookMetadata = {
  projectName: string;
  customer: string;
  shortName?: string;
  projectNumber?: string;
  revision: string;
  revisionDescription?: string;
  creator: string;
  exportDate: string;
};

export type ErpEstimateSummaryContract = {
  estimateId?: number;
  revision?: number;
  estimateRowVersion?: string;
  categories: Array<{ category: ErpCostCategory; amount: number; lineCount: number }>;
  unmapped: { amount: number; lineCount: number };
  classifiedTotal: number;
  canonicalTotal: number;
  difference: number;
  reconciled: boolean;
  capabilities?: { canExport: boolean };
  lines: ErpEstimateWorkbookRow[];
};

export type ErpEstimateWorkbookInput = {
  metadata: ErpEstimateWorkbookMetadata;
  summary: ErpEstimateSummaryContract;
  approvedOverhead: { amount: number; approved: boolean };
};

export const ERP_ESTIMATE_TEMPLATE_VERSION = "ERP_SUMMARY_V1";

export class ErpEstimateWorkbookValidationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(issues.join("; "));
    this.name = "ErpEstimateWorkbookValidationError";
    this.issues = issues;
  }
}

type Cell = { value?: string | number; style?: number };

const MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const RECONCILIATION_TOLERANCE = 0.01;

/** Tab, newline and carriage return are the only control characters XML 1.0 admits. */
const writableInXml = (character: string) => {
  const code = character.charCodeAt(0);
  return code > 0x1f || code === 0x09 || code === 0x0a || code === 0x0d;
};
const escapeXml = (value: string) => value
  /* XML 1.0 cannot carry these at all, escaped or not, and one of them arriving in
     an imported description would make the whole sheet unreadable. */
  .split("").filter(writableInXml).join("")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

const columnName = (index: number) => {
  let result = "";
  for (let number = index; number > 0; number = Math.floor((number - 1) / 26)) {
    result = String.fromCharCode(65 + ((number - 1) % 26)) + result;
  }
  return result;
};

const finite = (value: number) => Number.isFinite(value);
const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function validateErpEstimateWorkbook(input: ErpEstimateWorkbookInput): void {
  const issues: string[] = [];
  const unmapped = input.summary.lines.filter(row => row.erpCategory === "Unmapped").length;
  if (unmapped) issues.push(`${unmapped} cost row(s) are unmapped`);
  if (input.summary.unmapped.lineCount || Math.abs(input.summary.unmapped.amount) > RECONCILIATION_TOLERANCE) {
    issues.push("ERP summary contains unmapped cost");
  }
  if (!input.approvedOverhead.approved) issues.push("Overhead must be approved before ERP export");

  input.summary.lines.forEach((row, index) => {
    if (!row.description.trim()) issues.push(`Row ${index + 1} has no description`);
    const unitPrice = row.unitPrice ?? row.amount;
    const quantity = row.quantity ?? 1;
    if (![unitPrice, quantity, row.amount].every(finite)) issues.push(`Row ${index + 1} contains a non-finite amount`);
    if (Math.abs(money(unitPrice * quantity) - money(row.amount)) > RECONCILIATION_TOLERANCE) {
      issues.push(`Row ${index + 1} total does not equal unit price x quantity`);
    }
  });

  const overhead = input.approvedOverhead.amount;
  if (![overhead, input.summary.canonicalTotal, input.summary.classifiedTotal, input.summary.difference].every(finite)) {
    issues.push("Summary contains a non-finite amount");
  }
  if (!input.summary.reconciled || Math.abs(input.summary.difference) > RECONCILIATION_TOLERANCE) {
    issues.push("ERP summary is not reconciled");
  }
  if (input.summary.capabilities && !input.summary.capabilities.canExport) issues.push("ERP summary is not exportable");
  const nonOverheadTotal = input.summary.lines.reduce((sum, row) => sum + row.amount, 0);
  const expectedGrandTotal = money(nonOverheadTotal + overhead);
  if (Math.abs(expectedGrandTotal - money(input.summary.canonicalTotal)) > RECONCILIATION_TOLERANCE) {
    issues.push(`Grand Total does not reconcile (expected ${expectedGrandTotal.toFixed(2)})`);
  }
  if (issues.length) throw new ErpEstimateWorkbookValidationError(issues);
}

/*
 * The sheet is the company's ESTIMATE COST form, filled in.
 *
 * Its shape is not ours to improve: the header block, the wording of every label
 * — "Custumer", "Shot name", "Discription/Detial" — and the order of the columns
 * are what the people downstream read and what their ERP import expects. So the
 * form decides the layout and the estimate only supplies the values.
 *
 * Within it: one running item number down column C, the ERP category written once
 * in column D where its block begins, and the lines of that block beneath. No
 * spacer rows and no invented remarks — the form is filled to the length of the
 * estimate, not padded to the length of the paper.
 */
function worksheetRows(input: ErpEstimateWorkbookInput): Cell[][] {
  const label = (value: string) => ({ value, style: STYLE.label });
  const boxed = (value: string | number) => ({ value, style: STYLE.headerValue });
  const centred = (value: string) => ({ value, style: STYLE.headerCentre });
  const rows: Cell[][] = [
    [{}, {}, { value: "ESTIMATE COST", style: STYLE.title }],
    [{}, {}, label("Project name"), {}, boxed(input.metadata.projectName), { value: "001", style: STYLE.headerItalic },
      centred("Rev."), centred("Discription"), {}, {}, centred("Creator"), centred("Date"), {}, centred("Page")],
    [{}, {}, label("Custumer"), {}, boxed(input.metadata.customer), {},
      centred("△1"), boxed(input.metadata.revisionDescription ?? ""), {}, {}, boxed(input.metadata.creator), boxed(input.metadata.exportDate), {}, { value: "(1/1)", style: STYLE.headerCentreLight }],
    [{}, {}, label("Shot name"), {}, boxed(input.metadata.shortName ?? ""), {}, centred("△2")],
    [{}, {}, label("Project Number"), {}, boxed(input.metadata.projectNumber ?? ""), {}, centred("△3")],
    [{}, {}, label("Page name"), {}, boxed("Summary cost"), {}, centred("△4")],
    [],
    [{}, {}, ...[
      "Item", "Model/Part Number", "Discription/Detial", "Suppier", "Brand", "Lead Time",
      "Quote Rev.", "Unit price", "Quantity", "Total (BATH)", "Unit", "Remark",
    ].map(value => ({ value, style: STYLE.columnHead }))],
  ];

  let item = 1;
  for (const category of ERP_COST_CATEGORIES) {
    const categoryRows = input.summary.lines.filter(row => row.erpCategory === category);
    categoryRows.forEach((row, index) => {
      /* The category names its block from column D. A first line that carries a
         part number of its own keeps it, and the name takes a line above rather
         than displacing it — the form may not cost the sheet a real value. */
      const partNumber = row.modelPartNumber ?? "";
      if (index === 0 && partNumber) rows.push([{}, {}, {}, { value: category, style: STYLE.blockName }]);
      rows.push([{}, {},
        { value: item++, style: STYLE.text },
        { value: index === 0 && !partNumber ? category : partNumber, style: index === 0 && !partNumber ? STYLE.blockName : STYLE.text },
        { value: row.description, style: STYLE.text },
        { value: row.supplier ?? "", style: STYLE.text },
        { value: row.brand ?? "", style: STYLE.text },
        { value: row.leadTime ?? "", style: STYLE.text },
        { value: row.quoteRevision ?? "", style: STYLE.text },
        { value: money(row.unitPrice ?? row.amount), style: STYLE.money },
        { value: row.quantity ?? 1, style: STYLE.money },
        { value: money(row.amount), style: STYLE.money },
        { value: row.unit ?? "", style: STYLE.text },
        { value: "", style: STYLE.text },
      ]);
    });
    const subtotal = money(categoryRows.reduce((sum, row) => sum + row.amount, 0));
    rows.push([{}, {}, { value: `${category} Sub Total`, style: STYLE.subtotal }, {}, {}, {}, {}, {}, {}, {}, {}, { value: subtotal, style: STYLE.subtotalMoney }]);
  }

  rows.push([{}, {}, { value: "Sub Total", style: STYLE.subtotal }, {}, {}, {}, {}, {}, {}, {}, {}, { value: money(input.summary.classifiedTotal), style: STYLE.subtotalMoney }]);
  rows.push([{}, {}, { value: "Approved Overhead", style: STYLE.subtotal }, {}, {}, {}, {}, {}, {}, {}, {}, { value: money(input.approvedOverhead.amount), style: STYLE.subtotalMoney }]);
  rows.push([{}, {}, { value: "Grand Total", style: STYLE.grandTotal }, {}, {}, {}, {}, {}, {}, {}, {}, { value: money(input.summary.canonicalTotal), style: STYLE.grandTotalMoney }]);
  return rows;
}

function worksheetXml(rows: Cell[][]): string {
  const content = rows.map((row, rowIndex) => {
    const cells = row.map((cell, columnIndex) => {
      /* A cell with a style but no value still draws its part of the grid: dropping it
         would leave a hole in the ruled box the form is made of. */
      const ref0 = `${columnName(columnIndex + 1)}${rowIndex + 1}`;
      if (cell.value === undefined || cell.value === "") return cell.style === undefined ? "" : `<c r="${ref0}" s="${cell.style}"/>`;
      const ref = `${columnName(columnIndex + 1)}${rowIndex + 1}`;
      const style = cell.style ? ` s="${cell.style}"` : "";
      return typeof cell.value === "number"
        ? `<c r="${ref}"${style}><v>${cell.value}</v></c>`
        : `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${escapeXml(cell.value)}</t></is></c>`;
    }).join("");
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join("");

  const merges = [
    "C1:O1", "C2:D2", "F2:F6", "H2:J2", "L2:M2", "N2:O2",
    "C3:D3", "H3:J3", "L3:M3", "N3:O6",
    "C4:D4", "H4:J4", "L4:M4",
    "C5:D5", "H5:J5", "L5:M5",
    "C6:D6", "H6:J6", "L6:M6", "C7:O7", "N8:O8",
  ];
  rows.forEach((row, index) => {
    const label = row[2]?.value;
    if (typeof label !== "string") return;
    if (label.endsWith("Sub Total") || label === "Approved Overhead" || label === "Grand Total") {
      merges.push(`C${index + 1}:K${index + 1}`);
    }
  });
  const mergeXml = merges.map(ref => `<mergeCell ref="${ref}"/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="8" topLeftCell="C9" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="2" width="2" customWidth="1"/><col min="3" max="3" width="11.875" customWidth="1"/><col min="4" max="4" width="52.625" customWidth="1"/><col min="5" max="5" width="109.625" customWidth="1"/><col min="6" max="6" width="37.375" customWidth="1"/><col min="7" max="7" width="23.125" customWidth="1"/><col min="8" max="8" width="20" customWidth="1"/><col min="9" max="9" width="21.625" customWidth="1"/><col min="10" max="10" width="25.375" customWidth="1"/><col min="11" max="11" width="21.625" customWidth="1"/><col min="12" max="12" width="29.25" customWidth="1"/><col min="13" max="13" width="13.625" customWidth="1"/><col min="14" max="14" width="17.875" customWidth="1"/><col min="15" max="15" width="12" customWidth="1"/></cols><sheetData>${content}</sheetData><autoFilter ref="C8:N8"/><mergeCells count="${merges.length}">${mergeXml}</mergeCells><pageMargins left="0.25" right="0.25" top="0.5" bottom="0.5" header="0.2" footer="0.2"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`;
}

const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;
const rootRelationships = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
const workbookXml = (lastRow: number) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Summary cost" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm.Print_Area" localSheetId="0">'Summary cost'!$C$1:$O$${lastRow}</definedName></definedNames></workbook>`;
const workbookRelationships = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
/** Named so a row says which part of the form it is, not which number a style got. */
const STYLE = {
  title: 1, columnHead: 2, label: 3, headerValue: 4, headerCentre: 5,
  headerItalic: 6, headerCentreLight: 7, text: 8, money: 9, blockName: 10,
  subtotal: 11, subtotalMoney: 12, grandTotal: 13, grandTotalMoney: 14,
} as const;

const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts><fonts count="6"><font><sz val="10"/><name val="Arial"/></font><font><b/><i/><color rgb="FFFFFFFF"/><sz val="15"/><name val="Arial"/></font><font><b/><i/><color rgb="FFFFFFFF"/><sz val="10"/><name val="Arial"/></font><font><b/><color rgb="FFC00000"/><sz val="10"/><name val="Arial"/></font><font><b/><sz val="10"/><name val="Arial"/></font><font><i/><sz val="10"/><name val="Arial"/></font></fonts><fills count="6"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF00B050"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFFF00"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD9EAF7"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFCE4D6"/></patternFill></fill></fills><borders count="2"><border/><border><left style="thin"/><right style="thin"/><top style="thin"/><bottom style="thin"/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="15"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="4" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="5" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="4" fillId="4" borderId="1" xfId="0"/><xf numFmtId="164" fontId="4" fillId="4" borderId="1" xfId="0"/><xf numFmtId="0" fontId="4" fillId="5" borderId="1" xfId="0"/><xf numFmtId="164" fontId="4" fillId="5" borderId="1" xfId="0"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

export function buildErpEstimateWorkbook(input: ErpEstimateWorkbookInput): Uint8Array {
  validateErpEstimateWorkbook(input);
  const rows = worksheetRows(input);
  return zipSync({
    "[Content_Types].xml": strToU8(contentTypes),
    "_rels/.rels": strToU8(rootRelationships),
    "xl/workbook.xml": strToU8(workbookXml(rows.length)),
    "xl/_rels/workbook.xml.rels": strToU8(workbookRelationships),
    "xl/styles.xml": strToU8(styles),
    "xl/worksheets/sheet1.xml": strToU8(worksheetXml(rows)),
  });
}

export function downloadErpEstimateWorkbook(input: ErpEstimateWorkbookInput, filename: string): void {
  downloadErpEstimateWorkbookBytes(buildErpEstimateWorkbook(input), filename);
}

export function downloadErpEstimateWorkbookBytes(bytes: Uint8Array, filename: string): void {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy.buffer], { type: MIME });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename.toLowerCase().endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
