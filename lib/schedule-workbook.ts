import { strToU8, zipSync } from "fflate";

/*
 * A project schedule as an .xlsx, laid out like the Project Schedule table: one row per
 * schedule row in WBS order, phases in bold, tasks indented under them. Dates are real
 * Excel dates and figures are numbers, so the sheet can be sorted, filtered and summed.
 * Built by hand like the ERP workbook: no spreadsheet library ships to the browser.
 */

export type ScheduleWorkbookRow = {
  wbs: string; depth: number; kind: string; name: string; visibility: string;
  planStart: string | null; planFinish: string | null; workDays: number; pics: string;
  planManDays: number; actualManDays: number; percentComplete: number; status: string;
  actualStart: string | null; actualFinish: string | null; forecastFinish: string | null; remark: string | null;
};

export type ScheduleWorkbookInput = {
  projectNo: string; projectName: string; exportedOn: string;
  planStart: string | null; planFinish: string | null; percentComplete: number;
  /** Column headings and the few fixed words, in the reader's language. */
  labels: {
    title: string; project: string; exported: string; planPeriod: string; progress: string;
    columns: [string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string];
  };
  rows: ScheduleWorkbookRow[];
};

const HEADER_ROW = 5;
const COLUMN_WIDTHS = [8, 46, 9, 11, 12, 12, 10, 28, 11, 11, 11, 13, 12, 12, 13, 36];

const STYLE = {
  title: 1, meta: 2, header: 3, text: 4, textBold: 5, date: 6, decimal: 7, percent: 8,
  indent1: 9, indent2: 10, indent3: 11, indent4: 12, whole: 13, wrap: 14,
} as const;

// Control characters other than tab and line breaks cannot be carried by XML 1.0 at all.
const xmlSafe = (value: string) => Array.from(value).filter((char) => char.charCodeAt(0) >= 0x20 || char === "\t" || char === "\n" || char === "\r").join("");
const escapeXml = (value: string) => xmlSafe(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]!);
const columnName = (index: number) => {
  let name = ""; let rest = index;
  while (rest > 0) { const remainder = (rest - 1) % 26; name = String.fromCharCode(65 + remainder) + name; rest = Math.floor((rest - 1) / 26); }
  return name;
};

/** Days since 1899-12-30, the serial Excel reads as a date. */
export function excelDate(iso: string | null): number | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
  return Math.round((Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) - Date.UTC(1899, 11, 30)) / 86_400_000);
}

type Cell = { value?: string | number | null; style: number };

function nameStyle(row: ScheduleWorkbookRow): number {
  if (row.kind === "phase") return STYLE.textBold;
  const depth = Math.min(4, Math.max(0, row.depth));
  return depth === 0 ? STYLE.text : [STYLE.indent1, STYLE.indent2, STYLE.indent3, STYLE.indent4][depth - 1]!;
}

function sheetRows(input: ScheduleWorkbookInput): Cell[][] {
  const period = input.planStart ? `${input.planStart} – ${input.planFinish ?? ""}` : "—";
  const rows: Cell[][] = [
    [{ value: input.labels.title, style: STYLE.title }],
    [{ value: `${input.labels.project}: ${input.projectNo} · ${input.projectName}`, style: STYLE.meta }],
    [{ value: `${input.labels.exported}: ${input.exportedOn} · ${input.labels.planPeriod}: ${period} · ${input.labels.progress}: ${Math.round(input.percentComplete)}%`, style: STYLE.meta }],
    [],
    input.labels.columns.map((value) => ({ value, style: STYLE.header })),
  ];
  for (const row of input.rows) {
    const text = (value: string | null) => ({ value: value ?? "", style: row.kind === "phase" ? STYLE.textBold : STYLE.text });
    const dated = (value: string | null) => ({ value: excelDate(value), style: STYLE.date });
    rows.push([
      text(row.wbs), { value: row.name, style: nameStyle(row) }, text(row.kind), text(row.visibility),
      dated(row.planStart), dated(row.planFinish), { value: row.workDays, style: STYLE.whole }, text(row.pics),
      { value: row.planManDays, style: STYLE.decimal }, { value: row.actualManDays, style: STYLE.decimal },
      { value: row.percentComplete / 100, style: STYLE.percent }, text(row.status),
      dated(row.actualStart), dated(row.actualFinish), dated(row.forecastFinish), { value: row.remark ?? "", style: STYLE.wrap },
    ]);
  }
  return rows;
}

