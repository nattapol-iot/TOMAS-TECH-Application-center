import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type { AppConfig } from "../src/config.js";
import type { Database } from "../src/db.js";
import { ApiError, registerErrorHandler } from "../src/errors.js";
import { loadProjectScheduleSummaries, summarizeProjects } from "../src/project-overview.js";
import { registerProjectRoutes } from "../src/routes/projects.js";
import { MASTER_PLAN_PHASE } from "../src/schedule-phases.js";
import { taskRow } from "../src/schedule-service.js";
import type { CurrentUserService } from "../src/users.js";

const TODAY = "2026-10-06"; // a Tuesday
const config = { businessTimeZone: "Asia/Bangkok", documentStorage: {} } as unknown as AppConfig;

/** A dbo.schedule_tasks row as SQL Server returns it. */
const raw = (change: Record<string, unknown>) => ({
  id: 1, project_id: 1, parent_id: null, sort_order: 1, kind: "task", name: "Task", is_milestone: false, origin: "Plan", created_by: 1,
  visibility: "Internal", plan_start: "2026-10-05", plan_days: 5, start_mode: "manual", predecessor_id: null, lag_days: 0, pic_external: "",
  plan_man_days: 0, baseline_start: null, baseline_end: null, baseline_days: 0, baseline_rev: 0, actual_start: null, actual_end: null,
  forecast_end: null, percent_done: 0, status: "Not Started", blocked_reason: null, note: null, actual_man_days: 0, updated_by: 1,
  updated_at: null, row_version: Buffer.alloc(8), ...change,
});

// Project 1: a Master Plan frame plus two work tasks. Project 2: only the Master Plan.
// Project 3: a task linked to a predecessor that is gone. Project 4: the same, but Closed.
const rows = [
  raw({ id: 10, project_id: 1, kind: "phase", name: MASTER_PLAN_PHASE, plan_start: null, plan_days: 1 }),
  raw({ id: 11, project_id: 1, parent_id: 10, name: "Kick-off", is_milestone: true, plan_start: "2026-10-01", plan_days: 1, percent_done: 100, status: "Done", actual_start: "2026-10-01", actual_end: "2026-10-01" }),
  raw({ id: 12, project_id: 1, parent_id: 10, sort_order: 2, name: "Site acceptance", is_milestone: true, plan_start: "2026-10-30", plan_days: 1 }),
  raw({ id: 13, project_id: 1, sort_order: 2, name: "Wiring", plan_start: "2026-10-05", plan_days: 5, percent_done: 40, status: "In Progress", actual_start: "2026-10-05" }),
  raw({ id: 14, project_id: 1, sort_order: 3, name: "Commissioning", plan_start: "2026-10-12", plan_days: 10 }),
  raw({ id: 20, project_id: 2, kind: "phase", name: MASTER_PLAN_PHASE, plan_start: null, plan_days: 1 }),
  raw({ id: 21, project_id: 2, parent_id: 20, name: "Design", plan_start: "2026-10-01", plan_days: 10, percent_done: 50, status: "In Progress", actual_start: "2026-10-01" }),
  raw({ id: 30, project_id: 3, name: "Orphan link", plan_start: null, start_mode: "linked", predecessor_id: 999 }),
  raw({ id: 40, project_id: 4, name: "Orphan link", plan_start: null, start_mode: "linked", predecessor_id: 999 }),
];
const projects = [
  { id: 1, status: "Installation", targetDelivery: "2026-11-30" }, { id: 2, status: "Design", targetDelivery: "2026-12-31" },
  { id: 3, status: "Design", targetDelivery: "2026-12-31" }, { id: 4, status: "Closed", targetDelivery: "2026-09-30" },
  { id: 5, status: "Planning", targetDelivery: null },
];

