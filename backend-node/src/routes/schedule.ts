import sql from "mssql";
import type { FastifyInstance } from "fastify";
import type { Transaction as TransactionType } from "mssql";
import { insertAudit } from "../audit.js";
import type { Database } from "../db.js";
import { ApiError, dayRequestAnswerError } from "../errors.js";
import { hasRole } from "../user-roles.js";
import { bodyObject, dateOnly, optionalBodyText, parseRowVersion, positiveLong, requiredInteger, requiredText } from "../http.js";
import { demandProjectScope, isMyWorkElevated, isProjectElevated, isProjectManagerRole } from "../project-scope.js";
import { leaderTeamOf, leaderTeamProjectSql } from "../leader-scope.js";
import { manHourBudget, MAXIMUM_BUDGET_MAN_DAYS, parseBudgetManDays, readStoredBudget } from "../manhour-budget.js";
import { networkDays } from "../schedule-calculator.js";
import { fitPeople, peopleChange, peopleEdits, peopleJson, peopleManDays } from "../plan-people.js";
import { businessToday } from "../business-date.js";
import { normalizeBusinessTimeZone } from "../config.js";
import { countedLeaves, scheduleLeaves, summarizeProjectSchedule } from "../project-health.js";
import { unconfirmedDates, type WeekAway, type WeekTask } from "../team-week.js";
import { addDays } from "../work-days.js";
import {
  appendUpdate,
  calendarDays,
  canAnswerDayRequests,
  concurrency,
  currentScheduleVersion,
  demandAssignedLeaf,
  demandPlanOwner,
  demandRowPlanOwner,
  demandMemberPlanRow,
  demandProgressWriter,
  hasChildren,
  hasNoActivePic,
  hasPendingRequest,
  isProjectMember,
  optionalId,
  permissionFor,
  placeInOrder,
  planInput,
  progressInput,
  readProjectWork,
  readHolidays,
  readManagedTaskIds,
  readPics,
  readProject,
  readTask,
  readTasks,
  replacePics,
  resolveTasks,
  taskResponse,
  validateGraphAndHierarchy,
  validatePics,
  validateScheduleVersion,
  type PlanInput,
  type PicRow,
  type TaskRow,
} from "../schedule-service.js";
import type { CurrentUser } from "../types.js";
import type { CurrentUserService } from "../users.js";
import type { EmailService } from "../email.js";
import { deliverProjectNotices, queueTaskAssignmentNotices } from "../project-notices.js";
import { ensureMembers, readScheduleRows } from "../project-initial-plan.js";

/**
 * A task under a main heading may wait for its member (owner, 2026-11-24, the plan Sheet: "ผู้ทำไม่บังคับ"); with a
 * discipline it waits for the head to name its people on Team overview > Allocation (owner, 2026-11-22). A function under
 * a task has its task's people unless others are named.
 */
async function membersFor(transaction: TransactionType, projectId: number, input: PlanInput): Promise<number[]> {
  if (input.kind !== "task" || input.parentId === null || input.picUserIds.length) return input.picUserIds;
  const parent = await readTask(transaction, input.parentId);
  if (parent.kind === "phase") return [];
  return ((await readPics(transaction, projectId)).get(parent.id) ?? []).filter((pic) => pic.active).map((pic) => pic.id);
}

function bindPlan(request: InstanceType<typeof sql.Request>, projectId: number, input: PlanInput, actorId: number): void {
  request.input("project", sql.BigInt, projectId);
  request.input("parent", sql.BigInt, input.parentId);
  request.input("sort", sql.Int, input.sortOrder);
  request.input("kind", sql.NVarChar(20), input.kind);
  request.input("name", sql.NVarChar(500), input.name);
  request.input("milestone", sql.Bit, input.isMilestone);
  request.input("visibility", sql.NVarChar(20), input.visibility);
  request.input("plan_start", sql.Date, input.planStart);
  request.input("plan_days", sql.Int, input.planDays);
  request.input("start_mode", sql.NVarChar(20), input.startMode);
  request.input("predecessor", sql.BigInt, input.predecessorId);
  request.input("lag", sql.Int, input.lagDays);
  request.input("pic_external", sql.NVarChar(300), input.picExternal);
  request.input("man_days", sql.Decimal(9, 2), input.planManDays);
  request.input("discipline", sql.NVarChar(20), input.discipline ?? null);
  request.input("actor", sql.BigInt, actorId);
  // The other rows it waits for (migration 126): replaced when sent, kept when left out, none once it is not linked.
  request.input("extra_set", sql.Bit, input.extraLinks !== undefined);
  request.input("extra", sql.NVarChar(2000), input.extraLinks?.length ? JSON.stringify(input.extraLinks) : null);
}

function planAudit(input: PlanInput): Record<string, unknown> {
  return {
    parentId: input.parentId,
    sortOrder: input.sortOrder,
    kind: input.kind,
    name: input.name,
    isMilestone: input.isMilestone,
    visibility: input.visibility,
    planStart: input.planStart,
    planDays: input.planDays,
    startMode: input.startMode,
    predecessorId: input.predecessorId,
    lagDays: input.lagDays,
    picUserIds: input.picUserIds,
    picExternal: input.picExternal,
    planManDays: input.planManDays,
    discipline: input.discipline ?? null,
  };
}

function existingPlan(task: TaskRow, picUserIds: number[]): Record<string, unknown> {
  return {
    parentId: task.parentId,
    sortOrder: task.sortOrder,
    kind: task.kind,
    name: task.name,
    isMilestone: task.isMilestone,
    visibility: task.visibility,
    planStart: task.planStart,
    planDays: task.planDays,
    startMode: task.startMode,
    predecessorId: task.predecessorId,
    lagDays: task.lagDays,
    picUserIds,
    picExternal: task.picExternal,
    planManDays: task.planManDays,
    discipline: task.discipline ?? null,
  };
}

// Baseline headers only: the frozen snapshot_json is kept for audit, and no screen reads it, so the
// schedule a timeline expands per project stays small.
async function readBaselines(transaction: TransactionType, projectId: number) {
  const request = new sql.Request(transaction);
  request.input("project", sql.BigInt, projectId);
  return (
    await request.query<Record<string, unknown>>(
      `SELECT b.id,b.revision,b.label,b.taken_at,u.name taken_by,b.reason,b.task_count,b.promised_finish FROM dbo.schedule_baselines b INNER JOIN dbo.users u ON u.id=b.taken_by WHERE b.project_id=@project ORDER BY b.revision DESC;`,
    )
  ).recordset.map((row) => ({
    id: Number(row.id),
    revision: Number(row.revision),
    label: row.label,
    takenAt: row.taken_at,
    takenBy: row.taken_by,
    reason: row.reason,
    taskCount: Number(row.task_count),
    promisedFinish: row.promised_finish,
  }));
}

async function readUpdates(transaction: TransactionType, projectId: number) {
  const request = new sql.Request(transaction);
  request.input("project", sql.BigInt, projectId);
  return (
    await request.query<
      Record<string, unknown>
    >(`WITH ranked AS (SELECT s.*,ROW_NUMBER() OVER(ORDER BY s.occurred_at DESC,s.id DESC) recent_rank FROM dbo.schedule_updates s WHERE s.project_id=@project)
    SELECT s.id,s.task_id,s.field,s.from_value,s.to_value,s.comment,s.request_days,s.answer,s.answer_by,answered.name answer_by_name,s.answer_note,s.answered_at,s.occurred_at,u.id actor_id,u.name actor_name
    FROM ranked s INNER JOIN dbo.users u ON u.id=s.actor_id LEFT JOIN dbo.users answered ON answered.id=s.answer_by
    WHERE s.recent_rank<=100 OR (s.field=N'request' AND s.request_days>0 AND s.answer IS NULL) ORDER BY s.occurred_at DESC,s.id DESC;`)
  ).recordset.map((row) => ({
    id: Number(row.id),
    taskId: row.task_id === null ? null : Number(row.task_id),
    field: row.field,
    fromValue: row.from_value,
    toValue: row.to_value,
    comment: row.comment,
    requestDays: Number(row.request_days),
    answer: row.answer,
    answerBy: row.answer_by === null ? null : { id: Number(row.answer_by), name: row.answer_by_name },
    answerNote: row.answer_note,
    answeredAt: row.answered_at,
    occurredAt: row.occurred_at,
    actor: { id: Number(row.actor_id), name: row.actor_name },
  }));
}

async function projectSchedule(transaction: TransactionType, database: Database, actor: CurrentUser, projectId: number, canPlanPermission: boolean, canProgressPermission: boolean, today: string) {
  await demandProjectScope(database, actor, projectId, transaction);
  const project = await readProject(transaction, projectId);
  const tasks = await readTasks(transaction, projectId);
  const holidays = await readHolidays(transaction);
  const pics = await readPics(transaction, projectId);
  const managed = await readManagedTaskIds(transaction, projectId);
  const calculation = resolveTasks(tasks, holidays);
  // One progress and health rule for every screen: work-day weighted, Master Plan frame rows left out (project-health.ts).
  const leaves = scheduleLeaves(tasks, calculation),
    counted = new Set(countedLeaves(leaves).map((leaf) => leaf.id));
  const shared = summarizeProjectSchedule({ status: project.status, targetDelivery: project.targetDelivery }, leaves, today);
  const starts = calculation.roots
    .map((item) => item.planStart)
    .filter((value): value is string => Boolean(value))
    .sort();
  const finishes = calculation.roots
    .map((item) => item.planFinish)
    .filter((value): value is string => Boolean(value))
    .sort();
  const baselines = await readBaselines(transaction, projectId);
  const canPlan = project.status !== "Closed" && (project.leadEngineerId === actor.id || (canPlanPermission && canAnswerDayRequests(project, actor)));
  const isMember = await isProjectMember(transaction, projectId, actor.id);
  // Estimated against planned man-days (manhour-budget.ts); a manager types the budget when the Estimate has no labor.
  const rowHours = await readRowHours(transaction, projectId);
  const requests = await readProjectRequests(transaction, projectId);
  const manHours = manHourBudget(await readStoredBudget(transaction, projectId), tasks, isProjectManagerRole(actor) && project.status !== "Closed");
  return {
    projectId,
    projectNo: project.projectNo,
    projectName: project.name,
    managerId: project.managerId,
    leadEngineerId: project.leadEngineerId,
    projectStatus: project.status,
    scheduleVersion: (await currentScheduleVersion(transaction, projectId))?.toString("base64") ?? null,
    canPlan,
    // The same people as canPlan (manager, Engineering Manager or Admin in any role held); migration 068 aligned the procedure.
    canAnswerRequests: canPlanPermission && project.status !== "Closed" && canAnswerDayRequests(project, actor),
    canBaseline: canPlanPermission && project.status !== "Closed" && canAnswerDayRequests(project, actor),
    canUpdateProgress: canProgressPermission && project.status !== "Closed",
    manHours,
    summary: {
      planStart: starts[0] ?? null,
      planFinish: finishes.at(-1) ?? null,
      workDays: networkDays(starts[0] ?? null, finishes.at(-1) ?? null, holidays),
      percentComplete: shared.progress ?? 0,
      taskCount: shared.taskCount,
      doneCount: shared.doneCount,
      blockedCount: shared.blockedCount,
      health: shared.health,
      plannedProgress: shared.plannedProgress,
      overdueCount: shared.overdueCount,
      slipDays: shared.slipDays,
    },
    latestBaseline: baselines[0] ?? null,
    baselines,
    recentUpdates: await readUpdates(transaction, projectId),
    // Company holidays, so the plan screen places a linked row's start the way schedule-calculator.ts does.
    holidays: [...holidays].sort(),
    ...(await readHolidayList(transaction, projectId)),
    ...(await readFollowUpFacts(transaction, projectId, pics, holidays, today)),
    tasks: calculation.roots.map((item) =>
      taskResponse(item, new Map(tasks.map((task) => [task.id, task])), pics, {
        actorId: actor.id,
        managed,
        projectCanProgress: canProgressPermission && project.status !== "Closed",
        isManager: project.managerId === actor.id,
        isAdmin: hasRole(actor, "Admin"),
        isMember,
        canPlan,
        frameIds: new Set(leaves.filter((leaf) => !counted.has(leaf.id) && !leaf.rollup).map((leaf) => leaf.id)),
        actualHours: rowHours,
        purchaseRequests: requests,
      }),
    ),
  };
}

