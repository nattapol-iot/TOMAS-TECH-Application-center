import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../src/config.js";
import { ERP_MAX_REMARK, erpRequestArguments, type ErpHeader, type ErpLine } from "../src/erp-purchasing.js";
import { isFinalRequestList, isFullyOrdered, parseRequestListItems, REQUEST_LIST_TOOLS, requestListAddArguments, requestListLineRef, requestListProblem, requestListRemark,
  requestStatusFor } from "../src/erp-request-list.js";

const header: ErpHeader = { pr_no: "PR-2611-0007", erp_ref: "ENGAPP-PR-11111111-2222-4333-8444-555555555555", erp_department: "IOT", required_date: "2026-12-04T00:00:00Z",
  purpose: null, project_no: "PJ260017", project_name: "AMR fleet", bom_no: "BOM-2611-0002" };
const line = (over: Partial<ErpLine> = {}): ErpLine => ({ line_type: "Planned", item_code: "PLC-01", part_no: "KV-X520", description: "PLC", brand: "Keyence", qty: 2, unit: "pcs",
  unit_price: 1000, remark: null, budget_module: "Panel", original_code: null, ...over });
const base = { NODE_ENV: "development", Authentication__Mode: "Development", ConnectionStrings__IoTTeamCenter: "Server=unused;Database=Unused;User ID=test;Password=test;Encrypt=true", DocumentStorage__RootPath: "." };

test("the tool names are the proposal to the ERP team, kept in one place", () => {
  assert.deepEqual(REQUEST_LIST_TOOLS, { add: "project_request_list_add", get: "project_request_list_get", cancel: "project_request_list_cancel" });
});

test("a line's key is the request's external_ref and its place, from 1", () => {
  assert.equal(requestListLineRef(header.erp_ref, 0), "ENGAPP-PR-11111111-2222-4333-8444-555555555555-1");
  assert.equal(requestListLineRef(header.erp_ref, 11), "ENGAPP-PR-11111111-2222-4333-8444-555555555555-12");
});

test("the add arguments are an ERP PR's header plus line_ref on every line; the project number always goes", () => {
  const lines = [{ ...line(), line_ref: requestListLineRef(header.erp_ref, 0) }, { ...line({ line_type: "Unplanned", item_code: "", part_no: "", brand: "", description: "Site wiring", unit: "", outsource: true, budget_module: "Install" }), line_ref: requestListLineRef(header.erp_ref, 1), suggested_supplier_id: 42 }];
  const args = requestListAddArguments(header, lines, "https://app.example/") as Record<string, unknown> & { lines: Record<string, unknown>[] };
  const pr = erpRequestArguments(header, lines, "https://app.example/") as Record<string, unknown>;
  for (const field of ["external_ref", "department", "needed_by_date", "justification", "est_cost_url", "notes", "project_no"]) assert.deepEqual(args[field], pr[field], field);
  assert.equal(args.project_no, "PJ260017");
  assert.deepEqual(args.lines[0], { line_ref: "ENGAPP-PR-11111111-2222-4333-8444-555555555555-1", item_description: "PLC", quantity: 2, est_unit_price: 1000, unit: "pcs", part_number: "KV-X520", brand: "Keyence", remark: "Module Panel · Item PLC-01" });
  assert.deepEqual(args.lines[1], { line_ref: "ENGAPP-PR-11111111-2222-4333-8444-555555555555-2", item_description: "Site wiring", quantity: 2, est_unit_price: 1000, unit: "PCS", remark: "Outsource · Not in the estimate · Module Install", suggested_supplier_id: 42 });
});

test("a project still on its placeholder number is stopped before the ERP is asked", () => {
  assert.equal(requestListProblem(header), null);
  assert.match(requestListProblem({ project_no: "PJ000000" })!, /placeholder number PJ000000.*Give the project its ERP number/);
  assert.match(requestListProblem({ project_no: "" })!, /placeholder number PJ000000/);
});

