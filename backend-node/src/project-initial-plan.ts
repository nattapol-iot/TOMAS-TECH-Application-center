import sql from "mssql";
import type { Transaction as TransactionType } from "mssql";
import { ApiError } from "./errors.js";
import { parseDateOnly, requiredInteger, requiredText } from "./http.js";
import { appendUpdate, calendarDays, replacePics } from "./schedule-service.js";

/*
 * The plan a project is created with: the customer-facing milestones (Master Plan) and who
 * does what, when (Team plan). Both are ordinary schedule rows, so the Project Schedule,
 * the timeline and My Work read them the same way as rows added later. Each set sits
 * under its own phase because only a phase may hold task rows and a phase takes its dates
 * from them.
 */

export const MASTER_PLAN_PHASE = "Master Plan";
export const TEAM_PLAN_PHASE = "Team plan";
export const PROJECT_NUMBER_PATTERN = /^[A-Z0-9][A-Z0-9._/-]{1,29}$/;
const MAX_ROWS = 50;
const MAX_PLAN_DAYS = 3650;

// id names an existing schedule row when the plan is edited; a row without one is new.
export type MilestoneRow = { id?: number; name: string; start: string; finish: string };
export type TeamRow = { id?: number; userId: number; task: string; start: string; finish: string; planManDays: number };
export type InitialPlan = { milestones: MilestoneRow[]; team: TeamRow[] };

/** The ERP project number, as typed from the ERP, in one canonical spelling. */
export function parseProjectNumber(value: unknown): string {
  const number = requiredText(value, 30, "Project number").toUpperCase();
  if (!PROJECT_NUMBER_PATTERN.test(number)) {
    throw new ApiError(400, "validation_failed", "Project number must be the ERP number, such as PJ260017: letters, digits and - _ . / only.");
  }
  return number;
}

function rows(value: unknown, label: string): Record<string, unknown>[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new ApiError(400, "validation_failed", `${label} must be a list.`);
  if (value.length > MAX_ROWS) throw new ApiError(400, "validation_failed", `${label} cannot have more than ${MAX_ROWS} rows.`);
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

function manDays(value: unknown, label: string): number {
  if (value === undefined || value === null || value === "") return 0;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1_000_000
    || (!value.toString().includes("e") && (value.toString().split(".")[1]?.length ?? 0) > 2)) {
    throw new ApiError(400, "validation_failed", `${label} must be a number of man-days with at most 2 decimal places.`);
  }
  return value;
}

const rowId = (row: Record<string, unknown>, label: string) => row.id === undefined || row.id === null ? {} : { id: requiredInteger(row.id, `${label} id`, 1) };

export function parseInitialPlan(body: Record<string, unknown>): InitialPlan {
  const milestones = rows(body.masterPlan, "Master plan").map((row, index) => {
    const label = `Master plan row ${index + 1}`;
    return { ...rowId(row, label), name: requiredText(row.name, 500, `${label} name`), ...period(row, label) };
  });
  const team = rows(body.team, "Team plan").map((row, index) => {
    const label = `Team plan row ${index + 1}`;
    return {
      ...rowId(row, label),
      userId: requiredInteger(row.userId, `${label} member`, 1),
      task: requiredText(row.task, 500, `${label} task`),
      ...period(row, label),
      planManDays: manDays(row.planManDays, `${label} plan`),
    };
  });
  return { milestones, team };
}

/** First start and last finish over every row, or null when the plan is empty. */
export function planSpan(plan: InitialPlan): { start: string; finish: string } | null {
  const all = [...plan.milestones, ...plan.team];
  if (!all.length) return null;
  return {
    start: all.map((row) => row.start).sort()[0]!,
    finish: all.map((row) => row.finish).sort().at(-1)!,
  };
}

