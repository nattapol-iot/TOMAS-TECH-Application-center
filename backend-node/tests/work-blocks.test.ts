import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import Fastify from "fastify";
import sql from "mssql";
import type { Transaction } from "mssql";
import type { Database } from "../src/db.js";
import { GraphReadError } from "../src/email.js";
import { registerErrorHandler } from "../src/errors.js";
import { bangkokToday } from "../src/issue-batches.js";
import { outlookRows } from "../src/outlook-calendar.js";
import { blockEvent, outlookWriteSummary, writeBlock, type BlockForOutlook, type GraphWriter } from "../src/outlook-write.js";
import { WORK_DAYS_SQL, workDaysRead } from "../src/routes/work-days.js";
import { registerWorkBlockRoutes, resolveBlockWork, weekResponse } from "../src/routes/work-blocks.js";
import type { CurrentUserService } from "../src/users.js";
import { isBookable, overlapsBlock, parseBlockInput, parseBlockPatch, parseBlockTime, timeText } from "../src/work-blocks.js";
import { addDays, coveredMinutes, draftDay, outlookSpan } from "../src/work-days.js";

// ── One block of time ───────────────────────────────────────────────────────

test("a block: quarter-hour times on one day, at most 12 hours, for a piece of work or a note", () => {
  assert.equal(parseBlockTime("08:30", "Start"), 510);
  assert.equal(parseBlockTime("24:00", "End"), 1440);
  assert.equal(timeText(510), "08:30");
  for (const bad of ["8:30", "08:10", "24:15", "12:60", 830]) assert.throws(() => parseBlockTime(bad, "Start"), /time|quarter/);
  assert.deepEqual(parseBlockInput({ date: "2026-11-25", start: "08:30", end: "10:00", workKey: "Project-11" }), { date: "2026-11-25", start: 510, end: 600, work: { workKey: "Project-11" } });
  assert.deepEqual(parseBlockInput({ date: "2026-11-25", start: "13:00", end: "14:00", note: " Training ", projectId: 4 }).work, { workKey: null, note: "Training", projectId: 4 });
  assert.throws(() => parseBlockInput({ date: "2026-11-25", start: "10:00", end: "10:00", workKey: "Project-11" }), /end after/);
  assert.throws(() => parseBlockInput({ date: "2026-11-25", start: "06:00", end: "18:15", workKey: "Project-11" }), /at most 12 hours/);
  assert.throws(() => parseBlockInput({ date: "2026-11-25", start: "08:00", end: "09:00" }), /Choose the work/);
  assert.throws(() => parseBlockInput({ date: "2026-11-25", start: "08:00", end: "09:00", workKey: "Outlook-7" }), /one of your pieces of work/);
  assert.throws(() => parseBlockInput({ date: "2026-11-25", start: "08:00", end: "09:00", note: "  " }), /note/);
  assert.deepEqual(parseBlockPatch({ start: "09:00" }), { start: 540 });
  assert.throws(() => parseBlockPatch({}), /Nothing to change/);
});

test("blocks never overlap each other; touching ends do not count; booking runs from 30 days back to 180 ahead", () => {
  const day = [
    { id: 1, start: 510, end: 600 },
    { id: 2, start: 780, end: 900 },
  ];
  assert.equal(overlapsBlock(day, 600, 660), false);
  assert.equal(overlapsBlock(day, 590, 660), true);
  assert.equal(overlapsBlock(day, 520, 580, 1), false, "a block may move inside its own time");
  assert.equal(isBookable("2026-11-23", "2026-11-23"), true);
  assert.equal(isBookable(addDays("2026-11-23", -30), "2026-11-23"), true);
  assert.equal(isBookable(addDays("2026-11-23", -31), "2026-11-23"), false);
  assert.equal(isBookable(addDays("2026-11-23", 181), "2026-11-23"), false);
  assert.equal(
    coveredMinutes(510, 720, [
      { start: 540, end: 600 },
      { start: 570, end: 630 },
      { start: 700, end: 800 },
    ]),
    90 + 20,
  );
  assert.deepEqual(outlookSpan({ allDay: false, start: "2026-11-25T13:00:00", end: "2026-11-25T14:00:00" }, "2026-11-25"), { start: 780, end: 840 });
  assert.equal(outlookSpan({ allDay: true, start: "2026-11-25T00:00:00", end: "2026-11-26T00:00:00" }, "2026-11-25"), null);
});