/** Hours on each plan row of a project: confirmed in My Work (work keys "Project-<id>") and an outside supplier's (migration 127). */
export const ROW_HOURS_SQL = `SELECT task_id,SUM(hours) hours FROM (
    SELECT TRY_CONVERT(bigint,SUBSTRING(work_key,9,30)) task_id,hours FROM dbo.work_hours WHERE project_id=@project AND work_key LIKE N'Project-%'
    UNION ALL SELECT v.task_id,v.hours FROM dbo.schedule_vendor_hours v INNER JOIN dbo.schedule_tasks t ON t.id=v.task_id WHERE t.project_id=@project AND t.labor_source=N'Outsourced'
  ) h WHERE task_id IS NOT NULL GROUP BY task_id;`;
/** The project's purchase requests, by id: what an outsourced plan row can be bought on (migration 128). */
async function readProjectRequests(transaction: TransactionType, projectId: number): Promise<Map<number, { prNo: string; status: string }>> {
  const request = new sql.Request(transaction);
  request.input("project", sql.BigInt, projectId);
  const rows = (await request.query<{ id: number | string; pr_no: string; status: string }>(`SELECT id,pr_no,status FROM dbo.mat_prs WHERE project_id=@project AND deleted_at IS NULL;`)).recordset;
  return new Map(rows.map((row) => [Number(row.id), { prNo: row.pr_no, status: row.status }]));
}

/**
 * Company holidays with their names and when the app first saw each (null: before migration 130), and what the plan's
 * managers decided about a new one on each row: the plan Sheet's holidays dialog and follow-up list (task doc 4.4-4.5).
 */
export const HOLIDAY_LIST_SQL = `SELECT holiday_date,name,added_at FROM dbo.holidays ORDER BY holiday_date;
  SELECT d.task_id,d.holiday_date,d.decision FROM dbo.schedule_holiday_decisions d INNER JOIN dbo.schedule_tasks t ON t.id=d.task_id
  WHERE t.project_id=@project AND t.deleted_at IS NULL;`;
async function readHolidayList(transaction: TransactionType, projectId: number) {
  const request = new sql.Request(transaction);
  request.input("project", sql.BigInt, projectId);
  const sets = ((await request.query(HOLIDAY_LIST_SQL)).recordsets ?? []) as unknown as Record<string, unknown>[][];
  return {
    holidayList: (sets[0] ?? []).map((row) => ({
      date: dateOnly(row.holiday_date as Date | string)!,
      name: String(row.name),
      addedAt: row.added_at ? new Date(row.added_at as Date | string).toISOString() : null,
    })),
    holidayDecisions: (sets[1] ?? []).map((row) => ({ taskId: Number(row.task_id), date: dateOnly(row.holiday_date as Date | string)!, decision: String(row.decision) })),
  };
}

/** Task doc 3.8: how far back the plan Sheet's follow-up list looks for days whose hours are not confirmed. */
export const UNCONFIRMED_DAYS_BACK = 14;
/**
 * Task doc 3.8, the rest of the plan Sheet's follow-up list:
 * - the customer schedule last kept in folder 08, and the rows changed since it was sent. Every plan change is logged
 *   in dbo.schedule_updates, a deleted row included; what the file does not show is left out: members (assign),
 *   baselines, day requests and a purchase request link (a "plan" entry of its own). The same second counts as after.
 *   moved: one of the row's entries can move its dates (plan, plan_days, people, created, deleted), so the rows linked
 *   after it move too; progress alone (percent, status, actual dates) never does.
 * - for the active people named on the plan's rows, the days they confirmed and their time away over the last
 *   UNCONFIRMED_DAYS_BACK days, so the days still to confirm follow Team week's rule (team-week.ts).
 */
export const FOLLOW_UP_SQL = `SET NOCOUNT ON;
  DECLARE @file_name nvarchar(500), @sent datetimeoffset(0);
  SELECT TOP(1) @file_name=d.name,@sent=d.uploaded_at FROM dbo.project_docs d
  WHERE d.project_id=@project AND d.folder_code=N'08' AND d.document_type=N'Customer schedule' AND d.deleted_at IS NULL
  ORDER BY d.uploaded_at DESC,d.id DESC;
  SELECT @file_name name,@sent uploaded_at WHERE @sent IS NOT NULL;
  SELECT t.id task_id,t.parent_id,t.name,t.kind,CONVERT(bit,CASE WHEN t.deleted_at IS NULL THEN 0 ELSE 1 END) deleted,
    CONVERT(bit,MAX(CASE WHEN u.field IN (N'plan',N'plan_days',N'people',N'created',N'deleted') THEN 1 ELSE 0 END)) moved
  FROM dbo.schedule_updates u INNER JOIN dbo.schedule_tasks t ON t.id=u.task_id AND t.project_id=@project
  WHERE @sent IS NOT NULL AND u.project_id=@project AND u.occurred_at>=@sent
    AND u.field NOT IN (N'assign',N'baseline',N'request',N'request_answer')
    AND NOT (u.field=N'plan' AND u.to_value LIKE N'{"purchaseRequestId":%')
    AND NOT (t.deleted_at IS NOT NULL AND t.created_at>=@sent)
  GROUP BY t.id,t.parent_id,t.name,t.kind,t.deleted_at;
  DECLARE @people TABLE(user_id bigint PRIMARY KEY);
  INSERT @people(user_id) SELECT DISTINCT pic.user_id FROM dbo.schedule_task_pics pic
    INNER JOIN dbo.schedule_tasks t ON t.id=pic.task_id
    INNER JOIN dbo.users u ON u.id=pic.user_id AND u.is_active=1 AND u.deleted_at IS NULL
    WHERE t.project_id=@project AND t.deleted_at IS NULL;
  SELECT d.user_id,d.work_date FROM dbo.work_days d INNER JOIN @people p ON p.user_id=d.user_id WHERE d.work_date BETWEEN @from AND @to;
  SELECT e.user_id,CONVERT(date,SWITCHOFFSET(e.starts_at,'+07:00')) start_date,
    CONVERT(date,SWITCHOFFSET(DATEADD(second,-1,e.ends_at),'+07:00')) end_date
  FROM dbo.engineer_availability e INNER JOIN @people p ON p.user_id=e.user_id
  WHERE e.deleted_at IS NULL AND CONVERT(date,SWITCHOFFSET(e.ends_at,'+07:00'))>=@from AND CONVERT(date,SWITCHOFFSET(e.starts_at,'+07:00'))<=@to;
  SELECT a.user_id,t.id,t.start_date,t.end_date,t.time_slot,
    CONVERT(char(5),t.start_time,108) start_time,CONVERT(char(5),t.end_time,108) end_time
  FROM dbo.team_tasks t JOIN dbo.team_task_assignees a ON a.task_id=t.id INNER JOIN @people p ON p.user_id=a.user_id
  WHERE t.deleted_at IS NULL AND t.status<>N'Cancelled' AND t.kind=N'Away' AND t.end_date>=@from AND t.start_date<=@to;`;
async function readFollowUpFacts(transaction: TransactionType, projectId: number, pics: Map<number, PicRow[]>, holidays: Set<string>, today: string) {
  const from = addDays(today, -UNCONFIRMED_DAYS_BACK),
    to = addDays(today, -1);
  const request = new sql.Request(transaction);
  request.input("project", sql.BigInt, projectId);
  request.input("from", sql.Date, from);
  request.input("to", sql.Date, to);
  const [fileRows = [], changeRows = [], dayRows = [], awayRows = [], taskRows = []] = ((await request.query(FOLLOW_UP_SQL)).recordsets ?? []) as unknown as Record<string, unknown>[][];
  const day = (row: Record<string, unknown>, key: string) => dateOnly(row[key] as Date | string)!;
  const file = fileRows[0];
  const away: WeekAway[] = awayRows.map((row) => ({ userId: Number(row.user_id), start: day(row, "start_date"), end: day(row, "end_date") }));
  const tasks: WeekTask[] = taskRows.map((row) => ({
    userId: Number(row.user_id),
    id: Number(row.id),
    kind: "Away",
    title: "",
    projectId: null,
    projectNo: null,
    start: day(row, "start_date"),
    end: day(row, "end_date"),
    slot: String(row.time_slot ?? ""),
    startTime: row.start_time ? String(row.start_time).trim() : null,
    endTime: row.end_time ? String(row.end_time).trim() : null,
    manDays: 0,
  }));
  const input = {
    from,
    to,
    holidays,
    blocks: [],
    meetings: [],
    tasks,
    away,
    confirmed: new Map(dayRows.map((row) => [`${Number(row.user_id)}|${day(row, "work_date")}`, 0] as const)),
    visibleProjects: null,
  };
  // Someone no longer on the project team (or no longer active) is never asked to confirm (ACTIVE_PIC_SQL).
  const people = [...new Set([...pics.values()].flat().flatMap((pic) => (pic.active ? [pic.id] : [])))];
  return {
    customerFile: file
      ? {
          name: String(file.name),
          sentAt: new Date(file.uploaded_at as Date | string).toISOString(),
          changes: changeRows.map((row) => ({
            taskId: Number(row.task_id),
            parentId: row.parent_id === null || row.parent_id === undefined ? null : Number(row.parent_id),
            name: String(row.name ?? ""),
            kind: String(row.kind ?? "task"),
            deleted: Boolean(row.deleted),
            moved: Boolean(row.moved),
          })),
        }
      : null,
    unconfirmedHours: people.map((userId) => ({ userId, dates: unconfirmedDates(userId, input, today) })).filter((item) => item.dates.length),
  };
}

async function readRowHours(transaction: TransactionType, projectId: number): Promise<Map<number, number>> {
  const request = new sql.Request(transaction);
  request.input("project", sql.BigInt, projectId);
  const rows = (await request.query<{ task_id: number | string | null; hours: number }>(ROW_HOURS_SQL)).recordset;
  return new Map(rows.filter((row) => row.task_id !== null).map((row) => [Number(row.task_id), Math.round(Number(row.hours) * 100) / 100]));
}

