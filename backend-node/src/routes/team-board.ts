import type { FastifyInstance } from "fastify";
import sql from "mssql";
import type { Transaction as TransactionType } from "mssql";
import type { Database } from "../db.js";
import type { CurrentUserService } from "../users.js";
import type { CurrentUser } from "../types.js";
import { bodyObject, dateOnly, optionalBodyText, parseDateOnly, parseRowVersion, positiveLong, requiredText } from "../http.js";
import { ApiError } from "../errors.js";
import { insertAudit } from "../audit.js";
import { isProjectElevated, isProjectManagerRole } from "../project-scope.js";
import { elevated } from "../resource-task-service.js";
import { notifyUsers } from "../site-visit-common.js";
import { WORKLOAD_SQL, workloadItems, type WorkloadItem } from "../resource-workload.js";
import type { EmailService } from "../email.js";
import { calendarActions, type CalendarState } from "../team-calendar.js";

// The team board (owner decision 2026-10-21): everyone's work on one page, so that a customer who calls to book can be
// given a day at once, and work the system does not know yet (an appointment, a task, a day away) can be added with a
// subject and a date and adjusted later. Everyone with team.board sees everyone's load; the details of work outside
// their own access are left out.

type Row = Record<string, unknown>;
export const TEAM_TASK_KINDS = ["Appointment", "Task", "Away"] as const;
export const TEAM_TASK_SLOTS = ["Day", "AM", "PM"] as const;
export const TEAM_TASK_STATUSES = ["Planned", "Done", "Cancelled"] as const;
const ENTITY = "Team Task";
const DAY = 86_400_000;
/** The longest board window, and the longest task. */
const MAX_WINDOW_DAYS = 400;
const MAX_TASK_DAYS = 366;
/** The most people one task can be for. */
const MAX_PEOPLE = 20;

export type TeamTaskInput = {
  kind: (typeof TEAM_TASK_KINDS)[number];
  title: string;
  customerId: number | null;
  /** Everyone on it, in the order chosen; empty: nobody yet. Each spends the task's man-days. */
  assigneeIds: number[];
  startDate: string;
  endDate: string;
  slot: (typeof TEAM_TASK_SLOTS)[number];
  startTime: string | null;
  /** Null: work it out from the days (a whole day is 1 MD, a morning or an afternoon 0.5). */
  manDays: number | null;
  status: (typeof TEAM_TASK_STATUSES)[number];
  inquiryId: number | null;
  projectId: number | null;
  note: string;
};

const dayNumber = (value: string) => Date.parse(`${value}T00:00:00Z`) / DAY;
const choice = <T extends string>(value: unknown, allowed: readonly T[], fallback: T, label: string): T => {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value))
    throw new ApiError(400, "validation_failed", `${label} must be one of: ${allowed.join(", ")}.`);
  return value as T;
};
/** An id from a JSON body: a whole number, or its digits as text. */
const optionalId = (value: unknown, label: string) =>
  value === undefined || value === null || value === "" ? null : positiveLong(typeof value === "number" ? String(value) : value, label);

