import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import Fastify from "fastify";
import sql from "mssql";
import type { Transaction } from "mssql";
import { businessToday } from "../src/business-date.js";
import type { Database } from "../src/db.js";
import { ApiError, dayRequestAnswerError, registerErrorHandler } from "../src/errors.js";
import { registerResourceTaskRoutes } from "../src/routes/resource-tasks.js";
import { registerScheduleRoutes } from "../src/routes/schedule.js";
import { canAnswerDayRequests, canPostProgress, managedProgressReady } from "../src/schedule-service.js";
import type { CurrentUserService } from "../src/users.js";

const PROJECT_ID = 7;
const MANAGER_ID = 20;
const TASK_VERSION = Buffer.from("taskver1");
const SCHEDULE_VERSION = Buffer.from("schedver");
const NEXT_VERSION = Buffer.from("nextver1");

type Actor = { id: number; role: string; roles?: string[] };
type Params = Record<string, unknown>;
type Answer = { recordset?: unknown[]; rowsAffected?: number[] };
type Statement = { statement: string; params: Params; execute: boolean };
type Binder = { input: (name: string, ...rest: unknown[]) => Binder };

/** A dbo.schedule_tasks row as SELECT returns it; overrides use the column names. */
function taskRaw(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 11, project_id: PROJECT_ID, parent_id: null, sort_order: 1, kind: "task", name: "Panel wiring", is_milestone: false,
    origin: "PM", created_by: MANAGER_ID, visibility: "Internal", plan_start: "2027-03-01", plan_days: 5, start_mode: "manual",
    predecessor_id: null, lag_days: 0, pic_external: "", plan_man_days: 0, baseline_start: null, baseline_end: null,
    baseline_days: 0, baseline_rev: 0, actual_start: null, actual_end: null, forecast_end: null, percent_done: 0,
    status: "Not Started", blocked_reason: null, note: null, actual_man_days: 0, updated_by: MANAGER_ID,
    updated_at: "2026-10-01T00:00:00Z", row_version: TASK_VERSION, ...overrides,
  };
}

const projectRaw = (status = "Design") => ({ id: PROJECT_ID, project_no: "P-26-007", name: "Line 3 IoT", manager_id: MANAGER_ID, status, target_delivery: "2027-12-31" });

function installSqlMock(t: TestContext, answer: (statement: string, params: Params, execute: boolean) => Answer | undefined) {
  const statements: Statement[] = [];
  const bags = new WeakMap<object, Params>();
  t.mock.method(sql.Request.prototype, "input", function (this: object, name: string, ...rest: unknown[]) {
    const bag = bags.get(this) ?? {}; bag[name] = rest.length > 1 ? rest[1] : rest[0]; bags.set(this, bag); return this;
  });
  const run = (self: object, statement: string, execute: boolean) => {
    const params = { ...(bags.get(self) ?? {}) }; statements.push({ statement, params, execute });
    return answer(statement, params, execute) ?? { recordset: [], rowsAffected: [1] };
  };
  t.mock.method(sql.Request.prototype, "query", async function (this: object, statement: string) { return run(this, statement, false); });
  t.mock.method(sql.Request.prototype, "execute", async function (this: object, procedure: string) { return run(this, procedure, true); });
  return statements;
}

function harness(actor: Actor, options: { managedAssignee?: number | null; permissions?: string[]; withResourceTasks?: boolean } = {}) {
  const app = Fastify();
  registerErrorHandler(app);
  const transactions: Array<"committed" | "rolled-back"> = [];
  const permissions = new Set(options.permissions ?? ["schedule.plan", "schedule.progress"]);
  const database = {
    transaction: async <T>(work: (transaction: Transaction) => Promise<T>) => {
      try { const value = await work({} as Transaction); transactions.push("committed"); return value; }
      catch (error) { transactions.push("rolled-back"); throw error; }
    },
    // permissionFor() and the Resource Plan preHandler read through database.query.
    query: async (statement: string, bind?: (request: Binder) => void) => {
      const params: Params = {}; const request: Binder = { input: (name, ...rest) => { params[name] = rest.length > 1 ? rest[1] : rest[0]; return request; } };
      bind?.(request);
      if (statement.includes("user_effective_permissions")) return { recordset: [{ allowed: permissions.has(String(params.permission)) }] };
      if (statement.includes("FROM dbo.resource_tasks WHERE schedule_task_id=@id")) {
        return { recordset: options.managedAssignee == null ? [] : [{ acknowledged_at: "2026-10-01", assignee_id: options.managedAssignee, state: "Approved" }] };
      }
      return { recordset: [] };
    },
  } as unknown as Database;
  const users = { demandPermission: async () => {}, required: async () => actor } as unknown as CurrentUserService;
  registerScheduleRoutes(app, database, users, "Asia/Bangkok");
  if (options.withResourceTasks) registerResourceTaskRoutes(app, database, users);
  return { app, transactions };
}

