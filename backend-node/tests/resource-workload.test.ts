import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import sql from "mssql";
import type { Database } from "../src/db.js";
import { registerErrorHandler } from "../src/errors.js";
import { registerResourcePlanningRoutes } from "../src/routes/resource-planning.js";
import { DEFAULT_WEEKLY_CAPACITY, FINISHED_WORK_STATUSES, WORK_KEY, WORKLOAD_SQL, isOpenWork, workloadItems, workOrders } from "../src/resource-workload.js";
import type { CurrentUserService } from "../src/users.js";

/** A dbo.schedule_tasks row as SQL Server returns it. */
const raw = (change: Record<string, unknown>) => ({
  id: 1, project_id: 1, parent_id: null, sort_order: 1, kind: "task", name: "Task", is_milestone: false, origin: "Plan", created_by: 1,
  visibility: "Internal", plan_start: "2026-10-05", plan_days: 5, start_mode: "manual", predecessor_id: null, lag_days: 0, pic_external: "",
  plan_man_days: 0, baseline_start: null, baseline_end: null, baseline_days: 0, baseline_rev: 0, actual_start: null, actual_end: null,
  forecast_end: null, percent_done: 0, status: "Not Started", blocked_reason: null, note: null, actual_man_days: 0, updated_by: 1,
  updated_at: null, row_version: Buffer.alloc(8), ...change,
});

const inquiries = [
  { id: 3, inquiry_no: "INQ-3", project_name: "Line 4", customer_name: "ACME", owner_id: 7, start_date: "2026-10-01", end_date: "2026-10-09", man_days: 4, progress: 20, status: "In Progress" },
];
const task = { inquiry_id: 5, inquiry_no: "INQ-5", customer_name: "Beta", plan_start: null, plan_end: null, man_days: null, percent_done: 0, execution_status: "Not Started", pending_plan: null };
const tasks = [
  { ...task, id: 8, title: "Survey", assignee_id: 9, state: "Approved", plan_start: "2026-10-05", plan_end: "2026-10-06", man_days: 2 },
  { ...task, id: 9, title: "Report", assignee_id: 9, state: "Approved", plan_start: "2026-10-07", plan_end: "2026-10-07", man_days: 1, percent_done: 100, execution_status: "Done" },
  // Awaiting approval: counted at the plan proposed for it, three working days from Monday 12 October.
  { ...task, id: 10, title: "Drawings", assignee_id: 9, state: "PendingApproval",
    pending_plan: JSON.stringify({ assigneeId: 7, start: "2026-10-12", workDays: 3, manDays: 2, note: "" }) },
  { ...task, id: 11, title: "Unreadable", assignee_id: 9, state: "PendingApproval", pending_plan: "{}" },
];
// An estimate nobody has a section of is its owner's work.
const estimates = [
  { id: 6, estimate_no: "EST-6", project_name: "Panel", customer_name: "Beta", owner_id: 9, start_date: null, end_date: null, man_days: null, progress: 0, status: "Draft" },
];
// Section 02 of EST-4 for its responsible (7) and support (9) engineer, with 6 MD of section effort.
const sections = [
  { assignment_id: 40, section: "02 Electrical", id: 4, estimate_no: "EST-4", project_name: "Line 4", customer_name: "ACME", owner_id: 7, share_count: 2,
    start_date: "2026-10-01", end_date: "2026-10-14", man_days: 6, progress: 10, status: "In Progress" },
  { assignment_id: 40, section: "02 Electrical", id: 4, estimate_no: "EST-4", project_name: "Line 4", customer_name: "ACME", owner_id: 9, share_count: 2,
    start_date: "2026-10-01", end_date: "2026-10-14", man_days: 6, progress: 10, status: "In Progress" },
];
const projects = [{ id: 1, project_no: "P-1", customer_name: "ACME" }];
const schedule = [
  raw({ id: 10, kind: "phase", name: "Build", plan_start: null }),
  raw({ id: 11, parent_id: 10, name: "Wiring", plan_man_days: 8 }),
  raw({ id: 12, parent_id: 10, sort_order: 2, name: "Labels", plan_man_days: 2 }),
  raw({ id: 13, parent_id: 10, sort_order: 3, name: "Kick-off", plan_man_days: 1, percent_done: 100, status: "Done", actual_start: "2026-10-05", actual_end: "2026-10-05" }),
];
const pics = [{ task_id: 11, user_id: 7 }, { task_id: 11, user_id: 9 }];
// Person 9 ranked the estimate first, then the wiring; Project-99 has gone and Inquiry-3 is not theirs.
const priorities = [
  { user_id: 9, work_key: "Estimate-6" }, { user_id: 9, work_key: "Project-99" }, { user_id: 9, work_key: "Project-11" }, { user_id: 9, work_key: "Inquiry-3" },
  { user_id: 7, work_key: "EstimateSection-40" },
];
const workSets = [inquiries, tasks, estimates, sections, projects, schedule, pics, priorities];

