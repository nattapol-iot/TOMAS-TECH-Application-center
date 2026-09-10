import assert from "node:assert/strict";
import test from "node:test";
import { estimateIssueTab } from "../lib/estimate-ux.ts";

test("estimate-level missing engineering effort opens manhour instead of cost items", () => {
  assert.equal(estimateIssueTab({ code: "engineering_manhour_required", entityType: "Estimate" }), "manhour");
  assert.equal(estimateIssueTab({ code: "empty_estimate", entityType: "Estimate" }), "cost");
});
test("line issues route to their owning tab and unknown issues stay in validation", () => {
  for (const [entityType, tab] of [["CostItem", "cost"], ["ManhourLine", "manhour"], ["ExpenseLine", "manhour"], ["OtherCostLine", "other"], ["Estimate", "validation"]]) {
    assert.equal(estimateIssueTab({ code: "future_validation_rule", entityType }), tab);
  }
});
