import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import Fastify from "fastify";
import sql from "mssql";
import type { Transaction } from "mssql";
import type { Database } from "../src/db.js";
import { ApiError, registerErrorHandler } from "../src/errors.js";
import { fitPeople, peopleChange, peopleEdits, peopleJson, peopleManDays, storedPeople, type PeopleRow } from "../src/plan-people.js";
import { plannedEffort } from "../src/manhour-budget.js";
import { registerScheduleRoutes } from "../src/routes/schedule.js";
import type { CurrentUserService } from "../src/users.js";

const work = (patch: Partial<PeopleRow> = {}): PeopleRow => ({ kind: "task", isMilestone: false, planStart: "2026-12-07", planDays: 5, startMode: "manual",
  predecessorId: null, lagDays: 0, planManDays: 4, laborSource: "Own", laborSupplier: "", peopleByDay: [], ...patch });
const free = { hasChildren: false, managed: false };
const refused = (run: () => unknown, code: string) => assert.throws(run, (error: unknown) => error instanceof ApiError && error.code === code);

test("people per day: stored leniently, cut to the row's length, empty days at the end dropped", () => {
  assert.deepEqual(storedPeople("[3,3,0,2,0,0]"), [3, 3, 0, 2]);
  for (const bad of [null, "", "x", "{}", "[1,-1]", "[1.55]", "[1000]", 5]) assert.deepEqual(storedPeople(bad), []);
  assert.deepEqual(storedPeople("[0.5,1.5,0]"), [0.5, 1.5], "a share of a day is kept to one decimal place");
  assert.equal(peopleManDays([0.1, 0.2, 0.5, 0.5]), 1.3, "shares add up without float noise");
  assert.deepEqual(fitPeople([3, 3, 0, 2, 4], 3), [3, 3]);
  assert.equal(peopleManDays([3, 3, 0, 2]), 8);
  assert.equal(peopleJson([0, 0]), null);
  assert.equal(peopleJson([2, 0, 1]), "[2,0,1]");
});

test("peopleEdits: each row names a task once and carries something valid to change", () => {
  assert.deepEqual(peopleEdits([{ taskId: 5, laborSource: "Outsourced", laborSupplier: "  ACME Manpower  " }, { taskId: 6, planStart: "2026-12-05", planDays: 3, people: [6, 6, 0] }]),
    [{ taskId: 5, laborSource: "Outsourced", laborSupplier: "ACME Manpower" }, { taskId: 6, plan: { planStart: "2026-12-05", planDays: 3, people: [6, 6] } }]);
  for (const bad of [null, [], [{}], [{ taskId: 5 }], [{ taskId: 5, laborSource: "Supplier" }], [{ taskId: 5, laborSource: "Own" }, { taskId: 5, laborSource: "Own" }],
    [{ taskId: 5, planStart: "2026-02-30", planDays: 1, people: [] }], [{ taskId: 5, planStart: "2026-12-05", planDays: 0, people: [] }],
    [{ taskId: 5, planStart: "2026-12-05", planDays: 2, people: [1, 1, 1] }], [{ taskId: 5, planStart: "2026-12-05", planDays: 2, people: [1.55] }],
    [{ taskId: 5, planStart: "2026-12-05", people: [1] }], [{ taskId: 5, laborSupplier: "x".repeat(201) }]]) refused(() => peopleEdits(bad), "validation_failed");
});

test("peopleChange: people give the row its man-days; clearing them all leaves none; a row never typed keeps its figure", () => {
  const typed = peopleChange(work(), "2026-12-07", { taskId: 1, plan: { planStart: "2026-12-07", planDays: 5, people: [3, 3, 3, 0, 2] } }, free);
  assert.deepEqual([typed.planManDays, typed.people, typed.planStart, typed.startMode], [11, [3, 3, 3, 0, 2], "2026-12-07", "manual"]);
  const cleared = peopleChange(work({ peopleByDay: [3, 3], planManDays: 6 }), "2026-12-07", { taskId: 1, plan: { planStart: "2026-12-07", planDays: 5, people: [] } }, free);
  assert.equal(cleared.planManDays, 0);
  const datesOnly = peopleChange(work(), "2026-12-07", { taskId: 1, plan: { planStart: "2026-12-07", planDays: 3, people: [] } }, free);
  assert.deepEqual([datesOnly.planManDays, datesOnly.planDays], [4, 3]);
});

