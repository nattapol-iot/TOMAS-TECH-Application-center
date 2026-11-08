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
import { isOwnPlanTask, canAnswerDayRequests, canPostProgress, datesWouldLoop, managedProgressReady, MAX_PLAN_DEPTH, placeInOrder, planInput, scheduleParentAllowed, validateGraphAndHierarchy } from "../src/schedule-service.js";
import { resolveSchedule, type ScheduleCalculationTask } from "../src/schedule-calculator.js";
import type { CurrentUserService } from "../src/users.js";

const PROJECT_ID = 7;
const MANAGER_ID = 20;
const TASK_VERSION = Buffer.from("taskver1");
const SCHEDULE_VERSION = Buffer.from("schedver");
const NEXT_VERSION = Buffer.from("nextver1");

test("isOwnPlanTask follows PIC and creator ancestry, never phases, details or another branch", () => {
  const tasks = new Map([
    { id: 1, parentId: null, kind: "phase", createdBy: 30 },
    { id: 2, parentId: 1, kind: "task", createdBy: 20 },
    { id: 3, parentId: 2, kind: "task", createdBy: 20 },
    { id: 4, parentId: 3, kind: "task", createdBy: 20 },
    { id: 5, parentId: 1, kind: "task", createdBy: 30 },
    { id: 6, parentId: 1, kind: "task", createdBy: 20 },
    { id: 7, parentId: 2, kind: "detail", createdBy: 30 },
    { id: 8, parentId: 9, kind: "task", createdBy: 20 },
    { id: 9, parentId: 8, kind: "task", createdBy: 20 },
  ].map(row => [row.id, row]));
  const pics = new Map([[2, [{ id: 30 }]]]);
  for (const id of [2, 3, 4, 5]) assert.equal(isOwnPlanTask(id, 30, tasks, pics), true);
  for (const id of [1, 6, 7, 8, 99]) assert.equal(isOwnPlanTask(id, 30, tasks, pics), false);
});

function memberPlanAnswers(rows: Record<string, unknown>[], options: { lead?: number; member?: boolean; pics?: Array<{ task: number; user: number }>; invalidPic?: number; status?: string; pending?: number } = {}) {
  const base = deletionAnswers(rows, options.status);
  return (statement: string, params: Params): Answer | undefined => {
    if (statement.includes("SELECT id,project_no,name,manager_id,lead_engineer_id")) return { recordset: [{ ...projectRaw(options.status), lead_engineer_id: options.lead ?? 40 }] };
    if (statement.includes("FROM dbo.projects p WHERE p.id=@project_id")) return { recordset: [{ allowed: true }] };
    if (statement.includes("member_project.id=@project")) return { recordset: [{ value: options.member !== false }] };
    if (statement.includes("SELECT id,parent_id,predecessor_id,kind,start_mode,")) return { recordset: rows };
    if (statement.includes("SELECT pic.task_id,u.id")) return { recordset: (options.pics ?? []).map(pic => ({ task_id: pic.task, id: pic.user, name: "PIC", email: "pic@example.test", active: true })) };
    if (statement.includes("FROM dbo.users u WHERE u.id=@user")) return { recordset: [{ allowed: params.user !== options.invalidPic }] };
    if (statement.includes("request_days>0 AND answer IS NULL")) return { recordset: [{ value: params.task === options.pending }] };
    if (statement.includes("INSERT INTO dbo.schedule_tasks")) return { recordset: [{ id: 90, row_version: NEXT_VERSION }] };
    if (statement.includes("UPDATE dbo.schedule_tasks SET parent_id=")) return { recordset: [{ row_version: NEXT_VERSION }] };
    if (statement.includes("SELECT id,sort_order FROM dbo.schedule_tasks")) return { recordset: [] };
    return base(statement, params);
  };
}

test("lead engineer creates, edits, moves and deletes without schedule.plan", async (t) => {
  for (const action of ["create", "PUT", "move", "DELETE"] as const) await t.test(action, async (sub) => {
    const { app } = harness({ id: 30, role: "Engineer" }, { permissions: ["schedule.progress"], deniedPermissions: ["schedule.plan"] });
    const rows = [...hierarchyRows(2), taskRaw({ id: 11, parent_id: 2 })];
    installSqlMock(sub, memberPlanAnswers(rows, { lead: 30 }));
    try {
      const response = await app.inject({ method: action === "PUT" || action === "DELETE" ? action : "POST",
        url: action === "create" ? `/api/v1/projects/${PROJECT_ID}/schedule/tasks` : `/api/v1/schedule/tasks/11${action === "move" ? "/move" : ""}`,
        payload: { ...planEditPayload([]), parentId: 2, beforeId: null } });
      assert.equal(response.statusCode, action === "create" ? 201 : 200, response.body);
    } finally { await app.close(); }
  });
});

test("member PIC creates at depth four through ancestry or beneath their own created row", async (t) => {
  for (const owns of ["PIC", "creator"] as const) await t.test(owns, async (sub) => {
    const { app } = harness({ id: 30, role: "Engineer" }, { permissions: ["schedule.progress"], deniedPermissions: ["schedule.plan"] });
    const rows = hierarchyRows(4); if (owns === "creator") rows[3]!.created_by = 30;
    const statements = installSqlMock(sub, memberPlanAnswers(rows, { pics: owns === "PIC" ? [{ task: 2, user: 30 }] : [] }));
    try {
      const response = await app.inject({ method: "POST", url: `/api/v1/projects/${PROJECT_ID}/schedule/tasks`, payload: { ...planEditPayload([]), parentId: 4 } });
      assert.equal(response.statusCode, 201, response.body);
      const inserted = statements.find(entry => entry.statement.includes("INSERT INTO dbo.schedule_tasks"))!;
      assert.equal(inserted.params.actor, 30); assert.equal(inserted.params.origin, "Member");
      assert.ok(statements.some(entry => entry.statement.includes("INSERT INTO dbo.schedule_task_pics") && entry.params.user === 30));
      const calculated = resolveSchedule([...rows, taskRaw({ id: 90, parent_id: 4 })].map(row => ({ id: Number(row.id), parentId: row.parent_id == null ? null : Number(row.parent_id), sortOrder: 1, planStart: "2027-03-01", planDays: 5, startMode: "manual", predecessorId: null, lagDays: 0, actualStart: null, actualFinish: null, forecastFinish: null, percentComplete: 0, status: "Not Started" })), new Set());
      assert.equal(calculated.byId.get(4)!.wbs, "1.1.1.1"); assert.equal(calculated.byId.get(90)!.wbs, "1.1.1.1.1");
    } finally { await app.close(); }
  });
});

test("members cannot create at the top, create phases, use someone else's parent, or bypass membership and progress", async (t) => {
  const cases = [
    { label: "top", parentId: null }, { label: "phase", parentId: null, kind: "phase" },
    { label: "someone else's task", parentId: 3 }, { label: "heading", parentId: 1 },
    { label: "not a member", parentId: 2, member: false }, { label: "no progress", parentId: 2, noProgress: true },
  ];
  for (const item of cases) await t.test(item.label, async (sub) => {
    const { app } = harness({ id: 30, role: "Engineer" }, { permissions: item.noProgress ? [] : ["schedule.progress"] });
    const statements = installSqlMock(sub, memberPlanAnswers([...hierarchyRows(2), taskRaw({ id: 3, parent_id: 1 })], { member: item.member ?? true, pics: [{ task: 2, user: 30 }] }));
    try {
      const response = await app.inject({ method: "POST", url: `/api/v1/projects/${PROJECT_ID}/schedule/tasks`, payload: { ...planEditPayload([]), parentId: item.parentId, kind: item.kind ?? "task" } });
      assert.equal(response.statusCode, 403, response.body);
      assert.equal(statements.some(entry => entry.statement.includes("INSERT INTO dbo.schedule_tasks")), false);
    } finally { await app.close(); }
  });
});

test("member edits and deletes only their own rows, without moving or changing protected fields", async (t) => {
  for (const action of ["PUT", "DELETE", "move"] as const) for (const own of [true, false]) await t.test(`${action} own=${own}`, async (sub) => {
    const { app } = harness({ id: 30, role: "Engineer" }, { permissions: ["schedule.progress"] });
    const rows = [...hierarchyRows(2), taskRaw({ id: 11, parent_id: 2, created_by: own ? 30 : 20 })];
    installSqlMock(sub, memberPlanAnswers(rows, { pics: [{ task: 11, user: 30 }] }));
    try {
      const response = await app.inject({ method: action === "move" ? "POST" : action, url: `/api/v1/schedule/tasks/11${action === "move" ? "/move" : ""}`, payload: { ...planEditPayload([30]), name: "Updated", parentId: 2, beforeId: null } });
      assert.equal(response.statusCode, own && action !== "move" ? 200 : 403, response.body);
    } finally { await app.close(); }
  });
  for (const patch of [{ parentId: 1 }, { sortOrder: 5 }, { visibility: "Customer" }, { isMilestone: true, planDays: 1 }, { startMode: "linked", predecessorId: 2 }, { picExternal: "Other" }, { planManDays: 1 }]) await t.test(JSON.stringify(patch), async (sub) => {
    const { app } = harness({ id: 30, role: "Engineer" }, { permissions: ["schedule.progress"] });
    installSqlMock(sub, memberPlanAnswers([...hierarchyRows(2), taskRaw({ id: 11, parent_id: 2, created_by: 30 })]));
    try {
      const response = await app.inject({ method: "PUT", url: "/api/v1/schedule/tasks/11", payload: { ...planEditPayload([30]), parentId: 2, ...patch } });
      assert.equal(response.statusCode, 403, response.body);
    } finally { await app.close(); }
  });
});

test("member cannot delete another creator's descendant or assign a non-member", async (t) => {
  for (const action of ["DELETE", "PUT", "POST"] as const) await t.test(action, async (sub) => {
    const { app } = harness({ id: 30, role: "Engineer" }, { permissions: ["schedule.progress"] });
    installSqlMock(sub, memberPlanAnswers([...hierarchyRows(2), taskRaw({ id: 11, parent_id: 2, created_by: 30 }), taskRaw({ id: 12, parent_id: 11 })], { invalidPic: 99, pics: [{ task: 2, user: 30 }] }));
    try {
      const response = await app.inject({ method: action, url: action === "POST" ? `/api/v1/projects/${PROJECT_ID}/schedule/tasks` : "/api/v1/schedule/tasks/11", payload: { ...planEditPayload([99]), parentId: 2 } });
      assert.equal(response.statusCode, action === "DELETE" ? 403 : 422, response.body);
    } finally { await app.close(); }
  });
});