// ── The day drafted from the calendar ───────────────────────────────────────

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
  plan_start: "2026-11-23",
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
const at = (date: string) => new Date(`${date}T00:00:00Z`);

/**
 * The week of Monday 23 November 2026 for person 9: Wiring (5 MD Mon-Fri, PIC 9) and PLC (5 MD, PIC 9) on project P-1,
 * a 13:00-14:00 vendor call in Outlook on Wednesday, and (when asked) blocks booked on My week.
 */
function weekSets(change: { blocks?: Record<string, unknown>[]; links?: Record<string, unknown>[]; totals?: Record<string, unknown>[]; teamTasks?: Record<string, unknown>[] } = {}) {
  const schedule = [
    raw({ id: 10, kind: "phase", name: "Build", plan_start: null }),
    raw({ id: 11, parent_id: 10, name: "Wiring", plan_man_days: 5 }),
    raw({ id: 12, parent_id: 10, sort_order: 2, name: "PLC", plan_man_days: 5 }),
  ];
  const workload = [
    [],
    [],
    [],
    [],
    [{ id: 1, project_no: "P-1", customer_name: "ACME", visible: true }],
    schedule,
    [
      { task_id: 11, user_id: 9 },
      { task_id: 12, user_id: 9 },
    ],
    [],
    [],
    [],
  ];
  const outlook = [
    { id: 70, event_id: "AAMk-vendor", subject: "Vendor call", location: "Teams", is_private: false, is_all_day: false, start_at: "2026-11-25T13:00:00", end_at: "2026-11-25T14:00:00" },
  ];
  return [[], ...workload, change.teamTasks ?? [], [], outlook, [], [{ id: 1, project_no: "P-1", name: "Line 3" }], [], [], change.blocks ?? [], change.links ?? [], change.totals ?? []] as Record<
    string,
    unknown
  >[][];
}
const block = (change: Record<string, unknown>) => ({
  id: 1,
  work_date: at("2026-11-25"),
  start_minute: 510,
  end_minute: 600,
  work_key: "Project-11",
  project_id: 1,
  project_no: "P-1",
  title: "Wiring",
  outlook_state: "Synced",
  outlook_error: null,
  ...change,
});
const hoursOf = (rows: { workKey: string | null; title: string; hours: number }[]) => Object.fromEntries(rows.map((row) => [row.workKey ?? `note:${row.title}`, row.hours]));

test("the draft: a day with blocks is what the person booked, less the minutes a meeting took; other days still follow the plan", () => {
  const blocks = [
    block({ id: 1, start_minute: 510, end_minute: 720 }), // Wiring 08:30-12:00
    block({ id: 2, start_minute: 780, end_minute: 900, work_key: "Project-12", title: "PLC" }), // PLC 13:00-15:00, the call takes 13:00-14:00
    block({ id: 3, start_minute: 900, end_minute: 990, work_key: null, project_id: null, project_no: null, title: "Training" }), // other work
  ];
  const read = workDaysRead(weekSets({ blocks }), 9, "2026-11-23", "2026-11-27");
  assert.deepEqual(hoursOf(draftDay("2026-11-25", read.draftInput).rows), { "Project-11": 3.5, "Project-12": 1, "note:Training": 1.5, "Outlook-70": 1 });
  const other = draftDay("2026-11-25", read.draftInput).rows.find((row) => row.workKey === null)!;
  assert.deepEqual([other.kind, other.projectId], ["Other", null]);
  // Tuesday has no blocks: Wiring and PLC share the day as before.
  assert.deepEqual(hoursOf(draftDay("2026-11-24", read.draftInput).rows), { "Project-11": 4, "Project-12": 4 });
  // A block whose work has left the person's plan drafts as a note towards its project.
  const gone = workDaysRead(weekSets({ blocks: [block({ work_key: "Project-99", title: "Old row" })] }), 9, "2026-11-23", "2026-11-27");
  assert.deepEqual(draftDay("2026-11-25", gone.draftInput).rows.find((row) => row.title === "Old row")?.kind, "ProjectOther");
});

