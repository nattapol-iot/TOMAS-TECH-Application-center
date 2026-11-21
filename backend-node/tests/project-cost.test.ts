import assert from "node:assert/strict";
import test from "node:test";
import { averageDailyRate, elapsedShare, laborCost, planFigures, projectCost, purchaseCost, type EstimateFigures, type PlanFigures, type RowSpan } from "../src/project-cost.js";
import {
  budgetLeft, budgetShare, budgetState, canViewProjectCost, costTotals, DEFAULT_COST_SORT, matchesCostSearch, nextCostSort, projectBudgetStates, shortAmount, sortCostItems, stateCounts,
  type CostAccess, type ProjectCostItem,
} from "../src/project-cost-model.js";

const ALL: CostAccess = { budget: true, purchases: true, laborMoney: true };
const row = (id: number, parentId: number | null, kind: string, planManDays: number, laborSource?: string) => ({ id, parentId, kind, planManDays, isMilestone: false, name: `row ${id}`, laborSource });
const span = (planStart: string | null, planFinish: string | null, status = "In Progress", percentComplete = 0): RowSpan => ({ planStart, planFinish, status, percentComplete });
const estimate = (change: Partial<EstimateFigures> = {}): EstimateFigures => ({ estimateNo: "EST-1", materialTotal: 1000, outsourceTotal: 200, total: 2500, internalCost: 40000, internalManDays: 10, manualManDays: null, ...change });
const plan = (change: Partial<PlanFigures> = {}): PlanFigures => ({ plannedManDays: 8, outsourcedManDays: 0, toDateManDays: 2, unplannedRows: 0, rows: [], ...change });

test("canViewProjectCost: a Leader and everyone above, by any role held", () => {
  for (const role of ["Leader", "Project Manager", "Engineering Manager", "Sales Manager", "Management", "CEO", "Admin"]) assert.equal(canViewProjectCost([role]), true, role);
  for (const role of ["Engineer", "Sales Engineer", "Purchasing", "Warehouse", "Inventory Controller"]) assert.equal(canViewProjectCost([role]), false, role);
  assert.equal(canViewProjectCost(["Engineer", "Leader"]), true);
  assert.equal(canViewProjectCost([]), false);
});

test("elapsedShare: nothing before the start, all of it from the last day on, calendar days in between, and all of a finished row", () => {
  assert.equal(elapsedShare(span("2026-11-10", "2026-11-19"), "2026-11-09"), 0);
  assert.equal(elapsedShare(span("2026-11-10", "2026-11-19"), "2026-11-10"), 0.1);
  assert.equal(elapsedShare(span("2026-11-10", "2026-11-19"), "2026-11-14"), 0.5);
  assert.equal(elapsedShare(span("2026-11-10", "2026-11-19"), "2026-11-19"), 1);
  assert.equal(elapsedShare(span("2026-11-10", "2026-11-19"), "2026-12-01"), 1);
  assert.equal(elapsedShare(span("2026-12-01", "2026-12-05", "Done"), "2026-11-14"), 1);
  assert.equal(elapsedShare(span(null, null), "2026-11-14"), 0);
  assert.equal(elapsedShare(undefined, "2026-11-14"), 0);
});

test("planFigures: counts each piece of work once, keeps outsourced man-days apart, and weighs to-date by each row's own dates", () => {
  const rows = [
    row(1, null, "phase", 0),
    row(2, 1, "task", 10),             // its sub rows carry the man-days: 4 + 2
    row(3, 2, "task", 4),
    row(4, 2, "task", 2, "Outsourced"),
    row(5, null, "task", 6),
    row(6, null, "task", 0),           // no man-days: unplanned
  ];
  const spans = new Map<number, RowSpan>([
    [1, span("2026-11-01", "2026-11-30", "In Progress", 40)], [3, span("2026-11-10", "2026-11-19")], [4, span("2026-11-01", "2026-11-05")],
    [5, span("2026-12-01", "2026-12-10")],
  ]);
  const figures = planFigures(rows, spans, "2026-11-14");
  assert.deepEqual({ ...figures, rows: undefined }, { plannedManDays: 10, outsourcedManDays: 2, toDateManDays: 2, unplannedRows: 1, rows: undefined });
  assert.deepEqual(figures.rows, [
    { id: 1, name: "row 1", planStart: "2026-11-01", planFinish: "2026-11-30", percentComplete: 40, plannedManDays: 4, outsourcedManDays: 2, toDateManDays: 2 },
    { id: 5, name: "row 5", planStart: "2026-12-01", planFinish: "2026-12-10", percentComplete: 0, plannedManDays: 6, outsourcedManDays: 0, toDateManDays: 0 },
  ]);
});