/** A team task from a request body; every field but the subject and the start date has a default. */
export function parseTeamTask(value: unknown): TeamTaskInput {
  const body = bodyObject(value);
  const kind = choice(body.kind, TEAM_TASK_KINDS, "Task", "Kind");
  const startDate = parseDateOnly(body.startDate, "Start date")!;
  const endDate = parseDateOnly(body.endDate, "End date", true) ?? startDate;
  if (endDate < startDate) throw new ApiError(400, "validation_failed", "The end date cannot be before the start date.");
  if (dayNumber(endDate) - dayNumber(startDate) > MAX_TASK_DAYS)
    throw new ApiError(400, "validation_failed", `A team task can span at most ${MAX_TASK_DAYS} days.`);
  // A list of people; a single assigneeId (an older page) is a list of one.
  const people = Array.isArray(body.assigneeIds) ? body.assigneeIds : body.assigneeId === undefined || body.assigneeId === null || body.assigneeId === "" ? [] : [body.assigneeId];
  if (people.length > MAX_PEOPLE) throw new ApiError(400, "validation_failed", `A team task can have at most ${MAX_PEOPLE} people.`);
  const assigneeIds = [...new Set(people.map((person: unknown) => optionalId(person, "Person")).filter((person): person is number => person !== null))];
  if (kind === "Away" && !assigneeIds.length) throw new ApiError(400, "validation_failed", "Choose who is away.");
  const startTime = body.startTime === undefined || body.startTime === null || body.startTime === "" ? null : String(body.startTime);
  if (startTime !== null && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(startTime))
    throw new ApiError(400, "validation_failed", "The time must be HH:MM.");
  let manDays: number | null = null;
  if (body.manDays !== undefined && body.manDays !== null && body.manDays !== "") {
    const amount = body.manDays;
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0 || amount > 999 || Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-6)
      throw new ApiError(400, "validation_failed", "Man-days must be between 0 and 999 with at most two decimals.");
    manDays = amount;
  }
  return {
    kind,
    title: requiredText(body.title, 300, "Subject"),
    customerId: optionalId(body.customerId, "Customer"),
    assigneeIds,
    startDate,
    endDate,
    slot: choice(body.slot, TEAM_TASK_SLOTS, "Day", "Time of day"),
    startTime,
    // A day away takes nobody's effort.
    manDays: kind === "Away" ? 0 : manDays,
    status: choice(body.status, TEAM_TASK_STATUSES, "Planned", "Status"),
    inquiryId: optionalId(body.inquiryId, "RFQ"),
    projectId: optionalId(body.projectId, "Project"),
    note: optionalBodyText(body.note, 2000, "Note") ?? "",
  };
}

/** The effort a task takes when nobody entered one: each working day in it, whole or half; a task on a day off counts its calendar days. */
export function defaultManDays(task: Pick<TeamTaskInput, "kind" | "startDate" | "endDate" | "slot">, holidays: ReadonlySet<string>) {
  if (task.kind === "Away") return 0;
  const share = task.slot === "Day" ? 1 : 0.5;
  let working = 0;
  const from = dayNumber(task.startDate), to = dayNumber(task.endDate);
  for (let d = from; d <= to; d++) {
    const date = new Date(d * DAY), weekday = date.getUTCDay();
    if (weekday !== 0 && weekday !== 6 && !holidays.has(date.toISOString().slice(0, 10))) working++;
  }
  return (working || to - from + 1) * share;
}

/** Who may change or remove a team task: whoever added it, anyone it is for, and Admin / Engineering / Project Managers. */
export const canChangeTeamTask = (actor: CurrentUser, task: Row, assigneeIds: readonly number[]) =>
  Number(task.created_by) === actor.id || assigneeIds.includes(actor.id) || isProjectManagerRole(actor);

/** A task's people from STRING_AGG ("7,9"), in the order chosen. */
const idList = (value: unknown) => (value ? String(value).split(",").map(Number).filter((id) => Number.isSafeInteger(id) && id > 0) : []);

/** Work the caller may not open still shows when and how much; what it is, and for whom, is left out. */
export function redactWork(item: WorkloadItem): WorkloadItem {
  if (!item.hidden) return item;
  return {
    key: item.key, workKey: item.workKey, type: item.type, entityId: 0, ownerId: item.ownerId, reference: "", title: "", customer: "",
    start: item.start, end: item.end, manDays: item.manDays, progress: item.progress, status: item.status, hidden: true,
    ...(item.tentative ? { tentative: true } : {}),
  };
}

