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
import { calendarActions, repeatText, type CalendarState } from "../team-calendar.js";
import { boardOutlookEvents, outlookStatus, refreshOutlookIfStale, syncOutlook } from "../outlook-calendar.js";
import { rolesOf } from "../user-roles.js";
import {
  maskWeekdays, ownState, parseRepeat, parseTemplate, repeatDates, ruleDates, seriesState, templateState, weekdayMask,
  type Occurrence, type SeriesRecord, type SeriesTemplate, type TeamTaskRepeat,
} from "../team-task-series.js";

// The team board (owner decision 2026-10-21): everyone's work on one page, so that a customer who calls to book can be
// given a day at once, and work the system does not know yet (an appointment, a task, a day away) can be added with a
// subject and a date and adjusted later. Everyone with team.board sees everyone's load; the details of work outside
// their own access are left out.

type Row = Record<string, unknown>;
export const TEAM_TASK_KINDS = ["Appointment", "Task", "Away"] as const;
/** A whole day, a morning, an afternoon, or the task's own time range (startTime–endTime). */
export const TEAM_TASK_SLOTS = ["Day", "AM", "PM", "Time"] as const;
export const TEAM_TASK_STATUSES = ["Planned", "Done", "Cancelled"] as const;
/** Online: the place is the meeting's link. Offline: the room or site. */
export const MEETING_MODES = ["Online", "Offline"] as const;
/** A change to one day of a series, or to that day and every one after it. */
export const APPLY_TO = ["this", "following"] as const;
const ENTITY = "Team Task";
const SERIES_ENTITY = "Team Task Series";
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
  /** Only for the Time slot: from startTime on the first day until endTime on the last. */
  startTime: string | null;
  endTime: string | null;
  /** Null: work it out from the days (a whole day is 1 MD, a morning or an afternoon 0.5). */
  manDays: number | null;
  status: (typeof TEAM_TASK_STATUSES)[number];
  inquiryId: number | null;
  projectId: number | null;
  note: string;
  meetingMode: (typeof MEETING_MODES)[number] | null;
  meetingPlace: string;
  /** Null: it happens once. Otherwise a one-day task saved again on every day the repeat falls on. */
  repeat: TeamTaskRepeat | null;
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
  const slot = choice(body.slot, TEAM_TASK_SLOTS, "Day", "Time of day");
  const time = (value: unknown, label: string) => {
    if (value === undefined || value === null || value === "") return null;
    if (typeof value !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new ApiError(400, "validation_failed", `${label} must be HH:MM.`);
    return value;
  };
  // Times belong to the Time slot only; a whole day, a morning or an afternoon has fixed hours.
  const startTime = slot === "Time" ? time(body.startTime, "The start time") : null;
  const endTime = slot === "Time" ? time(body.endTime, "The end time") : null;
  if (slot === "Time" && (!startTime || !endTime)) throw new ApiError(400, "validation_failed", "Enter the time from and until.");
  if (slot === "Time" && endDate === startDate && endTime! <= startTime!)
    throw new ApiError(400, "validation_failed", "The end time must be after the start time.");
  let manDays: number | null = null;
  if (body.manDays !== undefined && body.manDays !== null && body.manDays !== "") {
    const amount = body.manDays;
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0 || amount > 999 || Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-6)
      throw new ApiError(400, "validation_failed", "Man-days must be between 0 and 999 with at most two decimals.");
    manDays = amount;
  }
  // Where a meeting is held; a day away is held nowhere.
  const meetingMode = kind === "Away" || body.meetingMode === undefined || body.meetingMode === null || body.meetingMode === ""
    ? null : choice(body.meetingMode, MEETING_MODES, "Online", "Meeting");
  return {
    kind,
    title: requiredText(body.title, 300, "Subject"),
    customerId: optionalId(body.customerId, "Customer"),
    assigneeIds,
    startDate,
    endDate,
    slot,
    startTime,
    endTime,
    // A day away takes nobody's effort.
    manDays: kind === "Away" ? 0 : manDays,
    status: choice(body.status, TEAM_TASK_STATUSES, "Planned", "Status"),
    inquiryId: optionalId(body.inquiryId, "RFQ"),
    projectId: optionalId(body.projectId, "Project"),
    note: optionalBodyText(body.note, 2000, "Note") ?? "",
    meetingMode,
    meetingPlace: meetingMode ? optionalBodyText(body.meetingPlace, 500, "Meeting place") ?? "" : "",
    repeat: parseRepeat(body.repeat, startDate, endDate),
  };
}

/** Whether a change is for one day of a series (the default) or for that day and every one after it. */
export const parseApplyTo = (value: unknown) => choice(value, APPLY_TO, "this", "Apply to");

/**
 * The effort a task takes when nobody entered one: each working day in it, whole or half (a task on a day off counts
 * its calendar days). A one-day time range counts its hours against an 8-hour day, lunch (12:00–13:00) left out,
 * to the nearest quarter day and at least one quarter.
 */
