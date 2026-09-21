import test from "node:test";
import assert from "node:assert/strict";
import { foldErpGroupLines, erpGroupsByMember, erpMemberKey } from "../lib/erp-estimate-groups.ts";
import { buildEstimateCostBreakdown, breakdownModules } from "../lib/estimate-cost-breakdown.ts";

const line = (id, amount, category = "Hardware", description = "Item " + id) => ({
  sourceType: "CostItem", sourceId: id, description, amount, erpCategory: category,
  unitPrice: amount, quantity: 1, unit: "Pcs", supplier: "Supplier A", brand: "Omron", item: "IT-" + id, remark: null,
});
const group = (members, extra = {}) => ({
  id: 1, title: "Network accessories", quantity: 1, unit: "Lot", rowVersion: "AAAA",
  members: members.map(id => ({ sourceType: "CostItem", sourceId: id })), ...extra,
});

test("a merged line is one exported row that still carries the whole amount", () => {
  const lines = [line(1, 1000), line(2, 250), line(3, 4000)];
  const folded = foldErpGroupLines(lines, [group([1, 2])]);
  assert.equal(folded.length, 2);
  assert.equal(folded.reduce((sum, row) => sum + row.amount, 0), lines.reduce((sum, row) => sum + row.amount, 0));
  const [merged, untouched] = folded;
  assert.equal(merged.description, "Network accessories");
  assert.equal(merged.amount, 1250);
  assert.equal(merged.unitPrice, 1250);
  assert.equal(merged.unit, "Lot");
  // Nothing the members said is lost, and nothing is inherited from whichever came first.
  assert.equal(merged.remark, "Item 1; Item 2");
  assert.deepEqual([merged.supplier, merged.brand, merged.item], [null, null, null]);
  assert.deepEqual(untouched, line(3, 4000));
});

test("quantity divides the merged amount instead of multiplying it", () => {
  const [merged] = foldErpGroupLines([line(1, 900), line(2, 600)], [group([1, 2], { quantity: 3, unit: "Set" })]);
  assert.equal(merged.amount, 1500);
  assert.equal(merged.quantity, 3);
  assert.equal(merged.unit, "Set");
  assert.equal(merged.unitPrice * merged.quantity, merged.amount);
});

test("a merged line whose members disagree on a category is left alone", () => {
  // Folding these would move 250 baht from Service into Hardware on the sheet.
  const lines = [line(1, 1000, "Hardware"), line(2, 250, "Service")];
  assert.deepEqual(foldErpGroupLines(lines, [group([1, 2])]), lines);
});

test("a merged line that has lost all but one member exports as that line", () => {
  const lines = [line(1, 1000)];
  assert.deepEqual(foldErpGroupLines(lines, [group([1, 2])]), lines);
  assert.deepEqual(foldErpGroupLines(lines, []), lines);
});

test("members are indexed by the identity ERP mappings already use", () => {
  const index = erpGroupsByMember([group([1, 2])]);
  assert.equal(index.get("CostItem:1").title, "Network accessories");
  assert.equal(index.get(erpMemberKey({ sourceType: "CostItem", sourceId: 2 })).id, 1);
  assert.equal(index.get("CostItem:3"), undefined);
});

test("the summary shows one row for a merged line, whatever module its items came from", () => {
  const costItems = [
    { id: 1, module: "Rack", lineTotal: 1000 },
    { id: 2, module: "Camera", lineTotal: 250 },
    { id: 3, module: "Camera", lineTotal: 4000 },
  ].map(item => ({ ...item, categoryCode: "01", category: "Hardware", description: "Item " + item.id, brand: "", model: "", itemCode: "", quantity: 1, unitCost: item.lineTotal, unit: "Pcs" }));
  const [section] = buildEstimateCostBreakdown({ costItems, manhourLines: [], expenseLines: [], otherCostLines: [] },
    { manhour: "", expenses: "", other: "", manDayUnit: "" });

  assert.deepEqual(breakdownModules(section).map(entry => entry.title), ["Rack", "Camera"]);

  const merged = new Set(["cost:1", "cost:2"]);
  const modules = breakdownModules(section, line => merged.has(line.key) ? { id: 7, title: "Network accessories" } : null);
  assert.deepEqual(modules.map(entry => entry.title), ["Network accessories", "Camera"]);
  assert.deepEqual(modules.map(entry => entry.key), ["group:7", "category:01:Camera"]);
  assert.deepEqual(modules.map(entry => entry.merged), [7, null]);
  assert.equal(modules[0].amount, 1250);
  assert.equal(modules.reduce((sum, entry) => sum + entry.amount, 0), section.amount);
  assert.deepEqual(modules.flatMap(entry => entry.lines.map(row => row.key)).sort(), ["cost:1", "cost:2", "cost:3"]);
});
