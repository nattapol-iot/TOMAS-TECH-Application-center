/*
 * Reads the cost overview of projects (project-cost-model.ts) for many projects at once: the estimate's figures,
 * the purchase requests and the plan rows, three round trips in total and never one per project.
 *
 * Where each figure comes from, so every screen that shows it agrees:
 *  - Hardware / Outsource budget: dbo.v_estimate_totals of the project's Estimate cost (material_total, outsource_total).
 *  - Requested / approved / ordered: the lines of the project's live purchase requests, by the rule the Project Units
 *    panel uses (routes/purchase-units.ts). A line on a BOM row of section OUT is outsource; every other line is hardware.
 *    Ordered is what the ERP has a PO for at this app's price: the ERP does not return PO prices.
 *  - People budget: manhour-budget.ts (the estimate's internal labor, or a figure typed by a manager), and by discipline
 *    the estimate's own split of that labor (dbo.manhour_lines.discipline).
 *  - People planned: manhour-budget.ts countedEffort(). To date: each counted figure times the part of its row's
 *    span that is on or before today; a row marked Done has used all of it.
 *  - People planned by discipline: a plan row has no discipline of its own, so it takes one from where it sits and who
 *    does it (rowDisciplines below): Installation under a heading that names installation, otherwise the discipline
 *    of each PIC's department, otherwise Unassigned.
 *  - People money: man-days times the discipline's own rate in the estimate (its labor cost / its man-days), and the
 *    estimate's average internal rate for a discipline the estimate has no labor for.
 */

import sql from "mssql";
import type { Transaction as TransactionType } from "mssql";
import type { Database } from "./db.js";
import { dateOnly } from "./http.js";
import { budgetSource, countedEffort, type BudgetPlanRow } from "./manhour-budget.js";
import { REQUESTING_PR_STATUSES } from "./procurement-rules.js";
import {
  disciplineOfDepartment, LABOR_DISCIPLINES, namesInstallation, round2,
  type CostAccess, type CostPlanRow, type LaborCost, type LaborDiscipline, type LaborDisciplineCost, type PurchaseCost,
} from "./project-cost-model.js";
import { calendarDays, resolveTasks, taskRow, type TaskRow } from "./schedule-service.js";

/** BOM section of outsourced work (migration 108). */
const OUTSOURCE_SECTION = "OUT";
/** Estimate categories bought through purchase requests: hardware 01-05 and outsource 07. */
export const BOUGHT_CATEGORIES = ["01", "02", "03", "04", "05", "07"] as const;

/** The estimate's internal labor of one discipline. */
export type EstimateDisciplineFigures = { discipline: LaborDiscipline; manDays: number; cost: number };
export type EstimateFigures = {
  estimateNo: string | null; materialTotal: number; outsourceTotal: number; total: number | null;
  internalCost: number; internalManDays: number; manualManDays: number | null;
  disciplines: EstimateDisciplineFigures[];
};
export type PurchaseFigures = { requests: number; hardware: Omit<PurchaseCost, "budget">; outsource: Omit<PurchaseCost, "budget"> };
export type RowSpan = { planStart: string | null; planFinish: string | null; status: string; percentComplete: number };
export type PlanDisciplineFigures = { discipline: LaborDiscipline; plannedManDays: number; toDateManDays: number | null };
export type PlanFigures = {
  plannedManDays: number; outsourcedManDays: number; toDateManDays: number | null; unplannedRows: number;
  /** Own-staff man-days by discipline; only the disciplines the plan has man-days for. */
  disciplines: PlanDisciplineFigures[];
  rows: Omit<CostPlanRow, "plannedCost">[];
};
type PlanRow = BudgetPlanRow & { name: string };

/** The part of a row's span on or before today, in calendar days: 0 before it starts, 1 from its last day on. A finished row has used all of it. */
export function elapsedShare(span: RowSpan | undefined, today: string): number {
  if (!span) return 0;
  if (span.status === "Done") return 1;
  if (!span.planStart || !span.planFinish || today < span.planStart) return 0;
  if (today >= span.planFinish) return 1;
  const total = calendarDays(span.planStart, span.planFinish);
  return total > 0 ? calendarDays(span.planStart, today) / total : 0;
}

