/**
 * The cost overview of projects (owner request 2026-11-21): the shapes of GET /api/v1/projects/cost-overview and
 * GET /api/v1/projects/:id/cost. No server code is imported here, so the screen reads the same file.
 *
 * Two groups of cost, each as "what the Estimate cost gave" against "what the work has taken":
 *  - Bought: Hardware (estimate categories 01-05) and Outsource (07), against the purchase requests raised for the project.
 *  - People: the internal labor man-days of the estimate against the man-days on the plan, and what the plan says is
 *    used up to today. Nobody records actual hours yet, so "to date" is the plan's figure, not a time sheet.
 * Every amount is an internal cost in THB. Selling prices and margins are not part of this app.
 */

/**
 * What the viewer may see. A figure the viewer may not see is null, never zero. Since the owner's decision of
 * 2026-11-21 everyone who may open the overview sees all of it (FULL_COST_ACCESS); the parts stay apart so a narrower
 * rule can come back in the route without touching the sums or the screen.
 */
export type CostAccess = {
  /** Estimate cost figures. */
  budget: boolean;
  /** Purchase request amounts. */
  purchases: boolean;
  /** People cost in money. */
  laborMoney: boolean;
};
export const FULL_COST_ACCESS: CostAccess = { budget: true, purchases: true, laborMoney: true };

/** One bought group. Requested is every live request; approved and ordered are parts of it. */
export type PurchaseCost = { budget: number | null; requested: number | null; approved: number | null; ordered: number | null };

/**
 * Labor disciplines, as the estimate's labor lines name them (owner 2026-11-21: people cost reads as Electrical,
 * Mechanical and Software labor; Installation is the estimate's fourth). Unassigned holds plan man-days of rows
 * that name nobody whose department is a discipline.
 */
export const LABOR_DISCIPLINES = ["Electrical", "Mechanical", "Software", "Installation", "Unassigned"] as const;
export type LaborDiscipline = (typeof LABOR_DISCIPLINES)[number];

/** Budget against plan, in man-days and (for a viewer who may see it) in money. */
export type LaborFigures = {
  budgetManDays: number | null; plannedManDays: number; toDateManDays: number | null;
  budgetCost: number | null; plannedCost: number | null; toDateCost: number | null;
};
export type LaborDisciplineCost = LaborFigures & { discipline: LaborDiscipline };

/**
 * The discipline of a person's department, for the plan man-days of the rows they hold. Electrical and Mechanical
 * are their own departments; IoT, Application and System engineers write software (the purchase route's Software
 * head is the IoT manager). A department that names none of these is Unassigned.
 */
export function disciplineOfDepartment(department: string | null | undefined): LaborDiscipline {
  const name = (department ?? "").toLocaleLowerCase("en");
  if (/electric|ไฟฟ้า/.test(name)) return "Electrical";
  if (/mechanic|เครื่องกล/.test(name)) return "Mechanical";
  if (/software|application|\biot\b|system|ซอฟต์แวร์|ซอฟท์แวร์|โปรแกรม/.test(name)) return "Software";
  return "Unassigned";
}

/** A plan heading that names installation work; the rows under it are Installation labor, whoever does them. */
export const namesInstallation = (name: string | null | undefined): boolean => /install|ติดตั้ง/i.test(name ?? "");

export type LaborCost = {
  /** Where the man-day budget comes from: the estimate's internal labor, a figure typed by a manager, or nothing yet. */
  source: "estimate" | "manual" | "none";
  budgetManDays: number | null;
  /** Man-days on the plan rows of our own staff; outsourced rows are counted apart and stay out of the budget. */
  plannedManDays: number;
  outsourcedManDays: number;
  /** Own-staff man-days the plan puts on or before today. Null when the plan's dates cannot be worked out. */
  toDateManDays: number | null;
  /** Pieces of work on the plan with no man-days. */
  unplannedRows: number;
  /** The estimate's average internal rate per man-day, and the money it makes of the figures above. Null without the right or a rate. */
  dailyRate: number | null;
  budgetCost: number | null;
  plannedCost: number | null;
  toDateCost: number | null;
  /** The same figures by discipline, in the order of LABOR_DISCIPLINES; only disciplines with a budget or planned man-days. */
  disciplines: LaborDisciplineCost[];
};

/** A project's labor figures in all (null) or for one discipline; a discipline the project has nothing in reads as no budget and nothing planned. */
export function laborOf(labor: LaborCost, discipline: LaborDiscipline | null): LaborFigures {
  if (discipline === null) return labor;
  return labor.disciplines.find((item) => item.discipline === discipline)
    ?? { budgetManDays: null, plannedManDays: 0, toDateManDays: labor.toDateManDays === null ? null : 0, budgetCost: null, plannedCost: null, toDateCost: null };
}