test("summaries group task rows by project and weigh progress by work days, leaving the Master Plan frame out", () => {
  const outcomes = summarizeProjects(projects, rows.map(taskRow), new Set(), TODAY);
  const first = outcomes.get(1)!;
  // Wiring: 5 work days at 40%; Commissioning: 12-21 Oct is 8 work days at 0%. The Done kick-off is not counted.
  assert.equal(first.summary.progress, Math.round((40 * 5 / 13) * 100) / 100);
  assert.equal(first.summary.taskCount, 2);
  assert.equal(first.summary.doneCount, 0);
  assert.equal(first.summary.scheduleError, false);
  assert.equal(first.summary.planStart, "2026-10-05");
  assert.equal(first.summary.planFinish, "2026-10-21");
  // The Master Plan still provides the next milestone.
  assert.deepEqual(first.summary.nextMilestone, { name: "Site acceptance", date: "2026-10-30" });
  // Every leaf travels with the summary, Master Plan rows included, for screens that list tasks.
  assert.deepEqual(first.leaves.map((leaf) => leaf.id).sort(), [11, 12, 13, 14]);
  // A project with nothing scheduled has no plan and no measured progress.
  assert.equal(outcomes.get(5)!.summary.health, "No plan");
  assert.equal(outcomes.get(5)!.summary.progress, null);
  assert.equal(outcomes.get(5)!.summary.scheduleError, false);
});

test("a project whose only rows are the Master Plan is measured on them", () => {
  const second = summarizeProjects(projects, rows.map(taskRow), new Set(), TODAY).get(2)!.summary;
  assert.equal(second.taskCount, 1);
  assert.equal(second.progress, 50);
  assert.notEqual(second.health, "No plan");
});

test("a schedule that cannot be resolved is flagged instead of failing the whole list", () => {
  const outcomes = summarizeProjects(projects, rows.map(taskRow), new Set(), TODAY);
  const broken = outcomes.get(3)!;
  assert.equal(broken.summary.scheduleError, true);
  assert.equal(broken.summary.health, "No plan");
  assert.equal(broken.summary.progress, null);
  assert.deepEqual(broken.leaves, []);
  // The status still speaks for a closed project, and its neighbours are unaffected.
  assert.equal(outcomes.get(4)!.summary.scheduleError, true);
  assert.equal(outcomes.get(4)!.summary.health, "Completed");
  assert.equal(outcomes.get(1)!.summary.scheduleError, false);
});

test("the loader reads every project's rows and the holidays in one round trip", async () => {
  const calls: { statement: string; ids: unknown }[] = [];
  const database = {
    async query(statement: string, bind: (request: unknown) => void) {
      const bound: Record<string, unknown> = {};
      const request = { input(key: string, _type: unknown, value: unknown) { bound[key] = value; return request; } };
      bind(request); calls.push({ statement, ids: bound.ids });
      // 13 October is a holiday, so Commissioning loses a work day.
      return { recordsets: [rows, [{ holiday_date: new Date("2026-10-13T00:00:00Z") }]] };
    },
  } as unknown as Database;
  const summaries = await loadProjectScheduleSummaries(database, projects, TODAY);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.ids, "1,2,3,4,5");
  assert.match(calls[0]!.statement, /STRING_SPLIT\(@ids,N','\)/);
  assert.match(calls[0]!.statement, /t\.deleted_at IS NULL/);
  assert.match(calls[0]!.statement, /SELECT holiday_date FROM dbo\.holidays/);
  assert.equal(summaries.get(1)!.progress, Math.round((40 * 5 / 12) * 100) / 100);
  assert.equal(summaries.get(3)!.scheduleError, true);
  assert.equal(summaries.size, 5);

  // Nothing to summarise means no query at all.
  assert.equal((await loadProjectScheduleSummaries(database, [], TODAY)).size, 0);
  assert.equal(calls.length, 1);
});

// ---- GET /api/v1/projects/overview ----

