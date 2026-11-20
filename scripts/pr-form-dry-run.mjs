// Dry run of the legacy PR-Form import: walks a folder, reads every PR-Form workbook under it and prints what an import
// would bring in (projects, requests, lines, totals) and what is wrong with each file. It changes nothing it reads, and it
// talks to no database and no ERP. The only files it can create are the reports named with --json and --xlsx.
//
//   node scripts/pr-form-dry-run.mjs "<folder or .xlsx>" [more folders or files] [--json report.json] [--xlsx review.xlsx] [--issues 40]
//
// --xlsx writes the report as a workbook to review: Projects, Forms (with an Import column to fill in), Issues and Lines.
//
// Example: the SharePoint library synced to this PC,
//   node scripts/pr-form-dry-run.mjs "C:\Users\<you>\<company>\Purchase - PR-Requests\PR-Request 2026"
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { XMLParser } from "fast-xml-parser";
import { formatPrFormReport, prFormReport, prFormReportSheets, readPrForm } from "../lib/pr-form.ts";

const args = process.argv.slice(2);
const option = (name) => { const at = args.indexOf(name); if (at < 0) return null; const [, value] = args.splice(at, 2); return value ?? null; };
const jsonPath = option("--json"), xlsxPath = option("--xlsx"), issues = Number(option("--issues") ?? 12);
if (!args.length) { console.error('Usage: node scripts/pr-form-dry-run.mjs "<folder or .xlsx>" [--json report.json] [--xlsx review.xlsx] [--issues 40]'); process.exit(2); }
for (const output of [jsonPath, xlsxPath]) if (output && /^PR[\s_\-[]/i.test(path.basename(output))) { console.error("A report file name must not start with PR: the next run would read it as a PR-Form."); process.exit(2); }

/**
 * Every workbook under a folder whose name starts with PR: the form files, not the quotations and drawings beside them.
 * Excel's own lock files (~$...) and the blank template (named with "[PJ_Number]" and "YYYYMMDD") are left out.
 */
let templates = 0;
function workbooks(target) {
  const info = statSync(target);
  if (info.isFile()) return /\.xlsx$/i.test(target) ? [target] : [];
  return readdirSync(target, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(target, entry.name);
    if (entry.isDirectory()) return workbooks(full);
    if (!/^PR[\s_\-[]/i.test(entry.name) || !/\.xlsx$/i.test(entry.name) || entry.name.startsWith("~$")) return [];
    if (/YYYYMMDD|PJ_Number/i.test(entry.name)) { templates += 1; return []; }
    return [full];
  });
}

const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: false, parseAttributeValue: false, trimValues: false });
const list = (value) => Array.isArray(value) ? value : value ? [value] : [];
const text = (value) => value == null ? "" : typeof value === "object" ? text(value["#text"]) : String(value);
const rich = (value) => value?.r ? list(value.r).map((run) => text(run.t)).join("") : text(value?.t);

/** The sheets of a workbook as cells by address, with each formula's last calculated value. */
function sheetsOf(file) {
  const bytes = new Uint8Array(readFileSync(file));
  if (bytes.length > 20 * 1024 * 1024) throw new Error("The file is larger than 20 MB.");
  let expanded = 0;
  const archive = unzipSync(bytes, { filter: (entry) => { expanded += entry.originalSize; if (expanded > 80 * 1024 * 1024) throw new Error("The workbook is too large once unpacked.");
    return /^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/[^/]+\.xml)$/.test(entry.name); } });
  const xml = (name) => { if (!archive[name]) return {}; const raw = strFromU8(archive[name]); if (/<!DOCTYPE|<!ENTITY/i.test(raw)) throw new Error("The workbook's XML is not of a supported kind."); return parser.parse(raw); };
  if (!archive["xl/workbook.xml"]) throw new Error("This is not an Excel workbook.");
  const shared = list(xml("xl/sharedStrings.xml").sst?.si).map(rich);
  const rels = list(xml("xl/_rels/workbook.xml.rels").Relationships?.Relationship);
  return list(xml("xl/workbook.xml").workbook?.sheets?.sheet).map((sheet) => {
    const rel = rels.find((item) => item["@_Id"] === sheet["@_r:id"]), target = text(rel?.["@_Target"]).replace(/^\//, "");
    const cells = {};
    for (const row of list(xml(target.startsWith("xl/") ? target : `xl/${target}`).worksheet?.sheetData?.row)) for (const cell of list(row.c)) {
      const type = text(cell["@_t"]), raw = text(cell.v);
      const value = type === "s" ? shared[Number(raw)] ?? "" : type === "inlineStr" ? rich(cell.is) : raw !== "" && type !== "e" && type !== "str" && Number.isFinite(Number(raw)) ? Number(raw) : raw;
      if (value !== "" || type === "e") cells[text(cell["@_r"])] = { value, ...(cell.f !== undefined ? { formula: text(cell.f) } : {}), ...(type === "e" ? { error: true } : {}) };
    }
    return { name: text(sheet["@_name"]), cells };
  });
}

