import assert from "node:assert/strict";
import test from "node:test";
import { planFromTemplate, templateFromPlan } from "../lib/plan-template.ts";

// Task doc 4.1-4.3: a plan saved as a template keeps working days, and comes back as dates that skip weekends and holidays.
const holidays = new Set(["2026-11-25"]);
const plan = [
  { level: 1, name: "Design", party: "", discipline: null, start: "2026-11-23", end: "2026-11-27", workDays: 4, planHours: 0 },
  { level: 2, name: "Layout", party: "Tomas", discipline: "Electrical", start: "2026-11-23", end: "2026-11-24", workDays: 2, planHours: 16 },
  { level: 2, name: "Review", party: "SC/Tomas", discipline: null, start: "2026-11-26", end: "2026-11-27", workDays: 2, planHours: 4 },
  { level: 1, name: "Install", party: "", discipline: null, start: null, end: null, workDays: null, planHours: 0 },
];

test("a plan as a template: working day numbers from the plan's first working day, no people or dates", () => {
  const { plan: saved, rows } = templateFromPlan(plan, holidays);
  assert.deepEqual(
    saved.map((row) => [row.level, row.name, row.startWorkDay, row.workDays, row.planHours]),
    [
      [1, "Design", 1, 4, 0],
      [2, "Layout", 1, 2, 16],
      [2, "Review", 3, 2, 4], // Mon 23, Tue 24, (Wed 25 holiday), Thu 26 = working day 3
      [1, "Install", null, null, 0],
    ],
  );
  assert.equal(saved[1].party, "Tomas");
  assert.deepEqual(rows, [
    { name: "Design", startOffsetDays: 0, durationDays: 5 },
    { name: "Install", startOffsetDays: null, durationDays: null },
  ]);
});

test("a template applied from a start date skips weekends and company holidays; an old one counts calendar days", () => {
  const { plan: saved, rows } = templateFromPlan(plan, holidays);
  // Start on Monday 7 Dec 2026 with Thursday 10 Dec a holiday.
  const applied = planFromTemplate({ rows, plan: saved }, "2026-12-07", new Set(["2026-12-10"]));
  assert.deepEqual(
    applied.map((row) => [row.name, row.start, row.end, row.planManDays]),
    [
      ["Design", "2026-12-07", "2026-12-11", 0], // spans its rows
      ["Layout", "2026-12-07", "2026-12-08", 2],
      ["Review", "2026-12-09", "2026-12-11", 0.5],
      ["Install", "2026-12-07", "2026-12-07", 0],
    ],
  );
  const old = planFromTemplate({ rows: [{ name: "Kick-off", startOffsetDays: 2, durationDays: 3 }] }, "2026-12-05", new Set());
  assert.deepEqual(old, [{ level: 1, name: "Kick-off", party: "", discipline: null, start: "2026-12-07", end: "2026-12-09", planManDays: 0 }]);
});

test("a row with rows under it spans them, as the plan rolls dates up, at any depth", () => {
  const applied = planFromTemplate(
    {
      rows: [],
      plan: [
        { level: 1, name: "H", party: "", discipline: null, startWorkDay: 1, workDays: 1, planHours: 0 },
        { level: 2, name: "T", party: "", discipline: null, startWorkDay: 3, workDays: 1, planHours: 0 },
        { level: 3, name: "S", party: "", discipline: null, startWorkDay: 6, workDays: 2, planHours: 0 },
      ],
    },
    "2026-12-07",
    new Set(),
  );
  assert.deepEqual(
    applied.map((row) => [row.name, row.start, row.end]),
    [
      ["H", "2026-12-14", "2026-12-15"],
      ["T", "2026-12-14", "2026-12-15"],
      ["S", "2026-12-14", "2026-12-15"],
    ],
  );
});
