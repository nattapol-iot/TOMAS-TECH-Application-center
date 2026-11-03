import sql from "mssql";
import type { Transaction as TransactionType } from "mssql";
import { ApiError } from "./errors.js";
import { parseDateOnly, requiredInteger, requiredText } from "./http.js";
import type { NewPics } from "./project-notices.js";
import { appendUpdate, calendarDays, readHolidays, readPics, readTasks, replacePics, resolveTasks } from "./schedule-service.js";
import { UNSORTED_HEADING } from "./schedule-phases.js";

/*
 * A project's plan as Create project and Edit project write it (owner, 2026-11-03). The Master Plan
 * lists the main headings with the dates promised to the customer; the Team Plan breaks each heading
 * into tasks, each with a member, and each task into the functions to build:
 *
 *   2 Software development    heading: a top-level phase; its own plan dates are the customer's
 *     2.1 Web App WMS         task: a member is required
 *       2.1.1 Inbound         function: the task's member unless another is named
 *
 * Both are one schedule tree, so Project Schedule, the timeline and My Work read them like any other
 * rows. A heading's bar follows the rows under it once it has any; its own dates stay as the
 * customer's, for the Master Plan and to show when the team's plan runs past them.
 */

export { UNSORTED_HEADING };
export const PROJECT_NUMBER_PATTERN = /^[A-Z0-9][A-Z0-9._/-]{1,29}$/;
/** PJ000000 and the like: the ERP has not issued the number yet, so several projects may share it (migration 084). */
export const isPlaceholderProjectNumber = (number: string): boolean => number.includes("0") && !/[1-9]/.test(number);
const MAX_HEADINGS = 50;
const MAX_PLAN_ROWS = 500;
const MAX_PLAN_DAYS = 3650;

// id names an existing schedule row when the plan is edited; a row without one is new.
/** A function may leave out its dates and its member: it then has its task's. */
export type PlanFunction = { id?: number; name: string; userId: number | null; start: string | null; finish: string | null };
export type PlanTask = { id?: number; name: string; userId: number; start: string; finish: string; planManDays: number; functions: PlanFunction[] };
export type PlanHeading = { id?: number; name: string; start: string; finish: string; tasks: PlanTask[] };
export type InitialPlan = { headings: PlanHeading[] };

/** The ERP project number, as typed from the ERP, in one canonical spelling. */
export function parseProjectNumber(value: unknown): string {
  const number = requiredText(value, 30, "Project number").toUpperCase();
  if (!PROJECT_NUMBER_PATTERN.test(number)) {
    throw new ApiError(400, "validation_failed", "Project number must be the ERP number, such as PJ260017: letters, digits and - _ . / only.");
  }
  return number;
}

function rows(value: unknown, label: string, max: number): Record<string, unknown>[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new ApiError(400, "validation_failed", `${label} must be a list.`);
  if (value.length > max) throw new ApiError(400, "validation_failed", `${label} cannot have more than ${max} rows.`);
  return value.map((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) throw new ApiError(400, "validation_failed", `Every ${label} row must be an object.`);
    return row as Record<string, unknown>;
  });
}

function period(row: Record<string, unknown>, label: string): { start: string; finish: string } {
  const start = parseDateOnly(row.start, `${label} start`)!;
  const finish = parseDateOnly(row.finish, `${label} finish`)!;
  if (finish < start) throw new ApiError(400, "validation_failed", `${label} finishes before it starts.`);
  if (calendarDays(start, finish) > MAX_PLAN_DAYS) throw new ApiError(400, "validation_failed", `${label} cannot be longer than ${MAX_PLAN_DAYS} days.`);
  return { start, finish };
}

function optionalPeriod(row: Record<string, unknown>, label: string): { start: string | null; finish: string | null } {
  const blank = (value: unknown) => value === undefined || value === null || value === "";
  return blank(row.start) && blank(row.finish) ? { start: null, finish: null } : period(row, label);
}

function manDays(value: unknown, label: string): number {
  if (value === undefined || value === null || value === "") return 0;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1_000_000
    || (!value.toString().includes("e") && (value.toString().split(".")[1]?.length ?? 0) > 2)) {
    throw new ApiError(400, "validation_failed", `${label} must be a number of man-days with at most 2 decimal places.`);
  }
  return value;
}

