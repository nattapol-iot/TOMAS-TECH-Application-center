import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import sql from "mssql";
import type { Database } from "../src/db.js";
import { registerErrorHandler } from "../src/errors.js";
import type { CurrentUser } from "../src/types.js";
import type { CurrentUserService } from "../src/users.js";
import type { WorkloadItem } from "../src/resource-workload.js";
import type { TeamTaskCalendarEmail } from "../src/email.js";
import { WORKLOAD_SQL, workloadItems } from "../src/resource-workload.js";
import { outlookRows } from "../src/outlook-calendar.js";
import { TEAM_BOARD_SQL, assertMayAssign, canAssignOthers, canChangeTeamTask, defaultManDays, parseApplyTo, parseTeamTask, redactWork, registerTeamBoardRoutes, seriesDayItems, timeRangeManDays } from "../src/routes/team-board.js";
import { maskWeekdays, ownState, repeatDates, ruleDates, seriesState, templateState, weekdayMask, type SeriesTemplate } from "../src/team-task-series.js";

const user = (id: number, roles: string[]): CurrentUser => ({ id, entraObjectId: "", email: "", name: `User ${id}`, role: roles[0]!, roles, department: "", isActive: true });

test("a team task needs only a subject and a date; the rest has defaults", () => {
  assert.deepEqual(parseTeamTask({ title: "  Site survey  ", startDate: "2026-10-22" }), {
    kind: "Task", title: "Site survey", customerId: null, assigneeIds: [], startDate: "2026-10-22", endDate: "2026-10-22", slot: "Day",
    startTime: null, endTime: null, manDays: null, status: "Planned", inquiryId: null, projectId: null, note: "", meetingMode: null, meetingPlace: "", repeat: null,
  });
  // A day away takes no effort, whatever was sent.
  assert.equal(parseTeamTask({ kind: "Away", title: "Leave", startDate: "2026-10-22", assigneeIds: [7], manDays: 3 }).manDays, 0);
  // Several people, in the order chosen, each once; an older page's single assigneeId is a list of one.
  assert.deepEqual(parseTeamTask({ title: "Survey", startDate: "2026-10-22", assigneeIds: [9, "7", 9] }).assigneeIds, [9, 7]);
  assert.deepEqual(parseTeamTask({ title: "Survey", startDate: "2026-10-22", assigneeId: 9 }).assigneeIds, [9]);
  // A time range goes with the Time slot; any other slot drops times it was sent.
  const timed = parseTeamTask({ title: "Survey", startDate: "2026-10-22", slot: "Time", startTime: "09:00", endTime: "11:30" });
  assert.deepEqual([timed.slot, timed.startTime, timed.endTime], ["Time", "09:00", "11:30"]);
  const morning = parseTeamTask({ title: "Survey", startDate: "2026-10-22", slot: "AM", startTime: "09:00", endTime: "11:30" });
  assert.deepEqual([morning.slot, morning.startTime, morning.endTime], ["AM", null, null]);
  // Over two days the end time may be earlier than the start time.
  assert.equal(parseTeamTask({ title: "Install", startDate: "2026-10-22", endDate: "2026-10-23", slot: "Time", startTime: "13:00", endTime: "10:00" }).endTime, "10:00");
  for (const [body, label] of [
    [{ title: "", startDate: "2026-10-22" }, "no subject"],
    [{ title: "x" }, "no date"],
    [{ title: "x", startDate: "2026-10-22", endDate: "2026-10-21" }, "ends before it starts"],
    [{ title: "x", startDate: "2026-01-01", endDate: "2027-01-03" }, "longer than a year"],
    [{ title: "x", kind: "Away", startDate: "2026-10-22" }, "away with nobody"],
    [{ title: "x", kind: "Away", startDate: "2026-10-22", assigneeIds: [] }, "away with an empty list"],
    [{ title: "x", startDate: "2026-10-22", assigneeIds: [0] }, "not a person"],
    [{ title: "x", startDate: "2026-10-22", assigneeIds: Array.from({ length: 21 }, (_, index) => index + 1) }, "more than twenty people"],
    [{ title: "x", kind: "Meeting", startDate: "2026-10-22" }, "unknown kind"],
    [{ title: "x", startDate: "2026-10-22", slot: "Time", startTime: "25:00", endTime: "26:00" }, "bad time"],
    [{ title: "x", startDate: "2026-10-22", slot: "Time", startTime: "09:00" }, "no end time"],
    [{ title: "x", startDate: "2026-10-22", slot: "Time", startTime: "11:00", endTime: "11:00" }, "ends when it starts"],
    [{ title: "x", startDate: "2026-10-22", slot: "Evening" }, "unknown slot"],
    [{ title: "x", startDate: "2026-10-22", manDays: -1 }, "negative effort"],
    [{ title: "x", startDate: "2026-10-22", manDays: 0.333 }, "three decimals"],
    [{ title: "x", startDate: "2026-10-22", status: "Started" }, "unknown status"],
  ] as const) assert.throws(() => parseTeamTask(body), { statusCode: 400 }, label);
});

test("a task's default effort is a day for each working day, half for a morning or an afternoon", () => {
  const holidays = new Set(["2026-10-23"]);
  // Thursday 22 to Monday 26 October: Thursday and Monday; Friday is a holiday and the weekend is off.
  assert.equal(defaultManDays({ kind: "Task", startDate: "2026-10-22", endDate: "2026-10-26", slot: "Day" }, holidays), 2);
  assert.equal(defaultManDays({ kind: "Appointment", startDate: "2026-10-22", endDate: "2026-10-22", slot: "AM" }, holidays), 0.5);
  // Booked on a Saturday: the day still counts.
  assert.equal(defaultManDays({ kind: "Appointment", startDate: "2026-10-24", endDate: "2026-10-24", slot: "Day" }, holidays), 1);
  assert.equal(defaultManDays({ kind: "Away", startDate: "2026-10-22", endDate: "2026-10-26", slot: "Day" }, holidays), 0);
  // A time range on one day counts its hours against an 8-hour day, lunch left out, to the nearest quarter.
  const range = (startTime: string, endTime: string) => defaultManDays({ kind: "Task", startDate: "2026-10-22", endDate: "2026-10-22", slot: "Time", startTime, endTime }, holidays);
  assert.deepEqual([range("09:00", "11:30"), range("13:30", "17:30"), range("08:30", "17:30"), range("11:00", "14:00"), range("10:00", "10:15")], [0.25, 0.5, 1, 0.25, 0.25]);
  assert.deepEqual([timeRangeManDays("09:00", "13:00"), timeRangeManDays("09:00", "15:00")], [0.5, 0.75]);
  // Over several days it counts each working day whole.
  assert.equal(defaultManDays({ kind: "Task", startDate: "2026-10-22", endDate: "2026-10-26", slot: "Time", startTime: "13:00", endTime: "10:00" }, holidays), 2);
});

