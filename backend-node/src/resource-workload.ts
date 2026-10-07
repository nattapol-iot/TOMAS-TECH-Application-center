import { dateOnly } from "./http.js";
import { resolveTasks, taskRow, type TaskRow } from "./schedule-service.js";

// The Resource Plan's Workload in one read: every open piece of work in the caller's scope, with the person it
// belongs to, its dates and its effort. The screen used to assemble this itself from every inquiry, every estimate's
// workspace and every project schedule, one request each.

/** Working days a week for anyone without a saved capacity: Monday to Friday. lib/resource-planning.ts holds the same default for the screens. */
export const DEFAULT_WEEKLY_CAPACITY = 5;
/** Work in these statuses, or at 100%, no longer takes anyone's time. lib/resource-planning.ts filters with the same list. */
export const FINISHED_WORK_STATUSES = ["Closed", "Cancelled", "Approved", "Locked", "Done", "Completed", "Rejected"] as const;
export const isOpenWork = (item: { progress: number; status: string }) =>
  item.progress < 100 && !(FINISHED_WORK_STATUSES as readonly string[]).includes(item.status);

export type WorkloadItem = {
  key: string; type: "Inquiry" | "Estimate" | "Project"; entityId: number; ownerId: number | null;
  reference: string; title: string; customer: string; start: string | null; end: string | null;
  manDays: number | null; progress: number; status: string;
};

const FINISHED_SQL = FINISHED_WORK_STATUSES.map((status) => `N'${status}'`).join(",");

/**
 * Six recordsets, after the caller's planning recordsets: whole inquiries, inquiry tasks, estimate shares, projects,
 * their schedule rows and PICs. Binds @actor, @project_elevated and @task_elevated.
 * Visibility follows the screens the Resource Plan used to read: inquiries and estimates as their lists show them to
 * inquiry.read / estimate.read, inquiry tasks as GET /resource-tasks/commitments scopes them, projects as GET /projects
 * lists them.
 */
export const WORKLOAD_SQL = `
      DECLARE @inquiries bit = CASE WHEN EXISTS(SELECT 1 FROM dbo.user_effective_permissions WHERE user_id=@actor AND code=N'inquiry.read') THEN 1 ELSE 0 END;
      DECLARE @estimates bit = CASE WHEN EXISTS(SELECT 1 FROM dbo.user_effective_permissions WHERE user_id=@actor AND code=N'estimate.read') THEN 1 ELSE 0 END;
      -- An inquiry counts whole until it is broken into Resource Plan tasks; then its tasks count instead.
      SELECT i.id,i.inquiry_no,i.project_name,c.name customer_name,i.estimate_owner_id owner_id,
        COALESCE(re.start_date,i.inquiry_date) start_date,COALESCE(re.end_date,i.due_date) end_date,re.man_days,i.progress,i.status
      FROM dbo.inquiries i JOIN dbo.customers c ON c.id=i.customer_id
      LEFT JOIN dbo.resource_effort re ON re.entity_type=N'Inquiry' AND re.entity_id=i.id
      WHERE @inquiries=1 AND i.deleted_at IS NULL AND i.archived_at IS NULL AND i.progress<100 AND i.status NOT IN(${FINISHED_SQL})
        AND NOT EXISTS(SELECT 1 FROM dbo.resource_task_sources s WHERE s.inquiry_id=i.id);
      SELECT t.id,t.inquiry_id,i.inquiry_no,c.name customer_name,t.title,t.assignee_id,t.plan_start,t.plan_end,t.man_days,t.percent_done,t.execution_status
      FROM dbo.resource_tasks t JOIN dbo.inquiries i ON i.id=t.inquiry_id JOIN dbo.customers c ON c.id=i.customer_id
      WHERE @inquiries=1 AND t.state=N'Approved' AND i.deleted_at IS NULL AND i.status NOT IN(N'Closed',N'Cancelled',N'Rejected')
        AND (@task_elevated=1 OR i.estimate_owner_id=@actor OR i.created_by=@actor OR t.assignee_id=@actor OR t.created_by=@actor);
      -- One row per person on an estimate: its owners and support, or the estimate owner when nobody is assigned.
      SELECT e.id,e.estimate_no,e.project_name,c.name customer_name,o.user_id owner_id,o.owner_count,
        COALESCE(re.start_date,e.created_date) start_date,COALESCE(re.end_date,e.due_date) end_date,re.man_days,e.progress,e.status
      FROM dbo.estimates e JOIN dbo.customers c ON c.id=e.customer_id
      LEFT JOIN dbo.resource_effort re ON re.entity_type=N'Estimate' AND re.entity_id=e.id
      CROSS APPLY(SELECT user_id,COUNT(*) OVER() owner_count FROM (
        SELECT a.owner_id user_id FROM dbo.estimate_assignments a WHERE a.estimate_id=e.id
        UNION SELECT a.support_id FROM dbo.estimate_assignments a WHERE a.estimate_id=e.id AND a.support_id IS NOT NULL
        UNION SELECT e.owner_id WHERE NOT EXISTS(SELECT 1 FROM dbo.estimate_assignments a WHERE a.estimate_id=e.id)) owners) o
      WHERE @estimates=1 AND e.deleted_at IS NULL AND e.archived_at IS NULL AND e.progress<100 AND e.status NOT IN(${FINISHED_SQL});
      -- A closed project's plan no longer takes anyone's time.
      DECLARE @projects TABLE(id bigint PRIMARY KEY);
      INSERT @projects SELECT p.id FROM dbo.projects p WHERE p.deleted_at IS NULL AND p.status<>N'Closed'
        AND (@project_elevated=1 OR p.manager_id=@actor OR p.lead_engineer_id=@actor
          OR EXISTS(SELECT 1 FROM dbo.project_members m WHERE m.project_id=p.id AND m.user_id=@actor));
      SELECT p.id,p.project_no,c.name customer_name FROM @projects scope JOIN dbo.projects p ON p.id=scope.id JOIN dbo.customers c ON c.id=p.customer_id;
      SELECT t.* FROM dbo.schedule_tasks t JOIN @projects p ON p.id=t.project_id WHERE t.deleted_at IS NULL ORDER BY t.project_id,t.parent_id,t.sort_order,t.id;
      SELECT pic.task_id,pic.user_id FROM dbo.schedule_task_pics pic JOIN dbo.schedule_tasks t ON t.id=pic.task_id JOIN @projects p ON p.id=t.project_id
      WHERE t.deleted_at IS NULL ORDER BY pic.task_id,pic.user_id;`;

