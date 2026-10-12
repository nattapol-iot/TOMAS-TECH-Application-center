import assert from "node:assert/strict";
import test from "node:test";
import { assetChangeEvents, parseAssetInput, warrantyState, type AssetInput } from "../src/installed-base.js";

const base = { customerId: 4, category: "Gateway", name: "Edge Gateway Line 3" };

test("an asset needs a customer, a known category and a name; everything else is optional", () => {
  const parsed = parseAssetInput(base);
  assert.equal(parsed.status, "Active");
  assert.equal(parsed.customerSiteId, null);
  assert.equal(parsed.serialNo, "");
  assert.throws(() => parseAssetInput({ ...base, customerId: undefined }), /Customer is required/);
  assert.throws(() => parseAssetInput({ ...base, category: "Robot" }), /Category must be one of/);
  assert.throws(() => parseAssetInput({ ...base, name: "   " }), /Name is required/);
  assert.throws(() => parseAssetInput({ ...base, status: "Lost" }), /Status must be one of/);
  assert.throws(() => parseAssetInput({ ...base, customerId: "4x" }), /Customer is invalid/);
});

test("dates, links and the repository name are checked before anything reaches SQL", () => {
  assert.throws(() => parseAssetInput({ ...base, installedOn: "2026-10-12", warrantyUntil: "2026-10-01" }), /Warranty cannot end before/);
  assert.throws(() => parseAssetInput({ ...base, installedOn: "12/10/2026" }), /YYYY-MM-DD/);
  assert.throws(() => parseAssetInput({ ...base, repository: "../etc" }), /TMTHub repository name/);
  assert.throws(() => parseAssetInput({ ...base, monitorProgramId: 9 }), /belongs to a Site Monitor site/);
  assert.throws(() => parseAssetInput({ ...base, replacedById: 3 }), /Only a replaced asset/);
  const full = parseAssetInput({
    ...base, customerSiteId: "7", projectId: 12, monitorSiteId: 2, monitorProgramId: 9, repository: "fts-plc-collect-data",
    installedOn: "2026-01-15", warrantyUntil: "2028-01-15", status: "Replaced", replacedById: 3, serialNo: "  SN-001  ", notes: "line 1\nline 2",
  });
  assert.equal(full.customerSiteId, 7);
  assert.equal(full.serialNo, "SN-001");
  assert.equal(full.notes, "line 1\nline 2");
  assert.equal(full.replacedById, 3);
});

test("an edit becomes the events people look for, and the rest folds into one", () => {
  const before: AssetInput = parseAssetInput({ ...base, firmwareVersion: "1.0.0", locationDetail: "Cabinet A", ipAddress: "10.0.0.5" });
  assert.deepEqual(assetChangeEvents(before, before), []);
  const after: AssetInput = { ...before, status: "Faulty", firmwareVersion: "1.1.0", locationDetail: "Cabinet B", ipAddress: "10.0.0.6", model: "X2" };
  const events = assetChangeEvents(before, after);
  assert.deepEqual(events.map((event) => event.kind), ["StatusChanged", "FirmwareChanged", "Moved", "Updated"]);
  assert.equal(events[0]!.summary, "Active → Faulty");
  assert.equal(events[1]!.summary, "1.0.0 → 1.1.0");
  assert.match(events[3]!.summary, /model, IP address/);
  const replaced = assetChangeEvents(before, { ...before, status: "Replaced", replacedById: 8 });
  assert.equal(replaced[0]!.kind, "Replaced");
});

test("warranty reads expired, expiring within 60 days, covered or none on the business date", () => {
  assert.equal(warrantyState(null, "2026-10-12"), "none");
  assert.equal(warrantyState("2026-10-11", "2026-10-12"), "expired");
  assert.equal(warrantyState("2026-10-12", "2026-10-12"), "expiring");
  assert.equal(warrantyState("2026-12-11", "2026-10-12"), "expiring");
  assert.equal(warrantyState("2026-12-12", "2026-10-12"), "covered");
});