const rowId = (row: Record<string, unknown>, label: string) => row.id === undefined || row.id === null ? {} : { id: requiredInteger(row.id, `${label} id`, 1) };

/** The plan before 2026-11-03 sent its team rows, and rows outside its two phases, as lists of their own. */
export function rejectOutdatedPlan(body: Record<string, unknown>): void {
  if (body.team !== undefined || body.newRows !== undefined || body.otherRows !== undefined) {
    throw new ApiError(400, "plan_shape_outdated", "The plan form has changed: the team plan now sits under the Master Plan headings. Reload the page and try again.");
  }
}

/** masterPlan: the headings, each with its tasks and each task with its functions. None is a project without a plan yet. */
export function parseInitialPlan(body: Record<string, unknown>): InitialPlan {
  rejectOutdatedPlan(body);
  let count = 0;
  const headings = rows(body.masterPlan, "Master plan", MAX_HEADINGS).map((heading, index) => {
    const label = `Master plan heading ${index + 1}`;
    const tasks = rows(heading.tasks, `${label} tasks`, MAX_PLAN_ROWS).map((task, taskIndex) => {
      const taskLabel = `Team plan task ${index + 1}.${taskIndex + 1}`;
      const functions = rows(task.functions, `${taskLabel} functions`, MAX_PLAN_ROWS).map((item, itemIndex) => {
        const itemLabel = `Team plan function ${index + 1}.${taskIndex + 1}.${itemIndex + 1}`;
        const userId = item.userId === undefined || item.userId === null || item.userId === 0 ? null : requiredInteger(item.userId, `${itemLabel} member`, 1);
        return { ...rowId(item, itemLabel), name: requiredText(item.name, 500, `${itemLabel} name`), userId, ...optionalPeriod(item, itemLabel) };
      });
      count += 1 + functions.length;
      return {
        ...rowId(task, taskLabel), name: requiredText(task.name, 500, `${taskLabel} name`), userId: requiredInteger(task.userId, `${taskLabel} member`, 1),
        ...period(task, taskLabel), planManDays: manDays(task.planManDays, `${taskLabel} plan`), functions,
      };
    });
    count += 1;
    return { ...rowId(heading, label), name: requiredText(heading.name, 500, `${label} name`), ...period(heading, label), tasks };
  });
  if (count > MAX_PLAN_ROWS) throw new ApiError(400, "validation_failed", `A plan cannot have more than ${MAX_PLAN_ROWS} rows.`);
  return { headings };
}

/** First start and last finish over every dated row, or null when the plan has none. */
export function planSpan(plan: InitialPlan): { start: string; finish: string } | null {
  const dated = plan.headings.flatMap((heading): { start: string | null; finish: string | null }[] => [heading, ...heading.tasks.flatMap((task) => [task, ...task.functions])])
    .filter((row): row is { start: string; finish: string } => row.start !== null && row.finish !== null);
  if (!dated.length) return null;
  return { start: dated.map((row) => row.start).sort()[0]!, finish: dated.map((row) => row.finish).sort().at(-1)! };
}

/** Who does what, for the mail a new project sends: each task's member, and each function's. */
export function planAssignments(plan: InitialPlan): { userId: number; task: string; start: string; finish: string }[] {
  return plan.headings.flatMap((heading) => heading.tasks.flatMap((task) => [
    { userId: task.userId, task: task.name, start: task.start, finish: task.finish },
    ...task.functions.map((item) => ({ userId: item.userId ?? task.userId, task: `${task.name} · ${item.name}`, start: item.start ?? task.start, finish: item.finish ?? task.finish })),
  ]));
}

const planMembers = (plan: InitialPlan) => plan.headings.flatMap((heading) => heading.tasks.flatMap((task) => [task.userId, ...task.functions.map((item) => item.userId ?? task.userId)]));

type NewRow = { parentId: number | null; sortOrder: number; kind: "phase" | "task"; name: string; visibility: "Customer" | "Internal"; planStart: string | null; planDays: number; planManDays: number };

