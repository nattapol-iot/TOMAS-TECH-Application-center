/*
 * Schedule summaries for many projects at once: the Projects portfolio, the project list and the
 * Executive dashboard read the same numbers from here, so no screen weighs progress differently.
 * Two round trips in total (every task row of the projects, then the holidays), never one per project.
 */

import sql from "mssql";
import type { Transaction as TransactionType } from "mssql";
import type { Database } from "./db.js";
import { dateOnly } from "./http.js";
import { scheduleLeaves, summarizeProjectSchedule, type ProjectScheduleSummary, type ScheduleLeaf } from "./project-health.js";
import { resolveTasks, taskRow, type TaskRow } from "./schedule-service.js";

export type OverviewProject = { id: number; status: string; targetDelivery: string | null };
/** scheduleError: the rows could not be resolved (bad data such as a dependency loop), so nothing was measured. */
export type ProjectScheduleOverview = ProjectScheduleSummary & { scheduleError: boolean };
export type ProjectScheduleOutcome = { summary: ProjectScheduleOverview; leaves: ScheduleLeaf[] };

/** Groups the task rows by project, then resolves and summarises each project on its own. */
export function summarizeProjects(projects: OverviewProject[], tasks: TaskRow[], holidays: Set<string>, today: string): Map<number, ProjectScheduleOutcome> {
  const byProject = new Map<number, TaskRow[]>(projects.map((project) => [project.id, []]));
  for (const task of tasks) byProject.get(task.projectId)?.push(task);
  return new Map(projects.map((project): [number, ProjectScheduleOutcome] => {
    const rows = byProject.get(project.id)!;
    try {
      const leaves = rows.length ? scheduleLeaves(rows, resolveTasks(rows, holidays)) : [];
      return [project.id, { summary: { ...summarizeProjectSchedule(project, leaves, today), scheduleError: false }, leaves }];
    } catch {
      // One broken schedule must not take the whole list down. The status still decides Completed / On Hold.
      return [project.id, { summary: { ...summarizeProjectSchedule(project, [], today), scheduleError: true }, leaves: [] }];
    }
  }));
}

export async function loadProjectScheduleSummaries(source: Database | TransactionType, projects: OverviewProject[], today: string): Promise<Map<number, ProjectScheduleOverview>> {
  if (!projects.length) return new Map();
  // taskRow() reads by column name, so every column is selected, as the Executive dashboard does.
  const statement = `SELECT t.* FROM dbo.schedule_tasks t WHERE t.project_id IN(SELECT TRY_CONVERT(bigint,value) FROM STRING_SPLIT(@ids,N','))
      AND t.deleted_at IS NULL ORDER BY t.project_id,t.parent_id,t.sort_order,t.id;
    SELECT holiday_date FROM dbo.holidays;`;
  const bind = (request: InstanceType<typeof sql.Request>) => { request.input("ids", sql.NVarChar(sql.MAX), projects.map((project) => project.id).join(",")); };
  let result: sql.IResult<Record<string, unknown>>;
  if (source instanceof sql.Transaction) { const request = new sql.Request(source); bind(request); result = await request.query(statement); }
  else result = await source.query<Record<string, unknown>>(statement, bind);
  const sets = result.recordsets as unknown as Record<string, unknown>[][];
  const tasks = (sets[0] ?? []).map((row) => taskRow(row as Record<string, unknown> & { row_version: Buffer }));
  const holidays = new Set((sets[1] ?? []).map((row) => dateOnly(row.holiday_date as Date | string)!));
  return new Map([...summarizeProjects(projects, tasks, holidays, today)].map(([id, outcome]) => [id, outcome.summary]));
}
