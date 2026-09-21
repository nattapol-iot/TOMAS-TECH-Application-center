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
 * Everything here — the header block, the misspellings ("Custumer", "Shot name",
 * "Discription/Detial"), the column widths, the row heights, the green and yellow,
 * the 26pt title, the accounting number format — is read out of the workbook the
 * team actually uses, not chosen here. The estimate supplies values; the form
 * decides how they are written.
 *
 * Two things the form has that this sheet will not: a Profit row, and the hidden
 * Sale Price Guide beside it. No margin, markup or selling price exists anywhere
 * in this application, and a column of blanks under that heading would invite
 * someone to fill it in.
 */
type Sheet = { rows: Cell[][]; merges: string[] };

/** The header block is fixed furniture: the same eight rows on every estimate. */
const HEADER_MERGES = [
  "C1:O1", "C2:D2", "F2:F6", "H2:J2", "L2:M2", "N2:O2",
  "C3:D3", "H3:J3", "L3:M3", "N3:O6",
  "C4:D4", "H4:J4", "L4:M4",
  "C5:D5", "H5:J5", "L5:M5",
  "C6:D6", "H6:J6", "L6:M6", "C7:O7", "N8:O8",
];

function worksheetRows(input: ErpEstimateWorkbookInput): Sheet {
  const label = (value: string) => ({ value, style: STYLE.label });
  const boxed = (value: string) => ({ value, style: STYLE.headerValue });
  const centred = (value: string) => ({ value, style: STYLE.headerCentre });
  const rows: Cell[][] = [
    [{}, {}, { value: "ESTIMATE COST", style: STYLE.title }],
    [{}, {}, label("Project name"), {}, boxed(input.metadata.projectName), { value: "001", style: STYLE.headerItalic },
      centred("Rev."), centred("Discription"), {}, {}, centred("Creator"), centred("Date"), {}, centred("Page")],
    [{}, {}, label("Custumer"), {}, boxed(input.metadata.customer), {},
      centred("△1"), boxed(input.metadata.revisionDescription ?? ""), {}, {}, boxed(input.metadata.creator),
      boxed(input.metadata.exportDate), {}, centred("(1/1)")],
    [{}, {}, label("Shot name"), {}, boxed(input.metadata.shortName ?? ""), {}, centred("△2")],
    [{}, {}, label("Project Number"), {}, boxed(input.metadata.projectNumber ?? ""), {}, centred("△3")],
    [{}, {}, label("Page name"), {}, boxed("Summary cost"), {}, centred("△4")],
    [],
    [{}, {}, ...[
      "Item", "Model/Part Number", "Discription/Detial", "Suppier", "Brand", "Lead Time",
      "Quote Rev.", "Unit price", "Quantity", "Total (BATH)", "Unit", "Remark",
    ].map(value => ({ value, style: STYLE.columnHead }))],
  ];
  const merges = [...HEADER_MERGES];

  let item = 1;
  for (const category of ERP_COST_CATEGORIES) {
    const categoryRows = input.summary.lines.filter(row => row.erpCategory === category);
    if (!categoryRows.length) continue;
    /* The category names its block from column D, once, down the side of the rows
       it covers — which is why nothing else may be written in that column. */
    const first = rows.length + 1;
    for (const row of categoryRows) {
      rows.push([{}, {},
        { value: item++, style: STYLE.item },
        { value: rows.length + 1 === first ? category : "", style: STYLE.blockName },
        { value: row.description, style: STYLE.description },
        { value: row.supplier ?? "", style: STYLE.text },
        { value: row.brand ?? "", style: STYLE.text },
        { value: row.leadTime ?? "", style: STYLE.text },
        { value: row.quoteRevision ?? "", style: STYLE.text },
        { value: money(row.unitPrice ?? row.amount), style: STYLE.money },
        { value: row.quantity ?? 1, style: STYLE.quantity },
        { value: money(row.amount), style: STYLE.money },
        { value: row.unit ?? "", style: STYLE.text },
        { value: "", style: STYLE.text },
        { value: "", style: STYLE.text },
      ]);
      merges.push(`N${rows.length}:O${rows.length}`);
    }
    if (rows.length > first) merges.push(`D${first}:D${rows.length}`);
  }

  /* The totals sit under Unit price and Total, where the form puts them — not
     across the width of the sheet. */
  const total = (text: string, amount: number, style: number, moneyStyle: number) =>
    rows.push([{}, {}, {}, {}, {}, {}, {}, {}, {}, { value: text, style }, {}, { value: money(amount), style: moneyStyle }]);
  total("Sub Total", input.summary.classifiedTotal, STYLE.totalLabel, STYLE.totalMoney);
  total("Approved Overhead", input.approvedOverhead.amount, STYLE.totalLabel, STYLE.totalMoney);
  total("Grand Total", input.summary.canonicalTotal, STYLE.grandTotalLabel, STYLE.grandTotalMoney);
  return { rows, merges };
}

/** Row heights come from the form: a tall title, a banded header, then the lines. */
const rowHeight = (row: number) => row === 1 ? 54 : row <= 5 ? 20.25 : row === 6 ? 21 : row === 7 ? 27 : row === 8 ? 24 : 18.75;