const lockedScheduleVersion = (statement: string) => /SELECT TOP\(1\) row_version FROM dbo\.schedule_tasks WITH \(UPDLOCK,HOLDLOCK\)/.test(statement);

/** Answers for the progress route on task 11. rights = what the is_pic/has_children/managed probe returns. */
function progressAnswers(task: Record<string, unknown>, rights: { isPic: boolean; hasChildren?: boolean; managed?: boolean }) {
  return (statement: string): Answer | undefined => {
    if (statement.includes("FROM dbo.schedule_tasks WITH (UPDLOCK,HOLDLOCK) WHERE id=@id AND deleted_at IS NULL")) return { recordset: [task] };
    if (statement.includes("FROM dbo.projects p WHERE p.id=@project_id")) return { recordset: [{ allowed: true }] };
    if (statement.includes("FROM dbo.projects WITH (UPDLOCK,HOLDLOCK) WHERE id=@project")) return { recordset: [projectRaw()] };
    if (statement.includes(" is_pic,")) return { recordset: [{ is_pic: rights.isPic, has_children: rights.hasChildren ?? false, managed: rights.managed ?? false }] };
    if (statement.includes("UPDATE dbo.schedule_tasks SET percent_done=")) return { recordset: [{ row_version: NEXT_VERSION }] };
    if (statement.includes("SELECT project_id FROM dbo.schedule_tasks WHERE id=@source")) return { recordset: [{ project_id: PROJECT_ID }] };
    if (statement.includes("SELECT TOP(1) row_version FROM dbo.schedule_tasks")) return { recordset: [{ row_version: NEXT_VERSION }] };
    return undefined;
  };
}

const progressPayload = (rowVersion = TASK_VERSION) => ({
  rowVersion: rowVersion.toString("base64"), scheduleVersion: Buffer.from("staleold").toString("base64"),
  percentComplete: 40, actualStart: "2026-10-01", actualFinish: null, forecastFinish: null, status: "In Progress", remark: null,
});

test("canPostProgress: a PIC, the project manager or an Admin may post on a leaf; a Resource Plan row stays with its PIC", () => {
  const leaf = { isLeaf: true, isPic: false, isManager: false, isAdmin: false, managed: false };
  assert.equal(canPostProgress({ ...leaf, isPic: true }), true);
  assert.equal(canPostProgress({ ...leaf, isManager: true }), true);
  assert.equal(canPostProgress({ ...leaf, isAdmin: true }), true);
  assert.equal(canPostProgress(leaf), false, "someone who is neither PIC, manager nor Admin");
  for (const who of [{ isPic: true }, { isManager: true }, { isAdmin: true }]) assert.equal(canPostProgress({ ...leaf, ...who, isLeaf: false }), false, "phase or roll-up row");
  assert.equal(canPostProgress({ ...leaf, managed: true, isPic: true }), true);
  assert.equal(canPostProgress({ ...leaf, managed: true, isManager: true }), false);
  assert.equal(canPostProgress({ ...leaf, managed: true, isAdmin: true }), false);
});

test("businessToday reads the date in the business time zone, not UTC", () => {
  // 18:30 UTC on 5 October is already 6 October in Bangkok (UTC+7).
  assert.equal(businessToday("Asia/Bangkok", new Date("2026-10-05T18:30:00Z")), "2026-10-06");
  assert.equal(businessToday("UTC", new Date("2026-10-05T18:30:00Z")), "2026-10-05");
});

test("answering a day request reads task_id from dbo.answer_schedule_day_request and commits", async (t) => {
  const { app, transactions } = harness({ id: MANAGER_ID, role: "Project Manager" });
  const statements = installSqlMock(t, (statement, params, execute) => {
    if (execute) {
      assert.equal(statement, "dbo.answer_schedule_day_request");
      assert.equal(params.task_id, 11); assert.equal(params.request_id, 90); assert.equal(params.answer, "Accepted");
      // The procedure ends with SELECT @task_id AS task_id, @result_row_version AS row_version (migration 007).
      return { recordset: [{ task_id: "11", row_version: NEXT_VERSION }] };
    }
    if (statement.includes("SELECT project_id,task_id FROM dbo.schedule_updates")) return { recordset: [{ project_id: PROJECT_ID, task_id: 11 }] };
    if (statement.includes("FROM dbo.schedule_tasks WITH (UPDLOCK,HOLDLOCK) WHERE id=@id AND deleted_at IS NULL")) return { recordset: [taskRaw({ id: 11, plan_days: 5 })] };
    if (statement.includes("FROM dbo.projects WITH (UPDLOCK,HOLDLOCK) WHERE id=@project")) return { recordset: [projectRaw()] };
    if (statement.includes("WHERE parent_id=@task AND deleted_at IS NULL) THEN 1 ELSE 0 END AS bit) value")) return { recordset: [{ value: false }] };
    if (statement.includes("SELECT request_days,answer FROM dbo.schedule_updates")) return { recordset: [{ request_days: 3, answer: null }] };
    if (statement.includes("SELECT TOP(1) row_version FROM dbo.schedule_tasks")) return { recordset: [{ row_version: SCHEDULE_VERSION }] };
    return undefined;
  });
  try {
    const response = await app.inject({ method: "POST", url: "/api/v1/schedule/day-requests/90/answer", payload: {
      answer: "Accepted", note: "OK", rowVersion: TASK_VERSION.toString("base64"), scheduleVersion: SCHEDULE_VERSION.toString("base64") } });
    assert.equal(response.statusCode, 200, response.body);
    const body = response.json();
    assert.equal(body.taskId, 11); assert.equal(body.planDays, 8); assert.equal(body.rowVersion, NEXT_VERSION.toString("base64"));
    assert.deepEqual(transactions, ["committed"]);
    // Answers still check the whole schedule version.
    assert.ok(statements.some((entry) => lockedScheduleVersion(entry.statement)));
    assert.ok(statements.some((entry) => entry.statement.includes("INSERT INTO dbo.schedule_updates") && entry.params.field === "request_answer"));
  } finally { await app.close(); }
});

