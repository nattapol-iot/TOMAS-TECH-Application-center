import sql from "mssql";
import type { Transaction as TransactionType } from "mssql";

/**
 * The man-hour budget of a project, shown on Projects > Plan (owner request 2026-11-16).
 *
 * Budget: the internal labor man-days of the linked Estimate cost (current revision), by
 * discipline. Supplier labor is somebody else's hours and is left out. A project with no
 * Estimate, or an Estimate with no internal labor, takes a budget typed by a manager
 * (dbo.projects.manhour_budget_days, migration 105).
 *
 * Planned: the man-days typed on the plan rows. Rows marked as outsourced manpower (the People
 * table, plan-people.ts) are somebody else's hours too: they are counted apart and stay out of
 * the comparison with the budget. Money is never part of this.
 *
 * Actual: the hours people confirmed for the project day by day (dbo.work_hours, migration 121, work-days.ts), as
 * man-days, and how many people confirmed them. Days nobody has confirmed yet are not in it.
 */

/** Hours shown per man-day. The plan and the estimate both count man-days; hours are a display. */
export const HOURS_PER_MAN_DAY = 8;
export const MAXIMUM_BUDGET_MAN_DAYS = 100000;

export type BudgetPlanRow = { id: number; parentId: number | null; kind: string; planManDays: number; isMilestone: boolean; laborSource?: string | undefined };
/** manDays is our own staff's; outsourcedManDays is the rows marked Outsourced. */
export type PlannedEffort = { manDays: number; outsourcedManDays: number; unplannedRows: number };
export type BudgetSource = "estimate" | "manual" | "none";
export type ManHourBudget = {
  source: BudgetSource; estimateNo: string | null; budgetManDays: number | null;
  disciplines: { discipline: string; manDays: number }[];
  plannedManDays: number; outsourcedManDays: number; unplannedRows: number; hoursPerManDay: number; canSetBudget: boolean;
  actualManDays: number; actualPeople: number;
};

const round = (value: number): number => Math.round(value * 100) / 100;

/**
 * Man-days the plan holds, without counting a piece of work twice: a row whose sub rows carry
 * man-days counts those, otherwise its own figure. Headings (phases) only add up what is under
 * them. unplannedRows counts the pieces of work (a task with its sub rows is one) that have no
 * man-days at all; milestones are left out because they are a date, not work. A row's own figure
 * is outsourced when the row is marked so; figures from its sub rows keep each sub row's mark.
 */
export function plannedEffort(rows: readonly BudgetPlanRow[]): PlannedEffort {
  const { counted, unplannedRows } = countedEffort(rows);
  const sum = (outsourced: boolean) => round(counted.reduce((total, item) => total + (item.outsourced === outsourced ? item.manDays : 0), 0));
  return { manDays: sum(false), outsourcedManDays: sum(true), unplannedRows };
}

/** A row whose own man-days count towards the plan, the top row it sits under, and whether it is outsourced manpower. */
export type CountedEffort = { id: number; rootId: number; manDays: number; outsourced: boolean };

/**
 * The rows plannedEffort() adds up, one entry per figure that counts, so another view (the cost overview) can weigh
 * each figure by its own row's dates without restating the rule.
 */
export function countedEffort(rows: readonly BudgetPlanRow[]): { counted: CountedEffort[]; unplannedRows: number } {
  const ids = new Set(rows.map((row) => row.id)), children = new Map<number | null, BudgetPlanRow[]>();
  for (const row of rows) {
    const parent = row.parentId !== null && ids.has(row.parentId) ? row.parentId : null;
    children.set(parent, [...(children.get(parent) ?? []), row]);
  }
  let unplannedRows = 0;
  const seen = new Set<number>();
  const effort = (row: BudgetPlanRow, insideWork: boolean, rootId: number): CountedEffort[] => {
    if (seen.has(row.id)) return [];
    seen.add(row.id);
    const isHeading = row.kind === "phase";
    const below = (children.get(row.id) ?? []).flatMap((child) => effort(child, insideWork || !isHeading, rootId));
    if (isHeading) return below;
    const typed = Number.isFinite(row.planManDays) && row.planManDays > 0 ? row.planManDays : 0;
    const total = below.length ? below : typed > 0 ? [{ id: row.id, rootId, manDays: typed, outsourced: row.laborSource === "Outsourced" }] : [];
    if (!insideWork && total.length === 0 && !row.isMilestone) unplannedRows += 1;
    return total;
  };
  return { counted: (children.get(null) ?? []).flatMap((row) => effort(row, false, row.id)), unplannedRows };
}

