import { strToU8, zipSync } from "fflate";

/*
 * Customer issue batches as the team's "Issues Table" (.xlsx): three title lines, a two-row heading of 21 columns and
 * one row per issue in the order the customer reported them. The columns the system does not keep (cause, customer
 * confirmation, note) stay empty for the team to fill in Excel. Built by hand like the schedule workbook: no
 * spreadsheet library ships to the browser.
 */

export type IssueWorkbookRow = {
  issuedOn: string | null; category: string; functionName: string; pictures: number; description: string;
  solution: string; inCharge: string; planStart: string | null; planEnd: string | null;
  actualStart: string | null; actualEnd: string | null; status: string;
};

export type IssueWorkbookInput = {
  projectNo: string; projectName: string; customer: string; updatedOn: string;
  /** "n picture(s)" in the reader's language, for the picture column. */
  picturesLabel: (count: number) => string;
  rows: IssueWorkbookRow[];
};

const COLUMNS = 21;
const HEAD_TOP = 4;
const FIRST_ROW = 6;
const COLUMN_WIDTHS = [6, 11, 12, 18, 12, 44, 28, 36, 14, 11, 11, 11, 11, 11, 11, 13, 11, 12, 12, 20, 12];
const STYLE = { title: 1, meta: 2, header: 3, text: 4, center: 5, date: 6 } as const;

const xmlSafe = (value: string) => Array.from(value).filter((char) => char.charCodeAt(0) >= 0x20 || char === "\t" || char === "\n" || char === "\r").join("");
const escapeXml = (value: string) => xmlSafe(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]!);
const columnName = (index: number) => {
  let name = ""; let rest = index;
  while (rest > 0) { const remainder = (rest - 1) % 26; name = String.fromCharCode(65 + remainder) + name; rest = Math.floor((rest - 1) / 26); }
  return name;
};

type Cell = { value?: string | number | null; style: number };

/** Days since 1899-12-30, the serial Excel reads as a date (as lib/schedule-workbook.ts writes them). */
export function excelDate(iso: string | null): number | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
  return Math.round((Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) - Date.UTC(1899, 11, 30)) / 86_400_000);
}

/** The two heading rows: [text, columns it spans, whether it spans both rows]. */
const HEAD: Array<[string, number, boolean]> = [
  ["No.", 1, true], ["Issuing Date", 1, true], ["Issue Category", 1, true], ["Function/Root", 1, true], ["Picture/Screen shot", 1, true],
  ["Description ENG", 1, true], ["Cause of a problem ENG", 1, true], ["Solve problems ENG", 1, true], ["In charge", 1, true],
  ["Cause of a problem T/L", 2, false], ["Problem solving T/L", 4, false], ["Status", 1, true], ["Customer Confirmation", 3, false],
  ["Note", 1, true], ["PIC", 1, true],
];
const SUB_HEAD = ["Plan End", "Actual End", "Plan Start", "Plan End", "Actual Start", "Actual End", "Date", "PIC", "Status"];

function sheet(input: IssueWorkbookInput): { rows: Cell[][]; merges: string[] } {
  const header = (value: string) => ({ value, style: STYLE.header });
  const top: Cell[] = [], sub: Cell[] = [], merges: string[] = [];
  let column = 1, subIndex = 0;
  for (const [text, span, tall] of HEAD) {
    top.push(header(text));
    for (let extra = 1; extra < span; extra++) top.push(header(""));
    if (tall) { sub.push(header("")); merges.push(`${columnName(column)}${HEAD_TOP}:${columnName(column)}${HEAD_TOP + 1}`); }
    else {
      for (let part = 0; part < span; part++) sub.push(header(SUB_HEAD[subIndex++]!));
      merges.push(`${columnName(column)}${HEAD_TOP}:${columnName(column + span - 1)}${HEAD_TOP}`);
    }
    column += span;
  }
  const project = [input.customer, input.projectNo].filter(Boolean).join(" ");
  const rows: Cell[][] = [
    [{ value: `Issues Table for Project : ${project}`, style: STYLE.title }],
    [{ value: `Customer : ${input.customer}`, style: STYLE.meta }],
    [{ value: `Project name : ${input.projectName}`, style: STYLE.meta }, ...Array.from({ length: COLUMNS - 3 }, () => ({ style: STYLE.meta })),
      { value: "Update:", style: STYLE.meta }, { value: excelDate(input.updatedOn), style: STYLE.date }],
    top, sub,
  ];
  merges.push(`A1:${columnName(COLUMNS)}1`, `A2:${columnName(COLUMNS)}2`, `A3:${columnName(COLUMNS - 2)}3`);
  input.rows.forEach((row, index) => {
    const text = (value: string) => ({ value, style: STYLE.text });
    const center = (value: string | number) => ({ value, style: STYLE.center });
    const dated = (value: string | null) => ({ value: excelDate(value), style: STYLE.date });
    rows.push([
      center(index + 1), dated(row.issuedOn), center(row.category), text(row.functionName),
      center(row.pictures ? input.picturesLabel(row.pictures) : ""), text(row.description), text(""), text(row.solution), center(row.inCharge),
      dated(null), dated(null), dated(row.planStart), dated(row.planEnd), dated(row.actualStart), dated(row.actualEnd), center(row.status),
      dated(null), text(""), text(""), text(""), text(""),
    ]);
  });
  return { rows, merges };
}