test("a day-request answer for another task still rolls back as a conflict", async (t) => {
  const { app, transactions } = harness({ id: MANAGER_ID, role: "Project Manager" });
  installSqlMock(t, (statement, _params, execute) => {
    if (execute) return { recordset: [{ task_id: 12, row_version: NEXT_VERSION }] };
    if (statement.includes("SELECT project_id,task_id FROM dbo.schedule_updates")) return { recordset: [{ project_id: PROJECT_ID, task_id: 11 }] };
    if (statement.includes("FROM dbo.schedule_tasks WITH (UPDLOCK,HOLDLOCK) WHERE id=@id AND deleted_at IS NULL")) return { recordset: [taskRaw({ id: 11 })] };
    if (statement.includes("FROM dbo.projects WITH (UPDLOCK,HOLDLOCK) WHERE id=@project")) return { recordset: [projectRaw()] };
    if (statement.includes("SELECT request_days,answer FROM dbo.schedule_updates")) return { recordset: [{ request_days: 3, answer: null }] };
    if (statement.includes("SELECT TOP(1) row_version FROM dbo.schedule_tasks")) return { recordset: [{ row_version: SCHEDULE_VERSION }] };
    return undefined;
  });
  try {
    const response = await app.inject({ method: "POST", url: "/api/v1/schedule/day-requests/90/answer", payload: {
      answer: "Rejected", rowVersion: TASK_VERSION.toString("base64"), scheduleVersion: SCHEDULE_VERSION.toString("base64") } });
    assert.equal(response.statusCode, 409, response.body);
    assert.equal(response.json().code, "concurrency_conflict");
    assert.deepEqual(transactions, ["rolled-back"]);
  } finally { await app.close(); }
});

test("the project manager posts progress on a task they are not PIC of, and a stale schedule version is ignored", async (t) => {
  const { app, transactions } = harness({ id: MANAGER_ID, role: "Project Manager" });
  const statements = installSqlMock(t, progressAnswers(taskRaw({ id: 11 }), { isPic: false }));
  try {
    const response = await app.inject({ method: "POST", url: "/api/v1/schedule/tasks/11/updates", payload: progressPayload() });
    assert.equal(response.statusCode, 200, response.body);
    assert.deepEqual(Object.keys(response.json()).sort(), ["id", "rowVersion", "scheduleVersion"]);
    assert.equal(response.json().rowVersion, NEXT_VERSION.toString("base64"));
    assert.deepEqual(transactions, ["committed"]);
    assert.equal(statements.some((entry) => lockedScheduleVersion(entry.statement)), false, "progress must not lock and compare the whole schedule version");
    const update = statements.find((entry) => entry.statement.includes("UPDATE dbo.schedule_tasks SET percent_done="))!;
    assert.match(update.statement, /row_version=@version/);
    assert.ok(update.params.version instanceof Buffer && (update.params.version as Buffer).equals(TASK_VERSION));
  } finally { await app.close(); }
});

test("an Admin who is neither PIC nor manager may post progress", async (t) => {
  const { app } = harness({ id: 99, role: "Engineer", roles: ["Engineer", "Admin"] });
  installSqlMock(t, progressAnswers(taskRaw({ id: 11 }), { isPic: false }));
  try {
    const response = await app.inject({ method: "POST", url: "/api/v1/schedule/tasks/11/updates", payload: progressPayload() });
    assert.equal(response.statusCode, 200, response.body);
  } finally { await app.close(); }
});

test("an assigned PIC still posts progress", async (t) => {
  const { app } = harness({ id: 30, role: "Engineer" });
  installSqlMock(t, progressAnswers(taskRaw({ id: 11 }), { isPic: true }));
  try {
    const response = await app.inject({ method: "POST", url: "/api/v1/schedule/tasks/11/updates", payload: progressPayload() });
    assert.equal(response.statusCode, 200, response.body);
  } finally { await app.close(); }
});