async function insertRow(transaction: TransactionType, projectId: number, actorId: number, row: {
  parentId: number | null; sortOrder: number; kind: "phase" | "task"; name: string; visibility: "Customer" | "Internal";
  planStart: string | null; planDays: number; planManDays: number;
}): Promise<number> {
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
  await appendUpdate(transaction, projectId, id, actorId, "created", null, row.name, "Created with the project");
  return id;
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
 * Team members join the project first -- a schedule PIC must be a member -- then both
 * phases and their rows are written. Runs inside the project's own creation transaction,
 * so a project never exists with half of its plan.
 */
export async function insertInitialPlan(transaction: TransactionType, projectId: number, plan: InitialPlan, actorId: number): Promise<void> {
  await ensureMembers(transaction, projectId, plan.team.map((row) => row.userId), actorId);
  let phaseOrder = 0;
  if (plan.milestones.length) {
    const phase = await insertRow(transaction, projectId, actorId, { parentId: null, sortOrder: ++phaseOrder, kind: "phase", name: MASTER_PLAN_PHASE,
      visibility: "Customer", planStart: null, planDays: 1, planManDays: 0 });
    for (const [index, row] of plan.milestones.entries()) {
      await insertRow(transaction, projectId, actorId, { parentId: phase, sortOrder: index + 1, kind: "task", name: row.name,
        visibility: "Customer", planStart: row.start, planDays: calendarDays(row.start, row.finish), planManDays: 0 });
    }
  }
  if (plan.team.length) {
    const phase = await insertRow(transaction, projectId, actorId, { parentId: null, sortOrder: ++phaseOrder, kind: "phase", name: TEAM_PLAN_PHASE,
      visibility: "Internal", planStart: null, planDays: 1, planManDays: 0 });
    for (const [index, row] of plan.team.entries()) {
      const id = await insertRow(transaction, projectId, actorId, { parentId: phase, sortOrder: index + 1, kind: "task", name: row.task,
        visibility: "Internal", planStart: row.start, planDays: calendarDays(row.start, row.finish), planManDays: row.planManDays });
      await replacePics(transaction, id, [row.userId]);
    }
  }
}

type ScheduleRow = {
  id: number; parentId: number | null; kind: string; name: string; sortOrder: number; startMode: string;
  planStart: string | null; planDays: number; planManDays: number; started: boolean; children: number;
  pending: boolean; referenced: boolean; pic: number | null; picCount: number;
};

async function readScheduleRows(transaction: TransactionType, projectId: number): Promise<ScheduleRow[]> {
  const request = new sql.Request(transaction); request.input("project", sql.BigInt, projectId);
  const rows = (await request.query<Record<string, unknown>>(`
    SELECT t.id,t.parent_id,t.kind,t.name,t.sort_order,t.start_mode,CONVERT(char(10),t.plan_start,23) plan_start,t.plan_days,t.plan_man_days,
      CASE WHEN t.status<>N'Not Started' OR t.percent_done>0 OR t.actual_start IS NOT NULL OR t.actual_end IS NOT NULL OR t.actual_man_days>0 THEN 1 ELSE 0 END started,
      (SELECT COUNT(*) FROM dbo.schedule_tasks c WHERE c.parent_id=t.id AND c.deleted_at IS NULL) children,
      CASE WHEN EXISTS(SELECT 1 FROM dbo.schedule_updates u WHERE u.task_id=t.id AND u.field=N'request' AND u.request_days>0 AND u.answer IS NULL) THEN 1 ELSE 0 END pending,
      CASE WHEN EXISTS(SELECT 1 FROM dbo.schedule_tasks d WHERE d.predecessor_id=t.id AND d.deleted_at IS NULL)
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
  }));
}

async function removeRow(transaction: TransactionType, projectId: number, row: ScheduleRow, actorId: number): Promise<void> {
  // The history row first: schedule_updates may only point at a task that is still active.
  await appendUpdate(transaction, projectId, row.id, actorId, "deleted", row.name, null, "Removed in Edit project");
  const remove = new sql.Request(transaction); remove.input("id", sql.BigInt, row.id).input("actor", sql.BigInt, actorId);
  await remove.query(`UPDATE dbo.schedule_tasks SET deleted_at=SYSUTCDATETIME(),updated_by=@actor,updated_at=SYSUTCDATETIME() WHERE id=@id AND deleted_at IS NULL;`);
}

/**
 * Edit project changes the two plan phases the project was created with, and nothing else
 * in its schedule. A row keeps its progress when its name or dates change. A row is
 * removed only when nothing depends on it: no progress, no children, no pending request
 * for more days, and nothing linked to it (a predecessor, a resource task, a signing
 * document, a report). Such a row stops the save and is named, rather than being dropped
 * or silently kept.
 */
export async function syncProjectPlan(transaction: TransactionType, projectId: number, plan: InitialPlan, actorId: number): Promise<void> {
  await ensureMembers(transaction, projectId, plan.team.map((row) => row.userId), actorId);
  const rows = await readScheduleRows(transaction, projectId);
  const phases = [
    { name: MASTER_PLAN_PHASE, visibility: "Customer" as const, inputs: plan.milestones.map((row) => ({ id: row.id, name: row.name, start: row.start, finish: row.finish, planManDays: 0, userId: null as number | null })) },
    { name: TEAM_PLAN_PHASE, visibility: "Internal" as const, inputs: plan.team.map((row) => ({ id: row.id, name: row.task, start: row.start, finish: row.finish, planManDays: row.planManDays, userId: row.userId as number | null })) },
  ];
  let nextPhaseOrder = Math.max(0, ...rows.filter((row) => row.parentId === null).map((row) => row.sortOrder));
  for (const phaseSpec of phases) {
    const phase = rows.find((row) => row.kind === "phase" && row.parentId === null && row.name === phaseSpec.name);
    const existing = phase ? rows.filter((row) => row.parentId === phase.id) : [];
    for (const input of phaseSpec.inputs) {
      if (input.id !== undefined && !existing.some((row) => row.id === input.id)) {
        throw new ApiError(409, "schedule_row_missing", "A plan row was changed or removed elsewhere. Reload the project and try again.");
      }
    }
    const kept = new Set(phaseSpec.inputs.map((input) => input.id).filter((id): id is number => id !== undefined));
    for (const row of existing.filter((candidate) => !kept.has(candidate.id))) {
      if (row.started || row.children > 0 || row.pending || row.referenced) {
        throw new ApiError(409, "schedule_row_in_use", `"${row.name}" has progress or linked work, so it cannot be removed here. Keep it, or change it in Project Schedule.`);
      }
      await removeRow(transaction, projectId, row, actorId);
    }
    if (!phaseSpec.inputs.length) {
      // An emptied phase would only roll up nothing.
      if (phase && existing.every((row) => !kept.has(row.id))) await removeRow(transaction, projectId, phase, actorId);
      continue;
    }
    const phaseId = phase?.id ?? await insertRow(transaction, projectId, actorId, { parentId: null, sortOrder: ++nextPhaseOrder, kind: "phase",
      name: phaseSpec.name, visibility: phaseSpec.visibility, planStart: null, planDays: 1, planManDays: 0 });
    for (const [index, input] of phaseSpec.inputs.entries()) {
      const planDays = calendarDays(input.start, input.finish);
      const current = input.id === undefined ? undefined : existing.find((row) => row.id === input.id);
      if (!current) {
        const id = await insertRow(transaction, projectId, actorId, { parentId: phaseId, sortOrder: index + 1, kind: "task", name: input.name,
          visibility: phaseSpec.visibility, planStart: input.start, planDays, planManDays: input.planManDays });
        if (input.userId !== null) await replacePics(transaction, id, [input.userId]);
        continue;
      }
      const datesChanged = current.planStart !== input.start || current.planDays !== planDays;
      const changed = datesChanged || current.name !== input.name || current.planManDays !== input.planManDays || current.sortOrder !== index + 1;
      if (changed && current.pending) {
        throw new ApiError(409, "schedule_day_request_pending", `"${current.name}" has a pending request for more days. Answer it before changing the row.`);
      }
      if (datesChanged && (current.children > 0 || current.startMode !== "manual")) {
        throw new ApiError(409, "schedule_rollup_plan_derived", `"${current.name}" takes its dates from its detail rows or a predecessor. Change them in Project Schedule.`);
      }
      if (changed) {
        const update = new sql.Request(transaction);
        update.input("id", sql.BigInt, current.id).input("name", sql.NVarChar(500), input.name).input("start", sql.Date, input.start)
          .input("days", sql.Int, planDays).input("man_days", sql.Decimal(9, 2), input.planManDays).input("sort", sql.Int, index + 1).input("actor", sql.BigInt, actorId);
        await update.query(`UPDATE dbo.schedule_tasks SET name=@name,plan_start=@start,plan_days=@days,plan_man_days=@man_days,sort_order=@sort,
          updated_by=@actor,updated_at=SYSUTCDATETIME() WHERE id=@id AND deleted_at IS NULL;`);
        await appendUpdate(transaction, projectId, current.id, actorId, "plan",
          JSON.stringify({ name: current.name, planStart: current.planStart, planDays: current.planDays, planManDays: current.planManDays }),
          JSON.stringify({ name: input.name, planStart: input.start, planDays, planManDays: input.planManDays }), "Changed in Edit project");
      }
      // A row with several PICs from Project Schedule keeps them unless its person is changed here.
      if (input.userId !== null && current.pic !== input.userId) await replacePics(transaction, current.id, [input.userId]);
    }
  }
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
