import type { FastifyInstance } from "fastify";
import sql from "mssql";
import type { Transaction as TransactionType } from "mssql";
import type { Database } from "../db.js";
import { ApiError } from "../errors.js";
import { bodyObject, dateOnly, parseDateOnly } from "../http.js";
import { bangkokToday } from "../issue-batches.js";
import { WORKLOAD_SQL, isOpenWork, workloadItems } from "../resource-workload.js";
import type { CurrentUserService } from "../users.js";
import {
  EDIT_DAYS_BACK, HOURS_PER_DAY, MAX_WINDOW_DAYS, addDays, awaySlotHours, choiceFromItem, choiceFromOutlook, choiceFromTeamTask, datesBetween,
  dayNumber, draftDay, draftHoursByKey, editableFrom, isEditable, isWeekend, parseDayRows, resolveDayRows, totalHours,
  type AwaySpan, type DraftInput, type OutlookEventDay, type StoredRow, type TeamTaskDay, type WorkChoice, type WorkKind,
} from "../work-days.js";

/*
 * GET  /api/v1/me/work-days?from&to   the signed-in person's days: confirmed hours, or the draft to confirm
 * PUT  /api/v1/me/work-days/:date     confirm one day with the lines given (replaces the day)
 * POST /api/v1/me/work-days/confirm   confirm several days as drafted ("as planned")
 *
 * Everyone works on their own days only; nobody confirms for someone else. The rules are in work-days.ts.
 */

type Row = Record<string, unknown>;

/**
 * One batch: holidays, WORKLOAD_SQL (ten recordsets, the person's own work as the team board reads it), then the
 * person's team tasks, days away, Outlook meetings, customer issues' projects, projects, and confirmed days and lines
 * in the window. Binds @actor, @from, @to.
 */
export const WORK_DAYS_SQL = `SET NOCOUNT ON;
      SELECT holiday_date FROM dbo.holidays;
      ${WORKLOAD_SQL}
      SELECT t.id,t.kind,t.title,t.project_id,p.project_no,t.start_date,t.end_date,t.time_slot,
        CONVERT(char(5),t.start_time,108) start_time,CONVERT(char(5),t.end_time,108) end_time,t.man_days
      FROM dbo.team_tasks t JOIN dbo.team_task_assignees a ON a.task_id=t.id AND a.user_id=@actor
      LEFT JOIN dbo.projects p ON p.id=t.project_id AND p.deleted_at IS NULL
      WHERE t.deleted_at IS NULL AND t.status<>N'Cancelled' AND t.end_date>=@from AND t.start_date<=@to
      ORDER BY t.start_date,t.id;
      SELECT CONVERT(date,SWITCHOFFSET(e.starts_at,'+07:00')) start_date,
        CONVERT(date,SWITCHOFFSET(DATEADD(second,-1,e.ends_at),'+07:00')) end_date
      FROM dbo.engineer_availability e
      WHERE e.user_id=@actor AND e.deleted_at IS NULL
        AND CONVERT(date,SWITCHOFFSET(e.ends_at,'+07:00'))>=@from AND CONVERT(date,SWITCHOFFSET(e.starts_at,'+07:00'))<=@to;
      SELECT id,subject,is_private,is_all_day,CONVERT(char(19),start_at,126) start_at,CONVERT(char(19),end_at,126) end_at
      FROM dbo.outlook_events
      WHERE user_id=@actor AND start_at<DATEADD(day,1,CONVERT(datetime2(0),@to)) AND end_at>CONVERT(datetime2(0),@from)
      ORDER BY start_at,id;
      SELECT i.id,b.project_id,p.project_no
      FROM dbo.issue_items i JOIN dbo.issue_batches b ON b.id=i.batch_id LEFT JOIN dbo.projects p ON p.id=b.project_id AND p.deleted_at IS NULL
      WHERE i.assignee_id=@actor;
      SELECT p.id,p.project_no,p.name FROM dbo.projects p
      WHERE p.deleted_at IS NULL AND p.status<>N'Closed' AND (p.manager_id=@actor OR p.lead_engineer_id=@actor
        OR EXISTS(SELECT 1 FROM dbo.project_members m WHERE m.project_id=p.id AND m.user_id=@actor))
      ORDER BY p.project_no;
      SELECT work_date,confirmed_at,times_confirmed FROM dbo.work_days WHERE user_id=@actor AND work_date BETWEEN @from AND @to;
      SELECT h.work_date,h.work_key,h.project_id,p.project_no,h.title,h.hours,h.planned_hours
      FROM dbo.work_hours h LEFT JOIN dbo.projects p ON p.id=h.project_id
      WHERE h.user_id=@actor AND h.work_date BETWEEN @from AND @to
      ORDER BY h.work_date,h.id;`;