test("progress is refused for someone who is not PIC, manager or Admin, and on phase and roll-up rows", async (t) => {
  const cases: Array<{ actor: Actor; task: Record<string, unknown>; rights: { isPic: boolean; hasChildren?: boolean } }> = [
    { actor: { id: 31, role: "Engineer" }, task: taskRaw({ id: 11 }), rights: { isPic: false } },
    { actor: { id: MANAGER_ID, role: "Project Manager" }, task: taskRaw({ id: 11, kind: "phase", plan_start: null }), rights: { isPic: false } },
    { actor: { id: 99, role: "Admin" }, task: taskRaw({ id: 11 }), rights: { isPic: false, hasChildren: true } },
    { actor: { id: 30, role: "Engineer" }, task: taskRaw({ id: 11 }), rights: { isPic: true, hasChildren: true } },
  ];
  for (const { actor, task, rights } of cases) {
    await t.test(`actor ${actor.id} on ${String(task.kind)}${rights.hasChildren ? " roll-up" : ""}`, async (sub) => {
      const { app, transactions } = harness(actor);
      const statements = installSqlMock(sub, progressAnswers(task, rights));
      try {
        const response = await app.inject({ method: "POST", url: "/api/v1/schedule/tasks/11/updates", payload: progressPayload() });
        assert.equal(response.statusCode, 403, response.body);
        assert.equal(response.json().code, "schedule_pic_required");
        assert.equal(response.json().message, "Only an assigned PIC, the project manager or an Admin can update this task's progress.");
        assert.deepEqual(transactions, ["rolled-back"]);
        assert.equal(statements.some((entry) => entry.statement.includes("UPDATE dbo.schedule_tasks SET percent_done=")), false);
      } finally { await app.close(); }
    });
  }
});

test("a stale task row version still conflicts", async (t) => {
  const { app, transactions } = harness({ id: MANAGER_ID, role: "Project Manager" });
  installSqlMock(t, progressAnswers(taskRaw({ id: 11 }), { isPic: false }));
  try {
    const response = await app.inject({ method: "POST", url: "/api/v1/schedule/tasks/11/updates", payload: progressPayload(Buffer.from("oldrowvr")) });
    assert.equal(response.statusCode, 409, response.body);
    assert.equal(response.json().code, "concurrency_conflict");
    assert.deepEqual(transactions, ["rolled-back"]);
  } finally { await app.close(); }
});

test("a Resource Plan row refuses the project manager's progress before the route runs (resource-tasks preHandler)", async (t) => {
  const { app, transactions } = harness({ id: MANAGER_ID, role: "Project Manager" }, { managedAssignee: 30, withResourceTasks: true });
  const statements = installSqlMock(t, progressAnswers(taskRaw({ id: 11 }), { isPic: false, managed: true }));
  try {
    const response = await app.inject({ method: "POST", url: "/api/v1/schedule/tasks/11/updates", payload: progressPayload() });
    assert.equal(response.statusCode, 409, response.body);
    assert.equal(response.json().code, "acknowledgment_required");
    assert.deepEqual(transactions, []);
    assert.equal(statements.length, 0);
  } finally { await app.close(); }
});

test("the managed check also holds inside the route: a manager who is not PIC cannot post on a Resource Plan row", async (t) => {
  const { app } = harness({ id: MANAGER_ID, role: "Project Manager" });
  installSqlMock(t, progressAnswers(taskRaw({ id: 11 }), { isPic: false, managed: true }));
  try {
    const response = await app.inject({ method: "POST", url: "/api/v1/schedule/tasks/11/updates", payload: progressPayload() });
    assert.equal(response.statusCode, 403, response.body);
    assert.equal(response.json().code, "schedule_pic_required");
  } finally { await app.close(); }
});

/*
 * Schedule fixture: Master Plan (1) > milestone 2; Execution (3) > done task 4, managed task 5, roll-up 6 > detail 7.
 * Work days: 4 = 5 (Mon-Fri), 5 = 5, 7 = 10 (12 calendar days over two weekends).
 */
const scheduleRows = [
  taskRaw({ id: 1, kind: "phase", name: "Master Plan", plan_start: null, plan_days: 1, sort_order: 1 }),
  taskRaw({ id: 2, parent_id: 1, name: "Customer FAT", is_milestone: true, plan_start: "2027-06-01", plan_days: 1 }),
  taskRaw({ id: 3, kind: "phase", name: "Execution", plan_start: null, plan_days: 1, sort_order: 2 }),
  taskRaw({ id: 4, parent_id: 3, name: "Design", plan_start: "2026-09-07", plan_days: 5, status: "Done", percent_done: 100, actual_start: "2026-09-07", actual_end: "2026-09-11" }),
  taskRaw({ id: 5, parent_id: 3, sort_order: 2, name: "Panel build", plan_start: "2027-03-01", plan_days: 5, status: "In Progress", percent_done: 40, actual_start: "2027-03-01" }),
  taskRaw({ id: 6, parent_id: 3, sort_order: 3, name: "Installation", plan_start: "2027-03-08", plan_days: 12 }),
  taskRaw({ id: 7, parent_id: 6, kind: "detail", origin: "Member", name: "Cabling", plan_start: "2027-03-08", plan_days: 12 }),
];