const TEAM_TASK_COLUMNS = `t.id,t.kind,t.title,t.customer_id,c.name customer_name,
        (SELECT STRING_AGG(CONVERT(nvarchar(20),a.user_id),N',') WITHIN GROUP (ORDER BY a.sort_order,a.user_id)
          FROM dbo.team_task_assignees a WHERE a.task_id=t.id) assignee_ids,t.start_date,t.end_date,t.time_slot,
        CONVERT(char(5),t.start_time,108) start_time,t.man_days,t.status,t.inquiry_id,i.inquiry_no,t.project_id,p.project_no,t.note,
        t.created_by,cu.name created_by_name,t.created_at,t.row_version
      FROM dbo.team_tasks t
      LEFT JOIN dbo.customers c ON c.id=t.customer_id
      LEFT JOIN dbo.inquiries i ON i.id=t.inquiry_id
      LEFT JOIN dbo.projects p ON p.id=t.project_id
      JOIN dbo.users cu ON cu.id=t.created_by`;

/**
 * Everything the board shows, in one batch: capacities, holidays, WORKLOAD_SQL's work (everyone's), the team tasks in
 * the window (and planned ones already past it), site visits and days away recorded for Site Visit, and the caller's
 * read permissions. Dates are Bangkok business days.
 */
export const TEAM_BOARD_SQL = `SET NOCOUNT ON;
      SELECT user_id,days_per_week FROM dbo.resource_capacity;
      SELECT holiday_date FROM dbo.holidays;
      ${WORKLOAD_SQL}
      SELECT ${TEAM_TASK_COLUMNS}
      WHERE t.deleted_at IS NULL AND ((t.status<>N'Cancelled' AND t.end_date>=@from AND t.start_date<=@to)
        -- Planned work from before the window stays in view until someone closes it.
        OR (t.status=N'Planned' AND t.kind<>N'Away' AND t.end_date<@from))
      ORDER BY t.start_date,t.id;
      SELECT v.id,v.visit_no,v.status,c.name customer_name,a.engineer_id,
        CONVERT(date,SWITCHOFFSET(v.scheduled_start,'+07:00')) start_date,
        CONVERT(date,SWITCHOFFSET(COALESCE(v.scheduled_end,v.scheduled_start),'+07:00')) end_date,
        CONVERT(char(5),CONVERT(time(0),SWITCHOFFSET(v.scheduled_start,'+07:00')),108) start_time
      FROM dbo.site_visits v JOIN dbo.sales_intakes si ON si.id=v.intake_id JOIN dbo.customers c ON c.id=si.customer_id
      JOIN dbo.site_visit_assignments a ON a.visit_id=v.id AND a.is_active=1
      WHERE v.deleted_at IS NULL AND v.archived_at IS NULL AND v.scheduled_start IS NOT NULL AND v.status NOT IN(N'Cancelled')
        AND CONVERT(date,SWITCHOFFSET(COALESCE(v.scheduled_end,v.scheduled_start),'+07:00'))>=@from
        AND CONVERT(date,SWITCHOFFSET(v.scheduled_start,'+07:00'))<=@to
      ORDER BY v.scheduled_start,v.id;
      SELECT e.id,e.user_id,e.kind,CONVERT(date,SWITCHOFFSET(e.starts_at,'+07:00')) start_date,
        CONVERT(date,SWITCHOFFSET(DATEADD(second,-1,e.ends_at),'+07:00')) end_date
      FROM dbo.engineer_availability e
      WHERE e.deleted_at IS NULL AND CONVERT(date,SWITCHOFFSET(e.ends_at,'+07:00'))>=@from AND CONVERT(date,SWITCHOFFSET(e.starts_at,'+07:00'))<=@to
      ORDER BY e.starts_at,e.id;
      SELECT code FROM dbo.user_effective_permissions WHERE user_id=@actor AND code IN(N'inquiry.read',N'project.read',N'visit.read');`;