export type RowKind = WorkKind | "ProjectOther" | "Other";
export type DayRowDto = { workKey: string | null; kind: RowKind; projectId: number | null; projectNo: string | null; title: string; reference: string; hours: number; plannedHours: number | null };
type StoredLine = StoredRow & { date: string; projectNo: string | null };
export type WorkDaysRead = {
  draftInput: DraftInput;
  choices: Map<string, WorkChoice>;
  projects: Map<number, { projectNo: string; name: string }>;
  confirmed: Map<string, { at: string; times: number }>;
  stored: Map<string, StoredLine[]>;
};

const text = (row: Row, key: string) => String(row[key] ?? "");
const optionalId = (row: Row, key: string) => (row[key] === null || row[key] === undefined ? null : Number(row[key]));
const day = (row: Row, key: string) => dateOnly((row[key] ?? null) as Date | string | null)!;
const iso = (value: unknown) => (value instanceof Date ? value.toISOString() : String(value ?? ""));

const KIND_BY_PREFIX: Record<string, WorkKind> = {
  Project: "Project", TeamTask: "TeamTask", Issue: "Issue", InquiryTask: "Inquiry", Inquiry: "Inquiry", Estimate: "Estimate", EstimateSection: "Estimate", Outlook: "Outlook",
};
export const kindOfKey = (workKey: string | null, projectId: number | null): RowKind =>
  workKey === null ? (projectId === null ? "Other" : "ProjectOther") : KIND_BY_PREFIX[workKey.slice(0, workKey.lastIndexOf("-"))] ?? "Other";

const KIND_ORDER: RowKind[] = ["Project", "TeamTask", "Issue", "Inquiry", "Estimate", "Outlook", "ProjectOther", "Other"];
const byKind = (left: { kind: RowKind; projectNo: string | null; reference: string; title: string }, right: typeof left) =>
  KIND_ORDER.indexOf(left.kind) - KIND_ORDER.indexOf(right.kind) || String(left.projectNo ?? "").localeCompare(String(right.projectNo ?? "")) ||
  left.reference.localeCompare(right.reference, undefined, { numeric: true }) || left.title.localeCompare(right.title);

