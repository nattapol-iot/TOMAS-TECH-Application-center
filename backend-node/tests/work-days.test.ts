import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import Fastify from "fastify";
import sql from "mssql";
import type { Transaction } from "mssql";
import type { Database } from "../src/db.js";
import { registerErrorHandler } from "../src/errors.js";
import { bangkokToday } from "../src/issue-batches.js";
import { WORK_DAYS_SQL, registerWorkDayRoutes, workDaysRead, workDaysResponse } from "../src/routes/work-days.js";
import type { CurrentUserService } from "../src/users.js";
import { addDays, draftDay, outlookHours, parseDayRows, planShares, quarterHours, resolveDayRows, teamTaskShare, type WorkChoice } from "../src/work-days.js";
import type { WorkloadItem } from "../src/resource-workload.js";

// ── The draft rules ─────────────────────────────────────────────────────────

const item = (change: Partial<WorkloadItem>): WorkloadItem => ({
  key: "Project-11-9",
  workKey: "Project-11",
  type: "Project",
  entityId: 1,
  ownerId: 9,
  reference: "P-1 · 1.1",
  title: "Wiring",
  customer: "ACME",
  start: "2026-10-05",
  end: "2026-10-09",
  manDays: 5,
  progress: 0,
  status: "Not Started",
  ...change,
});
const noHolidays = new Set<string>();

test("quarterHours: figures go to the quarter hour and still add up to the total", () => {
  const hours = quarterHours(
    [16 / 3, 16 / 3, 16 / 3].map((value) => value / 2),
    8,
  );
  assert.equal(
    hours.reduce((sum, value) => sum + value, 0),
    8,
  );
  for (const value of hours) assert.equal(value * 4, Math.round(value * 4));
  assert.deepEqual(quarterHours([16 / 3, 8 / 3], 8), [5.25, 2.75]);
});

test("planShares: man-days spread over working days, people typed per day, and a full day for plan work with no man-days", () => {
  // 5 MD over Mon-Fri is 1 MD a day; nothing on the weekend.
  assert.deepEqual(
    planShares([item({})], "2026-10-06", noHolidays).map((share) => share.manDays),
    [1],
  );
  assert.equal(planShares([item({})], "2026-10-10", noHolidays).length, 0);
  // A holiday is not a working day, so the same effort spreads over four days.
  assert.equal(planShares([item({})], "2026-10-06", new Set(["2026-10-07"]))[0]!.manDays, 1.25);
  // People typed on a Saturday inside the row's dates: that day takes exactly what was typed.
  assert.deepEqual(
    planShares([item({ end: "2026-10-11", byDay: { "2026-10-10": 0.5 } })], "2026-10-10", noHolidays).map((share) => share.manDays),
    [0.5],
  );
  // Two rows of one task with no man-days share one day; a piece with typed effort that day takes no extra day.
  const bare = [item({ key: "a", workKey: "Project-21", group: "Project-20", manDays: 0 }), item({ key: "b", workKey: "Project-22", group: "Project-20", manDays: 0 })];
  assert.deepEqual(
    planShares(bare, "2026-10-06", noHolidays).map((share) => share.manDays),
    [0.5, 0.5],
  );
  assert.deepEqual(
    planShares([...bare, item({ key: "c", workKey: "Project-23", group: "Project-20", manDays: 5 })], "2026-10-06", noHolidays).map((share) => share.item.workKey),
    ["Project-23"],
  );
  // Estimates and inquiries with no effort take no time of their own.
  assert.equal(planShares([item({ type: "Estimate", workKey: "Estimate-6", manDays: null })], "2026-10-06", noHolidays).length, 0);
});

test("teamTaskShare and outlookHours count as the team board counts", () => {
  const task = { id: 50, kind: "Task" as const, title: "FAT", projectId: 1, projectNo: "P-1", start: "2026-10-05", end: "2026-10-06", slot: "Day", startTime: null, endTime: null, manDays: 2 };
  assert.equal(teamTaskShare(task, "2026-10-06", noHolidays), 1);
  // A task across a weekend takes nothing on the weekend; one put on a Saturday takes it.
  assert.equal(teamTaskShare({ ...task, end: "2026-10-12", manDays: 6 }, "2026-10-10", noHolidays), 0);
  assert.equal(teamTaskShare({ ...task, start: "2026-10-10", end: "2026-10-10", manDays: 0.5 }, "2026-10-10", noHolidays), 0.5);
  assert.equal(teamTaskShare({ ...task, kind: "Away" }, "2026-10-06", noHolidays), 0);
  // 11:00-14:00 is two hours once lunch is taken off; an all-day event is a whole day.
  assert.equal(outlookHours({ allDay: false, start: "2026-10-07T11:00:00", end: "2026-10-07T14:00:00" }, "2026-10-07"), 2);
  assert.equal(outlookHours({ allDay: true, start: "2026-10-07T00:00:00", end: "2026-10-08T00:00:00" }, "2026-10-07"), 8);
  assert.equal(outlookHours({ allDay: true, start: "2026-10-07T00:00:00", end: "2026-10-08T00:00:00" }, "2026-10-08"), 0);
});

