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
import { WORKLOAD_SQL } from "../src/resource-workload.js";
import { TEAM_BOARD_SQL, canChangeTeamTask, defaultManDays, parseTeamTask, redactWork, registerTeamBoardRoutes } from "../src/routes/team-board.js";

const user = (id: number, roles: string[]): CurrentUser => ({ id, entraObjectId: "", email: "", name: `User ${id}`, role: roles[0]!, roles, department: "", isActive: true });

test("a team task needs only a subject and a date; the rest has defaults", () => {
  assert.deepEqual(parseTeamTask({ title: "  Site survey  ", startDate: "2026-10-22" }), {
    kind: "Task", title: "Site survey", customerId: null, assigneeIds: [], startDate: "2026-10-22", endDate: "2026-10-22", slot: "Day",
    startTime: null, manDays: null, status: "Planned", inquiryId: null, projectId: null, note: "",
  });
  // A day away takes no effort, whatever was sent.
  assert.equal(parseTeamTask({ kind: "Away", title: "Leave", startDate: "2026-10-22", assigneeIds: [7], manDays: 3 }).manDays, 0);
  // Several people, in the order chosen, each once; an older page's single assigneeId is a list of one.
  assert.deepEqual(parseTeamTask({ title: "Survey", startDate: "2026-10-22", assigneeIds: [9, "7", 9] }).assigneeIds, [9, 7]);
  assert.deepEqual(parseTeamTask({ title: "Survey", startDate: "2026-10-22", assigneeId: 9 }).assigneeIds, [9]);
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
    [{ title: "x", startDate: "2026-10-22", startTime: "25:00" }, "bad time"],
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
});

test("work the reader cannot open keeps its dates and effort, and loses what it is", () => {
  const item: WorkloadItem = {
    key: "Project-11-7", workKey: "Project-11", type: "Project", entityId: 1, ownerId: 7, reference: "P-1 · 1.1", title: "Wiring", customer: "ACME",
    start: "2026-10-19", end: "2026-10-23", manDays: 4, progress: 20, status: "In Progress", hidden: true,
  };
  assert.deepEqual(redactWork(item), {
    key: "Project-11-7", workKey: "Project-11", type: "Project", entityId: 0, ownerId: 7, reference: "", title: "", customer: "",
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
    end_date: new Date("2026-10-22T00:00:00Z"), time_slot: "AM", start_time: "09:30", man_days: 0.5, status: "Planned", inquiry_id: 3, inquiry_no: "INQ-3",
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
    assert.deepEqual([body.tasks[0].startDate, body.tasks[0].slot, body.tasks[0].startTime, body.tasks[0].rowVersion], ["2026-10-22", "AM", "09:30", Buffer.alloc(8, 1).toString("base64")]);
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
  const { app, demanded, invites } = boardServer(user(5, ["Sales Engineer"]));
  try {
    const response = await app.inject({ method: "POST", url: "/api/v1/team-tasks", payload: { kind: "Task", title: "Draft BOQ", assigneeIds: [9, 7], customerId: 4, startDate: "2026-10-22", endDate: "2026-10-26" } });
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
  const assignee = boardServer(user(9, ["Engineer"]));
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
