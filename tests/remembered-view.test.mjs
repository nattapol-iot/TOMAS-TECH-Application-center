import assert from "node:assert/strict";
import test from "node:test";
import { restoredView, viewStorageKey } from "../lib/remembered-view.ts";

const allowed = ["dashboard", "estimates", "labor-packages", "support", "documents", "activity", "profile"];
test("refresh restores the selected menu instead of dashboard", () => {
  for (const view of allowed) assert.equal(restoredView(view, allowed, "", undefined, "dashboard"), view);
});
test("missing, obsolete and forbidden pages fall back to dashboard", () => {
  for (const saved of [null, "unknown", "settings"]) {
    assert.equal(restoredView(saved, allowed, "", undefined, "dashboard"), "dashboard");
  }
});
test("explicit support, activity and certificate links win over remembered pages", () => {
  assert.equal(restoredView("estimates", allowed, "#support/12", undefined, "dashboard"), "support");
  assert.equal(restoredView("estimates", allowed, "#activity", undefined, "dashboard"), "activity");
  assert.equal(restoredView("estimates", allowed, "#support/12", "certificate", "dashboard"), "documents");
  assert.equal(restoredView("estimates", ["dashboard", "estimates"], "#activity", undefined, "dashboard"), "dashboard");
});
test("unknown hashes do not override remembered pages and accounts have distinct keys", () => {
  assert.equal(restoredView("estimates", allowed, "#unrelated", undefined, "dashboard"), "estimates");
  assert.notEqual(viewStorageKey(1), viewStorageKey(2));
});
