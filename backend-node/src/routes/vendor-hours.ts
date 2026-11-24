/*
 * My Work > Outsourced work (task doc 3.6, owner 2026-11-23): the people and hours an outside supplier put on a plan row,
 * day by day (dbo.schedule_vendor_hours, migration 127). The supplier does not use the app, so the member who looks
 * after the row (a PIC of it) or the project's manager or lead engineer records them. Hours default to people x 8.
 * People's work is counted in hours only; no money here.
 */
import type { FastifyInstance } from "fastify";
import sql from "mssql";
import type { Database } from "../db.js";
import { ApiError } from "../errors.js";
import { bodyObject, parseDateOnly, positiveLong } from "../http.js";
import { bangkokToday } from "../issue-batches.js";
import type { CurrentUserService } from "../users.js";

export const VENDOR_HOURS_PER_PERSON = 8;
/** How far back a day can still be recorded or changed. */
export const VENDOR_DAYS_BACK = 60;

const DAY_MS = 86_400_000;
const shift = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
/** The Monday on or before a date. */
export const mondayOf = (iso: string) => shift(iso, -((new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7));

/** The outsourced plan rows the person may record for: open projects, a leaf row, held by them or run by them. */
export const VENDOR_ROWS_SQL = `
  SELECT t.id,t.name,t.labor_supplier,t.plan_man_days,t.percent_done,t.status,p.id project_id,p.project_no,p.name project_name,
    CONVERT(char(10),t.plan_start,23) plan_start,t.plan_days,
    (SELECT COALESCE(SUM(v.hours),0) FROM dbo.schedule_vendor_hours v WHERE v.task_id=t.id) hours_to_date
  FROM dbo.schedule_tasks t INNER JOIN dbo.projects p ON p.id=t.project_id AND p.deleted_at IS NULL AND p.status<>N'Closed'
  WHERE t.deleted_at IS NULL AND t.kind<>N'phase' AND t.labor_source=N'Outsourced'
    AND NOT EXISTS(SELECT 1 FROM dbo.schedule_tasks c WHERE c.parent_id=t.id AND c.deleted_at IS NULL)
    AND (p.manager_id=@actor OR p.lead_engineer_id=@actor OR EXISTS(SELECT 1 FROM dbo.schedule_task_pics pic WHERE pic.task_id=t.id AND pic.user_id=@actor))
    AND (@task IS NULL OR t.id=@task)
  ORDER BY p.project_no,t.id;`;

type VendorRow = {
  id: number | string;
  name: string;
  labor_supplier: string | null;
  plan_man_days: number;
  percent_done: number;
  status: string;
  project_id: number | string;
  project_no: string;
  project_name: string;
  plan_start: string | null;
  plan_days: number;
  hours_to_date: number;
};

/** A day's entry as typed: people from 0 (clears the day) to 200 with one decimal; hours default to people x 8. */
export function vendorEntry(value: unknown): { people: number; hours: number; note: string | null } {
  const body = bodyObject(value);
  const people = Number(body.people);
  if (!Number.isFinite(people) || people < 0 || people > 200 || Math.round(people * 10) !== people * 10)
    throw new ApiError(400, "validation_failed", "People must be a number from 0 to 200 with one decimal place at most.");
  const hours = body.hours === undefined || body.hours === null || body.hours === "" ? people * VENDOR_HOURS_PER_PERSON : Number(body.hours);
  if (!Number.isFinite(hours) || hours < 0 || hours > 4800 || (people > 0 && hours <= 0) || (people === 0 && hours !== 0))
    throw new ApiError(400, "validation_failed", "Hours must be from 0 to 4,800, and more than 0 when people worked.");
  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 300) : null;
  return { people, hours: Math.round(hours * 100) / 100, note };
}

