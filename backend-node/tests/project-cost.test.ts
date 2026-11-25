import assert from "node:assert/strict";
import test from "node:test";
import {
  averageDailyRate,
  disciplineRate,
  elapsedShare,
  laborCost,
  planFigures,
  projectCost,
  purchaseCost,
  rowDisciplines,
  type EstimateFigures,
  type PlanFigures,
  type RowSpan,
} from "../src/project-cost.js";
import {
  budgetLeft,
  budgetShare,
  budgetState,
  canViewProjectCost,
  costTotals,
  budgeted,
  DEFAULT_COST_SORT,
  disciplineOfDepartment,
  laborOf,
  matchesCostSearch,
  namesInstallation,
  nextCostSort,
  projectBudgetStates,
  shortAmount,
  sortCostItems,
  stateCounts,
  type CostAccess,
  type LaborCost,
  type ProjectCostItem,
} from "../src/project-cost-model.js";

const ALL: CostAccess = { budget: true, purchases: true, laborMoney: true };
const row = (id: number, parentId: number | null, kind: string, planManDays: number, laborSource?: string, name = `row ${id}`) => ({
  id,
  parentId,
  kind,
  planManDays,
  isMilestone: false,
  name,
  laborSource,
});
const span = (planStart: string | null, planFinish: string | null, status = "In Progress", percentComplete = 0): RowSpan => ({ planStart, planFinish, status, percentComplete });
// Electrical 6 MD at 5,000 and Software 4 MD at 2,500: 10 MD, 40,000, 4,000 a day on average.
const estimate = (change: Partial<EstimateFigures> = {}): EstimateFigures => ({
  estimateNo: "EST-1",
  materialTotal: 1000,
  outsourceTotal: 200,
  total: 2500,
  internalCost: 40000,
  internalManDays: 10,
  manualManDays: null,
  disciplines: [
    { discipline: "Electrical", manDays: 6, cost: 30000 },
    { discipline: "Software", manDays: 4, cost: 10000 },
  ],
  ...change,
});
const plan = (change: Partial<PlanFigures> = {}): PlanFigures => ({
  plannedManDays: 8,
  outsourcedManDays: 0,
  toDateManDays: 2,
  actualManDays: 0,
  unplannedRows: 0,
  disciplines: [
    { discipline: "Electrical", plannedManDays: 5, toDateManDays: 2, actualManDays: 0 },
    { discipline: "Mechanical", plannedManDays: 3, toDateManDays: 0, actualManDays: 0 },
  ],
  rows: [],
  ...change,
});

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

test("disciplineOfDepartment: the company's departments as labor disciplines", () => {
  assert.equal(disciplineOfDepartment("Electrical Engineer Dept."), "Electrical");
  assert.equal(disciplineOfDepartment("Mechanical Engineer Dept."), "Mechanical");
  for (const department of ["IoT Engineer Dept.", "Application Engineer Dept.", "System Architect & System Engineer Dept.", "Software"])
    assert.equal(disciplineOfDepartment(department), "Software", department);
  for (const department of ["Sales", "Purchasing", "", null, undefined]) assert.equal(disciplineOfDepartment(department), "Unassigned", String(department));
  assert.equal(namesInstallation("Installation and commissioning"), true);
  assert.equal(namesInstallation("ติดตั้งหน้างาน"), true);
  assert.equal(namesInstallation("Design"), false);
});