test("every open piece of work becomes one item per person, with its effort shared", () => {
  const { items, warnings } = workloadItems(workSets, new Set());
  assert.deepEqual(warnings, []);
  const byKey = new Map(items.map((item) => [item.key, item]));
  // A whole inquiry, with its saved effort and dates, planned on the Workload screen.
  assert.deepEqual(byKey.get("Inquiry-3"), { key: "Inquiry-3", workKey: "Inquiry-3", type: "Inquiry", entityId: 3, ownerId: 7, reference: "INQ-3", title: "Line 4", customer: "ACME",
    start: "2026-10-01", end: "2026-10-09", manDays: 4, progress: 20, status: "In Progress", effort: { kind: "Inquiry", id: 3 } });
  // An approved inquiry task at its plan; the finished one is left out; its effort lives in the task's own plan.
  assert.equal(byKey.get("InquiryTask-8")?.reference, "INQ-5 · TASK-8");
  assert.equal(byKey.get("InquiryTask-8")?.effort, undefined);
  assert.equal(byKey.has("InquiryTask-9"), false);
  // A task awaiting approval counts for the person and dates it was proposed with; an unreadable proposal is skipped.
  assert.deepEqual(
    [byKey.get("InquiryTask-10")?.ownerId, byKey.get("InquiryTask-10")?.start, byKey.get("InquiryTask-10")?.end, byKey.get("InquiryTask-10")?.manDays, byKey.get("InquiryTask-10")?.tentative],
    [7, "2026-10-12", "2026-10-14", 2, true],
  );
  assert.equal(byKey.has("InquiryTask-11"), false);
  // An estimate section is work for both its engineers, due on the section's date, its effort shared between them.
  assert.equal(byKey.get("EstimateSection-40-7")?.reference, "EST-4 · 02 Electrical");
  assert.equal(byKey.get("EstimateSection-40-7")?.manDays, 3);
  assert.equal(byKey.get("EstimateSection-40-9")?.end, "2026-10-14");
  assert.deepEqual(byKey.get("EstimateSection-40-9")?.effort, { kind: "EstimateSection", id: 40 });
  assert.equal(byKey.get("EstimateSection-40-9")?.entityId, 4);
  // A whole estimate keeps unsaved effort unknown, not zero.
  assert.equal(byKey.get("Estimate-6-9")?.manDays, null);
  assert.deepEqual(byKey.get("Estimate-6-9")?.effort, { kind: "Estimate", id: 6 });
  // A plan row's effort is split across its PICs; a row with none has no owner; phases and finished rows are not work.
  assert.equal(byKey.get("Project-11-7")?.manDays, 4);
  assert.equal(byKey.get("Project-11-9")?.reference, "P-1 · 1.1");
  assert.equal(byKey.get("Project-12-none")?.ownerId, null);
  assert.equal(byKey.get("Project-12-none")?.manDays, 2);
  assert.ok(![...byKey.keys()].some((key) => key.startsWith("Project-10-") || key.startsWith("Project-13-")));
  assert.equal(items.length, 9);
  // The work key names the work, not the person's share, and is the only shape a work order stores.
  assert.equal(byKey.get("Project-11-7")?.workKey, "Project-11");
  assert.equal(byKey.get("EstimateSection-40-7")?.workKey, "EstimateSection-40");
  for (const item of items) assert.match(item.workKey, WORK_KEY);
  for (const bad of ["Project-0", "Project-1-7", "Task-1", "Project-", "project-1", "Project-1; DROP"]) assert.doesNotMatch(bad, WORK_KEY);
});