/** A dbo.schedule_tasks row as SQL Server returns it. */
const raw = (change: Record<string, unknown>) => ({
  id: 1,
  project_id: 1,
  parent_id: null,
  sort_order: 1,
  kind: "task",
  name: "Task",
  is_milestone: false,
  origin: "PM",
  created_by: 1,
  visibility: "Internal",
  plan_start: "2026-10-05",
  plan_days: 5,
  start_mode: "manual",
  predecessor_id: null,
  lag_days: 0,
  pic_external: "",
  plan_man_days: 0,
  baseline_start: null,
  baseline_end: null,
  baseline_days: 0,
  baseline_rev: 0,
  actual_start: null,
  actual_end: null,
  forecast_end: null,
  percent_done: 0,
  status: "Not Started",
  blocked_reason: null,
  note: null,
  actual_man_days: 0,
  updated_by: 1,
  updated_at: null,
  row_version: Buffer.alloc(8),
  ...change,
});

/**
 * The week of Monday 5 October 2026 for person 9: Wiring (10 MD over Mon-Fri, PICs 7 and 9, so 1 MD a day each),
 * Kick-off on Monday (1 MD, done since), a morning appointment on Tuesday, a 10:00-12:00 Outlook review on Wednesday,
 * an afternoon away on Thursday and a 4-hour customer issue on Friday.
 */
function weekSets(change: { teamTasks?: Record<string, unknown>[]; days?: Record<string, unknown>[]; lines?: Record<string, unknown>[] } = {}) {
  const schedule = [
    raw({ id: 10, kind: "phase", name: "Build", plan_start: null }),
    raw({ id: 11, parent_id: 10, name: "Wiring", plan_man_days: 10 }),
    raw({ id: 13, parent_id: 10, sort_order: 2, name: "Kick-off", plan_days: 1, plan_man_days: 1, percent_done: 100, status: "Done" }),
  ];
  const issues = [
    {
      id: 80,
      batch_id: 8,
      batch_no: "IS-202610-0001",
      line_no: 1,
      category: "Problem",
      function_name: "HMI",
      description: "Alarm text",
      assignee_id: 9,
      plan_start: "2026-10-09",
      plan_end: "2026-10-09",
      plan_hours: 4,
      state: "Open",
      project_ref: "P-1",
      customer_name: "ACME",
      visible: true,
    },
  ];
  const workload = [
    [],
    [],
    [],
    [],
    [{ id: 1, project_no: "P-1", customer_name: "ACME", visible: true }],
    schedule,
    [
      { task_id: 11, user_id: 7 },
      { task_id: 11, user_id: 9 },
      { task_id: 13, user_id: 9 },
    ],
    [],
    [],
    issues,
  ];
  const teamTasks = change.teamTasks ?? [
    {
      id: 50,
      kind: "Appointment",
      title: "Customer meeting",
      project_id: 1,
      project_no: "P-1",
      start_date: new Date("2026-10-06T00:00:00Z"),
      end_date: new Date("2026-10-06T00:00:00Z"),
      time_slot: "AM",
      start_time: null,
      end_time: null,
      man_days: 0.5,
    },
    {
      id: 51,
      kind: "Away",
      title: "Dentist",
      project_id: null,
      project_no: null,
      start_date: new Date("2026-10-08T00:00:00Z"),
      end_date: new Date("2026-10-08T00:00:00Z"),
      time_slot: "PM",
      start_time: null,
      end_time: null,
      man_days: 0,
    },
  ];
  const outlook = [{ id: 70, subject: "Design review", is_private: false, is_all_day: false, start_at: "2026-10-07T10:00:00", end_at: "2026-10-07T12:00:00" }];
  return [[], ...workload, teamTasks, [], outlook, [{ id: 80, project_id: 1, project_no: "P-1" }], [{ id: 1, project_no: "P-1", name: "Line 3" }], change.days ?? [], change.lines ?? []] as Record<
    string,
    unknown
  >[][];
}