export function defaultManDays(task: Pick<TeamTaskInput, "kind" | "startDate" | "endDate" | "slot"> & Partial<Pick<TeamTaskInput, "startTime" | "endTime">>, holidays: ReadonlySet<string>) {
  if (task.kind === "Away") return 0;
  if (task.slot === "Time" && task.startDate === task.endDate && task.startTime && task.endTime) return timeRangeManDays(task.startTime, task.endTime);
  const share = task.slot === "AM" || task.slot === "PM" ? 0.5 : 1;
  let working = 0;
  const from = dayNumber(task.startDate), to = dayNumber(task.endDate);
  for (let d = from; d <= to; d++) {
    const date = new Date(d * DAY), weekday = date.getUTCDay();
    if (weekday !== 0 && weekday !== 6 && !holidays.has(date.toISOString().slice(0, 10))) working++;
  }
  return (working || to - from + 1) * share;
}

const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
/** Man-days for a time range on one day: its minutes less any lunch hour, over 480, to the nearest quarter (at least 0.25). */
export function timeRangeManDays(startTime: string, endTime: string) {
  const from = minutesOf(startTime), until = minutesOf(endTime);
  const lunch = Math.max(0, Math.min(until, 13 * 60) - Math.max(from, 12 * 60));
  return Math.max(0.25, Math.round(((until - from - lunch) / 480) * 4) / 4);
}

/** Who may change or remove a team task: whoever added it, anyone it is for, and Admin / Engineering / Project Managers. */
/**
 * Who may put work on someone else's row (owner decision 2026-10-28): Admins, Leaders and managers (any role named
 * "... Manager"). Everyone else adds work for themselves, or for nobody yet.
 */
export const canAssignOthers = (actor: CurrentUser) => rolesOf(actor).some((role) => role === "Admin" || role === "Leader" || /manager$/i.test(role));

/** Refuses a save that puts someone new on a task, other than the actor, unless the actor may assign others. */
export function assertMayAssign(actor: CurrentUser, assigneeIds: readonly number[], already: readonly number[] = []) {
  if (canAssignOthers(actor)) return;
  if (assigneeIds.some((id) => id !== actor.id && !already.includes(id)))
    throw new ApiError(403, "team_task_assign_forbidden", "Only Admins, Managers and Leaders can add work for someone else. Add it for yourself.");
}

export const canChangeTeamTask = (actor: CurrentUser, task: Row, assigneeIds: readonly number[]) =>
  Number(task.created_by) === actor.id || assigneeIds.includes(actor.id) || isProjectManagerRole(actor);

/** A task's people from STRING_AGG ("7,9"), in the order chosen. */
const idList = (value: unknown) => (value ? String(value).split(",").map(Number).filter((id) => Number.isSafeInteger(id) && id > 0) : []);

/** Work the caller may not open still shows when and how much; what it is, and for whom, is left out. */
export function redactWork(item: WorkloadItem): WorkloadItem {
  if (!item.hidden) return item;
  return {
    key: item.key, workKey: item.workKey, ...(item.group ? { group: item.group } : {}), type: item.type, entityId: 0, ownerId: item.ownerId, reference: "", title: "", customer: "",
    start: item.start, end: item.end, manDays: item.manDays, progress: item.progress, status: item.status, hidden: true,
    ...(item.tentative ? { tentative: true } : {}),
  };
}