test("a saved work order keeps only that person's open work, in the saved order", () => {
  const { items, orderRows } = workloadItems(workSets, new Set());
  assert.deepEqual(workOrders(orderRows, items), [
    { userId: 9, keys: ["Estimate-6", "Project-11"] },
    { userId: 7, keys: ["EstimateSection-40"] },
  ]);
});

test("a schedule that cannot be resolved is named, and the rest still counts", () => {
  const broken = [raw({ id: 30, name: "Orphan link", plan_start: null, start_mode: "linked", predecessor_id: 999 })];
  const { items, warnings } = workloadItems([[], [], [], [], projects, broken, [], []], new Set());
  assert.deepEqual(warnings, ["P-1"]);
  assert.deepEqual(items, []);
});

test("finished work and the default capacity are one rule", () => {
  assert.equal(DEFAULT_WEEKLY_CAPACITY, 5);
  for (const status of FINISHED_WORK_STATUSES) assert.equal(isOpenWork({ progress: 0, status }), false, status);
  // A reviewed estimate section is finished work.
  assert.ok((FINISHED_WORK_STATUSES as readonly string[]).includes("Reviewed"));
  assert.equal(isOpenWork({ progress: 100, status: "In Progress" }), false);
  assert.equal(isOpenWork({ progress: 99, status: "Blocked" }), true);
});

test("the Workload SQL counts sections and proposed tasks, and an inquiry once", () => {
  // Sections of open estimates, while the section itself is open.
  assert.match(WORKLOAD_SQL, /FROM dbo\.estimate_assignments a\s+JOIN dbo\.estimates e ON e\.id=a\.estimate_id/);
  assert.match(WORKLOAD_SQL, /COALESCE\(se\.man_days,ee\.man_days\/NULLIF\(sections\.n,0\)\) man_days/);
  assert.match(WORKLOAD_SQL, /AND a\.status NOT IN\([^)]*N'Reviewed'[^)]*\) AND a\.progress<100;/);
  // A whole estimate only when nobody has a section of it.
  assert.match(WORKLOAD_SQL, /AND NOT EXISTS\(SELECT 1 FROM dbo\.estimate_assignments a WHERE a\.estimate_id=e\.id\);/);
  // Tasks awaiting approval are read; their inquiry stops counting whole.
  assert.match(WORKLOAD_SQL, /t\.state IN\(N'Approved',N'PendingApproval'\)/);
  assert.match(WORKLOAD_SQL, /NOT EXISTS\(SELECT 1 FROM dbo\.resource_tasks pending WHERE pending\.inquiry_id=i\.id AND pending\.state=N'PendingApproval'\)/);
});

function workloadServer(actor: { id: number; roles: string[] }, granted: string[] = []) {
  const demanded: string[] = [];
  const statements: string[] = [];
  const bound: Record<string, unknown> = {};
  const users = {
    demandPermission: async (_request: unknown, permission: string) => { demanded.push(permission); },
    required: async () => ({ ...actor, role: actor.roles[0] }),
  };
  const database = {
    async query(statement: string, bind?: (request: unknown) => void) {
      statements.push(statement);
      const values: Record<string, unknown> = {};
      const request = { input(key: string, _type: unknown, value: unknown) { values[key] = value; return request; } };
      bind?.(request);
      if (statement.includes("FROM dbo.user_effective_permissions WHERE user_id=@user_id AND code=@permission"))
        return { recordset: [{ allowed: granted.includes(String(values.permission)) }] };
      Object.assign(bound, values);
      if (statement.includes("FROM dbo.users WHERE id=@user")) return { recordset: values.user === 404 ? [] : [{ id: values.user }] };
      return { recordsets: [
        [{ user_id: 9, days_per_week: 3, row_version: Buffer.alloc(8) }], [], [{ holiday_date: new Date("2026-10-13T00:00:00Z") }],
        ...workSets,
      ] };
    },
    async transaction(action: (transaction: object) => Promise<unknown>) { return action({}); },
  };
  const app = Fastify();
  registerErrorHandler(app);
  registerResourcePlanningRoutes(app, database as unknown as Database, users as unknown as CurrentUserService);
  return { app, demanded, statements, bound };
}