test("rowDisciplines: installation by the heading, otherwise the PICs' departments, the task's for a function, else Unassigned", () => {
  const rows = new Map(
    [
      row(1, null, "phase", 0, undefined, "Design"),
      row(2, 1, "task", 4),
      row(3, 2, "task", 2),
      row(4, null, "phase", 0, undefined, "Installation"),
      row(5, 4, "task", 3),
      row(6, null, "task", 1, undefined, "Install the server software"),
      row(7, null, "task", 1),
    ].map((item) => [item.id, item] as const),
  );
  const departments = new Map<number, string[]>([
    [2, ["Electrical Engineer Dept.", "IoT Engineer Dept."]],
    [5, ["Mechanical Engineer Dept."]],
    [6, ["Application Engineer Dept."]],
  ]);
  assert.deepEqual(rowDisciplines(2, rows, departments), ["Electrical", "Software"]);
  // A function has no PIC of its own: its task's people do it.
  assert.deepEqual(rowDisciplines(3, rows, departments), ["Electrical", "Software"]);
  // Under an installation heading the work is Installation, whoever does it.
  assert.deepEqual(rowDisciplines(5, rows, departments), ["Installation"]);
  // Only a heading names installation: a task that merely says "install" keeps its PIC's discipline.
  assert.deepEqual(rowDisciplines(6, rows, departments), ["Software"]);
  assert.deepEqual(rowDisciplines(7, rows, departments), ["Unassigned"]);
});

test("planFigures: counts each piece of work once, keeps outsourced man-days apart, and weighs to-date by each row's own dates", () => {
  const rows = [
    row(1, null, "phase", 0),
    row(2, 1, "task", 10), // its sub rows carry the man-days: 4 + 2
    row(3, 2, "task", 4),
    row(4, 2, "task", 2, "Outsourced"),
    row(5, null, "task", 6),
    row(6, null, "task", 0), // no man-days: unplanned
  ];
  const spans = new Map<number, RowSpan>([
    [1, span("2026-11-01", "2026-11-30", "In Progress", 40)],
    [3, span("2026-11-10", "2026-11-19")],
    [4, span("2026-11-01", "2026-11-05")],
    [5, span("2026-12-01", "2026-12-10")],
  ]);
  // Row 2 is held by an electrical and an IoT engineer (its function 3 inherits them); row 5 by nobody.
  const figures = planFigures(rows, spans, "2026-11-14", new Map([[2, ["Electrical Engineer Dept.", "IoT Engineer Dept."]]]));
  assert.deepEqual(
    { ...figures, rows: undefined, disciplines: undefined },
    { plannedManDays: 10, outsourcedManDays: 2, toDateManDays: 2, actualManDays: 0, unplannedRows: 1, rows: undefined, disciplines: undefined },
  );
  assert.deepEqual(figures.disciplines, [
    { discipline: "Electrical", plannedManDays: 2, toDateManDays: 1, actualManDays: 0 },
    { discipline: "Software", plannedManDays: 2, toDateManDays: 1, actualManDays: 0 },
    { discipline: "Unassigned", plannedManDays: 6, toDateManDays: 0, actualManDays: 0 },
  ]);
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
  assert.deepEqual(figures.disciplines, [{ discipline: "Unassigned", plannedManDays: 3, toDateManDays: null, actualManDays: 0 }]);
});

test("laborCost: budget and money by discipline at each discipline's own rate, and the project is their sum", () => {
  assert.equal(averageDailyRate(estimate()), 4000);
  assert.equal(disciplineRate(estimate(), "Electrical"), 5000);
  assert.equal(disciplineRate(estimate(), "Software"), 2500);
  // The estimate has no mechanical labor: its man-days cost the estimate's average rate.
  assert.equal(disciplineRate(estimate(), "Mechanical"), 4000);
  assert.deepEqual(laborCost(estimate(), plan(), ALL), {
    source: "estimate",
    budgetManDays: 10,
    plannedManDays: 8,
    outsourcedManDays: 0,
    toDateManDays: 2,
    unplannedRows: 0,
    dailyRate: 4000,
    budgetCost: 40000,
    plannedCost: 37000,
    toDateCost: 10000,
    actualManDays: 0,
    forecastManDays: 6,
    actualCost: 0,
    forecastCost: 27000,
    disciplines: [
      {
        discipline: "Electrical",
        budgetManDays: 6,
        plannedManDays: 5,
        toDateManDays: 2,
        budgetCost: 30000,
        plannedCost: 25000,
        toDateCost: 10000,
        actualManDays: 0,
        forecastManDays: 3,
        actualCost: 0,
        forecastCost: 15000,
      },
      // Planned with nothing in the estimate: a budget of zero, so it reads as over.
      {
        discipline: "Mechanical",
        budgetManDays: 0,
        plannedManDays: 3,
        toDateManDays: 0,
        budgetCost: 0,
        plannedCost: 12000,
        toDateCost: 0,
        actualManDays: 0,
        forecastManDays: 3,
        actualCost: 0,
        forecastCost: 12000,
      },
      // In the estimate with nothing planned yet.
      {
        discipline: "Software",
        budgetManDays: 4,
        plannedManDays: 0,
        toDateManDays: 0,
        budgetCost: 10000,
        plannedCost: 0,
        toDateCost: 0,
        actualManDays: 0,
        forecastManDays: 0,
        actualCost: 0,
        forecastCost: 0,
      },
    ],
  });
});

