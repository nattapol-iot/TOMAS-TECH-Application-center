/*
 * A plain workbook of several sheets (task doc 6.4, the CEO summary's Excel): each sheet a header row, frozen, with an
 * autofilter, and rows of text or numbers. Numbers stay numbers so the team can add them up in Excel. Built in the
 * browser with fflate, as the other workbooks in lib/ are.
 */
import { strToU8, zipSync } from "fflate";

export type SimpleColumn = { header: string; width?: number; number?: boolean };
export type SimpleSheet = { name: string; title?: string; columns: SimpleColumn[]; rows: (string | number | null | undefined)[][] };

// Control characters other than tab and line breaks are not allowed in XML; they are dropped.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;
const escapeXml = (text: string) => text.replace(/[<>&'"]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[char]!).replace(CONTROL, "");
export function columnName(index: number): string {
  let name = "";
  for (let rest = index; rest > 0; rest = Math.floor((rest - 1) / 26)) name = String.fromCharCode(65 + ((rest - 1) % 26)) + name;
  return name;
}
/** A sheet name Excel takes: at most 31 characters, none of []:*?/\ and unique in the book. */
export function sheetName(name: string, taken: Set<string>): string {
  const base = (name.replace(/[[\]:*?/\\]/g, " ").trim() || "Sheet").slice(0, 31);
  let candidate = base;
  for (let n = 2; taken.has(candidate.toLowerCase()); n++) candidate = `${base.slice(0, 31 - String(n).length - 1)} ${n}`;
  taken.add(candidate.toLowerCase());
  return candidate;
}

/** Styles: 0 plain, 1 title, 2 header, 3 text, 4 number. */
function sheetXml(sheet: SimpleSheet): string {
  const offset = sheet.title ? 2 : 0;
  const cell = (ref: string, value: string | number | null | undefined, style: number) =>
    value === null || value === undefined || value === ""
      ? `<c r="${ref}" s="${style}"/>`
      : typeof value === "number"
        ? // A number that is not finite (NaN, Infinity) is an empty cell, never text.
          Number.isFinite(value)
          ? `<c r="${ref}" s="${style}"><v>${value}</v></c>`
          : `<c r="${ref}" s="${style}"/>`
        : `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(String(value))}</t></is></c>`;
  const rows: string[] = [];
  if (sheet.title) rows.push(`<row r="1">${cell("A1", sheet.title, 1)}</row>`);
  const headerRow = offset + 1;
  rows.push(`<row r="${headerRow}">${sheet.columns.map((column, index) => cell(`${columnName(index + 1)}${headerRow}`, column.header, 2)).join("")}</row>`);
  sheet.rows.forEach((row, rowIndex) => {
    const at = headerRow + 1 + rowIndex;
    rows.push(`<row r="${at}">${sheet.columns.map((column, index) => cell(`${columnName(index + 1)}${at}`, row[index], column.number ? 4 : 3)).join("")}</row>`);
  });
  const cols = sheet.columns.map((column, index) => `<col min="${index + 1}" max="${index + 1}" width="${column.width ?? 16}" customWidth="1"/>`).join("");
  const last = headerRow + Math.max(sheet.rows.length, 1);
  const end = columnName(Math.max(sheet.columns.length, 1));
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    // Fit to width on print needs fitToPage set on the sheet as well.
    `<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>` +
    `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${headerRow}" topLeftCell="A${headerRow + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="18"/><cols>${cols}</cols><sheetData>${rows.join("")}</sheetData>` +
    `<autoFilter ref="A${headerRow}:${end}${last}"/>` +
    `<pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.3" footer="0.3"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`
  );
}

const styles =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
  `<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.##"/></numFmts>` +
  `<fonts count="3"><font><sz val="10"/><name val="Tahoma"/></font><font><b/><sz val="13"/><name val="Tahoma"/></font><font><b/><sz val="10"/><name val="Tahoma"/></font></fonts>` +
  `<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD9E1F2"/><bgColor indexed="64"/></patternFill></fill></fills>` +
  `<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFBFBFBF"/></left><right style="thin"><color rgb="FFBFBFBF"/></right><top style="thin"><color rgb="FFBFBFBF"/></top><bottom style="thin"><color rgb="FFBFBFBF"/></bottom><diagonal/></border></borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
  `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
  `<xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>` +
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>` +
  `<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>` +
  `</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

export function buildSimpleWorkbook(sheets: readonly SimpleSheet[]): Uint8Array {
  const taken = new Set<string>();
  const named = sheets.map((sheet) => ({ ...sheet, name: sheetName(sheet.name, taken) }));
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
        named.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("") +
        `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    ),
    "_rels/.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ),
    "xl/workbook.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>` +
        named.map((sheet, index) => `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("") +
        `</sheets><definedNames>` +
        named
          .map((sheet, index) => {
            const header = (sheet.title ? 2 : 0) + 1;
            return `<definedName name="_xlnm._FilterDatabase" localSheetId="${index}" hidden="1">'${escapeXml(sheet.name.replace(/'/g, "''"))}'!$A$${header}:$${columnName(Math.max(sheet.columns.length, 1))}$${header + Math.max(sheet.rows.length, 1)}</definedName>`;
          })
          .join("") +
        `</definedNames></workbook>`,
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        named
          .map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`)
          .join("") +
        `<Relationship Id="rId${named.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    ),
    "xl/styles.xml": strToU8(styles),
  };
  named.forEach((sheet, index) => {
    files[`xl/worksheets/sheet${index + 1}.xml`] = strToU8(sheetXml(sheet));
  });
  return zipSync(files);
}
