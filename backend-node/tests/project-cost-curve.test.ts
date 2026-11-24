import assert from "node:assert/strict";
import test from "node:test";
import { hoursCurve, purchaseCurve } from "../src/project-cost-curve.js";

test("planned man-days spread over each row's working days and confirmed hours add up week by week (task doc 6.1)", () => {
  const curve = hoursCurve(
    [
      // Mon 2 to Fri 13 November: ten working days, one man-day each.
      { planStart: "2026-11-02", planFinish: "2026-11-13", plannedManDays: 10 },
      // Over a weekend and a holiday: its 2 man-days land on Fri 13 and Tue 17 (Mon 16 is a holiday).
      { planStart: "2026-11-13", planFinish: "2026-11-17", plannedManDays: 2 },
      { planStart: null, planFinish: "2026-11-17", plannedManDays: 5 },
    ],
    [
      { date: "2026-11-03", hours: 8 },
      { date: "2026-11-11", hours: 12 },
    ],
    new Set(["2026-11-16"]),
    8,
  );
  assert.deepEqual(curve, [
    { week: "2026-11-02", plannedManDays: 5, actualManDays: 1 },
    { week: "2026-11-09", plannedManDays: 11, actualManDays: 2.5 },
    { week: "2026-11-16", plannedManDays: 12, actualManDays: 2.5 },
  ]);
});

test("hours dated after today and an endless row do not stretch the drawing", () => {
  const curve = hoursCurve(
    [{ planStart: "2026-11-02", planFinish: "2031-11-02", plannedManDays: 4 }],
    [
      { date: "2026-11-03", hours: 8 },
      { date: "2062-11-03", hours: 8 },
    ],
    new Set(),
    8,
    "2026-11-25",
  );
  assert.deepEqual(curve, [{ week: "2026-11-02", plannedManDays: 4, actualManDays: 1 }]);
});

test("no rows and no hours draw nothing", () => {
  assert.deepEqual(hoursCurve([], [], new Set(), 8), []);
});

test("a long plan draws its latest weeks, starting from the totals of the weeks before them", () => {
  const curve = hoursCurve([{ planStart: "2020-01-06", planFinish: "2020-01-10", plannedManDays: 5 }], [{ date: "2026-11-02", hours: 8 }], new Set(), 8);
  assert.equal(curve.length, 160);
  assert.deepEqual(curve.at(-1), { week: "2026-11-02", plannedManDays: 5, actualManDays: 1 });
  assert.equal(curve[0]!.plannedManDays, 5, "the 2020 row is already in the first week drawn");
});

test("bought cost adds up week by week: requested by the request's date, ordered by the order's (task doc 6.2)", () => {
  const result = purchaseCurve(
    [
      { requestedOn: "2026-11-02", orderedOn: "2026-11-12", neededBy: "2026-12-10", category: "01", amount: 1000 },
      { requestedOn: "2026-11-11", orderedOn: null, neededBy: "2026-11-30", category: "07", amount: 500 },
      // Ordered on a day still to come: counted in its category, not yet on the curve.
      { requestedOn: "2026-11-11", orderedOn: "2026-12-01", neededBy: null, category: "01", amount: 200 },
    ],
    new Map([
      ["01", 3000],
      ["07", 400],
    ]),
    "2026-11-25",
  );
  // The totals run on to this week, so the lines reach today.
  assert.deepEqual(result.curve, [
    { week: "2026-11-02", requested: 1000, ordered: 0 },
    { week: "2026-11-09", requested: 1700, ordered: 1000 },
    { week: "2026-11-16", requested: 1700, ordered: 1000 },
    { week: "2026-11-23", requested: 1700, ordered: 1000 },
  ]);
  assert.deepEqual(result.window, { from: "2026-11-30", to: "2026-12-10" });
  assert.deepEqual(result.categories, [
    { category: "01", budget: 3000, requested: 1200, ordered: 1200 },
    { category: "07", budget: 400, requested: 500, ordered: 0 },
  ]);
});

test("without the budget right the categories carry no budget", () => {
  const result = purchaseCurve([{ requestedOn: "2026-11-02", orderedOn: null, neededBy: null, category: "02", amount: 10 }], null, "2026-11-25");
  assert.deepEqual(result.categories, [{ category: "02", budget: null, requested: 10, ordered: 0 }]);
});