test("laborCost: man-days nobody could place have no budget; no money without the right, and none for a typed budget", () => {
  const unplaced = laborCost(estimate(), plan({ disciplines: [{ discipline: "Unassigned", plannedManDays: 8, toDateManDays: 2, actualManDays: 0 }] }), ALL);
  assert.deepEqual(
    unplaced.disciplines.find((item) => item.discipline === "Unassigned"),
    {
      discipline: "Unassigned",
      budgetManDays: null,
      plannedManDays: 8,
      toDateManDays: 2,
      budgetCost: null,
      plannedCost: 32000,
      toDateCost: 8000,
      actualManDays: 0,
      forecastManDays: 6,
      actualCost: 0,
      forecastCost: 24000,
    },
  );
  const hidden = laborCost(estimate(), plan(), { ...ALL, laborMoney: false });
  assert.deepEqual([hidden.dailyRate, hidden.budgetCost, hidden.plannedCost, hidden.toDateCost], [null, null, null, null]);
  assert.equal(hidden.budgetManDays, 10);
  assert.deepEqual(
    hidden.disciplines.map((item) => [item.discipline, item.budgetManDays, item.plannedManDays, item.budgetCost, item.plannedCost, item.toDateCost]),
    [
      ["Electrical", 6, 5, null, null, null],
      ["Mechanical", 0, 3, null, null, null],
      ["Software", 4, 0, null, null, null],
    ],
  );
  const manual = laborCost(estimate({ estimateNo: null, internalCost: 0, internalManDays: 0, manualManDays: 25, disciplines: [] }), plan(), ALL);
  assert.deepEqual([manual.source, manual.budgetManDays, manual.budgetCost, manual.plannedCost], ["manual", 25, null, null]);
  // A typed budget is one figure for the project: its disciplines carry the plan only.
  assert.deepEqual(
    manual.disciplines.map((item) => [item.discipline, item.budgetManDays, item.plannedManDays]),
    [
      ["Electrical", null, 5],
      ["Mechanical", null, 3],
    ],
  );
  const none = laborCost(undefined, plan({ toDateManDays: null, disciplines: [{ discipline: "Electrical", plannedManDays: 8, toDateManDays: null, actualManDays: 0 }] }), ALL);
  assert.deepEqual([none.source, none.budgetManDays, none.toDateCost, none.disciplines[0]?.toDateManDays], ["none", null, null, null]);
});

