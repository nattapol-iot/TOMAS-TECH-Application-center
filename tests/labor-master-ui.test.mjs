import assert from "node:assert/strict";
import test from "node:test";
import {
  applyOverrides,
  draftFromPackageLine,
  hoursFromManDays,
  manDaysFromHours,
  packageApplyBlocker,
  previewLaborLine,
  rateDailyFor,
  rateHourlyFor,
  rateLabel,
  rateSelectable,
  rateWindowLabel,
  seedFromRate,
  summarizeLaborApply,
} from "../lib/labor-master.ts";

const TODAY = "2026-09-11";

const rate = {
  id: 12,
  code: "ENG-MID",
  level: "Middle Engineer",
  department: "Engineering",
  roleActivity: "Commissioning",
  engineeringHourly: 625,
  engineeringDaily: 5000,
  installationHourly: 500,
  installationDaily: 4000,
  effectiveFrom: "2026-01-01",
  effectiveTo: null,
  status: "Effective",
  version: 2,
  defaultErpCategory: "Service",
};

const internalLine = {
  id: 51,
  activity: "Site commissioning",
  department: "Engineering",
  level: "Middle Engineer",
  costType: "Engineering",
  provider: "Internal",
  rateBasis: "Hourly",
  defaultEngineers: 2,
  defaultManDays: 1.25,
  defaultHours: 10,
  defaultHoursPerDay: 8,
  referenceDailyRate: 4800,
  defaultErpCategory: "Service",
};

const supplierLine = {
  ...internalLine,
  id: 52,
  activity: "Outsourced commissioning",
  provider: "Supplier",
  rateBasis: "Daily",
  defaultHours: null,
  defaultManDays: 2,
  referenceDailyRate: 7500,
  defaultErpCategory: null,
};

test("a rate row reads as one line an estimator can scan", () => {
  assert.equal(rateLabel(rate), "ENG-MID · Middle Engineer · Engineering — Commissioning");
  assert.equal(rateLabel({ ...rate, code: null, roleActivity: "" }), "Middle Engineer · Engineering");
  assert.equal(rateWindowLabel(rate), "2026-01-01 → open");
  assert.equal(rateWindowLabel({ ...rate, effectiveTo: "2026-09-30" }), "2026-01-01 → 2026-09-30");
});

test("only an effective rate may seed a line, though the others are still shown", () => {
  assert.equal(rateSelectable({ status: "Effective" }), true);
  for (const status of ["Future", "Expired", "Inactive"]) {
    assert.equal(rateSelectable({ status }), false, status);
  }
});

test("selecting a rate fills the classification and previews the rate the server will freeze", () => {
  assert.deepEqual(seedFromRate(rate, "Engineering"), {
    department: "Engineering", level: "Middle Engineer", dailyRate: 5000, hourlyRate: 625, erpCategory: "Service",
  });
  assert.deepEqual(seedFromRate(rate, "Installation"), {
    department: "Engineering", level: "Middle Engineer", dailyRate: 4000, hourlyRate: 500, erpCategory: "Service",
  });
  assert.equal(rateDailyFor("Installation", rate), 4000);
  assert.equal(rateHourlyFor("Engineering", rate), 625);
});

test("an hourly package line opens in hours; a daily one opens in man-days", () => {
  assert.deepEqual(draftFromPackageLine(internalLine, TODAY), {
    skip: false, engineers: 2, hours: 10, manDays: 1.25, hoursPerDay: 8,
    dailyRate: null, supplierId: null, quotationNumber: "", priceDate: TODAY, erpCategory: "Service",
  });
  const supplierDraft = draftFromPackageLine(supplierLine, TODAY);
  assert.equal(supplierDraft.hours, null);
  assert.equal(supplierDraft.manDays, 2);
  // A supplier line opens at its reference rate, which the estimator can change.
  assert.equal(supplierDraft.dailyRate, 7500);
});

test("the preview costs an internal line at the live master rate, never at the package reference", () => {
  const draft = draftFromPackageLine(internalLine, TODAY);
  const preview = previewLaborLine(internalLine, draft, 5000);
  assert.equal(preview.manDays, 1.25);
  assert.equal(preview.estimatedCost, 2 * 1.25 * 5000);
  assert.equal(preview.ready, true);
  assert.equal(preview.blocker, null);
  // 4800 was only what the library remembered.
  assert.notEqual(preview.estimatedCost, 2 * 1.25 * 4800);
});

test("the preview shows when rounding changes the hours the line will report", () => {
  const draft = { ...draftFromPackageLine(internalLine, TODAY), hours: 1, hoursPerDay: 3 };
  const preview = previewLaborLine(internalLine, draft, 5000);
  assert.equal(preview.manDays, 0.33);
  assert.equal(preview.requestedHours, 1);
  assert.equal(preview.effectiveHours, 0.99);
  assert.equal(preview.hoursDiffer, true);

  const exact = { ...draftFromPackageLine(internalLine, TODAY), hours: 16, hoursPerDay: 8 };
  assert.equal(previewLaborLine(internalLine, exact, 5000).hoursDiffer, false);
  assert.equal(manDaysFromHours(16, 8), 2);
  assert.equal(hoursFromManDays(2, 8), 16);
});

test("an internal line with no effective master rate is blocked, not priced at zero", () => {
  const draft = draftFromPackageLine(internalLine, TODAY);
  const preview = previewLaborLine(internalLine, draft, null);
  assert.equal(preview.ready, false);
  assert.match(preview.blocker, /No effective rate master covers Middle Engineer/);
  assert.equal(preview.estimatedCost, null);
});