test("snapshot exposes lead plan rights and member row flags without widening baseline or day answers", async (t) => {
  for (const [lead, planPermission] of [[true, false], [true, true], [false, false]]) await t.test(`lead=${lead}, plan=${planPermission}`, async (sub) => {
    const { app } = harness({ id: 30, role: "Engineer" }, { permissions: planPermission ? ["schedule.progress", "schedule.plan"] : ["schedule.progress"], deniedPermissions: planPermission ? [] : ["schedule.plan"] });
    installSqlMock(sub, memberPlanAnswers([...hierarchyRows(3), taskRaw({ id: 11, parent_id: 3, created_by: 30 }), taskRaw({ id: 12, parent_id: 1 })], { lead: lead ? 30 : 40, pics: [{ task: 2, user: 30 }] }));
    try {
      const response = await app.inject({ method: "GET", url: `/api/v1/projects/${PROJECT_ID}/schedule` });
      assert.equal(response.statusCode, 200, response.body);
      const snapshot = response.json(); assert.equal(snapshot.canPlan, lead); assert.equal(snapshot.canAnswerRequests, false); assert.equal(snapshot.canBaseline, false);
      const rows = flatten(snapshot.tasks) as unknown as Array<{ id: number; canAddChild: boolean; canEditOwn: boolean }>;
      assert.equal(rows.find(row => row.id === 3)!.canAddChild, true);
      assert.equal(rows.find(row => row.id === 11)!.canEditOwn, true);
      assert.equal(rows.find(row => row.id === 12)!.canAddChild, lead);
      assert.equal(rows.find(row => row.id === 2)!.canEditOwn, false);
      const baseline = await app.inject({ method: "POST", url: `/api/v1/projects/${PROJECT_ID}/schedule/baseline`, payload: { label: "Baseline", reason: "Test", scheduleVersion: SCHEDULE_VERSION.toString("base64") } });
      assert.equal(baseline.statusCode, 403, baseline.body);
    } finally { await app.close(); }
  });
});

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

function harness(actor: Actor, options: { managedAssignee?: number | null; permissions?: string[]; deniedPermissions?: string[]; withResourceTasks?: boolean } = {}) {
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
      if (statement.includes("user_effective_permissions")) return { recordset: [{ allowed: permissions.has(String(params.permission)) && !options.deniedPermissions?.includes(String(params.permission)) }] };
      if (statement.includes("FROM dbo.resource_tasks WHERE schedule_task_id=@id")) {
        return { recordset: options.managedAssignee == null ? [] : [{ acknowledged_at: "2026-10-01", assignee_id: options.managedAssignee, state: "Approved" }] };
      }
      return { recordset: [] };
    },
  } as unknown as Database;
  const users = { demandPermission: async (_request: unknown, permission: string) => {
    if (options.deniedPermissions?.includes(permission)) throw new ApiError(403, "permission_denied", "Permission required.");
  }, required: async () => actor } as unknown as CurrentUserService;
  registerScheduleRoutes(app, database, users, "Asia/Bangkok");
  if (options.withResourceTasks) registerResourceTaskRoutes(app, database, users);
  return { app, transactions };
}

const lockedScheduleVersion = (statement: string) => /SELECT TOP\(1\) row_version FROM dbo\.schedule_tasks WITH \(UPDLOCK,HOLDLOCK\)/.test(statement);

/** Answers for the progress route on task 11. rights = what the is_pic/has_pics/has_children/managed/is_member probe returns; the row has a PIC unless hasPics is false. */
function progressAnswers(task: Record<string, unknown>, rights: { isPic: boolean; hasPics?: boolean; hasChildren?: boolean; managed?: boolean; isMember?: boolean }) {
  return (statement: string): Answer | undefined => {
    if (statement.includes("FROM dbo.schedule_tasks WITH (UPDLOCK,HOLDLOCK) WHERE id=@id AND deleted_at IS NULL")) return { recordset: [task] };
    if (statement.includes("FROM dbo.projects p WHERE p.id=@project_id")) return { recordset: [{ allowed: true }] };
    if (statement.includes("FROM dbo.projects WITH (UPDLOCK,HOLDLOCK) WHERE id=@project")) return { recordset: [projectRaw()] };
    if (statement.includes(" is_pic,")) return { recordset: [{ is_pic: rights.isPic, has_pics: rights.hasPics ?? true, has_children: rights.hasChildren ?? false, managed: rights.managed ?? false, is_member: rights.isMember ?? false }] };
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
  const leaf = { isLeaf: true, isPic: false, isManager: false, isAdmin: false, managed: false, isMember: false, unassigned: false };
  assert.equal(canPostProgress({ ...leaf, isPic: true }), true);
  assert.equal(canPostProgress({ ...leaf, isManager: true }), true);
  assert.equal(canPostProgress({ ...leaf, isAdmin: true }), true);
  assert.equal(canPostProgress(leaf), false, "someone who is neither PIC, manager nor Admin");
  for (const who of [{ isPic: true }, { isManager: true }, { isAdmin: true }]) assert.equal(canPostProgress({ ...leaf, ...who, isLeaf: false }), false, "phase or roll-up row");
  assert.equal(canPostProgress({ ...leaf, managed: true, isPic: true }), true);
  assert.equal(canPostProgress({ ...leaf, managed: true, isManager: true }), false);
  assert.equal(canPostProgress({ ...leaf, managed: true, isAdmin: true }), false);
});

test("canPostProgress: a project member may post on a leaf that has no PIC, never on someone else's row", () => {
  const leaf = { isLeaf: true, isPic: false, isManager: false, isAdmin: false, managed: false, isMember: true, unassigned: true };
  assert.equal(canPostProgress(leaf), true);
  assert.equal(canPostProgress({ ...leaf, unassigned: false }), false, "another member is PIC of the row");
  assert.equal(canPostProgress({ ...leaf, isMember: false }), false, "not on the project");
  assert.equal(canPostProgress({ ...leaf, isLeaf: false }), false, "phase or roll-up row");
  assert.equal(canPostProgress({ ...leaf, managed: true }), false, "a Resource Plan row stays with its assignee");
});

