import assert from "node:assert/strict";
import test from "node:test";
import { actualDiscipline, forecastOf, laborCost, planFigures, type EstimateFigures } from "../src/project-cost.js";
import { projectBudgetStates, type ProjectCostItem } from "../src/project-cost-model.js";

/*
 * People cost to date and the forecast at completion (owner decision 2026-11-23, part 3 of the My week design): the
 * hours people confirm in My Work are the actual, and the forecast is the actual plus what the plan still has to do.
 */
const row = (id: number, parentId: number | null, kind: string, planManDays: number, change: Record<string, unknown> = {}) => ({
  id,
  parentId,
  kind,
  planManDays,
  isMilestone: false,
  name: `row ${id}`,
  ...change,
});

test("confirmed hours count for the row's typed discipline or installation heading, otherwise for whoever worked them", () => {
  const rows = new Map([
    [1, row(1, null, "phase", 0, { name: "Install on site" })],
    [2, row(2, 1, "task", 4)],
    [3, row(3, null, "phase", 0, { name: "Design" })],
    [4, row(4, 3, "task", 4, { discipline: "Mechanical" })],
    [5, row(5, 3, "task", 4)],
  ]);
  assert.equal(actualDiscipline({ workKey: "Project-2", department: "Electrical Engineer Dept." }, rows), "Installation");
  assert.equal(actualDiscipline({ workKey: "Project-4", department: "Electrical Engineer Dept." }, rows), "Mechanical");
  assert.equal(actualDiscipline({ workKey: "Project-5", department: "IoT Engineer Dept." }, rows), "Software");
  assert.equal(actualDiscipline({ workKey: null, department: "Electrical Engineer Dept." }, rows), "Electrical", "other work on the project counts for the person's discipline");
  assert.equal(actualDiscipline({ workKey: "Project-99", department: "Sales" }, rows), "Unassigned");
});

test("the forecast is the actual plus the plan still to do; unknown when the plan's dates are", () => {
  assert.equal(forecastOf(5, 10, 4), 11);
  assert.equal(forecastOf(5, 10, 12), 5, "a plan past its man-days has nothing left to do");
  assert.equal(forecastOf(5, 10, null), null);
  // 10 MD planned for an electrical engineer, 4 of them due by today; 6 MD confirmed already.
  const plan = planFigures(
    [row(1, null, "task", 10)],
    new Map([[1, { planStart: "2026-11-01", planFinish: "2026-11-10", status: "In Progress", percentComplete: 40 }]]),
    "2026-11-04",
    new Map([[1, ["Electrical Engineer Dept."]]]),
    [{ workKey: "Project-1", department: "Electrical Engineer Dept.", hours: 48 }],
  );
  assert.deepEqual([plan.plannedManDays, plan.toDateManDays, plan.actualManDays], [10, 4, 6]);
  const estimate: EstimateFigures = {
    estimateNo: "EST-1",
    materialTotal: 0,
    outsourceTotal: 0,
    total: 0,
    internalCost: 50000,
    internalManDays: 10,
    manualManDays: null,
    disciplines: [{ discipline: "Electrical", manDays: 10, cost: 50000 }],
  };
  const labor = laborCost(estimate, plan, { budget: true, purchases: true, laborMoney: true });
  assert.deepEqual([labor.actualManDays, labor.forecastManDays, labor.actualCost, labor.forecastCost], [6, 12, 30000, 60000]);
  // The plan is within its 10 MD budget, but the forecast is over it: the project reads as over.
  const item = { hardware: { budget: null, requested: 0, approved: 0, ordered: 0 }, outsource: { budget: null, requested: 0, approved: 0, ordered: 0 }, labor } as unknown as ProjectCostItem;
  assert.equal(projectBudgetStates(item).labor, "over");
  // Hours on a project with no plan rows: the actual counts, the forecast is unknown.
  const bare = planFigures([], null, "2026-11-04", new Map(), [{ workKey: null, department: "IoT Engineer Dept.", hours: 4 }]);
  assert.deepEqual([bare.actualManDays, bare.toDateManDays, bare.disciplines.map((entry) => [entry.discipline, entry.actualManDays])], [0.5, null, [["Software", 0.5]]]);
});