/**
 * The disciplines a plan row's man-days go to, one entry per equal share. A row under a heading that names
 * installation is Installation work, whoever does it (the estimate counts installation by the work, not the person).
 * Otherwise each PIC's department names a discipline; a row without PICs takes those of the nearest row above it,
 * because a function inherits its task's member. Nobody we can place: Unassigned.
 */
export function rowDisciplines(id: number, rows: ReadonlyMap<number, PlanRow>, departments: ReadonlyMap<number, readonly string[]>): LaborDiscipline[] {
  let people: readonly string[] | undefined;
  const seen = new Set<number>();
  for (let row = rows.get(id); row && !seen.has(row.id); row = row.parentId === null ? undefined : rows.get(row.parentId)) {
    seen.add(row.id);
    if (row.kind === "phase" && namesInstallation(row.name)) return ["Installation"];
    if (!people && departments.get(row.id)?.length) people = departments.get(row.id);
  }
  return people?.length ? people.map(disciplineOfDepartment) : ["Unassigned"];
}

/**
 * The plan's man-days: planned in all, and what falls on or before today. `spans` holds the resolved dates of the
 * rows; null when the schedule could not be resolved, and then nothing is said about "to date". `departments` holds
 * the departments of each row's PICs, for the split by discipline.
 */
export function planFigures(rows: readonly PlanRow[], spans: ReadonlyMap<number, RowSpan> | null, today: string, departments: ReadonlyMap<number, readonly string[]> = new Map()): PlanFigures {
  const { counted, unplannedRows } = countedEffort(rows);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const byRoot = new Map<number, { planned: number; outsourced: number; toDate: number }>();
  const byDiscipline = new Map<LaborDiscipline, { planned: number; toDate: number }>();
  let planned = 0, outsourced = 0, toDate = 0;
  for (const item of counted) {
    const sums = byRoot.get(item.rootId) ?? { planned: 0, outsourced: 0, toDate: 0 };
    if (item.outsourced) { outsourced += item.manDays; sums.outsourced += item.manDays; }
    else {
      const used = spans ? item.manDays * elapsedShare(spans.get(item.id), today) : 0;
      planned += item.manDays; toDate += used; sums.planned += item.manDays; sums.toDate += used;
      const shares = rowDisciplines(item.id, byId, departments);
      for (const discipline of shares) {
        const split = byDiscipline.get(discipline) ?? { planned: 0, toDate: 0 };
        split.planned += item.manDays / shares.length; split.toDate += used / shares.length;
        byDiscipline.set(discipline, split);
      }
    }
    byRoot.set(item.rootId, sums);
  }
  return {
    plannedManDays: round2(planned), outsourcedManDays: round2(outsourced), toDateManDays: spans ? round2(toDate) : null, unplannedRows,
    disciplines: LABOR_DISCIPLINES.flatMap((discipline) => { const split = byDiscipline.get(discipline);
      return split ? [{ discipline, plannedManDays: round2(split.planned), toDateManDays: spans ? round2(split.toDate) : null }] : []; }),
    rows: [...byRoot].map(([id, sums]) => { const span = spans?.get(id);
      return { id, name: byId.get(id)?.name ?? "", planStart: span?.planStart ?? null, planFinish: span?.planFinish ?? null, percentComplete: span?.percentComplete ?? 0,
        plannedManDays: round2(sums.planned), outsourcedManDays: round2(sums.outsourced), toDateManDays: spans ? round2(sums.toDate) : null }; }),
  };
}

/** The estimate's average internal rate per man-day; null when the estimate has no internal labor to take it from. */
export const averageDailyRate = (figures: Pick<EstimateFigures, "internalCost" | "internalManDays"> | undefined): number | null =>
  figures && figures.internalManDays > 0 && figures.internalCost > 0 ? figures.internalCost / figures.internalManDays : null;

/** A discipline's own rate in the estimate, or the estimate's average for a discipline it has no labor for. */
export function disciplineRate(estimate: EstimateFigures | undefined, discipline: LaborDiscipline): number | null {
  const own = estimate?.disciplines.find((item) => item.discipline === discipline);
  return own && own.manDays > 0 && own.cost > 0 ? own.cost / own.manDays : averageDailyRate(estimate);
}

