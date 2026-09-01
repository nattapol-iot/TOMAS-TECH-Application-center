import sql from "mssql/msnodesqlv8.js";
import type { Transaction as TransactionType } from "mssql";
import type { Database } from "./db.js";
import { ApiError } from "./errors.js";
import { bodyObject, optionalBodyText, parseDateOnly, parseRowVersion, requiredInteger, requiredText } from "./http.js";
import { dateOnly } from "./http.js";
import { resolveSchedule, type ResolvedScheduleTask, type ScheduleCalculationTask } from "./schedule-calculator.js";
import type { CurrentUser } from "./types.js";

export type ProjectRow = { id: number; projectNo: string; name: string; managerId: number; status: string };
export type PicRow = { id: number; name: string; email: string };
export type TaskRow = {
  id: number; projectId: number; parentId: number | null; sortOrder: number; kind: string; name: string; isMilestone: boolean;
  origin: string; createdBy: number; visibility: string; planStart: string | null; planDays: number; startMode: string;
  predecessorId: number | null; lagDays: number; picExternal: string; planManDays: number; baselineStart: string | null;
  baselineFinish: string | null; baselineDays: number; baselineRevision: number; actualStart: string | null;
  actualFinish: string | null; forecastFinish: string | null; percentComplete: number; status: string;
  blockedReason: string | null; remark: string | null; actualManDays: number; updatedBy: number; updatedAt: unknown; rowVersion: Buffer;
};
export type PlanInput = {
  scheduleVersion: string | null; rowVersion: Buffer | null; parentId: number | null; sortOrder: number; kind: string; name: string;
  isMilestone: boolean; visibility: string; planStart: string | null; planDays: number; startMode: string;
  predecessorId: number | null; lagDays: number; picUserIds: number[]; picExternal: string; planManDays: number;
};
export type ProgressInput = {
  scheduleVersion: string | null; rowVersion: Buffer; percentComplete: number; actualStart: string | null;
  actualFinish: string | null; forecastFinish: string | null; status: string; remark: string | null;
};

function optionalId(value: unknown, label: string): number | null {
  if (value === null || value === undefined || value === "") return null;
  return requiredInteger(value, label, 1);
}
function decimal(value: unknown, label: string, min: number, max: number, scale: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw new ApiError(400, "validation_failed", `${label} is invalid.`);
  if (!value.toString().toLowerCase().includes("e") && (value.toString().split(".")[1]?.length ?? 0) > scale) throw new ApiError(400, "validation_failed", `${label} cannot have more than ${scale} decimal places.`);
  return value;
}
function oneOf(value: string, label: string, values: string[]): string {
  if (!values.includes(value)) throw new ApiError(400, "validation_failed", `${label} is invalid.`);
  return value;
}