function worksheetXml({ rows, merges }: Sheet): string {
  const content = rows.map((row, rowIndex) => {
    const cells = row.map((cell, columnIndex) => {
      const ref = `${columnName(columnIndex + 1)}${rowIndex + 1}`;
      const style = cell.style ? ` s="${cell.style}"` : "";
      /* A cell with a style but no value still draws its part of the grid: dropping
         it would leave a hole in the ruled box the form is made of. */
      if (cell.value === undefined || cell.value === "") return cell.style === undefined ? "" : `<c r="${ref}"${style}/>`;
      return typeof cell.value === "number"
        ? `<c r="${ref}"${style}><v>${cell.value}</v></c>`
        : `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${escapeXml(cell.value)}</t></is></c>`;
    }).join("");
    return `<row r="${rowIndex + 1}" ht="${rowHeight(rowIndex + 1)}" customHeight="1">${cells}</row>`;
  }).join("");

  const mergeXml = merges.map(ref => `<mergeCell ref="${ref}"/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="8" topLeftCell="C9" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultColWidth="9.125" defaultRowHeight="18"/><cols><col min="1" max="1" width="9.125"/><col min="2" max="2" width="5.875" customWidth="1"/><col min="3" max="3" width="11.875" customWidth="1"/><col min="4" max="4" width="52.625" customWidth="1"/><col min="5" max="5" width="109.625" customWidth="1"/><col min="6" max="6" width="37.375" customWidth="1"/><col min="7" max="7" width="23.125" customWidth="1"/><col min="8" max="8" width="20" customWidth="1"/><col min="9" max="9" width="21.625" customWidth="1"/><col min="10" max="10" width="25.375" customWidth="1"/><col min="11" max="11" width="21.625" customWidth="1"/><col min="12" max="12" width="29.25" customWidth="1"/><col min="13" max="13" width="13.625" customWidth="1"/><col min="14" max="14" width="17.875" customWidth="1"/><col min="15" max="15" width="12" customWidth="1"/></cols><sheetData>${content}</sheetData><autoFilter ref="C8:N8"/><mergeCells count="${merges.length}">${mergeXml}</mergeCells><pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/><pageSetup paperSize="9" scale="20" orientation="portrait"/></worksheet>`;
}

const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;
const rootRelationships = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
const workbookXml = (lastRow: number) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Summary cost" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm.Print_Area" localSheetId="0">'Summary cost'!$C$1:$O$${lastRow}</definedName></definedNames></workbook>`;
const workbookRelationships = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
/** Named so a row says which part of the form it is, not which number a style got. */
const STYLE = {
  title: 1, label: 2, headerValue: 3, headerCentre: 4, headerItalic: 5, columnHead: 6,
  columnHeadMoney: 7, item: 8, description: 9, text: 10, money: 11, quantity: 12,
  blockName: 13, totalLabel: 14, totalMoney: 15, grandTotalLabel: 16, grandTotalMoney: 17,
} as const;

/*
 * Fonts, fills, borders and number formats read out of the team's own workbook.
 * "Nato san " is spelled the way that file spells it, trailing space included:
 * a different name would quietly pick a different typeface.
 */
const FONT = {
  body: `<font><sz val="14"/><color theme="1"/><name val="Nato san "/></font>`,
  bodyBold: `<font><b/><sz val="14"/><color theme="1"/><name val="Nato san "/></font>`,
  title: `<font><b/><i/><sz val="26"/><color theme="0"/><name val="Nato san "/></font>`,
  columnHead: `<font><b/><i/><sz val="18"/><color theme="0"/><name val="Nato san "/></font>`,
  label: `<font><b/><sz val="16"/><color theme="1"/><name val="Nato san "/></font>`,
  header: `<font><sz val="16"/><color theme="1"/><name val="Nato san "/></font>`,
  total: `<font><i/><sz val="16"/><color theme="1"/><name val="Nato san "/></font>`,
};
const ACCOUNTING = `_(* #,##0.00_);_(* \\(#,##0.00\\);_(* &quot;-&quot;??_);_(@_)`;
const ACCOUNTING_WHOLE = `_(* #,##0_);_(* \\(#,##0\\);_(* &quot;-&quot;??_);_(@_)`;

const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="187" formatCode="${ACCOUNTING}"/><numFmt numFmtId="188" formatCode="${ACCOUNTING_WHOLE}"/></numFmts><fonts count="7">${FONT.body}${FONT.bodyBold}${FONT.title}${FONT.columnHead}${FONT.label}${FONT.header}${FONT.total}</fonts><fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF00B050"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFFF00"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFCE4D6"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color indexed="64"/></left><right style="thin"><color indexed="64"/></right><top style="thin"><color indexed="64"/></top><bottom style="thin"><color indexed="64"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="18"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="4" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="5" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf><xf numFmtId="0" fontId="5" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="6" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="187" fontId="3" fillId="2" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="187" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="188" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="top"/></xf><xf numFmtId="0" fontId="6" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf><xf numFmtId="187" fontId="6" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/><xf numFmtId="0" fontId="6" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf><xf numFmtId="187" fontId="6" fillId="4" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

export function buildErpEstimateWorkbook(input: ErpEstimateWorkbookInput): Uint8Array {
  validateErpEstimateWorkbook(input);
  const sheet = worksheetRows(input);
  return zipSync({
    "[Content_Types].xml": strToU8(contentTypes),
    "_rels/.rels": strToU8(rootRelationships),
    "xl/workbook.xml": strToU8(workbookXml(sheet.rows.length)),
    "xl/_rels/workbook.xml.rels": strToU8(workbookRelationships),
    "xl/styles.xml": strToU8(styles),
    "xl/worksheets/sheet1.xml": strToU8(worksheetXml(sheet)),
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
