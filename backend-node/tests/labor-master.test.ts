import assert from "node:assert/strict";
import test from "node:test";
import { ApiError } from "../src/errors.js";
import {
  addDays,
  assertLaborLineCost,
  dailyRateFor,
  hourlyRateFor,
  hoursFromManDays,
  laborLineCost,
  laborRateStatus,
  manDaysFromHours,
  parseDefaultErpCategory,
  parseLaborCostType,
  parseLaborProvider,
  parseLaborRateBasis,
  resolveLaborEffort,
  roundTo,
  supersedeWindow,
} from "../src/labor-master.js";

const rate = {
  engineeringHourly: 625,
  engineeringDaily: 5000,
  installationHourly: 500,
  installationDaily: 4000,
};

test("a cost type reads its own pair of rate columns", () => {
  assert.equal(dailyRateFor("Engineering", rate), 5000);
  assert.equal(dailyRateFor("Installation", rate), 4000);
  assert.equal(hourlyRateFor("Engineering", rate), 625);
  assert.equal(hourlyRateFor("Installation", rate), 500);
});

test("hours convert to the man-days the ledger can actually store", () => {
  // 8-hour day: whole days stay whole.
  assert.equal(manDaysFromHours(16, 8), 2);
  assert.equal(manDaysFromHours(4, 8), 0.5);
  // man_days is decimal(9,2), so a third of a day is rounded, not carried.
  assert.equal(manDaysFromHours(10, 8), 1.25);
  assert.equal(manDaysFromHours(1, 3), 0.33);
  // Never rounds down to zero, which the CHECK constraint would reject.
  assert.equal(manDaysFromHours(0.01, 24), 0.01);
});

test("the hours a line reports come back from the rounded man-days, not the request", () => {
  const manDays = manDaysFromHours(1, 3);
  assert.equal(manDays, 0.33);
  // The estimator asked for 1 hour and the line will report 0.99 — visible, not hidden.
  assert.equal(hoursFromManDays(manDays, 3), 0.99);
  assert.equal(hoursFromManDays(manDaysFromHours(16, 8), 8), 16);
});

test("hourly conversion refuses figures the line could not hold", () => {
  assert.throws(() => manDaysFromHours(0, 8), ApiError);
  assert.throws(() => manDaysFromHours(-4, 8), ApiError);
  assert.throws(() => manDaysFromHours(8, 0), ApiError);
  assert.throws(() => manDaysFromHours(8, 25), ApiError);
});

test("rate status reports the window, and inactive overrides it", () => {
  const open = { effectiveFrom: "2026-01-01", effectiveTo: null, isActive: true };
  assert.equal(laborRateStatus(open, "2026-09-11"), "Effective");
  assert.equal(laborRateStatus({ ...open, effectiveFrom: "2026-10-01" }, "2026-09-11"), "Future");
  assert.equal(laborRateStatus({ ...open, effectiveTo: "2026-08-31" }, "2026-09-11"), "Expired");
  assert.equal(laborRateStatus({ ...open, isActive: false }, "2026-09-11"), "Inactive");
  // Boundary days belong to the window.
  assert.equal(laborRateStatus({ effectiveFrom: "2026-09-11", effectiveTo: "2026-09-11", isActive: true }, "2026-09-11"), "Effective");
});

test("calendar arithmetic crosses months and years without a timezone", () => {
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  assert.equal(addDays("2024-03-01", -1), "2024-02-29");
  assert.equal(addDays("2026-01-01", -1), "2025-12-31");
  assert.equal(addDays("2026-09-11", 1), "2026-09-12");
});

test("superseding closes the incumbent the day before the successor starts", () => {
  const incumbent = { effectiveFrom: "2026-01-01", effectiveTo: null, isActive: true };
  assert.deepEqual(supersedeWindow(incumbent, "2026-10-01"), {
    incumbentEffectiveTo: "2026-09-30",
    successorEffectiveFrom: "2026-10-01",
  });
  // Windows touch but never overlap, which is what tr_engineering_rates_no_overlap requires.
  const { incumbentEffectiveTo, successorEffectiveFrom } = supersedeWindow(incumbent, "2026-10-01");
  assert.ok(incumbentEffectiveTo < successorEffectiveFrom);
  assert.equal(addDays(incumbentEffectiveTo, 1), successorEffectiveFrom);
});