/** dbo.resource_tasks for task 5 as readManagedTaskIds selects it: by default Approved, acknowledged and assigned to user 30. */
type ManagedRaw = { state: string; acknowledged_at: string | null; assignee_id: number };
const readyManaged: ManagedRaw = { state: "Approved", acknowledged_at: "2026-10-02T03:00:00Z", assignee_id: 30 };
const managedQuery = "SELECT schedule_task_id,state,acknowledged_at,assignee_id FROM dbo.resource_tasks WHERE project_id=@project AND schedule_task_id IS NOT NULL";

function scheduleAnswers(pics: Array<{ task: number; user: number }>, status = "Design", managed: ManagedRaw = readyManaged) {
  return (statement: string): Answer | undefined => {
    if (statement.includes("FROM dbo.projects p WHERE p.id=@project_id")) return { recordset: [{ allowed: true }] };
    if (statement.includes("SELECT id,project_no,name,manager_id,status,target_delivery FROM dbo.projects")) return { recordset: [projectRaw(status)] };
    if (statement.includes("FROM dbo.schedule_tasks WHERE project_id=@project AND deleted_at IS NULL ORDER BY")) return { recordset: scheduleRows };
    if (statement.includes("SELECT pic.task_id,u.id")) return { recordset: pics.map(({ task, user }) => ({ task_id: task, id: user, name: `User ${user}`, email: `u${user}@example.test` })) };
    if (statement.includes(managedQuery)) return { recordset: [{ schedule_task_id: 5, ...managed }] };
    if (statement.includes("SELECT TOP(1) row_version FROM dbo.schedule_tasks")) return { recordset: [{ row_version: SCHEDULE_VERSION }] };
    return undefined;
  };
}

type TaskNode = { id: number; managedByResourcePlan: boolean; canProgress: boolean; children: TaskNode[] };
const flatten = (nodes: TaskNode[]): TaskNode[] => nodes.flatMap((node) => [node, ...flatten(node.children)]);
const flagsById = (nodes: TaskNode[]) => Object.fromEntries(flatten(nodes).map((node) => [node.id, { managed: node.managedByResourcePlan, can: node.canProgress }]));

test("GET schedule: summary uses the shared work-day weighted rule without the Master Plan frame", async (t) => {
  const { app } = harness({ id: MANAGER_ID, role: "Project Manager" });
  const statements = installSqlMock(t, scheduleAnswers([{ task: 5, user: 30 }]));
  try {
    const response = await app.inject({ method: "GET", url: `/api/v1/projects/${PROJECT_ID}/schedule` });
    assert.equal(response.statusCode, 200, response.body);
    const { summary } = response.json();
    // (100 x 5 + 40 x 5 + 0 x 10) / 20; the old formula also counted the Master Plan milestone and gave 33.33.
    assert.equal(summary.percentComplete, 35);
    assert.equal(summary.taskCount, 3); assert.equal(summary.doneCount, 1); assert.equal(summary.blockedCount, 0);
    assert.equal(summary.overdueCount, 0);
    assert.equal(summary.plannedProgress, 25);
    assert.equal(summary.health, "On Track");
    // Forecast finish 2027-03-19 against the 2027-12-31 target.
    assert.equal(summary.slipDays, -287);
    // The plan period still spans the whole timeline, Master Plan included.
    assert.equal(summary.planStart, "2026-09-07"); assert.equal(summary.planFinish, "2027-06-01");
    assert.equal(statements.filter((entry) => entry.statement.includes("FROM dbo.resource_tasks")).length, 1, "one Resource Plan query per request");
  } finally { await app.close(); }
});