function worksheetXml(rows: Cell[][]): string {
  const lastColumn = columnName(COLUMN_WIDTHS.length);
  const content = rows.map((row, rowIndex) => {
    const cells = row.map((cell, columnIndex) => {
      const ref = `${columnName(columnIndex + 1)}${rowIndex + 1}`;
      if (cell.value === undefined || cell.value === null || cell.value === "") return `<c r="${ref}" s="${cell.style}"/>`;
      return typeof cell.value === "number"
        ? `<c r="${ref}" s="${cell.style}"><v>${cell.value}</v></c>`
        : `<c r="${ref}" s="${cell.style}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(cell.value)}</t></is></c>`;
    }).join("");
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join("");
  const columns = COLUMN_WIDTHS.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("");
  const filter = rows.length > HEADER_ROW ? `<autoFilter ref="A${HEADER_ROW}:${lastColumn}${rows.length}"/>` : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
    + `<sheetViews><sheetView workbookViewId="0"><pane xSplit="2" ySplit="${HEADER_ROW}" topLeftCell="C${HEADER_ROW + 1}" activePane="bottomRight" state="frozen"/></sheetView></sheetViews>`
    + `<sheetFormatPr defaultRowHeight="18"/><cols>${columns}</cols><sheetData>${content}</sheetData>${filter}`
    + `<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`;
}

const border = `<border><left style="thin"><color rgb="FFD0D5DD"/></left><right style="thin"><color rgb="FFD0D5DD"/></right><top style="thin"><color rgb="FFD0D5DD"/></top><bottom style="thin"><color rgb="FFD0D5DD"/></bottom><diagonal/></border>`;
const xf = (font: number, fill: number, borderId: number, numFmt = 0, alignment = "") =>
  `<xf numFmtId="${numFmt}" fontId="${font}" fillId="${fill}" borderId="${borderId}" xfId="0"${numFmt ? ` applyNumberFormat="1"` : ""} applyFont="1" applyFill="1" applyBorder="1"${alignment ? ` applyAlignment="1">${alignment}</xf>` : "/>"}`;
const indent = (level: number) => `<alignment vertical="center" indent="${level}"/>`;
const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
  + `<numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts>`
  + `<fonts count="4"><font><sz val="11"/><name val="Tahoma"/></font><font><b/><sz val="16"/><name val="Tahoma"/></font><font><b/><sz val="11"/><name val="Tahoma"/></font><font><sz val="10"/><color rgb="FF667085"/><name val="Tahoma"/></font></fonts>`
  + `<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEEF2F6"/><bgColor indexed="64"/></patternFill></fill></fills>`
  + `<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>${border}</borders>`
  + `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>`
  + `<cellXfs count="15"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>`
  + xf(1, 0, 0) + xf(3, 0, 0) + xf(2, 2, 1, 0, `<alignment vertical="center" wrapText="1"/>`)
  + xf(0, 0, 1, 0, `<alignment vertical="center"/>`) + xf(2, 0, 1, 0, `<alignment vertical="center"/>`)
  + xf(0, 0, 1, 164) + xf(0, 0, 1, 2) + xf(0, 0, 1, 9)
  + xf(0, 0, 1, 0, indent(1)) + xf(0, 0, 1, 0, indent(2)) + xf(0, 0, 1, 0, indent(3)) + xf(0, 0, 1, 0, indent(4))
  + xf(0, 0, 1, 1) + xf(0, 0, 1, 0, `<alignment vertical="top" wrapText="1"/>`)
  + `</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;
const rootRelationships = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
const workbookXml = (lastRow: number) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Schedule" sheetId="1" r:id="rId1"/></sheets>`
  + (lastRow > HEADER_ROW ? `<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">Schedule!$A$${HEADER_ROW}:$${columnName(COLUMN_WIDTHS.length)}$${lastRow}</definedName></definedNames>` : "")
  + `</workbook>`;
const workbookRelationships = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

export function buildScheduleWorkbook(input: ScheduleWorkbookInput): Uint8Array {
  const rows = sheetRows(input);
  return zipSync({
    "[Content_Types].xml": strToU8(contentTypes),
    "_rels/.rels": strToU8(rootRelationships),
    "xl/workbook.xml": strToU8(workbookXml(rows.length)),
    "xl/_rels/workbook.xml.rels": strToU8(workbookRelationships),
    "xl/styles.xml": strToU8(styles),
    "xl/worksheets/sheet1.xml": strToU8(worksheetXml(rows)),
  });
}

/** A file name Windows and macOS both accept: the project number and the export date. */
export const scheduleWorkbookName = (projectNo: string, exportedOn: string) =>
  `${projectNo.replace(/[\\/:*?"<>|\s]+/g, "-")}_schedule_${exportedOn}.xlsx`;