/** A team task as the board shows it; links are named only to someone who may read them. */
export function teamTaskDto(r: Row, can: { inquiries: boolean; projects: boolean }) {
  return {
    id: Number(r.id),
    kind: String(r.kind),
    title: String(r.title ?? ""),
    customerId: r.customer_id === null || r.customer_id === undefined ? null : Number(r.customer_id),
    customer: String(r.customer_name ?? ""),
    assigneeIds: idList(r.assignee_ids),
    startDate: dateOnly(r.start_date as Date | string),
    endDate: dateOnly(r.end_date as Date | string),
    slot: String(r.time_slot ?? "Day"),
    startTime: r.start_time ? String(r.start_time).trim() : null,
    manDays: Number(r.man_days ?? 0),
    status: String(r.status),
    inquiryId: r.inquiry_id === null || r.inquiry_id === undefined ? null : Number(r.inquiry_id),
    inquiryNo: can.inquiries && r.inquiry_no ? String(r.inquiry_no) : "",
    projectId: r.project_id === null || r.project_id === undefined ? null : Number(r.project_id),
    projectNo: can.projects && r.project_no ? String(r.project_no) : "",
    note: String(r.note ?? ""),
    createdBy: Number(r.created_by),
    createdByName: String(r.created_by_name ?? ""),
    createdAt: r.created_at,
    rowVersion: Buffer.isBuffer(r.row_version) ? r.row_version.toString("base64") : "",
  };
}

/** Checks that what a task points at exists, and works out its effort when none was entered. */
async function prepare(transaction: TransactionType, input: TeamTaskInput) {
  const q = new sql.Request(transaction);
  q.input("customer", sql.BigInt, input.customerId).input("people", sql.NVarChar(sql.MAX), JSON.stringify(input.assigneeIds))
    .input("people_count", sql.Int, input.assigneeIds.length)
    .input("inquiry", sql.BigInt, input.inquiryId).input("project", sql.BigInt, input.projectId)
    .input("start", sql.Date, input.startDate).input("end", sql.Date, input.endDate);
  const result = await q.query<Row>(`
    SELECT CASE WHEN @customer IS NULL OR EXISTS(SELECT 1 FROM dbo.customers WHERE id=@customer) THEN 1 ELSE 0 END customer_ok,
      CASE WHEN (SELECT COUNT(*) FROM dbo.users WHERE is_active=1 AND deleted_at IS NULL
        AND id IN (SELECT CONVERT(bigint,[value]) FROM OPENJSON(@people)))=@people_count THEN 1 ELSE 0 END assignee_ok,
      CASE WHEN @inquiry IS NULL OR EXISTS(SELECT 1 FROM dbo.inquiries WHERE id=@inquiry AND deleted_at IS NULL) THEN 1 ELSE 0 END inquiry_ok,
      CASE WHEN @project IS NULL OR EXISTS(SELECT 1 FROM dbo.projects WHERE id=@project AND deleted_at IS NULL) THEN 1 ELSE 0 END project_ok;
    SELECT holiday_date FROM dbo.holidays WHERE holiday_date BETWEEN @start AND @end;`);
  const [checks] = result.recordsets as unknown as Row[][];
  const check = checks?.[0] ?? {};
  if (!Number(check.customer_ok)) throw new ApiError(400, "validation_failed", "That customer does not exist.");
  if (!Number(check.assignee_ok)) throw new ApiError(400, "validation_failed", "Someone chosen is not an active user.");
  if (!Number(check.inquiry_ok)) throw new ApiError(400, "validation_failed", "That RFQ does not exist.");
  if (!Number(check.project_ok)) throw new ApiError(400, "validation_failed", "That project does not exist.");
  const holidays = new Set(((result.recordsets as unknown as Row[][])[1] ?? []).map((r) => dateOnly(r.holiday_date as Date)!));
  return { ...input, manDays: input.manDays ?? defaultManDays(input, holidays) };
}

const bind = (q: sql.Request, task: TeamTaskInput & { manDays: number }, actor: number) => q
  .input("kind", sql.NVarChar(20), task.kind).input("title", sql.NVarChar(300), task.title)
  .input("customer", sql.BigInt, task.customerId)
  .input("start", sql.Date, task.startDate).input("end", sql.Date, task.endDate)
  .input("slot", sql.NVarChar(10), task.slot).input("time", sql.NVarChar(5), task.startTime)
  .input("man_days", sql.Decimal(6, 2), task.manDays).input("status", sql.NVarChar(20), task.status)
  .input("inquiry", sql.BigInt, task.inquiryId).input("project", sql.BigInt, task.projectId)
  .input("note", sql.NVarChar(2000), task.note).input("actor", sql.BigInt, actor);