test("a supplier line is blocked until it carries its own quotation", () => {
  const draft = draftFromPackageLine(supplierLine, TODAY);
  assert.match(previewLaborLine(supplierLine, draft, null).blocker, /supplier, a quotation number and a price date/);
  const complete = { ...draft, supplierId: 14, quotationNumber: "QT-2026-118" };
  const preview = previewLaborLine(supplierLine, complete, null);
  assert.equal(preview.blocker, null);
  // A supplier line never needs the internal master rate.
  assert.equal(preview.estimatedCost, 2 * 2 * 7500);
  assert.match(previewLaborLine(supplierLine, { ...complete, dailyRate: 0 }, null).blocker, /quoted daily rate/);
});

test("impossible effort is named rather than rounded away", () => {
  const draft = draftFromPackageLine(supplierLine, TODAY);
  assert.match(previewLaborLine(supplierLine, { ...draft, engineers: 0 }, 5000).blocker, /Engineers/);
  assert.match(previewLaborLine(supplierLine, { ...draft, manDays: 0 }, 5000).blocker, /Duration/);
  assert.match(previewLaborLine(supplierLine, { ...draft, hoursPerDay: 25 }, 5000).blocker, /Hours per day/);
});

test("the apply summary counts skipped and blocked lines separately and refuses while any is blocked", () => {
  const lines = [internalLine, supplierLine];
  const drafts = [draftFromPackageLine(internalLine, TODAY), draftFromPackageLine(supplierLine, TODAY)];
  const previews = [previewLaborLine(internalLine, drafts[0], 5000), previewLaborLine(supplierLine, drafts[1], null)];
  const blockedSummary = summarizeLaborApply(previews, drafts);
  assert.equal(blockedSummary.included, 1);
  assert.equal(blockedSummary.blocked, 1);
  assert.equal(blockedSummary.canApply, false);

  // Skipping the blocked line is the explicit way forward.
  const skipped = [drafts[0], { ...drafts[1], skip: true }];
  const ready = summarizeLaborApply(previews, skipped);
  assert.equal(ready.included, 1);
  assert.equal(ready.skipped, 1);
  assert.equal(ready.blocked, 0);
  assert.equal(ready.manDays, 2.5);
  assert.equal(ready.estimatedCost, 12500);
  assert.equal(ready.canApply, true);

  // Nothing left to add is not an apply either.
  const allSkipped = summarizeLaborApply(previews, drafts.map((draft) => ({ ...draft, skip: true })));
  assert.equal(allSkipped.canApply, false);
  assert.equal(allSkipped.skipped, 2);

  // A line with no rate to cost it with is always blocked, so a reported total
  // never silently omits an included line.
  const uncosted = summarizeLaborApply(
    [previewLaborLine(supplierLine, { ...drafts[1], supplierId: 14, quotationNumber: "Q", dailyRate: null }, null)],
    [{ ...drafts[1], supplierId: 14, quotationNumber: "Q", dailyRate: null }],
  );
  assert.equal(uncosted.included, 0);
  assert.equal(uncosted.blocked, 1);
  assert.equal(uncosted.estimatedCost, 0);
  assert.equal(lines.length, 2);
});

test("the request body carries only what the estimator actually changed", () => {
  const lines = [internalLine];
  const untouched = applyOverrides(lines, [draftFromPackageLine(internalLine, TODAY)], TODAY);
  assert.deepEqual(untouched, []);

  const edited = applyOverrides(lines, [{ ...draftFromPackageLine(internalLine, TODAY), engineers: 3, hours: 4 }], TODAY);
  assert.deepEqual(edited, [{ lineId: 51, engineers: 3, hours: 4 }]);

  // Switching an hourly line to man-days sends man-days, not hours.
  const byDays = applyOverrides(lines, [{ ...draftFromPackageLine(internalLine, TODAY), hours: null, manDays: 3 }], TODAY);
  assert.deepEqual(byDays, [{ lineId: 51, manDays: 3 }]);

  const skipped = applyOverrides(lines, [{ ...draftFromPackageLine(internalLine, TODAY), skip: true }], TODAY);
  assert.deepEqual(skipped, [{ lineId: 51, skip: true }]);

  // An internal line never sends a rate, because the server would refuse it.
  const withRate = applyOverrides(lines, [{ ...draftFromPackageLine(internalLine, TODAY), dailyRate: 9999 }], TODAY);
  assert.deepEqual(withRate, []);
});

test("supplier facts always travel with the apply", () => {
  const draft = { ...draftFromPackageLine(supplierLine, TODAY), supplierId: 14, quotationNumber: " QT-2026-118 ", dailyRate: 7900 };
  assert.deepEqual(applyOverrides([supplierLine], [draft], TODAY), [{
    lineId: 52, dailyRate: 7900, supplierId: 14, quotationNumber: "QT-2026-118", priceDate: TODAY,
  }]);
});

test("an ERP override is sent, and clearing the package default is an override too", () => {
  const lines = [internalLine];
  const changed = applyOverrides(lines, [{ ...draftFromPackageLine(internalLine, TODAY), erpCategory: "Installation" }], TODAY);
  assert.deepEqual(changed, [{ lineId: 51, erpCategory: "Installation" }]);
  const cleared = applyOverrides(lines, [{ ...draftFromPackageLine(internalLine, TODAY), erpCategory: null }], TODAY);
  assert.deepEqual(cleared, [{ lineId: 51, erpCategory: null }]);
});

test("a package that cannot be applied says why before the estimator fills anything in", () => {
  assert.equal(packageApplyBlocker("Active", 3, true), null);
  assert.match(packageApplyBlocker("Active", 3, false), /cannot add man-hour lines/);
  assert.match(packageApplyBlocker("Retired", 3, true), /retired/);
  assert.match(packageApplyBlocker("Draft", 3, true), /published packages/);
  assert.match(packageApplyBlocker("Active", 0, true), /no activities/);
});