const hoursOf = (rows: { workKey: string | null; hours: number }[]) => Object.fromEntries(rows.map((row) => [row.workKey, row.hours]));

test("the draft: a day holds 8 hours at most, meetings and time away first, finished work on past days only", () => {
  const read = workDaysRead(weekSets(), 9, "2026-10-05", "2026-10-12");
  const day = (date: string) => hoursOf(draftDay(date, read.draftInput).rows);
  // Monday: Wiring and the finished Kick-off, 1 MD each, share the 8 hours.
  assert.deepEqual(day("2026-10-05"), { "Project-11": 4, "Project-13": 4 });
  // Tuesday: Wiring 8 h and the half-day appointment 4 h are 12 h, brought to 8 in proportion.
  assert.deepEqual(day("2026-10-06"), { "Project-11": 5.25, "TeamTask-50": 2.75 });
  // Wednesday: the 2-hour review comes first; Wiring takes the other 6.
  assert.deepEqual(day("2026-10-07"), { "Project-11": 6, "Outlook-70": 2 });
  // Thursday: away in the afternoon.
  assert.deepEqual(day("2026-10-08"), { "Project-11": 4 });
  assert.equal(draftDay("2026-10-08", read.draftInput).awayHours, 4);
  // Friday: the issue's 4 plan hours are half a day next to Wiring's whole day.
  assert.deepEqual(day("2026-10-09"), { "Project-11": 5.25, "Issue-80": 2.75 });
  assert.deepEqual(day("2026-10-10"), {});
  // On the day itself, work already finished is no longer drafted.
  const sameDay = workDaysRead(weekSets(), 9, "2026-10-05", "2026-10-05");
  assert.deepEqual(hoursOf(draftDay("2026-10-05", sameDay.draftInput).rows), { "Project-11": 8 });
  // Person 7 shares Wiring but none of the rest, and person 9's work is not theirs to pick.
  assert.equal([...workDaysRead(weekSets(), 7, "2026-10-05", "2026-10-12").choices.keys()].includes("Issue-80"), false);
});

test("the response: confirmed days show their lines, others the draft; the issue counts towards its batch's project", () => {
  const sets = weekSets({
    days: [{ work_date: new Date("2026-10-05T00:00:00Z"), confirmed_at: new Date("2026-10-05T10:00:00Z"), times_confirmed: 2 }],
    lines: [
      { work_date: new Date("2026-10-05T00:00:00Z"), work_key: "Project-11", project_id: 1, project_no: "P-1", title: "Wiring", hours: 7, planned_hours: 4 },
      { work_date: new Date("2026-10-05T00:00:00Z"), work_key: null, project_id: null, project_no: null, title: "Training", hours: 1, planned_hours: null },
    ],
  });
  const response = workDaysResponse(workDaysRead(sets, 9, "2026-10-05", "2026-10-12"), "2026-10-05", "2026-10-11", "2026-10-12");
  assert.equal(response.days.length, 7);
  const monday = response.days[0]!;
  assert.deepEqual(monday.confirmed, { at: "2026-10-05T10:00:00.000Z", times: 2, hours: 8 });
  assert.deepEqual(
    monday.rows.map((row) => [row.kind, row.title, row.hours, row.plannedHours]),
    [
      ["Project", "Wiring", 7, 4],
      ["Other", "Training", 1, null],
    ],
  );
  assert.equal(monday.draftHours, 8);
  const friday = response.days[4]!;
  assert.equal(friday.confirmed, null);
  assert.deepEqual(
    friday.rows.find((row) => row.workKey === "Issue-80"),
    { workKey: "Issue-80", kind: "Issue", projectId: 1, projectNo: "P-1", title: "HMI · Alarm text", reference: "IS-202610-0001 #1", hours: 2.75, plannedHours: 2.75 },
  );
  assert.equal(response.days[5]!.working, false);
  assert.equal(response.days[0]!.editable, true);
  assert.deepEqual(response.projects, [{ id: 1, projectNo: "P-1", name: "Line 3" }]);
  assert.ok(
    response.choices.some((choice) => choice.workKey === "Project-13"),
    "work finished this week can still be picked",
  );
});