/** People cost of one project, in all and by discipline, with money only for a viewer who may see it. */
export function laborCost(estimate: EstimateFigures | undefined, plan: PlanFigures, access: CostAccess): LaborCost {
  const estimateManDays = round2(estimate?.internalManDays ?? 0), manual = estimate?.manualManDays ?? null;
  const source = budgetSource(estimateManDays, manual);
  const average = access.laborMoney ? averageDailyRate(estimate) : null;
  const disciplines: LaborDisciplineCost[] = LABOR_DISCIPLINES.flatMap((discipline) => {
    const estimated = source === "estimate" ? estimate!.disciplines.find((item) => item.discipline === discipline) : undefined;
    const planned = plan.disciplines.find((item) => item.discipline === discipline);
    if (!estimated && !planned) return [];
    const rate = access.laborMoney ? disciplineRate(estimate, discipline) : null;
    const toDate = planned ? planned.toDateManDays : plan.toDateManDays === null ? null : 0;
    // The estimate gave a named discipline nothing: its budget is zero. Man-days nobody could place have no budget to stand against.
    const budget = estimated ? round2(estimated.manDays) : source === "estimate" && discipline !== "Unassigned" ? 0 : null;
    return [{
      discipline,
      budgetManDays: budget,
      plannedManDays: planned?.plannedManDays ?? 0, toDateManDays: toDate,
      budgetCost: average !== null && budget !== null ? round2(estimated?.cost ?? 0) : null,
      plannedCost: rate === null ? null : round2((planned?.plannedManDays ?? 0) * rate),
      toDateCost: rate === null || toDate === null ? null : round2(toDate * rate),
    }];
  });
  // The project's money is the sum of its disciplines, so the split always adds up to the line above it.
  const sum = (pick: (item: LaborDisciplineCost) => number | null): number | null =>
    average === null || disciplines.some((item) => pick(item) === null) ? null : round2(disciplines.reduce((total, item) => total + pick(item)!, 0));
  return {
    source, budgetManDays: source === "estimate" ? estimateManDays : source === "manual" ? manual : null,
    plannedManDays: plan.plannedManDays, outsourcedManDays: plan.outsourcedManDays, toDateManDays: plan.toDateManDays, unplannedRows: plan.unplannedRows,
    dailyRate: average === null ? null : round2(average),
    budgetCost: average !== null && source === "estimate" ? round2(estimate!.internalCost) : null,
    plannedCost: sum((item) => item.plannedCost), toDateCost: plan.toDateManDays === null ? null : sum((item) => item.toDateCost),
    disciplines,
  };
}

/** One bought group for the viewer: the budget needs the right to read estimates, the request figures the right to read requests. */
export function purchaseCost(budget: number | undefined, requests: Omit<PurchaseCost, "budget"> | undefined, access: CostAccess): PurchaseCost {
  const amount = (value: number | null | undefined) => (access.purchases ? round2(value ?? 0) : null);
  return { budget: access.budget && budget !== undefined ? round2(budget) : null, requested: amount(requests?.requested), approved: amount(requests?.approved), ordered: amount(requests?.ordered) };
}

const ID_LIST = "SELECT TRY_CONVERT(bigint,value) FROM STRING_SPLIT(@ids,N',')";

async function run(source: Database | TransactionType, statement: string, ids: readonly number[]): Promise<Record<string, unknown>[][]> {
  const bind = (request: InstanceType<typeof sql.Request>) => { request.input("ids", sql.NVarChar(sql.MAX), ids.join(",")); };
  let result: sql.IResult<Record<string, unknown>>;
  if (source instanceof sql.Transaction) { const request = new sql.Request(source); bind(request); result = await request.query(statement); }
  else result = await source.query<Record<string, unknown>>(statement, bind);
  return result.recordsets as unknown as Record<string, unknown>[][];
}

/** A labor line's discipline as the overview names it; a line that names none is Unassigned. */
const estimateDiscipline = (value: unknown): LaborDiscipline =>
  LABOR_DISCIPLINES.find((discipline) => discipline !== "Unassigned" && discipline === value) ?? "Unassigned";