/** The recordsets of WORK_DAYS_SQL, turned into the draft's input, the work hours can go to, and what is confirmed. */
export function workDaysRead(sets: Row[][], actorId: number, from: string, today: string): WorkDaysRead {
  const holidays = new Set((sets[0] ?? []).map((row) => day(row, "holiday_date")));
  const work = workloadItems(sets.slice(1, 11), holidays, { keepFinished: true });
  const [teamRows = [], awayRows = [], outlookRows = [], issueRows = [], projectRows = [], dayRows = [], lineRows = []] = sets.slice(11);
  // The person's own work; team tasks are read on their own, with done ones and the project they belong to.
  const mine = work.items.filter((item) => item.ownerId === actorId && item.type !== "Task");
  const items = mine.filter(isOpenWork), finishedItems = mine.filter((item) => !isOpenWork(item));
  const tasks: TeamTaskDay[] = teamRows.map((row) => ({
    id: Number(row.id), kind: row.kind === "Away" ? "Away" : row.kind === "Appointment" ? "Appointment" : "Task", title: text(row, "title"),
    projectId: optionalId(row, "project_id"), projectNo: row.project_no == null ? null : text(row, "project_no"),
    start: day(row, "start_date"), end: day(row, "end_date"), slot: text(row, "time_slot"),
    startTime: row.start_time ? text(row, "start_time").trim() : null, endTime: row.end_time ? text(row, "end_time").trim() : null, manDays: Number(row.man_days ?? 0),
  }));
  const away: AwaySpan[] = [
    ...awayRows.map((row) => ({ start: day(row, "start_date"), end: day(row, "end_date"), hours: HOURS_PER_DAY })),
    ...tasks.filter((task) => task.kind === "Away").map((task) => ({ start: task.start, end: task.end, hours: awaySlotHours(task) })),
  ];
  const outlook: OutlookEventDay[] = outlookRows.map((row) => ({
    id: Number(row.id), subject: row.is_private ? null : (row.subject == null ? null : text(row, "subject")), allDay: Boolean(row.is_all_day),
    start: text(row, "start_at"), end: text(row, "end_at"),
  }));
  const issueProjects = new Map(issueRows.map((row) => [Number(row.id), { projectId: optionalId(row, "project_id"), projectNo: row.project_no == null ? null : text(row, "project_no") }] as const));
  const projects = new Map(projectRows.map((row) => [Number(row.id), { projectNo: text(row, "project_no"), name: text(row, "name") }] as const));
  const confirmed = new Map(dayRows.map((row) => [day(row, "work_date"), { at: iso(row.confirmed_at), times: Number(row.times_confirmed ?? 1) }] as const));
  const stored = new Map<string, StoredLine[]>();
  for (const row of lineRows) {
    const date = day(row, "work_date");
    stored.set(date, [...(stored.get(date) ?? []), {
      date, workKey: row.work_key == null ? null : text(row, "work_key"), projectId: optionalId(row, "project_id"), projectNo: row.project_no == null ? null : text(row, "project_no"),
      title: text(row, "title"), hours: Number(row.hours), plannedHours: row.planned_hours == null ? null : Number(row.planned_hours),
    }]);
  }
  // Work hours can go to: open work, work finished within the editable window, team tasks and meetings in the window.
  const oldest = addDays(from, -EDIT_DAYS_BACK);
  const choices = new Map<string, WorkChoice>();
  const offer = (choice: WorkChoice) => { if (!choices.has(choice.workKey)) choices.set(choice.workKey, choice); };
  for (const item of items) offer(choiceFromItem(item, issueProjects));
  for (const item of finishedItems) if ((item.end ?? item.start ?? "") >= oldest) offer(choiceFromItem(item, issueProjects));
  for (const task of tasks) if (task.kind !== "Away") offer(choiceFromTeamTask(task));
  for (const event of outlook) offer(choiceFromOutlook(event));
  return { draftInput: { today, holidays, items, finishedItems, teamTasks: tasks.filter((task) => task.kind !== "Away"), outlook, away, issueProjects }, choices, projects, confirmed, stored };
}

export async function readWorkDays(database: Database, actorId: number, from: string, to: string, today: string): Promise<WorkDaysRead> {
  const result = await database.query<Row>(WORK_DAYS_SQL, (q) => q
    .input("actor", sql.BigInt, actorId)
    // Only the person's own work is read, so nobody's elevated view widens the read.
    .input("project_elevated", sql.Bit, false)
    .input("task_elevated", sql.Bit, false)
    .input("all_work", sql.Bit, false)
    .input("from", sql.Date, from)
    .input("to", sql.Date, to));
  return workDaysRead(result.recordsets as unknown as Row[][], actorId, from, today);
}