test("GET schedule: canProgress and managedByResourcePlan per row", async (t) => {
  await t.test("project manager", async (sub) => {
    const { app } = harness({ id: MANAGER_ID, role: "Project Manager" });
    installSqlMock(sub, scheduleAnswers([{ task: 5, user: 30 }]));
    try {
      const flags = flagsById((await app.inject({ method: "GET", url: `/api/v1/projects/${PROJECT_ID}/schedule` })).json().tasks);
      assert.deepEqual(flags, {
        1: { managed: false, can: false }, 2: { managed: false, can: true }, 3: { managed: false, can: false }, 4: { managed: false, can: true },
        5: { managed: true, can: false }, 6: { managed: false, can: false }, 7: { managed: false, can: true },
      });
    } finally { await app.close(); }
  });
  await t.test("PIC of the managed row", async (sub) => {
    const { app } = harness({ id: 30, role: "Engineer" });
    installSqlMock(sub, scheduleAnswers([{ task: 5, user: 30 }, { task: 6, user: 30 }]));
    try {
      const flags = flagsById((await app.inject({ method: "GET", url: `/api/v1/projects/${PROJECT_ID}/schedule` })).json().tasks);
      assert.equal(flags[5]!.can, true);
      assert.equal(flags[6]!.can, false, "a roll-up row is never updated directly");
      assert.equal(flags[4]!.can, false, "not PIC, not manager, not Admin");
    } finally { await app.close(); }
  });
  await t.test("Admin", async (sub) => {
    const { app } = harness({ id: 99, role: "Admin" });
    installSqlMock(sub, scheduleAnswers([{ task: 5, user: 30 }]));
    try {
      const flags = flagsById((await app.inject({ method: "GET", url: `/api/v1/projects/${PROJECT_ID}/schedule` })).json().tasks);
      assert.deepEqual([2, 4, 5, 7].map((id) => flags[id]!.can), [true, true, false, true]);
    } finally { await app.close(); }
  });
  await t.test("without schedule.progress", async (sub) => {
    const { app } = harness({ id: MANAGER_ID, role: "Project Manager" }, { permissions: ["schedule.plan"] });
    installSqlMock(sub, scheduleAnswers([{ task: 5, user: 30 }]));
    try {
      const flags = flagsById((await app.inject({ method: "GET", url: `/api/v1/projects/${PROJECT_ID}/schedule` })).json().tasks);
      assert.ok(Object.values(flags).every((flag) => !flag.can));
      assert.equal(flags[5]!.managed, true);
    } finally { await app.close(); }
  });
  await t.test("closed project", async (sub) => {
    const { app } = harness({ id: 99, role: "Admin" });
    installSqlMock(sub, scheduleAnswers([{ task: 5, user: 30 }], "Closed"));
    try {
      const body = (await app.inject({ method: "GET", url: `/api/v1/projects/${PROJECT_ID}/schedule` })).json();
      assert.ok(Object.values(flagsById(body.tasks)).every((flag) => !flag.can));
      assert.equal(body.summary.health, "Completed");
    } finally { await app.close(); }
  });
});

test("GET me/work: a Resource Plan row cannot add details or request days", async (t) => {
  const actor = { id: 30, role: "Engineer" };
  const { app } = harness(actor);
  const rows = [
    taskRaw({ id: 3, kind: "phase", name: "Execution", plan_start: null, plan_days: 1 }),
    taskRaw({ id: 5, parent_id: 3, name: "Managed", plan_start: "2027-03-01" }),
    taskRaw({ id: 8, parent_id: 3, sort_order: 2, name: "Free", plan_start: "2027-03-01" }),
    taskRaw({ id: 9, parent_id: 3, sort_order: 3, name: "Waiting", plan_start: "2027-03-01" }),
  ];
  installSqlMock(t, (statement) => {
    if (statement.includes("SELECT DISTINCT p.id,p.project_no")) return { recordset: [{ id: PROJECT_ID, project_no: "P-26-007", name: "Line 3 IoT", manager_id: MANAGER_ID, manager_name: "PM", status: "Design", can_update: true }] };
    if (statement.includes("FROM dbo.schedule_tasks WHERE project_id=@project AND deleted_at IS NULL ORDER BY")) return { recordset: rows };
    if (statement.includes("SELECT pic.task_id,u.id")) return { recordset: [5, 8, 9].map((task) => ({ task_id: task, id: actor.id, name: "Me", email: "me@example.test" })) };
    if (statement.includes("SELECT id,task_id,actor_id,request_days,comment,occurred_at FROM dbo.schedule_updates")) return { recordset: [{ id: 70, task_id: 9, actor_id: actor.id, request_days: 2, comment: "More", occurred_at: "2026-10-01" }] };
    if (statement.includes(managedQuery)) return { recordset: [{ schedule_task_id: 5, ...readyManaged, assignee_id: actor.id }] };
    if (statement.includes("SELECT TOP(1) row_version FROM dbo.schedule_tasks")) return { recordset: [{ row_version: SCHEDULE_VERSION }] };
    return undefined;
  });
  try {
    const response = await app.inject({ method: "GET", url: "/api/v1/me/work" });
    assert.equal(response.statusCode, 200, response.body);
    const byId = Object.fromEntries((response.json() as Array<Record<string, unknown>>).map((item) => [item.taskId, item]));
    assert.deepEqual(Object.keys(byId).map(Number).sort(), [5, 8, 9], "the listed tasks do not change");
    assert.deepEqual([byId[5]!.managedByResourcePlan, byId[5]!.canAddDetail, byId[5]!.canRequestDays], [true, false, false]);
    assert.deepEqual([byId[8]!.managedByResourcePlan, byId[8]!.canAddDetail, byId[8]!.canRequestDays], [false, true, true]);
    assert.deepEqual([byId[9]!.managedByResourcePlan, byId[9]!.canAddDetail, byId[9]!.canRequestDays], [false, false, false]);
  } finally { await app.close(); }
});