export type ProjectCostItem = {
  id: number; number: string; name: string; customerName: string; managerId: number; managerName: string; team: string | null; status: string;
  estimateNo: string | null;
  /** The estimate's whole cost, with what is neither bought nor own labor (travel, overhead, contingency). */
  estimateTotal: number | null;
  /** Live purchase requests of the project. */
  requests: number | null;
  hardware: PurchaseCost;
  outsource: PurchaseCost;
  labor: LaborCost;
};

export type ProjectCostOverview = { today: string; hoursPerManDay: number; access: CostAccess; items: ProjectCostItem[] };

export type CostModuleRow = { module: string; budget: number | null; requested: number | null; approved: number | null; ordered: number | null };
export type CostRequestRow = { id: number; number: string; status: string; requiredDate: string | null; unit: string | null; amount: number | null; lines: number };
/** A top row of the plan with the man-days under it. */
export type CostPlanRow = { id: number; name: string; planStart: string | null; planFinish: string | null; percentComplete: number;
  plannedManDays: number; outsourcedManDays: number; toDateManDays: number | null; plannedCost: number | null };

export type ProjectCostDetail = {
  today: string; hoursPerManDay: number; access: CostAccess; project: ProjectCostItem;
  /** Bought cost by the estimate's Module, hardware and outsource together. */
  modules: CostModuleRow[];
  requests: CostRequestRow[];
  plan: CostPlanRow[];
};

/**
 * Who sees the cost overview (owner 2026-11-21): a Leader and everyone above - a Leader, any manager, Management,
 * the CEO and Admins. The API refuses everyone else and the Projects screen does not offer them the tab.
 */
export const canViewProjectCost = (roles: readonly string[]): boolean =>
  roles.some((role) => role === "Admin" || role === "Leader" || role === "Management" || role === "CEO" || /manager$/i.test(role));

export const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

/** At or past this share of a budget a figure reads as "near". */
export const NEAR_BUDGET_SHARE = 0.9;

export type BudgetState = "over" | "near" | "within" | "none";

/** How a used figure stands against its budget. No budget, or nothing the viewer may see, is "none". */
export function budgetState(budget: number | null, used: number | null): BudgetState {
  if (budget === null || used === null) return "none";
  if (budget <= 0) return used > 0 ? "over" : "none";
  return used > budget ? "over" : used >= budget * NEAR_BUDGET_SHARE ? "near" : "within";
}

/** Used as a percentage of the budget, 0-100 for the bar; null when there is nothing to measure against. */
export function budgetShare(budget: number | null, used: number | null): number | null {
  if (budget === null || used === null || budget <= 0) return null;
  return Math.max(0, Math.min(100, round2((used / budget) * 100)));
}

/** What is left of a budget; negative when over. */
export const budgetLeft = (budget: number | null, used: number | null): number | null => (budget === null || used === null ? null : round2(budget - used));

const WORST: BudgetState[] = ["over", "near", "within", "none"];

/**
 * The states a project is in, one per group, and the worst of them: the project's own state. With a discipline
 * chosen, the people group is that discipline's man-days.
 */
export function projectBudgetStates(item: Pick<ProjectCostItem, "hardware" | "outsource" | "labor">, discipline: LaborDiscipline | null = null): { hardware: BudgetState; outsource: BudgetState; labor: BudgetState; worst: BudgetState } {
  const hardware = budgetState(item.hardware.budget, item.hardware.requested);
  const outsource = budgetState(item.outsource.budget, item.outsource.requested);
  const people = laborOf(item.labor, discipline);
  const labor = budgetState(people.budgetManDays, people.plannedManDays);
  return { hardware, outsource, labor, worst: WORST.find((state) => state === hardware || state === outsource || state === labor) ?? "none" };
}

/* ---- What the screen works out from the rows: counts, totals, search and order. ---- */

export const BUDGET_STATES: readonly BudgetState[] = ["over", "near", "within", "none"];

/** How many projects are in each state: the numbers on the state filter. */
export function stateCounts(items: readonly Pick<ProjectCostItem, "hardware" | "outsource" | "labor">[], discipline: LaborDiscipline | null = null): Record<BudgetState, number> {
  const counts: Record<BudgetState, number> = { over: 0, near: 0, within: 0, none: 0 };
  for (const item of items) counts[projectBudgetStates(item, discipline).worst] += 1;
  return counts;
}

/** Project number, name, customer, project manager or estimate number, any case. */
export function matchesCostSearch(item: Pick<ProjectCostItem, "number" | "name" | "customerName" | "managerName" | "estimateNo">, search: string): boolean {
  const words = search.trim().toLocaleLowerCase("en");
  if (!words) return true;
  return [item.number, item.name, item.customerName, item.managerName, item.estimateNo ?? ""].some((text) => text.toLocaleLowerCase("en").includes(words));
}