/** timeZone: the business time zone (config.businessTimeZone); without it, the same Business__TimeZoneId setting loadConfig reads. */
export function registerScheduleRoutes(app: FastifyInstance, database: Database, users: CurrentUserService, timeZone?: string, email?: EmailService): void {
  const businessTimeZone = timeZone ?? normalizeBusinessTimeZone(process.env.Business__TimeZoneId);
  app.get("/api/v1/projects/:projectId/schedule", async (request) => {
    await users.demandPermission(request, "schedule.read");
    const actor = await users.required(request);
    const projectId = positiveLong((request.params as { projectId?: string }).projectId, "Project id");
    const [canPlan, canProgress] = await Promise.all([permissionFor(database, actor.id, "schedule.plan"), permissionFor(database, actor.id, "schedule.progress")]);
    const today = businessToday(businessTimeZone);
    return database.transaction((transaction) => projectSchedule(transaction, database, actor, projectId, canPlan, canProgress, today), sql.ISOLATION_LEVEL.READ_COMMITTED);
  });

  app.post("/api/v1/projects/:projectId/schedule/tasks", async (request, reply) => {
    const actor = await users.required(request);
    const projectId = positiveLong((request.params as { projectId?: string }).projectId, "Project id");
    const input = planInput(request.body, false);
    // A row added in place (the + on a row of the plan) names the sibling it goes before, or null to go last; the server finds its sort order.
    const beforeId = bodyObject(request.body).beforeId === undefined ? undefined : optionalId(bodyObject(request.body).beforeId, "Place before task");
    const created = await database.transaction(async (transaction) => {
      const { project, canPlan } = await demandMemberPlanRow(transaction, database, projectId, actor, null, input);
      await validateScheduleVersion(transaction, projectId, input.scheduleVersion);
      await validateGraphAndHierarchy(transaction, projectId, null, input);
      if (input.parentId && (await hasPendingRequest(transaction, input.parentId)))
        throw new ApiError(409, "schedule_day_request_pending", "Answer the pending request for more days before changing this task's child rows.");
      const picUserIds = !canPlan && !input.picUserIds.length ? [actor.id] : await membersFor(transaction, projectId, input);
      await validatePics(transaction, project, picUserIds);
      let sortOrder = input.sortOrder;
      if (beforeId !== undefined) {
        const read = new sql.Request(transaction);
        read.input("project", sql.BigInt, projectId);
        read.input("parent", sql.BigInt, input.parentId);
        const siblings = (
          await read.query<{ id: number | string; sort_order: number }>(
            `SELECT id,sort_order FROM dbo.schedule_tasks WITH (UPDLOCK,HOLDLOCK) WHERE project_id=@project AND deleted_at IS NULL AND ((@parent IS NULL AND parent_id IS NULL) OR parent_id=@parent) ORDER BY sort_order,id;`,
          )
        ).recordset.map((row) => ({ id: Number(row.id), sortOrder: Number(row.sort_order) }));
        const placed = placeInOrder(siblings, beforeId, 0);
        for (const row of placed.renumber) {
          const renumber = new sql.Request(transaction);
          renumber.input("id", sql.BigInt, row.id);
          renumber.input("sort", sql.Int, row.sortOrder);
          await renumber.query(`UPDATE dbo.schedule_tasks SET sort_order=@sort WHERE id=@id AND deleted_at IS NULL;`);
        }
        sortOrder = placed.sortOrder;
      }
      const insert = new sql.Request(transaction);
      bindPlan(insert, projectId, { ...input, sortOrder }, actor.id);
      insert.input("origin", sql.NVarChar(20), canPlan ? "PM" : "Member");
      const row = (
        await insert.query<{
          id: number | string;
          row_version: Buffer;
        }>(`DECLARE @changed TABLE(id bigint,row_version binary(8)); INSERT INTO dbo.schedule_tasks(project_id,parent_id,sort_order,kind,name,is_milestone,origin,created_by,visibility,plan_start,plan_days,start_mode,predecessor_id,lag_days,extra_links,pic_external,plan_man_days,discipline,updated_by)
        OUTPUT inserted.id,inserted.row_version INTO @changed VALUES(@project,@parent,@sort,@kind,@name,@milestone,@origin,@actor,@visibility,@plan_start,@plan_days,@start_mode,@predecessor,@lag,CASE WHEN @start_mode=N'linked' THEN @extra END,@pic_external,@man_days,@discipline,@actor); SELECT id,row_version FROM @changed;`)
      ).recordset[0]!;
      const id = Number(row.id);
      const added = await replacePics(transaction, id, picUserIds);
      await appendUpdate(transaction, projectId, id, actor.id, "created", null, input.name, "Schedule task created");
      await insertAudit(transaction, actor.id, "Schedule Task", id, `T-${id}`, "Created", null, planAudit({ ...input, picUserIds }));
      const notices = await queueTaskAssignmentNotices(transaction, { id: actor.id, name: actor.name }, [{ taskId: id, userIds: added }]);
      return { id, rowVersion: row.row_version.toString("base64"), scheduleVersion: row.row_version.toString("base64"), notices };
    });
    const { notices, ...task } = created;
    return reply
      .status(201)
      .header("Location", `/api/v1/schedule/tasks/${created.id}`)
      .send({ ...task, notification: await deliverProjectNotices(email, notices) });
  });

  app.put("/api/v1/schedule/tasks/:id", async (request) => {
    const actor = await users.required(request);
    const id = positiveLong((request.params as { id?: string }).id, "Schedule task id");
    const input = planInput(request.body, true);
    const saved = await database.transaction(async (transaction) => {
      const existing = await readTask(transaction, id);
      const { project } = await demandMemberPlanRow(transaction, database, existing.projectId, actor, existing, input);
      // An older client sends no discipline: the row keeps the one it has.
      if (input.discipline === undefined) input.discipline = existing.discipline ?? null;
      await validateScheduleVersion(transaction, existing.projectId, input.scheduleVersion);
      if (!existing.rowVersion.equals(input.rowVersion!)) throw concurrency();
      const pics = await readPics(transaction, existing.projectId);
      const oldPics = (pics.get(id) ?? []).map((pic) => pic.id);
      if (await hasPendingRequest(transaction, id)) throw new ApiError(409, "schedule_day_request_pending", "Answer the pending request for more days before changing this task's plan or assignment.");
      // A screen that knows one predecessor leaves the others out: they stay, except one that is now the first.
      if (input.extraLinks === undefined && input.startMode === "linked")
        input.extraLinks = (existing.startMode === "linked" ? (existing.extraLinks ?? []) : []).filter((link) => link.predecessorId !== input.predecessorId);
      await validateGraphAndHierarchy(transaction, existing.projectId, id, input);
      if (input.parentId !== existing.parentId && input.parentId && (await hasPendingRequest(transaction, input.parentId)))
        throw new ApiError(409, "schedule_day_request_pending", "Answer the pending request for more days before changing this task's child rows.");
      await validatePics(transaction, project, input.picUserIds);
      // The details route refuses a personal task under a shared row; this is the same rule from the other side:
      // a second PIC on a row that already holds a member's personal task would never see that row in My Work.
      if (input.picUserIds.length > 1 && oldPics.length <= 1) {
        const details = new sql.Request(transaction);
        details.input("id", sql.BigInt, id);
        if ((await details.query<{ found: number }>(`SELECT COUNT_BIG(*) found FROM dbo.schedule_tasks WHERE parent_id=@id AND kind=N'detail' AND deleted_at IS NULL;`)).recordset[0]?.found)
          throw new ApiError(409, "schedule_detail_shared_task", "This task holds a member's personal task. Remove it before giving the task a second PIC.");
      }
      // A heading's own dates are the customer's, so they change whatever rows sit under it.
      if (
        existing.kind !== "phase" &&
        (await hasChildren(transaction, id)) &&
        (existing.planStart !== input.planStart ||
          existing.planDays !== input.planDays ||
          existing.startMode !== input.startMode ||
          existing.predecessorId !== input.predecessorId ||
          // A gap saved in calendar days comes back as working days (migration 125), so its number is not compared.
          (existing.lagDays !== input.lagDays && existing.lagWorkDays !== false) ||
          JSON.stringify(input.extraLinks ?? []) !== JSON.stringify(existing.startMode === "linked" ? (existing.extraLinks ?? []) : []))
      )
        throw new ApiError(400, "schedule_rollup_plan_derived", "A roll-up row's dates and dependency are calculated from its children and cannot be changed directly.");
      // People typed in the People table stay with the row: cut to its new length, and its man-days stay theirs (plan-people.ts).
      const people = fitPeople(existing.peopleByDay ?? [], input.kind === "phase" || input.isMilestone ? 0 : input.planDays);
      if (people.length) input.planManDays = peopleManDays(people);
      const update = new sql.Request(transaction);
      bindPlan(update, existing.projectId, input, actor.id);
      update.input("id", sql.BigInt, id);
      update.input("version", sql.VarBinary(8), input.rowVersion);
      update.input("people", sql.NVarChar(sql.MAX), peopleJson(people));
      const row = (
        await update.query<{ row_version: Buffer }>(
          `DECLARE @changed TABLE(row_version binary(8)); UPDATE dbo.schedule_tasks SET parent_id=@parent,sort_order=@sort,kind=@kind,name=@name,is_milestone=@milestone,visibility=@visibility,plan_start=@plan_start,plan_days=@plan_days,start_mode=@start_mode,predecessor_id=@predecessor,lag_days=@lag,lag_work_days=1,extra_links=CASE WHEN @start_mode<>N'linked' THEN NULL WHEN @extra_set=1 THEN @extra ELSE extra_links END,pic_external=@pic_external,plan_man_days=@man_days,discipline=@discipline,people_by_day=@people,updated_by=@actor,updated_at=SYSUTCDATETIME() OUTPUT inserted.row_version INTO @changed WHERE id=@id AND project_id=@project AND deleted_at IS NULL AND row_version=@version; SELECT row_version FROM @changed;`,
        )
      ).recordset[0];
      if (!row) throw concurrency();
      const added = await replacePics(transaction, id, input.picUserIds);
      const before = existingPlan(existing, oldPics),
        after = planAudit(input);
      await appendUpdate(transaction, existing.projectId, id, actor.id, "plan", JSON.stringify(before), JSON.stringify(after), null);
      await insertAudit(transaction, actor.id, "Schedule Task", id, `T-${id}`, "Updated plan", before, after);
      const notices = await queueTaskAssignmentNotices(transaction, { id: actor.id, name: actor.name }, [{ taskId: id, userIds: added }]);
      return { id, rowVersion: row.row_version.toString("base64"), scheduleVersion: (await currentScheduleVersion(transaction, existing.projectId))!.toString("base64"), notices };
    });
    const { notices, ...task } = saved;
    return { ...task, notification: await deliverProjectNotices(email, notices) };
  });

  // Team overview > Allocation (owner, 2026-11-22): the head names the people of a plan row from the queue of rows waiting
  // for people, without opening the project's plan. Only the PICs change; the row's dates, effort and discipline stay. A
  // person named here joins the project's team, as a PIC must be a member.
  app.post("/api/v1/schedule/tasks/:id/assign", async (request) => {
    const actor = await users.required(request);
    const id = positiveLong((request.params as { id?: string }).id, "Schedule task id");
    const body = bodyObject(request.body);
    const raw = Array.isArray(body.userIds) ? body.userIds : null;
    if (!raw || !raw.length || raw.length > 10) throw new ApiError(400, "validation_failed", "Name one to ten people for the row.");
    const userIds = [...new Set(raw.map((value) => requiredInteger(value, "User id", 1)))];
    const saved = await database.transaction(async (transaction) => {
      const task = await readTask(transaction, id);
      if (task.kind !== "task") throw new ApiError(400, "schedule_assign_task_only", "People are named on a task row.");
      const project = await demandRowPlanOwner(transaction, database, task.projectId, actor);
      if (await hasPendingRequest(transaction, id)) throw new ApiError(409, "schedule_day_request_pending", "Answer the pending request for more days before changing this task's plan or assignment.");
      const oldPics = ((await readPics(transaction, task.projectId)).get(id) ?? []).map((pic) => pic.id);
      if (userIds.length > 1 && oldPics.length <= 1) {
        const details = new sql.Request(transaction);
        details.input("id", sql.BigInt, id);
        if ((await details.query<{ found: number }>(`SELECT COUNT_BIG(*) found FROM dbo.schedule_tasks WHERE parent_id=@id AND kind=N'detail' AND deleted_at IS NULL;`)).recordset[0]?.found)
          throw new ApiError(409, "schedule_detail_shared_task", "This task holds a member's personal task. Remove it before giving the task a second PIC.");
      }
      await ensureMembers(transaction, task.projectId, userIds, actor.id);
      await validatePics(transaction, project, userIds);
      const added = await replacePics(transaction, id, userIds);
      const touch = new sql.Request(transaction);
      touch.input("id", sql.BigInt, id).input("actor", sql.BigInt, actor.id);
      await touch.query(`UPDATE dbo.schedule_tasks SET updated_by=@actor,updated_at=SYSUTCDATETIME() WHERE id=@id AND deleted_at IS NULL;`);
      await appendUpdate(transaction, task.projectId, id, actor.id, "assign", JSON.stringify(oldPics), JSON.stringify(userIds), "Assigned on Team overview > Allocation");
      await insertAudit(transaction, actor.id, "Schedule Task", id, `T-${id}`, "Assigned people", { picUserIds: oldPics }, { picUserIds: userIds });
      const notices = await queueTaskAssignmentNotices(transaction, { id: actor.id, name: actor.name }, [{ taskId: id, userIds: added }]);
      return { id, scheduleVersion: (await currentScheduleVersion(transaction, task.projectId))!.toString("base64"), notices };
    });
    const { notices, ...result } = saved;
    return { ...result, notification: await deliverProjectNotices(email, notices) };
  });

  // Task doc 3.7: link an outsourced row to the purchase request its supplier is bought on, by the request's number.
  app.put("/api/v1/schedule/tasks/:id/purchase-request", async (request) => {
    const actor = await users.required(request);
    const id = positiveLong((request.params as { id?: string }).id, "Schedule task id");
    const body = bodyObject(request.body);
    const prNo = body.prNo === null || body.prNo === undefined || body.prNo === "" ? null : requiredText(body.prNo, 30, "PR number");
    return database.transaction(async (transaction) => {
      const task = await readTask(transaction, id);
      await demandRowPlanOwner(transaction, database, task.projectId, actor);
      if (task.laborSource !== "Outsourced") throw new ApiError(409, "schedule_not_outsourced", "Only an outsourced row is linked to a purchase request.");
      let requestId: number | null = null;
      if (prNo) {
        const find = new sql.Request(transaction);
        find.input("project", sql.BigInt, task.projectId).input("no", sql.NVarChar(30), prNo.trim());
        const found = (await find.query<{ id: number | string }>(`SELECT id FROM dbo.mat_prs WHERE project_id=@project AND pr_no=@no AND deleted_at IS NULL;`)).recordset[0];
        if (!found) throw new ApiError(422, "purchase_request_not_in_project", `${prNo} is not a purchase request of this project.`);
        requestId = Number(found.id);
      }
      const save = new sql.Request(transaction);
      save.input("id", sql.BigInt, id).input("request", sql.BigInt, requestId).input("actor", sql.BigInt, actor.id);
      await save.query(`UPDATE dbo.schedule_tasks SET purchase_request_id=@request,updated_by=@actor,updated_at=SYSUTCDATETIME() WHERE id=@id AND deleted_at IS NULL;`);
      await appendUpdate(
        transaction,
        task.projectId,
        id,
        actor.id,
        // A plan change in the row's history, so a link alone never counts as work that blocks deleting the project.
        "plan",
        JSON.stringify({ purchaseRequestId: task.purchaseRequestId ?? null }),
        JSON.stringify({ purchaseRequestId: requestId }),
        prNo,
      );
      return { id, purchaseRequestId: requestId, scheduleVersion: (await currentScheduleVersion(transaction, task.projectId))?.toString("base64") ?? null };
    });
  });

  // Task doc 4.5: a new company holiday on a row; the plan's manager moved its end out (the plan change is saved on its
  // own) or kept it. Either way the follow-up list stops asking about that holiday on that row.
  app.put("/api/v1/schedule/tasks/:id/holiday-decision", async (request) => {
    const actor = await users.required(request);
    const id = positiveLong((request.params as { id?: string }).id, "Schedule task id");
    const body = bodyObject(request.body);
    const date = requiredText(body.date, 10, "Holiday date");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ApiError(422, "holiday_date_invalid", "Holiday date must be YYYY-MM-DD.");
    const decision = body.decision === "Shifted" || body.decision === "Kept" ? body.decision : null;
    if (!decision) throw new ApiError(422, "holiday_decision_invalid", "Decision must be Shifted or Kept.");
    return database.transaction(async (transaction) => {
      const task = await readTask(transaction, id);
      await demandRowPlanOwner(transaction, database, task.projectId, actor);
      const save = new sql.Request(transaction);
      save.input("id", sql.BigInt, id).input("date", sql.Date, date).input("decision", sql.NVarChar(10), decision).input("actor", sql.BigInt, actor.id);
      const saved = await save.query(`IF NOT EXISTS (SELECT 1 FROM dbo.holidays WHERE holiday_date=@date) SELECT CAST(0 AS bit) ok;
        ELSE BEGIN
          MERGE dbo.schedule_holiday_decisions WITH (HOLDLOCK) AS target USING (SELECT @id task_id,@date holiday_date) AS source
            ON target.task_id=source.task_id AND target.holiday_date=source.holiday_date
          WHEN MATCHED THEN UPDATE SET decision=@decision,decided_by=@actor,decided_at=SYSUTCDATETIME()
          WHEN NOT MATCHED THEN INSERT(task_id,holiday_date,decision,decided_by) VALUES(@id,@date,@decision,@actor);
          SELECT CAST(1 AS bit) ok;
        END`);
      if (!saved.recordset[0]?.ok) throw new ApiError(422, "holiday_not_found", `${date} is not a company holiday.`);
      await insertAudit(transaction, actor.id, "Schedule Task", id, `T-${id}`, "Holiday decision", null, { holidayDate: date, decision });
      return { taskId: id, date, decision };
    });
  });

  app.delete("/api/v1/schedule/tasks/:id", async (request) => {
    const actor = await users.required(request);
    const id = positiveLong((request.params as { id?: string }).id, "Schedule task id");
    const body = bodyObject(request.body);
    const expected = parseRowVersion(body.rowVersion);
    const scheduleVersion = body.scheduleVersion == null ? null : requiredText(body.scheduleVersion, 64, "Schedule version");
    return database.transaction(async (transaction) => {
      const existing = await readTask(transaction, id);
      const { canPlan } = await demandMemberPlanRow(transaction, database, existing.projectId, actor, existing);
      await validateScheduleVersion(transaction, existing.projectId, scheduleVersion);
      if (!existing.rowVersion.equals(expected)) throw concurrency();
      const rows = await readTasks(transaction, existing.projectId);
      const removed: number[] = [],
        seen = new Set<number>();
      const visit = (taskId: number) => {
        if (seen.has(taskId)) return;
        seen.add(taskId);
        for (const child of rows.filter((row) => row.parentId === taskId)) visit(child.id);
        removed.push(taskId);
      };
      visit(id);
      if (!canPlan && rows.some((row) => seen.has(row.id) && row.createdBy !== actor.id)) throw new ApiError(403, "schedule_row_owner_required", "Members cannot delete rows created by someone else.");
      const removing = (await readScheduleRows(transaction, existing.projectId, removed)).filter((row) => seen.has(row.id));
      const inUse = removing.find((row) => row.started || row.kind === "detail" || row.pending || row.referenced);
      if (inUse) throw new ApiError(409, "schedule_row_in_use", `Cannot delete "${inUse.name}": the row has progress, member details, a pending day request, or linked work.`);
      for (const taskId of removed) {
        const row = removing.find((item) => item.id === taskId)!;
        await appendUpdate(transaction, existing.projectId, row.id, actor.id, "deleted", row.name, null, "Removed in Project Schedule");
        const remove = new sql.Request(transaction);
        remove.input("id", sql.BigInt, row.id).input("actor", sql.BigInt, actor.id);
        await remove.query(`UPDATE dbo.schedule_tasks SET deleted_at=SYSUTCDATETIME(),updated_by=@actor,updated_at=SYSUTCDATETIME() WHERE id=@id AND deleted_at IS NULL;`);
      }
      await insertAudit(
        transaction,
        actor.id,
        "Schedule Task",
        id,
        `T-${id}`,
        "Deleted schedule row",
        removing.map((row) => ({ id: row.id, name: row.name })),
        null,
      );
      return { removed, scheduleVersion: (await currentScheduleVersion(transaction, existing.projectId))!.toString("base64") };
    });
  });

  // The People table of Projects > Plan (owner request 2026-11-18): how many people work on a row each day, typed like a
  // spreadsheet, and whether they are our own staff or outsourced manpower. One call saves every row the user touched;
  // the rules are in plan-people.ts.
  app.put("/api/v1/projects/:projectId/schedule/people", async (request) => {
    const actor = await users.required(request);
    const projectId = positiveLong((request.params as { projectId?: string }).projectId, "Project id");
    const body = bodyObject(request.body);
    const scheduleVersion = body.scheduleVersion == null ? null : requiredText(body.scheduleVersion, 64, "Schedule version");
    const edits = peopleEdits(body.rows);
    return database.transaction(async (transaction) => {
      await demandRowPlanOwner(transaction, database, projectId, actor);
      await validateScheduleVersion(transaction, projectId, scheduleVersion);
      const tasks = await readTasks(transaction, projectId),
        byId = new Map(tasks.map((task) => [task.id, task]));
      const resolved = resolveTasks(tasks, await readHolidays(transaction)).byId,
        managed = await readManagedTaskIds(transaction, projectId);
      for (const edit of edits) {
        const task = byId.get(edit.taskId);
        if (!task) throw new ApiError(404, "schedule_task_not_found", "Schedule task not found.");
        const change = peopleChange(task, resolved.get(task.id)?.planStart ?? null, edit, { hasChildren: tasks.some((row) => row.parentId === task.id), managed: managed.has(task.id) });
        if (edit.plan && (await hasPendingRequest(transaction, task.id)))
          throw new ApiError(409, "schedule_day_request_pending", "Answer the pending request for more days before changing this task's plan.");
        const update = new sql.Request(transaction);
        update.input("id", sql.BigInt, task.id);
        update.input("project", sql.BigInt, projectId);
        update.input("version", sql.VarBinary(8), task.rowVersion);
        update.input("plan_start", sql.Date, change.planStart);
        update.input("plan_days", sql.Int, change.planDays);
        update.input("start_mode", sql.NVarChar(20), change.startMode);
        update.input("predecessor", sql.BigInt, change.predecessorId);
        update.input("lag", sql.Int, change.lagDays);
        update.input("man_days", sql.Decimal(9, 2), change.planManDays);
        update.input("source", sql.NVarChar(20), change.laborSource);
        update.input("supplier", sql.NVarChar(200), change.laborSupplier);
        update.input("people", sql.NVarChar(sql.MAX), peopleJson(change.people));
        update.input("actor", sql.BigInt, actor.id);
        const result = await update.query(
          `UPDATE dbo.schedule_tasks SET plan_start=@plan_start,plan_days=@plan_days,start_mode=@start_mode,predecessor_id=@predecessor,lag_work_days=CASE WHEN lag_days=@lag THEN lag_work_days ELSE 1 END,lag_days=@lag,extra_links=CASE WHEN @start_mode<>N'linked' THEN NULL ELSE extra_links END,plan_man_days=@man_days,labor_source=@source,labor_supplier=@supplier,people_by_day=@people,updated_by=@actor,updated_at=SYSUTCDATETIME() WHERE id=@id AND project_id=@project AND deleted_at IS NULL AND row_version=@version;`,
        );
        if (result.rowsAffected[0] !== 1) throw concurrency();
        const before = {
          planStart: task.planStart,
          planDays: task.planDays,
          startMode: task.startMode,
          predecessorId: task.predecessorId,
          lagDays: task.lagDays,
          planManDays: task.planManDays,
          laborSource: task.laborSource ?? "Own",
          laborSupplier: task.laborSupplier ?? "",
          people: task.peopleByDay ?? [],
        };
        const after = {
          planStart: change.planStart,
          planDays: change.planDays,
          startMode: change.startMode,
          predecessorId: change.predecessorId,
          lagDays: change.lagDays,
          planManDays: change.planManDays,
          laborSource: change.laborSource,
          laborSupplier: change.laborSupplier,
          people: change.people,
        };
        await appendUpdate(
          transaction,
          projectId,
          task.id,
          actor.id,
          "people",
          `${before.laborSource} · ${before.planManDays} MD`,
          `${after.laborSource}${after.laborSupplier ? ` (${after.laborSupplier})` : ""} · ${after.planManDays} MD`,
          "Edited in the People table",
        );
        await insertAudit(transaction, actor.id, "Schedule Task", task.id, `T-${task.id}`, "Updated people plan", before, after);
      }
      return { saved: edits.length, scheduleVersion: (await currentScheduleVersion(transaction, projectId))!.toString("base64") };
    });
  });

  // Moves a row up or down the plan, or into another phase: its parent and its place among the new siblings. Dates,
  // effort and people stay as they are; WBS numbers follow the new order when the plan is read.
  app.post("/api/v1/schedule/tasks/:id/move", async (request) => {
    const actor = await users.required(request);
    const id = positiveLong((request.params as { id?: string }).id, "Schedule task id");
    const body = bodyObject(request.body);
    const parentId = optionalId(body.parentId, "Parent task"),
      beforeId = optionalId(body.beforeId, "Place before task");
    const expected = parseRowVersion(body.rowVersion);
    const scheduleVersion = body.scheduleVersion === null || body.scheduleVersion === undefined ? null : requiredText(body.scheduleVersion, 64, "Schedule version");
    if (parentId === id || beforeId === id) throw new ApiError(400, "schedule_self_reference", "A row cannot be placed under or before itself.");
    return database.transaction(async (transaction) => {
      const existing = await readTask(transaction, id);
      const project = await demandRowPlanOwner(transaction, database, existing.projectId, actor);
      await validateScheduleVersion(transaction, existing.projectId, scheduleVersion);
      if (!existing.rowVersion.equals(expected)) throw concurrency();
      if (parentId !== existing.parentId) {
        // Into another part of the plan, on the parent rules of a plan edit. A Resource Plan row may go under a heading
        // too: it arrives under "ยังไม่จัดหัวข้อ" for the project manager to file (UNSORTED_HEADING).
        if (await hasPendingRequest(transaction, id)) throw new ApiError(409, "schedule_day_request_pending", "Answer the pending request for more days before moving this row.");
        const pics = (await readPics(transaction, existing.projectId)).get(id) ?? [];
        await validateGraphAndHierarchy(transaction, existing.projectId, id, {
          scheduleVersion,
          rowVersion: expected,
          parentId,
          sortOrder: existing.sortOrder,
          kind: existing.kind,
          name: existing.name,
          isMilestone: existing.isMilestone,
          visibility: existing.visibility,
          planStart: existing.planStart,
          planDays: existing.planDays,
          startMode: existing.startMode,
          predecessorId: existing.predecessorId,
          lagDays: existing.lagDays,
          picUserIds: pics.map((pic) => pic.id),
          picExternal: existing.picExternal,
          planManDays: existing.planManDays,
        });
        if (parentId && (await hasPendingRequest(transaction, parentId))) throw new ApiError(409, "schedule_day_request_pending", "Answer the pending request for more days before moving this row.");
      }
      const read = new sql.Request(transaction);
      read.input("project", sql.BigInt, existing.projectId);
      read.input("parent", sql.BigInt, parentId);
      read.input("id", sql.BigInt, id);
      const siblings = (
        await read.query<{ id: number | string; sort_order: number }>(
          `SELECT id,sort_order FROM dbo.schedule_tasks WITH (UPDLOCK,HOLDLOCK) WHERE project_id=@project AND deleted_at IS NULL AND id<>@id AND ((@parent IS NULL AND parent_id IS NULL) OR parent_id=@parent) ORDER BY sort_order,id;`,
        )
      ).recordset.map((row) => ({ id: Number(row.id), sortOrder: Number(row.sort_order) }));
      const placed = placeInOrder(siblings, beforeId, id);
      for (const row of placed.renumber) {
        const renumber = new sql.Request(transaction);
        renumber.input("id", sql.BigInt, row.id);
        renumber.input("sort", sql.Int, row.sortOrder);
        await renumber.query(`UPDATE dbo.schedule_tasks SET sort_order=@sort WHERE id=@id AND deleted_at IS NULL;`);
      }
      const update = new sql.Request(transaction);
      update.input("id", sql.BigInt, id);
      update.input("parent", sql.BigInt, parentId);
      update.input("sort", sql.Int, placed.sortOrder);
      update.input("actor", sql.BigInt, actor.id);
      update.input("version", sql.VarBinary(8), expected);
      const row = (
        await update.query<{ row_version: Buffer }>(
          `DECLARE @changed TABLE(row_version binary(8)); UPDATE dbo.schedule_tasks SET parent_id=@parent,sort_order=@sort,updated_by=@actor,updated_at=SYSUTCDATETIME() OUTPUT inserted.row_version INTO @changed WHERE id=@id AND deleted_at IS NULL AND row_version=@version; SELECT row_version FROM @changed;`,
        )
      ).recordset[0];
      if (!row) throw concurrency();
      const before = { parentId: existing.parentId, sortOrder: existing.sortOrder },
        after = { parentId, sortOrder: placed.sortOrder, beforeId };
      await appendUpdate(transaction, existing.projectId, id, actor.id, "plan", JSON.stringify(before), JSON.stringify(after), "Moved in the plan");
      await insertAudit(transaction, actor.id, "Schedule Task", id, `T-${id}`, "Moved", before, { ...after, renumbered: placed.renumber.length });
      return { id, rowVersion: row.row_version.toString("base64"), scheduleVersion: (await currentScheduleVersion(transaction, project.id))!.toString("base64") };
    });
  });

  app.post("/api/v1/schedule/tasks/:id/updates", async (request) => {
    await users.demandPermission(request, "schedule.progress");
    const actor = await users.required(request);
    const id = positiveLong((request.params as { id?: string }).id, "Schedule task id");
    const input = progressInput(request.body);
    return database.transaction(async (transaction) => {
      const task = await readTask(transaction, id);
      await demandProjectScope(database, actor, task.projectId, transaction, true);
      const project = await readProject(transaction, task.projectId, true);
      if (project.status === "Closed") throw new ApiError(409, "project_closed", "A closed project's schedule cannot be changed.");
      // Only this row's version is checked: a save on a sibling task must not make this progress update conflict. input.scheduleVersion is accepted and ignored.
      if (!task.rowVersion.equals(input.rowVersion)) throw concurrency();
      await demandProgressWriter(transaction, task, project, actor);
      const changes: Array<[string, unknown, unknown]> = [
        ["percent_complete", task.percentComplete, input.percentComplete],
        ["actual_start", task.actualStart, input.actualStart],
        ["actual_finish", task.actualFinish, input.actualFinish],
        ["forecast_finish", task.forecastFinish, input.forecastFinish],
        ["status", task.status, input.status],
        ["blocked_reason", task.blockedReason, input.status === "Blocked" ? input.remark : null],
        ["remark", task.remark, input.remark],
      ].filter(([, before, after]) => (before ?? null) !== (after ?? null)) as Array<[string, unknown, unknown]>;
      if (!changes.length) throw new ApiError(409, "no_schedule_change", "The progress update does not change the task.");
      const update = new sql.Request(transaction);
      update.input("percent", sql.Decimal(5, 2), input.percentComplete);
      update.input("actual_start", sql.Date, input.actualStart);
      update.input("actual_finish", sql.Date, input.actualFinish);
      update.input("forecast_finish", sql.Date, input.forecastFinish);
      update.input("status", sql.NVarChar(30), input.status);
      update.input("blocked", sql.NVarChar(sql.MAX), input.status === "Blocked" ? input.remark : null);
      update.input("remark", sql.NVarChar(sql.MAX), input.remark);
      update.input("actor", sql.BigInt, actor.id);
      update.input("id", sql.BigInt, id);
      update.input("version", sql.VarBinary(8), input.rowVersion);
      const row = (
        await update.query<{ row_version: Buffer }>(
          `DECLARE @changed TABLE(row_version binary(8)); UPDATE dbo.schedule_tasks SET percent_done=@percent,actual_start=@actual_start,actual_end=@actual_finish,forecast_end=@forecast_finish,status=@status,blocked_reason=@blocked,note=@remark,updated_by=@actor,updated_at=SYSUTCDATETIME() OUTPUT inserted.row_version INTO @changed WHERE id=@id AND deleted_at IS NULL AND row_version=@version; SELECT row_version FROM @changed;`,
        )
      ).recordset[0];
      if (!row) throw concurrency();
      for (const [field, before, after] of changes)
        await appendUpdate(transaction, task.projectId, id, actor.id, field, before == null ? null : String(before), after == null ? null : String(after), input.remark);
      await insertAudit(
        transaction,
        actor.id,
        "Schedule Task",
        id,
        `T-${id}`,
        "Updated progress",
        {
          percentComplete: task.percentComplete,
          actualStart: task.actualStart,
          actualFinish: task.actualFinish,
          forecastFinish: task.forecastFinish,
          status: task.status,
          blockedReason: task.blockedReason,
          remark: task.remark,
        },
        input,
      );
      return { id, rowVersion: row.row_version.toString("base64"), scheduleVersion: (await currentScheduleVersion(transaction, task.projectId))!.toString("base64") };
    });
  });

  app.post("/api/v1/schedule/tasks/:id/day-requests", async (request, reply) => {
    await users.demandPermission(request, "schedule.read");
    await users.demandPermission(request, "schedule.progress");
    const actor = await users.required(request);
    const id = positiveLong((request.params as { id?: string }).id, "Schedule task id");
    const body = bodyObject(request.body);
    const requestDays = requiredInteger(body.requestDays, "Requested days", 1, 3650),
      comment = requiredText(body.comment, 20_000, "Request comment");
    const created = await database.transaction(async (transaction) => {
      const task = await readTask(transaction, id);
      await demandProjectScope(database, actor, task.projectId, transaction, true);
      const project = await readProject(transaction, task.projectId, true);
      if (project.status === "Closed") throw new ApiError(409, "project_closed", "A closed project's schedule cannot be changed.");
      await demandAssignedLeaf(transaction, task, actor.id);
      if (await hasPendingRequest(transaction, id)) throw new ApiError(409, "schedule_day_request_pending", "This task already has a pending request for more days.");
      const insert = new sql.Request(transaction);
      insert.input("project", sql.BigInt, task.projectId);
      insert.input("task", sql.BigInt, id);
      insert.input("actor", sql.BigInt, actor.id);
      insert.input("from", sql.NVarChar(sql.MAX), task.forecastFinish);
      insert.input("to", sql.NVarChar(sql.MAX), `+${requestDays} days`);
      insert.input("comment", sql.NVarChar(sql.MAX), comment);
      insert.input("days", sql.Int, requestDays);
      const row = (
        await insert.query<{ id: number | string; occurred_at: unknown }>(
          `INSERT INTO dbo.schedule_updates(project_id,task_id,actor_id,field,from_value,to_value,comment,request_days) OUTPUT inserted.id,inserted.occurred_at VALUES(@project,@task,@actor,N'request',@from,@to,@comment,@days);`,
        )
      ).recordset[0]!;
      const requestId = Number(row.id);
      await insertAudit(transaction, actor.id, "Schedule Day Request", requestId, `T-${id}/R-${requestId}`, "Requested more days", null, { taskId: id, requestDays, comment });
      return { id: requestId, taskId: id, requestDays, comment, occurredAt: row.occurred_at };
    });
    return reply.status(201).header("Location", `/api/v1/me/work/updates/${created.id}`).send(created);
  });

  app.post("/api/v1/schedule/day-requests/:id/answer", async (request) => {
    await users.demandPermission(request, "schedule.plan");
    const actor = await users.required(request);
    const id = positiveLong((request.params as { id?: string }).id, "Day request id");
    const body = bodyObject(request.body);
    const answer = requiredText(body.answer, 20, "Day request answer");
    if (!["Accepted", "Rejected"].includes(answer)) throw new ApiError(400, "validation_failed", "Day request answer is invalid.");
    const note = optionalBodyText(body.note, 20_000, "Answer note");
    const expected = parseRowVersion(body.rowVersion);
    const scheduleVersion = body.scheduleVersion == null ? null : requiredText(body.scheduleVersion, 64, "Schedule version");
    return database.transaction(async (transaction) => {
      const locate = new sql.Request(transaction);
      locate.input("id", sql.BigInt, id);
      const location = (
        await locate.query<{ project_id: number | string; task_id: number | string }>(
          `SELECT project_id,task_id FROM dbo.schedule_updates WITH (UPDLOCK,HOLDLOCK) WHERE id=@id AND task_id IS NOT NULL AND field=N'request' AND request_days>0;`,
        )
      ).recordset[0];
      if (!location) throw new ApiError(404, "schedule_day_request_not_found", "Schedule day request not found.");
      const projectId = Number(location.project_id),
        taskId = Number(location.task_id),
        task = await readTask(transaction, taskId);
      const project = await demandPlanOwner(transaction, projectId, actor, false);
      if (!canAnswerDayRequests(project, actor))
        throw new ApiError(403, "schedule_day_request_answer_forbidden", "Only the project manager, an Engineering Manager or an Admin can answer this request.");
      if (task.projectId !== projectId) throw new ApiError(409, "schedule_day_request_invalid", "The day request no longer matches its task.");
      if (task.kind === "phase" || (await hasChildren(transaction, taskId)))
        throw new ApiError(409, "schedule_day_request_not_leaf", "A day request can only be answered while its task remains a non-phase leaf row.");
      const read = new sql.Request(transaction);
      read.input("id", sql.BigInt, id);
      const row = (await read.query<{ request_days: number; answer: string | null }>(`SELECT request_days,answer FROM dbo.schedule_updates WITH (UPDLOCK,HOLDLOCK) WHERE id=@id;`)).recordset[0]!;
      if (row.answer) throw new ApiError(409, "schedule_day_request_answered", "This day request has already been answered.");
      await validateScheduleVersion(transaction, projectId, scheduleVersion);
      if (!task.rowVersion.equals(expected)) throw concurrency();
      if (answer === "Accepted" && task.planDays > 3650 - row.request_days) throw new ApiError(400, "validation_failed", "Accepting this request would make the task longer than 3650 calendar days.");
      const action = new sql.Request(transaction);
      action.input("request_id", sql.BigInt, id);
      action.input("task_id", sql.BigInt, taskId);
      action.input("project_id", sql.BigInt, projectId);
      action.input("answer_by", sql.BigInt, actor.id);
      action.input("answer", sql.NVarChar(20), answer);
      action.input("answer_note", sql.NVarChar(sql.MAX), note);
      action.input("expected_row_version", sql.VarBinary(8), expected);
      const changed = (
        await action.execute<{ task_id: number | string; row_version: Buffer }>("dbo.answer_schedule_day_request").catch((error: unknown) => {
          throw dayRequestAnswerError(error) ?? error;
        })
      ).recordset[0];
      if (!changed || Number(changed.task_id) !== taskId) throw concurrency();
      const planDays = answer === "Accepted" ? task.planDays + row.request_days : task.planDays;
      if (answer === "Accepted") await appendUpdate(transaction, projectId, taskId, actor.id, "plan_days", String(task.planDays), String(planDays), note);
      await appendUpdate(transaction, projectId, taskId, actor.id, "request_answer", null, answer, note);
      await insertAudit(
        transaction,
        actor.id,
        "Schedule Day Request",
        id,
        `T-${taskId}/R-${id}`,
        "Answered day request",
        { requestId: id, answer: null, planDays: task.planDays },
        { requestId: id, answer, answerNote: note, requestDays: row.request_days, planDays },
      );
      return {
        id,
        projectId,
        taskId,
        answer,
        answerNote: note,
        requestDays: row.request_days,
        planDays,
        rowVersion: changed.row_version.toString("base64"),
        scheduleVersion: (await currentScheduleVersion(transaction, project.id))!.toString("base64"),
      };
    });
  });

  app.post("/api/v1/schedule/tasks/:id/details", async (request, reply) => {
    await users.demandPermission(request, "schedule.read");
    await users.demandPermission(request, "schedule.progress");
    const actor = await users.required(request);
    const id = positiveLong((request.params as { id?: string }).id, "Schedule task id");
    const body = bodyObject(request.body);
    const name = requiredText(body.name, 500, "Task name"),
      planDays = requiredInteger(body.planDays, "Plan days", 1, 3650),
      expected = parseRowVersion(body.rowVersion),
      scheduleVersion = body.scheduleVersion == null ? null : requiredText(body.scheduleVersion, 64, "Schedule version");
    const created = await database.transaction(async (transaction) => {
      const parent = await readTask(transaction, id);
      await demandProjectScope(database, actor, parent.projectId, transaction, true);
      const project = await readProject(transaction, parent.projectId, true);
      if (project.status === "Closed") throw new ApiError(409, "project_closed", "A closed project's schedule cannot be changed.");
      await validateScheduleVersion(transaction, parent.projectId, scheduleVersion);
      if (!parent.rowVersion.equals(expected)) throw concurrency();
      const children = new sql.Request(transaction);
      children.input("parent", sql.BigInt, id);
      if (
        (await children.query<{ found: number }>(`SELECT COUNT(*) found FROM dbo.schedule_tasks WITH (UPDLOCK,HOLDLOCK) WHERE parent_id=@parent AND kind=N'task' AND deleted_at IS NULL;`)).recordset[0]
          ?.found
      )
        throw new ApiError(422, "schedule_parent_kind_invalid", "Member details require a task without sub tasks.");
      await demandAssignedLeaf(transaction, parent, actor.id);
      /* A personal detail turns its parent into a roll-up, which would take a shared task out of the other PICs' My Work. */ if (
        ((await readPics(transaction, parent.projectId)).get(id) ?? []).length > 1
      )
        throw new ApiError(409, "schedule_detail_shared_task", "A task shared by several PICs cannot take a personal task; ask the project manager to split it.");
      if (parent.kind !== "task") throw new ApiError(422, "schedule_detail_parent_required", "A member detail can only be added beneath an assigned task row.");
      if (parent.startMode !== "manual" || parent.predecessorId) throw new ApiError(409, "schedule_detail_parent_linked", "A member cannot add a detail beneath a linked or predecessor-driven task.");
      if (parent.status !== "Not Started" || parent.percentComplete !== 0 || parent.actualStart || parent.actualFinish || parent.forecastFinish || parent.actualManDays !== 0)
        throw new ApiError(409, "schedule_detail_parent_started", "A member detail can only be added before the parent task has started.");
      if (await hasPendingRequest(transaction, id)) throw new ApiError(409, "schedule_day_request_pending", "Answer the pending request before changing child rows.");
      const tasks = await readTasks(transaction, parent.projectId),
        holidays = await readHolidays(transaction),
        resolved = resolveTasks(tasks, holidays).byId.get(id)!;
      if (!resolved.planStart || !resolved.planFinish) throw new ApiError(422, "schedule_detail_start_unresolved", "The parent task must have resolved dates before a detail can be added.");
      if (planDays !== calendarDays(resolved.planStart, resolved.planFinish))
        throw new ApiError(422, "schedule_detail_outside_parent_plan", "The first member detail must cover the current parent plan period exactly.");
      const order = new sql.Request(transaction);
      order.input("parent", sql.BigInt, id);
      const sort = Number(
        (await order.query<{ value: number }>(`SELECT COALESCE(MAX(sort_order),0)+1 value FROM dbo.schedule_tasks WITH (UPDLOCK,HOLDLOCK) WHERE parent_id=@parent AND deleted_at IS NULL;`))
          .recordset[0]!.value,
      );
      const insert = new sql.Request(transaction);
      insert.input("project", sql.BigInt, parent.projectId);
      insert.input("parent", sql.BigInt, id);
      insert.input("sort", sql.Int, sort);
      insert.input("name", sql.NVarChar(500), name);
      insert.input("actor", sql.BigInt, actor.id);
      insert.input("start", sql.Date, resolved.planStart);
      insert.input("days", sql.Int, planDays);
      const row = (
        await insert.query<{ id: number | string; row_version: Buffer }>(
          `DECLARE @changed TABLE(id bigint,row_version binary(8)); INSERT INTO dbo.schedule_tasks(project_id,parent_id,sort_order,kind,name,is_milestone,origin,created_by,visibility,plan_start,plan_days,start_mode,predecessor_id,lag_days,pic_external,plan_man_days,updated_by) OUTPUT inserted.id,inserted.row_version INTO @changed VALUES(@project,@parent,@sort,N'detail',@name,0,N'Member',@actor,N'Internal',@start,@days,N'manual',NULL,0,N'',0,@actor); SELECT id,row_version FROM @changed;`,
        )
      ).recordset[0]!;
      const detailId = Number(row.id);
      await replacePics(transaction, detailId, [actor.id]);
      await appendUpdate(transaction, parent.projectId, detailId, actor.id, "created", null, name, "Member detail created");
      await insertAudit(transaction, actor.id, "Schedule Task", detailId, `T-${detailId}`, "Created member detail", null, {
        id: detailId,
        projectId: parent.projectId,
        parentId: id,
        kind: "detail",
        name,
        origin: "Member",
        visibility: "Internal",
        planStart: resolved.planStart,
        planDays,
        picUserIds: [actor.id],
      });
      return { id: detailId, parentId: id, rowVersion: row.row_version.toString("base64"), scheduleVersion: (await currentScheduleVersion(transaction, parent.projectId))!.toString("base64") };
    });
    return reply.status(201).header("Location", `/api/v1/schedule/tasks/${created.id}`).send(created);
  });

  app.delete("/api/v1/schedule/tasks/:id/details", async (request) => {
    await users.demandPermission(request, "schedule.read");
    await users.demandPermission(request, "schedule.progress");
    const actor = await users.required(request);
    const id = positiveLong((request.params as { id?: string }).id, "Schedule task id");
    const body = bodyObject(request.body);
    const expected = parseRowVersion(body.rowVersion),
      scheduleVersion = body.scheduleVersion == null ? null : requiredText(body.scheduleVersion, 64, "Schedule version");
    return database.transaction(async (transaction) => {
      const task = await readTask(transaction, id);
      await demandProjectScope(database, actor, task.projectId, transaction, true);
      const project = await readProject(transaction, task.projectId, true);
      if (project.status === "Closed") throw new ApiError(409, "project_closed", "A closed project's schedule cannot be changed.");
      await validateScheduleVersion(transaction, task.projectId, scheduleVersion);
      if (!task.rowVersion.equals(expected)) throw concurrency();
      const ownership = new sql.Request(transaction);
      ownership.input("task", sql.BigInt, id);
      ownership.input("actor", sql.BigInt, actor.id);
      const assigned = Boolean(
        (await ownership.query<{ allowed: boolean }>(`SELECT CAST(CASE WHEN EXISTS(SELECT 1 FROM dbo.schedule_task_pics WHERE task_id=@task AND user_id=@actor) THEN 1 ELSE 0 END AS bit) allowed;`))
          .recordset[0]?.allowed,
      );
      if (task.kind !== "detail" || task.origin !== "Member" || task.createdBy !== actor.id || !assigned)
        throw new ApiError(403, "schedule_member_detail_owner_required", "Only the member who created and owns this detail can delete it.");
      if (task.status !== "Not Started" || task.percentComplete !== 0 || task.actualStart || task.actualFinish)
        throw new ApiError(409, "schedule_detail_started", "A member detail cannot be deleted after work has started.");
      if (await hasChildren(transaction, id)) throw new ApiError(409, "schedule_detail_has_children", "A member detail with active children cannot be deleted.");
      if (await hasPendingRequest(transaction, id)) throw new ApiError(409, "schedule_day_request_pending", "Answer the pending request before deleting this task.");
      const reference = new sql.Request(transaction);
      reference.input("task", sql.BigInt, id);
      if (
        (
          await reference.query<{ value: boolean }>(
            `SELECT CAST(CASE WHEN EXISTS(SELECT 1 FROM dbo.schedule_tasks WITH (UPDLOCK,HOLDLOCK) WHERE predecessor_id=@task AND deleted_at IS NULL) OR EXISTS(SELECT 1 FROM dbo.schedule_tasks d WITH (UPDLOCK,HOLDLOCK) CROSS APPLY OPENJSON(d.extra_links) WITH (predecessor_id bigint '$.predecessorId') l WHERE d.start_mode=N'linked' AND l.predecessor_id=@task AND d.deleted_at IS NULL) THEN 1 ELSE 0 END AS bit) value;`,
          )
        ).recordset[0]?.value
      )
        throw new ApiError(409, "schedule_detail_referenced", "A member detail used as a predecessor cannot be deleted.");
      await appendUpdate(transaction, task.projectId, id, actor.id, "deleted", task.name, null, "Member detail deleted");
      await insertAudit(transaction, actor.id, "Schedule Task", id, `T-${id}`, "Deleted member detail", task, null);
      const remove = new sql.Request(transaction);
      remove.input("actor", sql.BigInt, actor.id);
      remove.input("task", sql.BigInt, id);
      remove.input("version", sql.VarBinary(8), expected);
      const result = await remove.query(
        `UPDATE dbo.schedule_tasks SET deleted_at=SYSUTCDATETIME(),updated_by=@actor,updated_at=SYSUTCDATETIME() WHERE id=@task AND deleted_at IS NULL AND row_version=@version;`,
      );
      if (result.rowsAffected[0] !== 1) throw concurrency();
      return { id, deleted: true, scheduleVersion: (await currentScheduleVersion(transaction, task.projectId))?.toString("base64") ?? null };
    });
  });

  app.post("/api/v1/projects/:projectId/schedule/baseline", async (request, reply) => {
    await users.demandPermission(request, "schedule.plan");
    const actor = await users.required(request);
    const projectId = positiveLong((request.params as { projectId?: string }).projectId, "Project id");
    const body = bodyObject(request.body);
    const label = requiredText(body.label, 200, "Baseline label"),
      reason = requiredText(body.reason, 20_000, "Baseline reason"),
      scheduleVersion = body.scheduleVersion == null ? null : requiredText(body.scheduleVersion, 64, "Schedule version");
    const created = await database.transaction(async (transaction) => {
      const project = await demandPlanOwner(transaction, projectId, actor, false);
      await validateScheduleVersion(transaction, projectId, scheduleVersion);
      const tasks = await readTasks(transaction, projectId);
      if (!tasks.length) throw new ApiError(409, "schedule_empty", "A baseline cannot be taken before the schedule has tasks.");
      const calculation = resolveTasks(tasks, await readHolidays(transaction));
      const next = new sql.Request(transaction);
      next.input("project", sql.BigInt, projectId);
      const revision = Number(
        (await next.query<{ value: number }>(`SELECT COALESCE(MAX(revision),0)+1 value FROM dbo.schedule_baselines WITH (UPDLOCK,HOLDLOCK) WHERE project_id=@project;`)).recordset[0]!.value,
      );
      const snapshot = JSON.stringify(
        [...calculation.byId.values()]
          .sort((a, b) => a.wbs.localeCompare(b.wbs))
          .map((item) => ({
            id: item.source.id,
            parentId: item.source.parentId,
            wbs: item.wbs,
            planStart: item.planStart,
            planFinish: item.planFinish,
            planDays: item.source.planDays,
            workDays: item.workDays,
            percentComplete: item.percentComplete,
            status: item.status,
          })),
      );
      for (const task of tasks) {
        const item = calculation.byId.get(task.id)!;
        const freeze = new sql.Request(transaction);
        freeze.input("start", sql.Date, item.planStart);
        freeze.input("finish", sql.Date, item.planFinish);
        freeze.input("days", sql.Int, calendarDays(item.planStart, item.planFinish));
        freeze.input("revision", sql.Int, revision);
        freeze.input("actor", sql.BigInt, actor.id);
        freeze.input("id", sql.BigInt, task.id);
        freeze.input("version", sql.VarBinary(8), task.rowVersion);
        const result = await freeze.query(
          `UPDATE dbo.schedule_tasks SET baseline_start=@start,baseline_end=@finish,baseline_days=@days,baseline_rev=@revision,updated_by=@actor,updated_at=SYSUTCDATETIME() WHERE id=@id AND deleted_at IS NULL AND row_version=@version;`,
        );
        if (result.rowsAffected[0] !== 1) throw concurrency();
      }
      const finishes = calculation.roots
        .map((item) => item.planFinish)
        .filter((value): value is string => Boolean(value))
        .sort();
      const promisedFinish = finishes.at(-1) ?? null;
      const insert = new sql.Request(transaction);
      insert.input("project", sql.BigInt, projectId);
      insert.input("revision", sql.Int, revision);
      insert.input("label", sql.NVarChar(200), label);
      insert.input("actor", sql.BigInt, actor.id);
      insert.input("reason", sql.NVarChar(sql.MAX), reason);
      insert.input("count", sql.Int, tasks.length);
      insert.input("finish", sql.Date, promisedFinish);
      insert.input("snapshot", sql.NVarChar(sql.MAX), snapshot);
      const baselineId = Number(
        (
          await insert.query<{ id: number | string }>(
            `INSERT INTO dbo.schedule_baselines(project_id,revision,label,taken_by,reason,task_count,promised_finish,snapshot_json) OUTPUT inserted.id VALUES(@project,@revision,@label,@actor,@reason,@count,@finish,@snapshot);`,
          )
        ).recordset[0]!.id,
      );
      await appendUpdate(transaction, projectId, null, actor.id, "baseline", revision > 1 ? String(revision - 1) : null, String(revision), reason);
      await insertAudit(transaction, actor.id, "Schedule Baseline", baselineId, `${project.projectNo}/BL-${String(revision).padStart(3, "0")}`, "Created baseline", null, {
        revision,
        label,
        reason,
        taskCount: tasks.length,
        promisedFinish,
      });
      return { id: baselineId, revision, taskCount: tasks.length, promisedFinish, scheduleVersion: (await currentScheduleVersion(transaction, projectId))!.toString("base64") };
    });
    return reply.status(201).header("Location", `/api/v1/projects/${projectId}/schedule/baseline/${created.id}`).send(created);
  });

  // Day requests waiting for this user's answer, across the projects they may answer for: the projects
  // they manage, plus every project in their scope for an Engineering Manager or Admin (any role held).
  // The typed man-hour budget, for a project with no Estimate or an Estimate with no internal labor. Empty clears it.
  app.put("/api/v1/projects/:projectId/manhour-budget", async (request) => {
    await users.demandPermission(request, "schedule.read");
    const actor = await users.required(request);
    const projectId = positiveLong((request.params as { projectId?: string }).projectId, "Project id");
    if (!isProjectManagerRole(actor)) throw new ApiError(403, "manhour_budget_forbidden", "Only an Admin, an Engineering Manager or a Project Manager sets a project's man-hour budget.");
    const manDays = parseBudgetManDays(bodyObject(request.body).manDays);
    if (manDays === undefined) throw new ApiError(400, "validation_failed", `Man-days must be more than 0 and at most ${MAXIMUM_BUDGET_MAN_DAYS}. Leave it empty to clear the budget.`);
    return database.transaction(async (transaction) => {
      await demandProjectScope(database, actor, projectId, transaction);
      const project = await readProject(transaction, projectId, true);
      if (project.status === "Closed") throw new ApiError(409, "project_closed", "A closed project keeps its man-hour budget.");
      const stored = await readStoredBudget(transaction, projectId);
      if (stored.estimateManDays > 0) throw new ApiError(409, "manhour_budget_from_estimate", "This project's man-hour budget comes from its Estimate cost. Change the labor there.");
      const update = new sql.Request(transaction);
      update.input("project", sql.BigInt, projectId).input("days", sql.Decimal(9, 2), manDays).input("actor", sql.BigInt, actor.id);
      await update.query(`UPDATE dbo.projects SET manhour_budget_days=@days,updated_by=@actor,updated_at=SYSUTCDATETIME() WHERE id=@project AND deleted_at IS NULL;`);
      await insertAudit(transaction, actor.id, "Project", projectId, project.projectNo, "Set man-hour budget", { manDays: stored.manualManDays }, { manDays });
      return { manDays };
    });
  });

  app.get("/api/v1/schedule/day-requests/pending", async (request) => {
    await users.demandPermission(request, "schedule.read");
    await users.demandPermission(request, "schedule.plan");
    const actor = await users.required(request);
    return database.transaction(async (transaction) => {
      const read = new sql.Request(transaction);
      read
        .input("actor", sql.BigInt, actor.id)
        .input("answer_all", sql.Bit, hasRole(actor, "Engineering Manager", "Admin"))
        .input("elevated", sql.Bit, isProjectElevated(actor))
        .input("leader_team", sql.NVarChar(40), leaderTeamOf(actor));
      const rows = (
        await read.query<
          Record<string, unknown>
        >(`SELECT TOP(200) s.id,s.project_id,p.project_no,p.name project_name,s.task_id,t.name task_name,s.request_days,s.comment,s.occurred_at,u.name actor_name
        FROM dbo.schedule_updates s
        INNER JOIN dbo.projects p ON p.id=s.project_id AND p.deleted_at IS NULL AND p.status<>N'Closed'
        INNER JOIN dbo.schedule_tasks t ON t.id=s.task_id AND t.deleted_at IS NULL
        INNER JOIN dbo.users u ON u.id=s.actor_id
        WHERE s.field=N'request' AND s.request_days>0 AND s.answer IS NULL
          AND (p.manager_id=@actor OR ${leaderTeamProjectSql("p")} OR (@answer_all=1 AND (@elevated=1 OR p.lead_engineer_id=@actor
            OR EXISTS(SELECT 1 FROM dbo.project_members m WHERE m.project_id=p.id AND m.user_id=@actor))))
        ORDER BY s.occurred_at DESC,s.id DESC;`)
      ).recordset;
      const holidays = rows.length ? await readHolidays(transaction) : new Set<string>(),
        wbs = new Map<number, string>();
      for (const projectId of [...new Set(rows.map((row) => Number(row.project_id)))]) {
        for (const item of resolveTasks(await readTasks(transaction, projectId), holidays).byId.values()) wbs.set(item.source.id, item.wbs);
      }
      return rows.map((row) => ({
        id: Number(row.id),
        projectId: Number(row.project_id),
        projectNo: row.project_no,
        projectName: row.project_name,
        taskId: Number(row.task_id),
        wbs: wbs.get(Number(row.task_id)) ?? null,
        taskName: row.task_name,
        requestDays: Number(row.request_days),
        comment: row.comment,
        requestedBy: row.actor_name,
        occurredAt: row.occurred_at,
      }));
    }, sql.ISOLATION_LEVEL.READ_COMMITTED);
  });

  // Finds schedule rows by task name or by person (PIC or external PIC) across the projects in the
  // user's scope, for the portfolio timeline's task search. Only ids come back; the timeline loads the
  // matching projects' plans itself.
  app.get("/api/v1/schedule/search", async (request) => {
    await users.demandPermission(request, "project.read");
    await users.demandPermission(request, "schedule.read");
    const actor = await users.required(request);
    const query = request.query as Record<string, unknown>;
    const text = typeof query.q === "string" ? query.q.trim() : "";
    if (text.length < 2 || text.length > 100) throw new ApiError(400, "validation_failed", "Search for 2 to 100 characters.");
    const includeClosed = query.includeClosed === "1" || query.includeClosed === "true";
    const pattern = `%${text.replace(/[\\%_[]/g, (character) => `\\${character}`)}%`;
    const result = await database.query<{ project_id: number | string; id: number | string }>(
      `SELECT TOP(301) t.project_id,t.id
      FROM dbo.schedule_tasks t INNER JOIN dbo.projects p ON p.id=t.project_id AND p.deleted_at IS NULL
      WHERE t.deleted_at IS NULL AND (@include_closed=1 OR p.status<>N'Closed')
        AND (@elevated=1 OR p.manager_id=@actor OR p.lead_engineer_id=@actor OR EXISTS(SELECT 1 FROM dbo.project_members m WHERE m.project_id=p.id AND m.user_id=@actor))
        AND (t.name LIKE @pattern ESCAPE N'\\' OR t.pic_external LIKE @pattern ESCAPE N'\\'
          OR EXISTS(SELECT 1 FROM dbo.schedule_task_pics pic INNER JOIN dbo.users u ON u.id=pic.user_id WHERE pic.task_id=t.id AND u.name LIKE @pattern ESCAPE N'\\'))
      ORDER BY p.project_no,t.id;`,
      (bind) => {
        bind.input("actor", sql.BigInt, actor.id);
        bind.input("elevated", sql.Bit, isProjectElevated(actor));
        bind.input("include_closed", sql.Bit, includeClosed);
        bind.input("pattern", sql.NVarChar(210), pattern);
      },
    );
    const rows = result.recordset.slice(0, 300);
    return { matches: rows.map((row) => ({ projectId: Number(row.project_id), taskId: Number(row.id) })), truncated: result.recordset.length > 300 };
  });

  app.get("/api/v1/me/work", async (request) => {
    await users.demandPermission(request, "schedule.read");
    await users.demandPermission(request, "schedule.progress");
    const actor = await users.required(request);
    return database.transaction(async (transaction) => {
      const projectsRequest = new sql.Request(transaction);
      projectsRequest.input("actor", sql.BigInt, actor.id);
      projectsRequest.input("elevated", sql.Bit, isMyWorkElevated(actor));
      const projects = (
        await projectsRequest.query<Record<string, unknown>>(
          `SELECT DISTINCT p.id,p.project_no,p.name,p.manager_id,manager.name manager_name,p.status,CAST(CASE WHEN p.status<>N'Closed' AND (@elevated=1 OR p.manager_id=@actor OR p.lead_engineer_id=@actor OR EXISTS(SELECT 1 FROM dbo.project_members m WHERE m.project_id=p.id AND m.user_id=@actor)) THEN 1 ELSE 0 END AS bit) can_update,CAST(CASE WHEN (p.manager_id=@actor OR p.lead_engineer_id=@actor OR EXISTS(SELECT 1 FROM dbo.project_members m WHERE m.project_id=p.id AND m.user_id=@actor)) THEN 1 ELSE 0 END AS bit) is_member FROM dbo.projects p INNER JOIN dbo.users manager ON manager.id=p.manager_id WHERE p.deleted_at IS NULL AND (@elevated=1 OR (p.manager_id=@actor OR p.lead_engineer_id=@actor OR EXISTS(SELECT 1 FROM dbo.project_members m WHERE m.project_id=p.id AND m.user_id=@actor))) AND (EXISTS(SELECT 1 FROM dbo.schedule_tasks t INNER JOIN dbo.schedule_task_pics pic ON pic.task_id=t.id WHERE t.project_id=p.id AND t.deleted_at IS NULL AND pic.user_id=@actor) OR (p.status<>N'Closed' AND (p.manager_id=@actor OR p.lead_engineer_id=@actor OR EXISTS(SELECT 1 FROM dbo.project_members m WHERE m.project_id=p.id AND m.user_id=@actor))));`,
        )
      ).recordset;
      const holidays = await readHolidays(transaction);
      const work: Array<Record<string, unknown>> = [];
      for (const p of projects) {
        const projectId = Number(p.id),
          read = await readProjectWork(transaction, projectId, actor.id),
          tasks = read.tasks,
          pics = read.pics,
          calculation = resolveTasks(tasks, holidays),
          byId = new Map(tasks.map((task) => [task.id, task]));
        const pendingRows = read.pendingRows;
        const pendingAll = new Set(pendingRows.map((row) => Number(row.task_id))),
          pendingMine = new Map<number, Record<string, unknown>>();
        for (const row of pendingRows)
          if (Number(row.actor_id) === actor.id && !pendingMine.has(Number(row.task_id)))
            pendingMine.set(Number(row.task_id), { id: Number(row.id), requestDays: Number(row.request_days), comment: row.comment, occurredAt: row.occurred_at });
        const pendingAcknowledgmentTaskIds = new Set(read.acknowledgmentRows.map((row) => Number(row.schedule_task_id)));
        /* Quiet days count from the last progress report, not from updated_at, which plan edits and baselines also touch. */ const lastProgress = new Map(
          read.progressRows.map((row) => [Number(row.task_id), row.last_at] as const),
        );
        const dependent = new Set(tasks.filter((task) => task.predecessorId).map((task) => task.predecessorId!));
        const managed = read.managed;
        const version = read.version?.toString("base64") ?? null;
        // Besides the rows the reader is PIC of: open rows no active team member is PIC of, which any project member may update (owner decision 2026-10-26).
        const isUnassigned = (task: TaskRow) => Boolean(p.is_member) && p.status !== "Closed" && hasNoActivePic(pics.get(task.id)) && !managed.has(task.id) && task.status !== "Done";
        for (const task of tasks.filter(
          (item) =>
            item.kind !== "phase" &&
            !calculation.byId.get(item.id)!.children.length &&
            !pendingAcknowledgmentTaskIds.has(item.id) &&
            ((pics.get(item.id) ?? []).some((pic) => pic.id === actor.id) || isUnassigned(item)),
        )) {
          const item = calculation.byId.get(task.id)!;
          let current: TaskRow | undefined = task,
            phase: { wbs: string; name: string } | null = null;
          while (current?.parentId) {
            const parent = byId.get(current.parentId);
            if (!parent) break;
            if (parent.kind === "phase") phase = { wbs: calculation.byId.get(parent.id)!.wbs, name: parent.name };
            current = parent;
          }
          const isOwnDetail = task.kind === "detail" && task.origin === "Member" && task.createdBy === actor.id,
            canUpdate = Boolean(p.can_update),
            hasPending = pendingAll.has(task.id),
            managedByResourcePlan = managed.has(task.id),
            unassigned = isUnassigned(task);
          const canRequestDays = canUpdate && !unassigned && !managedByResourcePlan && !hasPending;
          const canAddDetail =
            canUpdate &&
            !unassigned &&
            !managedByResourcePlan &&
            (pics.get(task.id) ?? []).length === 1 &&
            task.kind === "task" &&
            task.startMode === "manual" &&
            !task.predecessorId &&
            task.status === "Not Started" &&
            task.percentComplete === 0 &&
            !task.actualStart &&
            !task.actualFinish &&
            !task.forecastFinish &&
            task.actualManDays === 0 &&
            Boolean(item.planStart && item.planFinish) &&
            !hasPending;
          const canDeleteDetail =
            canUpdate && !unassigned && isOwnDetail && task.status === "Not Started" && task.percentComplete === 0 && !task.actualStart && !task.actualFinish && !hasPending && !dependent.has(task.id);
          work.push({
            projectId,
            projectNo: p.project_no,
            projectName: p.name,
            managerId: Number(p.manager_id),
            managerName: p.manager_name,
            projectStatus: p.status,
            scheduleVersion: version,
            canUpdate,
            isOwnDetail,
            canAddDetail,
            canDeleteDetail,
            canRequestDays,
            managedByResourcePlan,
            unassigned,
            taskId: task.id,
            parentId: task.parentId,
            wbs: item.wbs,
            name: task.name,
            kind: task.kind,
            origin: task.origin,
            isMilestone: task.isMilestone,
            phaseWbs: phase?.wbs ?? null,
            phaseName: phase?.name ?? null,
            planStart: item.planStart,
            planFinish: item.planFinish,
            workDays: item.workDays,
            planManDays: task.planManDays,
            actualManDays: task.actualManDays,
            percentComplete: item.percentComplete,
            status: item.status,
            actualStart: item.actualStart,
            actualFinish: item.actualFinish,
            forecastFinish: item.forecastFinish,
            remark: task.remark,
            pendingRequest: pendingMine.get(task.id) ?? null,
            rowVersion: task.rowVersion.toString("base64"),
            updatedAt: task.updatedAt,
            lastProgressAt: lastProgress.get(task.id) ?? null,
          });
        }
      }
      return work.sort(
        (a, b) =>
          Number(a.status === "Done") - Number(b.status === "Done") ||
          String(a.planFinish ?? "9999").localeCompare(String(b.planFinish ?? "9999")) ||
          String(a.projectNo).localeCompare(String(b.projectNo)) ||
          String(a.wbs).localeCompare(String(b.wbs)),
      );
    }, sql.ISOLATION_LEVEL.READ_COMMITTED);
  });

  app.get("/api/v1/me/work/updates", async (request) => {
    await users.demandPermission(request, "schedule.read");
    await users.demandPermission(request, "schedule.progress");
    const actor = await users.required(request);
    return database.transaction(async (transaction) => {
      const read = new sql.Request(transaction);
      read.input("actor", sql.BigInt, actor.id);
      read.input("elevated", sql.Bit, isMyWorkElevated(actor));
      const rows = (
        await read.query<Record<string, unknown>>(
          `SELECT TOP(100) s.id,s.project_id,p.project_no,p.name project_name,s.task_id,t.name task_name,s.field,s.from_value,s.to_value,s.comment,s.request_days,s.answer,s.answer_note,s.occurred_at FROM dbo.schedule_updates s INNER JOIN dbo.projects p ON p.id=s.project_id LEFT JOIN dbo.schedule_tasks t ON t.id=s.task_id WHERE s.actor_id=@actor AND p.deleted_at IS NULL AND (@elevated=1 OR p.manager_id=@actor OR p.lead_engineer_id=@actor OR EXISTS(SELECT 1 FROM dbo.project_members m WHERE m.project_id=p.id AND m.user_id=@actor)) ORDER BY s.occurred_at DESC,s.id DESC;`,
        )
      ).recordset;
      const wbs = new Map<number, string>();
      for (const projectId of [...new Set(rows.map((row) => Number(row.project_id)))]) {
        const tasks = await readTasks(transaction, projectId);
        if (tasks.length) for (const item of resolveTasks(tasks, await readHolidays(transaction)).byId.values()) wbs.set(item.source.id, item.wbs);
      }
      return rows.map((row) => ({
        id: Number(row.id),
        projectId: Number(row.project_id),
        projectNo: row.project_no,
        projectName: row.project_name,
        taskId: row.task_id === null ? null : Number(row.task_id),
        wbs: row.task_id === null ? null : (wbs.get(Number(row.task_id)) ?? null),
        taskName: row.task_name,
        field: row.field,
        fromValue: row.from_value,
        toValue: row.to_value,
        comment: row.comment,
        requestDays: Number(row.request_days),
        answer: row.answer,
        answerNote: row.answer_note,
        occurredAt: row.occurred_at,
      }));
    }, sql.ISOLATION_LEVEL.READ_COMMITTED);
  });
}