test("GET schedule: a Resource Plan row offers Update only when the preHandler would accept it", async (t) => {
  const cases: Array<{ label: string; actor: number; managed: ManagedRaw; can: boolean }> = [
    { label: "approved, acknowledged, the assignee", actor: 30, managed: readyManaged, can: true },
    { label: "not acknowledged yet", actor: 30, managed: { ...readyManaged, acknowledged_at: null }, can: false },
    { label: "re-plan pending approval", actor: 30, managed: { ...readyManaged, state: "PendingApproval" }, can: false },
    { label: "closed resource task", actor: 30, managed: { ...readyManaged, state: "Closed" }, can: false },
    { label: "a PIC who is not the assignee", actor: 31, managed: readyManaged, can: false },
  ];
  for (const { label, actor, managed, can } of cases) {
    await t.test(label, async (sub) => {
      const { app } = harness({ id: actor, role: "Engineer" });
      installSqlMock(sub, scheduleAnswers([{ task: 5, user: 30 }, { task: 5, user: 31 }], "Design", managed));
      try {
        const flags = flagsById((await app.inject({ method: "GET", url: `/api/v1/projects/${PROJECT_ID}/schedule` })).json().tasks);
        assert.deepEqual(flags[5], { managed: true, can });
      } finally { await app.close(); }
    });
  }
});

test("managedProgressReady mirrors the resource-tasks preHandler", () => {
  const ready = { state: "Approved", acknowledged: true, assigneeId: 30 };
  assert.equal(managedProgressReady(ready, 30), true);
  assert.equal(managedProgressReady({ ...ready, acknowledged: false }, 30), false);
  assert.equal(managedProgressReady({ ...ready, state: "Closed" }, 30), false);
  assert.equal(managedProgressReady(ready, 31), false);
});

test("canAnswerDayRequests follows dbo.answer_schedule_day_request: the manager or a PRIMARY Engineering Manager / Admin", () => {
  const project = { managerId: MANAGER_ID };
  assert.equal(canAnswerDayRequests(project, { id: MANAGER_ID, role: "Project Manager" }), true);
  assert.equal(canAnswerDayRequests(project, { id: 40, role: "Engineering Manager" }), true);
  assert.equal(canAnswerDayRequests(project, { id: 41, role: "Admin" }), true);
  // An additional Engineering Manager / Admin role does not count: the procedure reads users.role_id only.
  assert.equal(canAnswerDayRequests(project, { id: 42, role: "Project Manager" }), false);
});

test("GET schedule: canAnswerRequests is canPlan narrowed to the procedure's primary-role rule", async (t) => {
  const cases: Array<{ label: string; actor: Actor; status?: string; permissions?: string[]; canPlan: boolean; canAnswer: boolean }> = [
    { label: "project manager", actor: { id: MANAGER_ID, role: "Project Manager" }, canPlan: true, canAnswer: true },
    { label: "primary Engineering Manager", actor: { id: 40, role: "Engineering Manager" }, canPlan: true, canAnswer: true },
    { label: "additional Engineering Manager", actor: { id: 42, role: "Project Manager", roles: ["Project Manager", "Engineering Manager"] }, canPlan: true, canAnswer: false },
    { label: "additional Admin", actor: { id: 43, role: "Engineer", roles: ["Engineer", "Admin"] }, canPlan: true, canAnswer: false },
    { label: "without schedule.plan", actor: { id: MANAGER_ID, role: "Project Manager" }, permissions: ["schedule.progress"], canPlan: false, canAnswer: false },
    { label: "closed project", actor: { id: 40, role: "Engineering Manager" }, status: "Closed", canPlan: false, canAnswer: false },
  ];
  for (const { label, actor, status, permissions, canPlan, canAnswer } of cases) {
    await t.test(label, async (sub) => {
      const { app } = harness(actor, permissions ? { permissions } : {});
      installSqlMock(sub, scheduleAnswers([], status));
      try {
        const body = (await app.inject({ method: "GET", url: `/api/v1/projects/${PROJECT_ID}/schedule` })).json();
        assert.equal(body.canPlan, canPlan); assert.equal(body.canAnswerRequests, canAnswer);
      } finally { await app.close(); }
    });
  }
});