// Each file is named by its path under the folder given, so two files of the same name in different folders stay apart.
const files = args.flatMap((target) => { const root = path.resolve(target), single = statSync(root).isFile();
  return workbooks(root).map((file) => ({ file, shown: (single ? path.basename(file) : path.relative(root, file)).split(path.sep).join("/") })); }).sort((a, b) => a.shown.localeCompare(b.shown));
const read = files.map(({ file, shown }) => { try { return readPrForm(sheetsOf(file), shown); } catch (error) { return { path: shown, error: error instanceof Error ? error.message : String(error) }; } });
const report = prFormReport(read);
console.log(formatPrFormReport(report, Number.isFinite(issues) && issues > 0 ? issues : 12));
if (templates) console.log(`\nBlank templates left out: ${templates}`);
if (jsonPath) { writeFileSync(jsonPath, JSON.stringify({ report, files: read }, null, 2)); console.log(`\nJSON report: ${path.resolve(jsonPath)}`); }
if (xlsxPath) { writeFileSync(xlsxPath, workbookOf(prFormReportSheets(report, read.filter((item) => "forms" in item)))); console.log(`\nWorkbook to review: ${path.resolve(xlsxPath)}`); }

/**
 * Sheets as an .xlsx: inline strings, the header row bold, frozen and filtered, columns at the widths given. Text that is not
 * valid in XML (control characters some forms carry) is dropped.
 */
function workbookOf(sheets) {
  const xml = (value) => String(value).replace(/[^\t\n\r -퟿-�]/gu, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const columnName = (index) => { let name = ""; for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name; return name; };
  const cell = (value, ref, header) => value === null || value === undefined || value === "" ? ""
    : typeof value === "number" && Number.isFinite(value) ? `<c r="${ref}"${header ? ' s="1"' : ""}><v>${value}</v></c>`
      : `<c r="${ref}" t="inlineStr"${header ? ' s="1"' : ""}><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
  const sheetXml = (sheet) => {
    const all = [sheet.columns.map((item) => item.header), ...sheet.rows], last = columnName(sheet.columns.length - 1);
    const body = all.map((row, at) => `<row r="${at + 1}">${row.map((value, col) => cell(value, `${columnName(col)}${at + 1}`, at === 0)).join("")}</row>`).join("");
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
      + `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
      + `<cols>${sheet.columns.map((item, at) => `<col min="${at + 1}" max="${at + 1}" width="${item.width}" customWidth="1"/>`).join("")}</cols>`
      + `<sheetData>${body}</sheetData><autoFilter ref="A1:${last}${Math.max(1, all.length)}"/></worksheet>`;
  };
  const files = {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, at) => `<Override PartName="/xl/worksheets/sheet${at + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((sheet, at) => `<sheet name="${xml(sheet.name)}" sheetId="${at + 1}" r:id="rId${at + 1}"/>`).join("")}</sheets><definedNames>${sheets.map((sheet, at) => `<definedName name="_xlnm._FilterDatabase" localSheetId="${at}" hidden="1">'${xml(sheet.name)}'!$A$1:$${columnName(sheet.columns.length - 1)}$${sheet.rows.length + 1}</definedName>`).join("")}</definedNames></workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, at) => `<Relationship Id="rId${at + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${at + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    "xl/styles.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8F1FA"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf/><xf fontId="1" fillId="2" applyFont="1" applyFill="1"/></cellXfs></styleSheet>`,
  };
  sheets.forEach((sheet, at) => { files[`xl/worksheets/sheet${at + 1}.xml`] = sheetXml(sheet); });
  return zipSync(Object.fromEntries(Object.entries(files).map(([name, text]) => [name, strToU8(text)])));
}