function worksheetXml({ rows, merges }: { rows: Cell[][]; merges: string[] }): string {
  const content = rows.map((row, rowIndex) => {
    const cells = row.map((cell, columnIndex) => {
      const ref = `${columnName(columnIndex + 1)}${rowIndex + 1}`;
      if (cell.value === undefined || cell.value === null || cell.value === "") return `<c r="${ref}" s="${cell.style}"/>`;
      return typeof cell.value === "number"
        ? `<c r="${ref}" s="${cell.style}"><v>${cell.value}</v></c>`
        : `<c r="${ref}" s="${cell.style}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(cell.value)}</t></is></c>`;
    }).join("");
    const height = rowIndex === HEAD_TOP - 1 || rowIndex === HEAD_TOP ? ` ht="30" customHeight="1"` : "";
    return `<row r="${rowIndex + 1}"${height}>${cells}</row>`;
  }).join("");
  const columns = COLUMN_WIDTHS.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("");
  const last = Math.max(rows.length, FIRST_ROW - 1);
  const filter = rows.length >= FIRST_ROW ? `<autoFilter ref="A${HEAD_TOP + 1}:${columnName(COLUMNS)}${last}"/>` : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
    + `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${FIRST_ROW - 1}" topLeftCell="A${FIRST_ROW}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
    + `<sheetFormatPr defaultRowHeight="18"/><cols>${columns}</cols><sheetData>${content}</sheetData>${filter}`
    + `<mergeCells count="${merges.length}">${merges.map((ref) => `<mergeCell ref="${ref}"/>`).join("")}</mergeCells>`
    + `<pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.3" footer="0.3"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`;
}

const border = `<border><left style="thin"><color rgb="FF8C8C8C"/></left><right style="thin"><color rgb="FF8C8C8C"/></right><top style="thin"><color rgb="FF8C8C8C"/></top><bottom style="thin"><color rgb="FF8C8C8C"/></bottom><diagonal/></border>`;
const xf = (font: number, fill: number, borderId: number, numFmt: number, alignment: string) =>
  `<xf numFmtId="${numFmt}" fontId="${font}" fillId="${fill}" borderId="${borderId}" xfId="0"${numFmt ? ` applyNumberFormat="1"` : ""} applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">${alignment}</xf>`;
const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
  + `<numFmts count="1"><numFmt numFmtId="164" formatCode="d\\-mmm\\-yy"/></numFmts>`
  + `<fonts count="3"><font><sz val="10"/><name val="Tahoma"/></font><font><b/><sz val="14"/><name val="Tahoma"/></font><font><b/><sz val="10"/><name val="Tahoma"/></font></fonts>`
  + `<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD9E1F2"/><bgColor indexed="64"/></patternFill></fill></fills>`
  + `<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>${border}</borders>`
  + `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>`
  + `<cellXfs count="7"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>`
  + xf(1, 0, 0, 0, `<alignment vertical="center"/>`)
  + xf(2, 0, 0, 0, `<alignment vertical="center"/>`)
  + xf(2, 2, 1, 0, `<alignment horizontal="center" vertical="center" wrapText="1"/>`)
  + xf(0, 0, 1, 0, `<alignment vertical="top" wrapText="1"/>`)
  + xf(0, 0, 1, 0, `<alignment horizontal="center" vertical="top" wrapText="1"/>`)
  + xf(0, 0, 1, 164, `<alignment horizontal="center" vertical="top"/>`)
  + `</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;
const rootRelationships = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
const workbookXml = (lastRow: number) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Issues Table" sheetId="1" r:id="rId1"/></sheets>`
  + (lastRow >= FIRST_ROW ? `<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'Issues Table'!$A$${HEAD_TOP + 1}:$${columnName(COLUMNS)}$${lastRow}</definedName></definedNames>` : "")
  + `</workbook>`;
const workbookRelationships = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

export function buildIssueWorkbook(input: IssueWorkbookInput): Uint8Array {
  const built = sheet(input);
  return zipSync({
    "[Content_Types].xml": strToU8(contentTypes),
    "_rels/.rels": strToU8(rootRelationships),
    "xl/workbook.xml": strToU8(workbookXml(built.rows.length)),
    "xl/_rels/workbook.xml.rels": strToU8(workbookRelationships),
    "xl/styles.xml": strToU8(styles),
    "xl/worksheets/sheet1.xml": strToU8(worksheetXml(built)),
  });
}

/** A file name Windows and macOS both accept: the project and the export date. */
export const issueWorkbookName = (project: string, exportedOn: string) =>
  `${(project || "issues").replace(/[\\/:*?"<>|\s]+/g, "-")}_issues_${exportedOn.replace(/-/g, "")}.xlsx`;
