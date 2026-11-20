import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { REQUEST_LIST_SHEET, requestListSheetRemark, requestListSheetRows } from "../lib/request-list-sheet.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const request = { number: "PR-2611-0007", projectNumber: "PJ260017", neededBy: "2026-12-04", requester: "Pattana S." };
const line = (over) => ({ lineRef: "ENGAPP-PR-1-1", lineType: "Planned", itemCode: "PLC-01", partNumber: "KV-X520", description: "PLC", brand: "Keyence", quantity: 2, unit: "pcs",
  unitPrice: 1000, module: "Panel", remark: null, outsource: false, originalCode: null, ...over });

test("the sheet for the ERP's Request List: a header row, then every line with its line_ref", () => {
  const rows = requestListSheetRows(request, [
    line({}),
    line({ lineRef: "ENGAPP-PR-1-2", lineType: "Unplanned", itemCode: "", partNumber: "", brand: "", description: "Site wiring", unit: "", module: "Install", outsource: true, remark: "night shift" }),
    // Not approved yet, so it has no key in the ERP: it is not in the sheet.
    line({ lineRef: null, description: "Draft line" }),
  ]);
  assert.deepEqual(rows[0], ["line_ref", "project_no", "part_number", "item_description", "brand", "quantity", "unit", "est_unit_price", "needed_by_date", "remark", "request_no", "requester"]);
  assert.deepEqual(rows[1], ["ENGAPP-PR-1-1", "PJ260017", "KV-X520", "PLC", "Keyence", 2, "pcs", 1000, "2026-12-04", "Module Panel · Item PLC-01", "PR-2611-0007", "Pattana S."]);
  assert.deepEqual(rows[2], ["ENGAPP-PR-1-2", "PJ260017", "", "Site wiring", "", 2, "PCS", 1000, "2026-12-04", "Outsource · Not in the estimate · Module Install · night shift", "PR-2611-0007", "Pattana S."]);
  assert.equal(rows.length, 3);
});

test("the layout is one list: another order or another header changes the sheet and nothing else", () => {
  const rows = requestListSheetRows(request, [line({})], [{ key: "description", header: "Item" }, { key: "lineRef", header: "Ref" }]);
  assert.deepEqual(rows, [["Item", "Ref"], ["PLC", "ENGAPP-PR-1-1"]]);
  assert.equal(REQUEST_LIST_SHEET.sheetName, "Request List");
  assert.ok(REQUEST_LIST_SHEET.columns.some((column) => column.key === "lineRef"), "line_ref is how the ERP's answer finds the line again");
});

test("the sheet's remark is the one the API sends the ERP", () => {
  // Same text as backend-node/src/erp-purchasing.ts erpLineRemark, so a line reads the same whichever way it reaches the ERP.
  const api = read("backend-node/src/erp-purchasing.ts");
  assert.match(api, /export const erpLineRemark = \(line: ErpLine\): string => \[line\.outsource \? "Outsource" : "", line\.line_type === "Substitute" && line\.original_code \? `Substitute for \$\{line\.original_code\}` : line\.line_type === "Unplanned" \? "Not in the estimate" : "",/);
  assert.equal(requestListSheetRemark(line({ lineType: "Substitute", originalCode: "CBL-01", itemCode: "CBL-ALT", partNumber: "CBL-ALT" })), "Substitute for CBL-01 · Module Panel");
});
