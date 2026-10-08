import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { asPlanned, asSubstitute, draftFromBom, draftFromSheet, draftIssues, moduleStatus, payloadLines, PR_TEMPLATE_HEADER_ROW, sheetRows, templateRows } from "../lib/pr-spreadsheet.ts";

const bom = [
  { id: 1, module: "Panel", itemCode: "PLC-01", partNumber: "6ES7-1", description: "PLC controller", brand: "Siemens", unit: "pcs", remaining: 2, estimatedUnitCost: 10000 },
  { id: 2, module: "Panel", itemCode: "CBL-01", partNumber: "", description: "Control cable", brand: "", unit: "m", remaining: 100, estimatedUnitCost: 50 },
  { id: 3, module: "Software", itemCode: "SCADA-LIC", partNumber: "", description: "SCADA licence", brand: "", unit: "set", remaining: 1, estimatedUnitCost: 30000 },
  { id: 4, module: "Software", itemCode: "OLD", partNumber: "", description: "Already requested", brand: "", unit: "set", remaining: 0, estimatedUnitCost: 1 },
];
const lines = new Map(bom.map((line) => [line.id, line]));
const modules = ["Panel", "Software"];
const budgets = [{ module: "Panel", budget: 25000, requested: 0 }, { module: "Software", budget: 30000, requested: 0 }];

test("the sheet starts from every BOM line still to request, as the estimate item at the estimate price", () => {
  const rows = draftFromBom(bom);
  assert.deepEqual(rows.map((row) => [row.key, row.lineType, row.selected, row.quantity, row.unitPrice]),
    [["bom-1", "Planned", true, 2, 10000], ["bom-2", "Planned", true, 100, 50], ["bom-3", "Planned", true, 1, 30000]]);
  assert.deepEqual(draftIssues(rows, lines, modules), new Map());
});

test("the editor flags what the server would refuse, row by row, and ignores rows that are not ticked", () => {
  const [plc, cable] = draftFromBom(bom);
  const unplanned = { ...plc, key: "new-1", lineType: "Unplanned", bomLineId: null, module: "", itemCode: "", partNumber: "", description: "Bracket", unit: "pcs", quantity: 4, unitPrice: 100 };
  const issues = draftIssues([{ ...plc, quantity: 3 }, { ...asSubstitute(cable), coveredQuantity: 101 }, unplanned, { ...unplanned, key: "new-2", selected: false }], lines, modules);
  assert.deepEqual([...issues.keys()], ["bom-1", "bom-2", "new-1"]);
  assert.match(issues.get("bom-1"), /Only 2 pcs/);
  assert.match(issues.get("new-1"), /module/);
  // Two rows on one BOM line share what it still needs.
  assert.equal(draftIssues([{ ...plc, quantity: 1 }, { ...plc, key: "bom-1b", quantity: 2 }], lines, modules).get("bom-1b"), "Only 1 pcs is still to request");
});

test("module budgets: within, up to 10% over (PM), beyond 10% (Engineering Manager), earlier PRs counted", () => {
  const rows = draftFromBom(bom);
  assert.deepEqual(moduleStatus(rows, budgets).map((status) => [status.module, status.thisRequest, status.level]), [["Panel", 25000, "ok"], ["Software", 30000, "ok"]]);
  const over = rows.map((row) => row.key === "bom-2" ? { ...row, unitPrice: 70 } : row.key === "bom-3" ? { ...row, unitPrice: 35000 } : row);
  const [panel, software] = moduleStatus(over, budgets);
  assert.deepEqual([panel.level, panel.over, Number(panel.percent.toFixed(1))], ["manager", 2000, 8]);
  assert.deepEqual([software.level, software.over], ["management", 5000]);
  assert.equal(moduleStatus(rows, [{ module: "Panel", budget: 25000, requested: 1 }, budgets[1]])[0].level, "manager");
});