/** A project row as the list / overview SELECT returns it. */
const projectRow = (change: Record<string, unknown>) => ({
  id: 1, project_no: "P-26-001", name: "Line 3 IoT", customer_id: 7, customer_name: "ACME", status: "Installation", project_type: "IoT",
  manager_name: "Somchai", end_user_customer_id: null, end_user_name: null, end_user_code: null, manager_id: 5, lead_engineer_id: 6,
  lead_engineer_name: "Lek", po_no: "PO-1", po_date: "2026-09-01", actual_delivery: null, site: "Plant A", remark: null,
  start_date: "2026-09-01", target_delivery: "2026-11-30", progress: 12, updated_at: "2026-10-01T00:00:00Z", row_version: Buffer.alloc(8),
  team: "Team X", payments_received: "Deposit", contact_ids: "3,4", ...change,
});

type Actor = { id: number; roles: string[] };
function overviewServer(actor: Actor, options: { canWrite?: boolean; denied?: boolean; extraTasks?: Record<string, unknown>[] } = {}) {
  const calls: { statement: string; bound: Record<string, unknown> }[] = [];
  let permissionChecked: string | null = null;
  const database = {
    async query(statement: string, bind?: (request: unknown) => void) {
      const bound: Record<string, unknown> = {};
      const request = { input(key: string, _type: unknown, value: unknown) { bound[key] = value; return request; } };
      bind?.(request); calls.push({ statement, bound });
      if (statement.includes("dbo.schedule_tasks t")) return { recordsets: [[...rows.filter((row) => row.project_id <= 2), ...(options.extraTasks ?? [])], []] };
      if (statement.includes("dbo.schedule_updates u")) {
        return { recordset: [{ project_id: 1, pending_requests: 2, last_progress_at: new Date("2026-10-03T08:00:00Z") }] };
      }
      if (statement.includes("user_effective_permissions")) return { recordset: [{ allowed: options.canWrite ?? true }] };
      if (statement.includes("FROM dbo.projects p")) {
        const all = [projectRow({}), projectRow({ id: 2, project_no: "P-26-002", status: "Design", manager_id: 9, lead_engineer_id: 9, progress: 33 }),
          projectRow({ id: 5, project_no: "P-26-005", status: "Closed", manager_id: 9, lead_engineer_id: 9, progress: 100, target_delivery: "2026-09-30" })];
        return { recordset: bound.include_closed ? all : all.filter((row) => row.status !== "Closed") };
      }
      throw new Error(`Unexpected query: ${statement}`);
    },
    async transaction() { throw new Error("Unexpected transaction"); },
  } as unknown as Database;
  const users = {
    async demandPermission(_request: unknown, permission: string) {
      permissionChecked = permission;
      if (options.denied) throw new ApiError(403, "permission_denied", "Denied");
    },
    async required() { return actor; },
  } as unknown as CurrentUserService;
  const server = Fastify(); registerErrorHandler(server); registerProjectRoutes(server, config, database, users);
  // A parametric sibling must not capture the static overview path.
  server.get("/api/v1/projects/:id", async () => ({ captured: true }));
  return { server, calls, permission: () => permissionChecked };
}

test("the overview needs project.read and refuses before any query", async () => {
  const { server, calls, permission } = overviewServer({ id: 5, roles: ["Engineer"] }, { denied: true });
  try {
    const response = await server.inject({ method: "GET", url: "/api/v1/projects/overview" });
    assert.equal(response.statusCode, 403);
    assert.equal(response.json().code, "permission_denied");
    assert.equal(permission(), "project.read");
    assert.equal(calls.length, 0);
  } finally { await server.close(); }
});

