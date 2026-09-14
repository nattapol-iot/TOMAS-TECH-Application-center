import assert from "node:assert/strict";
import test from "node:test";
import {
  ESTIMATE_SECTION_CODES, MANHOUR_SECTION_CODE, copiedLineOwnerId, expenseSectionCode,
  otherCostSectionCode, requestedSections, resolveCopiedSupplier, touchedSections,
} from "../src/estimate-copy-plan.js";

test("expense and other-cost lines resolve to the section that controls them", () => {
  for (const [type, section] of [["Travel", "08"], ["Transportation", "08"], ["Accommodation", "09"], ["Per Diem", "09"], ["Equipment Rental", "10"], ["Other", "10"]]) {
    assert.equal(expenseSectionCode(type!), section);
  }
  for (const [category, section] of [["Outsource", "07"], ["Transportation", "08"], ["Accommodation", "09"], ["Other Cost", "10"]]) {
    assert.equal(otherCostSectionCode(category!), section);
  }
  assert.equal(expenseSectionCode("Unknown"), null);
  assert.equal(otherCostSectionCode("Unknown"), null);
});

test("the sections a copy writes into are derived from the lines it carries", () => {
  assert.deepEqual(touchedSections({
    costCategoryCodes: ["01", "01", "03"], manhourLineCount: 2, expenseTypes: ["Travel"], otherCostCategories: ["Outsource"],
  }), ["01", "03", "06", "07", "08"]);
  assert.deepEqual(touchedSections({ costCategoryCodes: [], manhourLineCount: 0, expenseTypes: [], otherCostCategories: [] }), []);
  assert.deepEqual(touchedSections({ costCategoryCodes: ["99"], manhourLineCount: 0, expenseTypes: ["Nope"], otherCostCategories: ["Nope"] }), []);
  assert.equal(MANHOUR_SECTION_CODE, "06");
});

test("an absent section selection copies every section and unknown codes are dropped", () => {
  assert.deepEqual(requestedSections(undefined), [...ESTIMATE_SECTION_CODES]);
  assert.deepEqual(requestedSections(null), [...ESTIMATE_SECTION_CODES]);
  assert.deepEqual(requestedSections(["03", "01", "03"]), ["01", "03"]);
  assert.deepEqual(requestedSections(["99", "", "DROP TABLE"]), []);
  assert.deepEqual(requestedSections("01"), []);
});

test("an inactive supplier is cleared where it is optional and refused where the ledger requires it", () => {
  assert.deepEqual(resolveCopiedSupplier(null, null, false), { supplierId: null, dropped: false, blocked: false });
  assert.deepEqual(resolveCopiedSupplier(4, "active", false), { supplierId: 4, dropped: false, blocked: false });
  assert.deepEqual(resolveCopiedSupplier(4, "inactive", false), { supplierId: null, dropped: true, blocked: false });
  assert.deepEqual(resolveCopiedSupplier(4, "inactive", true), { supplierId: 4, dropped: false, blocked: true });
  assert.deepEqual(resolveCopiedSupplier(4, "active", true), { supplierId: 4, dropped: false, blocked: false });
});

test("a copied line stays with the engineer who already owns the section", () => {
  assert.equal(copiedLineOwnerId(9, 7), 9);
  assert.equal(copiedLineOwnerId(null, 7), 7);
  assert.equal(copiedLineOwnerId(0, 7), 7);
});