test("datesWouldLoop: a task linked to its own phase, or to a phase that waits on it, never resolves", () => {
  const row = (parent: number | null, predecessor: number | null = null, startMode = predecessor ? "linked" : "manual") => ({ parent, predecessor, startMode });
  // Phase 1 holds tasks 11 and 12; phase 2 holds task 21.
  const plan = (changes: Record<number, ReturnType<typeof row>>) => new Map(Object.entries({ 1: row(null), 11: row(1), 12: row(1), 2: row(null), 21: row(2), ...changes }).map(([id, value]) => [Number(id), value]));
  assert.equal(datesWouldLoop(plan({})), false);
  assert.equal(datesWouldLoop(plan({ 12: row(1, 11) })), false, "a task after its sibling");
  assert.equal(datesWouldLoop(plan({ 21: row(2, 1) })), false, "a task after another phase");
  assert.equal(datesWouldLoop(plan({ 11: row(1, 1) })), true, "a task after its own phase");
  assert.equal(datesWouldLoop(plan({ 21: row(2, 1), 11: row(1, 2) })), true, "two phases waiting on each other through their tasks");
  assert.equal(datesWouldLoop(plan({ 11: row(1, 1, "manual") })), false, "a stored predecessor on a manual row is not followed");
  assert.equal(datesWouldLoop(plan({ 1: row(null, 21, "linked") })), false, "a row with children takes its dates from them, not its predecessor");
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

test("a project member posts progress on a task that has no PIC", async (t) => {
  const { app, transactions } = harness({ id: 31, role: "Engineer" });
  const statements = installSqlMock(t, progressAnswers(taskRaw({ id: 11 }), { isPic: false, hasPics: false, isMember: true }));
  try {
    const response = await app.inject({ method: "POST", url: "/api/v1/schedule/tasks/11/updates", payload: progressPayload() });
    assert.equal(response.statusCode, 200, response.body);
    assert.deepEqual(transactions, ["committed"]);
    const probe = statements.find((entry) => entry.statement.includes(" is_pic,"))!;
    assert.equal(probe.params.project, PROJECT_ID, "membership is read for the task's own project");
    assert.match(probe.statement, /u\.is_active=1[^]*pic_member\.user_id=u\.id[^]*\) has_pics/, "a PIC who left or was taken off the team does not hold the row");
  } finally { await app.close(); }
});

test("progress is refused for someone who is not PIC, manager or Admin, and on phase and roll-up rows", async (t) => {
  const cases: Array<{ actor: Actor; task: Record<string, unknown>; rights: { isPic: boolean; hasPics?: boolean; hasChildren?: boolean; isMember?: boolean } }> = [
    { actor: { id: 31, role: "Engineer" }, task: taskRaw({ id: 11 }), rights: { isPic: false } },
    { actor: { id: 31, role: "Engineer" }, task: taskRaw({ id: 11 }), rights: { isPic: false, isMember: true } },
    { actor: { id: 32, role: "Engineer" }, task: taskRaw({ id: 11 }), rights: { isPic: false, hasPics: false } },
    { actor: { id: MANAGER_ID, role: "Project Manager" }, task: taskRaw({ id: 11, kind: "phase", plan_start: null }), rights: { isPic: false } },
    { actor: { id: 99, role: "Admin" }, task: taskRaw({ id: 11 }), rights: { isPic: false, hasChildren: true } },
    { actor: { id: 30, role: "Engineer" }, task: taskRaw({ id: 11 }), rights: { isPic: true, hasChildren: true } },
  ];
  for (const { actor, task, rights } of cases) {
    await t.test(`actor ${actor.id} on ${String(task.kind)}${rights.hasChildren ? " roll-up" : ""}${rights.isMember ? " as member" : ""}${rights.hasPics === false ? " without PIC" : ""}`, async (sub) => {
      const { app, transactions } = harness(actor);
      const statements = installSqlMock(sub, progressAnswers(task, rights));
      try {
        const response = await app.inject({ method: "POST", url: "/api/v1/schedule/tasks/11/updates", payload: progressPayload() });
        assert.equal(response.statusCode, 403, response.body);
        assert.equal(response.json().code, "schedule_pic_required");
        assert.equal(response.json().message, "Only an assigned PIC, the project manager, an Admin or, on a task with no PIC, a project member can update this task's progress.");
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
 * Schedule fixture: heading 1 "Customer FAT" with only the customer's date; heading Execution (3) > done task 4, managed task 5, roll-up 6 > detail 7.
 * Work days: 4 = 5 (Mon-Fri), 5 = 5, 7 = 10 (12 calendar days over two weekends).
 */
const scheduleRows = [
  taskRaw({ id: 1, kind: "phase", name: "Customer FAT", plan_start: "2027-06-01", plan_days: 1, sort_order: 1 }),
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

function scheduleAnswers(pics: Array<{ task: number; user: number; active?: boolean }>, status = "Design", managed: ManagedRaw = readyManaged) {
  return (statement: string): Answer | undefined => {
    if (statement.includes("FROM dbo.projects p WHERE p.id=@project_id")) return { recordset: [{ allowed: true }] };
    if (statement.includes("SELECT id,project_no,name,manager_id,lead_engineer_id,status,target_delivery FROM dbo.projects")) return { recordset: [projectRaw(status)] };
    if (statement.includes("FROM dbo.schedule_tasks WHERE project_id=@project AND deleted_at IS NULL ORDER BY")) return { recordset: scheduleRows };
    if (statement.includes("SELECT pic.task_id,u.id")) return { recordset: pics.map(({ task, user, active = true }) => ({ task_id: task, id: user, name: `User ${user}`, email: `u${user}@example.test`, active })) };
    if (statement.includes(managedQuery)) return { recordset: [{ schedule_task_id: 5, ...managed }] };
    if (statement.includes("SELECT TOP(1) row_version FROM dbo.schedule_tasks")) return { recordset: [{ row_version: SCHEDULE_VERSION }] };
    return undefined;
  };
}

type TaskNode = { id: number; managedByResourcePlan: boolean; canProgress: boolean; children: TaskNode[] };
const flatten = (nodes: TaskNode[]): TaskNode[] => nodes.flatMap((node) => [node, ...flatten(node.children)]);
const flagsById = (nodes: TaskNode[]) => Object.fromEntries(flatten(nodes).map((node) => [node.id, { managed: node.managedByResourcePlan, can: node.canProgress }]));

test("GET schedule: summary uses the shared work-day weighted rule without the headings' own dates", async (t) => {
  const { app } = harness({ id: MANAGER_ID, role: "Project Manager" });
  const statements = installSqlMock(t, scheduleAnswers([{ task: 5, user: 30 }]));
  try {
    const response = await app.inject({ method: "GET", url: `/api/v1/projects/${PROJECT_ID}/schedule` });
    assert.equal(response.statusCode, 200, response.body);
    const { summary } = response.json();
    // (100 x 5 + 40 x 5 + 0 x 10) / 20; counting heading 1's own date as well would give 33.33.
    assert.equal(summary.percentComplete, 35);
    assert.equal(summary.taskCount, 3); assert.equal(summary.doneCount, 1); assert.equal(summary.blockedCount, 0);
    assert.equal(summary.overdueCount, 0);
    assert.equal(summary.plannedProgress, 25);
    assert.equal(summary.health, "On Track");
    // Forecast finish 2027-03-19 against the 2027-12-31 target.
    assert.equal(summary.slipDays, -287);
    // The plan period still spans the whole timeline, the headings' own dates included.
    assert.equal(summary.planStart, "2026-09-07"); assert.equal(summary.planFinish, "2027-06-01");
    assert.equal(statements.filter((entry) => entry.statement.includes("FROM dbo.resource_tasks")).length, 1, "one Resource Plan query per request");
  } finally { await app.close(); }
});

test("GET schedule: the company holidays come along in date order, so the plan screen places a linked row's start as the API does", async (t) => {
  const { app } = harness({ id: MANAGER_ID, role: "Project Manager" });
  const base = scheduleAnswers([{ task: 5, user: 30 }]);
  installSqlMock(t, (statement) => statement.includes("SELECT holiday_date FROM dbo.holidays")
    ? { recordset: [{ holiday_date: new Date("2028-12-31T00:00:00Z") }, { holiday_date: new Date("2028-12-05T00:00:00Z") }] } : base(statement));
  try {
    const response = await app.inject({ method: "GET", url: `/api/v1/projects/${PROJECT_ID}/schedule` });
    assert.equal(response.statusCode, 200, response.body);
    assert.deepEqual(response.json().holidays, ["2028-12-05", "2028-12-31"]);
  } finally { await app.close(); }
});

test("GET schedule: a heading with nothing under it yet does not count toward health, every other row does", async (t) => {
  const { app } = harness({ id: MANAGER_ID, role: "Project Manager" });
  installSqlMock(t, scheduleAnswers([{ task: 5, user: 30 }]));
  try {
    const tasks = flatten((await app.inject({ method: "GET", url: `/api/v1/projects/${PROJECT_ID}/schedule` })).json().tasks as TaskNode[]) as Array<TaskNode & { countsTowardHealth: boolean }>;
    // Heading 1 is only the customer's date while the project has work rows, so the screens leave it out of Late and Blocked.
    assert.deepEqual(Object.fromEntries(tasks.map((task) => [task.id, task.countsTowardHealth])), { 1: false, 3: true, 4: true, 5: true, 6: true, 7: true });
  } finally { await app.close(); }
});

test("GET schedule: canProgress and managedByResourcePlan per row", async (t) => {
  await t.test("project manager", async (sub) => {
    const { app } = harness({ id: MANAGER_ID, role: "Project Manager" });
    installSqlMock(sub, scheduleAnswers([{ task: 5, user: 30 }]));
    try {
      const flags = flagsById((await app.inject({ method: "GET", url: `/api/v1/projects/${PROJECT_ID}/schedule` })).json().tasks);
      assert.deepEqual(flags, {
        1: { managed: false, can: false }, 3: { managed: false, can: false }, 4: { managed: false, can: true },
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
  for (const isMember of [true, false]) {
    await t.test(isMember ? "project member: rows with no PIC" : "reader who is not on the project: rows with no PIC", async (sub) => {
      const { app } = harness({ id: 31, role: "Engineer" });
      const answers = scheduleAnswers([{ task: 5, user: 30 }, { task: 4, user: 30 }]);
      installSqlMock(sub, (statement) => statement.includes("member_project") ? { recordset: [{ value: isMember }] } : answers(statement));
      try {
        const flags = flagsById((await app.inject({ method: "GET", url: `/api/v1/projects/${PROJECT_ID}/schedule` })).json().tasks);
        assert.deepEqual(flags, {
          1: { managed: false, can: false }, 3: { managed: false, can: false }, 4: { managed: false, can: false },
          5: { managed: true, can: false }, 6: { managed: false, can: false }, 7: { managed: false, can: isMember },
        }, "only leaves without a PIC open to members; a colleague's, a managed or a roll-up row stays closed");
      } finally { await app.close(); }
    });
  }
  await t.test("project member: a row whose only PIC left the team is open to members", async (sub) => {
    const { app } = harness({ id: 31, role: "Engineer" });
    const answers = scheduleAnswers([{ task: 5, user: 30 }, { task: 4, user: 40, active: false }, { task: 7, user: 30 }]);
    installSqlMock(sub, (statement) => statement.includes("member_project") ? { recordset: [{ value: true }] } : answers(statement));
    try {
      const response = (await app.inject({ method: "GET", url: `/api/v1/projects/${PROJECT_ID}/schedule` })).json();
      const flags = flagsById(response.tasks);
      assert.equal(flags[4]!.can, true, "user 40 is no longer an active team member");
      assert.equal(flags[7]!.can, false, "user 30 still holds row 7");
      const row4 = flatten(response.tasks).find((task) => task.id === 4) as TaskNode & { pics: Array<{ id: number; active: boolean }> };
      assert.deepEqual(row4.pics.map((pic) => [pic.id, pic.active]), [[40, false]], "the plan still names the old PIC, marked inactive");
    } finally { await app.close(); }
  });
  await t.test("Admin", async (sub) => {
    const { app } = harness({ id: 99, role: "Admin" });
    installSqlMock(sub, scheduleAnswers([{ task: 5, user: 30 }]));
    try {
      const flags = flagsById((await app.inject({ method: "GET", url: `/api/v1/projects/${PROJECT_ID}/schedule` })).json().tasks);
      assert.deepEqual([4, 5, 7].map((id) => flags[id]!.can), [true, false, true]);
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

test("GET me/work: a task shared by several PICs takes no personal task, and quiet days follow the last progress report", async (t) => {
  const actor = { id: 30, role: "Engineer" };
  const { app } = harness(actor);
  const rows = [
    taskRaw({ id: 3, kind: "phase", name: "Execution", plan_start: null, plan_days: 1 }),
    taskRaw({ id: 8, parent_id: 3, name: "Mine alone", plan_start: "2027-03-01", updated_at: "2026-10-05T00:00:00Z" }),
    taskRaw({ id: 10, parent_id: 3, sort_order: 2, name: "Shared", plan_start: "2027-03-01" }),
  ];
  installSqlMock(t, (statement) => {
    if (statement.includes("SELECT DISTINCT p.id,p.project_no")) return { recordset: [{ id: PROJECT_ID, project_no: "P-26-007", name: "Line 3 IoT", manager_id: MANAGER_ID, manager_name: "PM", status: "Design", can_update: true }] };
    if (statement.includes("FROM dbo.schedule_tasks WHERE project_id=@project AND deleted_at IS NULL ORDER BY")) return { recordset: rows };
    if (statement.includes("SELECT pic.task_id,u.id")) return { recordset: [{ task_id: 8, id: 30, name: "Me", email: "me@example.test" }, { task_id: 10, id: 30, name: "Me", email: "me@example.test" }, { task_id: 10, id: 31, name: "Colleague", email: "c@example.test" }] };
    if (statement.includes("SELECT task_id,MAX(occurred_at) last_at FROM dbo.schedule_updates")) return { recordset: [{ task_id: 8, last_at: "2026-09-20T03:00:00Z" }] };
    if (statement.includes("SELECT TOP(1) row_version FROM dbo.schedule_tasks")) return { recordset: [{ row_version: SCHEDULE_VERSION }] };
    return undefined;
  });
  try {
    const items = (await app.inject({ method: "GET", url: "/api/v1/me/work" })).json() as Array<Record<string, unknown>>;
    const byId = Object.fromEntries(items.map((item) => [item.taskId, item]));
    assert.equal(byId[8]!.canAddDetail, true);
    // A personal task would make the shared row a roll-up and take it out of the colleague's My Work.
    assert.equal(byId[10]!.canAddDetail, false);
    // A plan edit touched updated_at on 2026-10-05; the last progress report was 2026-09-20.
    assert.equal(byId[8]!.lastProgressAt, "2026-09-20T03:00:00Z");
    assert.equal(byId[10]!.lastProgressAt, null);
  } finally { await app.close(); }
});

test("GET me/work: a project member also gets the open rows that have no PIC, to update but not to replan", async (t) => {
  const actor = { id: 30, role: "Engineer" };
  const rows = [
    taskRaw({ id: 3, kind: "phase", name: "Execution", plan_start: null, plan_days: 1 }),
    taskRaw({ id: 8, parent_id: 3, name: "Mine", plan_start: "2027-03-01" }),
    taskRaw({ id: 12, parent_id: 3, sort_order: 2, name: "Nobody yet", plan_start: "2027-03-01" }),
    taskRaw({ id: 13, parent_id: 3, sort_order: 3, name: "Nobody, finished", plan_start: "2027-03-01", status: "Done", percent_done: 100 }),
    taskRaw({ id: 14, parent_id: 3, sort_order: 4, name: "Colleague's", plan_start: "2027-03-01" }),
    taskRaw({ id: 15, parent_id: 3, sort_order: 5, name: "Held by someone who left", plan_start: "2027-03-01" }),
  ];
  for (const isMember of [true, false]) {
    await t.test(isMember ? "member" : "elevated reader who is not on the project", async (sub) => {
      const { app } = harness(actor);
      const statements = installSqlMock(sub, (statement) => {
        if (statement.includes("SELECT DISTINCT p.id,p.project_no")) return { recordset: [{ id: PROJECT_ID, project_no: "P-26-007", name: "Line 3 IoT", manager_id: MANAGER_ID, manager_name: "PM", status: "Design", can_update: true, is_member: isMember }] };
        if (statement.includes("FROM dbo.schedule_tasks WHERE project_id=@project AND deleted_at IS NULL ORDER BY")) return { recordset: rows };
        if (statement.includes("SELECT pic.task_id,u.id")) return { recordset: [{ task_id: 8, id: 30, name: "Me", email: "me@example.test" }, { task_id: 14, id: 31, name: "Colleague", email: "c@example.test" }, { task_id: 15, id: 40, name: "Left", email: "l@example.test", active: false }] };
        if (statement.includes("SELECT TOP(1) row_version FROM dbo.schedule_tasks")) return { recordset: [{ row_version: SCHEDULE_VERSION }] };
        return undefined;
      });
      try {
        const response = await app.inject({ method: "GET", url: "/api/v1/me/work" });
        assert.equal(response.statusCode, 200, response.body);
        const byId = Object.fromEntries((response.json() as Array<Record<string, unknown>>).map((item) => [item.taskId, item]));
        assert.deepEqual(Object.keys(byId).map(Number).sort((a, b) => a - b), isMember ? [8, 12, 15] : [8]);
        assert.equal(byId[8]!.unassigned, false);
        if (isMember) assert.deepEqual([byId[12]!.unassigned, byId[12]!.canUpdate, byId[12]!.canRequestDays, byId[12]!.canAddDetail, byId[12]!.canDeleteDetail], [true, true, false, false, false]);
        const projects = statements.find((entry) => entry.statement.includes("SELECT DISTINCT p.id,p.project_no"))!.statement;
        assert.match(projects, /p\.status<>N'Closed' AND \(p\.manager_id=@actor/, "a project counts without a PIC row while the reader is on it");
      } finally { await app.close(); }
    });
  }
});

test("GET day-requests/pending lists requests the user can answer, with their WBS", async (t) => {
  const { app } = harness({ id: MANAGER_ID, role: "Project Manager" });
  const statements = installSqlMock(t, (statement) => {
    if (statement.includes("FROM dbo.schedule_updates s")) return { recordset: [{ id: 90, project_id: PROJECT_ID, project_no: "P-26-007", project_name: "Line 3 IoT", task_id: 5, task_name: "Panel build", request_days: 3, comment: "Cable delay", occurred_at: "2026-10-05T03:00:00Z", actor_name: "User 30" }] };
    if (statement.includes("FROM dbo.schedule_tasks WHERE project_id=@project AND deleted_at IS NULL ORDER BY")) return { recordset: scheduleRows };
    return undefined;
  });
  try {
    const response = await app.inject({ method: "GET", url: "/api/v1/schedule/day-requests/pending" });
    assert.equal(response.statusCode, 200, response.body);
    assert.deepEqual(response.json(), [{ id: 90, projectId: PROJECT_ID, projectNo: "P-26-007", projectName: "Line 3 IoT", taskId: 5, wbs: "2.2", taskName: "Panel build", requestDays: 3, comment: "Cable delay", requestedBy: "User 30", occurredAt: "2026-10-05T03:00:00Z" }]);
    const query = statements.find((entry) => entry.statement.includes("FROM dbo.schedule_updates s"))!;
    // A project manager answers for the projects they manage; only an Engineering Manager or Admin sees the rest of their scope.
    assert.equal(query.params.answer_all, false);
    assert.match(query.statement, /p\.manager_id=@actor OR \(@answer_all=1/);
  } finally { await app.close(); }
});

test("GET schedule/search escapes LIKE wildcards and caps the answer", async () => {
  const seen: Array<Record<string, unknown>> = [];
  const app = Fastify();
  registerErrorHandler(app);
  const database = {
    transaction: async () => { throw new Error("unexpected"); },
    query: async (statement: string, bind?: (request: Binder) => void) => {
      const params: Params = {}; const request: Binder = { input: (name, ...rest) => { params[name] = rest.length > 1 ? rest[1] : rest[0]; return request; } };
      bind?.(request);
      if (statement.includes("user_effective_permissions")) return { recordset: [{ allowed: true }] };
      seen.push({ statement, ...params });
      return { recordset: Array.from({ length: 301 }, (_, index) => ({ project_id: PROJECT_ID, id: index + 1 })) };
    },
  } as unknown as Database;
  registerScheduleRoutes(app, database, { demandPermission: async () => {}, required: async () => ({ id: 30, role: "Engineer" }) } as unknown as CurrentUserService, "Asia/Bangkok");
  try {
    assert.equal((await app.inject({ method: "GET", url: "/api/v1/schedule/search?q=a" })).statusCode, 400, "one character is too short");
    const response = await app.inject({ method: "GET", url: `/api/v1/schedule/search?q=${encodeURIComponent("50%_[x]")}` });
    assert.equal(response.statusCode, 200, response.body);
    const body = response.json() as { matches: unknown[]; truncated: boolean };
    assert.equal(body.matches.length, 300); assert.equal(body.truncated, true);
    assert.equal(seen[0]!.pattern, "%50\\%\\_\\[x]%");
    assert.match(String(seen[0]!.statement), /ESCAPE N'\\'/);
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

test("canAnswerDayRequests follows dbo.answer_schedule_day_request: the manager, or an Engineering Manager / Admin in any role held", () => {
  const project = { managerId: MANAGER_ID };
  const user = (id: number, role: string, roles?: string[]) => ({ id, role, ...(roles ? { roles } : {}) }) as unknown as Parameters<typeof canAnswerDayRequests>[1];
  assert.equal(canAnswerDayRequests(project, user(MANAGER_ID, "Project Manager")), true);
  assert.equal(canAnswerDayRequests(project, user(40, "Engineering Manager")), true);
  assert.equal(canAnswerDayRequests(project, user(41, "Admin")), true);
  // Since migration 068 the procedure reads dbo.user_effective_roles, so an additional role counts too.
  assert.equal(canAnswerDayRequests(project, user(42, "Project Manager", ["Project Manager", "Engineering Manager"])), true);
  assert.equal(canAnswerDayRequests(project, user(43, "Project Manager")), false);
});

test("migration 068 makes the answer procedure read every role a user holds", async () => {
  const { readFile } = await import("node:fs/promises");
  const migration = await readFile(new URL("../../database/migrations/068_day_request_effective_roles.sql", import.meta.url), "utf8");
  assert.match(migration, /CREATE OR ALTER PROCEDURE dbo\.answer_schedule_day_request/);
  assert.match(migration, /WITH EXECUTE AS OWNER/);
  assert.match(migration, /FROM dbo\.user_effective_roles\s+WHERE user_id = @answer_by AND code IN \(N'Engineering Manager', N'Admin'\)/);
  assert.doesNotMatch(migration, /INNER JOIN dbo\.roles r WITH \(UPDLOCK, HOLDLOCK\) ON r\.id = u\.role_id/, "the primary-role lookup is gone");
  // The rest of the procedure is the 007 body: the same THROW numbers the API maps.
  for (const number of [51110, 51114, 51115, 51116, 51117, 51121, 51122, 51123, 51125, 51126]) assert.match(migration, new RegExp(`THROW ${number},`), String(number));
  assert.match(migration, /VALUES \(68, N'Day-request answers accept additional roles'\)/);
});

test("GET schedule: canAnswerRequests matches canPlan now that the procedure reads every role", async (t) => {
  const cases: Array<{ label: string; actor: Actor; status?: string; permissions?: string[]; canPlan: boolean; canAnswer: boolean }> = [
    { label: "project manager", actor: { id: MANAGER_ID, role: "Project Manager" }, canPlan: true, canAnswer: true },
    { label: "primary Engineering Manager", actor: { id: 40, role: "Engineering Manager" }, canPlan: true, canAnswer: true },
    { label: "additional Engineering Manager", actor: { id: 42, role: "Project Manager", roles: ["Project Manager", "Engineering Manager"] }, canPlan: true, canAnswer: true },
    { label: "additional Admin", actor: { id: 43, role: "Engineer", roles: ["Engineer", "Admin"] }, canPlan: true, canAnswer: true },
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

test("an Engineering Manager held only as an additional role may answer (migration 068)", async (t) => {
  const { app, transactions } = harness({ id: 42, role: "Project Manager", roles: ["Project Manager", "Engineering Manager"] });
  const statements = installSqlMock(t, answerRouteAnswers(() => ({ recordset: [{ task_id: 11, row_version: NEXT_VERSION }] })));
  try {
    const response = await app.inject({ method: "POST", url: "/api/v1/schedule/day-requests/90/answer", payload: answerPayload });
    assert.equal(response.statusCode, 200, response.body);
    assert.deepEqual(transactions, ["committed"]);
    assert.equal(statements.some((entry) => entry.execute), true);
  } finally { await app.close(); }
});

test("someone who is neither the manager nor an Engineering Manager / Admin is refused before the procedure runs", async (t) => {
  const { app, transactions } = harness({ id: 44, role: "Project Manager" });
  const statements = installSqlMock(t, answerRouteAnswers(() => { throw new Error("the procedure must not run"); }));
  try {
    const response = await app.inject({ method: "POST", url: "/api/v1/schedule/day-requests/90/answer", payload: answerPayload });
    assert.equal(response.statusCode, 403, response.body);
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

test("GET schedule returns baseline headers without the frozen snapshot JSON", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../src/routes/schedule.ts", import.meta.url), "utf8");
  const reader = source.slice(source.indexOf("async function readBaselines"), source.indexOf("async function readUpdates"));
  assert.ok(reader.length > 100, "readBaselines moved");
  // The snapshot stays in dbo.schedule_baselines for audit; no screen reads it, so the per-project schedule stays small.
  assert.doesNotMatch(reader, /snapshot_json|JSON\.parse/);
  assert.match(reader, /b\.revision,b\.label,b\.taken_at/);
});

// ---- The shared-task rule from both sides, and the scope of the new cross-project reads ----

test("POST details: a task shared by several PICs refuses a personal task", async (t) => {
  const { app, transactions } = harness({ id: 30, role: "Engineer" });
  const statements = installSqlMock(t, (statement) => {
    if (statement.includes("FROM dbo.schedule_tasks WITH (UPDLOCK,HOLDLOCK) WHERE id=@id AND deleted_at IS NULL")) return { recordset: [taskRaw({ id: 11 })] };
    if (statement.includes("FROM dbo.projects p WHERE p.id=@project_id")) return { recordset: [{ allowed: true }] };
    if (statement.includes("FROM dbo.projects WITH (UPDLOCK,HOLDLOCK) WHERE id=@project")) return { recordset: [projectRaw()] };
    if (statement.includes("SELECT TOP(1) row_version FROM dbo.schedule_tasks")) return { recordset: [{ row_version: SCHEDULE_VERSION }] };
    if (statement.includes("SELECT pic.task_id,u.id")) return { recordset: [{ task_id: 11, id: 30, name: "Me", email: "me@example.test" }, { task_id: 11, id: 31, name: "Colleague", email: "c@example.test" }] };
    if (statement.includes("FROM dbo.schedule_task_pics WITH (UPDLOCK,HOLDLOCK) WHERE task_id=@task AND user_id=@actor")) return { recordset: [{ allowed: true }] };
    return undefined;
  });
  try {
    const response = await app.inject({ method: "POST", url: "/api/v1/schedule/tasks/11/details", payload: { name: "My part", planDays: 2, rowVersion: TASK_VERSION.toString("base64"), scheduleVersion: SCHEDULE_VERSION.toString("base64") } });
    assert.equal(response.statusCode, 409, response.body);
    assert.equal(response.json().code, "schedule_detail_shared_task");
    assert.deepEqual(transactions, ["rolled-back"]);
    assert.equal(statements.some((entry) => entry.statement.includes("INSERT INTO dbo.schedule_tasks")), false);
  } finally { await app.close(); }
});

/** Answers for PUT /schedule/tasks/11 by its manager; `details` = live personal tasks under it, `pics` = its PICs now. */
/** Task 11 under heading 1, with a member's own task (40) under it when details is set. */
function planEditAnswers(details: number, pics: number[]) {
  const tree = [{ id: 1, parent_id: null, predecessor_id: null, kind: "phase", start_mode: "manual" }, { id: 11, parent_id: 1, predecessor_id: null, kind: "task", start_mode: "manual" },
    ...(details ? [{ id: 40, parent_id: 11, predecessor_id: null, kind: "detail", start_mode: "manual" }] : [])];
  return (statement: string): Answer | undefined => {
    if (statement.includes("SELECT id,parent_id,predecessor_id,kind,start_mode,")) return { recordset: tree };
    if (statement.includes("FROM dbo.schedule_tasks WITH (UPDLOCK,HOLDLOCK) WHERE id=@id AND deleted_at IS NULL")) return { recordset: [taskRaw({ id: 11, parent_id: 1 })] };
    if (statement.includes("FROM dbo.projects WITH (UPDLOCK,HOLDLOCK) WHERE id=@project")) return { recordset: [projectRaw()] };
    if (statement.includes("SELECT TOP(1) row_version FROM dbo.schedule_tasks")) return { recordset: [{ row_version: SCHEDULE_VERSION }] };
    if (statement.includes("SELECT pic.task_id,u.id")) return { recordset: pics.map((id) => ({ task_id: 11, id, name: `User ${id}`, email: `${id}@example.test` })) };
    if (statement.includes("FROM dbo.schedule_tasks WHERE project_id=@project AND deleted_at IS NULL ORDER BY")) return { recordset: [taskRaw({ id: 1, kind: "phase", plan_start: null }), taskRaw({ id: 11, parent_id: 1 }), ...(details ? [taskRaw({ id: 40, parent_id: 11, kind: "detail", origin: "Member" })] : [])] };
    if (statement.includes("FROM dbo.users u WHERE u.id=@user")) return { recordset: [{ allowed: true }] };
    if (statement.includes("kind=N'detail' AND deleted_at IS NULL")) return { recordset: [{ found: details }] };
    if (statement.includes("UPDATE dbo.schedule_tasks SET parent_id=")) return { recordset: [{ row_version: NEXT_VERSION }] };
    return undefined;
  };
}
const planEditPayload = (picUserIds: number[]) => ({
  rowVersion: TASK_VERSION.toString("base64"), scheduleVersion: SCHEDULE_VERSION.toString("base64"), parentId: 1, sortOrder: 1, kind: "task",
  name: "Panel wiring", isMilestone: false, visibility: "Internal", planStart: "2027-03-01", planDays: 5, startMode: "manual", predecessorId: null,
  lagDays: 0, picUserIds, picExternal: "", planManDays: 0,
});

test("PUT task: a second PIC is refused while a member's personal task sits under the row", async (t) => {
  const { app } = harness({ id: MANAGER_ID, role: "Project Manager" });
  const statements = installSqlMock(t, planEditAnswers(1, [30]));
  try {
    const response = await app.inject({ method: "PUT", url: "/api/v1/schedule/tasks/11", payload: planEditPayload([30, 31]) });
    assert.equal(response.statusCode, 409, response.body);
    assert.equal(response.json().code, "schedule_detail_shared_task");
    assert.equal(statements.some((entry) => entry.statement.includes("UPDATE dbo.schedule_tasks SET parent_id=")), false);
  } finally { await app.close(); }
});

test("PUT task: the personal-task check runs only when the row gains a second PIC", async (t) => {
  const cases: Array<[number[], number[], boolean]> = [[[30], [31], false], [[30, 31], [30, 31, 32], false], [[30], [30, 31], true]];
  for (const [pics, payloadPics, checked] of cases) {
    await t.test(`${pics.join(",")} -> ${payloadPics.join(",")}`, async (sub) => {
      const { app } = harness({ id: MANAGER_ID, role: "Project Manager" });
      const statements = installSqlMock(sub, planEditAnswers(0, pics));
      try {
        const response = await app.inject({ method: "PUT", url: "/api/v1/schedule/tasks/11", payload: planEditPayload(payloadPics) });
        assert.notEqual(response.json().code, "schedule_detail_shared_task", response.body);
        assert.equal(statements.some((entry) => entry.statement.includes("kind=N'detail'")), checked);
        assert.ok(statements.some((entry) => entry.statement.includes("UPDATE dbo.schedule_tasks SET parent_id=")), "the edit itself goes ahead");
      } finally { await app.close(); }
    });
  }
});

test("PUT task: a link to the row's own phase is refused before the write; a link to a sibling goes ahead", async (t) => {
  // Phase 1 holds tasks 11 and 12.
  const rows = [
    { id: 1, parent_id: null, predecessor_id: null, kind: "phase", start_mode: "manual" },
    { id: 11, parent_id: 1, predecessor_id: null, kind: "task", start_mode: "manual" },
    { id: 12, parent_id: 1, predecessor_id: null, kind: "task", start_mode: "manual" },
  ];
  for (const [predecessorId, refused] of [[1, true], [12, false]] as const) {
    await t.test(`after ${predecessorId}`, async (sub) => {
      const { app } = harness({ id: MANAGER_ID, role: "Project Manager" });
      const base = planEditAnswers(0, [30]);
      const statements = installSqlMock(sub, (statement) =>
        statement.includes("SELECT id,parent_id,predecessor_id,kind,start_mode,") ? { recordset: rows } : base(statement));
      try {
        const response = await app.inject({ method: "PUT", url: "/api/v1/schedule/tasks/11",
          payload: { ...planEditPayload([30]), parentId: 1, startMode: "linked", predecessorId, lagDays: 0, planStart: null } });
        if (refused) { assert.equal(response.statusCode, 409, response.body); assert.equal(response.json().code, "schedule_cycle"); }
        else assert.notEqual(response.json().code, "schedule_cycle", response.body);
        assert.equal(statements.some((entry) => entry.statement.includes("UPDATE dbo.schedule_tasks SET parent_id=")), !refused);
      } finally { await app.close(); }
    });
  }
});

test("GET schedule/search binds the caller's project scope and the closed-projects switch", async () => {
  const cases: Array<[Actor, string, boolean, boolean]> = [
    [{ id: 30, role: "Engineer" }, "", false, false],
    [{ id: 31, role: "Engineer", roles: ["Engineer", "Engineering Manager"] }, "&includeClosed=1", true, true],
  ];
  for (const [actor, query, elevated, includeClosed] of cases) {
    const seen: Array<Record<string, unknown>> = [];
    const app = Fastify();
    registerErrorHandler(app);
    const database = {
      transaction: async () => { throw new Error("unexpected"); },
      query: async (statement: string, bind?: (request: Binder) => void) => {
        const params: Params = {}; const request: Binder = { input: (name, ...rest) => { params[name] = rest.length > 1 ? rest[1] : rest[0]; return request; } };
        bind?.(request); seen.push({ statement, ...params });
        return { recordset: [] };
      },
    } as unknown as Database;
    registerScheduleRoutes(app, database, { demandPermission: async () => {}, required: async () => actor } as unknown as CurrentUserService, "Asia/Bangkok");
    try {
      assert.equal((await app.inject({ method: "GET", url: `/api/v1/schedule/search?q=panel${query}` })).statusCode, 200);
      const search = seen.find((entry) => String(entry.statement).includes("SELECT TOP(301)"))!;
      assert.match(String(search.statement), /@elevated=1 OR p\.manager_id=@actor OR p\.lead_engineer_id=@actor OR EXISTS\(SELECT 1 FROM dbo\.project_members m WHERE m\.project_id=p\.id AND m\.user_id=@actor\)/);
      assert.match(String(search.statement), /@include_closed=1 OR p\.status<>N'Closed'/);
      assert.match(String(search.statement), /p\.deleted_at IS NULL/);
      assert.equal(search.actor, actor.id);
      assert.equal(search.elevated, elevated, "an additional Engineering Manager role widens the scope like the portfolio");
      assert.equal(search.include_closed, includeClosed);
    } finally { await app.close(); }
  }
});

test("GET day-requests/pending: an Engineering Manager held as an additional role sees every request in scope", async (t) => {
  const { app } = harness({ id: 31, role: "Engineer", roles: ["Engineer", "Engineering Manager"] });
  const statements = installSqlMock(t, () => undefined);
  try {
    assert.equal((await app.inject({ method: "GET", url: "/api/v1/schedule/day-requests/pending" })).statusCode, 200);
    const query = statements.find((entry) => entry.statement.includes("FROM dbo.schedule_updates s"))!;
    assert.equal(query.params.answer_all, true);
    assert.equal(query.params.elevated, true);
    assert.match(query.statement, /s\.answer IS NULL/);
    assert.match(query.statement, /p\.status<>N'Closed'/);
  } finally { await app.close(); }
});

test("placeInOrder: a moved row takes a sort order between its new neighbours, and the siblings are numbered again only when there is no room", () => {
  const siblings = [{ id: 1, sortOrder: 10 }, { id: 2, sortOrder: 20 }, { id: 3, sortOrder: 30 }];
  assert.deepEqual(placeInOrder(siblings, 2, 9), { sortOrder: 15, renumber: [] });
  assert.deepEqual(placeInOrder(siblings, null, 9), { sortOrder: 40, renumber: [] }, "last");
  assert.deepEqual(placeInOrder(siblings, 1, 9), { sortOrder: 0, renumber: [] }, "first");
  assert.deepEqual(placeInOrder([], null, 9), { sortOrder: 10, renumber: [] }, "the only row");
  // 10 and 11 leave no room: number them again in tens, the moved row between them.
  assert.deepEqual(placeInOrder([{ id: 1, sortOrder: 10 }, { id: 2, sortOrder: 11 }], 2, 9), { sortOrder: 20, renumber: [{ id: 2, sortOrder: 30 }] });
  // At the edge of the allowed range the siblings are numbered again rather than going past it.
  assert.deepEqual(placeInOrder([{ id: 1, sortOrder: -999_995 }], 1, 9), { sortOrder: 10, renumber: [{ id: 1, sortOrder: 20 }] });
  assert.throws(() => placeInOrder(siblings, 99, 9), (error: unknown) => error instanceof ApiError && error.code === "schedule_move_target_invalid");
});

function moveAnswers(managed: boolean) {
  return (statement: string): Answer | undefined => {
    if (statement.includes("FROM dbo.schedule_tasks WITH (UPDLOCK,HOLDLOCK) WHERE id=@id AND deleted_at IS NULL")) return { recordset: [taskRaw({ id: 11, parent_id: 1, sort_order: 10 })] };
    if (statement.includes("FROM dbo.projects WITH (UPDLOCK,HOLDLOCK) WHERE id=@project")) return { recordset: [projectRaw()] };
    if (statement.includes("SELECT TOP(1) row_version FROM dbo.schedule_tasks")) return { recordset: [{ row_version: SCHEDULE_VERSION }] };
    if (statement.includes("FROM dbo.resource_tasks WHERE project_id=@project AND schedule_task_id IS NOT NULL")) return { recordset: managed ? [{ schedule_task_id: 11, state: "Approved", acknowledged_at: null, assignee_id: 30 }] : [] };
    if (statement.includes("SELECT id,sort_order FROM dbo.schedule_tasks")) return { recordset: [{ id: 12, sort_order: 20 }, { id: 13, sort_order: 30 }] };
    if (statement.includes("UPDATE dbo.schedule_tasks SET parent_id=@parent,sort_order=@sort")) return { recordset: [{ row_version: NEXT_VERSION }] };
    return undefined;
  };
}

test("POST move: a row moves between two siblings without touching the others, and is recorded in the plan's history", async (t) => {
  const { app, transactions } = harness({ id: MANAGER_ID, role: "Project Manager" });
  const statements = installSqlMock(t, moveAnswers(false));
  try {
    const response = await app.inject({ method: "POST", url: "/api/v1/schedule/tasks/11/move",
      payload: { rowVersion: TASK_VERSION.toString("base64"), scheduleVersion: SCHEDULE_VERSION.toString("base64"), parentId: 1, beforeId: 13 } });
    assert.equal(response.statusCode, 200, response.body);
    const update = statements.find((entry) => entry.statement.includes("SET parent_id=@parent,sort_order=@sort"));
    assert.equal(update?.params.sort, 25);
    assert.equal(update?.params.parent, 1);
    assert.equal(statements.some((entry) => entry.statement.includes("UPDATE dbo.schedule_tasks SET sort_order=@sort")), false, "no sibling renumbered");
    assert.ok(statements.some((entry) => entry.statement.includes("schedule_updates") && /INSERT/.test(entry.statement)), "a plan history entry");
    assert.deepEqual(transactions, ["committed"]);
  } finally { await app.close(); }
});

test("POST move: a Resource Plan row moves where it is or under another heading, but never to the top", async (t) => {
  // Headings 1 and 2; the managed task 11 sits under heading 1, as rows from Resource Plan wait under "ยังไม่จัดหัวข้อ".
  const tree = [{ id: 1, parent_id: null, predecessor_id: null, kind: "phase", start_mode: "manual" }, { id: 2, parent_id: null, predecessor_id: null, kind: "phase", start_mode: "manual" },
    { id: 11, parent_id: 1, predecessor_id: null, kind: "task", start_mode: "manual" }];
  for (const [parentId, refused] of [[1, false], [2, false], [null, true]] as const) {
    await t.test(`parent ${parentId}`, async (sub) => {
      const { app } = harness({ id: MANAGER_ID, role: "Project Manager" });
      const base = moveAnswers(true);
      installSqlMock(sub, (statement) => statement.includes("SELECT id,parent_id,predecessor_id,kind,start_mode,") ? { recordset: tree } : base(statement));
      try {
        const response = await app.inject({ method: "POST", url: "/api/v1/schedule/tasks/11/move",
          payload: { rowVersion: TASK_VERSION.toString("base64"), scheduleVersion: SCHEDULE_VERSION.toString("base64"), parentId, beforeId: null } });
        if (refused) { assert.equal(response.statusCode, 422, response.body); assert.equal(response.json().code, "schedule_parent_kind_invalid"); }
        else assert.equal(response.statusCode, 200, response.body);
      } finally { await app.close(); }
    });
  }
});


test("scheduleParentAllowed: six planning levels and exclusive member details", () => {
  const phase = { kind: "phase", parent: null }, task = { kind: "task", parent: null };
  assert.equal(MAX_PLAN_DEPTH, 5);
  assert.equal(scheduleParentAllowed("phase", null, 0), true);
  assert.equal(scheduleParentAllowed("phase", phase, 1), false);
  assert.equal(scheduleParentAllowed("task", null, 0), true);
  assert.equal(scheduleParentAllowed("task", phase, 1), true);
  for (let depth = 1; depth <= MAX_PLAN_DEPTH; depth++) assert.equal(scheduleParentAllowed("task", task, depth), true);
  assert.equal(scheduleParentAllowed("task", task, 6), false);
  assert.equal(scheduleParentAllowed("task", { kind: "detail" }, 3), false);
  assert.equal(scheduleParentAllowed("task", task, 3, ["detail"]), false);
  assert.equal(scheduleParentAllowed("task", task, 3, ["task"]), true);
  assert.equal(scheduleParentAllowed("detail", null, 0), false);
  assert.equal(scheduleParentAllowed("detail", phase, 1), false);
  assert.equal(scheduleParentAllowed("detail", task, 6, ["task"]), false);
  assert.equal(scheduleParentAllowed("detail", task, 6, ["detail"]), true);
});

const hierarchyRows = (levels: number) => Array.from({ length: levels }, (_, depth) => taskRaw({ id: depth + 1, parent_id: depth ? depth : null, kind: depth ? "task" : "phase" }));

test("hierarchy validates existing descendants when moving or changing a row", async (t) => {
  const cases = [
    { name: "first sub task", rows: [taskRaw({ id: 1 })], parentId: 1, taskId: null, kind: "task", code: null },
    { name: "detail under sub task", rows: [taskRaw({ id: 1 }), taskRaw({ id: 2, parent_id: 1 })], parentId: 2, taskId: null, kind: "detail", code: null },
    { name: "task beside detail", rows: [taskRaw({ id: 1 }), taskRaw({ id: 2, parent_id: 1, kind: "detail" })], parentId: 1, taskId: null, kind: "task", code: "schedule_child_kind_invalid" },
    { name: "detail beside task", rows: [taskRaw({ id: 1 }), taskRaw({ id: 2, parent_id: 1 })], parentId: 1, taskId: null, kind: "detail", code: "schedule_child_kind_invalid" },
    { name: "four planning levels", rows: hierarchyRows(3), parentId: 3, taskId: null, kind: "task", code: null },
    { name: "six planning levels", rows: hierarchyRows(5), parentId: 5, taskId: null, kind: "task", code: null },
    { name: "depth six refused", rows: hierarchyRows(6), parentId: 6, taskId: null, kind: "task", code: "schedule_parent_kind_invalid" },
    { name: "detail below deepest task", rows: hierarchyRows(6), parentId: 6, taskId: null, kind: "detail", code: null },
    { name: "moving a branch to the limit with a detail", rows: [...hierarchyRows(4), taskRaw({ id: 11 }), taskRaw({ id: 12, parent_id: 11 }), taskRaw({ id: 13, parent_id: 12, kind: "detail" })], parentId: 4, taskId: 11, kind: "task", code: null },
    { name: "moving a branch too deep", rows: [...hierarchyRows(5), taskRaw({ id: 11 }), taskRaw({ id: 12, parent_id: 11 })], parentId: 5, taskId: 11, kind: "task", code: "schedule_parent_kind_invalid" },
    // The top of the plan holds main headings only.
    { name: "changing a heading into a task at the top", rows: [taskRaw({ id: 11, kind: "phase" }), taskRaw({ id: 12, parent_id: 11 }), taskRaw({ id: 13, parent_id: 12 })], parentId: null, taskId: 11, kind: "task", code: "schedule_parent_kind_invalid" },
    { name: "moving under a descendant", rows: [taskRaw({ id: 11 }), taskRaw({ id: 12, parent_id: 11 })], parentId: 12, taskId: 11, kind: "task", code: "schedule_cycle" },
  ];
  for (const item of cases) await t.test(item.name, async (sub) => {
    installSqlMock(sub, (statement) => statement.includes("SELECT id,parent_id,predecessor_id,kind,start_mode,") ? { recordset: item.rows } : undefined);
    const run = () => validateGraphAndHierarchy({} as Transaction, PROJECT_ID, item.taskId, { ...planInput(planEditPayload([]), false), parentId: item.parentId, kind: item.kind });
    if (item.code) await assert.rejects(run, (error: unknown) => error instanceof ApiError && error.code === item.code);
    else await run();
  });
});

test("create, PUT and move refuse excessive depth including task descendants", async (t) => {
  for (const route of ["create", "PUT", "move"] as const) await t.test(route, async (sub) => {
    const { app, transactions } = harness({ id: MANAGER_ID, role: "Project Manager" });
    const base = planEditAnswers(0, []);
    const parentId = route === "create" ? 6 : 5;
    const statements = installSqlMock(sub, (statement) => {
      if (statement.includes("SELECT id,parent_id,predecessor_id,kind,start_mode,")) return { recordset: [...hierarchyRows(parentId), taskRaw({ id: 11 }), taskRaw({ id: 12, parent_id: 11 })] };
      return base(statement);
    });
    try {
      const response = await app.inject({ method: route === "PUT" ? "PUT" : "POST", url: route === "create" ? `/api/v1/projects/${PROJECT_ID}/schedule/tasks` : `/api/v1/schedule/tasks/11${route === "move" ? "/move" : ""}`,
        payload: { ...planEditPayload([]), parentId, beforeId: null } });
      assert.equal(response.statusCode, 422, response.body);
      assert.equal(response.json().code, "schedule_parent_kind_invalid");
      assert.match(response.json().message, /Plans go at most 6 levels deep/);
      assert.deepEqual(transactions, ["rolled-back"]);
      assert.equal(statements.some((entry) => /INSERT INTO dbo.schedule_tasks|UPDATE dbo.schedule_tasks SET parent_id/.test(entry.statement)), false);
    } finally { await app.close(); }
  });
});

test("create, PUT and move reject the first sub task when its parent is in use", async (t) => {
  for (const depth of [0, 3]) for (const route of ["create", "PUT", "move"] as const) for (const reason of ["status", "percent_done", "actual_start", "managed", "pending"] as const) {
    await t.test(`depth ${depth}, ${route}: ${reason}`, async (sub) => {
      const { app, transactions } = harness({ id: MANAGER_ID, role: "Project Manager" });
      const ancestors = depth ? [taskRaw({ id: 101, kind: "phase" }), taskRaw({ id: 102, parent_id: 101 }), taskRaw({ id: 103, parent_id: 102 })] : [];
      const parent = taskRaw({ id: 1, parent_id: depth ? 103 : null, name: "Installation", ...(reason === "status" ? { status: "In Progress" } : reason === "percent_done" ? { percent_done: 10 } : reason === "actual_start" ? { actual_start: "2027-03-01" } : {}) });
      const base = planEditAnswers(0, []);
      const statements = installSqlMock(sub, (statement, params) => {
        if (statement.includes("SELECT id,parent_id,predecessor_id,kind,start_mode,")) return { recordset: [...ancestors, parent, taskRaw({ id: 11 })] };
        // Row 11 starts outside row 1, so a move into it is a change of parent.
        if (statement.includes("FROM dbo.schedule_tasks WITH (UPDLOCK,HOLDLOCK) WHERE id=@id AND deleted_at IS NULL")) return { recordset: [taskRaw({ id: 11 })] };
        if (statement.includes("WHERE schedule_task_id=@parent")) return { recordset: [{ value: reason === "managed" }] };
        if (statement.includes("field=N'request' AND request_days>0")) return { recordset: [{ value: reason === "pending" && params.task === 1 }] };
        return base(statement);
      });
      try {
        const payload = { ...planEditPayload([]), parentId: 1, beforeId: null };
        const response = await app.inject({ method: route === "PUT" ? "PUT" : "POST", url: route === "create" ? `/api/v1/projects/${PROJECT_ID}/schedule/tasks` : `/api/v1/schedule/tasks/11${route === "move" ? "/move" : ""}`, payload });
        assert.equal(response.statusCode, 409, response.body);
        assert.equal(response.json().code, "schedule_row_in_use");
        assert.equal(response.json().message, "Installation already has progress or linked work, so it cannot take sub tasks. Add the sub tasks under another task.");
        assert.deepEqual(transactions, ["rolled-back"]);
        assert.equal(statements.some((entry) => /INSERT INTO dbo.schedule_tasks|UPDATE dbo.schedule_tasks SET parent_id/.test(entry.statement)), false);
      } finally { await app.close(); }
    });
  }
});

test("an existing sub task permits another even after progress; a detail endpoint refuses sub tasks", async (t) => {
  await t.test("existing sub tasks", async (sub) => {
    installSqlMock(sub, (statement) => statement.includes("SELECT id,parent_id,predecessor_id,kind,start_mode,") ? { recordset: [taskRaw({ id: 1, status: "In Progress", percent_done: 50 }), taskRaw({ id: 2, parent_id: 1 })] } : undefined);
    await validateGraphAndHierarchy({} as Transaction, PROJECT_ID, null, { ...planInput(planEditPayload([]), false), parentId: 1 });
  });
  await t.test("details route", async (sub) => {
    const { app } = harness({ id: 30, role: "Engineer" });
    const base = planEditAnswers(0, [30]);
    installSqlMock(sub, (statement) => {
      if (statement.includes("FROM dbo.projects p WHERE p.id=@project_id")) return { recordset: [{ allowed: true }] };
      if (statement.includes("kind=N'task' AND deleted_at IS NULL")) return { recordset: [{ found: 1 }] };
      return base(statement);
    });
    try {
      const response = await app.inject({ method: "POST", url: "/api/v1/schedule/tasks/11/details", payload: { name: "Personal work", planDays: 5, rowVersion: TASK_VERSION.toString("base64"), scheduleVersion: SCHEDULE_VERSION.toString("base64") } });
      assert.equal(response.statusCode, 422, response.body);
      assert.equal(response.json().code, "schedule_parent_kind_invalid");
    } finally { await app.close(); }
  });
});

test("calculator rolls weighted progress, dates and status through all four levels", () => {
  const row = (id: number, parentId: number | null, changes: Partial<ScheduleCalculationTask> = {}): ScheduleCalculationTask => ({ id, parentId, sortOrder: id, planStart: "2027-03-01", planDays: 1, startMode: "manual", predecessorId: null, lagDays: 0, actualStart: null, actualFinish: null, forecastFinish: null, percentComplete: 0, status: "Not Started", ...changes });
  const { byId } = resolveSchedule([
    row(1, null), row(2, 1), row(6, 2),
    row(3, 6, { percentComplete: 100, status: "Done", actualStart: "2027-03-01", actualFinish: "2027-03-01" }),
    row(4, 6, { planStart: "2027-03-02", planDays: 3, status: "Blocked", forecastFinish: "2027-03-05" }),
    row(5, 1, { planStart: "2027-03-05", percentComplete: 50, status: "In Progress" }),
  ], new Set());
  assert.equal(byId.get(6)!.percentComplete, 25);
  assert.equal(byId.get(2)!.percentComplete, 25);
  assert.equal(byId.get(1)!.percentComplete, 30);
  assert.equal(byId.get(3)!.wbs, "1.1.1.1");
  for (const id of [1, 2, 6]) {
    assert.equal(byId.get(id)!.status, "Blocked");
    assert.equal(byId.get(id)!.planStart, "2027-03-01");
    assert.equal(byId.get(id)!.actualStart, "2027-03-01");
    assert.equal(byId.get(id)!.actualFinish, null);
    assert.equal(byId.get(id)!.forecastFinish, "2027-03-05");
  }
  assert.equal(byId.get(6)!.planFinish, "2027-03-04");
  assert.equal(byId.get(2)!.planFinish, "2027-03-04");
  assert.equal(byId.get(1)!.planFinish, "2027-03-05");
});


function deletionAnswers(rows: Record<string, unknown>[], status = "Design") {
  return (statement: string, params: Params): Answer | undefined => {
    if (statement.includes("FROM dbo.schedule_tasks WITH (UPDLOCK,HOLDLOCK) WHERE id=@id AND deleted_at IS NULL")) return { recordset: rows.filter((row) => row.id === params.id) };
    if (statement.includes("FROM dbo.projects WITH (UPDLOCK,HOLDLOCK) WHERE id=@project")) return { recordset: [projectRaw(status)] };
    if (statement.includes("SELECT TOP(1) row_version FROM dbo.schedule_tasks")) return { recordset: [{ row_version: lockedScheduleVersion(statement) ? SCHEDULE_VERSION : NEXT_VERSION }] };
    if (statement.includes("FROM dbo.schedule_tasks WHERE project_id=@project AND deleted_at IS NULL ORDER BY")) return { recordset: rows };
    if (statement.includes("FROM dbo.schedule_tasks t WITH(UPDLOCK,HOLDLOCK)")) {
      const removing = new Set<number>(JSON.parse(String(params.removing)));
      assert.ok(statement.includes("d.id NOT IN (SELECT id FROM OPENJSON(@removing)"));
      return { recordset: rows.map((row) => ({ ...row,
        started: row.status !== "Not Started" || Number(row.percent_done) > 0 || row.actual_start != null || row.actual_end != null || Number(row.actual_man_days) > 0,
        referenced: Boolean(row.referenced) || rows.some((other) => other.predecessor_id === row.id && !removing.has(Number(other.id))),
      })) };
    }
    return undefined;
  };
}

const deletionPayload = () => ({ scheduleVersion: SCHEDULE_VERSION.toString("base64"), rowVersion: TASK_VERSION.toString("base64") });

test("delete schedule row removes untouched descendants deepest first, including internal dependencies", async (t) => {
  const { app, transactions } = harness({ id: MANAGER_ID, role: "Project Manager" });
  const rows = [taskRaw({ id: 11, kind: "phase", name: "Installation" }), taskRaw({ id: 12, parent_id: 11 }),
    taskRaw({ id: 13, parent_id: 12 }), taskRaw({ id: 14, parent_id: 12, predecessor_id: 13 }), taskRaw({ id: 15 })];
  const statements = installSqlMock(t, deletionAnswers(rows));
  try {
    const response = await app.inject({ method: "DELETE", url: "/api/v1/schedule/tasks/11", payload: deletionPayload() });
    assert.equal(response.statusCode, 200, response.body);
    assert.deepEqual(response.json(), { removed: [13, 14, 12, 11], scheduleVersion: NEXT_VERSION.toString("base64") });
    assert.deepEqual(transactions, ["committed"]);
    const removals = statements.filter((entry) => entry.statement.includes("UPDATE dbo.schedule_tasks SET deleted_at="));
    assert.deepEqual(removals.map((entry) => entry.params.id), [13, 14, 12, 11]);
    for (const removal of removals) {
      const history = statements.findIndex((entry) => entry.params.task === removal.params.id && entry.params.field === "deleted");
      assert.ok(history >= 0 && history < statements.indexOf(removal));
      assert.equal(statements[history]!.params.comment, "Removed in Project Schedule");
      assert.match(removal.statement, /deleted_at IS NULL/);
    }
    const audit = statements.find((entry) => entry.params.action === "Deleted schedule row")!;
    assert.deepEqual(JSON.parse(String(audit.params.before)), rows.filter((row) => row.id !== 15).map((row) => ({ id: row.id, name: row.name })));
  } finally { await app.close(); }
});

test("delete schedule row refuses any descendant with progress, details, a request or linked work", async (t) => {
  const cases = [
    { status: "In Progress" }, { percent_done: 1 }, { actual_start: "2026-11-03" }, { actual_end: "2026-11-03" },
    { actual_man_days: 0.25 }, { kind: "detail" }, { pending: true }, { referenced: true },
  ];
  for (const overrides of cases) await t.test(JSON.stringify(overrides), async (sub) => {
    const { app, transactions } = harness({ id: MANAGER_ID, role: "Project Manager" });
    const statements = installSqlMock(sub, deletionAnswers([taskRaw({ id: 11 }), taskRaw({ id: 12, parent_id: 11, name: "Child in use", ...overrides })]));
    try {
      const response = await app.inject({ method: "DELETE", url: "/api/v1/schedule/tasks/11", payload: deletionPayload() });
      assert.equal(response.statusCode, 409, response.body);
      assert.equal(response.json().code, "schedule_row_in_use"); assert.match(response.body, /Child in use/);
      assert.deepEqual(transactions, ["rolled-back"]);
      assert.equal(statements.some((entry) => entry.statement.includes("UPDATE dbo.schedule_tasks")), false);
    } finally { await app.close(); }
  });
});

test("delete schedule row refuses a predecessor reference from outside the removed subtree", async (t) => {
  const { app } = harness({ id: MANAGER_ID, role: "Project Manager" });
  installSqlMock(t, deletionAnswers([taskRaw({ id: 11 }), taskRaw({ id: 12, predecessor_id: 11 })]));
  try {
    const response = await app.inject({ method: "DELETE", url: "/api/v1/schedule/tasks/11", payload: deletionPayload() });
    assert.equal(response.statusCode, 409, response.body); assert.equal(response.json().code, "schedule_row_in_use");
  } finally { await app.close(); }
});

test("delete schedule row enforces permission, owner, closed project and both versions", async (t) => {
  const cases = [
    { label: "permission", actor: MANAGER_ID, deniedPermissions: ["schedule.plan"], code: "schedule_member_required", statusCode: 403 },
    { label: "owner", actor: 99, code: "schedule_member_required", statusCode: 403 },
    { label: "closed", actor: MANAGER_ID, status: "Closed", code: "project_closed", statusCode: 409 },
    { label: "row version", actor: MANAGER_ID, payload: { rowVersion: NEXT_VERSION.toString("base64") }, code: "concurrency_conflict", statusCode: 409 },
    { label: "schedule version", actor: MANAGER_ID, payload: { scheduleVersion: NEXT_VERSION.toString("base64") }, code: "concurrency_conflict", statusCode: 409 },
  ];
  for (const item of cases) await t.test(item.label, async (sub) => {
    const { app } = harness({ id: item.actor, role: "Engineer" }, item.deniedPermissions ? { deniedPermissions: item.deniedPermissions } : {});
    const statements = installSqlMock(sub, deletionAnswers([taskRaw({ id: 11 })], item.status));
    try {
      const response = await app.inject({ method: "DELETE", url: "/api/v1/schedule/tasks/11", payload: { ...deletionPayload(), ...item.payload } });
      assert.equal(response.statusCode, item.statusCode, response.body); assert.equal(response.json().code, item.code);
      assert.equal(statements.some((entry) => entry.statement.includes("UPDATE dbo.schedule_tasks")), false);
    } finally { await app.close(); }
  });
});

test("delete schedule row removes a heading with nothing on it, as any other row", async (t) => {
  for (const name of ["Master Plan", "ยังไม่จัดหัวข้อ"]) await t.test(name, async (sub) => {
    const { app } = harness({ id: MANAGER_ID, role: "Project Manager" });
    const statements = installSqlMock(sub, deletionAnswers([taskRaw({ id: 11, kind: "phase", name })]));
    try {
      const response = await app.inject({ method: "DELETE", url: "/api/v1/schedule/tasks/11", payload: deletionPayload() });
      assert.equal(response.statusCode, 200, response.body);
      assert.ok(statements.some((entry) => entry.statement.includes("SET deleted_at=SYSUTCDATETIME()")));
    } finally { await app.close(); }
  });
});

/* Master Plan headings and the Team Plan under them (owner, 2026-11-03): heading 1 > task 11 (PICs 30 and 31). */
const headingTree = [{ id: 1, parent_id: null, predecessor_id: null, kind: "phase", start_mode: "manual", name: "Software development", status: "Not Started", percent_done: 0, actual_start: null },
  { id: 11, parent_id: 1, predecessor_id: null, kind: "task", start_mode: "manual", name: "Web App WMS", status: "Not Started", percent_done: 0, actual_start: null }];

test("POST task: a task under a heading needs a member; a function under a task has its task's unless others are named", async (t) => {
  const cases: Array<[number, number[], number, number[] | null]> = [[1, [], 400, null], [1, [32], 201, [32]], [11, [], 201, [30, 31]], [11, [32], 201, [32]]];
  for (const [parentId, named, status, saved] of cases) await t.test(`under ${parentId === 1 ? "heading" : "task"}, ${named.length ? "member named" : "no member named"}`, async (sub) => {
    const { app } = harness({ id: MANAGER_ID, role: "Project Manager" });
    const base = planEditAnswers(0, []);
    const statements = installSqlMock(sub, (statement) => {
      if (statement.includes("SELECT id,parent_id,predecessor_id,kind,start_mode,")) return { recordset: headingTree };
      if (statement.includes("FROM dbo.schedule_tasks WITH (UPDLOCK,HOLDLOCK) WHERE id=@id AND deleted_at IS NULL"))
        return { recordset: [parentId === 1 ? taskRaw({ id: 1, kind: "phase", plan_start: null }) : taskRaw({ id: 11, parent_id: 1 })] };
      if (statement.includes("SELECT pic.task_id,u.id")) return { recordset: [30, 31].map((id) => ({ task_id: 11, id, name: `User ${id}`, email: `${id}@example.test`, active: true })) };
      if (statement.includes("INSERT INTO dbo.schedule_tasks")) return { recordset: [{ id: 50, row_version: NEXT_VERSION }] };
      return base(statement);
    });
    try {
      const response = await app.inject({ method: "POST", url: `/api/v1/projects/${PROJECT_ID}/schedule/tasks`, payload: { ...planEditPayload(named), parentId } });
      assert.equal(response.statusCode, status, response.body);
      if (!saved) { assert.equal(response.json().code, "schedule_member_required"); return; }
      const written = statements.filter((entry) => entry.statement.includes("INSERT INTO dbo.schedule_task_pics")).map((entry) => entry.params.user);
      assert.deepEqual(written, saved);
    } finally { await app.close(); }
  });
});

test("PUT: a heading's own dates change with rows under it; a task under a heading keeps at least one member", async (t) => {
  await t.test("heading dates", async (sub) => {
    const { app } = harness({ id: MANAGER_ID, role: "Project Manager" });
    const base = planEditAnswers(0, []);
    installSqlMock(sub, (statement) => {
      if (statement.includes("SELECT id,parent_id,predecessor_id,kind,start_mode,")) return { recordset: headingTree };
      if (statement.includes("FROM dbo.schedule_tasks WITH (UPDLOCK,HOLDLOCK) WHERE id=@id AND deleted_at IS NULL")) return { recordset: [taskRaw({ id: 1, kind: "phase", plan_start: "2027-03-01", plan_days: 5 })] };
      // Task 11 sits under the heading, so its dates are a roll-up of the rows under it.
      if (statement.includes("WHERE parent_id=@task")) return { recordset: [{ value: true }] };
      return base(statement);
    });
    try {
      const response = await app.inject({ method: "PUT", url: "/api/v1/schedule/tasks/1", payload: { ...planEditPayload([]), parentId: null, kind: "phase", name: "Software development", planStart: "2027-04-01", planDays: 30 } });
      assert.equal(response.statusCode, 200, response.body);
    } finally { await app.close(); }
  });
  await t.test("last member", async (sub) => {
    const { app } = harness({ id: MANAGER_ID, role: "Project Manager" });
    const base = planEditAnswers(0, [30]);
    const statements = installSqlMock(sub, (statement, params) => {
      if (statement.includes("FROM dbo.schedule_tasks WITH (UPDLOCK,HOLDLOCK) WHERE id=@id AND deleted_at IS NULL"))
        return { recordset: [params.id === 1 ? taskRaw({ id: 1, kind: "phase", plan_start: null }) : taskRaw({ id: 11, parent_id: 1 })] };
      return base(statement);
    });
    try {
      const response = await app.inject({ method: "PUT", url: "/api/v1/schedule/tasks/11", payload: planEditPayload([]) });
      assert.equal(response.statusCode, 400, response.body);
      assert.equal(response.json().code, "schedule_member_required");
      assert.equal(statements.some((entry) => entry.statement.includes("UPDATE dbo.schedule_tasks SET parent_id=")), false);
    } finally { await app.close(); }
  });
});
