import assert from "node:assert/strict";
import test from "node:test";
import { estimateBusinessDate, estimateIssueTab, estimateNextAction } from "../lib/estimate-ux.ts";

const nextAction = (overrides = {}) => estimateNextAction({
  criticalCount: 0,
  warningCount: 0,
  costItemCount: 3,
  manhourLineCount: 2,
  canEditCostItems: true,
  canEditManhour: true,
  canSubmit: false,
  canApprove: false,
  ...overrides,
});

test("estimate-level missing engineering effort opens manhour instead of cost items", () => {
  assert.equal(estimateIssueTab({ code: "engineering_manhour_required", entityType: "Estimate" }), "manhour");
  assert.equal(estimateIssueTab({ code: "empty_estimate", entityType: "Estimate" }), "cost");
});
test("line issues route to their owning tab and unknown issues stay in validation", () => {
  for (const [entityType, tab] of [["CostItem", "cost"], ["ManhourLine", "manhour"], ["ExpenseLine", "manhour"], ["OtherCostLine", "other"], ["Estimate", "validation"]]) {
    assert.equal(estimateIssueTab({ code: "future_validation_rule", entityType }), tab);
  }
});

test("estimate next action prioritizes blockers and missing cost inputs", () => {
  assert.deepEqual(nextAction({ criticalCount: 2, warningCount: 5, costItemCount: 0, manhourLineCount: 0 }), { kind: "resolve-blockers", tab: "validation" });
  assert.deepEqual(nextAction({ costItemCount: 0, manhourLineCount: 0 }), { kind: "add-cost", tab: "cost" });
  assert.deepEqual(nextAction({ manhourLineCount: 0 }), { kind: "add-effort", tab: "manhour" });
});

test("estimate next action uses workflow capability before advisory warnings", () => {
  assert.deepEqual(nextAction({ warningCount: 8, canSubmit: true }), { kind: "submit-review", tab: "review" });
  assert.deepEqual(nextAction({ warningCount: 8, canApprove: true }), { kind: "approve", tab: "review" });
  assert.deepEqual(nextAction({ warningCount: 8 }), { kind: "review-warnings", tab: "validation" });
});

test("read-only estimates do not direct users to add missing lines", () => {
  assert.deepEqual(nextAction({ costItemCount: 0, manhourLineCount: 0, canEditCostItems: false, canEditManhour: false }), { kind: "review-summary", tab: "summary" });
});

test("ERP export date follows the Bangkok business day", () => {
  assert.equal(estimateBusinessDate(new Date("2026-09-10T18:30:00.000Z")), "2026-09-11");
});