// ── A day sent for confirmation ─────────────────────────────────────────────

test("parseDayRows: quarter hours, one line per piece of work, a note for work typed by hand, 24 hours at most", () => {
  assert.deepEqual(parseDayRows({ rows: [] }), []);
  assert.deepEqual(
    parseDayRows({
      rows: [
        { workKey: "Project-11", hours: 6.5 },
        { projectId: 1, note: " Support ", hours: 1.5 },
      ],
    }),
    [
      { workKey: "Project-11", projectId: null, note: null, hours: 6.5 },
      { workKey: null, projectId: 1, note: "Support", hours: 1.5 },
    ],
  );
  for (const rows of [
    [{ workKey: "Project-11", hours: 0.3 }],
    [{ workKey: "Project-11", hours: 0 }],
    [{ workKey: "Project-11", hours: "2" }],
    [
      { workKey: "Project-11", hours: 2 },
      { workKey: "Project-11", hours: 1 },
    ],
    [{ workKey: "Bogus-1", hours: 1 }],
    [{ note: "", hours: 1 }],
    [{ note: "x".repeat(201), hours: 1 }],
    [
      { note: "Night shift", hours: 20 },
      { note: "More", hours: 4.25 },
    ],
  ])
    assert.throws(
      () => parseDayRows({ rows }),
      (error: unknown) => (error as { code?: string }).code === "validation_failed",
      JSON.stringify(rows),
    );
});

test("resolveDayRows: titles and projects come from the server; others' work and others' projects are refused", () => {
  const choices = new Map<string, WorkChoice>([["Project-11", { workKey: "Project-11", kind: "Project", projectId: 1, projectNo: "P-1", title: "Wiring", reference: "P-1 · 1.1" }]]);
  const projects = new Map([[1, { projectNo: "P-1" }]]);
  assert.deepEqual(
    resolveDayRows(
      [
        { workKey: "Project-11", projectId: null, note: null, hours: 6 },
        { workKey: null, projectId: 1, note: "Support", hours: 2 },
      ],
      choices,
      projects,
      new Map([["Project-11", 8]]),
    ),
    [
      { workKey: "Project-11", projectId: 1, title: "Wiring", hours: 6, plannedHours: 8 },
      { workKey: null, projectId: 1, title: "Support", hours: 2, plannedHours: null },
    ],
  );
  assert.throws(
    () => resolveDayRows([{ workKey: "Project-99", projectId: null, note: null, hours: 1 }], choices, projects, new Map()),
    (error: unknown) => (error as { code?: string }).code === "work_day_unknown_work",
  );
  assert.throws(
    () => resolveDayRows([{ workKey: null, projectId: 2, note: "Help", hours: 1 }], choices, projects, new Map()),
    (error: unknown) => (error as { code?: string }).code === "work_day_unknown_project",
  );
});

// ── Routes ──────────────────────────────────────────────────────────────────

type Params = Record<string, unknown>;

/** The read batch answers with `sets`; the save batch is recorded through mssql's Request. */
function harness(t: TestContext, sets: Record<string, unknown>[][]) {
  const reads: Params[] = [],
    saves: Params[] = [],
    starts: Params[] = [];
  const bags = new WeakMap<object, Params>();
  t.mock.method(sql.Request.prototype, "input", function (this: object, name: string, ...rest: unknown[]) {
    const bag = bags.get(this) ?? {};
    bag[name] = rest.length > 1 ? rest[1] : rest[0];
    bags.set(this, bag);
    return this;
  });
  t.mock.method(sql.Request.prototype, "query", async function (this: object, statement: string) {
    // A plan row worked on for the first time starts that day; here it was already started.
    if (/SET status=N'In Progress',actual_start=@date/.test(statement)) {
      starts.push({ ...(bags.get(this) ?? {}) });
      return { recordset: [], rowsAffected: [0] };
    }
    assert.match(statement, /INSERT dbo\.work_hours/);
    saves.push({ ...(bags.get(this) ?? {}) });
    return { recordset: [{ confirmed_at: new Date("2026-10-05T10:00:00Z"), times_confirmed: 1 }], rowsAffected: [1] };
  });
  const app = Fastify();
  registerErrorHandler(app);
  const database = {
    query: async (statement: string, bind?: (request: { input: (name: string, ...rest: unknown[]) => unknown }) => void) => {
      assert.equal(statement, WORK_DAYS_SQL);
      const params: Params = {};
      const request = {
        input(name: string, ...rest: unknown[]) {
          params[name] = rest.length > 1 ? rest[1] : rest[0];
          return request;
        },
      };
      bind?.(request);
      reads.push(params);
      return { recordsets: sets, recordset: sets[0] };
    },
    transaction: async <T>(work: (transaction: Transaction) => Promise<T>) => work({} as Transaction),
  } as unknown as Database;
  const users = { required: async () => ({ id: 9, role: "Engineer", roles: ["Engineer"] }) } as unknown as CurrentUserService;
  registerWorkDayRoutes(app, database, users);
  return { app, reads, saves, starts };
}