const rowDto = (row: { workKey: string | null; projectId: number | null; projectNo: string | null; title: string; hours: number; plannedHours: number | null }, choices: ReadonlyMap<string, WorkChoice>): DayRowDto => ({
  workKey: row.workKey, kind: kindOfKey(row.workKey, row.projectId), projectId: row.projectId, projectNo: row.projectNo, title: row.title,
  reference: row.workKey ? choices.get(row.workKey)?.reference ?? "" : "", hours: row.hours, plannedHours: row.plannedHours,
});

export function workDaysResponse(read: WorkDaysRead, from: string, to: string, today: string) {
  const days = datesBetween(from, to).map((date) => {
    const draft = draftDay(date, read.draftInput);
    const draftRows = draft.rows.map((row) => rowDto({ ...row, plannedHours: row.hours }, read.choices)).sort(byKind);
    const confirmed = read.confirmed.get(date);
    const stored = (read.stored.get(date) ?? []).map((row) => rowDto(row, read.choices)).sort(byKind);
    return {
      date, working: draft.working, holiday: read.draftInput.holidays.has(date), weekend: isWeekend(date), awayHours: draft.awayHours,
      editable: isEditable(date, today), future: date > today,
      confirmed: confirmed ? { at: confirmed.at, times: confirmed.times, hours: totalHours(stored) } : null,
      rows: confirmed ? stored : draftRows, draft: draftRows, draftHours: totalHours(draftRows),
    };
  });
  return {
    today, editableFrom: editableFrom(today), hoursPerDay: HOURS_PER_DAY, days,
    choices: [...read.choices.values()].map((choice) => ({ ...choice })).sort(byKind),
    projects: [...read.projects].map(([id, project]) => ({ id, ...project })),
  };
}

export const SAVE_DAY_SQL = `
      UPDATE dbo.work_days WITH (UPDLOCK, SERIALIZABLE) SET confirmed_at=SYSUTCDATETIME(),times_confirmed=times_confirmed+1
      WHERE user_id=@actor AND work_date=@date;
      IF @@ROWCOUNT=0 INSERT dbo.work_days(user_id,work_date) VALUES(@actor,@date);
      DELETE FROM dbo.work_hours WHERE user_id=@actor AND work_date=@date;
      INSERT dbo.work_hours(user_id,work_date,work_key,project_id,title,hours,planned_hours)
      SELECT @actor,@date,j.work_key,j.project_id,j.title,j.hours,j.planned_hours
      FROM OPENJSON(@rows) WITH (work_key nvarchar(40) '$.workKey',project_id bigint '$.projectId',title nvarchar(300) '$.title',
        hours decimal(5,2) '$.hours',planned_hours decimal(5,2) '$.plannedHours') j;
      SELECT confirmed_at,times_confirmed FROM dbo.work_days WHERE user_id=@actor AND work_date=@date;`;

async function saveDay(transaction: TransactionType, actorId: number, date: string, rows: readonly StoredRow[]) {
  const request = new sql.Request(transaction);
  request.input("actor", sql.BigInt, actorId).input("date", sql.Date, date).input("rows", sql.NVarChar(sql.MAX), JSON.stringify(rows));
  const saved = (await request.query<Row>(SAVE_DAY_SQL)).recordset[0];
  return { at: iso(saved?.confirmed_at), times: Number(saved?.times_confirmed ?? 1) };
}

/** Dates to confirm as drafted: 1 to EDIT_DAYS_BACK + 1 distinct days. */
export function parseConfirmDates(value: unknown): string[] {
  const body = bodyObject(value);
  if (!Array.isArray(body.dates) || !body.dates.length || body.dates.length > EDIT_DAYS_BACK + 1) throw new ApiError(400, "validation_failed", `Dates must list 1 to ${EDIT_DAYS_BACK + 1} days.`);
  const dates = [...new Set(body.dates.map((date: unknown) => parseDateOnly(date, "Date")!))];
  return dates.sort();
}