test("work the reader cannot open keeps its dates, effort and piece of work, and loses what it is", () => {
  const item: WorkloadItem = {
    key: "Project-11-7", workKey: "Project-11", group: "Project-11", type: "Project", entityId: 1, ownerId: 7, reference: "P-1 · 1.1", title: "Wiring", customer: "ACME",
    start: "2026-10-19", end: "2026-10-23", manDays: 4, progress: 20, status: "In Progress", hidden: true,
  };
  assert.deepEqual(redactWork(item), {
    key: "Project-11-7", workKey: "Project-11", group: "Project-11", type: "Project", entityId: 0, ownerId: 7, reference: "", title: "", customer: "",
    start: "2026-10-19", end: "2026-10-23", manDays: 4, progress: 20, status: "In Progress", hidden: true,
  });
  const visible: WorkloadItem = { ...item };
  delete visible.hidden;
  assert.equal(redactWork(visible), visible);
});

test("a team task is changed by whoever added it, anyone it is for, or a manager", () => {
  const task = { created_by: 5 };
  assert.equal(canChangeTeamTask(user(5, ["Sales Engineer"]), task, [9, 7]), true);
  assert.equal(canChangeTeamTask(user(9, ["Engineer"]), task, [9, 7]), true);
  assert.equal(canChangeTeamTask(user(7, ["Engineer"]), task, [9, 7]), true);
  assert.equal(canChangeTeamTask(user(2, ["Project Manager"]), task, [9]), true);
  assert.equal(canChangeTeamTask(user(3, ["Engineer"]), task, [9, 7]), false);
  assert.equal(canChangeTeamTask(user(3, ["Engineer"]), task, []), false);
});

/** People and customers the calendar delivery looks up, by id. */
const directory = [[{ id: 9, name: "Napa K.", email: "napa@example.com" }, { id: 7, name: "Wichai S.", email: "wichai@example.com" }], [{ id: 4, name: "ACME" }]];

function boardServer(actor: CurrentUser, sets: unknown[][] = []) {
  const demanded: string[] = [];
  const statements: string[] = [];
  const bound: Record<string, unknown> = {};
  const invites: TeamTaskCalendarEmail[] = [];
  const email = { async sendTeamTaskCalendar(message: TeamTaskCalendarEmail) { invites.push(message); return { status: "sent" as const, recipients: message.recipients.map((person) => person.email) }; } };
  const users = { demandPermission: async (_request: unknown, permission: string) => { demanded.push(permission); }, required: async () => actor };
  const database = {
    async query(statement: string, bind?: (request: unknown) => void) {
      statements.push(statement);
      const request = { input(key: string, _type: unknown, value: unknown) { bound[key] = value; return request; } };
      bind?.(request);
      if (statement.includes("FROM dbo.users WHERE id IN")) return { recordsets: directory, recordset: directory[0] };
      return { recordsets: sets, recordset: sets[0] ?? [] };
    },
    async transaction(action: (transaction: object) => Promise<unknown>) { return action({}); },
  };
  const app = Fastify();
  registerErrorHandler(app);
  registerTeamBoardRoutes(app, database as unknown as Database, users as unknown as CurrentUserService, email);
  return { app, demanded, statements, bound, invites };
}

test("the board reads everyone's work for team.board, and names only what the reader may open", async () => {
  const empty: unknown[] = [];
  const workload = [
    [{ id: 3, inquiry_no: "INQ-3", project_name: "Line 4", customer_name: "ACME", owner_id: 7, start_date: "2026-10-19", end_date: "2026-10-23", man_days: 4, progress: 0, status: "Open", visible: false }],
    empty, empty, empty, empty, empty, empty, empty,
    // One row per person: both spend the half day.
    [{ id: 21, kind: "Appointment", title: "Site survey", customer_name: "ACME", assignee_id: 7, start_date: "2026-10-22", end_date: "2026-10-22", man_days: 0.5 },
      { id: 21, kind: "Appointment", title: "Site survey", customer_name: "ACME", assignee_id: 9, start_date: "2026-10-22", end_date: "2026-10-22", man_days: 0.5 }],
  ];
  const task = {
    id: 21, kind: "Appointment", title: "Site survey", customer_id: 4, customer_name: "ACME", assignee_ids: "7,9", start_date: new Date("2026-10-22T00:00:00Z"),
    end_date: new Date("2026-10-22T00:00:00Z"), time_slot: "Time", start_time: "09:30", end_time: "11:00", man_days: 0.5, status: "Planned", inquiry_id: 3, inquiry_no: "INQ-3",
    project_id: null, project_no: null, note: "", created_by: 5, created_by_name: "Sales", created_at: "2026-10-21T07:00:00Z", row_version: Buffer.alloc(8, 1),
  };
  const visits = [
    { id: 8, visit_no: "SV-8", status: "Confirmed", customer_name: "ACME", engineer_id: 7, start_date: "2026-10-21", end_date: "2026-10-21", start_time: "10:00" },
    { id: 8, visit_no: "SV-8", status: "Confirmed", customer_name: "ACME", engineer_id: 9, start_date: "2026-10-21", end_date: "2026-10-21", start_time: "10:00" },
  ];
  const away = [{ id: 2, user_id: 9, kind: "Leave", start_date: "2026-10-22", end_date: "2026-10-23" }];
  const { app, demanded, statements, bound } = boardServer(user(5, ["Sales Engineer"]), [
    [{ user_id: 7, days_per_week: 4 }], [{ holiday_date: new Date("2026-10-23T00:00:00Z") }], ...workload, [task], visits, away, [{ code: "project.read" }],
  ]);
  try {
    const response = await app.inject({ method: "GET", url: "/api/v1/team-board?from=2026-10-19&to=2026-10-30" });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(demanded, ["team.board"]);
    assert.ok(statements[0]!.includes(WORKLOAD_SQL));
    assert.equal(statements[0], TEAM_BOARD_SQL);
    assert.equal(bound.all_work, true);
    assert.deepEqual([bound.from, bound.to, bound.actor], ["2026-10-19", "2026-10-30", 5]);
    const body = response.json();
    assert.deepEqual(body.capacities, [{ userId: 7, daysPerWeek: 4 }]);
    assert.deepEqual(body.holidays, ["2026-10-23"]);
    // The inquiry counts for person 7; its number, name and customer are not this reader's.
    const inquiry = body.items.find((item: WorkloadItem) => item.key === "Inquiry-3");
    assert.deepEqual([inquiry.hidden, inquiry.reference, inquiry.title, inquiry.customer, inquiry.manDays, inquiry.ownerId], [true, "", "", "", 4, 7]);
    assert.deepEqual(body.items.filter((item: WorkloadItem) => item.workKey === "TeamTask-21").map((item: WorkloadItem) => [item.key, item.ownerId, item.manDays]),
      [["TeamTask-21-7", 7, 0.5], ["TeamTask-21-9", 9, 0.5]]);
    assert.deepEqual(body.tasks[0].assigneeIds, [7, 9]);
    // The linked RFQ number needs inquiry.read; this reader has none.
    assert.equal(body.tasks[0].inquiryNo, "");
    assert.equal(body.tasks[0].inquiryId, 3);
    assert.deepEqual([body.tasks[0].startDate, body.tasks[0].slot, body.tasks[0].startTime, body.tasks[0].endTime, body.tasks[0].rowVersion], ["2026-10-22", "Time", "09:30", "11:00", Buffer.alloc(8, 1).toString("base64")]);
    // One visit with two engineers; without visit.read its number and customer stay out.
    assert.deepEqual(body.visits, [{ id: 8, number: "", status: "Confirmed", customer: "", start: "2026-10-21", end: "2026-10-21", time: "10:00", engineerIds: [7, 9] }]);
    assert.deepEqual(body.away, [{ id: 2, userId: 9, kind: "Leave", start: "2026-10-22", end: "2026-10-23" }]);
    assert.equal(body.canChangeAll, false);
    for (const url of ["/api/v1/team-board?from=2026-10-30&to=2026-10-19", "/api/v1/team-board?from=2026-01-01&to=2027-03-01", "/api/v1/team-board?from=bad&to=2026-10-19"])
      assert.equal((await app.inject({ method: "GET", url })).statusCode, 400, url);
  } finally {
    await app.close();
  }
});