test("the Workload read needs schedule.read and project.read, then reads everything in one scoped batch", async () => {
  const { app, demanded, statements, bound } = workloadServer({ id: 7, roles: ["Engineer"] });
  try {
    const response = await app.inject({ method: "GET", url: "/api/v1/resource-planning/workload" });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(demanded, ["schedule.read", "project.read"]);
    assert.deepEqual(bound, { actor: 7, project_elevated: false, task_elevated: false });
    const statement = statements[0]!;
    assert.ok(statement.includes(WORKLOAD_SQL));
    // Projects as GET /projects lists them; inquiry tasks as /resource-tasks/commitments scopes them.
    assert.match(statement, /@project_elevated=1 OR p\.manager_id=@actor OR p\.lead_engineer_id=@actor/);
    assert.match(statement, /@task_elevated=1 OR i\.estimate_owner_id=@actor OR i\.created_by=@actor OR t\.assignee_id=@actor OR t\.created_by=@actor/);
    assert.match(statement, /code=N'inquiry\.read'/);
    assert.match(statement, /code=N'estimate\.read'/);
    // Section effort is read with the rest of the effort.
    assert.match(statement, /e\.entity_type=N'EstimateSection' AND EXISTS\(SELECT 1 FROM dbo\.estimate_assignments a/);
    assert.match(statement, /SELECT user_id,work_key FROM dbo\.work_priorities ORDER BY user_id,sort_order;/);
    const body = response.json();
    assert.deepEqual(body.capacities.map((c: { userId: number; daysPerWeek: number }) => [c.userId, c.daysPerWeek]), [[9, 3]]);
    assert.deepEqual(body.holidays, ["2026-10-13"]);
    assert.equal(body.items.length, 9);
    assert.deepEqual(body.warnings, []);
    assert.deepEqual(body.priorities, [{ userId: 9, keys: ["Estimate-6", "Project-11"] }, { userId: 7, keys: ["EstimateSection-40"] }]);
  } finally {
    await app.close();
  }
});

test("a Project Manager sees every inquiry task, as Admin and Engineering Managers do", async () => {
  const { app, bound } = workloadServer({ id: 2, roles: ["Project Manager"] });
  try {
    assert.equal((await app.inject({ method: "GET", url: "/api/v1/resource-planning/workload" })).statusCode, 200);
    assert.equal(bound.task_elevated, true);
  } finally {
    await app.close();
  }
});

test("My Work's read is the caller's own work and order only", async () => {
  const { app } = workloadServer({ id: 9, roles: ["Engineer"] });
  try {
    const body = (await app.inject({ method: "GET", url: "/api/v1/resource-planning/workload?mine=1" })).json();
    assert.ok(body.items.length > 0);
    assert.ok(body.items.every((item: { ownerId: number }) => item.ownerId === 9));
    assert.deepEqual(body.priorities, [{ userId: 9, keys: ["Estimate-6", "Project-11"] }]);
  } finally {
    await app.close();
  }
});

test("a person orders their own work; a manager may order anyone's; nobody else may", async (t) => {
  const captured: { statement: string; user: unknown; actor: unknown; keys: unknown }[] = [];
  t.mock.method(sql.Request.prototype, "query", async function (this: { parameters: Record<string, { value: unknown }> }, statement: string) {
    captured.push({ statement, user: this.parameters.user?.value, actor: this.parameters.actor?.value, keys: this.parameters.keys?.value });
    return { recordset: [] };
  });
  const own = workloadServer({ id: 9, roles: ["Engineer"] });
  try {
    const saved = await own.app.inject({ method: "PUT", url: "/api/v1/resource-planning/work-order/9", payload: { keys: ["Project-11", "EstimateSection-40"] } });
    assert.equal(saved.statusCode, 200);
    assert.deepEqual(saved.json(), { userId: 9, keys: ["Project-11", "EstimateSection-40"] });
    assert.equal(captured.length, 1);
    assert.match(captured[0]!.statement, /DELETE FROM dbo\.work_priorities WHERE user_id=@user;/);
    assert.match(captured[0]!.statement, /CONVERT\(int,ordering\.\[key\]\)\+1,@actor FROM OPENJSON\(@keys\) ordering/);
    assert.deepEqual([captured[0]!.user, captured[0]!.actor, captured[0]!.keys], [9, 9, JSON.stringify(["Project-11", "EstimateSection-40"])]);
    // Someone else's order: refused before any write.
    const refused = await own.app.inject({ method: "PUT", url: "/api/v1/resource-planning/work-order/7", payload: { keys: [] } });
    assert.equal(refused.statusCode, 403);
    assert.equal(refused.json().error?.code ?? refused.json().code, "work_order_forbidden");
    // Malformed, repeated or too many keys are refused.
    for (const keys of [["Project-11", "Project-11"], ["Task-1"], "Project-11", Array.from({ length: 501 }, (_, index) => `Project-${index + 1}`)]) {
      const bad = await own.app.inject({ method: "PUT", url: "/api/v1/resource-planning/work-order/9", payload: { keys } });
      assert.equal(bad.statusCode, 400, JSON.stringify(keys).slice(0, 40));
    }
    assert.equal(captured.length, 1);
  } finally {
    await own.app.close();
  }
  const manager = workloadServer({ id: 2, roles: ["Project Manager"] });
  try {
    assert.equal((await manager.app.inject({ method: "PUT", url: "/api/v1/resource-planning/work-order/9", payload: { keys: [] } })).statusCode, 200);
    assert.deepEqual([captured.at(-1)!.user, captured.at(-1)!.actor, captured.at(-1)!.keys], [9, 2, "[]"]);
    // An inactive or unknown person cannot be given an order.
    assert.equal((await manager.app.inject({ method: "PUT", url: "/api/v1/resource-planning/work-order/404", payload: { keys: [] } })).statusCode, 404);
  } finally {
    await manager.app.close();
  }
});

test("a section's own engineers plan its effort without schedule.plan; other engineers may not", async (t) => {
  const statements: string[] = [];
  t.mock.method(sql.Request.prototype, "query", async function (this: { parameters: Record<string, { value: unknown }> }, statement: string) {
    statements.push(statement);
    if (statement.includes("FROM dbo.estimate_assignments a WITH(UPDLOCK,HOLDLOCK)")) return { recordset: [{ id: 40, owner_id: 7, support_id: 9 }] };
    if (statement.includes("INSERT dbo.resource_effort")) {
      return { recordset: [{ entity_type: "EstimateSection", entity_id: 40, start_date: new Date("2026-10-01T00:00:00Z"), end_date: new Date("2026-10-14T00:00:00Z"), man_days: 6, row_version: Buffer.alloc(8) }] };
    }
    return { recordset: [] };
  });
  const payload = { start: "2026-10-01", end: "2026-10-14", manDays: 6, rowVersion: null };
  const support = workloadServer({ id: 9, roles: ["Engineer"] });
  try {
    const saved = await support.app.inject({ method: "PUT", url: "/api/v1/resource-planning/EstimateSection/40", payload });
    assert.equal(saved.statusCode, 200);
    // Only estimate.read is demanded of a section's engineer; the section itself decides.
    assert.deepEqual(support.demanded, ["estimate.read"]);
    assert.ok(statements.some((statement) => /INSERT dbo\.resource_effort\(entity_type,entity_id,start_date,end_date,man_days,updated_by\)/.test(statement)));
  } finally {
    await support.app.close();
  }
  const outsider = workloadServer({ id: 5, roles: ["Engineer"] });
  try {
    const refused = await outsider.app.inject({ method: "PUT", url: "/api/v1/resource-planning/EstimateSection/40", payload });
    assert.equal(refused.statusCode, 403);
    assert.equal(refused.json().error?.code ?? refused.json().code, "section_effort_forbidden");
  } finally {
    await outsider.app.close();
  }
  // A planner with estimate.write may plan any section.
  const planner = workloadServer({ id: 3, roles: ["Engineering Manager"] }, ["schedule.plan", "estimate.write"]);
  try {
    assert.equal((await planner.app.inject({ method: "PUT", url: "/api/v1/resource-planning/EstimateSection/40", payload })).statusCode, 200);
  } finally {
    await planner.app.close();
  }
});