type Row = Record<string, unknown>;
const text = (row: Row, key: string) => String(row[key] ?? "");
const id = (row: Row, key: string) => Number(row[key]);
const optional = (row: Row, key: string) => (row[key] === null || row[key] === undefined ? null : Number(row[key]));
const day = (row: Row, key: string) => dateOnly((row[key] ?? null) as Date | string | null);

/** Turns WORKLOAD_SQL's recordsets into open work items. A schedule that cannot be resolved is skipped and named in warnings. */
export function workloadItems(sets: Row[][], holidays: ReadonlySet<string>): { items: WorkloadItem[]; warnings: string[] } {
  const [inquiries = [], tasks = [], estimates = [], projects = [], scheduleRows = [], pics = []] = sets;
  const items: WorkloadItem[] = [];
  const warnings: string[] = [];
  for (const r of inquiries) items.push({
    key: `Inquiry-${id(r, "id")}`, type: "Inquiry", entityId: id(r, "id"), ownerId: optional(r, "owner_id"),
    reference: text(r, "inquiry_no"), title: text(r, "project_name"), customer: text(r, "customer_name"),
    start: day(r, "start_date"), end: day(r, "end_date"), manDays: optional(r, "man_days"), progress: Number(r.progress ?? 0), status: text(r, "status"),
  });
  for (const r of tasks) items.push({
    key: `InquiryTask-${id(r, "id")}`, type: "Inquiry", entityId: id(r, "inquiry_id"), ownerId: optional(r, "assignee_id"),
    reference: `${text(r, "inquiry_no")} · TASK-${id(r, "id")}`, title: text(r, "title"), customer: text(r, "customer_name"),
    start: day(r, "plan_start"), end: day(r, "plan_end"), manDays: optional(r, "man_days"), progress: Number(r.percent_done ?? 0), status: text(r, "execution_status"),
  });
  for (const r of estimates) {
    const effort = optional(r, "man_days"), share = Math.max(1, Number(r.owner_count ?? 1));
    items.push({
      key: `Estimate-${id(r, "id")}-${text(r, "owner_id")}`, type: "Estimate", entityId: id(r, "id"), ownerId: optional(r, "owner_id"),
      reference: text(r, "estimate_no"), title: text(r, "project_name"), customer: text(r, "customer_name"),
      start: day(r, "start_date"), end: day(r, "end_date"), manDays: effort === null ? null : effort / share, progress: Number(r.progress ?? 0), status: text(r, "status"),
    });
  }
  const projectById = new Map(projects.map((r) => [id(r, "id"), { number: text(r, "project_no"), customer: text(r, "customer_name") }]));
  const picsByTask = new Map<number, number[]>();
  for (const r of pics) picsByTask.set(id(r, "task_id"), [...(picsByTask.get(id(r, "task_id")) ?? []), id(r, "user_id")]);
  const rowsByProject = new Map<number, TaskRow[]>();
  for (const r of scheduleRows) {
    const task = taskRow(r as Row & { row_version: Buffer });
    rowsByProject.set(task.projectId, [...(rowsByProject.get(task.projectId) ?? []), task]);
  }
  for (const [projectId, rows] of rowsByProject) {
    const project = projectById.get(projectId);
    if (!project) continue;
    let calculation: ReturnType<typeof resolveTasks>;
    try { calculation = resolveTasks(rows, new Set(holidays)); } catch { warnings.push(project.number); continue; }
    for (const task of rows) {
      const resolved = calculation.byId.get(task.id);
      if (!resolved || task.kind === "phase" || resolved.children.length) continue;
      // Effort is split across the PICs; a row with none is listed once, with no owner.
      const owners = picsByTask.get(task.id) ?? [];
      const shares: Array<number | null> = owners.length ? owners : [null];
      for (const ownerId of shares) items.push({
        key: `Project-${task.id}-${ownerId ?? "none"}`, type: "Project", entityId: projectId, ownerId,
        reference: `${project.number} · ${resolved.wbs}`, title: task.name, customer: project.customer,
        start: resolved.planStart, end: resolved.planFinish, manDays: task.planManDays / shares.length,
        progress: resolved.percentComplete, status: resolved.status,
      });
    }
  }
  return { items: items.filter(isOpenWork), warnings };
}