test("adding a task works out its effort, records its people and tells them, in one Outlook request", async (t) => {
  const statements: { statement: string; parameters: Record<string, unknown> }[] = [];
  t.mock.method(sql.Request.prototype, "query", async function (this: { parameters: Record<string, { value: unknown }> }, statement: string) {
    statements.push({ statement, parameters: Object.fromEntries(Object.entries(this.parameters).map(([key, entry]) => [key, entry.value])) });
    if (statement.includes("customer_ok")) return { recordset: [], recordsets: [[{ customer_ok: 1, assignee_ok: 1, inquiry_ok: 1, project_ok: 1 }], [{ holiday_date: new Date("2026-10-23T00:00:00Z") }]] };
    if (statement.includes("INSERT dbo.team_tasks")) return { recordset: [{ id: 31, row_version: Buffer.alloc(8, 2) }] };
    return { recordset: [] };
  });
  // A manager may put work on other people's rows (owner decision 2026-10-28).
  const { app, demanded, invites } = boardServer(user(5, ["Sales Manager"]));
  try {
    const response = await app.inject({ method: "POST", url: "/api/v1/team-tasks", payload: { kind: "Task", title: "Draft BOQ", note: "BOQ for the line 4 retrofit", assigneeIds: [9, 7], customerId: 4, startDate: "2026-10-22", endDate: "2026-10-26" } });
    assert.equal(response.statusCode, 201);
    assert.deepEqual(demanded, ["team.board"]);
    // Thursday and Monday; Friday 23 is a holiday. The person's Outlook got the request.
    assert.deepEqual(response.json(), { id: 31, rowVersion: Buffer.alloc(8, 2).toString("base64"), manDays: 2, calendar: "sent" });
    assert.deepEqual(invites.map((invite) => [invite.method, invite.recipients.map((person) => person.email), invite.task.id, invite.task.customer, invite.sentBy]),
      [["REQUEST", ["napa@example.com", "wichai@example.com"], 31, "ACME", "User 5"]]);
    // A day away never goes to Outlook.
    const away = await app.inject({ method: "POST", url: "/api/v1/team-tasks", payload: { kind: "Away", title: "Leave", assigneeIds: [9], startDate: "2026-10-22" } });
    assert.equal(away.json().calendar, "none");
    assert.equal(invites.length, 1);
    const insert = statements.find((entry) => entry.statement.includes("INSERT dbo.team_tasks"))!;
    assert.deepEqual([insert.parameters.title, insert.parameters.man_days, insert.parameters.actor], ["Draft BOQ", 2, 5]);
    // Each person spends the two days; they are saved in the order chosen.
    const people = statements.find((entry) => entry.statement.includes("INSERT dbo.team_task_assignees"))!;
    assert.deepEqual([people.parameters.id, people.parameters.people], [31, "[9,7]"]);
    assert.match(people.statement, /DELETE FROM dbo.team_task_assignees WHERE task_id=@id;/);
    assert.ok(statements.some((entry) => entry.statement.includes("INSERT INTO dbo.audit_log") && entry.parameters.entity_type === "Team Task" && entry.parameters.action === "Created"));
    const notices = statements.filter((entry) => entry.statement.includes("INSERT INTO dbo.notifications"));
    assert.deepEqual(notices.slice(0, 2).map((notice) => [notice.parameters.user, notice.parameters.kind, notice.parameters.type, notice.parameters.entity]),
      [[9, "TEAM_TASK_ASSIGNED", "TeamTask", 31], [7, "TEAM_TASK_ASSIGNED", "TeamTask", 31]]);
  } finally {
    await app.close();
  }
});