/** Adds what can be seen; null when no row has the figure, so a hidden amount never reads as zero. */
const total = (values: readonly (number | null)[]): number | null => {
  const seen = values.filter((value): value is number => value !== null);
  return seen.length ? round2(seen.reduce((sum, value) => sum + value, 0)) : null;
};
const purchaseTotal = (groups: readonly PurchaseCost[]): PurchaseCost => ({
  budget: total(groups.map((group) => group.budget)), requested: total(groups.map((group) => group.requested)),
  approved: total(groups.map((group) => group.approved)), ordered: total(groups.map((group) => group.ordered)),
});

export type CostTotals = {
  projects: number; hardware: PurchaseCost; outsource: PurchaseCost;
  labor: LaborFigures & Pick<LaborCost, "outsourcedManDays">;
  /** People by discipline across the rows; only disciplines some row has. */
  disciplines: LaborDisciplineCost[];
};

const laborTotal = (figures: readonly LaborFigures[]): LaborFigures => ({
  budgetManDays: total(figures.map((item) => item.budgetManDays)),
  plannedManDays: round2(figures.reduce((sum, item) => sum + item.plannedManDays, 0)),
  toDateManDays: total(figures.map((item) => item.toDateManDays)),
  budgetCost: total(figures.map((item) => item.budgetCost)), plannedCost: total(figures.map((item) => item.plannedCost)), toDateCost: total(figures.map((item) => item.toDateCost)),
});

/** The summary bar: every row on show added up, not only the page in view. */
export function costTotals(items: readonly ProjectCostItem[]): CostTotals {
  return {
    projects: items.length,
    hardware: purchaseTotal(items.map((item) => item.hardware)), outsource: purchaseTotal(items.map((item) => item.outsource)),
    labor: { ...laborTotal(items.map((item) => item.labor)), outsourcedManDays: round2(items.reduce((sum, item) => sum + item.labor.outsourcedManDays, 0)) },
    disciplines: LABOR_DISCIPLINES.flatMap((discipline) => {
      const found = items.flatMap((item) => item.labor.disciplines.filter((entry) => entry.discipline === discipline));
      return found.length ? [{ discipline, ...laborTotal(found) }] : [];
    }),
  };
}

export type CostSortKey = "state" | "number" | "hardware" | "outsource" | "labor";
export type CostSort = { key: CostSortKey; descending: boolean };
/** Projects that need a look come first: over budget, then near it. */
export const DEFAULT_COST_SORT: CostSort = { key: "state", descending: false };

const compareNumber = (left: string, right: string) => left.localeCompare(right, "en", { numeric: true, sensitivity: "base" });
/** Used over budget as a ratio; rows with nothing to measure sort last whichever way the column runs. */
const ratio = (budget: number | null, used: number | null): number | null => (budget === null || used === null || budget <= 0 ? null : used / budget);

export function sortCostItems(items: readonly ProjectCostItem[], sort: CostSort, discipline: LaborDiscipline | null = null): ProjectCostItem[] {
  const direction = sort.descending ? -1 : 1;
  const byRatio = (pick: (item: ProjectCostItem) => number | null) => (left: ProjectCostItem, right: ProjectCostItem) => {
    const a = pick(left), b = pick(right);
    if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
    return (a - b) * direction;
  };
  const order: Record<CostSortKey, (left: ProjectCostItem, right: ProjectCostItem) => number> = {
    state: (left, right) => (BUDGET_STATES.indexOf(projectBudgetStates(left, discipline).worst) - BUDGET_STATES.indexOf(projectBudgetStates(right, discipline).worst)) * direction,
    number: (left, right) => compareNumber(left.number, right.number) * direction,
    hardware: byRatio((item) => ratio(item.hardware.budget, item.hardware.requested)),
    outsource: byRatio((item) => ratio(item.outsource.budget, item.outsource.requested)),
    labor: byRatio((item) => { const people = laborOf(item.labor, discipline); return ratio(people.budgetManDays, people.plannedManDays); }),
  };
  // Newest project number first among equals, the order the project pickers use.
  return [...items].sort((left, right) => order[sort.key](left, right) || compareNumber(right.number, left.number));
}

/** Clicking the column in use turns it round; a new column starts with its biggest share on top (the number column A to Z). */
export function nextCostSort(current: CostSort, key: CostSortKey): CostSort {
  if (current.key === key) return { key, descending: !current.descending };
  return { key, descending: key === "hardware" || key === "outsource" || key === "labor" };
}

/** A headline figure in short form (1.25M, 320K); the screen keeps the exact value on hover. */
export function shortAmount(value: number): string {
  const size = Math.abs(value);
  const short = (divided: number, unit: string) => `${Number(divided.toFixed(divided >= 100 ? 0 : divided >= 10 ? 1 : 2))}${unit}`;
  if (size >= 1_000_000_000) return short(value / 1_000_000_000, "B");
  if (size >= 1_000_000) return short(value / 1_000_000, "M");
  if (size >= 10_000) return short(value / 1_000, "K");
  return String(Math.round(value));
}