test("purchaseCost and projectCost: a figure the viewer may not see is null, never zero", () => {
  assert.deepEqual(purchaseCost(1000, { requested: 400, approved: 300, ordered: 100 }, ALL), { budget: 1000, requested: 400, approved: 300, ordered: 100 });
  assert.deepEqual(purchaseCost(1000, { requested: 400, approved: 300, ordered: 100 }, { ...ALL, purchases: false }), { budget: 1000, requested: null, approved: null, ordered: null });
  assert.deepEqual(purchaseCost(1000, undefined, { ...ALL, budget: false }), { budget: null, requested: 0, approved: 0, ordered: 0 });
  assert.deepEqual(purchaseCost(undefined, undefined, ALL), { budget: null, requested: 0, approved: 0, ordered: 0 });

  const figures = {
    estimates: new Map([
      [1, estimate()],
      [2, estimate({ estimateNo: null, materialTotal: 0, outsourceTotal: 0, total: null, internalCost: 0, internalManDays: 0, manualManDays: 5, disciplines: [] })],
    ]),
    purchases: new Map([[1, { requests: 2, hardware: { requested: 1200, approved: 900, ordered: 0 }, outsource: { requested: 0, approved: 0, ordered: 0 } }]]),
    plans: new Map([[1, plan()]]),
  };
  const first = projectCost(1, figures, ALL);
  assert.deepEqual([first.estimateNo, first.estimateTotal, first.requests, first.hardware.budget, first.hardware.requested, first.outsource.budget], ["EST-1", 2500, 2, 1000, 1200, 200]);
  assert.deepEqual(
    first.labor.disciplines.map((item) => item.discipline),
    ["Electrical", "Mechanical", "Software"],
  );
  // A project with a typed man-day budget and no estimate has no bought budget at all.
  const second = projectCost(2, figures, ALL);
  assert.deepEqual(
    [second.estimateNo, second.estimateTotal, second.hardware.budget, second.labor.source, second.labor.plannedManDays, second.labor.disciplines.length],
    [null, null, null, "manual", 0, 0],
  );
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

const labor = (change: Partial<LaborCost> = {}): LaborCost => ({
  source: "estimate",
  budgetManDays: 10,
  plannedManDays: 5,
  outsourcedManDays: 0,
  toDateManDays: 1,
  unplannedRows: 0,
  dailyRate: 4000,
  budgetCost: 40000,
  plannedCost: 20000,
  toDateCost: 4000,
  actualManDays: 0,
  forecastManDays: null,
  actualCost: null,
  forecastCost: null,
  disciplines: [
    {
      discipline: "Electrical",
      budgetManDays: 4,
      plannedManDays: 4.5,
      toDateManDays: 1,
      budgetCost: 16000,
      plannedCost: 18000,
      toDateCost: 4000,
      actualManDays: 0,
      forecastManDays: null,
      actualCost: null,
      forecastCost: null,
    },
    {
      discipline: "Software",
      budgetManDays: 6,
      plannedManDays: 0.5,
      toDateManDays: 0,
      budgetCost: 24000,
      plannedCost: 2000,
      toDateCost: 0,
      actualManDays: 0,
      forecastManDays: null,
      actualCost: null,
      forecastCost: null,
    },
  ],
  ...change,
});
const item = (id: number, number: string, change: Partial<ProjectCostItem> = {}): ProjectCostItem => ({
  id,
  number,
  name: `Project ${id}`,
  customerName: "ACME",
  managerId: 1,
  managerName: "Somchai",
  team: null,
  status: "Design",
  estimateNo: `EST-${id}`,
  estimateTotal: 5000,
  requests: 1,
  hardware: { budget: 1000, requested: 100, approved: 0, ordered: 0 },
  outsource: { budget: 0, requested: 0, approved: 0, ordered: 0 },
  labor: labor(),
  ...change,
});

test("laborOf: the project's figures in all, one discipline's, and nothing for a discipline it does not have", () => {
  assert.equal(laborOf(labor(), null).plannedManDays, 5);
  assert.deepEqual(laborOf(labor(), "Electrical"), {
    discipline: "Electrical",
    budgetManDays: 4,
    plannedManDays: 4.5,
    toDateManDays: 1,
    budgetCost: 16000,
    plannedCost: 18000,
    toDateCost: 4000,
    actualManDays: 0,
    forecastManDays: null,
    actualCost: null,
    forecastCost: null,
  });
  assert.deepEqual(laborOf(labor(), "Mechanical"), {
    budgetManDays: null,
    plannedManDays: 0,
    toDateManDays: 0,
    budgetCost: null,
    plannedCost: null,
    toDateCost: null,
    actualManDays: 0,
    forecastManDays: 0,
    actualCost: null,
    forecastCost: null,
  });
  assert.equal(laborOf(labor({ toDateManDays: null }), "Mechanical").toDateManDays, null);
});

test("projectBudgetStates and stateCounts: a project counts by its worst group, and by one discipline when it is chosen", () => {
  const over = item(1, "PJ260001", { hardware: { budget: 1000, requested: 1500, approved: 0, ordered: 0 } });
  const near = item(2, "PJ260002", { labor: labor({ plannedManDays: 9.5 }) });
  const within = item(3, "PJ260003");
  const none = item(4, "PJ260004", {
    hardware: { budget: null, requested: 0, approved: 0, ordered: 0 },
    outsource: { budget: null, requested: 0, approved: 0, ordered: 0 },
    labor: labor({ budgetManDays: null, disciplines: [] }),
  });
  assert.deepEqual(projectBudgetStates(over), { hardware: "over", outsource: "none", labor: "within", worst: "over" });
  assert.equal(projectBudgetStates(near).worst, "near");
  assert.deepEqual(stateCounts([over, near, within, none]), { over: 1, near: 1, within: 1, none: 1 });
  // In all the project is within its man-days, but its electrical labor is over (4.5 of 4).
  assert.equal(projectBudgetStates(within).labor, "within");
  assert.equal(projectBudgetStates(within, "Electrical").labor, "over");
  assert.equal(projectBudgetStates(within, "Software").labor, "within");
  assert.deepEqual(stateCounts([within, none], "Electrical"), { over: 1, near: 0, within: 0, none: 1 });
});

test("costTotals: adds what can be seen, keeps a hidden figure null, and adds each discipline across the rows", () => {
  const hiddenLabor = labor({
    budgetCost: null,
    plannedCost: null,
    toDateCost: null,
    toDateManDays: null,
    disciplines: [
      {
        discipline: "Mechanical",
        budgetManDays: 10,
        plannedManDays: 5,
        toDateManDays: null,
        budgetCost: null,
        plannedCost: null,
        toDateCost: null,
        actualManDays: 0,
        forecastManDays: null,
        actualCost: null,
        forecastCost: null,
      },
    ],
  });
  const totals = costTotals([item(1, "A"), item(2, "B", { hardware: { budget: 500, requested: null, approved: null, ordered: null }, labor: hiddenLabor })]);
  assert.deepEqual(totals.hardware, { budget: 1500, requested: 100, approved: 0, ordered: 0 });
  assert.deepEqual([totals.projects, totals.labor.budgetManDays, totals.labor.plannedManDays, totals.labor.toDateManDays, totals.labor.plannedCost], [2, 20, 10, 1, 20000]);
  assert.deepEqual(totals.disciplines, [
    {
      discipline: "Electrical",
      budgetManDays: 4,
      plannedManDays: 4.5,
      toDateManDays: 1,
      budgetCost: 16000,
      plannedCost: 18000,
      toDateCost: 4000,
      actualManDays: 0,
      forecastManDays: null,
      actualCost: null,
      forecastCost: null,
      unbudgetedManDays: 0,
      unbudgetedForecastManDays: 0,
      budgetedForecastManDays: null,
    },
    {
      discipline: "Mechanical",
      budgetManDays: 10,
      plannedManDays: 5,
      toDateManDays: null,
      budgetCost: null,
      plannedCost: null,
      toDateCost: null,
      actualManDays: 0,
      forecastManDays: null,
      actualCost: null,
      forecastCost: null,
      unbudgetedManDays: 0,
      unbudgetedForecastManDays: 0,
      budgetedForecastManDays: null,
    },
    {
      discipline: "Software",
      budgetManDays: 6,
      plannedManDays: 0.5,
      toDateManDays: 0,
      budgetCost: 24000,
      plannedCost: 2000,
      toDateCost: 0,
      actualManDays: 0,
      forecastManDays: null,
      actualCost: null,
      forecastCost: null,
      unbudgetedManDays: 0,
      unbudgetedForecastManDays: 0,
      budgetedForecastManDays: null,
    },
  ]);
  // A project with no budget: its plan is said apart, and the figure against budget leaves it out (budgeted).
  const unbudgeted = item(3, "C", { labor: labor({ budgetManDays: null, plannedManDays: 30, forecastManDays: 32, disciplines: [] }) });
  const mixed = costTotals([item(1, "A"), unbudgeted]);
  assert.equal(mixed.labor.unbudgetedManDays, 30);
  assert.equal(mixed.labor.unbudgetedForecastManDays, 32);
  // The budgeted project has no forecast: none is made up from the unbudgeted one.
  assert.deepEqual(budgeted(mixed.labor), { budgetManDays: mixed.labor.budgetManDays, plannedManDays: mixed.labor.plannedManDays - 30, forecastManDays: null });
  assert.equal(costTotals([]).hardware.budget, null);
  assert.deepEqual(costTotals([]).disciplines, []);
});

test("sortCostItems, nextCostSort and matchesCostSearch", () => {
  const over = item(1, "PJ260001", { hardware: { budget: 1000, requested: 1500, approved: 0, ordered: 0 } });
  const within = item(2, "PJ260010");
  const half = item(3, "PJ260003", { hardware: { budget: 1000, requested: 500, approved: 0, ordered: 0 } });
  const noBudget = item(4, "PJ260004", { hardware: { budget: null, requested: 50, approved: 0, ordered: 0 } });
  // By default the projects to look at come first, then the newest number.
  assert.deepEqual(
    sortCostItems([within, half, noBudget, over], DEFAULT_COST_SORT).map((entry) => entry.number),
    ["PJ260001", "PJ260010", "PJ260004", "PJ260003"],
  );
  // By a share: the biggest first, and rows with nothing to measure last either way.
  const byHardware = nextCostSort(DEFAULT_COST_SORT, "hardware");
  assert.deepEqual(byHardware, { key: "hardware", descending: true });
  assert.deepEqual(
    sortCostItems([within, half, noBudget, over], byHardware).map((entry) => entry.number),
    ["PJ260001", "PJ260003", "PJ260010", "PJ260004"],
  );
  assert.deepEqual(
    sortCostItems([within, half, noBudget, over], nextCostSort(byHardware, "hardware")).map((entry) => entry.number),
    ["PJ260010", "PJ260003", "PJ260001", "PJ260004"],
  );
  assert.deepEqual(
    sortCostItems([within, over], nextCostSort(DEFAULT_COST_SORT, "number")).map((entry) => entry.number),
    ["PJ260001", "PJ260010"],
  );
  // By people, for one discipline: the project with software labor planned comes before the one with none.
  const idle = item(5, "PJ260005", {
    labor: labor({
      disciplines: [
        {
          discipline: "Software",
          budgetManDays: 6,
          plannedManDays: 0,
          toDateManDays: 0,
          budgetCost: 24000,
          plannedCost: 0,
          toDateCost: 0,
          actualManDays: 0,
          forecastManDays: null,
          actualCost: null,
          forecastCost: null,
        },
      ],
    }),
  });
  assert.deepEqual(
    sortCostItems([idle, within], nextCostSort(DEFAULT_COST_SORT, "labor"), "Software").map((entry) => entry.number),
    ["PJ260010", "PJ260005"],
  );
  assert.equal(matchesCostSearch(over, "  pj2600 "), true);
  assert.equal(matchesCostSearch(over, "acme"), true);
  assert.equal(matchesCostSearch(over, "est-1"), true);
  assert.equal(matchesCostSearch(over, "nobody"), false);
});

test("shortAmount: headline figures in K, M and B", () => {
  assert.deepEqual(
    [shortAmount(950), shortAmount(9999), shortAmount(12500), shortAmount(320000), shortAmount(1250000), shortAmount(45600000), shortAmount(2000000000)],
    ["950", "9999", "12.5K", "320K", "1.25M", "45.6M", "2B"],
  );
});