/** Sets a task's people, in the order chosen. */
async function savePeople(transaction: TransactionType, id: number, assigneeIds: readonly number[]) {
  await new sql.Request(transaction).input("id", sql.BigInt, id).input("people", sql.NVarChar(sql.MAX), JSON.stringify(assigneeIds)).query(`
    DELETE FROM dbo.team_task_assignees WHERE task_id=@id;
    INSERT dbo.team_task_assignees(task_id,user_id,sort_order)
    SELECT @id,CONVERT(bigint,people.[value]),CONVERT(int,people.[key])+1 FROM OPENJSON(@people) people;`);
}

/** A task's people as saved, for a change or a removal. */
async function currentPeople(transaction: TransactionType, id: number) {
  const rows = (await new sql.Request(transaction).input("id", sql.BigInt, id)
    .query<Row>("SELECT user_id FROM dbo.team_task_assignees WHERE task_id=@id ORDER BY sort_order,user_id;")).recordset;
  return rows.map((r) => Number(r.user_id));
}

/** Tells the people a task was given to, except whoever gave it. */
async function tellPeople(transaction: TransactionType, actor: CurrentUser, id: number, task: TeamTaskInput, userIds: readonly number[]) {
  const recipients = userIds.filter((userId) => userId !== actor.id);
  if (!recipients.length || task.status !== "Planned") return;
  const when = task.endDate === task.startDate ? task.startDate : `${task.startDate} → ${task.endDate}`;
  await notifyUsers(transaction, recipients, "TEAM_TASK_ASSIGNED", task.title.slice(0, 300),
    `${when}${task.startTime ? ` ${task.startTime}` : ""} · ${actor.name}`, "TeamTask", id, `team-task-${id}-${task.startDate}`);
}

/** A task's state as the calendar sees it; the customer by id, so a rename elsewhere sends nothing. */
const calendarState = (task: { kind: string; title: string; customerId: number | null; note: string; startDate: string; endDate: string; slot: string; startTime: string | null; assigneeIds: number[]; status: string }): CalendarState => ({
  kind: task.kind as CalendarState["kind"], title: task.title, customer: task.customerId === null ? "" : String(task.customerId), note: task.note,
  startDate: task.startDate, endDate: task.endDate, slot: task.slot as CalendarState["slot"], startTime: task.startTime, assigneeIds: task.assigneeIds, status: task.status,
});
const rowState = (r: Row, assigneeIds: number[]) => calendarState({
  kind: String(r.kind), title: String(r.title), customerId: r.customer_id === null || r.customer_id === undefined ? null : Number(r.customer_id), note: String(r.note ?? ""),
  startDate: dateOnly(r.start_date as Date)!, endDate: dateOnly(r.end_date as Date)!, slot: String(r.time_slot ?? "Day"),
  startTime: r.start_time ? (r.start_time instanceof Date ? r.start_time.toISOString().slice(11, 16) : String(r.start_time).slice(0, 5)) : null,
  assigneeIds, status: String(r.status),
});

/** What the person's Outlook got: "none" when nothing needed sending. */
export type CalendarDelivery = "none" | "sent" | "disabled" | "failed";

/**
 * Sends the Outlook messages a change calls for, after it is saved: one request to everyone on the task, carrying it
 * as it is now, and one cancellation to whoever it no longer includes, carrying it as they had it. Delivery never
 * undoes the save.
 */
