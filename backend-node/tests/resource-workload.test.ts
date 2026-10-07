import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type { Database } from "../src/db.js";
import { registerResourcePlanningRoutes } from "../src/routes/resource-planning.js";
import { DEFAULT_WEEKLY_CAPACITY, FINISHED_WORK_STATUSES, WORKLOAD_SQL, isOpenWork, workloadItems } from "../src/resource-workload.js";
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
const tasks = [
  { id: 8, inquiry_id: 5, inquiry_no: "INQ-5", customer_name: "Beta", title: "Survey", assignee_id: 9, plan_start: "2026-10-05", plan_end: "2026-10-06", man_days: 2, percent_done: 0, execution_status: "Not Started" },
  { id: 9, inquiry_id: 5, inquiry_no: "INQ-5", customer_name: "Beta", title: "Report", assignee_id: 9, plan_start: "2026-10-07", plan_end: "2026-10-07", man_days: 1, percent_done: 100, execution_status: "Done" },
];
const estimates = [
  { id: 4, estimate_no: "EST-4", project_name: "Line 4", customer_name: "ACME", owner_id: 7, owner_count: 2, start_date: "2026-10-01", end_date: "2026-10-20", man_days: 6, progress: 10, status: "Draft" },
  { id: 4, estimate_no: "EST-4", project_name: "Line 4", customer_name: "ACME", owner_id: 9, owner_count: 2, start_date: "2026-10-01", end_date: "2026-10-20", man_days: 6, progress: 10, status: "Draft" },
  { id: 6, estimate_no: "EST-6", project_name: "Panel", customer_name: "Beta", owner_id: 9, owner_count: 1, start_date: null, end_date: null, man_days: null, progress: 0, status: "Draft" },
];
const projects = [{ id: 1, project_no: "P-1", customer_name: "ACME" }];
const schedule = [
  raw({ id: 10, kind: "phase", name: "Build", plan_start: null }),
  raw({ id: 11, parent_id: 10, name: "Wiring", plan_man_days: 8 }),
  raw({ id: 12, parent_id: 10, sort_order: 2, name: "Labels", plan_man_days: 2 }),
  raw({ id: 13, parent_id: 10, sort_order: 3, name: "Kick-off", plan_man_days: 1, percent_done: 100, status: "Done", actual_start: "2026-10-05", actual_end: "2026-10-05" }),
];
const pics = [{ task_id: 11, user_id: 7 }, { task_id: 11, user_id: 9 }];

test("every open piece of work becomes one item per person, with its effort shared", () => {
  const { items, warnings } = workloadItems([inquiries, tasks, estimates, projects, schedule, pics], new Set());
  assert.deepEqual(warnings, []);
  const byKey = new Map(items.map((item) => [item.key, item]));
  // A whole inquiry, with its saved effort and dates.
  assert.deepEqual(byKey.get("Inquiry-3"), { key: "Inquiry-3", type: "Inquiry", entityId: 3, ownerId: 7, reference: "INQ-3", title: "Line 4", customer: "ACME",
    start: "2026-10-01", end: "2026-10-09", manDays: 4, progress: 20, status: "In Progress" });
  // An approved inquiry task; the finished one is left out.
  assert.equal(byKey.get("InquiryTask-8")?.reference, "INQ-5 · TASK-8");
  assert.equal(byKey.has("InquiryTask-9"), false);
  // An estimate's effort is shared between its people; unsaved effort stays unknown, not zero.
  assert.equal(byKey.get("Estimate-4-7")?.manDays, 3);
  assert.equal(byKey.get("Estimate-4-9")?.manDays, 3);
  assert.equal(byKey.get("Estimate-6-9")?.manDays, null);
  // A plan row's effort is split across its PICs; a row with none has no owner; phases and finished rows are not work.
  assert.equal(byKey.get("Project-11-7")?.manDays, 4);
  assert.equal(byKey.get("Project-11-9")?.reference, "P-1 · 1.1");
  assert.equal(byKey.get("Project-12-none")?.ownerId, null);
  assert.equal(byKey.get("Project-12-none")?.manDays, 2);
  assert.ok(![...byKey.keys()].some((key) => key.startsWith("Project-10-") || key.startsWith("Project-13-")));
  assert.equal(items.length, 8);
});

test("a schedule that cannot be resolved is named, and the rest still counts", () => {
  const broken = [raw({ id: 30, name: "Orphan link", plan_start: null, start_mode: "linked", predecessor_id: 999 })];
  const { items, warnings } = workloadItems([[], [], [], projects, broken, []], new Set());
  assert.deepEqual(warnings, ["P-1"]);
  assert.deepEqual(items, []);
});

test("finished work and the default capacity are one rule", () => {
  assert.equal(DEFAULT_WEEKLY_CAPACITY, 5);
  for (const status of FINISHED_WORK_STATUSES) assert.equal(isOpenWork({ progress: 0, status }), false, status);
  assert.equal(isOpenWork({ progress: 100, status: "In Progress" }), false);
  assert.equal(isOpenWork({ progress: 99, status: "Blocked" }), true);
});

test("the Workload read needs schedule.read and project.read, then reads everything in one scoped batch", async () => {
  const demanded: string[] = [];
  let statement = "";
  const bound: Record<string, unknown> = {};
  const users = {
    demandPermission: async (_request: unknown, permission: string) => { demanded.push(permission); },
    required: async () => ({ id: 7, roles: ["Engineer"], role: "Engineer" }),
  };
  const database = {
    async query(sql: string, bind?: (request: unknown) => void) {
      statement = sql;
      const request = { input(key: string, _type: unknown, value: unknown) { bound[key] = value; return request; } };
      bind?.(request);
      return { recordsets: [
        [{ user_id: 9, days_per_week: 3, row_version: Buffer.alloc(8) }], [], [{ holiday_date: new Date("2026-10-13T00:00:00Z") }],
        inquiries, tasks, estimates, projects, schedule, pics,
      ] };
    },
  };
  const app = Fastify();
  registerResourcePlanningRoutes(app, database as unknown as Database, users as unknown as CurrentUserService);
  try {
    const response = await app.inject({ method: "GET", url: "/api/v1/resource-planning/workload" });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(demanded, ["schedule.read", "project.read"]);
    assert.deepEqual(bound, { actor: 7, project_elevated: false, task_elevated: false });
    assert.ok(statement.includes(WORKLOAD_SQL));
    // Projects as GET /projects lists them; inquiry tasks as /resource-tasks/commitments scopes them.
    assert.match(statement, /@project_elevated=1 OR p\.manager_id=@actor OR p\.lead_engineer_id=@actor/);
    assert.match(statement, /@task_elevated=1 OR i\.estimate_owner_id=@actor OR i\.created_by=@actor OR t\.assignee_id=@actor OR t\.created_by=@actor/);
    assert.match(statement, /code=N'inquiry\.read'/);
    assert.match(statement, /code=N'estimate\.read'/);
    const body = response.json();
    assert.deepEqual(body.capacities.map((c: { userId: number; daysPerWeek: number }) => [c.userId, c.daysPerWeek]), [[9, 3]]);
    assert.deepEqual(body.holidays, ["2026-10-13"]);
    assert.equal(body.items.length, 8);
    assert.deepEqual(body.warnings, []);
  } finally {
    await app.close();
  }
});
