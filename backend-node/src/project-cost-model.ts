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

/** What the viewer may see. A figure the viewer may not see is null, never zero. */
export type CostAccess = {
  /** Estimate cost figures (estimate.read). */
  budget: boolean;
  /** Purchase request amounts (procurement.read). */
  purchases: boolean;
  /** People cost in money (management roles, the same people who see the engineering rates). */
  laborMoney: boolean;
};

/** One bought group. Requested is every live request; approved and ordered are parts of it. */
export type PurchaseCost = { budget: number | null; requested: number | null; approved: number | null; ordered: number | null };

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
};

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
export type CostDisciplineRow = { discipline: string; manDays: number; cost: number | null };
/** A top row of the plan with the man-days under it. */
export type CostPlanRow = { id: number; name: string; planStart: string | null; planFinish: string | null; percentComplete: number;
  plannedManDays: number; outsourcedManDays: number; toDateManDays: number | null; plannedCost: number | null };

export type ProjectCostDetail = {
  today: string; hoursPerManDay: number; access: CostAccess; project: ProjectCostItem;
  /** Bought cost by the estimate's Module, hardware and outsource together. */
  modules: CostModuleRow[];
  requests: CostRequestRow[];
  disciplines: CostDisciplineRow[];
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

/** The states a project is in, one per group, and the worst of them: the project's own state. */
export function projectBudgetStates(item: Pick<ProjectCostItem, "hardware" | "outsource" | "labor">): { hardware: BudgetState; outsource: BudgetState; labor: BudgetState; worst: BudgetState } {
  const hardware = budgetState(item.hardware.budget, item.hardware.requested);
  const outsource = budgetState(item.outsource.budget, item.outsource.requested);
  const labor = budgetState(item.labor.budgetManDays, item.labor.plannedManDays);
  return { hardware, outsource, labor, worst: WORST.find((state) => state === hardware || state === outsource || state === labor) ?? "none" };
}

/* ---- What the screen works out from the rows: counts, totals, search and order. ---- */

export const BUDGET_STATES: readonly BudgetState[] = ["over", "near", "within", "none"];

/** How many projects are in each state: the numbers on the state filter. */
export function stateCounts(items: readonly Pick<ProjectCostItem, "hardware" | "outsource" | "labor">[]): Record<BudgetState, number> {
  const counts: Record<BudgetState, number> = { over: 0, near: 0, within: 0, none: 0 };
  for (const item of items) counts[projectBudgetStates(item).worst] += 1;
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
  labor: Pick<LaborCost, "budgetManDays" | "plannedManDays" | "outsourcedManDays" | "toDateManDays" | "budgetCost" | "plannedCost" | "toDateCost">;
};

/** The summary bar: every row on show added up, not only the page in view. */
export function costTotals(items: readonly ProjectCostItem[]): CostTotals {
  return {
    projects: items.length,
    hardware: purchaseTotal(items.map((item) => item.hardware)), outsource: purchaseTotal(items.map((item) => item.outsource)),
    labor: {
      budgetManDays: total(items.map((item) => item.labor.budgetManDays)),
      plannedManDays: round2(items.reduce((sum, item) => sum + item.labor.plannedManDays, 0)),
      outsourcedManDays: round2(items.reduce((sum, item) => sum + item.labor.outsourcedManDays, 0)),
      toDateManDays: total(items.map((item) => item.labor.toDateManDays)),
      budgetCost: total(items.map((item) => item.labor.budgetCost)), plannedCost: total(items.map((item) => item.labor.plannedCost)), toDateCost: total(items.map((item) => item.labor.toDateCost)),
    },
  };
}

export type CostSortKey = "state" | "number" | "hardware" | "outsource" | "labor";
export type CostSort = { key: CostSortKey; descending: boolean };
/** Projects that need a look come first: over budget, then near it. */
export const DEFAULT_COST_SORT: CostSort = { key: "state", descending: false };

const compareNumber = (left: string, right: string) => left.localeCompare(right, "en", { numeric: true, sensitivity: "base" });
/** Used over budget as a ratio; rows with nothing to measure sort last whichever way the column runs. */
const ratio = (budget: number | null, used: number | null): number | null => (budget === null || used === null || budget <= 0 ? null : used / budget);

export function sortCostItems(items: readonly ProjectCostItem[], sort: CostSort): ProjectCostItem[] {
  const direction = sort.descending ? -1 : 1;
  const byRatio = (pick: (item: ProjectCostItem) => number | null) => (left: ProjectCostItem, right: ProjectCostItem) => {
    const a = pick(left), b = pick(right);
    if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
    return (a - b) * direction;
  };
  const order: Record<CostSortKey, (left: ProjectCostItem, right: ProjectCostItem) => number> = {
    state: (left, right) => (BUDGET_STATES.indexOf(projectBudgetStates(left).worst) - BUDGET_STATES.indexOf(projectBudgetStates(right).worst)) * direction,
    number: (left, right) => compareNumber(left.number, right.number) * direction,
    hardware: byRatio((item) => ratio(item.hardware.budget, item.hardware.requested)),
    outsource: byRatio((item) => ratio(item.outsource.budget, item.outsource.requested)),
    labor: byRatio((item) => ratio(item.labor.budgetManDays, item.labor.plannedManDays)),
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