async function insertRow(transaction: TransactionType, projectId: number, actorId: number, row: NewRow, note: string): Promise<number> {
  const insert = new sql.Request(transaction);
  insert.input("project", sql.BigInt, projectId).input("parent", sql.BigInt, row.parentId).input("sort", sql.Int, row.sortOrder)
    .input("kind", sql.NVarChar(20), row.kind).input("name", sql.NVarChar(500), row.name).input("visibility", sql.NVarChar(20), row.visibility)
    .input("plan_start", sql.Date, row.planStart).input("plan_days", sql.Int, row.planDays)
    .input("man_days", sql.Decimal(9, 2), row.planManDays).input("actor", sql.BigInt, actorId);
  const created = (await insert.query<{ id: number | string }>(`DECLARE @changed TABLE(id bigint);
    INSERT INTO dbo.schedule_tasks(project_id,parent_id,sort_order,kind,name,is_milestone,origin,created_by,visibility,plan_start,plan_days,start_mode,predecessor_id,lag_days,pic_external,plan_man_days,updated_by)
    OUTPUT inserted.id INTO @changed VALUES(@project,@parent,@sort,@kind,@name,0,N'PM',@actor,@visibility,@plan_start,@plan_days,N'manual',NULL,0,N'',@man_days,@actor);
    SELECT id FROM @changed;`)).recordset[0]!;
  const id = Number(created.id);
  await appendUpdate(transaction, projectId, id, actorId, "created", null, row.name, note);
  return id;
}

const CREATED = "Created with the project", ADDED = "Added in Edit project";

/** A heading is shown to the customer: it is the Master Plan. */
const insertHeading = (transaction: TransactionType, projectId: number, actorId: number, sortOrder: number, heading: { name: string; start: string; finish: string }, note: string) =>
  insertRow(transaction, projectId, actorId, { parentId: null, sortOrder, kind: "phase", name: heading.name, visibility: "Customer",
    planStart: heading.start, planDays: calendarDays(heading.start, heading.finish), planManDays: 0 }, note);

async function insertFunction(transaction: TransactionType, projectId: number, actorId: number, taskId: number, sortOrder: number, item: PlanFunction,
  task: { userId: number; start: string; finish: string }, note: string): Promise<NewPics> {
  const start = item.start ?? task.start, finish = item.finish ?? task.finish;
  const id = await insertRow(transaction, projectId, actorId, { parentId: taskId, sortOrder, kind: "task", name: item.name, visibility: "Internal",
    planStart: start, planDays: calendarDays(start, finish), planManDays: 0 }, note);
  return { taskId: id, userIds: await replacePics(transaction, id, [item.userId ?? task.userId]) };
}

/** A task with its functions; returns who was given which row. */
async function insertTask(transaction: TransactionType, projectId: number, actorId: number, headingId: number, sortOrder: number, task: PlanTask, note: string): Promise<NewPics[]> {
  const id = await insertRow(transaction, projectId, actorId, { parentId: headingId, sortOrder, kind: "task", name: task.name, visibility: "Internal",
    planStart: task.start, planDays: calendarDays(task.start, task.finish), planManDays: task.planManDays }, note);
  const assigned: NewPics[] = [{ taskId: id, userIds: await replacePics(transaction, id, [task.userId]) }];
  for (const [index, item] of task.functions.entries()) assigned.push(await insertFunction(transaction, projectId, actorId, id, index + 1, item, task, note));
  return assigned;
}

/** A schedule PIC must be a project member, so everyone on the team plan joins the project. */
async function ensureMembers(transaction: TransactionType, projectId: number, userIds: number[], actorId: number): Promise<void> {
  for (const userId of new Set(userIds)) {
    const member = new sql.Request(transaction);
    member.input("project", sql.BigInt, projectId).input("user", sql.BigInt, userId).input("actor", sql.BigInt, actorId);
    const result = await member.query<{ active: boolean }>(`DECLARE @active bit = CASE WHEN EXISTS(
        SELECT 1 FROM dbo.users WHERE id=@user AND is_active=1 AND deleted_at IS NULL) THEN 1 ELSE 0 END;
      IF @active=1 AND NOT EXISTS(SELECT 1 FROM dbo.project_members WHERE project_id=@project AND user_id=@user)
        INSERT INTO dbo.project_members(project_id,user_id,role_on_project,created_by) VALUES(@project,@user,N'Member',@actor);
      SELECT @active AS active;`);
    if (!result.recordset[0]?.active) throw new ApiError(422, "invalid_reference", "Every team plan member must be an active user.");
  }
}

