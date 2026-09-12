import assert from "node:assert/strict";
import test from "node:test";
import { suggestErpCategory } from "../lib/erp-category-suggest.ts";

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
  for (const sourceType of ["OtherCostLine", "Contingency"]) {
    for (const description of ["Software license", "Operator training", "Maintenance reserve"]) {
      assert.equal(suggestErpCategory({ sourceType, internalCategory: "Other", description }), null);
    }
  }
});