export function planInput(value: unknown, requireRowVersion: boolean): PlanInput {
  const body = bodyObject(value);
  const kind = oneOf(requiredText(body.kind, 20, "Task kind"), "Task kind", ["phase", "task", "detail"]);
  const visibility = oneOf(requiredText(body.visibility, 20, "Visibility"), "Visibility", ["Customer", "Internal"]);
  const startMode = oneOf(requiredText(body.startMode, 20, "Start mode"), "Start mode", ["manual", "linked"]);
  const parentId = optionalId(body.parentId, "Parent task");
  const predecessorId = optionalId(body.predecessorId, "Predecessor task");
  const planStart = parseDateOnly(body.planStart, "Plan start", true);
  const planDays = requiredInteger(body.planDays, "Plan days", 1, 3650);
  const lagDays = requiredInteger(body.lagDays, "Lag days", -365, 3650);
  const ids = Array.isArray(body.picUserIds) ? body.picUserIds.map((id) => requiredInteger(id, "PIC user id", 1)) : [];
  const picUserIds = [...new Set(ids)];
  if (picUserIds.length > 50) throw new ApiError(400, "validation_failed", "A task cannot have more than 50 PICs.");
  const isMilestone = body.isMilestone === true;
  const picExternal = optionalBodyText(body.picExternal, 300, "External PIC") ?? "";
  const planManDays = decimal(body.planManDays, "Plan man-days", 0, 1_000_000, 2);
  if (startMode === "linked" && !predecessorId) throw new ApiError(400, "validation_failed", "A linked task requires a predecessor.");
  if (kind !== "phase" && !planStart && startMode !== "linked") throw new ApiError(400, "validation_failed", "A manually scheduled task requires a plan start date.");
  if (isMilestone && planDays !== 1) throw new ApiError(400, "validation_failed", "A milestone must have a one-day duration.");
  if (kind === "phase" && (parentId || planStart || planDays !== 1 || startMode !== "manual" || predecessorId || lagDays !== 0 || picUserIds.length || picExternal || planManDays !== 0 || isMilestone)) {
    throw new ApiError(400, "validation_failed", "A phase is a top-level roll-up row and cannot contain task dates, dependencies, PICs, effort, or milestone values.");
  }
  if (kind === "detail" && !parentId) throw new ApiError(400, "validation_failed", "A detail row must belong to a task.");
  return {
    scheduleVersion: body.scheduleVersion === null || body.scheduleVersion === undefined ? null : requiredText(body.scheduleVersion, 64, "Schedule version"),
    rowVersion: requireRowVersion ? parseRowVersion(body.rowVersion) : null,
    parentId, sortOrder: requiredInteger(body.sortOrder, "Sort order", -1_000_000, 1_000_000), kind,
    name: requiredText(body.name, 500, "Task name"), isMilestone, visibility, planStart, planDays, startMode,
    predecessorId, lagDays, picUserIds, picExternal, planManDays,
  };
}

export function progressInput(value: unknown): ProgressInput {
  const body = bodyObject(value);
  const percentComplete = decimal(body.percentComplete, "Percent complete", 0, 100, 2);
  const actualStart = parseDateOnly(body.actualStart, "Actual start", true);
  const actualFinish = parseDateOnly(body.actualFinish, "Actual finish", true);
  const forecastFinish = parseDateOnly(body.forecastFinish, "Forecast finish", true);
  const status = oneOf(requiredText(body.status, 30, "Schedule status"), "Schedule status", ["Not Started", "In Progress", "Blocked", "Done"]);
  const remark = optionalBodyText(body.remark, 20_000, "Remark");
  if (status === "Blocked" && !remark) throw new ApiError(400, "validation_failed", "A blocked task requires a non-empty reason.");
  if (actualFinish && !actualStart) throw new ApiError(400, "validation_failed", "Actual finish requires an actual start.");
  if (actualFinish && actualStart && actualFinish < actualStart) throw new ApiError(400, "validation_failed", "Actual finish cannot be before actual start.");
  if (forecastFinish && actualStart && forecastFinish < actualStart) throw new ApiError(400, "validation_failed", "Forecast finish cannot be before actual start.");
  if (status === "Done" && (percentComplete !== 100 || !actualStart || !actualFinish)) throw new ApiError(400, "validation_failed", "A completed task requires 100 percent and both actual dates.");
  if (status !== "Done" && percentComplete === 100) throw new ApiError(400, "validation_failed", "A task at 100 percent must have status Done.");
  if (status === "Not Started" && (percentComplete !== 0 || actualStart || actualFinish)) throw new ApiError(400, "validation_failed", "A task that has not started cannot have progress or actual dates.");
  return { scheduleVersion: body.scheduleVersion == null ? null : requiredText(body.scheduleVersion, 64, "Schedule version"), rowVersion: parseRowVersion(body.rowVersion), percentComplete, actualStart, actualFinish, forecastFinish, status, remark };
}