/** The estimate figures of each project that has an Estimate cost or a typed man-day budget, with its internal labor by discipline. */
export async function loadEstimateFigures(source: Database | TransactionType, ids: readonly number[]): Promise<Map<number, EstimateFigures>> {
  if (!ids.length) return new Map();
  const [rows = [], labor = []] = await run(source, `SELECT p.id project_id,p.manhour_budget_days,e.estimate_no,t.material_total,t.outsource_total,t.total
    FROM dbo.projects p LEFT JOIN dbo.estimates e ON e.id=p.estimate_id
    LEFT JOIN dbo.v_estimate_totals t ON t.estimate_id=e.id
    WHERE p.id IN(${ID_LIST}) AND p.deleted_at IS NULL AND (p.estimate_id IS NOT NULL OR p.manhour_budget_days IS NOT NULL);
    SELECT p.id project_id,l.discipline,SUM(l.engineers*l.man_days) man_days,SUM(l.line_cost) cost
    FROM dbo.projects p INNER JOIN dbo.estimates e ON e.id=p.estimate_id
    INNER JOIN dbo.manhour_lines l ON l.estimate_id=e.id AND l.revision=e.revision AND l.deleted_at IS NULL AND l.provider=N'Internal'
    WHERE p.id IN(${ID_LIST}) AND p.deleted_at IS NULL GROUP BY p.id,l.discipline;`, ids);
  const byProject = new Map<number, EstimateDisciplineFigures[]>();
  for (const row of labor) {
    const projectId = Number(row.project_id), discipline = estimateDiscipline(row.discipline), list = byProject.get(projectId) ?? [];
    const found = list.find((item) => item.discipline === discipline);
    if (found) { found.manDays += Number(row.man_days ?? 0); found.cost += Number(row.cost ?? 0); }
    else list.push({ discipline, manDays: Number(row.man_days ?? 0), cost: Number(row.cost ?? 0) });
    byProject.set(projectId, list);
  }
  return new Map(rows.map((row) => { const disciplines = (byProject.get(Number(row.project_id)) ?? []).filter((item) => item.manDays > 0);
    return [Number(row.project_id), {
      estimateNo: row.estimate_no == null ? null : String(row.estimate_no),
      materialTotal: Number(row.material_total ?? 0), outsourceTotal: Number(row.outsource_total ?? 0), total: row.total == null ? null : Number(row.total),
      internalCost: disciplines.reduce((sum, item) => sum + item.cost, 0), internalManDays: disciplines.reduce((sum, item) => sum + item.manDays, 0),
      manualManDays: row.manhour_budget_days == null ? null : Number(row.manhour_budget_days),
      disciplines,
    }]; }));
}

/** The live purchase requests of each project, hardware and outsource apart. */
export async function loadPurchaseFigures(source: Database | TransactionType, ids: readonly number[]): Promise<Map<number, PurchaseFigures>> {
  if (!ids.length) return new Map();
  const approved = "pr.status IN(N'Approved',N'Converted to PO')";
  const ordered = "(l.erp_line_status=N'ORDERED' OR (l.erp_line_status IS NULL AND pr.status=N'Converted to PO'))";
  const outsource = `bl.section_code=N'${OUTSOURCE_SECTION}'`;
  const sum = (group: string, when: string) => `COALESCE(SUM(CASE WHEN ${group} AND ${when} THEN l.line_total ELSE 0 END),0)`;
  const [rows = []] = await run(source, `SELECT pr.project_id,COUNT(DISTINCT pr.id) requests,
      ${sum(`(bl.id IS NULL OR NOT ${outsource})`, "1=1")} hw_requested,${sum(`(bl.id IS NULL OR NOT ${outsource})`, approved)} hw_approved,${sum(`(bl.id IS NULL OR NOT ${outsource})`, ordered)} hw_ordered,
      ${sum(outsource, "1=1")} out_requested,${sum(outsource, approved)} out_approved,${sum(outsource, ordered)} out_ordered
    FROM dbo.mat_prs pr LEFT JOIN dbo.mat_pr_lines l ON l.pr_id=pr.id LEFT JOIN dbo.bom_lines bl ON bl.id=l.bom_line_id
    WHERE pr.project_id IN(${ID_LIST}) AND pr.deleted_at IS NULL AND pr.status IN(${REQUESTING_PR_STATUSES})
    GROUP BY pr.project_id;`, ids);
  return new Map(rows.map((row) => [Number(row.project_id), {
    requests: Number(row.requests),
    hardware: { requested: Number(row.hw_requested), approved: Number(row.hw_approved), ordered: Number(row.hw_ordered) },
    outsource: { requested: Number(row.out_requested), approved: Number(row.out_approved), ordered: Number(row.out_ordered) },
  }]));
}