test("planFigures: a schedule that cannot be resolved still gives the planned man-days, and says nothing about to-date", () => {
  const figures = planFigures([row(1, null, "task", 3)], null, "2026-11-14");
  assert.equal(figures.plannedManDays, 3);
  assert.equal(figures.toDateManDays, null);
  assert.equal(figures.rows[0]?.toDateManDays, null);
});

test("laborCost: budget from the estimate's internal labor, money at its average rate", () => {
  assert.equal(averageDailyRate(estimate()), 4000);
  assert.deepEqual(laborCost(estimate(), plan(), ALL), {
    source: "estimate", budgetManDays: 10, plannedManDays: 8, outsourcedManDays: 0, toDateManDays: 2, unplannedRows: 0,
    dailyRate: 4000, budgetCost: 40000, plannedCost: 32000, toDateCost: 8000,
  });
});

test("laborCost: no money without the right, and none for a typed budget, which has no rate", () => {
  const hidden = laborCost(estimate(), plan(), { ...ALL, laborMoney: false });
  assert.deepEqual([hidden.dailyRate, hidden.budgetCost, hidden.plannedCost, hidden.toDateCost], [null, null, null, null]);
  assert.equal(hidden.budgetManDays, 10);
  const manual = laborCost(estimate({ estimateNo: null, internalCost: 0, internalManDays: 0, manualManDays: 25 }), plan(), ALL);
  assert.deepEqual([manual.source, manual.budgetManDays, manual.budgetCost, manual.plannedCost], ["manual", 25, null, null]);
  const none = laborCost(undefined, plan({ toDateManDays: null }), ALL);
  assert.deepEqual([none.source, none.budgetManDays, none.toDateCost], ["none", null, null]);
});

test("purchaseCost and projectCost: a figure the viewer may not see is null, never zero", () => {
  assert.deepEqual(purchaseCost(1000, { requested: 400, approved: 300, ordered: 100 }, ALL), { budget: 1000, requested: 400, approved: 300, ordered: 100 });
  assert.deepEqual(purchaseCost(1000, { requested: 400, approved: 300, ordered: 100 }, { ...ALL, purchases: false }), { budget: 1000, requested: null, approved: null, ordered: null });
  assert.deepEqual(purchaseCost(1000, undefined, { ...ALL, budget: false }), { budget: null, requested: 0, approved: 0, ordered: 0 });
  assert.deepEqual(purchaseCost(undefined, undefined, ALL), { budget: null, requested: 0, approved: 0, ordered: 0 });

  const figures = {
    estimates: new Map([[1, estimate()], [2, estimate({ estimateNo: null, materialTotal: 0, outsourceTotal: 0, total: null, internalCost: 0, internalManDays: 0, manualManDays: 5 })]]),
    purchases: new Map([[1, { requests: 2, hardware: { requested: 1200, approved: 900, ordered: 0 }, outsource: { requested: 0, approved: 0, ordered: 0 } }]]),
    plans: new Map([[1, plan()]]),
  };
  const first = projectCost(1, figures, ALL);
  assert.deepEqual([first.estimateNo, first.estimateTotal, first.requests, first.hardware.budget, first.hardware.requested, first.outsource.budget], ["EST-1", 2500, 2, 1000, 1200, 200]);
  // A project with a typed man-day budget and no estimate has no bought budget at all.
  const second = projectCost(2, figures, ALL);
  assert.deepEqual([second.estimateNo, second.estimateTotal, second.hardware.budget, second.labor.source, second.labor.plannedManDays], [null, null, null, "manual", 0]);
  const hidden = projectCost(1, figures, { budget: false, purchases: false, laborMoney: false });
  assert.deepEqual([hidden.estimateNo, hidden.estimateTotal, hidden.requests, hidden.hardware.budget, hidden.hardware.requested], [null, null, null, null, null]);
});

test("budgetState, budgetShare and budgetLeft", () => {
  assert.equal(budgetState(1000, 1000.01), "over");
  assert.equal(budgetState(1000, 1000), "near");
  assert.equal(budgetState(1000, 900), "near");
  assert.equal(budgetState(1000, 899.99), "within");
  assert.equal(budgetState(null, 500), "none");
  assert.equal(budgetState(1000, null), "none");
  assert.equal(budgetState(0, 0), "none");
  assert.equal(budgetState(0, 10), "over");
  assert.equal(budgetShare(1000, 250), 25);
  assert.equal(budgetShare(1000, 2500), 100);
  assert.equal(budgetShare(0, 10), null);
  assert.equal(budgetLeft(1000, 1200), -200);
  assert.equal(budgetLeft(null, 1200), null);
});