function taskRow(row: Record<string, unknown> & { row_version: Buffer }): TaskRow {
  return {
    id: Number(row.id), projectId: Number(row.project_id), parentId: row.parent_id === null ? null : Number(row.parent_id),
    sortOrder: Number(row.sort_order), kind: String(row.kind), name: String(row.name), isMilestone: Boolean(row.is_milestone),
    origin: String(row.origin), createdBy: Number(row.created_by), visibility: String(row.visibility),
    planStart: dateOnly(row.plan_start as Date | string | null), planDays: Number(row.plan_days), startMode: String(row.start_mode),
    predecessorId: row.predecessor_id === null ? null : Number(row.predecessor_id), lagDays: Number(row.lag_days),
    picExternal: String(row.pic_external), planManDays: Number(row.plan_man_days), baselineStart: dateOnly(row.baseline_start as Date | string | null),
    baselineFinish: dateOnly(row.baseline_end as Date | string | null), baselineDays: Number(row.baseline_days), baselineRevision: Number(row.baseline_rev),
    actualStart: dateOnly(row.actual_start as Date | string | null), actualFinish: dateOnly(row.actual_end as Date | string | null),
    forecastFinish: dateOnly(row.forecast_end as Date | string | null), percentComplete: Number(row.percent_done), status: String(row.status),
    blockedReason: row.blocked_reason === null ? null : String(row.blocked_reason), remark: row.note === null ? null : String(row.note),
    actualManDays: Number(row.actual_man_days), updatedBy: Number(row.updated_by), updatedAt: row.updated_at, rowVersion: row.row_version,
  };
}

const TASK_COLUMNS = `id,project_id,parent_id,sort_order,kind,name,is_milestone,origin,created_by,visibility,
 plan_start,plan_days,start_mode,predecessor_id,lag_days,pic_external,plan_man_days,baseline_start,baseline_end,
 baseline_days,baseline_rev,actual_start,actual_end,forecast_end,percent_done,status,blocked_reason,note,actual_man_days,
 updated_by,updated_at,row_version`;