test("the draft: a meeting tied to a piece of work counts there, on one line with the work's own blocks", () => {
  const read = workDaysRead(
    weekSets({ blocks: [block({ start_minute: 540, end_minute: 600, work_key: "Project-12", title: "PLC" })], links: [{ event_id: "AAMk-vendor", work_key: "Project-12" }] }),
    9,
    "2026-11-23",
    "2026-11-27",
  );
  assert.deepEqual(hoursOf(draftDay("2026-11-25", read.draftInput).rows), { "Project-12": 2 });
  // Without blocks the tied meeting still goes to its work, and the plan shares the rest of the day.
  const plain = workDaysRead(weekSets({ links: [{ event_id: "AAMk-vendor", work_key: "Project-12" }] }), 9, "2026-11-23", "2026-11-27");
  assert.deepEqual(hoursOf(draftDay("2026-11-25", plain.draftInput).rows), { "Project-11": 3.5, "Project-12": 4.5 });
});

test("the week: blocks with their Outlook state, meetings with the work they are tied to, and open work with its hours", () => {
  const read = workDaysRead(
    weekSets({
      blocks: [block({ id: 5, outlook_state: "Denied", outlook_error: "Access is denied." })],
      links: [{ event_id: "AAMk-vendor", work_key: "Project-11" }],
      totals: [{ work_key: "Project-11", hours: 6 }],
    }),
    9,
    "2026-11-23",
    "2026-11-27",
  );
  const week = weekResponse(read, "2026-11-23", "2026-11-27", "2026-11-25", true);
  assert.equal(week.days.length, 5);
  assert.deepEqual(
    week.blocks.map((item) => [item.id, item.date, item.start, item.end, item.kind, item.projectNo, item.outlookState]),
    [[5, "2026-11-25", "08:30", "10:00", "Project", "P-1", "Denied"]],
  );
  assert.deepEqual(
    week.meetings.map((item) => [item.id, item.subject, item.location, item.linkedWorkKey]),
    [[70, "Vendor call", "Teams", "Project-11"]],
  );
  const wiring = week.backlog.find((item) => item.workKey === "Project-11")!;
  assert.deepEqual([wiring.budgetHours, wiring.confirmedHours, wiring.bookedHours, wiring.projectNo], [40, 6, 1.5, "P-1"]);
  assert.deepEqual(week.outlookWrite, { state: "denied", waiting: 1 });
  assert.deepEqual(outlookWriteSummary([], false), { state: "off", waiting: 0 });
  assert.deepEqual(outlookWriteSummary(["Synced", "Pending"], true), { state: "pending", waiting: 1 });
  // The work a block names must be the person's; other work may count only towards their own projects.
  assert.deepEqual(resolveBlockWork({ workKey: "Project-12" }, read), { workKey: "Project-12", projectId: 1, title: "PLC" });
  assert.throws(() => resolveBlockWork({ workKey: "Project-99" }, read), /not yours/);
  assert.throws(() => resolveBlockWork({ workKey: "Outlook-70" }, read), /not yours/);
  assert.throws(() => resolveBlockWork({ workKey: null, note: "Help", projectId: 3 }, read), /project you work on/);
});

// ── Into Outlook ────────────────────────────────────────────────────────────

test("the Outlook entry: project and work as the subject, busy, no reminder, Bangkok times, midnight on the next day", () => {
  const entry = blockEvent({ date: "2026-11-25", start: 510, end: 1440, title: "Wiring", projectNo: "P-1" });
  assert.equal(entry.subject, "P-1 · Wiring");
  assert.deepEqual(entry.start, { dateTime: "2026-11-25T08:30:00", timeZone: "SE Asia Standard Time" });
  assert.deepEqual(entry.end, { dateTime: "2026-11-26T00:00:00", timeZone: "SE Asia Standard Time" });
  assert.equal(entry.showAs, "busy");
  assert.equal(entry.isReminderOn, false);
  assert.deepEqual(entry.categories, ["IoT Team Center"]);
  assert.equal(blockEvent({ date: "2026-11-25", start: 510, end: 600, title: "Training", projectNo: null }).subject, "Training");
});

function graph(replies: Record<string, unknown>) {
  const calls: { method: string; path: string; body?: unknown }[] = [];
  const writer: GraphWriter = {
    graphEnabled: true,
    graphSend: async <T>(method: "POST" | "PATCH" | "DELETE", path: string, body?: unknown) => {
      calls.push({ method, path, body });
      const reply = replies[method];
      if (reply instanceof Error) throw reply;
      return (reply ?? null) as T | null;
    },
  };
  return { writer, calls };
}
const outlookBlock = (change: Partial<BlockForOutlook> = {}): BlockForOutlook => ({
  id: 1,
  date: "2026-11-25",
  start: 510,
  end: 600,
  title: "Wiring",
  projectNo: "P-1",
  eventId: null,
  deleted: false,
  state: "Pending",
  ...change,
});