const today = bangkokToday();
const onToday = (change: Record<string, unknown> = {}) => ({
  id: 50,
  kind: "Task",
  title: "FAT checklist",
  project_id: 1,
  project_no: "P-1",
  start_date: new Date(`${today}T00:00:00Z`),
  end_date: new Date(`${today}T00:00:00Z`),
  time_slot: "Day",
  start_time: null,
  end_time: null,
  man_days: 0.5,
  ...change,
});

test("GET work-days: reads only the person's own work, for a window of at most 14 days", async (t) => {
  const { app, reads } = harness(t, weekSets({ teamTasks: [onToday()] }));
  try {
    const response = await app.inject({ method: "GET", url: `/api/v1/me/work-days?from=${addDays(today, -6)}&to=${today}` });
    assert.equal(response.statusCode, 200, response.body);
    const body = response.json();
    assert.equal(body.today, today);
    assert.equal(body.days.length, 7);
    assert.equal(body.hoursPerDay, 8);
    assert.deepEqual(
      body.days.at(-1).draft.map((row: { workKey: string; hours: number }) => [row.workKey, row.hours]),
      [["TeamTask-50", 4]],
    );
    assert.deepEqual(
      { actor: reads[0]!.actor, projectElevated: reads[0]!.project_elevated, taskElevated: reads[0]!.task_elevated, all: reads[0]!.all_work },
      { actor: 9, projectElevated: false, taskElevated: false, all: false },
    );
    const wide = await app.inject({ method: "GET", url: `/api/v1/me/work-days?from=${addDays(today, -14)}&to=${today}` });
    assert.equal(wide.statusCode, 400);
  } finally {
    await app.close();
  }
});