/**
 * Team members join the project first -- a schedule PIC must be a member -- then each heading is
 * written with its tasks and their functions. Runs inside the project's own creation transaction,
 * so a project never exists with half of its plan.
 */
export async function insertInitialPlan(transaction: TransactionType, projectId: number, plan: InitialPlan, actorId: number): Promise<void> {
  await ensureMembers(transaction, projectId, planMembers(plan), actorId);
  for (const [index, heading] of plan.headings.entries()) {
    const headingId = await insertHeading(transaction, projectId, actorId, index + 1, heading, CREATED);
    for (const [taskIndex, task] of heading.tasks.entries()) await insertTask(transaction, projectId, actorId, headingId, taskIndex + 1, task, CREATED);
  }
}

/**
 * The heading rows wait under until the project manager files them under a real one: the Team plan
 * rows of a project planned before headings (migration 098), and rows Resource Plan adds.
 */
export async function unsortedHeadingId(transaction: TransactionType, projectId: number, actorId: number): Promise<number> {
  const find = new sql.Request(transaction); find.input("project", sql.BigInt, projectId).input("name", sql.NVarChar(500), UNSORTED_HEADING);
  const found = (await find.query<{ id: number | string }>(`SELECT TOP (1) id FROM dbo.schedule_tasks WITH (UPDLOCK,HOLDLOCK)
    WHERE project_id=@project AND parent_id IS NULL AND kind=N'phase' AND name=@name AND deleted_at IS NULL ORDER BY id;`)).recordset[0];
  if (found) return Number(found.id);
  const last = (await find.query<{ value: number }>(`SELECT COALESCE(MAX(sort_order),0)+1 value FROM dbo.schedule_tasks WITH (UPDLOCK,HOLDLOCK)
    WHERE project_id=@project AND parent_id IS NULL AND deleted_at IS NULL;`)).recordset[0]!.value;
  return insertRow(transaction, projectId, actorId, { parentId: null, sortOrder: Number(last), kind: "phase", name: UNSORTED_HEADING, visibility: "Internal",
    planStart: null, planDays: 1, planManDays: 0 }, "Waits for the project manager to file its rows under a heading");
}

export type ScheduleRow = {
  id: number; parentId: number | null; kind: string; name: string; sortOrder: number; startMode: string;
  planStart: string | null; planDays: number; planManDays: number; started: boolean; children: number;
  pending: boolean; referenced: boolean; pic: number | null; picCount: number;
  /** Members' own tasks under the row, and whether Resource Plan manages it. */
  details: number; managed: boolean;
};

