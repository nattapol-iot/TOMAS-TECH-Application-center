import assert from "node:assert/strict";
import test from "node:test";
import { disciplineHours, elapsedOf, headingProgress } from "../src/project-page-overview.js";
import { scheduleLeaves } from "../src/project-health.js";
import { resolveTasks, taskRow } from "../src/schedule-service.js";

const raw = (change: Record<string, unknown>) => ({
  id: 1,
  project_id: 1,
  parent_id: null,
  sort_order: 1,
  kind: "task",
  name: "Task",
  is_milestone: false,
  origin: "Plan",
  created_by: 1,
  visibility: "Internal",
  plan_start: "2026-11-02",
  plan_days: 5,
  start_mode: "manual",
  predecessor_id: null,
  lag_days: 0,
  pic_external: "",
  plan_man_days: 0,
  baseline_start: null,
  baseline_end: null,
  baseline_days: 0,
  baseline_rev: 0,
  actual_start: null,
  actual_end: null,
  forecast_end: null,
  percent_done: 0,
  status: "Not Started",
  blocked_reason: null,
  note: null,
  actual_man_days: 0,
  updated_by: 1,
  updated_at: null,
  row_version: Buffer.alloc(8),
  ...change,
});
const TODAY = "2026-11-11";
const tasks = [
  raw({ id: 10, kind: "phase", name: "Design", plan_start: "2026-11-02", plan_days: 20 }),
  raw({ id: 11, parent_id: 10, name: "Layout", plan_start: "2026-11-02", plan_days: 5, percent_done: 100, status: "Done", plan_man_days: 5, discipline: "Mechanical" }),
  raw({ id: 12, parent_id: 10, sort_order: 2, name: "Wiring", plan_start: "2026-11-09", plan_days: 2, percent_done: 50, status: "In Progress", plan_man_days: 2, discipline: "Electrical" }),
  raw({ id: 20, kind: "phase", sort_order: 2, name: "Install", plan_start: "2026-12-01", plan_days: 5 }),
  raw({ id: 21, parent_id: 20, name: "Site work", plan_start: "2026-12-01", plan_days: 5, plan_man_days: 4, labor_source: "Outsourced", discipline: "Installation" }),
  raw({ id: 30, kind: "phase", sort_order: 3, name: "Not broken down", plan_start: "2027-01-04", plan_days: 3 }),
].map((row) => taskRow(row as Parameters<typeof taskRow>[0]));

test("a row's elapsed share runs from 0 before it starts to 1 on its last day", () => {
  assert.equal(elapsedOf("2026-11-10", "2026-11-13", "2026-11-09"), 0);
  assert.equal(elapsedOf("2026-11-10", "2026-11-13", "2026-11-11"), 0.5);
  assert.equal(elapsedOf("2026-11-10", "2026-11-13", "2026-11-13"), 1);
  assert.equal(elapsedOf(null, "2026-11-13", TODAY), 0);
});

test("each main heading shows the work-day weighted progress of the rows under it against the plan, and lateness", () => {
  const leaves = scheduleLeaves(tasks, resolveTasks(tasks, new Set()));
  const [design, install, empty] = headingProgress(tasks, leaves, TODAY);
  assert.equal(design!.name, "Design");
  assert.equal(design!.rows, 2);
  // Layout 5 work days at 100 %, Wiring 2 work days at 50 %: (500 + 100) / 7.
  assert.equal(design!.progress, Math.round((600 / 7) * 10) / 10);
  assert.equal(design!.late, true, "Wiring ended on the 10th and is not done");
  assert.equal(design!.planStart, "2026-11-02");
  assert.equal(install!.progress, 0);
  assert.equal(install!.plannedProgress, 0);
  assert.equal(install!.late, false);
  assert.equal(empty!.rows, 0);
  assert.equal(empty!.progress, null, "a heading not broken down yet shows no figure");
});

test("hours by discipline: the Estimate's man-days and the Cost tab's plan split, as hours", () => {
  const rows = disciplineHours(
    [
      { discipline: "Electrical", manDays: 4 },
      { discipline: "Software", manDays: 2 },
    ],
    [
      { discipline: "Electrical", plannedManDays: 2, actualManDays: 0.75 },
      { discipline: "Mechanical", plannedManDays: 5, actualManDays: 3.75 },
      { discipline: "Unassigned", plannedManDays: 0, actualManDays: 0 },
    ],
    8,
  );
  assert.deepEqual(rows, [
    { discipline: "Electrical", budgetHours: 32, planHours: 16, actualHours: 6 },
    { discipline: "Software", budgetHours: 16, planHours: 0, actualHours: 0 },
    { discipline: "Mechanical", budgetHours: 0, planHours: 40, actualHours: 30 },
  ]);
});

test("a closed project's headings are never late and have no planned-today marker", () => {
  const leaves = scheduleLeaves(tasks, resolveTasks(tasks, new Set()));
  const [design] = headingProgress(tasks, leaves, TODAY, true);
  assert.equal(design!.late, false);
  assert.equal(design!.plannedProgress, null);
});
