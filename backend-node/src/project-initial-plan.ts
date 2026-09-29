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

export type MilestoneRow = { name: string; start: string; finish: string };
export type TeamRow = { userId: number; task: string; start: string; finish: string; planManDays: number };
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

export function parseInitialPlan(body: Record<string, unknown>): InitialPlan {
  const milestones = rows(body.masterPlan, "Master plan").map((row, index) => {
    const label = `Master plan row ${index + 1}`;
    return { name: requiredText(row.name, 500, `${label} name`), ...period(row, label) };
  });
  const team = rows(body.team, "Team plan").map((row, index) => {
    const label = `Team plan row ${index + 1}`;
    return {
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

/**
 * Team members join the project first -- a schedule PIC must be a member -- then both
 * phases and their rows are written. Runs inside the project's own creation transaction,
 * so a project never exists with half of its plan.
 */
export async function insertInitialPlan(transaction: TransactionType, projectId: number, plan: InitialPlan, actorId: number): Promise<void> {
  for (const userId of new Set(plan.team.map((row) => row.userId))) {
    const member = new sql.Request(transaction);
    member.input("project", sql.BigInt, projectId).input("user", sql.BigInt, userId).input("actor", sql.BigInt, actorId);
    const result = await member.query<{ active: boolean }>(`DECLARE @active bit = CASE WHEN EXISTS(
        SELECT 1 FROM dbo.users WHERE id=@user AND is_active=1 AND deleted_at IS NULL) THEN 1 ELSE 0 END;
      IF @active=1 AND NOT EXISTS(SELECT 1 FROM dbo.project_members WHERE project_id=@project AND user_id=@user)
        INSERT INTO dbo.project_members(project_id,user_id,role_on_project,created_by) VALUES(@project,@user,N'Member',@actor);
      SELECT @active AS active;`);
    if (!result.recordset[0]?.active) throw new ApiError(422, "invalid_reference", "Every team plan member must be an active user.");
  }
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