export async function readScheduleRows(transaction: TransactionType, projectId: number, removing: number[] = []): Promise<ScheduleRow[]> {
  const request = new sql.Request(transaction); request.input("project", sql.BigInt, projectId);
  request.input("removing", sql.NVarChar(sql.MAX), JSON.stringify(removing));
  const rows = (await request.query<Record<string, unknown>>(`
    SELECT t.id,t.parent_id,t.kind,t.name,t.sort_order,t.start_mode,CONVERT(char(10),t.plan_start,23) plan_start,t.plan_days,t.plan_man_days,
      CASE WHEN t.status<>N'Not Started' OR t.percent_done>0 OR t.actual_start IS NOT NULL OR t.actual_end IS NOT NULL OR t.actual_man_days>0 THEN 1 ELSE 0 END started,
      (SELECT COUNT(*) FROM dbo.schedule_tasks c WHERE c.parent_id=t.id AND c.deleted_at IS NULL) children,
      (SELECT COUNT(*) FROM dbo.schedule_tasks c WHERE c.parent_id=t.id AND c.kind=N'detail' AND c.deleted_at IS NULL) details,
      CASE WHEN EXISTS(SELECT 1 FROM dbo.resource_tasks r WHERE r.schedule_task_id=t.id) THEN 1 ELSE 0 END managed,
      CASE WHEN EXISTS(SELECT 1 FROM dbo.schedule_updates u WHERE u.task_id=t.id AND u.field=N'request' AND u.request_days>0 AND u.answer IS NULL) THEN 1 ELSE 0 END pending,
      CASE WHEN EXISTS(SELECT 1 FROM dbo.schedule_tasks d WHERE d.predecessor_id=t.id AND d.deleted_at IS NULL AND d.id NOT IN (SELECT id FROM OPENJSON(@removing) WITH (id bigint '$')))
        OR EXISTS(SELECT 1 FROM dbo.resource_tasks r WHERE r.schedule_task_id=t.id)
        OR EXISTS(SELECT 1 FROM dbo.signable_documents sd WHERE sd.schedule_task_id=t.id)
        OR EXISTS(SELECT 1 FROM dbo.unified_reports ur WHERE ur.schedule_task_id=t.id) THEN 1 ELSE 0 END referenced,
      (SELECT MIN(p.user_id) FROM dbo.schedule_task_pics p WHERE p.task_id=t.id) pic,
      (SELECT COUNT(*) FROM dbo.schedule_task_pics p WHERE p.task_id=t.id) pic_count
    FROM dbo.schedule_tasks t WITH(UPDLOCK,HOLDLOCK) WHERE t.project_id=@project AND t.deleted_at IS NULL;`)).recordset;
  return rows.map((row) => ({
    id: Number(row.id), parentId: row.parent_id === null ? null : Number(row.parent_id), kind: String(row.kind), name: String(row.name),
    sortOrder: Number(row.sort_order), startMode: String(row.start_mode), planStart: row.plan_start === null ? null : String(row.plan_start),
    planDays: Number(row.plan_days), planManDays: Number(row.plan_man_days), started: Boolean(row.started), children: Number(row.children),
    pending: Boolean(row.pending), referenced: Boolean(row.referenced), pic: row.pic === null ? null : Number(row.pic), picCount: Number(row.pic_count),
    details: Number(row.details), managed: Boolean(row.managed),
  }));
}

async function removeRow(transaction: TransactionType, projectId: number, row: ScheduleRow, actorId: number): Promise<void> {
  // The history row first: schedule_updates may only point at a task that is still active.
  await appendUpdate(transaction, projectId, row.id, actorId, "deleted", row.name, null, "Removed in Edit project");
  const remove = new sql.Request(transaction); remove.input("id", sql.BigInt, row.id).input("actor", sql.BigInt, actorId);
  await remove.query(`UPDATE dbo.schedule_tasks SET deleted_at=SYSUTCDATETIME(),updated_by=@actor,updated_at=SYSUTCDATETIME() WHERE id=@id AND deleted_at IS NULL;`);
}

type RowChange = { name: string; planStart: string | null; planDays: number; planManDays: number; sortOrder: number };

async function updateRow(transaction: TransactionType, projectId: number, actorId: number, row: ScheduleRow, next: RowChange): Promise<void> {
  const update = new sql.Request(transaction);
  update.input("id", sql.BigInt, row.id).input("name", sql.NVarChar(500), next.name).input("start", sql.Date, next.planStart)
    .input("days", sql.Int, next.planDays).input("man_days", sql.Decimal(9, 2), next.planManDays).input("sort", sql.Int, next.sortOrder).input("actor", sql.BigInt, actorId);
  await update.query(`UPDATE dbo.schedule_tasks SET name=@name,plan_start=@start,plan_days=@days,plan_man_days=@man_days,sort_order=@sort,
    updated_by=@actor,updated_at=SYSUTCDATETIME() WHERE id=@id AND deleted_at IS NULL;`);
  await appendUpdate(transaction, projectId, row.id, actorId, "plan",
    JSON.stringify({ name: row.name, planStart: row.planStart, planDays: row.planDays, planManDays: row.planManDays }),
    JSON.stringify({ name: next.name, planStart: next.planStart, planDays: next.planDays, planManDays: next.planManDays }), "Changed in Edit project");
}

/**
 * The dates a kept plan row is saved with. A row with rows under it, or one that follows a
 * predecessor, is shown with its resolved dates and the form sends those back: that is no change,
 * and its own stored dates stay. Any other dates for it are a change this form cannot make.
 */
