import assert from "node:assert/strict";
import test from "node:test";
import { filterErpLines, groupErpLines, suggestErpCategory } from "../lib/erp-category-suggest.ts";

const costItem = (internalCategory, description = "Part") => ({ sourceType: "CostItem", internalCategory, description });

test("cost items map by internal module code", () => {
  assert.equal(suggestErpCategory(costItem("01 Hardware")), "Hardware");
  assert.equal(suggestErpCategory(costItem("02 Software")), "Software");
  assert.equal(suggestErpCategory(costItem("03 Electrical", "Main Control Panel (MP)")), "Hardware");
  assert.equal(suggestErpCategory(costItem("04 Mechanical", "Electrical Bracket Unit")), "Hardware");
  assert.equal(suggestErpCategory(costItem("05 Robot")), "Hardware");
  assert.equal(suggestErpCategory(costItem("06 Engineering", "Drawing design")), "Service");
  assert.equal(suggestErpCategory(costItem("07 Outsource")), "Service");
  assert.equal(suggestErpCategory(costItem("08 Transportation", "Packing and Transportation")), "Installation");
  assert.equal(suggestErpCategory(costItem("09 Accommodation")), "Installation");
  assert.equal(suggestErpCategory(costItem("99 Unknown")), null);
});

test("description keywords override the module rule", () => {
  assert.equal(suggestErpCategory(costItem("02 Software", "SCADA runtime license")), "License");
  assert.equal(suggestErpCategory(costItem("06 Engineering", "Operator training 2 days")), "Training");
  assert.equal(suggestErpCategory(costItem("06 Engineering", "Preventive maintenance year 1")), "Maintenance");
  assert.equal(suggestErpCategory(costItem("06 Engineering", "อบรมผู้ใช้งาน")), "Training");
  assert.equal(suggestErpCategory(costItem("03 Electrical", "Master panel")), "Hardware", "MA inside a word must not trigger Maintenance");
});

test("manhour and expense lines follow their cost type", () => {
  assert.equal(suggestErpCategory({ sourceType: "ManhourLine", internalCategory: "Installation / In-house", description: "Wiring" }), "Installation");
  assert.equal(suggestErpCategory({ sourceType: "ManhourLine", internalCategory: "Engineering / In-house", description: "PLC programming" }), "Service");
  assert.equal(suggestErpCategory({ sourceType: "ExpenseLine", internalCategory: "Travel / Installation", description: "Site travel" }), "Installation");
  assert.equal(suggestErpCategory({ sourceType: "ExpenseLine", internalCategory: "Travel / Engineering", description: "Site survey" }), "Service");
});

test("other cost and contingency stay manual", () => {
  assert.equal(suggestErpCategory({ sourceType: "OtherCostLine", internalCategory: "Other", description: "Misc" }), null);
  assert.equal(suggestErpCategory({ sourceType: "Contingency", internalCategory: "Contingency", description: "Contingency 5%" }), null);
});

const lines = [
  { sourceType: "CostItem", internalCategory: "03 Electrical", description: "Main Control Panel", amount: 100, supplier: "Schneider", brand: null, item: "MP-01" },
  { sourceType: "CostItem", internalCategory: "06 Engineering", description: "Drawing design", amount: 50, supplier: null, brand: null, item: null },
  { sourceType: "ManhourLine", internalCategory: "Installation / In-house", description: "Wiring", amount: 25, supplier: null, brand: null, item: null },
  { sourceType: "CostItem", internalCategory: "03 Electrical", description: "Equipment Outside", amount: 10, supplier: null, brand: "Omron", item: 42 },
];

test("filter combines search, source type and internal category", () => {
  assert.equal(filterErpLines(lines, {}).length, 4);
  assert.equal(filterErpLines(lines, { sourceType: "ManhourLine" }).length, 1);
  assert.equal(filterErpLines(lines, { internalCategory: "03 Electrical" }).length, 2);
  assert.deepEqual(filterErpLines(lines, { search: "schneider" }).map((line) => line.description), ["Main Control Panel"]);
  assert.deepEqual(filterErpLines(lines, { search: "omron" }).map((line) => line.description), ["Equipment Outside"]);
  assert.deepEqual(filterErpLines(lines, { search: "42" }).map((line) => line.description), ["Equipment Outside"]);
  assert.deepEqual(filterErpLines(lines, { search: "engineering", sourceType: "CostItem" }).map((line) => line.description), ["Drawing design"]);
  assert.equal(filterErpLines(lines, { search: "engineering", sourceType: "ManhourLine" }).length, 0);
  assert.equal(filterErpLines(lines, { sourceType: "All", internalCategory: "All" }).length, 4);
});

test("grouping keeps first-seen order and sums amounts", () => {
  const groups = groupErpLines(lines);
  assert.deepEqual(groups.map((group) => group.key), ["03 Electrical", "06 Engineering", "Installation / In-house"]);
  assert.equal(groups[0].amount, 110);
  assert.equal(groups[0].lines.length, 2);
  assert.equal(groups[1].amount, 50);
});