export async function readTasks(transaction: TransactionType, projectId: number): Promise<TaskRow[]> {
  const request = new sql.Request(transaction); request.input("project", sql.BigInt, projectId);
  return (await request.query<Record<string, unknown> & { row_version: Buffer }>(`SELECT ${TASK_COLUMNS} FROM dbo.schedule_tasks WHERE project_id=@project AND deleted_at IS NULL ORDER BY parent_id,sort_order,id;`)).recordset.map(taskRow);
}
export async function readTask(transaction: TransactionType, id: number): Promise<TaskRow> {
  const request = new sql.Request(transaction); request.input("id", sql.BigInt, id);
  const row = (await request.query<Record<string, unknown> & { row_version: Buffer }>(`SELECT ${TASK_COLUMNS} FROM dbo.schedule_tasks WITH (UPDLOCK,HOLDLOCK) WHERE id=@id AND deleted_at IS NULL;`)).recordset[0];
  if (!row) throw new ApiError(404, "schedule_task_not_found", "Schedule task not found.");
  return taskRow(row);
}
export async function readProject(transaction: TransactionType, projectId: number, lock = false): Promise<ProjectRow> {
  const request = new sql.Request(transaction); request.input("project", sql.BigInt, projectId);
  const row = (await request.query<Record<string, unknown>>(`SELECT id,project_no,name,manager_id,status FROM dbo.projects${lock ? " WITH (UPDLOCK,HOLDLOCK)" : ""} WHERE id=@project AND deleted_at IS NULL;`)).recordset[0];
  if (!row) throw new ApiError(404, "project_not_found", "Project not found.");
  return { id: Number(row.id), projectNo: String(row.project_no), name: String(row.name), managerId: Number(row.manager_id), status: String(row.status) };
}
export async function demandPlanOwner(transaction: TransactionType, projectId: number, actor: CurrentUser): Promise<ProjectRow> {
  const project = await readProject(transaction, projectId, true);
  if (project.status === "Closed") throw new ApiError(409, "project_closed", "A closed project's schedule cannot be changed.");
  if (project.managerId !== actor.id && actor.role !== "Engineering Manager" && actor.role !== "Admin") throw new ApiError(403, "schedule_plan_owner_required", "Only this project's manager, an Engineering Manager, or an Admin can change its plan.");
  return project;
}
export async function readHolidays(transaction: TransactionType): Promise<Set<string>> {
  return new Set((await new sql.Request(transaction).query<{ holiday_date: Date | string }>(`SELECT holiday_date FROM dbo.holidays;`)).recordset.map((row) => dateOnly(row.holiday_date)!));
}
export async function readPics(transaction: TransactionType, projectId: number): Promise<Map<number, PicRow[]>> {
  const request = new sql.Request(transaction); request.input("project", sql.BigInt, projectId);
  const rows = (await request.query<Record<string, unknown>>(`SELECT pic.task_id,u.id,u.name,u.email FROM dbo.schedule_task_pics pic INNER JOIN dbo.schedule_tasks t ON t.id=pic.task_id INNER JOIN dbo.users u ON u.id=pic.user_id WHERE t.project_id=@project AND t.deleted_at IS NULL ORDER BY pic.task_id,u.name,u.id;`)).recordset;
  const result = new Map<number, PicRow[]>();
  for (const row of rows) { const id = Number(row.task_id); const list = result.get(id) ?? []; list.push({ id: Number(row.id), name: String(row.name), email: String(row.email) }); result.set(id, list); }
  return result;
}
export async function currentScheduleVersion(transaction: TransactionType, projectId: number, lock = false): Promise<Buffer | null> {
  const request = new sql.Request(transaction); request.input("project", sql.BigInt, projectId);
  const row = (await request.query<{ row_version: Buffer }>(`SELECT TOP(1) row_version FROM dbo.schedule_tasks${lock ? " WITH (UPDLOCK,HOLDLOCK)" : ""} WHERE project_id=@project ORDER BY row_version DESC;`)).recordset[0];
  return row?.row_version ?? null;
}
export async function validateScheduleVersion(transaction: TransactionType, projectId: number, expected: string | null): Promise<void> {
  const current = await currentScheduleVersion(transaction, projectId, true);
  if (!current) { if (!expected) return; throw concurrency(); }
  if (!expected || !current.equals(parseRowVersion(expected))) throw concurrency();
}
export async function replacePics(transaction: TransactionType, taskId: number, ids: number[]): Promise<void> {
  const remove = new sql.Request(transaction); remove.input("task", sql.BigInt, taskId); await remove.query(`DELETE FROM dbo.schedule_task_pics WHERE task_id=@task;`);
  for (const id of ids) { const insert = new sql.Request(transaction); insert.input("task", sql.BigInt, taskId); insert.input("user", sql.BigInt, id); await insert.query(`INSERT INTO dbo.schedule_task_pics(task_id,user_id) VALUES(@task,@user);`); }
}
export async function validatePics(transaction: TransactionType, project: ProjectRow, ids: number[]): Promise<void> {
  for (const id of ids) { const request = new sql.Request(transaction); request.input("user", sql.BigInt, id); request.input("manager", sql.BigInt, project.managerId); request.input("project", sql.BigInt, project.id);
    const row = (await request.query<{ allowed: boolean }>(`SELECT CAST(CASE WHEN EXISTS(SELECT 1 FROM dbo.users u WHERE u.id=@user AND u.is_active=1 AND u.deleted_at IS NULL AND (@user=@manager OR EXISTS(SELECT 1 FROM dbo.projects p WHERE p.id=@project AND p.lead_engineer_id=@user) OR EXISTS(SELECT 1 FROM dbo.project_members pm WHERE pm.project_id=@project AND pm.user_id=@user))) THEN 1 ELSE 0 END AS bit) allowed;`)).recordset[0];
    if (!row?.allowed) throw new ApiError(422, "schedule_pic_invalid", "Every PIC must be an active member of the project."); }
}
export async function appendUpdate(transaction: TransactionType, projectId: number, taskId: number | null, actorId: number, field: string, before: string | null, after: string | null, comment: string | null): Promise<void> {
  const request = new sql.Request(transaction); request.input("project", sql.BigInt, projectId); request.input("task", sql.BigInt, taskId); request.input("actor", sql.BigInt, actorId); request.input("field", sql.NVarChar(50), field); request.input("before", sql.NVarChar(sql.MAX), before); request.input("after", sql.NVarChar(sql.MAX), after); request.input("comment", sql.NVarChar(sql.MAX), comment);
  await request.query(`INSERT INTO dbo.schedule_updates(project_id,task_id,actor_id,field,from_value,to_value,comment) VALUES(@project,@task,@actor,@field,@before,@after,@comment);`);
}
export async function hasChildren(transaction: TransactionType, taskId: number): Promise<boolean> {
  const request = new sql.Request(transaction); request.input("task", sql.BigInt, taskId); return Boolean((await request.query<{ value: boolean }>(`SELECT CAST(CASE WHEN EXISTS(SELECT 1 FROM dbo.schedule_tasks WITH (UPDLOCK,HOLDLOCK) WHERE parent_id=@task AND deleted_at IS NULL) THEN 1 ELSE 0 END AS bit) value;`)).recordset[0]?.value);
}
export async function hasPendingRequest(transaction: TransactionType, taskId: number): Promise<boolean> {
  const request = new sql.Request(transaction); request.input("task", sql.BigInt, taskId); return Boolean((await request.query<{ value: boolean }>(`SELECT CAST(CASE WHEN EXISTS(SELECT 1 FROM dbo.schedule_updates WITH (UPDLOCK,HOLDLOCK) WHERE task_id=@task AND field=N'request' AND request_days>0 AND answer IS NULL) THEN 1 ELSE 0 END AS bit) value;`)).recordset[0]?.value);
}
export async function demandAssignedLeaf(transaction: TransactionType, task: TaskRow, actorId: number): Promise<void> {
  const request = new sql.Request(transaction); request.input("task", sql.BigInt, task.id); request.input("actor", sql.BigInt, actorId);
  const allowed = Boolean((await request.query<{ allowed: boolean }>(`SELECT CAST(CASE WHEN EXISTS(SELECT 1 FROM dbo.schedule_task_pics WITH (UPDLOCK,HOLDLOCK) WHERE task_id=@task AND user_id=@actor) AND NOT EXISTS(SELECT 1 FROM dbo.schedule_tasks WITH (UPDLOCK,HOLDLOCK) WHERE parent_id=@task AND deleted_at IS NULL) THEN 1 ELSE 0 END AS bit) allowed;`)).recordset[0]?.allowed);
  if (!allowed || task.kind === "phase") throw new ApiError(403, "schedule_pic_required", "Only an assigned PIC can change a non-phase leaf task.");
}
export async function validateGraphAndHierarchy(transaction: TransactionType, projectId: number, taskId: number | null, input: PlanInput): Promise<void> {
  if (taskId && (input.parentId === taskId || input.predecessorId === taskId)) throw new ApiError(400, "schedule_self_reference", "A task cannot be its own parent or predecessor.");
  const request = new sql.Request(transaction); request.input("project", sql.BigInt, projectId);
  const rows = (await request.query<{ id: number | string; parent_id: number | string | null; predecessor_id: number | string | null; kind: string }>(`SELECT id,parent_id,predecessor_id,kind FROM dbo.schedule_tasks WITH (UPDLOCK,HOLDLOCK) WHERE project_id=@project AND deleted_at IS NULL;`)).recordset;
  const byId = new Map(rows.map((row) => [Number(row.id), { parent: row.parent_id === null ? null : Number(row.parent_id), predecessor: row.predecessor_id === null ? null : Number(row.predecessor_id), kind: row.kind }]));
  for (const reference of [input.parentId, input.predecessorId].filter((id): id is number => id !== null)) if (!byId.has(reference)) throw new ApiError(422, "schedule_reference_invalid", "Parent and predecessor tasks must be active rows in the same project.");
  if (input.kind === "phase" && input.parentId) throw new ApiError(400, "validation_failed", "A phase must be a top-level schedule row.");
  if (input.parentId) { const parentKind = byId.get(input.parentId)?.kind; if (!((input.kind === "task" && parentKind === "phase") || (input.kind === "detail" && parentKind === "task"))) throw new ApiError(422, "schedule_parent_kind_invalid", "Tasks may be top-level or belong to a phase, and detail rows must belong to a task."); }
  const key = taskId ?? -1; byId.set(key, { parent: input.parentId, predecessor: input.predecessorId, kind: input.kind });
  const visiting = new Set<number>(), visited = new Set<number>();
  const cycle = (id: number): boolean => { if (visited.has(id)) return false; if (visiting.has(id)) return true; visiting.add(id); const edge = byId.get(id); if (edge && ((edge.parent !== null && byId.has(edge.parent) && cycle(edge.parent)) || (edge.predecessor !== null && byId.has(edge.predecessor) && cycle(edge.predecessor)))) return true; visiting.delete(id); visited.add(id); return false; };
  if ([...byId.keys()].some(cycle)) throw new ApiError(409, "schedule_cycle", "The change would create a circular schedule relationship.");
  if (taskId) { const childKinds = rows.filter((row) => Number(row.parent_id) === taskId).map((row) => row.kind); if (childKinds.some((kind) => (input.kind === "phase" && kind !== "task") || (input.kind === "task" && kind !== "detail") || input.kind === "detail")) throw new ApiError(422, "schedule_child_kind_invalid", "The row kind is incompatible with its existing child rows."); }
}
export function scheduleCalculation(tasks: TaskRow[]) {
  return tasks.map((task): ScheduleCalculationTask => ({ id: task.id, parentId: task.parentId, sortOrder: task.sortOrder, planStart: task.planStart, planDays: task.planDays, startMode: task.startMode, predecessorId: task.predecessorId, lagDays: task.lagDays, actualStart: task.actualStart, actualFinish: task.actualFinish, forecastFinish: task.forecastFinish, percentComplete: task.percentComplete, status: task.status }));
}
export function taskResponse(resolved: ResolvedScheduleTask, tasks: Map<number, TaskRow>, pics: Map<number, PicRow[]>): Record<string, unknown> {
  const task = tasks.get(resolved.source.id)!;
  return { id: task.id, parentId: task.parentId, sortOrder: task.sortOrder, wbs: resolved.wbs, depth: resolved.depth, kind: task.kind, name: task.name,
    isMilestone: task.isMilestone, origin: task.origin, visibility: task.visibility, planStart: resolved.planStart, planFinish: resolved.planFinish,
    planDays: task.planDays, workDays: resolved.workDays, startMode: task.startMode, predecessorId: task.predecessorId, lagDays: task.lagDays,
    pics: pics.get(task.id) ?? [], picExternal: task.picExternal, planManDays: task.planManDays, baselineStart: task.baselineStart,
    baselineFinish: task.baselineFinish, baselineDays: task.baselineDays, baselineRevision: task.baselineRevision, actualStart: resolved.actualStart,
    actualFinish: resolved.actualFinish, forecastFinish: resolved.forecastFinish, percentComplete: resolved.percentComplete, status: resolved.status,
    remark: task.remark, actualManDays: task.actualManDays, rowVersion: task.rowVersion.toString("base64"), updatedAt: task.updatedAt,
    updatedBy: task.updatedBy, children: resolved.children.map((child) => taskResponse(child, tasks, pics)) };
}
export function resolveTasks(tasks: TaskRow[], holidays: Set<string>) { return resolveSchedule(scheduleCalculation(tasks), holidays); }
export function concurrency(): ApiError { return new ApiError(409, "concurrency_conflict", "The schedule changed. Reload it and try again."); }
export function calendarDays(start: string | null, finish: string | null): number { return !start || !finish || finish < start ? 0 : Math.round((Date.parse(`${finish}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1; }
export async function permissionFor(database: Database, role: string, permission: string): Promise<boolean> { const result = await database.query<{ allowed: boolean }>(`SELECT CAST(CASE WHEN EXISTS(SELECT 1 FROM dbo.roles r INNER JOIN dbo.role_permissions rp ON rp.role_id=r.id INNER JOIN dbo.permissions p ON p.id=rp.permission_id WHERE r.code=@role AND p.code=@permission) THEN 1 ELSE 0 END AS bit) allowed;`, (request) => { request.input("role", sql.NVarChar(50), role); request.input("permission", sql.NVarChar(100), permission); }); return Boolean(result.recordset[0]?.allowed); }
