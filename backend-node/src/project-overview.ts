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
/**
 * scheduleError: the rows could not be resolved (bad data such as a dependency loop), so nothing was measured.
 * followUps: rows the plan Sheet's "To follow up" list names (task doc 5.1), each once.
 */
export type ProjectScheduleOverview = ProjectScheduleSummary & { scheduleError: boolean; followUps?: number };

/**
 * The rows the plan Sheet lists under To follow up (PlanSheet.tsx followUps), counted once each: late, blocked, due to
 * start but not started, a task with nobody on it, outsourced work with no purchase request. A new holiday on the
 * work is left out: it lasts days and is the plan manager's alone.
 */
export function followUpCount(tasks: readonly TaskRow[], leaves: readonly ScheduleLeaf[], withPeople: ReadonlySet<number>, today: string): number {
  const byId = new Map(tasks.map((task) => [task.id, task] as const));
  let count = 0;
  for (const leaf of leaves) {
    // Headings are never listed on the Sheet, a dated one with nothing under it yet ("ยังไม่แตกแผน") included.
    if (leaf.rollup || byId.get(leaf.id)?.kind === "phase") continue;
    const task = byId.get(leaf.id);
    const open = leaf.status !== "Done";
    const late = open && leaf.planFinish !== null && leaf.planFinish < today;
    const due = !late && leaf.status === "Not Started" && leaf.planStart !== null && leaf.planStart <= today;
    const outsourced = task?.laborSource === "Outsourced";
    const noMember = task?.kind === "task" && open && !outsourced && !withPeople.has(leaf.id);
    const noRequest = outsourced && open && !task?.purchaseRequestId;
    if (late || leaf.status === "Blocked" || due || noMember || noRequest) count += 1;
  }
  return count;
}
export type ProjectScheduleOutcome = { summary: ProjectScheduleOverview; leaves: ScheduleLeaf[] };

/** Groups the task rows by project, then resolves and summarises each project on its own. */
export function summarizeProjects(projects: OverviewProject[], tasks: TaskRow[], holidays: Set<string>, today: string, withPeople?: ReadonlySet<number>): Map<number, ProjectScheduleOutcome> {
  const byProject = new Map<number, TaskRow[]>(projects.map((project) => [project.id, []]));
  for (const task of tasks) byProject.get(task.projectId)?.push(task);
  return new Map(
    projects.map((project): [number, ProjectScheduleOutcome] => {
      const rows = byProject.get(project.id)!;
      try {
        const leaves = rows.length ? scheduleLeaves(rows, resolveTasks(rows, holidays)) : [];
        const followUps = withPeople && project.status !== "Closed" ? followUpCount(rows, leaves, withPeople, today) : undefined;
        return [project.id, { summary: { ...summarizeProjectSchedule(project, leaves, today), scheduleError: false, ...(followUps === undefined ? {} : { followUps }) }, leaves }];
      } catch {
        // One broken schedule must not take the whole list down. The status still decides Completed / On Hold.
        return [project.id, { summary: { ...summarizeProjectSchedule(project, [], today), scheduleError: true }, leaves: [] }];
      }
    }),
  );
}

export async function loadProjectScheduleSummaries(source: Database | TransactionType, projects: OverviewProject[], today: string): Promise<Map<number, ProjectScheduleOverview>> {
  if (!projects.length) return new Map();
  // taskRow() reads by column name, so every column is selected, as the Executive dashboard does.
  const statement = `SELECT t.* FROM dbo.schedule_tasks t WHERE t.project_id IN(SELECT TRY_CONVERT(bigint,value) FROM STRING_SPLIT(@ids,N','))
      AND t.deleted_at IS NULL ORDER BY t.project_id,t.parent_id,t.sort_order,t.id;
    SELECT holiday_date FROM dbo.holidays;
    SELECT DISTINCT pic.task_id FROM dbo.schedule_task_pics pic INNER JOIN dbo.schedule_tasks t ON t.id=pic.task_id
      WHERE t.project_id IN(SELECT TRY_CONVERT(bigint,value) FROM STRING_SPLIT(@ids,N',')) AND t.deleted_at IS NULL;`;
  const bind = (request: InstanceType<typeof sql.Request>) => {
    request.input("ids", sql.NVarChar(sql.MAX), projects.map((project) => project.id).join(","));
  };
  let result: sql.IResult<Record<string, unknown>>;
  if (source instanceof sql.Transaction) {
    const request = new sql.Request(source);
    bind(request);
    result = await request.query(statement);
  } else result = await source.query<Record<string, unknown>>(statement, bind);
  const sets = result.recordsets as unknown as Record<string, unknown>[][];
  const tasks = (sets[0] ?? []).map((row) => taskRow(row as Record<string, unknown> & { row_version: Buffer }));
  const holidays = new Set((sets[1] ?? []).map((row) => dateOnly(row.holiday_date as Date | string)!));
  const withPeople = new Set((sets[2] ?? []).map((row) => Number(row.task_id)));
  return new Map([...summarizeProjects(projects, tasks, holidays, today, withPeople)].map(([id, outcome]) => [id, outcome.summary]));
}