export function registerWorkDayRoutes(app: FastifyInstance, database: Database, users: CurrentUserService): void {
  app.get("/api/v1/me/work-days", async (request) => {
    const actor = await users.required(request);
    const query = request.query as Record<string, unknown>;
    const from = parseDateOnly(query.from, "From")!, to = parseDateOnly(query.to, "To")!;
    if (to < from || dayNumber(to) - dayNumber(from) + 1 > MAX_WINDOW_DAYS)
      throw new ApiError(400, "validation_failed", `Choose a window of at most ${MAX_WINDOW_DAYS} days.`);
    const today = bangkokToday();
    return workDaysResponse(await readWorkDays(database, actor.id, from, to, today), from, to, today);
  });

  app.put("/api/v1/me/work-days/:date", async (request) => {
    const actor = await users.required(request);
    const date = parseDateOnly((request.params as Record<string, unknown>).date, "Date")!;
    const today = bangkokToday();
    if (!isEditable(date, today)) throw new ApiError(409, "work_day_closed", `Days from ${editableFrom(today)} to today can be confirmed.`);
    const input = parseDayRows(request.body);
    const read = await readWorkDays(database, actor.id, date, date, today);
    // Work already confirmed on this day stays a valid line, even if it has since left the person's plan.
    const choices = new Map(read.choices);
    for (const line of read.stored.get(date) ?? []) {
      if (line.workKey && !choices.has(line.workKey)) choices.set(line.workKey, { workKey: line.workKey, kind: kindOfKey(line.workKey, line.projectId) as WorkKind, projectId: line.projectId, projectNo: line.projectNo, title: line.title, reference: "" });
    }
    const rows = resolveDayRows(input, choices, read.projects, draftHoursByKey(draftDay(date, read.draftInput)));
    const saved = await database.transaction((transaction) => saveDay(transaction, actor.id, date, rows));
    const projectNo = (row: StoredRow) => (row.workKey ? choices.get(row.workKey)?.projectNo ?? null : row.projectId === null ? null : read.projects.get(row.projectId)?.projectNo ?? null);
    const lines = rows.map((row) => rowDto({ ...row, projectNo: projectNo(row) }, choices)).sort(byKind);
    return { date, confirmed: { at: saved.at, times: saved.times, hours: totalHours(rows) }, rows: lines };
  });

  app.post("/api/v1/me/work-days/confirm", async (request) => {
    const actor = await users.required(request);
    const dates = parseConfirmDates(request.body);
    const today = bangkokToday();
    const closed = dates.filter((date) => !isEditable(date, today));
    if (closed.length) throw new ApiError(409, "work_day_closed", `Days from ${editableFrom(today)} to today can be confirmed.`);
    const read = await readWorkDays(database, actor.id, dates[0]!, dates.at(-1)!, today);
    const confirmed: string[] = [], skipped: { date: string; reason: "confirmed" | "empty" | "off" }[] = [];
    const plans: { date: string; rows: StoredRow[] }[] = [];
    for (const date of dates) {
      if (read.confirmed.has(date)) { skipped.push({ date, reason: "confirmed" }); continue; }
      const draft = draftDay(date, read.draftInput);
      // A day with nothing drafted needs the person to say what they did, unless they were away all of it.
      if (!draft.rows.length && draft.awayHours < HOURS_PER_DAY) { skipped.push({ date, reason: draft.working ? "empty" : "off" }); continue; }
      plans.push({ date, rows: draft.rows.map((row) => ({ workKey: row.workKey, projectId: row.projectId, title: row.title.slice(0, 300), hours: row.hours, plannedHours: row.hours })) });
    }
    if (plans.length) await database.transaction(async (transaction) => {
      for (const plan of plans) { await saveDay(transaction, actor.id, plan.date, plan.rows); confirmed.push(plan.date); }
    });
    return { confirmed, skipped };
  });
}