test("the overview binds the caller's scope and leaves closed projects out unless asked", async () => {
  const { server, calls } = overviewServer({ id: 5, roles: ["Engineer"] });
  try {
    const open = await server.inject({ method: "GET", url: "/api/v1/projects/overview" });
    assert.equal(open.statusCode, 200);
    assert.equal(open.json().captured, undefined);
    const list = calls.find((call) => call.statement.includes("FROM dbo.projects p"))!;
    assert.equal(list.bound.actor, 5);
    assert.equal(list.bound.elevated, false);
    assert.equal(list.bound.include_closed, false);
    assert.match(list.statement, /@elevated=1 OR p\.manager_id=@actor OR p\.lead_engineer_id=@actor/);
    assert.match(list.statement, /EXISTS\(SELECT 1 FROM dbo\.project_members m WHERE m\.project_id=p\.id AND m\.user_id=@actor\)/);
    assert.match(list.statement, /@include_closed=1 OR p\.status<>N'Closed'/);
    assert.match(list.statement, /ORDER BY p\.project_no,p\.id/);
    assert.deepEqual(open.json().items.map((item: { id: number }) => item.id), [1, 2]);
    assert.match(open.json().today, /^\d{4}-\d{2}-\d{2}$/);

    calls.length = 0;
    const all = await server.inject({ method: "GET", url: "/api/v1/projects/overview?includeClosed=1" });
    assert.equal(calls.find((call) => call.statement.includes("FROM dbo.projects p"))!.bound.include_closed, true);
    assert.deepEqual(all.json().items.map((item: { id: number }) => item.id), [1, 2, 5]);
  } finally { await server.close(); }
});

test("an elevated caller is bound as elevated", async () => {
  const { server, calls } = overviewServer({ id: 77, roles: ["Engineering Manager"] });
  try {
    assert.equal((await server.inject({ method: "GET", url: "/api/v1/projects/overview" })).statusCode, 200);
    assert.equal(calls.find((call) => call.statement.includes("FROM dbo.projects p"))!.bound.elevated, true);
  } finally { await server.close(); }
});

test("each overview item carries the list fields plus its schedule summary and stage rights", async () => {
  const { server, calls } = overviewServer({ id: 5, roles: ["Engineer"] });
  try {
    const items = (await server.inject({ method: "GET", url: "/api/v1/projects/overview?includeClosed=1" })).json().items;
    const [first, second, closed] = items;
    // Same names and shape as GET /api/v1/projects, so the portfolio dialogs can reuse the row.
    for (const field of ["id", "number", "name", "customerName", "team", "health", "paymentsReceived", "contactIds", "customerId",
      "endUserCustomerId", "endUserName", "endUserCode", "status", "projectType", "managerName", "managerId", "leadEngineerId",
      "leadEngineerName", "purchaseOrderNumber", "purchaseOrderDate", "actualDelivery", "site", "remark", "startDate", "targetDelivery",
      "progress", "updatedAt", "rowVersion"]) assert.ok(field in first, `overview item is missing ${field}`);
    assert.deepEqual(first.contactIds, [3, 4]);
    assert.equal(first.targetDelivery, "2026-11-30");

    // Project 1 has a schedule: progress comes from it, not from the typed 12%.
    assert.equal(first.progressSource, "schedule");
    assert.equal(first.progress, Math.round((40 * 5 / 13) * 100) / 100);
    assert.equal(first.taskCount, 2);
    assert.equal(first.planFinish, "2026-10-21");
    assert.equal(first.slipDays, -40);
    assert.deepEqual(first.nextMilestone, { name: "Site acceptance", date: "2026-10-30" });
    assert.equal(first.scheduleError, false);
    for (const field of ["plannedProgress", "planStart", "forecastFinish", "doneCount", "overdueCount", "blockedCount", "slippedCount"]) {
      assert.ok(field in first, `overview item is missing ${field}`);
    }
    assert.equal(first.pendingRequests, 2);
    assert.equal(first.lastProgressAt, "2026-10-03T08:00:00.000Z");
    // The caller manages project 1, so the stage can move one step either way or be put on hold.
    assert.equal(first.canChangeStatus, true);
    assert.deepEqual(first.allowedStatuses, ["Development", "Commissioning", "On Hold"]);

    // Project 5 has no plan: the typed progress stands and is labelled as such.
    assert.equal(closed.progressSource, "manual");
    assert.equal(closed.progress, 100);
    assert.equal(closed.health, "Completed");
    assert.equal(closed.taskCount, 0);
    assert.equal(closed.pendingRequests, 0);
    assert.equal(closed.lastProgressAt, null);
    // Not this caller's project, and only a manager may reopen a closed one.
    assert.equal(second.canChangeStatus, false);
    assert.equal(closed.canChangeStatus, false);
    assert.deepEqual(closed.allowedStatuses, []);

    // Day requests and progress dates come from one grouped read over all the projects.
    const activity = calls.filter((call) => call.statement.includes("dbo.schedule_updates u"));
    assert.equal(activity.length, 1);
    assert.equal(activity[0]!.bound.ids, "1,2,5");
    assert.match(activity[0]!.statement, /u\.field=N'request' AND u\.request_days>0 AND u\.answer IS NULL/);
    assert.match(activity[0]!.statement, /GROUP BY u\.project_id/);
    assert.equal(calls.filter((call) => call.statement.includes("dbo.schedule_tasks t")).length, 1);
  } finally { await server.close(); }
});