test("fields the ERP has no place for yet travel in the remark as KEY=value pairs, within its limit", () => {
  assert.equal(requestListRemark(line(), { drawingNo: "MZ08-U001", unitName: "MASTER VALVE UNIT", material: "SS400", treatment: "Zn; black", attachmentUrl: "https://files.example/a.pdf" }),
    "Module Panel · Item PLC-01 · DWG=MZ08-U001; UNIT=MASTER VALVE UNIT; MAT=SS400; TRT=Zn, black; URL=https://files.example/a.pdf");
  assert.equal(requestListRemark(line(), { drawingNo: " ", material: null }), "Module Panel · Item PLC-01");
  assert.equal(requestListRemark(line({ remark: "x".repeat(2000) }), { drawingNo: "D-1" }).length, ERP_MAX_REMARK);
});

test("an answer's lines are read into our own shape, and odd ones do not hide a line", () => {
  const items = parseRequestListItems({ external_ref: header.erp_ref, project_no: "PJ260017", items: [
    { line_ref: "R-1", item_id: 123, status: "ORDERED", status_label: "Ordered", orders: [{ pr_no: "PR2611-0001", po_no: "PO2611-0003", quantity: 2, supplier_name: "Keyence" }, { pr_no: "PR2611-0004", po_no: null, quantity: "1" }, { quantity: 9 }], cancelled_reason: null, url: "https://erp.example/items/123" },
    { line_ref: "R-2", item_id: "124", status: "ON_HOLD", status_label: "On hold" },
    { line_ref: "R-3", status: "CANCELLED", cancelled_reason: "No longer needed" },
    { item_id: 9, status: "WAITING" },
  ] });
  assert.deepEqual(items, [
    { lineRef: "R-1", itemId: 123, status: "ORDERED", statusLabel: "Ordered", orders: [{ prNo: "PR2611-0001", poNo: "PO2611-0003", quantity: 2, supplierName: "Keyence", url: null }, { prNo: "PR2611-0004", poNo: null, quantity: 1, supplierName: null, url: null }], cancelledReason: null, url: "https://erp.example/items/123" },
    // A status this app does not know yet: still shown, as waiting, under the ERP's own label.
    { lineRef: "R-2", itemId: 124, status: "WAITING", statusLabel: "On hold", orders: [], cancelledReason: null, url: null },
    { lineRef: "R-3", itemId: null, status: "CANCELLED", statusLabel: "CANCELLED", orders: [], cancelledReason: "No longer needed", url: null },
  ]);
  assert.deepEqual(parseRequestListItems(null), []);
  assert.deepEqual(parseRequestListItems({ items: "none" }), []);
});

test("a request is fully ordered when every line has a PO or was cancelled", () => {
  const of = (...statuses: string[]) => statuses.map((status) => ({ status })) as { status: "WAITING" | "IN_PR" | "ORDERED" | "CANCELLED" }[];
  assert.equal(isFullyOrdered(of("ORDERED", "CANCELLED", "ORDERED")), true);
  assert.equal(isFullyOrdered(of("ORDERED", "IN_PR")), false);
  assert.equal(isFullyOrdered(of("CANCELLED", "CANCELLED")), false, "nothing was ordered");
  assert.equal(isFullyOrdered([]), false);
  assert.equal(requestStatusFor(of("ORDERED", "CANCELLED"), "Approved"), "Converted to PO");
  assert.equal(requestStatusFor(of("CANCELLED", "CANCELLED"), "Approved"), "Rejected");
  assert.equal(requestStatusFor(of("WAITING", "ORDERED"), "Approved"), "Approved");
  assert.equal(requestStatusFor([], "Approved"), "Approved");
  assert.equal(isFinalRequestList(of("ORDERED", "CANCELLED")), true);
  assert.equal(isFinalRequestList(of("CANCELLED")), true);
  assert.equal(isFinalRequestList(of("ORDERED", "WAITING")), false);
});

test("the server keeps sending one ERP PR until it is told otherwise", () => {
  assert.equal(loadConfig(base).pegasusRequestList, "off");
  assert.equal(loadConfig({ ...base, PEGASUS_REQUEST_LIST: "excel" }).pegasusRequestList, "excel");
  assert.equal(loadConfig({ ...base, PEGASUS_REQUEST_LIST: "tool" }).pegasusRequestList, "tool");
  assert.throws(() => loadConfig({ ...base, PEGASUS_REQUEST_LIST: "on" }), /PEGASUS_REQUEST_LIST must be off, excel or tool/);
});