test("writing a block: new entries are created, changed ones patched (created again if removed in Outlook), removed ones deleted", async () => {
  const created = graph({ POST: { id: "evt-1", iCalUId: "uid-1" } });
  assert.deepEqual(await writeBlock(created.writer, "somchai@example.com", outlookBlock()), { state: "Synced", eventId: "evt-1", icalUid: "uid-1", error: null, gone: false });
  assert.deepEqual(
    created.calls.map((call) => [call.method, call.path]),
    [["POST", "/users/somchai%40example.com/events"]],
  );

  const patched = graph({ PATCH: { id: "evt-1", iCalUId: "uid-1" } });
  assert.equal((await writeBlock(patched.writer, "somchai@example.com", outlookBlock({ eventId: "evt-1" }))).state, "Synced");
  assert.deepEqual(
    patched.calls.map((call) => call.method),
    ["PATCH"],
  );

  const vanished = graph({ PATCH: new GraphReadError(404, "ErrorItemNotFound", "gone"), POST: { id: "evt-2", iCalUId: "uid-2" } });
  assert.equal((await writeBlock(vanished.writer, "somchai@example.com", outlookBlock({ eventId: "evt-1" }))).eventId, "evt-2");

  const removed = graph({ DELETE: new GraphReadError(404, "ErrorItemNotFound", "gone") });
  assert.deepEqual(await writeBlock(removed.writer, "somchai@example.com", outlookBlock({ eventId: "evt-1", deleted: true })), {
    state: "Synced",
    eventId: null,
    icalUid: null,
    error: null,
    gone: true,
  });
  const neverWritten = graph({});
  assert.equal((await writeBlock(neverWritten.writer, "somchai@example.com", outlookBlock({ deleted: true }))).gone, true);
  assert.equal(neverWritten.calls.length, 0);
});

test("writing a block: a refusal waits for the permission, other failures are tried again, and Graph switched off writes nothing", async () => {
  const refused = graph({ POST: new GraphReadError(403, "ErrorAccessDenied", "Access is denied.") });
  assert.deepEqual(await writeBlock(refused.writer, "somchai@example.com", outlookBlock()), { state: "Denied", eventId: null, icalUid: null, error: "Access is denied.", gone: false });
  const broken = graph({ POST: new GraphReadError(503, "ServiceUnavailable", "Try later") });
  assert.equal((await writeBlock(broken.writer, "somchai@example.com", outlookBlock())).state, "Failed");
  const off: GraphWriter = {
    graphEnabled: false,
    graphSend: async () => {
      throw new Error("not called");
    },
  };
  assert.equal((await writeBlock(off, "somchai@example.com", outlookBlock())).state, "Off");
});

test("the Outlook read leaves out the entries the app wrote for booked time", () => {
  const events = [
    { id: "evt-1", iCalUId: "uid-1", subject: "P-1 · Wiring", start: { dateTime: "2026-11-25T08:30:00.0000000" }, end: { dateTime: "2026-11-25T10:00:00.0000000" } },
    { id: "evt-9", iCalUId: "uid-9", subject: "Vendor call", start: { dateTime: "2026-11-25T13:00:00.0000000" }, end: { dateTime: "2026-11-25T14:00:00.0000000" } },
  ];
  assert.deepEqual(
    outlookRows(events, "", new Set(["evt-1"])).map((row) => row.subject),
    ["Vendor call"],
  );
  assert.deepEqual(
    outlookRows(events, "", new Set(["uid-1"])).map((row) => row.subject),
    ["Vendor call"],
  );
  assert.equal(outlookRows(events).length, 2);
});

// ── The routes ──────────────────────────────────────────────────────────────

type Params = Record<string, unknown>;
const today = bangkokToday();