test("peopleChange: one person on two tasks a day is half on each, and the man-days add up to one", () => {
  const edit = (people: number[]) => peopleEdits([{ taskId: 1, planStart: "2026-12-07", planDays: 2, people }])[0]!;
  const first = peopleChange(work(), "2026-12-07", edit([0.5, 0.5]), free), second = peopleChange(work(), "2026-12-07", edit([0.5, 0.5]), free);
  assert.deepEqual([first.people, first.planManDays, first.planManDays + second.planManDays], [[0.5, 0.5], 1, 2]);
});

test("peopleChange: a new first day unlinks a row that started after another; the same day keeps the link", () => {
  const linked = work({ planStart: null, startMode: "linked", predecessorId: 9, lagDays: 2 });
  const same = peopleChange(linked, "2026-12-07", { taskId: 1, plan: { planStart: "2026-12-07", planDays: 2, people: [1, 1] } }, free);
  assert.deepEqual([same.planStart, same.startMode, same.predecessorId, same.lagDays], [null, "linked", 9, 2]);
  const moved = peopleChange(linked, "2026-12-07", { taskId: 1, plan: { planStart: "2026-12-05", planDays: 4, people: [1, 1, 1, 1] } }, free);
  assert.deepEqual([moved.planStart, moved.startMode, moved.predecessorId, moved.lagDays], ["2026-12-05", "manual", null, 0]);
});

test("peopleChange: the labor source goes on any work row; the supplier is kept only for outsourced manpower", () => {
  const out = peopleChange(work(), "2026-12-07", { taskId: 1, laborSource: "Outsourced", laborSupplier: "ACME Manpower" }, { hasChildren: true, managed: true });
  assert.deepEqual([out.laborSource, out.laborSupplier, out.planManDays], ["Outsourced", "ACME Manpower", 4]);
  const back = peopleChange(work({ laborSource: "Outsourced", laborSupplier: "ACME Manpower" }), "2026-12-07", { taskId: 1, laborSource: "Own" }, free);
  assert.deepEqual([back.laborSource, back.laborSupplier], ["Own", ""]);
});

test("peopleChange: headings, roll-up rows, milestones and Resource Plan rows take no people", () => {
  const plan = { taskId: 1, plan: { planStart: "2026-12-07", planDays: 1, people: [1] } };
  refused(() => peopleChange(work({ kind: "phase" }), null, { taskId: 1, laborSource: "Own" }, free), "schedule_people_heading");
  refused(() => peopleChange(work(), "2026-12-07", plan, { hasChildren: true, managed: false }), "schedule_rollup_plan_derived");
  refused(() => peopleChange(work({ isMilestone: true }), "2026-12-07", plan, free), "schedule_people_milestone");
  refused(() => peopleChange(work(), "2026-12-07", plan, { hasChildren: false, managed: true }), "schedule_people_managed");
});

test("plannedEffort: outsourced rows are counted apart from our own staff", () => {
  const row = (id: number, parentId: number | null, kind: string, planManDays: number, laborSource?: string) => ({ id, parentId, kind, planManDays, isMilestone: false, laborSource });
  assert.deepEqual(plannedEffort([
    row(1, null, "phase", 0),
    row(2, 1, "task", 9, "Outsourced"),
    row(3, 1, "task", 4, "Own"),
    row(4, 1, "task", 50, "Own"),          // its sub rows carry the figures, each with its own mark
    row(5, 4, "task", 6, "Outsourced"),
    row(6, 4, "task", 2),
  ]), { manDays: 6, outsourcedManDays: 15, unplannedRows: 0 });
});

// ── Route ───────────────────────────────────────────────────────────────────

type Params = Record<string, unknown>;
const VERSION = Buffer.from("00000000000000a1", "hex");
const taskRaw = (patch: Params = {}) => ({ id: 31, project_id: 7, parent_id: null, sort_order: 1, kind: "task", name: "Wiring", is_milestone: false, origin: "PM", created_by: 20,
  visibility: "Internal", plan_start: "2026-12-07", plan_days: 5, start_mode: "manual", predecessor_id: null, lag_days: 0, pic_external: "", plan_man_days: 4,
  baseline_start: null, baseline_end: null, baseline_days: 0, baseline_rev: 0, actual_start: null, actual_end: null, forecast_end: null, percent_done: 0, status: "Not Started",
  blocked_reason: null, note: null, actual_man_days: 0, updated_by: 20, updated_at: "2026-11-18T00:00:00Z", row_version: VERSION, labor_source: "Own", labor_supplier: "", people_by_day: null, ...patch });