test("someone else's task cannot be changed, and a stale copy is refused", async (t) => {
  const current = { id: 31, kind: "Task", title: "Draft BOQ", created_by: 5, start_date: new Date("2026-10-22T00:00:00Z"), end_date: new Date("2026-10-22T00:00:00Z"),
    time_slot: "Day", man_days: 1, status: "Planned", customer_id: null, inquiry_id: null, project_id: null, note: "", row_version: Buffer.alloc(8, 3) };
  const statements: string[] = [];
  t.mock.method(sql.Request.prototype, "query", async function (statement: string) {
    statements.push(statement);
    if (statement.includes("FROM dbo.team_tasks WITH(UPDLOCK,HOLDLOCK)")) return { recordset: [current] };
    // Napa (9) is on the task as saved.
    if (statement.includes("SELECT user_id FROM dbo.team_task_assignees")) return { recordset: [{ user_id: 9 }] };
    if (statement.includes("customer_ok")) return { recordset: [], recordsets: [[{ customer_ok: 1, assignee_ok: 1, inquiry_ok: 1, project_ok: 1 }], []] };
    if (statement.includes("UPDATE dbo.team_tasks SET kind")) return { recordset: [{ row_version: Buffer.alloc(8, 4) }] };
    return { recordset: [] };
  });
  const payload = { kind: "Task", title: "Draft BOQ", assigneeIds: [9], startDate: "2026-10-27", manDays: 1, rowVersion: Buffer.alloc(8, 3).toString("base64") };
  const outsider = boardServer(user(3, ["Engineer"]));
  try {
    const refused = await outsider.app.inject({ method: "PUT", url: "/api/v1/team-tasks/31", payload });
    assert.equal(refused.statusCode, 403);
    assert.equal((await outsider.app.inject({ method: "DELETE", url: `/api/v1/team-tasks/31?rowVersion=${encodeURIComponent(payload.rowVersion)}` })).statusCode, 403);
    assert.ok(!statements.some((statement) => statement.includes("UPDATE dbo.team_tasks")));
  } finally {
    await outsider.app.close();
  }
  // A Leader on the task, so handing it to someone else is allowed.
  const assignee = boardServer(user(9, ["Engineer", "Leader"]));
  try {
    const stale = await assignee.app.inject({ method: "PUT", url: "/api/v1/team-tasks/31", payload: { ...payload, rowVersion: Buffer.alloc(8, 9).toString("base64") } });
    assert.equal(stale.statusCode, 409);
    const saved = await assignee.app.inject({ method: "PUT", url: "/api/v1/team-tasks/31", payload });
    assert.equal(saved.statusCode, 200);
    assert.deepEqual(saved.json(), { id: 31, rowVersion: Buffer.alloc(8, 4).toString("base64"), manDays: 1, calendar: "sent" });
    // The day moved: the same person gets the event again, at its new date.
    const sent = (from: number) => assignee.invites.slice(from).map((invite) => [invite.method, invite.recipients.map((person) => person.email), invite.task.startDate]);
    assert.deepEqual(sent(0), [["REQUEST", ["napa@example.com"], "2026-10-27"]]);
    // Handed to someone else: the first person's entry is cancelled, as they had it, and the new one is invited.
    await assignee.app.inject({ method: "PUT", url: "/api/v1/team-tasks/31", payload: { ...payload, assigneeIds: [7] } });
    assert.deepEqual(sent(1), [["CANCEL", ["napa@example.com"], "2026-10-22"], ["REQUEST", ["wichai@example.com"], "2026-10-27"]]);
    // Someone joins on the same day: everyone gets the request again, so each copy lists who is coming; nobody is cancelled.
    await assignee.app.inject({ method: "PUT", url: "/api/v1/team-tasks/31", payload: { ...payload, startDate: "2026-10-22", assigneeIds: [9, 7] } });
    assert.deepEqual(sent(3), [["REQUEST", ["napa@example.com", "wichai@example.com"], "2026-10-22"]]);
    const removed = await assignee.app.inject({ method: "DELETE", url: `/api/v1/team-tasks/31?rowVersion=${encodeURIComponent(payload.rowVersion)}` });
    assert.equal(removed.statusCode, 200);
    assert.deepEqual(removed.json(), { id: 31, deleted: true, calendar: "sent" });
    assert.deepEqual(assignee.invites.at(-1)!.method, "CANCEL");
    assert.ok(statements.some((statement) => statement.includes("SET deleted_at=SYSUTCDATETIME()")));
  } finally {
    await assignee.app.close();
  }
});

test("only Admins, Managers and Leaders add work for someone else, and new work says what it is", async (t) => {
  t.mock.method(sql.Request.prototype, "query", async function (statement: string) {
    if (statement.includes("customer_ok")) return { recordset: [], recordsets: [[{ customer_ok: 1, assignee_ok: 1, inquiry_ok: 1, project_ok: 1 }], []] };
    if (statement.includes("INSERT dbo.team_tasks")) return { recordset: [{ id: 41, row_version: Buffer.alloc(8, 5) }] };
    return { recordset: [] };
  });
  assert.deepEqual([["Engineer"], ["Leader"], ["Admin"], ["Engineering Manager"], ["Project Manager"], ["Sales Engineer"]].map((roles) => canAssignOthers(user(1, roles))),
    [false, true, true, true, true, false]);
  const engineer = boardServer(user(9, ["Engineer"]));
  try {
    const base = { kind: "Task", title: "Commissioning", note: "Line 2 PLC test", startDate: "2026-10-22" };
    const forOthers = await engineer.app.inject({ method: "POST", url: "/api/v1/team-tasks", payload: { ...base, assigneeIds: [7] } });
    assert.equal(forOthers.statusCode, 403);
    assert.equal(forOthers.json().code, "team_task_assign_forbidden");
    assert.equal((await engineer.app.inject({ method: "POST", url: "/api/v1/team-tasks", payload: { ...base, assigneeIds: [9] } })).statusCode, 201);
    assert.equal((await engineer.app.inject({ method: "POST", url: "/api/v1/team-tasks", payload: { ...base, assigneeIds: [] } })).statusCode, 201, "for nobody yet");
    const noDetail = await engineer.app.inject({ method: "POST", url: "/api/v1/team-tasks", payload: { ...base, note: " ", assigneeIds: [9] } });
    assert.equal(noDetail.statusCode, 400);
    // A day away needs no detail.
    assert.equal((await engineer.app.inject({ method: "POST", url: "/api/v1/team-tasks", payload: { kind: "Away", title: "Leave", assigneeIds: [9], startDate: "2026-10-22" } })).statusCode, 201);
  } finally {
    await engineer.app.close();
  }
  // People already on a task stay when someone without the right saves it; adding another does not.
  assert.doesNotThrow(() => assertMayAssign(user(9, ["Engineer"]), [9, 7], [7]));
  assert.throws(() => assertMayAssign(user(9, ["Engineer"]), [9, 7, 3], [7]), /Only Admins, Managers and Leaders/);
});