export function keptPlanRowDates(current: Pick<ScheduleRow, "planStart" | "planDays" | "children" | "startMode">, input: { start: string; finish: string },
  shown: { planStart: string | null; planFinish: string | null } | undefined): { planStart: string | null; planDays: number; changed: boolean } {
  if (current.children > 0 || current.startMode !== "manual") {
    return { planStart: current.planStart, planDays: current.planDays, changed: shown?.planStart !== input.start || shown?.planFinish !== input.finish };
  }
  const planDays = calendarDays(input.start, input.finish);
  return { planStart: input.start, planDays, changed: current.planStart !== input.start || current.planDays !== planDays };
}

/** What the form edits: headings (top-level phases), their tasks, and those tasks' functions. Members' own tasks are not among them. */
export function planRowsOf(rows: ScheduleRow[]): Set<number> {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const level = (row: ScheduleRow): number => {
    if (row.parentId === null) return row.kind === "phase" ? 1 : 0;
    const parent = byId.get(row.parentId);
    if (!parent || row.kind !== "task") return 0;
    const above = level(parent);
    return above === 1 || above === 2 ? above + 1 : 0;
  };
  return new Set(rows.filter((row) => level(row) > 0).map((row) => row.id));
}

/**
 * Rows the form no longer lists, with every row under them, deepest first so a heading or a task goes
 * after the rows under it. Each must be free to go: no progress, no pending request for more days,
 * nothing linked to it and no member's own task, or the save stops and names it.
 */
export function plannedRemovals(rows: ScheduleRow[], listed: Set<number>): ScheduleRow[] {
  const managed = planRowsOf(rows), byParent = new Map<number, ScheduleRow[]>();
  for (const row of rows) if (row.parentId !== null) byParent.set(row.parentId, [...(byParent.get(row.parentId) ?? []), row]);
  const removing: { row: ScheduleRow; depth: number }[] = [], seen = new Set<number>();
  const take = (row: ScheduleRow, depth: number) => {
    if (seen.has(row.id)) return;
    seen.add(row.id); removing.push({ row, depth });
    for (const child of byParent.get(row.id) ?? []) take(child, depth + 1);
  };
  for (const row of rows) if (managed.has(row.id) && !listed.has(row.id) && (row.parentId === null || listed.has(row.parentId))) take(row, 0);
  for (const { row } of removing) {
    if (row.started || row.pending || row.referenced || row.kind === "detail") {
      throw new ApiError(409, "schedule_row_in_use", `"${row.name}" has progress, a member's own task or linked work, so it cannot be removed here. Keep it, or change it in Project Schedule.`);
    }
  }
  return removing.sort((a, b) => b.depth - a.depth).map((item) => item.row);
}

/**
 * Edit project rewrites the plan to match the form: headings, their tasks and the tasks' functions,
 * matched by id and saved in the order given. A row keeps its progress when renamed or re-dated, and
 * a row the form no longer lists goes only when nothing hangs on it (plannedRemovals). A task takes
 * its first function only while nothing has started on it, as in Project Schedule. Returns who became
 * a row's person in charge, so they can be told.
 */
