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

function worksheetRows(input: ErpEstimateWorkbookInput): Cell[][] {
  const rows: Cell[][] = [
    [{}, {}, { value: "ESTIMATE COST", style: 1 }],
    [{}, {}, { value: "Project name", style: 6 }, {}, { value: input.metadata.projectName }, { value: "000" }, { value: "Rev.", style: 6 }, { value: "Discription", style: 6 }, {}, {}, { value: "Creator", style: 6 }, { value: "Date", style: 6 }, {}, { value: "Page", style: 6 }],
    [{}, {}, { value: "Custumer", style: 6 }, {}, { value: input.metadata.customer }, {}, { value: input.metadata.revision }, { value: input.metadata.revisionDescription ?? "" }, {}, {}, { value: input.metadata.creator }, { value: input.metadata.exportDate }, {}, { value: "(1/1)" }],
    [{}, {}, { value: "Shot name", style: 6 }, {}, { value: input.metadata.shortName ?? "" }, {}, { value: "△1" }],
    [{}, {}, { value: "Project Number", style: 6 }, {}, { value: input.metadata.projectNumber ?? "" }, {}, { value: "△3" }],
    [{}, {}, { value: "Page name", style: 6 }, {}, { value: "Summary cost" }, {}, { value: "△4" }],
    [],
    [{}, {}, ...[
      "Item", "Model/Part Number", "Discription/Detial", "Suppier", "Brand", "Lead Time",
      "Quote Rev.", "Unit price", "Quantity", "Total (BATH)", "Unit", "Remark",
    ].map(value => ({ value, style: 2 }))],
  ];

  let sequence = 1;
  for (const category of ERP_COST_CATEGORIES) {
    rows.push([{}, {}, { value: category, style: 3 }]);
    const categoryRows = input.summary.lines.filter(row => row.erpCategory === category);
    for (const row of categoryRows) {
      rows.push([{}, {},
        { value: row.item ?? sequence++, style: 4 },
        { value: row.modelPartNumber ?? "", style: 4 },
        { value: row.description, style: 4 },
        { value: row.supplier ?? "", style: 4 },
        { value: row.brand ?? "", style: 4 },
        { value: row.leadTime ?? "", style: 4 },
        { value: row.quoteRevision ?? "", style: 4 },
        { value: row.unitPrice ?? row.amount, style: 5 },
        { value: row.quantity ?? 1, style: 5 },
        { value: row.amount, style: 5 },
        { value: row.unit ?? "", style: 4 },
        { value: row.remark ?? "", style: 4 },
      ]);
    }
    const subtotal = money(categoryRows.reduce((sum, row) => sum + row.amount, 0));
    rows.push([{}, {}, { value: `${category} Sub Total`, style: 3 }, {}, {}, {}, {}, {}, {}, {}, {}, { value: subtotal, style: 7 }]);
  }

  rows.push([{}, {}, { value: "Sub Total", style: 3 }, {}, {}, {}, {}, {}, {}, {}, {}, { value: input.summary.classifiedTotal, style: 7 }]);
  rows.push([{}, {}, { value: "Approved Overhead", style: 3 }, {}, {}, {}, {}, {}, {}, {}, {}, { value: input.approvedOverhead.amount, style: 7 }]);
  rows.push([{}, {}, { value: "Grand Total", style: 8 }, {}, {}, {}, {}, {}, {}, {}, {}, { value: input.summary.canonicalTotal, style: 9 }]);
  return rows;
}

function worksheetXml(rows: Cell[][]): string {
  const content = rows.map((row, rowIndex) => {
    const cells = row.map((cell, columnIndex) => {
      if (cell.value === undefined || cell.value === "") return "";
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
    if (ERP_COST_CATEGORIES.includes(label as ErpCostCategory)) merges.push(`C${index + 1}:N${index + 1}`);
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
const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts><fonts count="3"><font><sz val="10"/><name val="Arial"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="15"/><name val="Arial"/></font><font><b/><sz val="10"/><name val="Arial"/></font></fonts><fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F4E78"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD9EAF7"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFCE4D6"/></patternFill></fill></fills><borders count="2"><border/><border><left style="thin"/><right style="thin"/><top style="thin"/><bottom style="thin"/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="10"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0"><alignment horizontal="center"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0"><alignment horizontal="center" wrapText="1"/></xf><xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0"/><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0"/><xf numFmtId="164" fontId="2" fillId="3" borderId="1" xfId="0"/><xf numFmtId="0" fontId="2" fillId="4" borderId="1" xfId="0"/><xf numFmtId="164" fontId="2" fillId="4" borderId="1" xfId="0"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

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