test("PUT work-days/:date: replaces the day with server titles; refuses future and old days and work that is not the person's", async (t) => {
  const { app, saves } = harness(t, weekSets({ teamTasks: [onToday()] }));
  try {
    const response = await app.inject({
      method: "PUT",
      url: `/api/v1/me/work-days/${today}`,
      payload: {
        rows: [
          { workKey: "TeamTask-50", hours: 3 },
          { projectId: 1, note: "Help on wiring", hours: 2.5 },
        ],
      },
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(saves.length, 1);
    assert.equal(saves[0]!.actor, 9);
    assert.equal(saves[0]!.date, today);
    assert.deepEqual(JSON.parse(String(saves[0]!.rows)), [
      { workKey: "TeamTask-50", projectId: 1, title: "FAT checklist", hours: 3, plannedHours: 4 },
      { workKey: null, projectId: 1, title: "Help on wiring", hours: 2.5, plannedHours: null },
    ]);
    assert.deepEqual(response.json().confirmed, { at: "2026-10-05T10:00:00.000Z", times: 1, hours: 5.5 });
    for (const [date, code] of [
      [addDays(today, 1), "work_day_closed"],
      [addDays(today, -31), "work_day_closed"],
    ] as const) {
      const refused = await app.inject({ method: "PUT", url: `/api/v1/me/work-days/${date}`, payload: { rows: [] } });
      assert.equal(refused.statusCode, 409);
      assert.equal(refused.json().code, code);
    }
    const notMine = await app.inject({ method: "PUT", url: `/api/v1/me/work-days/${today}`, payload: { rows: [{ workKey: "Project-777", hours: 1 }] } });
    assert.equal(notMine.statusCode, 422);
    assert.equal(notMine.json().code, "work_day_unknown_work");
    const otherProject = await app.inject({ method: "PUT", url: `/api/v1/me/work-days/${today}`, payload: { rows: [{ projectId: 2, note: "Help", hours: 1 }] } });
    assert.equal(otherProject.statusCode, 422);
    assert.equal(otherProject.json().code, "work_day_unknown_project");
    assert.equal(saves.length, 1, "nothing refused was written");
  } finally {
    await app.close();
  }
});

test("PUT work-days/:date: a line confirmed before stays valid after its work has left the person's plan", async (t) => {
  const { app, saves, starts } = harness(
    t,
    weekSets({
      teamTasks: [],
      days: [{ work_date: new Date(`${today}T00:00:00Z`), confirmed_at: new Date(), times_confirmed: 1 }],
      lines: [{ work_date: new Date(`${today}T00:00:00Z`), work_key: "Project-404", project_id: 1, project_no: "P-1", title: "Old row", hours: 2, planned_hours: 2 }],
    }),
  );
  try {
    const response = await app.inject({ method: "PUT", url: `/api/v1/me/work-days/${today}`, payload: { rows: [{ workKey: "Project-404", hours: 3 }] } });
    assert.equal(response.statusCode, 200, response.body);
    assert.deepEqual(JSON.parse(String(saves[0]!.rows)), [{ workKey: "Project-404", projectId: 1, title: "Old row", hours: 3, plannedHours: null }]);
    assert.equal(starts.length, 1, "the plan row worked on is offered to start that day");
    assert.deepEqual(JSON.parse(String(starts[0]!.ids)), [404]);
  } finally {
    await app.close();
  }
});

test("POST work-days/confirm: confirms drafted days as planned and leaves an empty or confirmed day alone", async (t) => {
  const yesterday = addDays(today, -1),
    before = addDays(today, -2);
  const { app, saves } = harness(
    t,
    weekSets({
      teamTasks: [onToday()],
      days: [{ work_date: new Date(`${before}T00:00:00Z`), confirmed_at: new Date(), times_confirmed: 1 }],
    }),
  );
  try {
    const response = await app.inject({ method: "POST", url: "/api/v1/me/work-days/confirm", payload: { dates: [today, yesterday, before] } });
    assert.equal(response.statusCode, 200, response.body);
    const body = response.json() as { confirmed: string[]; skipped: { date: string; reason: string }[] };
    assert.deepEqual(body.confirmed, [today]);
    assert.deepEqual(
      body.skipped.find((item) => item.date === before),
      { date: before, reason: "confirmed" },
    );
    assert.ok(["empty", "off"].includes(body.skipped.find((item) => item.date === yesterday)!.reason));
    assert.equal(saves.length, 1);
    assert.deepEqual(JSON.parse(String(saves[0]!.rows)), [{ workKey: "TeamTask-50", projectId: 1, title: "FAT checklist", hours: 4, plannedHours: 4 }]);
    const future = await app.inject({ method: "POST", url: "/api/v1/me/work-days/confirm", payload: { dates: [addDays(today, 1)] } });
    assert.equal(future.statusCode, 409);
  } finally {
    await app.close();
  }
});

test("confirmed hours on a plan row that has not started turn it In progress from that day (owner 2026-11-23)", async () => {
  const { plannedRowsWorked, START_ON_HOURS_SQL } = await import("../src/routes/work-days.js");
  const rows = [
    { workKey: "Project-12", projectId: 3, title: "Wiring", hours: 4, plannedHours: 4 },
    { workKey: "Project-12", projectId: 3, title: "Wiring again", hours: 2, plannedHours: 2 },
    { workKey: "Project-13", projectId: 3, title: "No hours", hours: 0, plannedHours: 8 },
    { workKey: "Issue-5", projectId: 3, title: "Issue", hours: 1, plannedHours: 1 },
    { workKey: null, projectId: 3, title: "Other", hours: 1, plannedHours: null },
  ];
  assert.deepEqual(plannedRowsWorked(rows), [12]);
  // Only a leaf row of an open project, still Not Started at 0% with no actual start.
  for (const rule of [
    /pic\.user_id=@actor\) OR NOT EXISTS/,
    /r\.state=N'Approved' AND r\.acknowledged_at IS NOT NULL AND r\.assignee_id=@actor/,
    /t\.status=N'Not Started'/,
    /t\.percent_done=0/,
    /t\.actual_start IS NULL/,
    /p\.status<>N'Closed'/,
    /NOT EXISTS\(SELECT 1 FROM dbo\.schedule_tasks c WHERE c\.parent_id=t\.id/,
    /t\.kind<>N'phase'/,
  ])
    assert.match(START_ON_HOURS_SQL, rule);
  assert.match(START_ON_HOURS_SQL, /SET status=N'In Progress',actual_start=@date/);
});