test("Outlook events keep busy time, hide private subjects and skip what the board already sent", () => {
  const rows = outlookRows([
    { id: "a", subject: "Customer meeting", showAs: "busy", start: { dateTime: "2026-10-28T09:00:00.0000000" }, end: { dateTime: "2026-10-28T10:30:00.0000000" }, location: { displayName: "ACME" } },
    { id: "b", subject: "Doctor", sensitivity: "private", showAs: "oof", isAllDay: true, start: { dateTime: "2026-10-29T00:00:00.0000000" }, end: { dateTime: "2026-10-30T00:00:00.0000000" } },
    { id: "c", subject: "Lunch", showAs: "free", start: { dateTime: "2026-10-28T12:00:00" }, end: { dateTime: "2026-10-28T13:00:00" } },
    { id: "d", subject: "Cancelled", isCancelled: true, start: { dateTime: "2026-10-28T14:00:00" }, end: { dateTime: "2026-10-28T15:00:00" } },
    { id: "e", iCalUId: "team-task-31@iot-team-center", subject: "Board task", start: { dateTime: "2026-10-28T08:30:00" }, end: { dateTime: "2026-10-28T12:00:00" } },
    { id: "f", iCalUId: "team-series-4@iot-team-center", subject: "Daily update", start: { dateTime: "2026-10-28T09:00:00" }, end: { dateTime: "2026-10-28T09:30:00" } },
    // A day of a recurring invitation has an iCalUId of its own; its organizer, the system mailbox, gives it away.
    { id: "g", iCalUId: "040000008200E00074C5B7101A82E008", subject: "Daily update", organizer: { emailAddress: { address: "IoT-Team-Center@Example.com" } }, start: { dateTime: "2026-10-29T09:00:00" }, end: { dateTime: "2026-10-29T09:30:00" } },
  ], "iot-team-center@example.com");
  assert.deepEqual(rows, [
    { eventId: "a", subject: "Customer meeting", location: "ACME", isPrivate: false, isAllDay: false, showAs: "busy", start: "2026-10-28T09:00:00", end: "2026-10-28T10:30:00" },
    { eventId: "b", subject: null, location: null, isPrivate: true, isAllDay: true, showAs: "oof", start: "2026-10-29T00:00:00", end: "2026-10-30T00:00:00" },
  ]);
});

test("a one-day task can repeat on working days or chosen weekdays for up to a year, and a meeting says where it is held", () => {
  const daily = parseTeamTask({ kind: "Appointment", title: "Daily update", startDate: "2026-11-10", repeat: { rule: "Weekdays", until: "2026-12-10", weekdays: [6] },
    meetingMode: "Online", meetingPlace: " https://teams.example.com/x " });
  // Every working day ignores any weekdays sent; a link is trimmed.
  assert.deepEqual(daily.repeat, { rule: "Weekdays", weekdays: [1, 2, 3, 4, 5], until: "2026-12-10" });
  assert.deepEqual([daily.meetingMode, daily.meetingPlace], ["Online", "https://teams.example.com/x"]);
  assert.deepEqual(parseTeamTask({ title: "x", startDate: "2026-11-10", repeat: { rule: "Weekly", weekdays: [4, 1, 4], until: "2026-11-30" } }).repeat,
    { rule: "Weekly", weekdays: [1, 4], until: "2026-11-30" });
  // A place with no kind of meeting, or a day away, keeps none.
  assert.equal(parseTeamTask({ title: "x", startDate: "2026-11-10", meetingPlace: "Room 2" }).meetingPlace, "");
  assert.equal(parseTeamTask({ kind: "Away", title: "x", assigneeIds: [7], startDate: "2026-11-10", meetingMode: "Offline", meetingPlace: "Room 2" }).meetingMode, null);
  for (const [body, label] of [
    [{ repeat: { rule: "Daily", until: "2026-11-30" } }, "an unknown rule"],
    [{ repeat: { rule: "Weekly", weekdays: [], until: "2026-11-30" } }, "no weekdays"],
    [{ repeat: { rule: "Weekly", weekdays: [8], until: "2026-11-30" } }, "no such weekday"],
    [{ repeat: { rule: "Weekdays", until: "2026-11-09" } }, "ends before it starts"],
    [{ repeat: { rule: "Weekdays", until: "2027-11-12" } }, "longer than a year"],
    [{ repeat: { rule: "Weekdays" } }, "no last day"],
    [{ endDate: "2026-11-11", repeat: { rule: "Weekdays", until: "2026-11-30" } }, "several days"],
    [{ meetingMode: "Hybrid" }, "an unknown kind of meeting"],
  ] as const) assert.throws(() => parseTeamTask({ title: "x", startDate: "2026-11-10", ...body }), { code: "validation_failed" }, label);
  assert.deepEqual([parseApplyTo(undefined), parseApplyTo("following")], ["this", "following"]);
  assert.throws(() => parseApplyTo("all"), { code: "validation_failed" });
});

const STANDUP: SeriesTemplate = {
  kind: "Appointment", title: "Daily update", customerId: null, assigneeIds: [9, 7], slot: "Time", startTime: "09:00", endTime: "09:30", manDays: 0.25,
  inquiryId: null, projectId: 3, note: "Stand-up", meetingMode: "Online", meetingPlace: "https://teams.example.com/x",
};