export async function syncProjectPlan(transaction: TransactionType, projectId: number, plan: InitialPlan, actorId: number): Promise<NewPics[]> {
  const assigned: NewPics[] = [];
  await ensureMembers(transaction, projectId, planMembers(plan), actorId);
  const rows = await readScheduleRows(transaction, projectId);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const pics = await readPics(transaction, projectId);
  const picsOf = (id: number) => (pics.get(id) ?? []).map((pic) => pic.id);
  // Only rows whose dates are derived need the resolved plan; a plan with no such row skips it.
  const shown = rows.some((row) => row.children > 0 || row.startMode !== "manual")
    ? resolveTasks(await readTasks(transaction, projectId), await readHolidays(transaction)).byId : null;
  const existing = (id: number | undefined, parentId: number | null, kind: string): ScheduleRow | undefined => {
    if (id === undefined) return undefined;
    const row = byId.get(id);
    if (!row || row.parentId !== parentId || row.kind !== kind) throw new ApiError(409, "schedule_row_missing", "A plan row was changed or removed elsewhere. Reload the project and try again.");
    return row;
  };
  /** Name, dates, effort and place, when any of them changed; dates the row derives are only compared, and a function left undated keeps its own. */
  const keep = async (row: ScheduleRow, name: string, period: { start: string; finish: string } | null, planManDays: number, sortOrder: number) => {
    const dates = period ? keptPlanRowDates(row, period, shown?.get(row.id)) : { planStart: row.planStart, planDays: row.planDays, changed: false };
    if (dates.changed && (row.children > 0 || row.startMode !== "manual")) {
      throw new ApiError(409, "schedule_rollup_plan_derived", `"${row.name}" takes its dates from the rows under it or a predecessor. Change them in Project Schedule.`);
    }
    const changed = dates.changed || row.name !== name || row.planManDays !== planManDays || row.sortOrder !== sortOrder;
    if (changed && row.pending) throw new ApiError(409, "schedule_day_request_pending", `"${row.name}" has a pending request for more days. Answer it before changing the row.`);
    if (changed) await updateRow(transaction, projectId, actorId, row, { name, planStart: dates.planStart, planDays: dates.planDays, planManDays, sortOrder });
  };
  /** A row whose member the form changed; a row shared by several PICs keeps them while one of them is still named. */
  const assign = async (row: ScheduleRow, userId: number | null) => {
    if (userId !== null && !picsOf(row.id).includes(userId)) assigned.push({ taskId: row.id, userIds: await replacePics(transaction, row.id, [userId]) });
  };

  const listed = new Set(plan.headings.flatMap((heading) => [heading.id, ...heading.tasks.flatMap((task) => [task.id, ...task.functions.map((item) => item.id)])])
    .filter((id): id is number => id !== undefined));
  for (const row of plannedRemovals(rows, listed)) await removeRow(transaction, projectId, row, actorId);

  for (const [index, heading] of plan.headings.entries()) {
    const current = existing(heading.id, null, "phase");
    let headingId: number;
    if (current) {
      headingId = current.id;
      const planDays = calendarDays(heading.start, heading.finish);
      // A heading's own dates are the customer's, whatever the rows under it say.
      if (current.name !== heading.name || current.planStart !== heading.start || current.planDays !== planDays || current.sortOrder !== index + 1) {
        await updateRow(transaction, projectId, actorId, current, { name: heading.name, planStart: heading.start, planDays, planManDays: 0, sortOrder: index + 1 });
      }
    } else headingId = await insertHeading(transaction, projectId, actorId, index + 1, heading, ADDED);
    for (const [taskIndex, task] of heading.tasks.entries()) {
      const row = existing(task.id, headingId, "task");
      if (!row) { assigned.push(...await insertTask(transaction, projectId, actorId, headingId, taskIndex + 1, task, ADDED)); continue; }
      await keep(row, task.name, task, task.planManDays, taskIndex + 1);
      await assign(row, task.userId);
      const hasFunctions = rows.some((child) => child.parentId === row.id && child.kind === "task");
      if (task.functions.length && row.details) {
        throw new ApiError(409, "schedule_row_in_use", `"${row.name}" holds a member's own task, so it cannot be broken into functions.`);
      }
      if (task.functions.some((item) => item.id === undefined) && !hasFunctions && (row.started || row.pending || row.managed)) {
        throw new ApiError(409, "schedule_row_in_use", `"${row.name}" already has progress or linked work, so it cannot take functions. Add them under another task.`);
      }
      for (const [itemIndex, item] of task.functions.entries()) {
        const functionRow = existing(item.id, row.id, "task");
        if (!functionRow) { assigned.push(await insertFunction(transaction, projectId, actorId, row.id, itemIndex + 1, item, task, ADDED)); continue; }
        await keep(functionRow, item.name, item.start !== null && item.finish !== null ? { start: item.start, finish: item.finish } : null, functionRow.planManDays, itemIndex + 1);
        // No member named: the function keeps whoever it has, or takes its task's.
        await assign(functionRow, item.userId ?? (picsOf(functionRow.id).length ? null : task.userId));
      }
    }
  }
  return assigned;
}

/* ── Team, customer payments and contacts ─────────────────────────────── */

export const PAYMENT_MILESTONES = ["AFTER_PO", "AFTER_DESIGN", "AFTER_INSTALL", "GO_LIVE"] as const;
export type PaymentMilestone = (typeof PAYMENT_MILESTONES)[number];
/** Each field is undefined when the request leaves it unchanged. */
export type ProjectDetails = { team?: string | null; paymentsReceived?: PaymentMilestone[]; contactIds?: number[] };

