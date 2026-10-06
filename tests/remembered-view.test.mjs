import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { hashView, isPlainClick, RECORD_LINK, restoredView, viewFromHash, viewHash, viewStorageKey } from "../lib/remembered-view.ts";

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
  assert.equal(restoredView("estimates", allowed, "#estimate/12", undefined, "dashboard"), "estimates");
  assert.notEqual(viewStorageKey(1), viewStorageKey(2));
});

test("a screen's address opens that screen in a new tab, even over the remembered page", () => {
  assert.equal(viewHash("labor-packages"), "#/labor-packages");
  for (const view of allowed) assert.equal(viewFromHash(viewHash(view)), view);
  assert.equal(restoredView("dashboard", allowed, "#/labor-packages", undefined, "dashboard"), "labor-packages");
  assert.equal(restoredView(null, allowed, "#/estimates", undefined, "dashboard"), "estimates");
  // A forbidden or unknown screen is an explicit link too: it lands on the fallback, not on the remembered page.
  assert.equal(restoredView("estimates", allowed, "#/settings", undefined, "dashboard"), "dashboard");
  assert.equal(restoredView("estimates", allowed, "#/estimates", "certificate", "dashboard"), "documents");
  // Old names are mapped the way the menu maps them (Master -> Customers -> CRM Customers).
  const normalize = view => view === "customers" ? "crm-customers" : view;
  assert.equal(restoredView(null, ["dashboard", "crm-customers"], "#/customers", undefined, "dashboard", normalize), "crm-customers");
  assert.equal(restoredView("customers", ["dashboard", "crm-customers"], "", undefined, "dashboard", normalize), "crm-customers");
});

test("only #/<view> names a screen; record links and in-page anchors do not", () => {
  for (const hash of ["", "#", "#/", "#/Estimates", "#/a/b", "#estimate/12", "#performance-work-evidence", "#/1abc"]) {
    assert.equal(viewFromHash(hash), null, hash);
  }
  assert.equal(hashView("#support"), "support");
  assert.equal(hashView("#support/7"), "support");
  assert.equal(hashView("#activity"), "activity");
  assert.equal(hashView("#/my-work"), "my-work");
  assert.equal(hashView("#crm/4"), null);
  for (const hash of ["#estimate/1", "#inquiry/22", "#crm/333"]) assert.ok(RECORD_LINK.test(hash), hash);
  for (const hash of ["#/estimates", "#support/1", "#estimate/"]) assert.ok(!RECORD_LINK.test(hash), hash);
});

test("Ctrl, Cmd, Shift, Alt and middle clicks are left to the browser", () => {
  const plain = { button: 0, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, defaultPrevented: false };
  assert.equal(isPlainClick(plain), true);
  for (const change of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }, { defaultPrevented: true }]) {
    assert.equal(isPlainClick({ ...plain, ...change }), false, JSON.stringify(change));
  }
});

test("menu entries are links to their screen and the address bar follows the open screen", async () => {
  const app = await readFile(new URL("../app/system/ProductionApp.tsx", import.meta.url), "utf8");
  // A <button> cannot be opened in a new tab; the entry is a link whose plain click stays in the app.
  assert.match(app, /return <a key=\{item\.view\} href=\{viewHash\(item\.view\)\}/);
  assert.match(app, /onClick=\{\(event\) => \{ if \(!isPlainClick\(event\)\) return; event\.preventDefault\(\);/);
  assert.doesNotMatch(app, /return <button key=\{item\.view\}/);
  // Each screen change is a history entry; the first write and a rewrite of an older link replace.
  assert.match(app, /const replace = !addressed\.current \|\| hashView\(hash\) === view;/);
  assert.match(app, /window\.history\[replace \? "replaceState" : "pushState"\]/);
  assert.match(app, /if \(RECORD_LINK\.test\(hash\)\) return;/);
  // Back/Forward go through setView, so permissions and the unsaved-changes prompt still apply.
  assert.match(app, /if \(!allowedViews\(bootstrap\)\.includes\(target\) \|\| !setView\(target\)\)/);
  assert.match(app, /if \(next !== view && !confirmReportNavigation\(\)\) return false;/);
  assert.match(app, /restoredView\(saved, allowed, window\.location\.hash, initialVerifyCode, dailyLanding, requested => landingView\(requested as View, data\.permissions\)\)/);
});