test("a repeat falls on its weekdays until its last day, company holidays left out; Outlook's entry leaves out the days it does not cover", () => {
  // Tuesday 10 until Friday 20 November: the working days, less the weekend and Monday 16, a holiday.
  assert.deepEqual(repeatDates("2026-11-10", { rule: "Weekdays", weekdays: [1, 2, 3, 4, 5], until: "2026-11-20" }, new Set(["2026-11-16"])),
    ["2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20"]);
  assert.deepEqual(ruleDates("2026-11-11", "2026-11-23", [1, 4]), ["2026-11-12", "2026-11-16", "2026-11-19", "2026-11-23"]);
  assert.equal(weekdayMask([1, 2, 3, 4, 5]), 31);
  assert.deepEqual(maskWeekdays(31 + 64), [1, 2, 3, 4, 5, 7]);
  const series = { id: 4, weekdays: [1, 2, 3, 4, 5], firstDate: "2026-11-16", until: "2026-11-20", template: STANDUP };
  const day = (id: number, date: string, change: Record<string, unknown> = {}) => ({ ...templateState(STANDUP, date), id, occurrenceDate: date, ...change });
  const days = [day(1, "2026-11-17"), day(2, "2026-11-18", { assigneeIds: [7, 9], status: "Done" }), day(3, "2026-11-19", { startTime: "10:00" }), day(4, "2026-11-20", { status: "Cancelled" })];
  const state = seriesState(series, days);
  // Monday 16 (a holiday: no day saved), Thursday 19 (changed on its own) and Friday 20 (cancelled) are left out. Wednesday
  // 18 is done, with its people in another order, and still covered.
  assert.deepEqual(state.repeat, { seriesId: 4, weekdays: [1, 2, 3, 4, 5], until: "2026-11-20", exdates: ["2026-11-16", "2026-11-19", "2026-11-20"] });
  assert.deepEqual([state.startDate, state.endDate, state.status, state.meetingPlace, state.assigneeIds], ["2026-11-16", "2026-11-16", "Planned", "https://teams.example.com/x", [9, 7]]);
  // A covered day has no entry of its own; a day changed on its own, or moved to another day, has.
  assert.equal(ownState(STANDUP, days[0]!), null);
  assert.equal(ownState(STANDUP, days[2]!)?.startTime, "10:00");
  assert.notEqual(ownState(STANDUP, day(5, "2026-11-17", { startDate: "2026-11-21", endDate: "2026-11-21" })), null);
  // No day left to cover: the series' entry is cancelled.
  assert.equal(seriesState(series, [days[3]!]).status, "Cancelled");
});

test("a repeat counts day by day on the board, and as one piece of work in the workload from today on", () => {
  const day = (id: number, change: Record<string, unknown> = {}) => ({ id, kind: "Appointment", title: "Daily update", customer_name: "", assignee_ids: "9,7",
    start_date: new Date("2026-11-10T00:00:00Z"), end_date: new Date("2026-11-10T00:00:00Z"), man_days: 0.25, status: "Planned", series_id: 4, ...change });
  assert.deepEqual(seriesDayItems([day(101), day(102, { status: "Done" }), day(103, { series_id: null }), day(104, { kind: "Away" })])
    .map((item) => [item.key, item.workKey, item.ownerId, item.start, item.manDays, item.taskKind, item.repeat]),
  [["TeamTask-101-9", "TeamTask-101", 9, "2026-11-10", 0.25, "Appointment", true], ["TeamTask-101-7", "TeamTask-101", 7, "2026-11-10", 0.25, "Appointment", true]]);
  const empty: Record<string, unknown>[] = [];
  const { items } = workloadItems([empty, empty, empty, empty, empty, empty, empty, empty, [
    { id: 101, kind: "Appointment", title: "Daily update", customer_name: null, assignee_id: 9, start_date: "2026-11-10", end_date: "2026-12-10", man_days: 5.5, series_id: 4 },
    { id: 31, kind: "Task", title: "Draft BOQ", customer_name: "ACME", assignee_id: 9, start_date: "2026-11-10", end_date: "2026-11-11", man_days: 2, series_id: null },
  ]], new Set());
  assert.deepEqual(items.map((item) => [item.key, item.workKey, item.entityId, item.manDays]), [["TeamSeries-4-9", "TeamSeries-4", 101, 5.5], ["TeamTask-31-9", "TeamTask-31", 31, 2]]);
  // The workload reads a repeat's days from today on, summed per person, and a single task as before.
  assert.match(WORKLOAD_SQL, /GROUP BY t\.series_id,a\.user_id/);
  assert.match(TEAM_BOARD_SQL, /t\.end_date<@from AND t\.series_id IS NULL/);
});

/** A series and its days as readSeries reads them. */
const seriesRead = (until: string, days: Record<string, unknown>[]) => ({
  recordset: [],
  recordsets: [[{ id: 4, weekdays: 31, first_date: new Date("2026-11-10T00:00:00Z"), until_date: new Date(`${until}T00:00:00Z`), template_json: JSON.stringify({ ...STANDUP, assigneeIds: [9] }) }],
    days.map((change) => ({ kind: "Appointment", title: "Daily update", customer_id: null, note: "Stand-up", time_slot: "Time", start_time: "09:00", end_time: "09:30",
      status: "Planned", meeting_mode: "Online", meeting_place: "https://teams.example.com/x", assignee_ids: "9", ...change,
      start_date: new Date(`${change.start ?? change.day}T00:00:00Z`), end_date: new Date(`${change.start ?? change.day}T00:00:00Z`), occurrence_date: new Date(`${change.day}T00:00:00Z`) }))],
});