/** Answers for POST /api/v1/schedule/day-requests/90/answer on task 11; procedure decides what the stored procedure does. */
function answerRouteAnswers(procedure: () => Answer) {
  return (statement: string, _params: Params, execute: boolean): Answer | undefined => {
    if (execute) return procedure();
    if (statement.includes("SELECT project_id,task_id FROM dbo.schedule_updates")) return { recordset: [{ project_id: PROJECT_ID, task_id: 11 }] };
    if (statement.includes("FROM dbo.schedule_tasks WITH (UPDLOCK,HOLDLOCK) WHERE id=@id AND deleted_at IS NULL")) return { recordset: [taskRaw({ id: 11, plan_days: 5 })] };
    if (statement.includes("FROM dbo.projects WITH (UPDLOCK,HOLDLOCK) WHERE id=@project")) return { recordset: [projectRaw()] };
    if (statement.includes("WHERE parent_id=@task AND deleted_at IS NULL) THEN 1 ELSE 0 END AS bit) value")) return { recordset: [{ value: false }] };
    if (statement.includes("SELECT request_days,answer FROM dbo.schedule_updates")) return { recordset: [{ request_days: 3, answer: null }] };
    if (statement.includes("SELECT TOP(1) row_version FROM dbo.schedule_tasks")) return { recordset: [{ row_version: SCHEDULE_VERSION }] };
    return undefined;
  };
}
const answerPayload = { answer: "Accepted", rowVersion: TASK_VERSION.toString("base64"), scheduleVersion: SCHEDULE_VERSION.toString("base64") };
const sqlThrow = (number: number, message = "procedure THROW") => Object.assign(new sql.RequestError(message, "EREQUEST"), { number });

test("an Engineering Manager held only as an additional role gets a clear 403 before the procedure runs", async (t) => {
  const { app, transactions } = harness({ id: 42, role: "Project Manager", roles: ["Project Manager", "Engineering Manager"] });
  const statements = installSqlMock(t, answerRouteAnswers(() => { throw new Error("the procedure must not run"); }));
  try {
    const response = await app.inject({ method: "POST", url: "/api/v1/schedule/day-requests/90/answer", payload: answerPayload });
    assert.equal(response.statusCode, 403, response.body);
    assert.equal(response.json().code, "schedule_day_request_answer_forbidden");
    assert.deepEqual(transactions, ["rolled-back"]);
    assert.equal(statements.some((entry) => entry.execute), false);
  } finally { await app.close(); }
});

test("a primary-role Engineering Manager who is not the project manager may answer", async (t) => {
  const { app, transactions } = harness({ id: 40, role: "Engineering Manager" });
  installSqlMock(t, answerRouteAnswers(() => ({ recordset: [{ task_id: 11, row_version: NEXT_VERSION }] })));
  try {
    const response = await app.inject({ method: "POST", url: "/api/v1/schedule/day-requests/90/answer", payload: answerPayload });
    assert.equal(response.statusCode, 200, response.body);
    assert.deepEqual(transactions, ["committed"]);
  } finally { await app.close(); }
});

test("a THROW from dbo.answer_schedule_day_request becomes a 4xx, not a 503", async (t) => {
  const cases: Array<[number, number, string]> = [
    [51125, 403, "schedule_day_request_answer_forbidden"], [51121, 409, "schedule_day_request_answered"],
    [51122, 409, "concurrency_conflict"], [51123, 409, "project_closed"], [51126, 409, "schedule_day_request_not_leaf"],
    [51118, 404, "schedule_day_request_not_found"], [51124, 400, "validation_failed"],
  ];
  for (const [number, status, code] of cases) {
    await t.test(String(number), async (sub) => {
      const { app, transactions } = harness({ id: MANAGER_ID, role: "Project Manager" });
      installSqlMock(sub, answerRouteAnswers(() => { throw sqlThrow(number); }));
      try {
        const response = await app.inject({ method: "POST", url: "/api/v1/schedule/day-requests/90/answer", payload: answerPayload });
        assert.equal(response.statusCode, status, response.body);
        assert.equal(response.json().code, code);
        assert.deepEqual(transactions, ["rolled-back"]);
      } finally { await app.close(); }
    });
  }
});

test("dayRequestAnswerError maps only the 007 procedure's numbers and leaves the rest to the global handler", async () => {
  for (let number = 51110; number <= 51126; number++) {
    const mapped = dayRequestAnswerError(sqlThrow(number));
    assert.ok(mapped instanceof ApiError, `${number} is mapped`);
    assert.ok(mapped.statusCode >= 400 && mapped.statusCode < 500, `${number} is a 4xx`);
  }
  assert.equal(dayRequestAnswerError(sqlThrow(51127)), null);
  assert.equal(dayRequestAnswerError(sqlThrow(1205)), null);
  assert.equal(dayRequestAnswerError(new Error("not SQL")), null);
  assert.equal(dayRequestAnswerError(Object.assign(new Error("look-alike"), { number: 51125 })), null);
  // The estimate triggers reuse 51112-51115, so the global handler must not read them as day-request errors.
  const app = Fastify(); registerErrorHandler(app);
  app.get("/estimate-trigger", async () => { throw sqlThrow(51112, "Cost items can be inserted or changed only in the current estimate revision."); });
  try {
    const response = await app.inject({ method: "GET", url: "/estimate-trigger" });
    assert.notEqual(response.json().code, "value_too_long");
  } finally { await app.close(); }
});