const item = (id: number, number: string, change: Partial<ProjectCostItem> = {}): ProjectCostItem => ({
  id, number, name: `Project ${id}`, customerName: "ACME", managerId: 1, managerName: "Somchai", team: null, status: "Design", estimateNo: `EST-${id}`, estimateTotal: 5000, requests: 1,
  hardware: { budget: 1000, requested: 100, approved: 0, ordered: 0 }, outsource: { budget: 0, requested: 0, approved: 0, ordered: 0 },
  labor: { source: "estimate", budgetManDays: 10, plannedManDays: 5, outsourcedManDays: 0, toDateManDays: 1, unplannedRows: 0, dailyRate: 4000, budgetCost: 40000, plannedCost: 20000, toDateCost: 4000 },
  ...change,
});

test("projectBudgetStates and stateCounts: a project counts by its worst group", () => {
  const over = item(1, "PJ260001", { hardware: { budget: 1000, requested: 1500, approved: 0, ordered: 0 } });
  const near = item(2, "PJ260002", { labor: { ...item(2, "x").labor, plannedManDays: 9.5 } });
  const within = item(3, "PJ260003");
  const none = item(4, "PJ260004", { hardware: { budget: null, requested: 0, approved: 0, ordered: 0 }, outsource: { budget: null, requested: 0, approved: 0, ordered: 0 }, labor: { ...item(4, "x").labor, budgetManDays: null } });
  assert.deepEqual(projectBudgetStates(over), { hardware: "over", outsource: "none", labor: "within", worst: "over" });
  assert.equal(projectBudgetStates(near).worst, "near");
  assert.deepEqual(stateCounts([over, near, within, none]), { over: 1, near: 1, within: 1, none: 1 });
});

test("costTotals: adds what can be seen and keeps a hidden figure null", () => {
  const totals = costTotals([item(1, "A"), item(2, "B", { hardware: { budget: 500, requested: null, approved: null, ordered: null }, labor: { ...item(2, "x").labor, budgetCost: null, plannedCost: null, toDateCost: null, toDateManDays: null } })]);
  assert.deepEqual(totals.hardware, { budget: 1500, requested: 100, approved: 0, ordered: 0 });
  assert.deepEqual([totals.projects, totals.labor.budgetManDays, totals.labor.plannedManDays, totals.labor.toDateManDays, totals.labor.plannedCost], [2, 20, 10, 1, 20000]);
  assert.equal(costTotals([]).hardware.budget, null);
});

test("sortCostItems, nextCostSort and matchesCostSearch", () => {
  const over = item(1, "PJ260001", { hardware: { budget: 1000, requested: 1500, approved: 0, ordered: 0 } });
  const within = item(2, "PJ260010");
  const half = item(3, "PJ260003", { hardware: { budget: 1000, requested: 500, approved: 0, ordered: 0 } });
  const noBudget = item(4, "PJ260004", { hardware: { budget: null, requested: 50, approved: 0, ordered: 0 } });
  // By default the projects to look at come first, then the newest number.
  assert.deepEqual(sortCostItems([within, half, noBudget, over], DEFAULT_COST_SORT).map((entry) => entry.number), ["PJ260001", "PJ260010", "PJ260004", "PJ260003"]);
  // By a share: the biggest first, and rows with nothing to measure last either way.
  const byHardware = nextCostSort(DEFAULT_COST_SORT, "hardware");
  assert.deepEqual(byHardware, { key: "hardware", descending: true });
  assert.deepEqual(sortCostItems([within, half, noBudget, over], byHardware).map((entry) => entry.number), ["PJ260001", "PJ260003", "PJ260010", "PJ260004"]);
  assert.deepEqual(sortCostItems([within, half, noBudget, over], nextCostSort(byHardware, "hardware")).map((entry) => entry.number), ["PJ260010", "PJ260003", "PJ260001", "PJ260004"]);
  assert.deepEqual(sortCostItems([within, over], nextCostSort(DEFAULT_COST_SORT, "number")).map((entry) => entry.number), ["PJ260001", "PJ260010"]);
  assert.equal(matchesCostSearch(over, "  pj2600 "), true);
  assert.equal(matchesCostSearch(over, "acme"), true);
  assert.equal(matchesCostSearch(over, "est-1"), true);
  assert.equal(matchesCostSearch(over, "nobody"), false);
});

test("shortAmount: headline figures in K, M and B", () => {
  assert.deepEqual([shortAmount(950), shortAmount(9999), shortAmount(12500), shortAmount(320000), shortAmount(1250000), shortAmount(45600000), shortAmount(2000000000)], ["950", "9999", "12.5K", "320K", "1.25M", "45.6M", "2B"]);
});