const TEAM_TASK_COLUMNS = `t.id,t.kind,t.title,t.customer_id,c.name customer_name,
        (SELECT STRING_AGG(CONVERT(nvarchar(20),a.user_id),N',') WITHIN GROUP (ORDER BY a.sort_order,a.user_id)
          FROM dbo.team_task_assignees a WHERE a.task_id=t.id) assignee_ids,t.start_date,t.end_date,t.time_slot,
        CONVERT(char(5),t.start_time,108) start_time,CONVERT(char(5),t.end_time,108) end_time,t.man_days,t.status,t.inquiry_id,i.inquiry_no,t.project_id,p.project_no,t.note,
        t.created_by,cu.name created_by_name,t.created_at,t.row_version,t.meeting_mode,t.meeting_place,
        t.series_id,t.occurrence_date,s.repeat_rule,s.weekdays repeat_weekdays,s.until_date repeat_until
      FROM dbo.team_tasks t
      LEFT JOIN dbo.team_task_series s ON s.id=t.series_id
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
        -- Planned work from before the window stays in view until someone closes it; a past day of a repeat is history.
        OR (t.status=N'Planned' AND t.kind<>N'Away' AND t.end_date<@from AND t.series_id IS NULL))
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
    endTime: r.end_time ? String(r.end_time).trim() : null,
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
    meetingMode: r.meeting_mode ? String(r.meeting_mode) : null,
    meetingPlace: String(r.meeting_place ?? ""),
    /** The series a day of a repeat belongs to, and its rule; null for a task that happens once. */
    seriesId: r.series_id === null || r.series_id === undefined ? null : Number(r.series_id),
    repeat: r.repeat_rule ? { rule: String(r.repeat_rule), weekdays: maskWeekdays(Number(r.repeat_weekdays)), until: dateOnly(r.repeat_until as Date | string) } : null,
  };
}

/**
 * Checks that what a task points at exists, and works out its effort when none was entered. The holidays cover every
 * day a repeat could fall on.
 */
async function prepare(transaction: TransactionType, input: TeamTaskInput) {
  const q = new sql.Request(transaction);
  q.input("customer", sql.BigInt, input.customerId).input("people", sql.NVarChar(sql.MAX), JSON.stringify(input.assigneeIds))
    .input("people_count", sql.Int, input.assigneeIds.length)
    .input("inquiry", sql.BigInt, input.inquiryId).input("project", sql.BigInt, input.projectId)
    .input("start", sql.Date, input.startDate).input("end", sql.Date, input.repeat?.until ?? input.endDate);
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
  return { task: { ...input, manDays: input.manDays ?? defaultManDays(input, holidays) }, holidays };
}

const bind = (q: sql.Request, task: TeamTaskInput & { manDays: number }, actor: number) => q
  .input("kind", sql.NVarChar(20), task.kind).input("title", sql.NVarChar(300), task.title)
  .input("customer", sql.BigInt, task.customerId)
  .input("start", sql.Date, task.startDate).input("end", sql.Date, task.endDate)
  .input("slot", sql.NVarChar(10), task.slot).input("time", sql.NVarChar(5), task.startTime).input("end_time", sql.NVarChar(5), task.endTime)
  .input("man_days", sql.Decimal(6, 2), task.manDays).input("status", sql.NVarChar(20), task.status)
  .input("inquiry", sql.BigInt, task.inquiryId).input("project", sql.BigInt, task.projectId)
  .input("note", sql.NVarChar(2000), task.note).input("mode", sql.NVarChar(10), task.meetingMode).input("place", sql.NVarChar(500), task.meetingPlace)
  .input("actor", sql.BigInt, actor);

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

/** Tells the people a task was given to, except whoever gave it; `when` says it for a repeat. */
async function tellPeople(transaction: TransactionType, actor: CurrentUser, id: number, task: TeamTaskInput, userIds: readonly number[], when = "") {
  const recipients = userIds.filter((userId) => userId !== actor.id);
  if (!recipients.length || task.status !== "Planned") return;
  const days = when || (task.endDate === task.startDate ? task.startDate : `${task.startDate} → ${task.endDate}`);
  await notifyUsers(transaction, recipients, "TEAM_TASK_ASSIGNED", task.title.slice(0, 300),
    `${days}${task.startTime ? ` ${task.startTime}–${task.endTime}` : ""} · ${actor.name}`, "TeamTask", id, `team-task-${id}-${task.startDate}`);
}

/** A task's state as the calendar sees it; the customer by id, so a rename elsewhere sends nothing. */
const calendarState = (task: { kind: string; title: string; customerId: number | null; note: string; startDate: string; endDate: string; slot: string; startTime: string | null; endTime: string | null; assigneeIds: number[]; status: string; meetingMode: string | null; meetingPlace: string }): CalendarState => ({
  kind: task.kind as CalendarState["kind"], title: task.title, customer: task.customerId === null ? "" : String(task.customerId), note: task.note,
  startDate: task.startDate, endDate: task.endDate, slot: task.slot as CalendarState["slot"], startTime: task.startTime, endTime: task.endTime, assigneeIds: task.assigneeIds, status: task.status,
  meetingMode: (task.meetingMode as CalendarState["meetingMode"]) ?? null, meetingPlace: task.meetingPlace,
});
/** A time(0) column as HH:MM; the driver returns it as a Date on 1970-01-01 UTC. */
const clock = (value: unknown) => (value ? (value instanceof Date ? value.toISOString().slice(11, 16) : String(value).slice(0, 5)) : null);
const rowState = (r: Row, assigneeIds: number[]) => calendarState({
  kind: String(r.kind), title: String(r.title), customerId: r.customer_id === null || r.customer_id === undefined ? null : Number(r.customer_id), note: String(r.note ?? ""),
  startDate: dateOnly(r.start_date as Date)!, endDate: dateOnly(r.end_date as Date)!, slot: String(r.time_slot ?? "Day"),
  startTime: clock(r.start_time), endTime: clock(r.end_time),
  assigneeIds, status: String(r.status), meetingMode: r.meeting_mode ? String(r.meeting_mode) : null, meetingPlace: String(r.meeting_place ?? ""),
});
const seriesOf = (r: Row) => (r.series_id === null || r.series_id === undefined ? null : Number(r.series_id));

/** What the person's Outlook got: "none" when nothing needed sending. */
export type CalendarDelivery = "none" | "sent" | "disabled" | "failed";
/** One Outlook entry, from what it said before a change (null: new) to what it says after (null: removed). */
type Delivery = { id: number; before: CalendarState | null; after: CalendarState | null };

/**
 * Sends the Outlook messages a change calls for, after it is saved: one request to everyone on the task, carrying it
 * as it is now, and one cancellation to whoever it no longer includes, carrying it as they had it. Delivery never
 * undoes the save. A series' entry (its state carries the rule) goes under the series' own UID.
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
        startDate: state.startDate, endDate: state.endDate, slot: state.slot, startTime: state.startTime, endTime: state.endTime,
        meetingMode: state.meetingMode ?? null, meetingPlace: state.meetingPlace ?? "", repeat: state.repeat ?? null },
    });
    results.push(result.status);
  }
  return worst(results);
}
const worst = (results: readonly CalendarDelivery[]): CalendarDelivery =>
  results.includes("failed") ? "failed" : results.includes("disabled") ? "disabled" : results.includes("sent") ? "sent" : "none";

/** Every entry a change touched, one after another; the result is the worst of them. */
async function deliverAll(db: Database, email: Pick<EmailService, "sendTeamTaskCalendar">, deliveries: readonly Delivery[], sentBy: string) {
  const results: CalendarDelivery[] = [];
  for (const delivery of deliveries) results.push(await deliverCalendar(db, email, delivery.id, delivery.before, delivery.after, sentBy));
  return worst(results);
}

/** A series and its days as saved, for its Outlook entry before and after a change. */
async function readSeries(transaction: TransactionType, seriesId: number): Promise<{ series: SeriesRecord; days: Occurrence[] } | null> {
  const result = await new sql.Request(transaction).input("series", sql.BigInt, seriesId).query<Row>(`
    SELECT id,weekdays,first_date,until_date,template_json FROM dbo.team_task_series WITH(UPDLOCK,HOLDLOCK) WHERE id=@series;
    SELECT t.id,t.kind,t.title,t.customer_id,t.note,t.start_date,t.end_date,t.time_slot,t.start_time,t.end_time,t.status,t.occurrence_date,t.meeting_mode,t.meeting_place,
      (SELECT STRING_AGG(CONVERT(nvarchar(20),a.user_id),N',') WITHIN GROUP (ORDER BY a.sort_order,a.user_id)
        FROM dbo.team_task_assignees a WHERE a.task_id=t.id) assignee_ids
    FROM dbo.team_tasks t WHERE t.series_id=@series AND t.deleted_at IS NULL ORDER BY t.occurrence_date,t.id;`);
  const [seriesRows = [], dayRows = []] = result.recordsets as unknown as Row[][];
  const r = seriesRows[0];
  if (!r) return null;
  return {
    series: { id: Number(r.id), weekdays: maskWeekdays(Number(r.weekdays)), firstDate: dateOnly(r.first_date as Date)!, until: dateOnly(r.until_date as Date)!, template: parseTemplate(r.template_json) },
    days: dayRows.map((day) => ({ ...rowState(day, idList(day.assignee_ids)), id: Number(day.id), occurrenceDate: dateOnly(day.occurrence_date as Date)! })),
  };
}

/** The series' entry and one day's own entry, from before a change to after it. */
function seriesDeliveries(before: { series: SeriesRecord; days: Occurrence[] } | null, after: { series: SeriesRecord; days: Occurrence[] } | null, dayIds: readonly number[]): Delivery[] {
  const template = before?.series.template ?? after?.series.template ?? null;
  const seriesId = before?.series.id ?? after?.series.id;
  const day = (state: { days: Occurrence[] } | null, id: number) => state?.days.find((entry) => entry.id === id);
  return [
    ...(seriesId === undefined ? [] : [{ id: seriesId, before: before ? seriesState(before.series, before.days) : null, after: after ? seriesState(after.series, after.days) : null }]),
    ...dayIds.map((id) => {
      const was = day(before, id), now = day(after, id);
      return { id, before: was ? ownState(template, was) : null, after: now ? ownState(template, now) : null };
    }),
  ];
}

/** Adds a task that happens once. */
async function createSingle(transaction: TransactionType, actor: CurrentUser, input: TeamTaskInput) {
  const { task } = await prepare(transaction, input);
  const insert = bind(new sql.Request(transaction), task, actor.id);
  const row = (await insert.query<Row>(`
    INSERT dbo.team_tasks(kind,title,customer_id,start_date,end_date,time_slot,start_time,end_time,man_days,status,inquiry_id,project_id,note,meeting_mode,meeting_place,created_by)
    OUTPUT inserted.id,inserted.row_version
    VALUES(@kind,@title,@customer,@start,@end,@slot,CONVERT(time(0),@time),CONVERT(time(0),@end_time),@man_days,@status,@inquiry,@project,@note,@mode,@place,@actor);`)).recordset[0]!;
  const id = Number(row.id);
  await savePeople(transaction, id, task.assigneeIds);
  await insertAudit(transaction, actor.id, ENTITY, id, "", "Created", null, task);
  await tellPeople(transaction, actor, id, task, task.assigneeIds);
  return {
    result: { id, rowVersion: (row.row_version as Buffer).toString("base64"), manDays: task.manDays },
    deliveries: [{ id, before: null, after: calendarState(input) }] as Delivery[],
  };
}

/**
 * Adds a repeating task: its series, then the task again on every day the repeat falls on (company holidays and the
 * days in `skip` left out), each with the same people. The people are told once, and Outlook gets one entry.
 */
async function createSeries(transaction: TransactionType, actor: CurrentUser, input: TeamTaskInput, skip: ReadonlySet<string> = new Set()) {
  const repeat = input.repeat!;
  const { task, holidays } = await prepare(transaction, input);
  const dates = repeatDates(input.startDate, repeat, holidays).filter((date) => !skip.has(date));
  if (!dates.length) throw new ApiError(400, "validation_failed", "No working day from the start until the repeat ends falls on the days chosen.");
  // Outlook's series starts on the rule's first day, even a holiday (that day is left out of it).
  const firstDate = ruleDates(input.startDate, repeat.until, repeat.weekdays)[0]!;
  const template: SeriesTemplate = {
    kind: task.kind, title: task.title, customerId: task.customerId, assigneeIds: task.assigneeIds, slot: task.slot, startTime: task.startTime, endTime: task.endTime,
    manDays: task.manDays, inquiryId: task.inquiryId, projectId: task.projectId, note: task.note, meetingMode: task.meetingMode, meetingPlace: task.meetingPlace,
  };
  const rows = (await bind(new sql.Request(transaction), task, actor.id)
    .input("rule", sql.NVarChar(10), repeat.rule).input("weekdays", sql.TinyInt, weekdayMask(repeat.weekdays))
    .input("first", sql.Date, firstDate).input("until", sql.Date, repeat.until)
    .input("template", sql.NVarChar(sql.MAX), JSON.stringify(template))
    .input("dates", sql.NVarChar(sql.MAX), JSON.stringify(dates))
    .input("people", sql.NVarChar(sql.MAX), JSON.stringify(task.assigneeIds))
    .query<Row>(`
    DECLARE @series TABLE(id bigint NOT NULL);
    DECLARE @made TABLE(id bigint NOT NULL);
    INSERT dbo.team_task_series(repeat_rule,weekdays,first_date,until_date,template_json,created_by)
    OUTPUT inserted.id INTO @series
    VALUES(@rule,@weekdays,@first,@until,@template,@actor);
    INSERT dbo.team_tasks(kind,title,customer_id,start_date,end_date,time_slot,start_time,end_time,man_days,status,inquiry_id,project_id,note,meeting_mode,meeting_place,series_id,occurrence_date,created_by)
    OUTPUT inserted.id INTO @made
    SELECT @kind,@title,@customer,d.[day],d.[day],@slot,CONVERT(time(0),@time),CONVERT(time(0),@end_time),@man_days,@status,@inquiry,@project,@note,@mode,@place,
      (SELECT id FROM @series),d.[day],@actor
    FROM OPENJSON(@dates) WITH ([day] date '$') d;
    INSERT dbo.team_task_assignees(task_id,user_id,sort_order)
    SELECT m.id,CONVERT(bigint,people.[value]),CONVERT(int,people.[key])+1 FROM @made m CROSS JOIN OPENJSON(@people) people;
    SELECT (SELECT id FROM @series) series_id,t.id,t.occurrence_date,t.row_version
    FROM dbo.team_tasks t JOIN @made m ON m.id=t.id ORDER BY t.occurrence_date;`)).recordset;
  const first = rows[0];
  if (!first) throw new ApiError(500, "team_task_series_failed", "The repeating task could not be saved.");
  const seriesId = Number(first.series_id);
  await insertAudit(transaction, actor.id, SERIES_ENTITY, seriesId, "", "Created", null, { ...template, repeat, days: dates.length });
  await tellPeople(transaction, actor, Number(first.id), task, task.assigneeIds, `${dates[0]} → ${dates.at(-1)} · ${repeatText(repeat.weekdays)}`);
  const series: SeriesRecord = { id: seriesId, weekdays: repeat.weekdays, firstDate, until: repeat.until, template };
  const days: Occurrence[] = rows.map((r) => {
    const date = dateOnly(r.occurrence_date as Date)!;
    return { ...templateState(template, date), status: task.status, id: Number(r.id), occurrenceDate: date };
  });
  return {
    result: { id: Number(first.id), rowVersion: (first.row_version as Buffer).toString("base64"), manDays: task.manDays, seriesId, count: rows.length },
    deliveries: [{ id: seriesId, before: null, after: seriesState(series, days) }] as Delivery[],
  };
}

/** Removes a task (it stays in the database with its people, as its audit trail does). */
async function removeTask(transaction: TransactionType, actor: CurrentUser, id: number, title: unknown, people: readonly number[]) {
  await new sql.Request(transaction).input("id", sql.BigInt, id).input("actor", sql.BigInt, actor.id)
    .query("UPDATE dbo.team_tasks SET deleted_at=SYSUTCDATETIME(),updated_by=@actor,updated_at=SYSUTCDATETIME() WHERE id=@id;");
  await insertAudit(transaction, actor.id, ENTITY, id, "", "Deleted", { title, assigneeIds: people }, null);
}

/**
 * Ends a series before a day: that day and every later one go (one already done stays, unless it is `selfId`), and
 * the series now ends on its last day left. Returns what Outlook needs and the done days kept, which a series added in
 * its place leaves out.
 */
async function endSeries(transaction: TransactionType, actor: CurrentUser, seriesId: number, from: string, selfId: number) {
  const before = await readSeries(transaction, seriesId);
  const goes = (day: Occurrence) => day.occurrenceDate >= from && (day.status !== "Done" || day.id === selfId);
  const removed = (before?.days ?? []).filter(goes);
  await new sql.Request(transaction).input("series", sql.BigInt, seriesId).input("from", sql.Date, from).input("self", sql.BigInt, selfId).input("actor", sql.BigInt, actor.id).query(`
    UPDATE dbo.team_tasks SET deleted_at=SYSUTCDATETIME(),updated_by=@actor,updated_at=SYSUTCDATETIME()
    WHERE series_id=@series AND deleted_at IS NULL AND occurrence_date>=@from AND (status<>N'Done' OR id=@self);
    UPDATE s SET until_date=COALESCE(last_day.[day],s.until_date),updated_by=@actor,updated_at=SYSUTCDATETIME()
    FROM dbo.team_task_series s
    OUTER APPLY (SELECT MAX(t.occurrence_date) [day] FROM dbo.team_tasks t WHERE t.series_id=s.id AND t.deleted_at IS NULL) last_day
    WHERE s.id=@series;`);
  await insertAudit(transaction, actor.id, SERIES_ENTITY, seriesId, "", "Ended", { until: before?.series.until ?? null }, { from, removed: removed.length });
  const after = await readSeries(transaction, seriesId);
  return {
    deliveries: seriesDeliveries(before, after, removed.map((day) => day.id)),
    kept: new Set((before?.days ?? []).filter((day) => day.occurrenceDate >= from && !goes(day)).map((day) => day.occurrenceDate)),
  };
}

type BoardMail = Pick<EmailService, "sendTeamTaskCalendar"> & Partial<Pick<EmailService, "graphGet" | "graphEnabled" | "graphSender">>;
/** The Graph reads for Outlook calendars; a mail service without them (a test harness) has Outlook switched off. */
const graphOf = (email: BoardMail): Pick<EmailService, "graphGet" | "graphEnabled"> & Partial<Pick<EmailService, "graphSender">> =>
  typeof email.graphGet === "function" ? email as Pick<EmailService, "graphGet" | "graphEnabled"> & Partial<Pick<EmailService, "graphSender">>
    : { graphEnabled: false, graphGet: () => Promise.reject(new Error("Microsoft Graph is not configured.")) };

/** The days of repeats on the board, each counted on its own day for each of its people (the workload counts a series as one piece of work). */
export function seriesDayItems(taskRows: readonly Row[]): WorkloadItem[] {
  return taskRows.filter((r) => seriesOf(r) !== null && r.status === "Planned" && (r.kind === "Appointment" || r.kind === "Task")).flatMap((r) => {
    const people = idList(r.assignee_ids);
    return (people.length ? people : [null]).map((ownerId): WorkloadItem => ({
      key: `TeamTask-${Number(r.id)}-${ownerId ?? "none"}`, workKey: `TeamTask-${Number(r.id)}`, type: "Task", entityId: Number(r.id), ownerId,
      reference: "", title: String(r.title ?? ""), customer: String(r.customer_name ?? ""),
      start: dateOnly(r.start_date as Date), end: dateOnly(r.end_date as Date), manDays: Number(r.man_days ?? 0), progress: 0, status: "Planned",
      taskKind: r.kind === "Appointment" ? "Appointment" : "Task", repeat: true,
    }));
  });
}

export function registerTeamBoardRoutes(app: FastifyInstance, db: Database, users: CurrentUserService, email: BoardMail) {
  const graph = graphOf(email);
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
    // Outlook: the copy read last time, and a fresh read in the background when that one is old.
    refreshOutlookIfStale(db, graph);
    const outlook = graph.graphEnabled ? await boardOutlookEvents(db, from, to) : [];
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
      // A repeat counts day by day here, on the days in the window.
      items: [...work.items.filter((item) => !item.workKey.startsWith("TeamSeries-")), ...seriesDayItems(taskRows)].map(redactWork),
      warnings: work.warnings,
      tasks: taskRows.map((r) => teamTaskDto(r, can)),
      visits: [...visits.values()],
      away: awayRows.map((r) => ({ id: Number(r.id), userId: Number(r.user_id), kind: String(r.kind), start: dateOnly(r.start_date as Date), end: dateOnly(r.end_date as Date) })),
      /** Admin, Engineering and Project Managers may change anyone's team task. */
      canChangeAll: isProjectManagerRole(actor),
      /** Admins, Leaders and managers may add work for someone else; everyone else for themselves. */
      canAssignOthers: canAssignOthers(actor),
      outlook,
      outlookSync: outlookStatus(),
    };
  });

  // "Sync Outlook" on the board: reads everyone's calendar now (or returns the read a minute ago) and says how it went.
  app.post("/api/v1/team-board/outlook-sync", async (request) => {
    await users.demandPermission(request, "team.board");
    return syncOutlook(db, graph);
  });

  app.post("/api/v1/team-tasks", async (request, reply) => {
    await users.demandPermission(request, "team.board");
    const actor = await users.required(request);
    const input = parseTeamTask(request.body);
    assertMayAssign(actor, input.assigneeIds);
    // Owner decision 2026-10-28: new work says briefly what it is; a day away needs no detail.
    if (input.kind !== "Away" && !input.note.trim()) throw new ApiError(400, "validation_failed", "Describe the work briefly.");
    const created = await db.transaction((transaction) => (input.repeat ? createSeries(transaction, actor, input) : createSingle(transaction, actor, input)));
    const calendar = await deliverAll(db, email, created.deliveries, actor.name);
    reply.code(201);
    return { ...created.result, calendar };
  });

  app.put("/api/v1/team-tasks/:id", async (request) => {
    await users.demandPermission(request, "team.board");
    const actor = await users.required(request);
    const id = positiveLong((request.params as { id?: string }).id, "Task id");
    const body = bodyObject(request.body);
    const expected = parseRowVersion(body.rowVersion);
    const applyTo = parseApplyTo(body.applyTo);
    const input = parseTeamTask(body);
    const saved = await db.transaction(async (transaction) => {
      const current = (await new sql.Request(transaction).input("id", sql.BigInt, id).query<Row>(
        "SELECT * FROM dbo.team_tasks WITH(UPDLOCK,HOLDLOCK) WHERE id=@id AND deleted_at IS NULL;")).recordset[0];
      if (!current) throw new ApiError(404, "team_task_not_found", "That task no longer exists.");
      const people = await currentPeople(transaction, id);
      if (!canChangeTeamTask(actor, current, people))
        throw new ApiError(403, "team_task_forbidden", "Only whoever added the task, someone it is for, or a manager can change it.");
      // People already on it may stay; adding someone else needs an Admin, a Manager or a Leader.
      assertMayAssign(actor, input.assigneeIds, people);
      if (!(current.row_version as Buffer).equals(expected))
        throw new ApiError(409, "concurrency_conflict", "Someone changed this task. Reload before saving.");
      const seriesId = seriesOf(current);

      // This day only: the task itself changes (a day of a repeat keeps its place in the series).
      if (!(applyTo === "following" && seriesId !== null) && !(seriesId === null && input.repeat)) {
        const before = seriesId === null ? null : await readSeries(transaction, seriesId);
        const { task } = await prepare(transaction, { ...input, repeat: null });
        const update = bind(new sql.Request(transaction), task, actor.id).input("id", sql.BigInt, id);
        const row = (await update.query<Row>(`
          UPDATE dbo.team_tasks SET kind=@kind,title=@title,customer_id=@customer,start_date=@start,end_date=@end,
            time_slot=@slot,start_time=CONVERT(time(0),@time),end_time=CONVERT(time(0),@end_time),man_days=@man_days,status=@status,inquiry_id=@inquiry,project_id=@project,note=@note,
            meeting_mode=@mode,meeting_place=@place,updated_by=@actor,updated_at=SYSUTCDATETIME()
          OUTPUT inserted.row_version WHERE id=@id;`)).recordset[0]!;
        await savePeople(transaction, id, task.assigneeIds);
        const was = {
          kind: current.kind, title: current.title, customerId: current.customer_id, assigneeIds: people,
          startDate: dateOnly(current.start_date as Date), endDate: dateOnly(current.end_date as Date), slot: current.time_slot, startTime: clock(current.start_time), endTime: clock(current.end_time),
          manDays: Number(current.man_days), status: current.status, inquiryId: current.inquiry_id, projectId: current.project_id, note: current.note,
          meetingMode: current.meeting_mode ?? null, meetingPlace: current.meeting_place ?? "",
        };
        await insertAudit(transaction, actor.id, ENTITY, id, "", "Updated", was, task);
        // Tell the people who joined; everyone, when the day moved.
        await tellPeople(transaction, actor, id, task,
          was.startDate !== task.startDate ? task.assigneeIds : task.assigneeIds.filter((userId) => !people.includes(userId)));
        const deliveries = seriesId === null
          ? [{ id, before: rowState(current, people), after: calendarState(task) }]
          : seriesDeliveries(before, await readSeries(transaction, seriesId), [id]);
        return { result: { id, rowVersion: (row.row_version as Buffer).toString("base64"), manDays: task.manDays }, deliveries };
      }

      // A task made to repeat, or a change to this day of a repeat and every one after it: the old ones end here, and
      // the change is added in their place, as a new series (or a single task, when it no longer repeats).
      const deliveries: Delivery[] = [];
      let skip: ReadonlySet<string> = new Set();
      if (seriesId === null) {
        await removeTask(transaction, actor, id, current.title, people);
        deliveries.push({ id, before: rowState(current, people), after: null });
      } else {
        const ended = await endSeries(transaction, actor, seriesId, dateOnly(current.occurrence_date as Date)!, id);
        deliveries.push(...ended.deliveries);
        skip = ended.kept;
      }
      const created = input.repeat ? await createSeries(transaction, actor, input, skip) : await createSingle(transaction, actor, input);
      return { result: { ...created.result, replaced: true }, deliveries: [...deliveries, ...created.deliveries] };
    });
    const calendar = await deliverAll(db, email, saved.deliveries, actor.name);
    return { ...saved.result, calendar };
  });

  app.delete("/api/v1/team-tasks/:id", async (request) => {
    await users.demandPermission(request, "team.board");
    const actor = await users.required(request);
    const id = positiveLong((request.params as { id?: string }).id, "Task id");
    const query = request.query as Record<string, unknown>;
    const expected = parseRowVersion(query.rowVersion);
    const applyTo = parseApplyTo(query.applyTo);
    const deliveries = await db.transaction(async (transaction) => {
      const current = (await new sql.Request(transaction).input("id", sql.BigInt, id).query<Row>(
        "SELECT * FROM dbo.team_tasks WITH(UPDLOCK,HOLDLOCK) WHERE id=@id AND deleted_at IS NULL;")).recordset[0];
      if (!current) throw new ApiError(404, "team_task_not_found", "That task no longer exists.");
      const people = await currentPeople(transaction, id);
      if (!canChangeTeamTask(actor, current, people))
        throw new ApiError(403, "team_task_forbidden", "Only whoever added the task, someone it is for, or a manager can remove it.");
      if (!(current.row_version as Buffer).equals(expected))
        throw new ApiError(409, "concurrency_conflict", "Someone changed this task. Reload before removing it.");
      const seriesId = seriesOf(current);
      if (seriesId === null) {
        await removeTask(transaction, actor, id, current.title, people);
        return [{ id, before: rowState(current, people), after: null }] as Delivery[];
      }
      // This day and every one after it: the repeat ends before it.
      if (applyTo === "following") return (await endSeries(transaction, actor, seriesId, dateOnly(current.occurrence_date as Date)!, id)).deliveries;
      const before = await readSeries(transaction, seriesId);
      await removeTask(transaction, actor, id, current.title, people);
      return seriesDeliveries(before, await readSeries(transaction, seriesId), [id]);
    });
    const calendar = await deliverAll(db, email, deliveries, actor.name);
    return { id, deleted: true, calendar };
  });

  // Who added and changed a task, newest first, from the audit log; a day of a repeat includes its series' entries.
  app.get("/api/v1/team-tasks/:id/history", async (request) => {
    await users.demandPermission(request, "team.board");
    const id = positiveLong((request.params as { id?: string }).id, "Task id");
    const rows = (await db.query<Row>(`
      SELECT TOP(50) a.id,a.entity_type,a.action,a.before_json,a.after_json,a.occurred_at,u.name actor_name
      FROM dbo.audit_log a JOIN dbo.users u ON u.id=a.actor_id
      WHERE (a.entity_type=@type AND a.entity_id=@id)
        OR (a.entity_type=@series_type AND a.entity_id=(SELECT t.series_id FROM dbo.team_tasks t WHERE t.id=@id))
      ORDER BY a.occurred_at DESC,a.id DESC;`,
    (q) => q.input("type", sql.NVarChar(50), ENTITY).input("series_type", sql.NVarChar(50), SERIES_ENTITY).input("id", sql.BigInt, id))).recordset;
    const json = (value: unknown) => { try { return value ? JSON.parse(String(value)) : null; } catch { return null; } };
    return rows.map((r) => ({
      id: Number(r.id), action: String(r.action), actor: String(r.actor_name ?? ""), at: r.occurred_at, before: json(r.before_json), after: json(r.after_json),
      ...(r.entity_type === SERIES_ENTITY ? { series: true } : {}),
    }));
  });
}