async function deliverCalendar(db: Database, email: Pick<EmailService, "sendTeamTaskCalendar">, id: number, before: CalendarState | null, after: CalendarState | null, sentBy: string): Promise<CalendarDelivery> {
  const { cancel, request } = calendarActions(before, after);
  const actions = [
    ...(cancel.length ? [{ method: "CANCEL" as const, userIds: cancel, state: before! }] : []),
    ...(request.length ? [{ method: "REQUEST" as const, userIds: request, state: after! }] : []),
  ];
  if (!actions.length) return "none";
  const userIds = [...new Set([...cancel, ...request])];
  const customerIds = [...new Set([before?.customer, after?.customer].filter((value): value is string => Boolean(value)).map(Number))];
  const lookup = await db.query<Row>(`
    SELECT id,name,email FROM dbo.users WHERE id IN (SELECT CONVERT(bigint,[value]) FROM OPENJSON(@users));
    SELECT id,name FROM dbo.customers WHERE id IN (SELECT CONVERT(bigint,[value]) FROM OPENJSON(@customers));`,
  (q) => q.input("users", sql.NVarChar(sql.MAX), JSON.stringify(userIds)).input("customers", sql.NVarChar(sql.MAX), JSON.stringify(customerIds)));
  const [people = [], customers = []] = lookup.recordsets as unknown as Row[][];
  const customerName = (value: string) => (value ? String(customers.find((r) => String(r.id) === value)?.name ?? "") : "");
  const results: CalendarDelivery[] = [];
  for (const { method, userIds: ids, state } of actions) {
    // In the order chosen, and only people with an address.
    const recipients = ids.map((userId) => people.find((r) => Number(r.id) === userId)).filter((person): person is Row => Boolean(person?.email))
      .map((person) => ({ name: String(person.name ?? ""), email: String(person.email) }));
    if (!recipients.length) continue;
    const result = await email.sendTeamTaskCalendar({
      method, recipients, sentBy,
      task: { id, kind: state.kind === "Appointment" ? "Appointment" : "Task", title: state.title, customer: customerName(state.customer), note: state.note,
        startDate: state.startDate, endDate: state.endDate, slot: state.slot, startTime: state.startTime },
    });
    results.push(result.status);
  }
  return results.includes("failed") ? "failed" : results.includes("disabled") ? "disabled" : results.length ? "sent" : "none";
}