test("adding a repeat saves the task on each of its days, tells its people once and sends Outlook one series", async (t) => {
  const statements: { statement: string; parameters: Record<string, unknown> }[] = [];
  t.mock.method(sql.Request.prototype, "query", async function (this: { parameters: Record<string, { value: unknown }> }, statement: string) {
    const parameters = Object.fromEntries(Object.entries(this.parameters).map(([key, entry]) => [key, entry.value]));
    statements.push({ statement, parameters });
    if (statement.includes("customer_ok")) return { recordset: [], recordsets: [[{ customer_ok: 1, assignee_ok: 1, inquiry_ok: 1, project_ok: 1 }], [{ holiday_date: new Date("2026-11-16T00:00:00Z") }]] };
    if (statement.includes("INSERT dbo.team_task_series"))
      return { recordset: (JSON.parse(String(parameters.dates)) as string[]).map((date, index) => ({ series_id: 4, id: 101 + index, occurrence_date: new Date(`${date}T00:00:00Z`), row_version: Buffer.alloc(8, index + 1) })) };
    return { recordset: [] };
  });
  const { app, invites } = boardServer(user(5, ["Engineering Manager"]));
  try {
    const response = await app.inject({ method: "POST", url: "/api/v1/team-tasks", payload: {
      kind: "Appointment", title: "Daily update", note: "Stand-up", assigneeIds: [9, 7], projectId: 3, startDate: "2026-11-10", slot: "Time", startTime: "09:00", endTime: "09:30",
      meetingMode: "Online", meetingPlace: "https://teams.example.com/x", repeat: { rule: "Weekdays", until: "2026-11-20" },
    } });
    assert.equal(response.statusCode, 201, response.body);
    // Eight working days: Monday 16 is a holiday. Half an hour counts a quarter of a day.
    assert.deepEqual(response.json(), { id: 101, rowVersion: Buffer.alloc(8, 1).toString("base64"), manDays: 0.25, seriesId: 4, count: 8, calendar: "sent" });
    const insert = statements.find((entry) => entry.statement.includes("INSERT dbo.team_task_series"))!;
    assert.deepEqual(JSON.parse(String(insert.parameters.dates)), ["2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20"]);
    assert.deepEqual([insert.parameters.rule, insert.parameters.weekdays, insert.parameters.first, insert.parameters.until, insert.parameters.people, insert.parameters.mode, insert.parameters.place],
      ["Weekdays", 31, "2026-11-10", "2026-11-20", "[9,7]", "Online", "https://teams.example.com/x"]);
    assert.match(insert.statement, /FROM OPENJSON\(@dates\) WITH \(\[day\] date '\$'\) d;/);
    assert.match(insert.statement, /CROSS JOIN OPENJSON\(@people\) people;/);
    assert.deepEqual(JSON.parse(String(insert.parameters.template)).assigneeIds, [9, 7]);
    // One notice each, not one a day; one audit entry for the series.
    const notices = statements.filter((entry) => entry.statement.includes("INSERT INTO dbo.notifications"));
    assert.deepEqual(notices.map((notice) => [notice.parameters.user, notice.parameters.entity]), [[9, 101], [7, 101]]);
    assert.match(String(notices[0]!.parameters.detail), /^2026-11-10 → 2026-11-20 · ทุกวันทำงาน/);
    assert.deepEqual(statements.filter((entry) => entry.statement.includes("INSERT INTO dbo.audit_log")).map((entry) => [entry.parameters.entity_type, entry.parameters.action]),
      [["Team Task Series", "Created"]]);
    // One Outlook series for both, leaving out the holiday.
    assert.deepEqual(invites.map((invite) => [invite.method, invite.recipients.map((person) => person.email), invite.task.id, invite.task.repeat, invite.task.meetingPlace]),
      [["REQUEST", ["napa@example.com", "wichai@example.com"], 4, { seriesId: 4, weekdays: [1, 2, 3, 4, 5], until: "2026-11-20", exdates: ["2026-11-16"] }, "https://teams.example.com/x"]]);
    // A repeat whose days are all holidays or the wrong weekdays saves nothing.
    const none = await app.inject({ method: "POST", url: "/api/v1/team-tasks", payload: { kind: "Task", title: "x", note: "y", startDate: "2026-11-14", repeat: { rule: "Weekdays", until: "2026-11-15" } } });
    assert.equal(none.statusCode, 400);
  } finally {
    await app.close();
  }
});

test("one day of a repeat changes on its own, and Outlook moves it out of the series; this day and the ones after it end the series", async (t) => {
  const statements: { statement: string; parameters: Record<string, unknown> }[] = [];
  const current = { id: 102, kind: "Appointment", title: "Daily update", created_by: 5, series_id: 4, occurrence_date: new Date("2026-11-11T00:00:00Z"),
    start_date: new Date("2026-11-11T00:00:00Z"), end_date: new Date("2026-11-11T00:00:00Z"), time_slot: "Time", start_time: "09:00", end_time: "09:30", man_days: 0.25, status: "Planned",
    customer_id: null, inquiry_id: null, project_id: 3, note: "Stand-up", meeting_mode: "Online", meeting_place: "https://teams.example.com/x", row_version: Buffer.alloc(8, 3) };
  let reads: ReturnType<typeof seriesRead>[] = [];
  t.mock.method(sql.Request.prototype, "query", async function (this: { parameters: Record<string, { value: unknown }> }, statement: string) {
    statements.push({ statement, parameters: Object.fromEntries(Object.entries(this.parameters).map(([key, entry]) => [key, entry.value])) });
    if (statement.includes("FROM dbo.team_tasks WITH(UPDLOCK,HOLDLOCK)")) return { recordset: [current] };
    if (statement.includes("SELECT user_id FROM dbo.team_task_assignees")) return { recordset: [{ user_id: 9 }] };
    if (statement.includes("FROM dbo.team_task_series WITH(UPDLOCK,HOLDLOCK)")) return reads.shift()!;
    if (statement.includes("customer_ok")) return { recordset: [], recordsets: [[{ customer_ok: 1, assignee_ok: 1, inquiry_ok: 1, project_ok: 1 }], []] };
    if (statement.includes("UPDATE dbo.team_tasks SET kind")) return { recordset: [{ row_version: Buffer.alloc(8, 4) }] };
    return { recordset: [] };
  });
  const { app, invites } = boardServer(user(9, ["Engineer"]));
  try {
    const payload = { kind: "Appointment", title: "Daily update", note: "Stand-up", assigneeIds: [9], projectId: 3, startDate: "2026-11-11", slot: "Time", startTime: "10:00", endTime: "10:30",
      meetingMode: "Online", meetingPlace: "https://teams.example.com/x", rowVersion: Buffer.alloc(8, 3).toString("base64") };
    // Wednesday's meeting moves to 10:00: the series leaves Wednesday out, and Wednesday gets an entry of its own.
    reads = [seriesRead("2026-11-12", [{ id: 101, day: "2026-11-10" }, { id: 102, day: "2026-11-11" }, { id: 103, day: "2026-11-12" }]),
      seriesRead("2026-11-12", [{ id: 101, day: "2026-11-10" }, { id: 102, day: "2026-11-11", start_time: "10:00", end_time: "10:30" }, { id: 103, day: "2026-11-12" }])];
    const saved = await app.inject({ method: "PUT", url: "/api/v1/team-tasks/102", payload });
    assert.equal(saved.statusCode, 200, saved.body);
    assert.deepEqual(saved.json(), { id: 102, rowVersion: Buffer.alloc(8, 4).toString("base64"), manDays: 0.25, calendar: "sent" });
    assert.deepEqual(invites.map((invite) => [invite.method, invite.task.id, invite.task.repeat?.exdates ?? null, invite.task.startTime]),
      [["REQUEST", 4, ["2026-11-11"], "09:00"], ["REQUEST", 102, null, "10:00"]]);
    assert.ok(statements.some((entry) => entry.statement.includes("meeting_mode=@mode,meeting_place=@place")));
    // This day and every one after it: Thursday is done and stays, Friday goes, and the series now ends on Thursday.
    // Wednesday had an entry of its own, which is cancelled.
    invites.length = 0;
    reads = [seriesRead("2026-11-13", [{ id: 101, day: "2026-11-10" }, { id: 102, day: "2026-11-11", start_time: "10:00", end_time: "10:30" }, { id: 103, day: "2026-11-12", status: "Done" }, { id: 104, day: "2026-11-13" }]),
      seriesRead("2026-11-12", [{ id: 101, day: "2026-11-10" }, { id: 103, day: "2026-11-12", status: "Done" }])];
    const removed = await app.inject({ method: "DELETE", url: `/api/v1/team-tasks/102?rowVersion=${encodeURIComponent(payload.rowVersion)}&applyTo=following` });
    assert.equal(removed.statusCode, 200, removed.body);
    assert.deepEqual(removed.json(), { id: 102, deleted: true, calendar: "sent" });
    const ended = statements.find((entry) => entry.statement.includes("occurrence_date>=@from"))!;
    assert.deepEqual([ended.parameters.series, ended.parameters.from, ended.parameters.self], [4, "2026-11-11", 102]);
    assert.match(ended.statement, /\(status<>N'Done' OR id=@self\)/);
    assert.ok(statements.some((entry) => entry.parameters.entity_type === "Team Task Series" && entry.parameters.action === "Ended"));
    assert.deepEqual(invites.map((invite) => [invite.method, invite.task.id, invite.task.repeat?.until ?? null, invite.task.repeat?.exdates ?? null]),
      [["REQUEST", 4, "2026-11-12", ["2026-11-11"]], ["CANCEL", 102, null, null]]);
    assert.equal((await app.inject({ method: "DELETE", url: `/api/v1/team-tasks/102?rowVersion=${encodeURIComponent(payload.rowVersion)}&applyTo=all` })).statusCode, 400);
  } finally {
    await app.close();
  }
});