/** Which figure is the budget: the estimate's own labor first, a typed budget only when it has none. */
export function budgetSource(estimateManDays: number, manualManDays: number | null): BudgetSource {
  return estimateManDays > 0 ? "estimate" : manualManDays !== null ? "manual" : "none";
}

/** A typed budget: null clears it; otherwise more than 0 and at most MAXIMUM_BUDGET_MAN_DAYS, kept to 2 decimals. */
export function parseBudgetManDays(value: unknown): number | null | undefined {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > MAXIMUM_BUDGET_MAN_DAYS) return undefined;
  return round(value);
}

export type StoredBudget = {
  estimateNo: string | null; estimateManDays: number; manualManDays: number | null; disciplines: { discipline: string; manDays: number }[];
  /** Hours confirmed for the project, and by how many people. */
  actualHours?: number; actualPeople?: number;
};

export async function readStoredBudget(transaction: TransactionType, projectId: number): Promise<StoredBudget> {
  const request = new sql.Request(transaction); request.input("project", sql.BigInt, projectId);
  const project = (await request.query<Record<string, unknown>>(`SELECT p.manhour_budget_days,e.estimate_no
    FROM dbo.projects p LEFT JOIN dbo.estimates e ON e.id=p.estimate_id
    WHERE p.id=@project AND p.deleted_at IS NULL;`)).recordset[0];
  const lines = (await request.query<Record<string, unknown>>(`SELECT COALESCE(l.discipline,N'Other') discipline,SUM(l.engineers*l.man_days) man_days
    FROM dbo.projects p INNER JOIN dbo.estimates e ON e.id=p.estimate_id
    INNER JOIN dbo.manhour_lines l ON l.estimate_id=e.id AND l.revision=e.revision AND l.deleted_at IS NULL AND l.provider=N'Internal'
    WHERE p.id=@project AND p.deleted_at IS NULL
    GROUP BY COALESCE(l.discipline,N'Other');`)).recordset;
  const actual = (await request.query<Record<string, unknown>>(`SELECT SUM(h.hours) hours,COUNT(DISTINCT h.user_id) people
    FROM dbo.work_hours h WHERE h.project_id=@project;`)).recordset[0];
  const order = ["Electrical", "Mechanical", "Software", "Installation", "Other"];
  const disciplines = lines.map((row) => ({ discipline: String(row.discipline), manDays: round(Number(row.man_days ?? 0)) }))
    .filter((row) => row.manDays > 0)
    .sort((left, right) => order.indexOf(left.discipline) - order.indexOf(right.discipline));
  return {
    estimateNo: project?.estimate_no == null ? null : String(project.estimate_no),
    estimateManDays: round(disciplines.reduce((sum, row) => sum + row.manDays, 0)),
    manualManDays: project?.manhour_budget_days == null ? null : Number(project.manhour_budget_days),
    disciplines,
    actualHours: Number(actual?.hours ?? 0), actualPeople: Number(actual?.people ?? 0),
  };
}

export function manHourBudget(stored: StoredBudget, rows: readonly BudgetPlanRow[], canManage: boolean): ManHourBudget {
  const source = budgetSource(stored.estimateManDays, stored.manualManDays), planned = plannedEffort(rows);
  return {
    source, estimateNo: stored.estimateNo,
    budgetManDays: source === "estimate" ? stored.estimateManDays : source === "manual" ? stored.manualManDays : null,
    disciplines: source === "estimate" ? stored.disciplines : [],
    plannedManDays: planned.manDays, outsourcedManDays: planned.outsourcedManDays, unplannedRows: planned.unplannedRows, hoursPerManDay: HOURS_PER_MAN_DAY,
    canSetBudget: canManage && source !== "estimate",
    actualManDays: round((stored.actualHours ?? 0) / HOURS_PER_MAN_DAY), actualPeople: stored.actualPeople ?? 0,
  };
}