export function registerTeamBoardRoutes(app: FastifyInstance, db: Database, users: CurrentUserService, email: Pick<EmailService, "sendTeamTaskCalendar">) {
  app.get("/api/v1/team-board", async (request) => {
    await users.demandPermission(request, "team.board");
    const actor = await users.required(request);
    const query = request.query as Record<string, unknown>;
    const from = parseDateOnly(query.from, "From")!, to = parseDateOnly(query.to, "To")!;
    if (to < from || dayNumber(to) - dayNumber(from) > MAX_WINDOW_DAYS)
      throw new ApiError(400, "validation_failed", `Choose a window of at most ${MAX_WINDOW_DAYS} days.`);
    const result = await db.query<Row>(TEAM_BOARD_SQL, (q) => q
      .input("actor", sql.BigInt, actor.id)
      .input("project_elevated", sql.Bit, isProjectElevated(actor))
      .input("task_elevated", sql.Bit, elevated(actor) || isProjectManagerRole(actor))
      // Everyone's work counts on the board; `visible` marks what is the caller's to see.
      .input("all_work", sql.Bit, true)
      .input("from", sql.Date, from)
      .input("to", sql.Date, to));
    const sets = result.recordsets as unknown as Row[][];
    const holidays = (sets[1] ?? []).map((r) => dateOnly(r.holiday_date as Date)!);
    const work = workloadItems(sets.slice(2, 11), new Set(holidays));
    const [taskRows = [], visitRows = [], awayRows = [], permissionRows = []] = sets.slice(11);
    const granted = new Set(permissionRows.map((r) => String(r.code)));
    const can = { inquiries: granted.has("inquiry.read"), projects: granted.has("project.read") };
    // One visit with two engineers is one row per engineer; the board shows it on each of their rows.
    const visits = new Map<number, { id: number; number: string; status: string; customer: string; start: string | null; end: string | null; time: string | null; engineerIds: number[] }>();
    for (const r of visitRows) {
      const visitId = Number(r.id), current = visits.get(visitId);
      if (current) { current.engineerIds.push(Number(r.engineer_id)); continue; }
      visits.set(visitId, {
        id: visitId,
        number: granted.has("visit.read") ? String(r.visit_no ?? "") : "",
        status: String(r.status ?? ""),
        customer: granted.has("visit.read") ? String(r.customer_name ?? "") : "",
        start: dateOnly(r.start_date as Date), end: dateOnly(r.end_date as Date),
        time: r.start_time ? String(r.start_time).trim() : null,
        engineerIds: [Number(r.engineer_id)],
      });
    }
    return {
      capacities: (sets[0] ?? []).map((r) => ({ userId: Number(r.user_id), daysPerWeek: Number(r.days_per_week) })),
      holidays,
      items: work.items.map(redactWork),
      warnings: work.warnings,
      tasks: taskRows.map((r) => teamTaskDto(r, can)),
      visits: [...visits.values()],
      away: awayRows.map((r) => ({ id: Number(r.id), userId: Number(r.user_id), kind: String(r.kind), start: dateOnly(r.start_date as Date), end: dateOnly(r.end_date as Date) })),
      /** Admin, Engineering and Project Managers may change anyone's team task. */
      canChangeAll: isProjectManagerRole(actor),
    };
  });

  app.post("/api/v1/team-tasks", async (request, reply) => {
    await users.demandPermission(request, "team.board");
    const actor = await users.required(request);
    const input = parseTeamTask(request.body);
    const created = await db.transaction(async (transaction) => {
      const task = await prepare(transaction, input);
      const insert = bind(new sql.Request(transaction), task, actor.id);
      const row = (await insert.query<Row>(`
        INSERT dbo.team_tasks(kind,title,customer_id,start_date,end_date,time_slot,start_time,man_days,status,inquiry_id,project_id,note,created_by)
        OUTPUT inserted.id,inserted.row_version
        VALUES(@kind,@title,@customer,@start,@end,@slot,CONVERT(time(0),@time),@man_days,@status,@inquiry,@project,@note,@actor);`)).recordset[0]!;
      const id = Number(row.id);
      await savePeople(transaction, id, task.assigneeIds);
      await insertAudit(transaction, actor.id, ENTITY, id, "", "Created", null, task);
      await tellPeople(transaction, actor, id, task, task.assigneeIds);
      return { id, rowVersion: (row.row_version as Buffer).toString("base64"), manDays: task.manDays };
    });
    const calendar = await deliverCalendar(db, email, created.id, null, calendarState(input), actor.name);
    reply.code(201);
    return { ...created, calendar };
  });

  app.put("/api/v1/team-tasks/:id", async (request) => {
    await users.demandPermission(request, "team.board");
    const actor = await users.required(request);
    const id = positiveLong((request.params as { id?: string }).id, "Task id");
    const body = bodyObject(request.body);
    const expected = parseRowVersion(body.rowVersion);
    const input = parseTeamTask(body);
    const saved = await db.transaction(async (transaction) => {
      const current = (await new sql.Request(transaction).input("id", sql.BigInt, id).query<Row>(
        "SELECT * FROM dbo.team_tasks WITH(UPDLOCK,HOLDLOCK) WHERE id=@id AND deleted_at IS NULL;")).recordset[0];
      if (!current) throw new ApiError(404, "team_task_not_found", "That task no longer exists.");
      const people = await currentPeople(transaction, id);
      if (!canChangeTeamTask(actor, current, people))
        throw new ApiError(403, "team_task_forbidden", "Only whoever added the task, someone it is for, or a manager can change it.");
      if (!(current.row_version as Buffer).equals(expected))
        throw new ApiError(409, "concurrency_conflict", "Someone changed this task. Reload before saving.");
      const task = await prepare(transaction, input);
      const update = bind(new sql.Request(transaction), task, actor.id).input("id", sql.BigInt, id);
      const row = (await update.query<Row>(`
        UPDATE dbo.team_tasks SET kind=@kind,title=@title,customer_id=@customer,start_date=@start,end_date=@end,
          time_slot=@slot,start_time=CONVERT(time(0),@time),man_days=@man_days,status=@status,inquiry_id=@inquiry,project_id=@project,note=@note,
          updated_by=@actor,updated_at=SYSUTCDATETIME()
        OUTPUT inserted.row_version WHERE id=@id;`)).recordset[0]!;
      await savePeople(transaction, id, task.assigneeIds);
      const before = {
        kind: current.kind, title: current.title, customerId: current.customer_id, assigneeIds: people,
        startDate: dateOnly(current.start_date as Date), endDate: dateOnly(current.end_date as Date), slot: current.time_slot,
        manDays: Number(current.man_days), status: current.status, inquiryId: current.inquiry_id, projectId: current.project_id, note: current.note,
      };
      await insertAudit(transaction, actor.id, ENTITY, id, "", "Updated", before, task);
      // Tell the people who joined; everyone, when the day moved.
      await tellPeople(transaction, actor, id, task,
        before.startDate !== task.startDate ? task.assigneeIds : task.assigneeIds.filter((userId) => !people.includes(userId)));
      return { id, rowVersion: (row.row_version as Buffer).toString("base64"), manDays: task.manDays, before: rowState(current, people) };
    });
    const calendar = await deliverCalendar(db, email, id, saved.before, calendarState(input), actor.name);
    return { id, rowVersion: saved.rowVersion, manDays: saved.manDays, calendar };
  });

  app.delete("/api/v1/team-tasks/:id", async (request) => {
    await users.demandPermission(request, "team.board");
    const actor = await users.required(request);
    const id = positiveLong((request.params as { id?: string }).id, "Task id");
    const expected = parseRowVersion((request.query as Record<string, unknown>).rowVersion);
    const before = await db.transaction(async (transaction) => {
      const current = (await new sql.Request(transaction).input("id", sql.BigInt, id).query<Row>(
        "SELECT * FROM dbo.team_tasks WITH(UPDLOCK,HOLDLOCK) WHERE id=@id AND deleted_at IS NULL;")).recordset[0];
      if (!current) throw new ApiError(404, "team_task_not_found", "That task no longer exists.");
      const people = await currentPeople(transaction, id);
      if (!canChangeTeamTask(actor, current, people))
        throw new ApiError(403, "team_task_forbidden", "Only whoever added the task, someone it is for, or a manager can remove it.");
      if (!(current.row_version as Buffer).equals(expected))
        throw new ApiError(409, "concurrency_conflict", "Someone changed this task. Reload before removing it.");
      // The people stay recorded on the removed task, as its audit trail does.
      await new sql.Request(transaction).input("id", sql.BigInt, id).input("actor", sql.BigInt, actor.id)
        .query("UPDATE dbo.team_tasks SET deleted_at=SYSUTCDATETIME(),updated_by=@actor,updated_at=SYSUTCDATETIME() WHERE id=@id;");
      await insertAudit(transaction, actor.id, ENTITY, id, "", "Deleted", { title: current.title, assigneeIds: people }, null);
      return rowState(current, people);
    });
    const calendar = await deliverCalendar(db, email, id, before, null, actor.name);
    return { id, deleted: true, calendar };
  });

  // Who added and changed a task, newest first, from the audit log.
  app.get("/api/v1/team-tasks/:id/history", async (request) => {
    await users.demandPermission(request, "team.board");
    const id = positiveLong((request.params as { id?: string }).id, "Task id");
    const rows = (await db.query<Row>(`
      SELECT TOP(50) a.id,a.action,a.before_json,a.after_json,a.occurred_at,u.name actor_name
      FROM dbo.audit_log a JOIN dbo.users u ON u.id=a.actor_id
      WHERE a.entity_type=@type AND a.entity_id=@id ORDER BY a.occurred_at DESC,a.id DESC;`,
    (q) => q.input("type", sql.NVarChar(50), ENTITY).input("id", sql.BigInt, id))).recordset;
    const json = (value: unknown) => { try { return value ? JSON.parse(String(value)) : null; } catch { return null; } };
    return rows.map((r) => ({ id: Number(r.id), action: String(r.action), actor: String(r.actor_name ?? ""), at: r.occurred_at, before: json(r.before_json), after: json(r.after_json) }));
  });
}