test("superseding refuses to rewrite history or to reopen a closed rate", () => {
  const incumbent = { effectiveFrom: "2026-01-01", effectiveTo: null, isActive: true };
  // A successor starting on or before the incumbent's start would erase the
  // window every saved line was priced in.
  assert.throws(() => supersedeWindow(incumbent, "2026-01-01"), (error: unknown) =>
    error instanceof ApiError && error.statusCode === 409 && error.code === "labor_rate_supersede_order");
  assert.throws(() => supersedeWindow(incumbent, "2025-12-31"), (error: unknown) =>
    error instanceof ApiError && error.code === "labor_rate_supersede_order");
  assert.throws(() => supersedeWindow({ ...incumbent, effectiveTo: "2026-06-30" }, "2026-10-01"), (error: unknown) =>
    error instanceof ApiError && error.code === "labor_rate_already_closed");
});

test("a daily package line keeps its stored man-days", () => {
  const line = { rateBasis: "Daily" as const, defaultEngineers: 2, defaultManDays: 3, defaultHours: null, defaultHoursPerDay: 8 };
  assert.deepEqual(resolveLaborEffort(line), {
    engineers: 2, manDays: 3, hoursPerDay: 8, effectiveHours: 24, requestedHours: null,
  });
});

test("an hourly package line converts, and reports what it asked for", () => {
  const line = { rateBasis: "Hourly" as const, defaultEngineers: 1, defaultManDays: 1.25, defaultHours: 10, defaultHoursPerDay: 8 };
  assert.deepEqual(resolveLaborEffort(line), {
    engineers: 1, manDays: 1.25, hoursPerDay: 8, effectiveHours: 10, requestedHours: 10,
  });
});

test("every package default is overrideable, and man-days beats hours beats the stored basis", () => {
  const hourly = { rateBasis: "Hourly" as const, defaultEngineers: 1, defaultManDays: 1.25, defaultHours: 10, defaultHoursPerDay: 8 };
  // Hours override.
  assert.deepEqual(resolveLaborEffort(hourly, { hours: 4 }), {
    engineers: 1, manDays: 0.5, hoursPerDay: 8, effectiveHours: 4, requestedHours: 4,
  });
  // An explicit man-days override wins over the hourly basis entirely.
  assert.deepEqual(resolveLaborEffort(hourly, { manDays: 3 }), {
    engineers: 1, manDays: 3, hoursPerDay: 8, effectiveHours: 24, requestedHours: null,
  });
  // Changing the working day re-derives the hourly conversion.
  assert.deepEqual(resolveLaborEffort(hourly, { hoursPerDay: 10 }), {
    engineers: 1, manDays: 1, hoursPerDay: 10, effectiveHours: 10, requestedHours: 10,
  });
  // Engineers is independent of the effort basis.
  assert.equal(resolveLaborEffort(hourly, { engineers: 4 }).engineers, 4);
});

test("effort resolution rejects values the man-hour line would refuse", () => {
  const line = { rateBasis: "Daily" as const, defaultEngineers: 1, defaultManDays: 1, defaultHours: null, defaultHoursPerDay: 8 };
  assert.throws(() => resolveLaborEffort(line, { engineers: 0 }), ApiError);
  assert.throws(() => resolveLaborEffort(line, { manDays: 0 }), ApiError);
  assert.throws(() => resolveLaborEffort(line, { hoursPerDay: 25 }), ApiError);
  assert.throws(() => resolveLaborEffort(line, { hours: -1 }), ApiError);
});

test("line cost is guarded against the estimate ledger ceiling", () => {
  assert.equal(laborLineCost(2, 3, 5000), 30000);
  assert.equal(assertLaborLineCost("Commissioning", 2, 3, 5000), 30000);
  assert.throws(() => assertLaborLineCost("Commissioning", 999_999, 999_999, 999_999), (error: unknown) =>
    error instanceof ApiError && error.statusCode === 400 && /Commissioning/.test(error.message));
});

test("rounding stays on the stated scale", () => {
  assert.equal(roundTo(1.005, 2), 1.01);
  assert.equal(roundTo(0.1 + 0.2, 4), 0.3);
  assert.equal(roundTo(-1.005, 2), -1.01);
});

test("vocabulary is closed, and Unmapped is not a master default", () => {
  assert.equal(parseLaborCostType("Installation"), "Installation");
  assert.throws(() => parseLaborCostType("Commissioning"), ApiError);
  assert.equal(parseLaborProvider("Supplier"), "Supplier");
  assert.throws(() => parseLaborProvider("Partner"), ApiError);
  assert.equal(parseLaborRateBasis("Hourly"), "Hourly");
  assert.throws(() => parseLaborRateBasis("Monthly"), ApiError);
  assert.equal(parseDefaultErpCategory("Service"), "Service");
  assert.equal(parseDefaultErpCategory(null), null);
  assert.equal(parseDefaultErpCategory(""), null);
  // Unmapped is already the submit-time fallback, so storing it says nothing.
  assert.throws(() => parseDefaultErpCategory("Unmapped"), ApiError);
  assert.throws(() => parseDefaultErpCategory("Consumables"), ApiError);
});
