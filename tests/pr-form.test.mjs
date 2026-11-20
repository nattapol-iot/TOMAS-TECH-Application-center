import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { strFromU8, unzipSync } from "fflate";
import { XMLValidator } from "fast-xml-parser";
import { formatPrFormReport, isPrFormPoNumber, leadDaysOf, parsePrFormFileName, prFormPoState, prFormReport, prFormReportSheets, prFormUnit, readPrForm } from "../lib/pr-form.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const TODAY = new Date("2026-11-20T00:00:00Z");
const column = (index) => { let name = ""; for (let n = index; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name; return name; };
const LINE_HEAD = ["Rev.", "No.", "Item", "Model/Part Number", "Discription", "Material", "Treatment", "Detail", "Quantity", "Total", "Unit", "Brand", "Supplier", "Lead time", "Quotation No.", "Unit price", "Total price", "Unit",
  "Actual cost", "PO Number", "PO status", "Remark"];

/**
 * A PR-Form sheet as the 2026 workbooks have it: the header block from column C, the △ block from H, the estimate at R/S
 * and the line columns from B. `shift` moves everything right, as another drawing of the form does; `mark` changes every
 * part number, so two sheets are not copies of each other.
 */
function formSheet({ shift = 0, estimate = 400, project = "PJ260091", drawing = "MZ08-U001", unit = "MASTER VALVE UNIT", name = "013_MASTER VALVE UNIT", mark = "" } = {}) {
  const cells = {};
  const put = (col, row, value, more = {}) => { if (value !== null && value !== undefined && value !== "") cells[`${column(col + shift)}${row}`] = { value, ...more }; };
  put(3, 1, "PR-Form");
  [["Project Number", project], ["Project Name", "ROBOT HANDLING MACHINE"], ["Custumer Name", "OILES (THAILAND) LTD."], ["Drawing No.", drawing], ["Unit Name", unit], ["Part delivery date", 46305]]
    .forEach(([label, value], index) => { put(3, index + 2, label); put(6, index + 2, value); });
  put(8, 2, "Rev."); put(9, 2, "Discription"); put(12, 2, "Issue by"); put(13, 2, "Issue date");
  put(8, 3, "△1"); put(9, 3, "Request PR."); put(12, 3, "Somchai"); put(13, 3, 46238);
  put(8, 4, "△2"); put(9, 4, "Add cable"); put(12, 4, "Somchai"); put(13, 4, 46251);
  put(8, 5, "△3");
  put(18, 3, "Estimate"); put(19, 3, estimate, { formula: "AG3+AG4" }); put(18, 4, "Actual cost"); put(18, 5, "Remain");
  put(24, 3, "https://example.sharepoint.com/estimate");
  put(32, 3, "ME"); put(33, 3, 300); put(34, 3, "Item 22-30"); put(32, 4, "ME"); put(33, 4, 100); put(34, 4, "Item 24-29");
  LINE_HEAD.forEach((label, index) => put(index + 2, 8, label));
  const line = (row, values) => values.forEach((value, index) => put(index + 2, row, index === 3 && value ? `${value}${mark}` : value));
  //          Rev   No Item  Part          Description  Mat      Treat Detail Qty  Total Unit     Brand  Supplier  Lead     Quote  Price Total Cur    Actual PO                 Status             Remark
  line(9, ["△1", 1, "A", "MANIFOLD-1", "Manifold", "A5052", "-", "-", 1, 2, "Pcs.", "SMC", "Misumi", "7 Day", "Q-1", 100, 200, "THB", 190, "PO-20260800017", "Already Approve", "ITEM 30 F.R.L."]);
  line(10, [null, null, null, "VALVE-1", null, null, null, null, 2, 4, "Pcs.", "SMC", "Misumi", "6W", "Q-1", 50, 200, "THB", 200, "PO-20260800017", "Already Approved", null]);
  line(11, ["△2", 3, "B", "CABLE", "Cable", "-", "-", "-", 10, 10, "Meter", "LAPP", null, "3D", null, null, 0, "THB", null, null, null, null]);
  cells[`${column(20 + shift)}11`] = { value: "#REF!", error: true };
  line(12, ["△2", 4, "C", "BOLT", "Bolt", "-", "-", "-", 5, 5, "Bag", "-", "Shop", "soon", null, 10, 60, "Set", null, "PO-2026090074", "Hold", null]);
  line(13, [null, 5, "D", "NOREV", "No revision", "-", "-", "-", 1, 1, "Pcs.", "-", "Shop", "2 D", null, 5, 5, "THB", 5, null, null, null]);
  line(14, ["△2", 6, "E", "SCREW", "Screw", "-", "-", "-", 20, 20, "Pcs.", "LOCAL", null, null, null, null, 0, null, null, null, "Order Lot", null]);
  line(15, ["△2", 7, "F", "CASE", "Case", "-", "-", "-", 1, 1, "Pcs.", "-", "Shopee", null, null, 30, 30, "THB", 30, "Online", null, null]);
  put(3, 16, 8, { formula: "ROW()-8" }); put(18, 16, 0, { formula: "Q16*K16" });
  put(17, 17, "Summary"); put(18, 17, 495); put(20, 17, 425);
  line(18, ["△1", 9, "Z", "AFTER-SUMMARY", "Not a line", "-", "-", "-", 1, 1, "Pcs.", "-", "Shop", "1 D", null, 1, 1, "THB", 1, null, null, null]);
  return { name, cells };
}

/** The 2025 drawing of the form: header on row 9, no Rev. and no "Total" column, "Total (BATH)", PO Number and PO Status. */
function olderSheet() {
  const cells = {}, put = (ref, value) => { cells[ref] = { value }; };
  put("C2", "Project Number"); put("F2", "PJ250037"); put("C3", "Project Name"); put("F3", "Conveyor"); put("C4", "Custumer Name"); put("F4", "A.N.I");
  ["Item", "Model/Part Number", "Discription", "Suppier", "Brand", "Lead Time", "Quote Rev.", "Unit price", "Quantity", "Total (BATH)", "Actual cost", "PO Number", "PO Status", "Part Status", "Unit", "Remark"]
    .forEach((label, index) => put(`${column(index + 3)}9`, label));
  [[1, "SHAFT-10", "Shaft", "Misumi", "Misumi", "10-14 Day", "Q9", 250, 4, 1000, 1000, "PO-20250900012", "Already approved", "", "Pcs"],
    [2, "PLATE-3", "Plate", "Local", "FAB", "Same Day", "", 500, 1, 500, null, "", "Wait Approve", "", "Pcs"]]
    .forEach((values, index) => values.forEach((value, at) => { if (value !== "" && value !== null) put(`${column(at + 3)}${10 + index * 4}`, value); }));
  // The next page repeats its heading and the column labels between the two lines; they ask for nothing.
  put("E11", "Vision camera (IV4)"); put("E12", "PJ250037"); put("D13", "Model/Part Number"); put("E13", "Discription"); put("R13", "Remark");
  return { name: "004_COST_ME", cells };
}
const summarySheet = { name: "Summary", cells: Object.fromEntries(LINE_HEAD.map((label, index) => [`${column(index + 2)}8`, { value: label }]).concat([["E9", { value: "KV-8000" }], ["J9", { value: 1 }], ["K9", { value: 1 }], ["Q9", { value: 100 }]])) };
const brokenSummary = { name: "001_Summary cost", cells: { A1: { value: "ESTIMATE COST" }, B3: { value: "#REF!", error: true }, C3: { value: "#REF!", error: true } } };
const FILE = "PR-[ME]-[PJ260091]-20260813-013_MZ08-U001-MASTER VALVE UNIT.xlsx";
const codes = (file, code) => file.issues.filter((issue) => issue.code === code);
const named = (name) => { const read = parsePrFormFileName(name, TODAY); return read && [read.discipline, read.tag, read.projectNumber, read.date, read.sequence, read.drawingNo, read.unitName, read.confirmCopy, read.standard]; };

test("a PR-Form file name gives its discipline, project, date, number, drawing and unit name", () => {
  assert.deepEqual(named(FILE), ["ME", "", "PJ260091", "2026-08-13", "013", "MZ08-U001", "MASTER VALVE UNIT", false, true]);
  assert.deepEqual(named("C:\\sync\\PR-[EE]-[PJ260091]-20260717-001.xlsx"), ["EE", "", "PJ260091", "2026-07-17", "001", "", "", false, true]);
});

test("a file name written loosely is still read, and said to be non-standard", () => {
  for (const name of ["PR-ME-PJ260091-20260813-13 MZ08-U001  MASTER VALVE UNIT.xlsx", "PR_[ME]_[PJ260091]_20260813_013_MZ08-U001-MASTER VALVE UNIT.xlsx", "pr [me] [pj260091] 20260813 013 - MZ08-U001 - MASTER VALVE UNIT.xlsx",
    "PR-[ME]-[PJ260091]-20260813-013_ MZ08-U001- MASTER VALVE UNIT.xlsx"]) assert.deepEqual(named(name), ["ME", "", "PJ260091", "2026-08-13", "013", "MZ08-U001", "MASTER VALVE UNIT", false, false], name);
  assert.equal(parsePrFormFileName("Quotation OTP26080013-R1.xlsx", TODAY), null);
  assert.equal(parsePrFormFileName("PR-[Customer]-[PJ_Number]-YYYYMMDD-001.xlsx", TODAY), null);
});

test("older names: ddmmyyyy, ddmmyy and yymmdd dates, a customer where the discipline goes, and _Confirm copies", () => {
  assert.deepEqual(named("PR-ME_PJ250037-09092025-001.xlsx").slice(0, 5), ["ME", "", "PJ250037", "2025-09-09", "001"]);
  assert.deepEqual(named("PR-EE-PJ250039-110925-001.xlsx").slice(0, 5), ["EE", "", "PJ250039", "2025-09-11", "001"]);
  assert.equal(named("PR-[EE]-[PJ260036]-031026-001.xlsx")[3], "2026-10-03");
  // 250829 read as ddmmyy is 2029-08-25, past a year from today, so it is yymmdd; 260707 as ddmmyy is 2007, before 2020.
  assert.equal(named("PR-EE-PJ00001-250829-001.xlsx")[3], "2025-08-29");
  assert.equal(named("PR-EE-PJ250037-260707-001.xlsx")[3], "2026-07-07");
  assert.deepEqual(named("PR-[SAMTECH]-[PJ250076]-202260424-001.xlsx").slice(0, 4), ["", "SAMTECH", "PJ250076", null]);
  assert.deepEqual(named("PR-EE-PJ00001-250829-001_Confrim.xlsx").slice(5), ["", "", true, false]);
  assert.deepEqual(named("PR-EE-PJ250052-150925-001_Confirm.xlsx").slice(3), ["2025-09-15", "001", "", "", true, false]);
  assert.deepEqual(named("PR-IoT-PJ00000-241025-001.xlsx").slice(0, 4), ["IOT", "", "PJ00000", "2025-10-24"]);
});

test("lead times, units of measure, PO numbers and PO statuses are read as the forms write them", () => {
  assert.deepEqual(["7 Day", "5 day", "39 D", "3D", "6W", "2 weeks", "1 month", "10-14 Day", "7-10Day", "1.5-2 M", "Same Day", "soon", "-", ""].map(leadDaysOf), [7, 5, 39, 3, 42, 14, 30, 14, 10, 60, 0, null, null, null]);
  assert.deepEqual(["Pcs.", "pcs", "Pack", "Meter", "Job", "SET", "Lots", "Bag", "Ench"].map(prFormUnit), ["Pcs", "Pcs", "Pack", "Meter", "Job", "Set", "Lot", null, null]);
  assert.equal(isPrFormPoNumber("PO-20260800063"), true);
  assert.equal(isPrFormPoNumber("PO-2026090074"), false);
  assert.deepEqual(["Already Approve", "already approved", "Already Apporve", "Already Order", "Wait Approve", "Wait Approved", "Order LOT", "Order Lots", "OrderMastervalve", "EE ORDER",
    "STOCK PJ260113", "Cancelled PO", "Reject", "Hold", ""].map(prFormPoState),
    ["Approved", "Approved", "Approved", "Ordered", "Pending", "Pending", "Bundled", "Bundled", "Bundled", "Bundled", "Stock", "Cancelled", "Rejected", "Unknown", ""]);
});

test("the form sheet is read by its labels: header block, estimate, rounds and lines up to the Summary row", () => {
  const file = readPrForm([brokenSummary, summarySheet, formSheet()], FILE, TODAY);
  assert.equal(file.forms.length, 1);
  const [form] = file.forms;
  assert.deepEqual([form.sheet, form.discipline, form.projectNumber, form.projectName, form.customer, form.drawingNo, form.unitName, form.deliveryDate],
    ["013_MASTER VALVE UNIT", "ME", "PJ260091", "ROBOT HANDLING MACHINE", "OILES (THAILAND) LTD.", "MZ08-U001", "MASTER VALVE UNIT", "2026-10-10"]);
  assert.equal(form.estimate, 400);
  assert.deepEqual(form.estimateParts, [{ discipline: "ME", amount: 300, itemRef: "Item 22-30" }, { discipline: "ME", amount: 100, itemRef: "Item 24-29" }]);
  assert.equal(form.estimateLink, "https://example.sharepoint.com/estimate");
  assert.deepEqual(form.lines.map((line) => line.partNumber), ["MANIFOLD-1", "VALVE-1", "CABLE", "BOLT", "NOREV", "SCREW", "CASE"]);
  assert.deepEqual(form.totals, { lines: 7, children: 1, totalPrice: 495, actualCost: 425, committed: 485, unpriced: 1, withPo: 3 });
  const [first] = form.lines;
  assert.deepEqual([first.revision, first.no, first.item, first.description, first.material, first.treatment, first.quantityPerSet, first.quantity, first.unit, first.brand, first.supplier, first.leadDays, first.quotation,
    first.unitPrice, first.totalPrice, first.currency, first.actualCost, first.poNumber, first.poState, first.remark],
    ["△1", 1, "A", "Manifold", "A5052", "", 1, 2, "Pcs", "SMC", "Misumi", 7, "Q-1", 100, 200, "THB", 190, "PO-20260800017", "Approved", "ITEM 30 F.R.L."]);
});

test("a row with a part number and nothing that names it is a part of the line above, in the same round", () => {
  const [form] = readPrForm([formSheet()], FILE, TODAY).forms;
  const child = form.lines[1];
  assert.deepEqual([child.isChild, child.parentRow, child.revision, child.quantity, child.leadDays, child.poState], [true, 9, "△1", 4, 42, "Approved"]);
  assert.deepEqual(form.lines.filter((line) => !line.isChild).map((line) => line.parentRow), [null, null, null, null, null, null]);
});

test("each revision is one request round, with who issued it and when; a line with no Rev. joins the round above it", () => {
  const [form] = readPrForm([formSheet()], FILE, TODAY).forms;
  assert.equal(form.lines[4].revision, "△2");
  assert.deepEqual(form.rounds, [
    { revision: "△1", description: "Request PR.", issuedBy: "Somchai", issuedDate: "2026-08-04", lines: 2, totalPrice: 400, actualCost: 390 },
    { revision: "△2", description: "Add cable", issuedBy: "Somchai", issuedDate: "2026-08-17", lines: 5, totalPrice: 95, actualCost: 35 },
  ]);
});

test("what is wrong with a form is listed, not thrown", () => {
  const file = readPrForm([formSheet()], FILE, TODAY);
  const rowsOf = (code) => codes(file, code).map((issue) => issue.row);
  assert.deepEqual(rowsOf("ref_error"), [11]);
  assert.deepEqual(rowsOf("missing_price"), [11]);
  assert.deepEqual(rowsOf("missing_supplier"), [11]);
  assert.deepEqual(rowsOf("unknown_unit"), [12]);
  assert.deepEqual(rowsOf("total_mismatch"), [12]);
  assert.deepEqual(rowsOf("malformed_po"), [12]);
  assert.deepEqual(rowsOf("unknown_po_status"), [12]);
  assert.deepEqual(rowsOf("missing_actual"), [12]);
  assert.deepEqual(rowsOf("bad_currency"), [12]);
  assert.match(codes(file, "bad_currency")[0].message, /1 priced line says "Set" in the currency column, not a currency; taken as THB \(row 12\)/);
  assert.deepEqual(codes(file, "missing_revision").map((issue) => [issue.row, issue.message]), [[13, "1 line has no Rev. of its own; it is taken as the round of the line above (row 13)."]]);
  assert.match(codes(file, "over_budget")[0].message, /Over budget by THB 85\.00: estimate 400\.00, committed 485\.00/);
  assert.deepEqual(codes(file, "name_format"), []);
  assert.deepEqual(codes(file, "name_mismatch"), []);
});

test("a line bought inside another order needs no price of its own, and a shop name in the PO column is not a PO number", () => {
  const [form] = readPrForm([formSheet()], FILE, TODAY).forms, screw = form.lines[5], bought = form.lines[6];
  assert.deepEqual([screw.poState, screw.unitPrice], ["Bundled", null]);
  assert.deepEqual([bought.poNumber, bought.poNote, bought.poState], ["", "Online", ""]);
  assert.equal(prFormPoState("Online"), "Unknown");
  const file = readPrForm([formSheet()], FILE, TODAY);
  assert.deepEqual(file.issues.filter((issue) => issue.row === 14 || issue.row === 15), []);
});

test("over budget says both figures when the actual cost alone is over too", () => {
  const file = readPrForm([formSheet({ estimate: 410 })], FILE, TODAY);
  assert.match(codes(file, "over_budget")[0].message, /Over budget by THB 75\.00.*On actual cost alone, as the form's Remain counts: over by 15\.00\./);
  assert.equal(codes(readPrForm([formSheet({ estimate: 1000 })], FILE, TODAY), "over_budget").length, 0);
  assert.equal(codes(readPrForm([formSheet({ estimate: 0 })], FILE, TODAY), "no_estimate").length, 1);
});

test("another drawing of the form, one column to the right, reads the same", () => {
  const now = readPrForm([formSheet()], FILE, TODAY).forms[0], shifted = readPrForm([formSheet({ shift: 1 })], FILE, TODAY).forms[0];
  assert.deepEqual(shifted.lines, now.lines);
  assert.deepEqual(shifted.rounds, now.rounds);
  assert.deepEqual([shifted.projectNumber, shifted.drawingNo, shifted.estimate, shifted.estimateParts.length], [now.projectNumber, now.drawingNo, now.estimate, 2]);
});

test("the 2025 form with no Rev. column is read as one request, its page headings left out, with its discipline from the folder", () => {
  const file = readPrForm([olderSheet()], "ME-PJ250037/PR-[A.N.I]-[PJ250037]-09092025-001.xlsx", TODAY);
  const [form] = file.forms;
  assert.deepEqual([form.discipline, form.projectNumber, form.customer], ["ME", "PJ250037", "A.N.I"]);
  assert.deepEqual(form.lines.map((line) => [line.revision, line.partNumber, line.quantity, line.unitPrice, line.totalPrice, line.actualCost, line.poNumber, line.poState, line.leadDays, line.quotation]),
    [["", "SHAFT-10", 4, 250, 1000, 1000, "PO-20250900012", "Approved", 14, "Q9"], ["", "PLATE-3", 1, 500, 500, null, "", "Pending", 0, ""]]);
  assert.deepEqual(form.rounds.map((round) => [round.revision, round.lines]), [["", 2]]);
  assert.deepEqual(codes(file, "missing_revision").map((issue) => issue.message), ["No line names a Rev.; all 2 are taken as one request."]);
  assert.equal(codes(file, "missing_actual").length, 0);
});

test("a workbook with no PR-Form sheet, a wrong name, two projects or a name that disagrees with the form is reported", () => {
  const none = readPrForm([brokenSummary, summarySheet], FILE, TODAY);
  assert.deepEqual([none.forms.length, codes(none, "no_form").length], [0, 1]);
  assert.equal(codes(readPrForm([formSheet()], "request.xlsx", TODAY), "name_format").length, 1);
  const other = readPrForm([formSheet()], "PR-[ME]-[PJ260092]-20260813-013_MZ09-U001-MASTER VALVE UNIT.xlsx", TODAY);
  assert.deepEqual(codes(other, "name_mismatch").map((issue) => issue.message), ["The file is named for PJ260092 but the form says project PJ260091.", "The file is named for drawing MZ09-U001 but the form says MZ08-U001."]);
  const two = readPrForm([formSheet({ project: "PJ260083 ,PJ260084" })], "PR-[ME]-[PJ260083]-20260813-001.xlsx", TODAY);
  assert.equal(two.forms[0].projectNumber, "PJ260083");
  assert.match(codes(two, "multiple_projects")[0].message, /names 2 projects \(PJ260083 ,PJ260084\); it is counted under PJ260083/);
});

test("the dry-run report adds a project up, and counts an estimate that every form of a discipline repeats once", () => {
  const report = prFormReport([
    readPrForm([formSheet()], FILE, TODAY),
    readPrForm([formSheet({ drawing: "MZ01-U001", unit: "WIRE DUCT UNIT", name: "012_WIRE DUCT UNIT", mark: "-B" })], "PR-[ME]-[PJ260091]-20260813-012_MZ01-U001-WIRE DUCT UNIT.xlsx", TODAY),
    readPrForm([formSheet({ estimate: 271, drawing: "-", unit: "-", name: "001_EE", mark: "-E" })], "PR-[EE]-[PJ260091]-20260717-001.xlsx", TODAY),
    { path: "PR-[SW]-[PJ260091]-20260901-001.xlsx", error: "This is not an Excel workbook." },
  ]);
  assert.deepEqual([report.files, report.unreadable.length, report.forms.length, report.forms.filter((form) => form.copyOf).length], [4, 1, 3, 0]);
  const [project] = report.projects;
  assert.deepEqual([project.projectNumber, project.files, project.forms, project.units, project.requests, project.lines, project.estimate, project.totalPrice, project.actualCost, project.committed],
    ["PJ260091", 3, 3, 3, 6, 21, 671, 1485, 1275, 1455]);
  assert.deepEqual(project.disciplines.map((item) => [item.discipline, item.forms, item.estimate, item.sharedEstimate, item.committed]), [["EE", 1, 271, false, 485], ["ME", 2, 400, true, 970]]);
  assert.equal(report.issueCounts.over_budget, 3);
  const text = formatPrFormReport(report, 2);
  assert.match(text, /^PR-Form import: dry run\. Nothing was written\./);
  assert.match(text, /ME: forms 2, estimate 400\.00 \(the same figure on several forms, counted once\)/);
  assert.match(text, /\.\.\. and \d+ more/);
  assert.match(text, /\[unreadable\] This is not an Excel workbook\./);
});

test("a form copied into a later file, or a later file that adds to it, is counted once", () => {
  const later = readPrForm([formSheet()], "PR-[ME]-[PJ260091]-20260901-014_MZ08-U001-MASTER VALVE UNIT.xlsx", TODAY);
  const first = readPrForm([formSheet()], FILE, TODAY);
  const holder = readPrForm([formSheet({ name: "001_ME", mark: "-H" }), formSheet()], "PR-[ME]-[PJ260091]-20260717-001.xlsx", TODAY);
  const other = readPrForm([formSheet({ project: "PJ260092" })], "PR-[ME]-[PJ260092]-20260813-001.xlsx", TODAY);
  const report = prFormReport([first, later, holder, other]);
  const copies = report.forms.filter((form) => form.copyOf).map((form) => [form.path, form.sheet, form.copyOf]);
  assert.deepEqual(copies, [
    [FILE, "013_MASTER VALVE UNIT", "PR-[ME]-[PJ260091]-20260901-014_MZ08-U001-MASTER VALVE UNIT.xlsx › 013_MASTER VALVE UNIT"],
    ["PR-[ME]-[PJ260091]-20260717-001.xlsx", "013_MASTER VALVE UNIT", "PR-[ME]-[PJ260091]-20260901-014_MZ08-U001-MASTER VALVE UNIT.xlsx › 013_MASTER VALVE UNIT"],
  ]);
  assert.deepEqual(report.projects.map((project) => [project.projectNumber, project.forms, project.lines]), [["PJ260091", 2, 14], ["PJ260092", 1, 7]]);
  assert.equal(report.issueCounts.duplicate_form, 2);
  assert.match(report.perFile.find((file) => file.path === FILE).issues.at(-1).message, /^A copy of PR-\[ME\]-\[PJ260091\]-20260901-014/);
});

test("the dry run as a workbook to review: projects, forms with an Import column (copies start at N), issues and every line", () => {
  const first = readPrForm([formSheet()], FILE, TODAY), later = readPrForm([formSheet()], "PR-[ME]-[PJ260091]-20260901-014_MZ08-U001-MASTER VALVE UNIT.xlsx", TODAY);
  const report = prFormReport([first, later]);
  const sheets = prFormReportSheets(report, [first, later]);
  assert.deepEqual(sheets.map((sheet) => [sheet.name, sheet.rows.length]), [["Projects", 1], ["Forms", 2], ["Issues", first.issues.length + later.issues.length + 1], ["Lines", 14]]);
  const [projects, forms, issues, lines] = sheets;
  for (const sheet of sheets) assert.ok(sheet.rows.every((row) => row.length === sheet.columns.length), sheet.name);
  assert.deepEqual(projects.rows[0].slice(0, 8), ["PJ260091", "ROBOT HANDLING MACHINE", "OILES (THAILAND) LTD.", 1, 1, 1, 2, 7]);
  assert.deepEqual(forms.columns[0].header, "Import (Y/N)");
  assert.deepEqual(forms.rows.map((row) => [row[0], row[1], row[13] === null]), [["N", FILE, false], [null, "PR-[ME]-[PJ260091]-20260901-014_MZ08-U001-MASTER VALVE UNIT.xlsx", true]]);
  assert.ok(issues.rows.some((row) => row[3] === "duplicate_form"));
  const valve = lines.rows.find((row) => row[8] === "VALVE-1");
  assert.deepEqual([valve[4], valve[14], valve[27], valve[28]], ["△1", 4, "Approved", 9]);
  assert.deepEqual(lines.rows.filter((row) => row[30] === "Y").length, 7, "the lines of the copy are marked");
});

test("the dry run only reads: no database, no ERP, no network, and only the report files it is told to write", () => {
  const script = readFileSync(path.join(root, "scripts/pr-form-dry-run.mjs"), "utf8"), reader = readFileSync(path.join(root, "lib/pr-form.ts"), "utf8");
  assert.doesNotMatch(script + reader, /mssql|fetch\(|https?\.request|backend-node|erp-|unlinkSync|rmSync|renameSync|appendFileSync/);
  assert.equal(script.match(/writeFileSync\(/g).length, 2);
  assert.match(script, /if \(jsonPath\) \{ writeFileSync\(jsonPath,/);
  assert.match(script, /if \(xlsxPath\) \{ writeFileSync\(xlsxPath, workbookOf\(/);
  // A report named PR... would be read as a PR-Form by the next run, so it is refused before anything is read.
  const empty = mkdtempSync(path.join(tmpdir(), "pr-form-empty-"));
  try {
    assert.throws(() => execFileSync(process.execPath, [path.join(root, "scripts/pr-form-dry-run.mjs"), empty, "--xlsx", path.join(empty, "PR-review.xlsx")], { cwd: root, stdio: "pipe" }),
      (error) => error.status === 2 && /must not start with PR/.test(String(error.stderr)));
  } finally { rmSync(empty, { recursive: true, force: true }); }
  assert.doesNotMatch(reader, /^import /m);
});

// The acceptance set of the owner's brief (PJ260091, Oiles). The workbooks are real purchasing data and are not in the
// repository, so this runs only on a machine that has them in the project folder.
const samples = ["PR-[EE]-[PJ260091]-20260717-001.xlsx", "PR-[ME]-[PJ260091]-20260813-012_MZ01-U001-WIRE DUCT UNIT.xlsx", "PR-[ME]-[PJ260091]-20260813-013_MZ08-U001-MASTER VALVE UNIT.xlsx"].map((name) => path.join(root, name));
test("PJ260091's own workbooks give the figures on the forms", { skip: samples.every((file) => existsSync(file)) ? false : "the sample workbooks are not on this machine" }, () => {
  const folder = mkdtempSync(path.join(tmpdir(), "pr-form-")), json = path.join(folder, "report.json"), xlsx = path.join(folder, "review.xlsx");
  try {
    const printed = execFileSync(process.execPath, [path.join(root, "scripts/pr-form-dry-run.mjs"), ...samples, "--json", json, "--xlsx", xlsx], { cwd: root, encoding: "utf8" });
    assert.match(printed, /Nothing was written/);
    const { report, files } = JSON.parse(readFileSync(json, "utf8"));
    assert.deepEqual([report.files, report.unreadable.length, report.forms.length, report.projects.length], [3, 0, 3, 1]);
    const [project] = report.projects;
    assert.deepEqual([project.projectNumber, project.projectName, project.customer], ["PJ260091", "ROBOT HANDLING MACHINE", "OILES (THAILAND) LTD."]);
    const by = Object.fromEntries(report.forms.map((form) => [form.path.slice(0, 31), form]));
    const ee = by["PR-[EE]-[PJ260091]-20260717-001"], valve = by["PR-[ME]-[PJ260091]-20260813-013"], duct = by["PR-[ME]-[PJ260091]-20260813-012"];
    assert.deepEqual([ee.discipline, ee.estimate, ee.totalPrice, ee.actualCost, ee.rounds, ee.copyOf], ["EE", 271000, 285982, 284618, 5, null]);
    const eeIssues = report.perFile.find((file) => file.path.startsWith("PR-[EE]")).issues;
    assert.match(eeIssues.find((issue) => issue.code === "over_budget").message, /Over budget by THB 14,982\.00.*over by 13,618\.00\./);
    assert.deepEqual([valve.estimate, valve.totalPrice, valve.actualCost, valve.drawingNo, valve.unitName, valve.rounds], [947815, 245891.08, 240768.08, "MZ08-U001", "MASTER VALVE UNIT", 2]);
    assert.deepEqual([duct.drawingNo, duct.unitName, duct.rounds], ["MZ01-U001", "WIRE DUCT UNIT", 1]);
    assert.deepEqual(project.disciplines.map((item) => [item.discipline, item.estimate, item.sharedEstimate]), [["EE", 271000, false], ["ME", 947815, true]]);
    assert.equal(files.find((file) => file.fileName.includes("-013_")).forms[0].totals.children > 0, true);
    assert.equal(report.issueCounts.ref_error, undefined);
    // The workbook to review opens as four valid sheets.
    const parts = unzipSync(new Uint8Array(readFileSync(xlsx)));
    for (const [name, bytes] of Object.entries(parts)) assert.equal(XMLValidator.validate(strFromU8(bytes)), true, name);
    assert.deepEqual([...strFromU8(parts["xl/workbook.xml"]).matchAll(/<sheet name="([^"]+)"/g)].map((match) => match[1]), ["Projects", "Forms", "Issues", "Lines"]);
    assert.match(strFromU8(parts["xl/worksheets/sheet4.xml"]), /MZ01-U001-001/);
  } finally { rmSync(folder, { recursive: true, force: true }); }
});