test("a Closed project with unfinished schedule rows shows progress 100 and no plan %, matching the close dialog", async () => {
  // Project 5 was closed while its only task stood at 62%; the closed schedule can no longer be updated.
  const unfinished = raw({ id: 50, project_id: 5, name: "Punch list", plan_start: "2026-09-01", plan_days: 10, percent_done: 62, status: "In Progress", actual_start: "2026-09-01" });
  const { server } = overviewServer({ id: 5, roles: ["Engineer"] }, { extraTasks: [unfinished] });
  try {
    const closed = (await server.inject({ method: "GET", url: "/api/v1/projects/overview?includeClosed=1" })).json().items.find((item: { id: number }) => item.id === 5);
    assert.equal(closed.taskCount, 1);
    assert.equal(closed.progress, 100);
    assert.equal(closed.plannedProgress, null);
    assert.equal(closed.health, "Completed");
  } finally { await server.close(); }
});

test("without project.write nobody gets the stage control, and an elevated writer may reopen", async () => {
  const reader = overviewServer({ id: 5, roles: ["Engineer"] }, { canWrite: false });
  try {
    const items = (await reader.server.inject({ method: "GET", url: "/api/v1/projects/overview" })).json().items;
    assert.equal(items[0].canChangeStatus, false);
  } finally { await reader.server.close(); }
  const manager = overviewServer({ id: 77, roles: ["Engineering Manager"] });
  try {
    const items = (await manager.server.inject({ method: "GET", url: "/api/v1/projects/overview?includeClosed=1" })).json().items;
    assert.ok(items.every((item: { canChangeStatus: boolean }) => item.canChangeStatus));
    assert.deepEqual(items[2].allowedStatuses, ["Handover", "On Hold"]);
  } finally { await manager.server.close(); }
});

test("the paged project list takes its health from the same schedule summary", async () => {
  const { server, calls } = overviewServer({ id: 5, roles: ["Engineer"] });
  try {
    const response = await server.inject({ method: "GET", url: "/api/v1/projects?page=1&pageSize=25" });
    assert.equal(response.statusCode, 200);
    const list = calls.find((call) => call.statement.includes("FROM dbo.projects p"))!;
    assert.match(list.statement, /COUNT_BIG\(\*\) OVER\(\) AS total_count/);
    assert.match(list.statement, /OFFSET @offset ROWS FETCH NEXT @page_size ROWS ONLY/);
    assert.equal(list.bound.page_size, 25);
    const items = response.json().items;
    // Project 2 is measured on its Master Plan only; its health is no longer "No plan".
    assert.notEqual(items[1].health, "No plan");
    // The list keeps its typed progress and adds no overview fields.
    assert.equal(items[0].progress, 12);
    assert.equal("progressSource" in items[0], false);
  } finally { await server.close(); }
});