export function parseProjectDetails(body: Record<string, unknown>): ProjectDetails {
  const details: ProjectDetails = {};
  if (body.department !== undefined) {
    if (body.department !== null && typeof body.department !== "string") throw new ApiError(400, "validation_failed", "Team must be text.");
    const team = typeof body.department === "string" ? body.department.trim() : "";
    if (team.length > 100) throw new ApiError(400, "validation_failed", "Team cannot exceed 100 characters.");
    details.team = team || null;
  }
  if (body.paymentsReceived !== undefined) {
    if (!Array.isArray(body.paymentsReceived) || body.paymentsReceived.some((code) => !PAYMENT_MILESTONES.includes(code as PaymentMilestone))) {
      throw new ApiError(400, "validation_failed", `Payments received must be any of ${PAYMENT_MILESTONES.join(", ")}.`);
    }
    details.paymentsReceived = [...new Set(body.paymentsReceived as PaymentMilestone[])];
  }
  if (body.contactIds !== undefined) {
    if (!Array.isArray(body.contactIds) || body.contactIds.length > 50) throw new ApiError(400, "validation_failed", "Customer contacts must be a list of at most 50.");
    details.contactIds = [...new Set(body.contactIds.map((id) => requiredInteger(id, "Customer contact", 1)))];
  }
  return details;
}

/** Replaces each given set; a contact must be an active contact of the project's own customer. */
export async function writeProjectDetails(transaction: TransactionType, projectId: number, details: ProjectDetails, actorId: number): Promise<void> {
  if (details.team !== undefined) {
    const update = new sql.Request(transaction); update.input("id", sql.BigInt, projectId).input("team", sql.NVarChar(100), details.team);
    await update.query(`UPDATE dbo.projects SET team=@team WHERE id=@id;`);
  }
  if (details.paymentsReceived !== undefined) {
    const request = new sql.Request(transaction);
    request.input("id", sql.BigInt, projectId).input("actor", sql.BigInt, actorId).input("codes", sql.NVarChar(200), details.paymentsReceived.join(","));
    // A stage already received keeps who recorded it and when.
    await request.query(`DELETE FROM dbo.project_payment_milestones WHERE project_id=@id AND milestone NOT IN(SELECT value FROM STRING_SPLIT(@codes,N','));
      INSERT dbo.project_payment_milestones(project_id,milestone,received_by)
      SELECT @id,value,@actor FROM STRING_SPLIT(@codes,N',') s WHERE value<>N''
        AND NOT EXISTS(SELECT 1 FROM dbo.project_payment_milestones m WHERE m.project_id=@id AND m.milestone=s.value);`);
  }
  if (details.contactIds !== undefined) {
    const request = new sql.Request(transaction);
    request.input("id", sql.BigInt, projectId).input("actor", sql.BigInt, actorId).input("ids", sql.NVarChar(sql.MAX), details.contactIds.join(","));
    const valid = (await request.query<{ count: number }>(`SELECT COUNT(*) count FROM dbo.customer_site_contacts sc
      JOIN dbo.customer_sites s ON s.id=sc.site_id JOIN dbo.projects p ON p.customer_id=s.customer_id AND p.id=@id
      WHERE sc.id IN(SELECT TRY_CONVERT(bigint,value) FROM STRING_SPLIT(@ids,N',')) AND sc.is_active=1 AND sc.deleted_at IS NULL;`)).recordset[0]!;
    if (Number(valid.count) !== details.contactIds.length) {
      throw new ApiError(422, "invalid_reference", "Every project contact must be an active contact of this customer.");
    }
    await request.query(`DELETE FROM dbo.project_contacts WHERE project_id=@id AND contact_id NOT IN(SELECT TRY_CONVERT(bigint,value) FROM STRING_SPLIT(@ids,N',') WHERE value<>N'');
      INSERT dbo.project_contacts(project_id,contact_id,added_by)
      SELECT @id,TRY_CONVERT(bigint,value),@actor FROM STRING_SPLIT(@ids,N',') s WHERE value<>N''
        AND NOT EXISTS(SELECT 1 FROM dbo.project_contacts c WHERE c.project_id=@id AND c.contact_id=TRY_CONVERT(bigint,s.value));`);
  }
}