/** The reads answer with `sets`; the transaction's statements and the Outlook pushes are recorded. */
function harness(
  t: TestContext,
  options: { sets?: Record<string, unknown>[][]; dayBlocks?: Record<string, unknown>[]; current?: Record<string, unknown> | null; meeting?: Record<string, unknown> | null } = {},
) {
  const statements: { sql: string; params: Params }[] = [],
    writes: { sql: string; params: Params }[] = [];
  const bags = new WeakMap<object, Params>();
  t.mock.method(sql.Request.prototype, "input", function (this: object, name: string, ...rest: unknown[]) {
    const bag = bags.get(this) ?? {};
    bag[name] = rest.length > 1 ? rest[1] : rest[0];
    bags.set(this, bag);
    return this;
  });
  t.mock.method(sql.Request.prototype, "query", async function (this: object, statement: string) {
    writes.push({ sql: statement, params: { ...(bags.get(this) ?? {}) } });
    if (/FROM dbo\.work_blocks WITH \(UPDLOCK/.test(statement)) return { recordset: options.dayBlocks ?? [], rowsAffected: [0] };
    if (/INSERT dbo\.work_blocks/.test(statement)) return { recordset: [{ id: 31 }], rowsAffected: [1] };
    return { recordset: [], rowsAffected: [1] };
  });
  const app = Fastify();
  registerErrorHandler(app);
  const database = {
    query: async (statement: string, bind?: (request: { input: (name: string, ...rest: unknown[]) => unknown }) => void) => {
      const params: Params = {};
      const request = {
        input(name: string, ...rest: unknown[]) {
          params[name] = rest.length > 1 ? rest[1] : rest[0];
          return request;
        },
      };
      bind?.(request);
      statements.push({ sql: statement, params });
      if (statement === WORK_DAYS_SQL) {
        const sets = options.sets ?? weekSets();
        return { recordsets: sets, recordset: sets[0] };
      }
      if (/SELECT outlook_state,outlook_error/.test(statement)) return { recordset: [{ outlook_state: "Synced", outlook_error: null }], rowsAffected: [1] };
      if (/SELECT TOP \(\d+\) b\.id/.test(statement)) return { recordset: [], rowsAffected: [0] };
      if (/SELECT work_date,start_minute/.test(statement))
        return {
          recordset:
            options.current === undefined
              ? [{ work_date: at(today), start_minute: 510, end_minute: 600, work_key: "Project-11", project_id: 1, title: "Wiring" }]
              : options.current
                ? [options.current]
                : [],
          rowsAffected: [1],
        };
      if (/FROM dbo\.outlook_events WHERE id=@id/.test(statement))
        return { recordset: options.meeting === undefined ? [{ event_id: "AAMk-vendor", start_date: today }] : options.meeting ? [options.meeting] : [], rowsAffected: [1] };
      return { recordset: [], rowsAffected: [1] };
    },
    transaction: async <T>(work: (transaction: Transaction) => Promise<T>) => work({} as Transaction),
  } as unknown as Database;
  const users = { required: async () => ({ id: 9, email: "somchai@example.com", role: "Engineer", roles: ["Engineer"] }) } as unknown as CurrentUserService;
  registerWorkBlockRoutes(app, database, users, { graphEnabled: false });
  return { app, statements, writes };
}

/** The week sets, with Wiring and PLC running through today. */
const todaySets = (change: Parameters<typeof weekSets>[0] = {}) => {
  const sets = weekSets(change);
  sets[6] = (sets[6] ?? []).map((row) => ({ ...row, plan_start: row.plan_start ? addDays(today, -2) : null }));
  return sets;
};

test("POST work-blocks: books the person's own time for their work, and refuses overlaps, other people's work and days out of range", async (t) => {
  const { app, writes, statements } = harness(t, { sets: todaySets() });
  try {
    const booked = await app.inject({ method: "POST", url: "/api/v1/me/work-blocks", payload: { date: today, start: "08:30", end: "10:00", workKey: "Project-11" } });
    assert.equal(booked.statusCode, 201, booked.body);
    assert.deepEqual(booked.json(), { id: 31, outlookState: "Synced", outlookError: null });
    const insert = writes.find((write) => /INSERT dbo\.work_blocks/.test(write.sql))!;
    assert.deepEqual(
      [insert.params.actor, insert.params.date, insert.params.start, insert.params.end, insert.params.key, insert.params.project, insert.params.title],
      [9, today, 510, 600, "Project-11", 1, "Wiring"],
    );
    assert.equal(statements.find((statement) => statement.sql === WORK_DAYS_SQL)?.params.actor, 9, "only the person's own work is read");

    const theirs = await app.inject({ method: "POST", url: "/api/v1/me/work-blocks", payload: { date: today, start: "10:00", end: "11:00", workKey: "Project-99" } });
    assert.equal(theirs.statusCode, 422);
    const far = await app.inject({ method: "POST", url: "/api/v1/me/work-blocks", payload: { date: addDays(today, 200), start: "10:00", end: "11:00", workKey: "Project-11" } });
    assert.equal(far.statusCode, 409);
  } finally {
    await app.close();
  }
});

// One harness per test: Bun does not undo a second mock of the same method in one test, so the fake SQL would leak
// into every later test file.
test("POST work-blocks refuses a block that overlaps another", async (t) => {
  const busy = harness(t, { sets: todaySets(), dayBlocks: [{ id: 4, start_minute: 540, end_minute: 660 }] });
  try {
    const overlap = await busy.app.inject({ method: "POST", url: "/api/v1/me/work-blocks", payload: { date: today, start: "08:30", end: "10:00", workKey: "Project-11" } });
    assert.equal(overlap.statusCode, 409);
    assert.equal(overlap.json().code, "work_block_overlap");
  } finally {
    await busy.app.close();
  }
});

test("PATCH and DELETE work-blocks: the person's own blocks only; a move is checked against the day it lands on", async (t) => {
  const { app, writes } = harness(t, { sets: todaySets() });
  try {
    const moved = await app.inject({ method: "PATCH", url: "/api/v1/me/work-blocks/7", payload: { start: "13:00", end: "15:00" } });
    assert.equal(moved.statusCode, 200, moved.body);
    const update = writes.find((write) => /UPDATE dbo\.work_blocks SET work_date/.test(write.sql))!;
    assert.match(update.sql, /outlook_state=N'Pending'/);
    assert.match(update.sql, /revision=revision\+1/);
    assert.deepEqual([update.params.id, update.params.actor, update.params.start, update.params.end, update.params.key], [7, 9, 780, 900, "Project-11"]);
    const removed = await app.inject({ method: "DELETE", url: "/api/v1/me/work-blocks/7" });
    assert.equal(removed.statusCode, 204);
  } finally {
    await app.close();
  }
});

test("PATCH work-blocks answers 404 for a block that is not the person's", async (t) => {
  const missing = harness(t, { current: null });
  try {
    const response = await missing.app.inject({ method: "PATCH", url: "/api/v1/me/work-blocks/8", payload: { start: "13:00" } });
    assert.equal(response.statusCode, 404);
  } finally {
    await missing.app.close();
  }
});

test("GET week and PUT outlook-links: the person's own week; a meeting is tied only to their own work", async (t) => {
  const { app, statements } = harness(t, { sets: todaySets() });
  try {
    const week = await app.inject({ method: "GET", url: `/api/v1/me/week?from=${today}&to=${addDays(today, 6)}` });
    assert.equal(week.statusCode, 200, week.body);
    const body = week.json();
    assert.equal(body.days.length, 7);
    assert.deepEqual(body.outlookWrite, { state: "off", waiting: 0 });
    assert.ok(body.backlog.some((item: { workKey: string }) => item.workKey === "Project-11"));
    assert.equal((await app.inject({ method: "GET", url: `/api/v1/me/week?from=${today}&to=${addDays(today, 20)}` })).statusCode, 400);

    const tied = await app.inject({ method: "PUT", url: "/api/v1/me/outlook-links", payload: { outlookId: 70, workKey: "Project-12" } });
    assert.equal(tied.statusCode, 200, tied.body);
    const merge = statements.find((statement) => /MERGE dbo\.outlook_event_links/.test(statement.sql))!;
    assert.deepEqual([merge.params.actor, merge.params.event, merge.params.key], [9, "AAMk-vendor", "Project-12"]);
    assert.equal((await app.inject({ method: "PUT", url: "/api/v1/me/outlook-links", payload: { outlookId: 70, workKey: "Project-99" } })).statusCode, 422);
    const untied = await app.inject({ method: "PUT", url: "/api/v1/me/outlook-links", payload: { outlookId: 70, workKey: null } });
    assert.equal(untied.statusCode, 200);
    assert.ok(statements.some((statement) => /DELETE dbo\.outlook_event_links/.test(statement.sql)));
  } finally {
    await app.close();
  }
});

test("PUT outlook-links answers 404 for a meeting that is gone", async (t) => {
  const gone = harness(t, { meeting: null });
  try {
    assert.equal((await gone.app.inject({ method: "PUT", url: "/api/v1/me/outlook-links", payload: { outlookId: 71, workKey: "Project-11" } })).statusCode, 404);
  } finally {
    await gone.app.close();
  }
});