/** The plan man-days of each project. One project's broken schedule (a dependency loop) leaves its "to date" unknown, not the list down. */
export async function loadPlanFigures(source: Database | TransactionType, ids: readonly number[], today: string): Promise<Map<number, PlanFigures>> {
  if (!ids.length) return new Map();
  // taskRow() reads by column name, so every column is selected, as project-overview.ts does.
  const sets = await run(source, `SELECT t.* FROM dbo.schedule_tasks t WHERE t.project_id IN(${ID_LIST}) AND t.deleted_at IS NULL ORDER BY t.project_id,t.parent_id,t.sort_order,t.id;
    SELECT holiday_date FROM dbo.holidays;
    SELECT pic.task_id,u.department FROM dbo.schedule_task_pics pic INNER JOIN dbo.schedule_tasks t ON t.id=pic.task_id INNER JOIN dbo.users u ON u.id=pic.user_id
    WHERE t.project_id IN(${ID_LIST}) AND t.deleted_at IS NULL ORDER BY pic.task_id,u.id;`, ids);
  const holidays = new Set((sets[1] ?? []).map((row) => dateOnly(row.holiday_date as Date | string)!));
  const departments = new Map<number, string[]>();
  for (const row of sets[2] ?? []) { const taskId = Number(row.task_id); departments.set(taskId, [...(departments.get(taskId) ?? []), String(row.department ?? "")]); }
  const byProject = new Map<number, TaskRow[]>();
  for (const row of sets[0] ?? []) { const task = taskRow(row as Record<string, unknown> & { row_version: Buffer }); byProject.set(task.projectId, [...(byProject.get(task.projectId) ?? []), task]); }
  return new Map([...byProject].map(([projectId, tasks]) => [projectId, planFigures(tasks, resolvedSpans(tasks, holidays), today, departments)]));
}

/** The resolved dates of every row; null when the schedule cannot be resolved. */
export function resolvedSpans(tasks: TaskRow[], holidays: Set<string>): Map<number, RowSpan> | null {
  try {
    const calculation = resolveTasks(tasks, holidays);
    return new Map([...calculation.byId].map(([id, resolved]) => [id, { planStart: resolved.planStart, planFinish: resolved.planFinish, status: resolved.status, percentComplete: resolved.percentComplete }]));
  } catch { return null; }
}

export const EMPTY_PLAN: PlanFigures = { plannedManDays: 0, outsourcedManDays: 0, toDateManDays: 0, unplannedRows: 0, disciplines: [], rows: [] };

export type ProjectCostFigures = { estimates: Map<number, EstimateFigures>; purchases: Map<number, PurchaseFigures>; plans: Map<number, PlanFigures> };

/** Everything the overview needs for these projects. What the viewer may not see is not read at all. */
export async function loadProjectCostFigures(source: Database | TransactionType, ids: readonly number[], today: string, access: CostAccess): Promise<ProjectCostFigures> {
  const estimates = await loadEstimateFigures(source, ids);
  const purchases = access.purchases ? await loadPurchaseFigures(source, ids) : new Map<number, PurchaseFigures>();
  const plans = await loadPlanFigures(source, ids, today);
  return { estimates, purchases, plans };
}

/** The cost fields of one project row. */
export function projectCost(id: number, figures: ProjectCostFigures, access: CostAccess) {
  const estimate = figures.estimates.get(id), purchase = figures.purchases.get(id), plan = figures.plans.get(id) ?? EMPTY_PLAN;
  const hasEstimate = Boolean(estimate?.estimateNo);
  return {
    estimateNo: access.budget ? estimate?.estimateNo ?? null : null,
    estimateTotal: access.budget && hasEstimate && estimate!.total !== null ? round2(estimate!.total) : null,
    requests: access.purchases ? purchase?.requests ?? 0 : null,
    hardware: purchaseCost(hasEstimate ? estimate!.materialTotal : undefined, purchase?.hardware, access),
    outsource: purchaseCost(hasEstimate ? estimate!.outsourceTotal : undefined, purchase?.outsource, access),
    labor: laborCost(estimate, plan, access),
  };
}