test("the request sends ticked rows only, planned lines as the estimate item and the rest with what the engineer wrote", () => {
  const [plc, cable, scada] = draftFromBom(bom);
  const substitute = { ...asSubstitute(cable), partNumber: "CBL-ALT", description: "Other cable", unit: "roll", quantity: 1, unitPrice: 4500 };
  const unplanned = { ...plc, key: "new-1", lineType: "Unplanned", bomLineId: null, module: "Panel", itemCode: "", partNumber: "BRK", description: "Bracket", brand: "", unit: "pcs", quantity: 5, unitPrice: 100 };
  const body = payloadLines([plc, substitute, unplanned, { ...scada, selected: false }]);
  assert.deepEqual(body.map((line) => [line.lineType, line.bomLineId ?? null, line.module ?? null]), [["Planned", 1, null], ["Substitute", 2, null], ["Unplanned", null, "Panel"]]);
  assert.equal(body[0].description, undefined);
  assert.equal(body[1].partNumber, "CBL-ALT");
  assert.deepEqual(asPlanned(substitute, lines.get(2)), { ...cable, quantity: 1 });
});

test("the template round-trips through the reader, and its layout matches lib/export-xlsx.ts (header row 6, quantity H, price J)", () => {
  const [plc, cable] = draftFromBom(bom);
  const rows = [plc, { ...asSubstitute(cable), partNumber: "CBL-ALT", description: "Other cable", unit: "roll", quantity: 1, unitPrice: 4500 },
    { ...plc, key: "new-1", lineType: "Unplanned", bomLineId: null, module: "Software", itemCode: "", partNumber: "DONGLE", description: "Licence dongle", brand: "", unit: "pcs", quantity: 2, unitPrice: 800, selected: false }];
  const sheet = templateRows("PR · BOM-1", rows, lines);
  assert.equal(sheet[PR_TEMPLATE_HEADER_ROW][7], "Qty");
  assert.equal(sheet[PR_TEMPLATE_HEADER_ROW][9], "Unit price");
  const exporter = readFileSync(new URL("../lib/export-xlsx.ts", import.meta.url), "utf8");
  assert.match(exporter, /rowIndex===5\?2:\(colIndex===7\|\|colIndex===9\?3:0\)/);
  const back = draftFromSheet(sheet, bom, modules);
  assert.equal(back.format, "template");
  assert.deepEqual(back.rows.map((row) => [row.lineType, row.bomLineId, row.module, row.partNumber, row.quantity, row.unit, row.unitPrice, row.selected]),
    [["Planned", 1, "Panel", "6ES7-1", 2, "pcs", 10000, true], ["Substitute", 2, "Panel", "CBL-ALT", 1, "roll", 4500, true], ["Unplanned", null, "Software", "DONGLE", 2, "pcs", 800, false]]);
});

test("the team's TOMAS PR form is read by its columns and matched to the BOM by part number or item code", () => {
  const form = [];
  form[7] = []; form[7][4] = "Model/Part Number"; form[7][21] = "PO Number";
  form[8] = []; Object.assign(form[8], { 4: "6es7-1", 5: "PLC", 6: "controller", 11: 2, 12: "pcs", 13: "Siemens", 17: 9500, 23: "urgent" });
  form[9] = []; Object.assign(form[9], { 4: "HMI-7IN", 5: "Touch panel", 11: 1, 12: "pcs", 17: 15000 });
  form[10] = []; Object.assign(form[10], { 4: "NO-QTY", 5: "Skipped", 17: 1 });
  const read = draftFromSheet(form, bom, modules);
  assert.equal(read.format, "tomas");
  assert.equal(read.skipped, 1);
  assert.deepEqual(read.rows.map((row) => [row.lineType, row.bomLineId, row.quantity, row.unitPrice, row.remark]), [["Planned", 1, 2, 9500, "urgent"], ["Unplanned", null, 1, 15000, ""]]);
  assert.match(draftIssues(read.rows, lines, modules).get(read.rows[1].key), /module/);
});

test("a workbook's cells become rows; a sheet with no recognisable table is not read", () => {
  const rows = sheetRows({ A1: { value: "Description" }, B1: { value: "Qty" }, A2: { value: "Bracket" }, B2: { value: 3 }, C4: { value: "x" } });
  assert.deepEqual(rows[1], ["Bracket", 3]);
  assert.equal(rows.length, 4);
  assert.equal(draftFromSheet([["Hello"], ["World"]], bom, modules), null);
});
