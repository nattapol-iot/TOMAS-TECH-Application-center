import assert from "node:assert/strict";
import test from "node:test";
import { estimateNavigationKey, restoreEstimateNavigation } from "../lib/estimate-navigation.ts";

test("refresh restores the estimate and labor tab", () => {
  assert.deepEqual(restoreEstimateNavigation('{"estimateId":24,"tab":"manhour"}', null), { estimateId: 24, tab: "manhour" });
});
test("an explicit link opens its document, keeping a tab only for the same document", () => {
  const saved = '{"estimateId":24,"tab":"cost"}';
  assert.deepEqual(restoreEstimateNavigation(saved, 25), { estimateId: 25, tab: "summary" });
  assert.deepEqual(restoreEstimateNavigation(saved, 24), { estimateId: 24, tab: "cost" });
});
test("back to list survives refresh and accounts have separate storage", () => {
  assert.deepEqual(restoreEstimateNavigation('{"estimateId":null,"tab":"summary"}', null), { estimateId: null, tab: "summary" });
  assert.notEqual(estimateNavigationKey(1), estimateNavigationKey(2));
});
test("damaged navigation and obsolete tabs fall back without restoring form data", () => {
  for (const value of [null, 'broken', 'null', '[]', '{"estimateId":-1}', '{"estimateId":"24"}']) {
    assert.deepEqual(restoreEstimateNavigation(value, null), { estimateId: null, tab: "summary" });
  }
  assert.deepEqual(restoreEstimateNavigation('{"estimateId":24,"tab":"erp","draft":{"quantity":9}}', null), { estimateId: 24, tab: "summary" });
});
