import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { readPrForm } from "../lib/pr-form.ts";
import { addPastedRows, afterEdit, asPlanned, asSubstitute, blankPrRows, clipboardRows, draftFromBom, draftFromPaste, draftFromPr, draftFromPrForm, draftFromSheet, draftIssues, togglePart, withoutRows, insertBlankPrRow, isBlankPrRow, moduleStatus, rowFromBomLine, payloadLines, PR_TEMPLATE_HEADER_ROW, sheetRows, startingPrRows, templateRows } from "../lib/pr-spreadsheet.ts";

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

test("a reopened draft shows its saved lines ticked, then the BOM lines it does not request yet, unticked", () => {
  const saved = [
    { id: 11, lineType: "Planned", bomLineId: 1, module: "Panel", itemCode: "PLC-01", partNumber: "6ES7-1", description: "PLC controller", brand: "Siemens", unit: "pcs", quantity: 1, coveredQuantity: 1, unitPrice: 9500, remark: "urgent" },
    { id: 12, lineType: "Substitute", bomLineId: 2, module: "Panel", itemCode: "", partNumber: "CBL-ALT", description: "Cable, other make", brand: "", unit: "roll", quantity: 1, coveredQuantity: 100, unitPrice: 4500, remark: null },
  ];
  const rows = draftFromPr(saved, bom);
  assert.deepEqual(rows.map((row) => [row.key, row.lineType, row.selected, row.quantity, row.coveredQuantity, row.remark]),
    [["pr-11", "Planned", true, 1, null, "urgent"], ["pr-12", "Substitute", true, 1, 100, ""], ["bom-2", "Planned", false, 100, null, ""], ["bom-3", "Planned", false, 1, null, ""]]);
  assert.deepEqual(draftIssues(rows, lines, modules), new Map());
  // The ERP takes at most 1,000,000 on one line; the sheet says so before the server does.
  assert.match(draftIssues([{ ...rows[1], quantity: 1_000_001 }], lines, modules).get("pr-12"), /at most 1,000,000/);
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

/**
 * A PR-Form sheet: header labels on row 8 from column `from`, then one row per line. Columns are named, so both versions of the form can be drawn;
 * a name starting with "|" is a column whose heading the form leaves empty.
 */
function prFormSheet(name, headings, rows, from = 2) {
  const column = (index) => { let label = ""; for (let n = index; n > 0; n = Math.floor((n - 1) / 26)) label = String.fromCharCode(65 + ((n - 1) % 26)) + label; return label; };
  const cells = { C2: { value: "Project Number" }, F2: { value: "PJ260091" }, C5: { value: "Drawing No." }, F5: { value: name.drawing } };
  headings.forEach((heading, index) => { if (heading && !heading.startsWith("|")) cells[`${column(from + index)}8`] = { value: heading }; });
  rows.forEach((values, offset) => headings.forEach((heading, index) => { const value = values[heading.replace(/^\|/, "")]; if (value !== undefined && value !== null && value !== "") cells[`${column(from + index)}${9 + offset}`] = { value }; }));
  return { name: name.sheet, cells };
}
const FORM_2026 = ["Rev.", "No.", "Item", "Model/Part Number", "Discription", "Material", "Treatment", "Detail", "Quantity", "Total", "Unit", "Brand", "Supplier", "Lead time", "Quotation No.", "Unit price", "Total price", "Unit", "Actual cost", "PO Number", "PO status", "Remark"];
// The 2025 form: one column further right (a blank merged column after the description), quantity to buy in L, PO Number in V and its status
// beside it under no heading.
const FORM_2025 = ["Rev.", "No.", "Item", "Model/Part Number", "Discription", "", "Material", "Treatment", "Detail", "Quantity", "Total", "Unit", "Brand", "Supplier", "QT No.", "Lead time", "Unit price", "Total price", "Unit", "Remark", "Actual cost", "PO Number", "|PO status"];
const FORM_LINES = [
  { "Rev.": "△1", "No.": 1, "Item": "A", "Model/Part Number": "6es7-1", "Discription": "PLC", "Material": "-", "Quantity": 1, "Total": 2, "Unit": "Pcs.", "Brand": "Siemens", "Unit price": 9500, "Remark": "urgent" },
  { "Model/Part Number": "IO-16", "Quantity": 2, "Total": 4, "Unit": "Pcs.", "Brand": "Siemens", "Unit price": 1200 },
  { "Rev.": "△1", "No.": 3, "Item": "B", "Model/Part Number": "BRKT-7", "Discription": "Bracket", "Material": "SS400", "Treatment": "Zinc", "Detail": "t=3", "Quantity": 1, "Total": 6, "Unit": "Pcs.", "Brand": "FAB", "Unit price": 300 },
  { "Rev.": "△2", "No.": 4, "Item": "C", "Model/Part Number": "OLD-1", "Discription": "Dropped", "Quantity": 1, "Total": 1, "Unit": "Pcs.", "Unit price": 50, "PO status": "Cancelled" },
  { "Rev.": "△2", "No.": 5, "Item": "D", "Model/Part Number": "NO-QTY", "Discription": "No quantity", "Unit price": 10 },
];

test("the team's PR-Form, 2026 or 2025 drawing, is read by its labels and matched to the BOM by part number (owner 2026-11-20)", () => {
  for (const [headings, from] of [[FORM_2026, 2], [FORM_2025, 2]]) {
    const workbook = readPrForm([{ name: "001_Summary cost", cells: { C8: { value: "Item" }, D8: { value: "Model/Part Number" }, K8: { value: "Quantity" }, J8: { value: "Unit price" } } },
      prFormSheet({ sheet: "001_EE", drawing: "-" }, headings, FORM_LINES, from)], "PR-[EE]-[PJ260091]-20260717-001.xlsx");
    assert.deepEqual(workbook.forms.map((form) => form.sheet), ["001_EE"]);
    const read = draftFromPrForm(workbook.forms[0], bom, modules, "Panel");
    assert.equal(read.format, "prform");
    assert.deepEqual([read.skipped, read.cancelled], [1, 1]);
    assert.deepEqual(read.rows.map((row) => [row.lineType, row.bomLineId, row.module, row.partNumber, row.description, row.quantity, row.unit, row.unitPrice, row.remark]), [
      ["Planned", 1, "Panel", "6ES7-1", "PLC controller", 2, "pcs", 9500, "urgent"],
      ["Unplanned", null, "Panel", "IO-16", "IO-16", 4, "Pcs", 1200, ""],
      ["Unplanned", null, "Panel", "BRKT-7", "Bracket", 6, "Pcs", 300, ""],
    ]);
    // The form's own fields come along, and the part keeps the line it belongs to (migration 115).
    assert.deepEqual(read.rows.map((row) => [row.material, row.treatment, row.detail, row.quantityPerSet, row.parentKey]), [
      ["", "", "", 1, null], ["", "", "", 2, "pf-9"], ["SS400", "Zinc", "t=3", 1, null]]);
    assert.deepEqual(payloadLines(read.rows).map((line) => [line.parentIndex, line.material, line.quantityPerSet]), [[undefined, undefined, 1], [0, undefined, 2], [undefined, "SS400", 1]]);
    assert.deepEqual(draftIssues(read.rows, lines, modules), new Map());
  }
  // With no Unit chosen, a line the BOM does not have still needs its module.
  const loose = draftFromPrForm(readPrForm([prFormSheet({ sheet: "001_EE", drawing: "-" }, FORM_2026, FORM_LINES)], "x.xlsx").forms[0], bom, modules);
  assert.match(draftIssues(loose.rows, lines, modules).get(loose.rows[1].key), /module/);
});

test("a line can be a part of the line above it, one level deep, as on the PR-Form (owner 2026-11-20)", () => {
  const typed = (key, partNumber, extra = {}) => ({ key, selected: true, lineType: "Unplanned", bomLineId: null, module: "Panel", itemCode: "", partNumber, description: partNumber,
    brand: "", unit: "pcs", quantity: 1, coveredQuantity: null, unitPrice: 10, remark: "", ...extra });
  let rows = [typed("a", "MANIFOLD"), typed("b", "VALVE-1"), typed("c", "VALVE-2")];
  assert.equal(togglePart(rows, "a"), rows, "the first row has no line above it");
  rows = togglePart(togglePart(rows, "b"), "c");
  assert.deepEqual(rows.map((row) => row.parentKey ?? null), [null, "a", "a"]);
  // A row with parts cannot become a part; a part pressed again is a line of its own.
  assert.equal(togglePart(rows, "a"), rows);
  assert.deepEqual(togglePart(rows, "c").map((row) => row.parentKey ?? null), [null, "a", null]);
  assert.deepEqual(payloadLines(rows).map((line) => line.parentIndex), [undefined, 0, 0]);
  assert.deepEqual(draftIssues(rows, lines, modules), new Map());
  // The line a part belongs to must be on the request, above it.
  const unticked = rows.map((row) => row.key === "a" ? { ...row, selected: false } : row);
  assert.deepEqual([...draftIssues(unticked, lines, modules).values()], ["The line this part belongs to is not on this request", "The line this part belongs to is not on this request"]);
  assert.deepEqual(payloadLines(unticked).map((line) => line.parentIndex), [undefined, undefined]);
  // Removing the line makes its parts lines of their own.
  assert.deepEqual(withoutRows(rows, new Set(["a"])).map((row) => [row.key, row.parentKey]), [["b", null], ["c", null]]);
  // A link is a web link.
  assert.deepEqual([...draftIssues([typed("d", "X", { attachmentUrl: "file://server/drawing.pdf" })], lines, modules).values()], ["A link must start with http:// or https://"]);
  assert.deepEqual(draftIssues([typed("d", "X", { attachmentUrl: "https://tomastech275.sharepoint.com/x" })], lines, modules), new Map());
});

test("a saved draft brings its form fields and parts back, and the template carries them both ways", () => {
  const saved = [
    { id: 41, lineType: "Unplanned", bomLineId: null, module: "Panel", itemCode: "", partNumber: "MANIFOLD", description: "Manifold", brand: "SMC", unit: "pcs", quantity: 1, coveredQuantity: 0, unitPrice: 900, remark: null,
      material: "A5052", treatment: null, detail: "8 stations", quantityPerSet: 1, needBy: "2026-12-01", attachmentUrl: "https://example.com/m.pdf", parentLineId: null },
    { id: 42, lineType: "Unplanned", bomLineId: null, module: "Panel", itemCode: "", partNumber: "VALVE-1", description: "Valve", brand: "SMC", unit: "pcs", quantity: 8, coveredQuantity: 0, unitPrice: 50, remark: null,
      quantityPerSet: 8, parentLineId: 41 },
  ];
  const rows = draftFromPr(saved, []);
  assert.deepEqual(rows.map((row) => [row.key, row.material, row.detail, row.needBy, row.attachmentUrl, row.quantityPerSet, row.parentKey]),
    [["pr-41", "A5052", "8 stations", "2026-12-01", "https://example.com/m.pdf", 1, null], ["pr-42", "", "", "", "", 8, "pr-41"]]);
  assert.deepEqual(payloadLines(rows)[1], { lineType: "Unplanned", bomLineId: undefined, module: "Panel", itemCode: undefined, partNumber: "VALVE-1", description: "Valve", brand: "SMC",
    unit: "pcs", quantity: 8, coveredQuantity: undefined, unitPrice: 50, priceSource: "Manual", remark: undefined, material: undefined, treatment: undefined, detail: undefined,
    quantityPerSet: 8, needBy: undefined, attachmentUrl: undefined, parentIndex: 0 });
  const sheet = templateRows("PR", rows, lines);
  assert.deepEqual(sheet[PR_TEMPLATE_HEADER_ROW].slice(15), ["Material", "Treatment", "Detail", "Need by", "Link"]);
  const back = draftFromSheet(sheet, bom, modules);
  assert.deepEqual(back.rows.map((row) => [row.material, row.detail, row.needBy, row.attachmentUrl]), [["A5052", "8 stations", "2026-12-01", "https://example.com/m.pdf"], ["", "", "", ""]]);
});

test("the PR sheet imports a PR-Form through the reader, choosing the sheet of the Unit's drawing", () => {
  const editor = readFileSync(new URL("../app/system/production/PurchaseRequestEditor.tsx", import.meta.url), "utf8");
  assert.match(editor, /const forms = readPrForm\(sheets, file\.name\)\.forms;/);
  assert.match(editor, /forms\.find\(\(item\) => unit\?\.drawingNo && item\.drawingNo\.toLocaleLowerCase\(\) === unit\.drawingNo\.toLocaleLowerCase\(\)\) \?\? forms\[0\]/);
  assert.match(editor, /draftFromPrForm\(form, \[\.\.\.lines\.values\(\)\], modules, unit\?\.module \?\? ""\)/);
  assert.match(editor, /data-guide="pr\.import"/);
  const two = readPrForm([prFormSheet({ sheet: "MA11-U001", drawing: "MA11-U001" }, FORM_2026, FORM_LINES.slice(0, 1)), prFormSheet({ sheet: "MA11-U002", drawing: "MA11-U002" }, FORM_2026, FORM_LINES.slice(2, 3))], "x.xlsx").forms;
  assert.deepEqual(two.map((form) => form.drawingNo), ["MA11-U001", "MA11-U002"]);
});

test("a workbook's cells become rows; a sheet with no recognisable table is not read", () => {
  const rows = sheetRows({ A1: { value: "Description" }, B1: { value: "Qty" }, A2: { value: "Bracket" }, B2: { value: 3 }, C4: { value: "x" } });
  assert.deepEqual(rows[1], ["Bracket", 3]);
  assert.equal(rows.length, 4);
  assert.equal(draftFromSheet([["Hello"], ["World"]], bom, modules), null);
});

test("rows pasted from Excel are read by their header, or by their columns when copied without one (owner 2026-11-19)", () => {
  // Excel ends a copy with a line break, and Windows separates rows with CRLF.
  assert.deepEqual(clipboardRows("a\tb\r\nc\td\r\n"), [["a", "b"], ["c", "d"]]);
  // With a header: columns by name in any order; an item of the BOM is tied to its line.
  const named = draftFromPaste("Qty\tDescription\tPart No.\tUnit price\n3\tTouch panel\tHMI-7IN\t15000\n1\tPLC\t6ES7-1\t9000\n", bom, modules, "Panel");
  assert.deepEqual(named.rows.map((row) => [row.lineType, row.bomLineId, row.module, row.partNumber, row.description, row.quantity, row.unit, row.unitPrice]),
    [["Unplanned", null, "Panel", "HMI-7IN", "Touch panel", 3, "pcs", 15000], ["Planned", 1, "Panel", "6ES7-1", "PLC controller", 1, "pcs", 9000]]);
  // Without one: the first mostly-number column after some text is the quantity.
  const shape = (pasted) => draftFromPaste(pasted, bom, modules, "Software").rows.map((row) => [row.itemCode, row.partNumber, row.description, row.brand, row.quantity, row.unit, row.unitPrice, row.remark, row.module]);
  assert.deepEqual(shape("Bracket\t4\nGland M20\t10\n"), [["", "", "Bracket", "", 4, "pcs", 0, "", "Software"], ["", "", "Gland M20", "", 10, "pcs", 0, "", "Software"]]);
  assert.deepEqual(shape("Bracket\t4\tset\t1,250.50\tfor door\n"), [["", "", "Bracket", "", 4, "set", 1250.5, "for door", "Software"]]);
  assert.deepEqual(shape("XS-1\tSensor\t2\t800\n"), [["", "XS-1", "Sensor", "", 2, "pcs", 800, "", "Software"]]);
  assert.deepEqual(shape("XS-1\tSensor\tOmron\t2\tpcs\t800\n"), [["", "XS-1", "Sensor", "Omron", 2, "pcs", 800, "", "Software"]]);
  assert.deepEqual(shape("IT-9\tXS-1\tSensor\tOmron\t2\tpcs\t800\turgent\n"), [["IT-9", "XS-1", "Sensor", "Omron", 2, "pcs", 800, "urgent", "Software"]]);
  // A running No. column is not the quantity and names nothing; a row without a quantity is skipped and counted.
  const numbered = draftFromPaste("1\tBracket\t4\n2\tGland\t\n3\tLabel\t7\n", bom, modules, "Panel");
  assert.deepEqual([numbered.rows.map((row) => [row.description, row.quantity]), numbered.skipped], [[["Bracket", 4], ["Label", 7]], 1]);
  // Nothing that looks like a quantity: not read.
  assert.equal(draftFromPaste("just some words\nand more\n", bom, modules, "Panel"), null);
  assert.equal(draftFromPaste("", bom, modules, "Panel"), null);
});

test("pasted rows join the sheet: a BOM line already there is updated, new items are appended, untouched blank rows go", () => {
  const sheet = draftFromBom(bom);
  const blank = { key: "new-1", selected: true, lineType: "Unplanned", bomLineId: null, module: "Panel", itemCode: "", partNumber: "", description: "", brand: "", unit: "pcs", quantity: 1, coveredQuantity: null, unitPrice: 0, remark: "" };
  assert.equal(isBlankPrRow(blank), true);
  assert.equal(isBlankPrRow({ ...blank, description: "Bracket" }), false);
  assert.equal(isBlankPrRow(sheet[0]), false);
  const pasted = draftFromPaste("Part No.\tDescription\tQty\tUnit price\n6ES7-1\tPLC\t1\t9000\nHMI-7IN\tTouch panel\t3\t15000\n", bom, modules, "Panel").rows;
  const next = addPastedRows([{ ...sheet[0], selected: false }, ...sheet.slice(1), blank], pasted, "t1");
  assert.equal(next.length, sheet.length + 1);
  assert.deepEqual([next[0].key, next[0].selected, next[0].quantity, next[0].unitPrice], [sheet[0].key, true, 1, 9000]);
  assert.deepEqual([next.at(-1).key, next.at(-1).lineType, next.at(-1).partNumber, next.at(-1).quantity], ["paste-t1-1", "Unplanned", "HMI-7IN", 3]);
  assert.ok(!next.some((row) => row.key === "new-1"));
  assert.equal(draftIssues(next, lines, modules).size, 0);
});

test("a new PR starts as empty rows; an estimate line is brought in when wanted, and typing over it buys something in its place (owner 2026-11-19)", () => {
  const blank = blankPrRows(3, "Panel", "t");
  assert.deepEqual(blank.map((row) => [row.key, row.lineType, row.module, isBlankPrRow(row)]), [["new-t-0", "Unplanned", "Panel", true], ["new-t-1", "Unplanned", "Panel", true], ["new-t-2", "Unplanned", "Panel", true]]);
  // Nothing typed, nothing to send or to check.
  assert.deepEqual(payloadLines(blank.filter((row) => !isBlankPrRow(row))), []);

  // The first time, the row is tied to the estimate line with what it still needs and the estimate's price.
  const plc = rowFromBomLine(bom[0], blank, "t");
  assert.deepEqual([plc.key, plc.lineType, plc.bomLineId, plc.quantity, plc.unitPrice, plc.module], ["bom-1", "Planned", 1, 2, 10000, "Panel"]);
  // Brought in again, or once the estimate line is fully requested, it is a free copy.
  const again = rowFromBomLine(bom[0], [plc], "t2");
  assert.deepEqual([again.key, again.lineType, again.bomLineId, again.quantity], ["copy-1-t2", "Unplanned", null, 1]);
  assert.deepEqual([rowFromBomLine(bom[3], [], "t3").lineType, rowFromBomLine(bom[3], [], "t3").bomLineId], ["Unplanned", null]);

  // Untouched, or with a smaller quantity or another price, it is still the estimate's item.
  assert.equal(afterEdit({ ...plc, quantity: 1, unitPrice: 9000 }, bom[0], false).lineType, "Planned");
  // Another part, or more than the estimate still needs: it replaces the estimate's line.
  assert.deepEqual([afterEdit({ ...plc, partNumber: "S7-1500" }, bom[0], true).lineType, afterEdit({ ...plc, quantity: 3 }, bom[0], false).lineType], ["Substitute", "Substitute"]);
  assert.equal(draftIssues([afterEdit({ ...plc, partNumber: "S7-1500", quantity: 3 }, bom[0], true)], lines, modules).size, 0);
  // A typed row has no estimate line and stays as it is.
  assert.equal(afterEdit({ ...blank[0], description: "Bracket" }, undefined, true).lineType, "Unplanned");
});

test("an empty row opens right under the row it was asked from (owner 2026-11-20)", () => {
  const rows = blankPrRows(3, "Panel", "t").map((row, index) => ({ ...row, description: `Item ${index}` }));
  const middle = insertBlankPrRow(rows, "new-t-1", "Field", "s");
  assert.deepEqual(middle.rows.map((row) => row.key), ["new-t-0", "new-t-1", "new-s-in-0", "new-t-2"]);
  assert.equal(middle.key, "new-s-in-0");
  const added = middle.rows[2];
  assert.deepEqual([added.lineType, added.module, added.bomLineId, isBlankPrRow(added)], ["Unplanned", "Field", null, true]);
  // The rows it was given are left as they were.
  assert.equal(rows.length, 3);
  // Under the last row, and at the end when the row is gone by then.
  assert.deepEqual(insertBlankPrRow(rows, "new-t-2", "", "s").rows.map((row) => row.key), ["new-t-0", "new-t-1", "new-t-2", "new-s-in-0"]);
  assert.deepEqual(insertBlankPrRow(rows, "gone", "", "s").rows.map((row) => row.key), ["new-t-0", "new-t-1", "new-t-2", "new-s-in-0"]);
  // A second one under the same row gets its own key.
  const twice = insertBlankPrRow(middle.rows, "new-t-1", "Field", "s2");
  assert.equal(new Set(twice.rows.map((row) => row.key)).size, 5);
});

test("a PR started from a BOM opens with the ticked lines, then empty rows (owner 2026-11-20)", () => {
  // Lines 1 and 3 were ticked; line 4 needs nothing more, so it is not brought in even if asked for.
  const rows = startingPrRows(bom, [3, 1, 4], "", "s");
  assert.deepEqual(rows.filter((row) => !isBlankPrRow(row)).map((row) => [row.key, row.lineType, row.bomLineId, row.quantity, row.unitPrice, row.module]),
    [["bom-1", "Planned", 1, 2, 10000, "Panel"], ["bom-3", "Planned", 3, 1, 30000, "Software"]]);
  assert.equal(rows.filter(isBlankPrRow).length, 5);
  assert.equal(draftIssues(rows.filter((row) => !isBlankPrRow(row)), lines, modules).size, 0);
  // Nothing ticked: the empty table a new PR always started with.
  const empty = startingPrRows(bom, [], "Panel", "s");
  assert.equal(empty.length, 10);
  assert.ok(empty.every((row) => isBlankPrRow(row) && row.module === "Panel"));
});