test("changing this day and every one after it ends the old repeat there and starts a new one; a single task can be made to repeat", async (t) => {
  const statements: { statement: string; parameters: Record<string, unknown> }[] = [];
  let current: Record<string, unknown> = { id: 102, kind: "Appointment", title: "Daily update", created_by: 9, series_id: 4, occurrence_date: new Date("2026-11-11T00:00:00Z"),
    start_date: new Date("2026-11-11T00:00:00Z"), end_date: new Date("2026-11-11T00:00:00Z"), time_slot: "Time", start_time: "09:00", end_time: "09:30", man_days: 0.25, status: "Planned",
    customer_id: null, inquiry_id: null, project_id: 3, note: "Stand-up", meeting_mode: "Online", meeting_place: "https://teams.example.com/x", row_version: Buffer.alloc(8, 3) };
  let reads: ReturnType<typeof seriesRead>[] = [];
  t.mock.method(sql.Request.prototype, "query", async function (this: { parameters: Record<string, { value: unknown }> }, statement: string) {
    const parameters = Object.fromEntries(Object.entries(this.parameters).map(([key, entry]) => [key, entry.value]));
    statements.push({ statement, parameters });
    if (statement.includes("FROM dbo.team_tasks WITH(UPDLOCK,HOLDLOCK)")) return { recordset: [current] };
    if (statement.includes("SELECT user_id FROM dbo.team_task_assignees")) return { recordset: [{ user_id: 9 }] };
    if (statement.includes("FROM dbo.team_task_series WITH(UPDLOCK,HOLDLOCK)")) return reads.shift()!;
    if (statement.includes("customer_ok")) return { recordset: [], recordsets: [[{ customer_ok: 1, assignee_ok: 1, inquiry_ok: 1, project_ok: 1 }], []] };
    if (statement.includes("INSERT dbo.team_task_series"))
      return { recordset: (JSON.parse(String(parameters.dates)) as string[]).map((date, index) => ({ series_id: 5, id: 201 + index, occurrence_date: new Date(`${date}T00:00:00Z`), row_version: Buffer.alloc(8, 9) })) };
    return { recordset: [] };
  });
  const { app, invites } = boardServer(user(9, ["Engineer"]));
  try {
    const payload = { kind: "Appointment", title: "Daily update", note: "Stand-up", assigneeIds: [9], projectId: 3, startDate: "2026-11-11", slot: "Time", startTime: "10:00", endTime: "10:30",
      meetingMode: "Offline", meetingPlace: "Room 2", repeat: { rule: "Weekly", weekdays: [3, 5], until: "2026-11-20" }, applyTo: "following", rowVersion: Buffer.alloc(8, 3).toString("base64") };
    reads = [seriesRead("2026-11-13", [{ id: 101, day: "2026-11-10" }, { id: 102, day: "2026-11-11" }, { id: 103, day: "2026-11-12" }, { id: 104, day: "2026-11-13" }]),
      seriesRead("2026-11-10", [{ id: 101, day: "2026-11-10" }])];
    const saved = await app.inject({ method: "PUT", url: "/api/v1/team-tasks/102", payload });
    assert.equal(saved.statusCode, 200, saved.body);
    // From Wednesday on: Wednesdays and Fridays at 10:00 in Room 2, as a new series.
    assert.deepEqual(saved.json(), { id: 201, rowVersion: Buffer.alloc(8, 9).toString("base64"), manDays: 0.25, seriesId: 5, count: 4, replaced: true, calendar: "sent" });
    const insert = statements.find((entry) => entry.statement.includes("INSERT dbo.team_task_series"))!;
    assert.deepEqual(JSON.parse(String(insert.parameters.dates)), ["2026-11-11", "2026-11-13", "2026-11-18", "2026-11-20"]);
    // The old series now ends on Tuesday; the new one is invited.
    assert.deepEqual(invites.map((invite) => [invite.method, invite.task.id, invite.task.repeat?.until, invite.task.startTime, invite.task.meetingPlace]),
      [["REQUEST", 4, "2026-11-10", "09:00", "https://teams.example.com/x"], ["REQUEST", 5, "2026-11-20", "10:00", "Room 2"]]);
    // A task that happens once, made to repeat: it goes (its own entry is cancelled) and the repeat takes its place.
    invites.length = 0;
    current = { ...current, id: 31, series_id: null, occurrence_date: null };
    const repeated = await app.inject({ method: "PUT", url: "/api/v1/team-tasks/31", payload: { ...payload, applyTo: undefined } });
    assert.equal(repeated.statusCode, 200, repeated.body);
    assert.equal(repeated.json().seriesId, 5);
    assert.deepEqual(invites.map((invite) => [invite.method, invite.task.id]), [["CANCEL", 31], ["REQUEST", 5]]);
    assert.ok(statements.some((entry) => entry.statement.includes("SET deleted_at=SYSUTCDATETIME(),updated_by=@actor,updated_at=SYSUTCDATETIME() WHERE id=@id") && entry.parameters.id === 31));
  } finally {
    await app.close();
  }
});