function setup(t: TestContext, tasks: Params[]) {
  const statements: { statement: string; params: Params }[] = [];
  const bags = new WeakMap<object, Params>();
  t.mock.method(sql.Request.prototype, "input", function (this: object, name: string, ...rest: unknown[]) {
    const bag = bags.get(this) ?? {}; bag[name] = rest.length > 1 ? rest[1] : rest[0]; bags.set(this, bag); return this;
  });
  t.mock.method(sql.Request.prototype, "query", async function (this: object, statement: string) {
    statements.push({ statement, params: { ...(bags.get(this) ?? {}) } });
    if (statement.includes("SELECT id,project_no,name,manager_id,lead_engineer_id,status,target_delivery FROM dbo.projects")) return { recordset: [{ id: 7, project_no: "P-26-007", name: "Line 3", manager_id: 20, lead_engineer_id: null, status: "Design", target_delivery: null }] };
    if (statement.includes("SELECT TOP(1) row_version FROM dbo.schedule_tasks")) return { recordset: [{ row_version: VERSION }] };
    if (statement.includes("FROM dbo.schedule_tasks WHERE project_id=@project AND deleted_at IS NULL ORDER BY parent_id")) return { recordset: tasks };
    return { recordset: [], rowsAffected: [1] };
  });
  const app = Fastify();
  registerErrorHandler(app);
  const database = { transaction: async <T>(run: (transaction: Transaction) => Promise<T>) => run({} as Transaction), query: async () => ({ recordset: [{ allowed: true }] }) } as unknown as Database;
  const users = { demandPermission: async () => undefined, required: async () => ({ id: 20, name: "PM", role: "Project Manager", roles: ["Project Manager"] }) } as unknown as CurrentUserService;
  registerScheduleRoutes(app, database, users, "Asia/Bangkok");
  return { app, statements };
}
const save = (app: ReturnType<typeof setup>["app"], rows: unknown) => app.inject({ method: "PUT", url: "/api/v1/projects/7/schedule/people", payload: { scheduleVersion: VERSION.toString("base64"), rows } as object });

test("PUT schedule/people: writes the people, the dates they span, their man-days and the labor source, and audits it", async (t) => {
  const { app, statements } = setup(t, [taskRaw()]);
  try {
    const response = await save(app, [{ taskId: 31, laborSource: "Outsourced", laborSupplier: "ACME Manpower", planStart: "2026-12-05", planDays: 4, people: [6, 6, 0, 3] }]);
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().saved, 1);
    const update = statements.find((entry) => entry.statement.includes("UPDATE dbo.schedule_tasks SET plan_start=@plan_start"));
    assert.ok(update, "the row is written");
    assert.deepEqual([update.params.plan_start, update.params.plan_days, update.params.man_days, update.params.source, update.params.supplier, update.params.people],
      ["2026-12-05", 4, 15, "Outsourced", "ACME Manpower", "[6,6,0,3]"]);
    assert.ok(update.params.version === VERSION, "guarded by the row version that was read");
    assert.ok(statements.some((entry) => entry.statement.includes("INSERT INTO dbo.audit_log") && entry.params.action === "Updated people plan"), "the change is audited");
  } finally { await app.close(); }
});

test("PUT schedule/people: a task of another project, a heading and a stale plan are refused", async (t) => {
  const { app } = setup(t, [taskRaw(), taskRaw({ id: 40, kind: "phase" })]);
  try {
    assert.equal((await save(app, [{ taskId: 99, laborSource: "Own" }])).statusCode, 404);
    assert.equal((await save(app, [{ taskId: 40, laborSource: "Own" }])).statusCode, 422);
    const stale = await app.inject({ method: "PUT", url: "/api/v1/projects/7/schedule/people", payload: { scheduleVersion: Buffer.from("00000000000000a0", "hex").toString("base64"), rows: [{ taskId: 31, laborSource: "Own" }] } });
    assert.equal(stale.statusCode, 409, stale.body);
  } finally { await app.close(); }
});