export function registerVendorHourRoutes(app: FastifyInstance, database: Database, users: CurrentUserService): void {
  app.get("/api/v1/me/vendor-work", async (request) => {
    const actor = await users.required(request);
    const query = request.query as Record<string, unknown>;
    const today = bangkokToday();
    const from = mondayOf(parseDateOnly(query.from ?? today, "From") ?? today);
    const to = shift(from, 6);
    const result = await database.query<VendorRow & { task_id?: number }>(
      `${VENDOR_ROWS_SQL}
      SELECT v.task_id,CONVERT(char(10),v.work_date,23) work_date,v.people,v.hours,v.note
      FROM dbo.schedule_vendor_hours v WHERE v.work_date BETWEEN @from AND @to
        AND v.task_id IN (SELECT t.id FROM dbo.schedule_tasks t INNER JOIN dbo.projects p ON p.id=t.project_id
          WHERE t.labor_source=N'Outsourced' AND t.deleted_at IS NULL
            AND (p.manager_id=@actor OR p.lead_engineer_id=@actor OR EXISTS(SELECT 1 FROM dbo.schedule_task_pics pic WHERE pic.task_id=t.id AND pic.user_id=@actor)));`,
      (bind) => {
        bind.input("actor", sql.BigInt, actor.id);
        bind.input("task", sql.BigInt, null);
        bind.input("from", sql.Date, from);
        bind.input("to", sql.Date, to);
      },
    );
    const sets = (result.recordsets as unknown as Record<string, unknown>[][]) ?? [];
    const rows = (sets[0] ?? []) as VendorRow[];
    const entries = (sets[1] ?? []) as { task_id: number | string; work_date: string; people: number; hours: number; note: string | null }[];
    return {
      today,
      from,
      to,
      editableFrom: shift(today, -VENDOR_DAYS_BACK),
      hoursPerPerson: VENDOR_HOURS_PER_PERSON,
      rows: rows.map((row) => ({
        taskId: Number(row.id),
        name: row.name,
        supplier: row.labor_supplier ?? "",
        projectId: Number(row.project_id),
        projectNo: row.project_no,
        projectName: row.project_name,
        planStart: row.plan_start,
        planDays: Number(row.plan_days),
        planHours: Math.round(Number(row.plan_man_days) * VENDOR_HOURS_PER_PERSON * 10) / 10,
        hoursToDate: Number(row.hours_to_date),
        percentComplete: Number(row.percent_done),
        status: row.status,
        days: entries
          .filter((entry) => Number(entry.task_id) === Number(row.id))
          .map((entry) => ({ date: entry.work_date, people: Number(entry.people), hours: Number(entry.hours), note: entry.note })),
      })),
    };
  });

  app.put("/api/v1/me/vendor-work/:taskId/:date", async (request) => {
    const actor = await users.required(request);
    const params = request.params as { taskId?: string; date?: string };
    const taskId = positiveLong(params.taskId, "Task id");
    const date = parseDateOnly(params.date, "Date")!;
    const today = bangkokToday();
    if (date > today || date < shift(today, -VENDOR_DAYS_BACK)) throw new ApiError(409, "vendor_day_closed", `Days from ${shift(today, -VENDOR_DAYS_BACK)} to today can be recorded.`);
    const entry = vendorEntry(request.body);
    return database.transaction(async (transaction) => {
      const allowed = new sql.Request(transaction);
      allowed.input("actor", sql.BigInt, actor.id).input("task", sql.BigInt, taskId);
      const row = (await allowed.query<VendorRow>(VENDOR_ROWS_SQL)).recordset[0];
      if (!row) throw new ApiError(403, "vendor_row_not_yours", "Only the member who looks after an outsourced row, or its project manager or lead engineer, records its supplier's hours.");
      const save = new sql.Request(transaction);
      save
        .input("task", sql.BigInt, taskId)
        .input("date", sql.Date, date)
        .input("people", sql.Decimal(5, 1), entry.people)
        .input("hours", sql.Decimal(7, 2), entry.hours)
        .input("note", sql.NVarChar(300), entry.note)
        .input("actor", sql.BigInt, actor.id);
      await save.query(
        entry.people === 0
          ? `DELETE FROM dbo.schedule_vendor_hours WHERE task_id=@task AND work_date=@date;`
          : `UPDATE dbo.schedule_vendor_hours WITH (UPDLOCK, SERIALIZABLE) SET people=@people,hours=@hours,note=@note,entered_by=@actor,entered_at=SYSUTCDATETIME()
               WHERE task_id=@task AND work_date=@date;
             IF @@ROWCOUNT=0 INSERT dbo.schedule_vendor_hours(task_id,work_date,people,hours,note,entered_by) VALUES(@task,@date,@people,@hours,@note,@actor);`,
      );
      return { taskId, date, people: entry.people, hours: entry.hours, note: entry.note };
    });
  });
}
