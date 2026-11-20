// Dry run of the legacy PR-Form import: walks a folder, reads every PR-Form workbook under it and prints what an import
// would bring in (projects, requests, lines, totals) and what is wrong with each file. It writes nothing, and it talks to
// no database and no ERP. The only file it can create is the JSON report named with --json.
//
//   node scripts/pr-form-dry-run.mjs "<folder or .xlsx>" [more folders or files] [--json report.json] [--issues 40]
//
// Example: the SharePoint library synced to this PC,
//   node scripts/pr-form-dry-run.mjs "C:\Users\<you>\<company>\Purchase - PR-Requests\PR-Request 2026"
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { strFromU8, unzipSync } from "fflate";
import { XMLParser } from "fast-xml-parser";
import { formatPrFormReport, prFormReport, readPrForm } from "../lib/pr-form.ts";

const args = process.argv.slice(2);
const option = (name) => { const at = args.indexOf(name); if (at < 0) return null; const [, value] = args.splice(at, 2); return value ?? null; };
const jsonPath = option("--json"), issues = Number(option("--issues") ?? 12);
if (!args.length) { console.error('Usage: node scripts/pr-form-dry-run.mjs "<folder or .xlsx>" [--json report.json] [--issues 40]'); process.exit(2); }

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
