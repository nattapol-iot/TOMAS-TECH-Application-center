import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type { AppConfig } from "../src/config.js";
import type { Database } from "../src/db.js";
import { ApiError, registerErrorHandler } from "../src/errors.js";
import { keptPlanRowDates, parseInitialPlan, parseProjectNumber, planAssignments, plannedRemovals, planRowsOf, planSpan, type ScheduleRow } from "../src/project-initial-plan.js";
import { registerProjectRoutes } from "../src/routes/projects.js";
import type { CurrentUserService } from "../src/users.js";

const rejects = (run: () => unknown, pattern: RegExp) => assert.throws(run, (error: unknown) => error instanceof ApiError && error.statusCode === 400 && pattern.test(error.message));

test("the ERP project number is kept in one canonical spelling and must look like an ERP number", () => {
  assert.equal(parseProjectNumber("  pj260017 "), "PJ260017");
  assert.equal(parseProjectNumber("PJ-2609-0001"), "PJ-2609-0001");
  rejects(() => parseProjectNumber(""), /Project number is required/);
  rejects(() => parseProjectNumber("PJ 26 0017"), /ERP number/);
  rejects(() => parseProjectNumber("-PJ1"), /ERP number/);
  rejects(() => parseProjectNumber("P".repeat(31)), /cannot exceed 30/);
});

test("an empty plan is allowed and has no span, so the typed project dates apply", () => {
  const plan = parseInitialPlan({});
  assert.deepEqual(plan, { headings: [] });
  assert.equal(planSpan(plan), null);
});

test("the Master Plan lists headings; each holds its team's tasks and their functions, in order", () => {
  const plan = parseInitialPlan({ masterPlan: [
    { name: " Kick-off meeting ", start: "2026-08-05", finish: "2026-08-05" },
    { name: "Software development", start: "2026-08-10", finish: "2026-11-30", tasks: [
      { name: "Web App WMS", userId: 7, start: "2026-08-10", finish: "2026-10-30", planManDays: 20.5, functions: [
        { name: "Inbound" }, { name: "Outbound", userId: 8, start: "2026-09-01", finish: "2026-09-20" },
      ] },
      { name: "Installation", userId: 3, start: "2026-11-01", finish: "2026-11-03" },
    ] },
  ] });
  assert.deepEqual(plan.headings.map((heading) => [heading.name, heading.tasks.map((task) => task.name)]),
    [["Kick-off meeting", []], ["Software development", ["Web App WMS", "Installation"]]]);
  assert.deepEqual(plan.headings[1]!.tasks[0]!.functions, [
    { name: "Inbound", userId: null, start: null, finish: null },
    { name: "Outbound", userId: 8, start: "2026-09-01", finish: "2026-09-20" },
  ]);
  // A task's plan may be left blank: zero man-days.
  assert.equal(plan.headings[1]!.tasks[1]!.planManDays, 0);
  assert.deepEqual(planSpan(plan), { start: "2026-08-05", finish: "2026-11-30" });
  // A function without a member or dates has its task's.
  assert.deepEqual(planAssignments(plan), [
    { userId: 7, task: "Web App WMS", start: "2026-08-10", finish: "2026-10-30" },
    { userId: 7, task: "Web App WMS · Inbound", start: "2026-08-10", finish: "2026-10-30" },
    { userId: 8, task: "Web App WMS · Outbound", start: "2026-09-01", finish: "2026-09-20" },
    { userId: 3, task: "Installation", start: "2026-11-01", finish: "2026-11-03" },
  ]);
});

test("each row names what is wrong with it, and the plan form of before 2026-11-03 is refused", () => {
  rejects(() => parseInitialPlan({ masterPlan: [{ name: "Go Live", start: "2027-04-30", finish: "2027-04-01" }] }), /Master plan heading 1 finishes before it starts/);
  rejects(() => parseInitialPlan({ masterPlan: [{ name: "", start: "2027-04-01", finish: "2027-04-01" }] }), /Master plan heading 1 name is required/);
  rejects(() => parseInitialPlan({ masterPlan: [{ name: "Go Live", start: "2027-02-30", finish: "2027-03-01" }] }), /Master plan heading 1 start/);
  rejects(() => parseInitialPlan({ masterPlan: [{ name: "Long", start: "2020-01-01", finish: "2031-01-01" }] }), /longer than 3650 days/);
  const heading = (tasks: unknown[]) => ({ masterPlan: [{ name: "Build", start: "2026-10-01", finish: "2026-10-31", tasks }] });
  rejects(() => parseInitialPlan(heading([{ userId: 0, name: "Web", start: "2026-10-01", finish: "2026-10-01" }])), /Team plan task 1\.1 member is invalid/);
  rejects(() => parseInitialPlan(heading([{ userId: 2, name: "Web", start: "2026-10-01", finish: "2026-10-01", planManDays: 1.234 }])), /Team plan task 1\.1 plan/);
  rejects(() => parseInitialPlan(heading([{ userId: 2, name: "Web", start: "2026-10-01", finish: "2026-10-01", planManDays: -1 }])), /Team plan task 1\.1 plan/);
  rejects(() => parseInitialPlan(heading([{ userId: 2, name: "Web", start: "2026-10-01", finish: "2026-10-02", functions: [{ name: "Inbound", start: "2026-10-01" }] }])),
    /Team plan function 1\.1\.1 finish/);
  rejects(() => parseInitialPlan({ masterPlan: "Kick-off" }), /Master plan must be a list/);
  rejects(() => parseInitialPlan({ masterPlan: Array.from({ length: 51 }, () => ({})) }), /more than 50 rows/);
  rejects(() => parseInitialPlan({ masterPlan: [], team: [] }), /Reload the page/);
});

const config = { businessTimeZone: "Asia/Bangkok", documentStorage: {} } as unknown as AppConfig;
const users = {
  async demandPermission() { /* project.write granted */ },
  async required() { return { id: 5, roles: ["Project Manager"] }; },
} as unknown as CurrentUserService;
const body = {
  projectNumber: "PJ260017", estimateId: 9, purchaseOrderNumber: "PO-1", purchaseOrderDate: "2026-09-01",
  managerId: 5, leadEngineerId: 6, startDate: "2026-09-01", targetDelivery: "2026-12-01", site: "Factory",
};

async function post(payload: Record<string, unknown>, canPlan: boolean) {
  let transactions = 0;
  const database = {
    async transaction() { transactions += 1; throw new Error("Unexpected transaction"); },
    async query() { return { recordset: [{ allowed: canPlan }] }; },
  } as unknown as Database;
  const server = Fastify(); registerErrorHandler(server); registerProjectRoutes(server, config, database, users);
  const response = await server.inject({ method: "POST", url: "/api/v1/projects", payload });
  await server.close();
  return { response, transactions };
}

test("a project without the ERP number is refused before any database work", async () => {
  const { response, transactions } = await post({ ...body, projectNumber: undefined }, true);
  assert.equal(response.statusCode, 400);
  assert.match(response.json().message, /Project number is required/);
  assert.equal(transactions, 0);
});

test("writing a plan with the project needs schedule planning permission, checked before the project is created", async () => {
  const { response, transactions } = await post({ ...body, masterPlan: [{ name: "Kick-off", start: "2026-09-02", finish: "2026-09-02" }] }, false);
  assert.equal(response.statusCode, 403);
  assert.equal(response.json().code, "schedule_plan_required");
  assert.equal(transactions, 0);
});

test("a page still sending the team plan as its own list is told to reload, before any database work", async () => {
  const { response, transactions } = await post({ ...body, masterPlan: [], team: [{ userId: 6, task: "Web", start: "2026-09-02", finish: "2026-09-03" }] }, true);
  assert.equal(response.statusCode, 400);
  assert.equal(response.json().code, "plan_shape_outdated");
  assert.equal(transactions, 0);
});

const row = (id: number, parentId: number | null, change: Partial<ScheduleRow> = {}): ScheduleRow => ({
  id, parentId, kind: "task", name: `Row ${id}`, sortOrder: id, startMode: "manual", planStart: "2026-08-01", planDays: 5, planManDays: 0,
  started: false, children: 0, pending: false, referenced: false, pic: null, picCount: 0, details: 0, managed: false, ...change,
});

test("Edit project removes the headings, tasks and functions it no longer lists, deepest first, unless something hangs on them", () => {
  const rows = [
    row(1, null, { kind: "phase", name: "Design" }), row(2, 1), row(3, 2), row(4, 3, { kind: "detail" }),
    row(5, null, { kind: "phase", name: "Build" }), row(6, 5), row(7, 6), row(8, 6),
    row(9, null, { name: "Legacy top task" }),
  ];
  // The form edits headings, their tasks and the tasks' functions; members' own tasks, and rows at the top that are not headings, are not its.
  assert.deepEqual([...planRowsOf(rows)].sort((a, b) => a - b), [1, 2, 3, 5, 6, 7, 8]);
  assert.deepEqual(plannedRemovals(rows, new Set([1, 2, 3, 5, 6, 7])).map((item) => item.id), [8]);
  // A task goes after its functions, and a heading after its tasks.
  assert.deepEqual(plannedRemovals(rows, new Set([1, 2, 3, 5])).map((item) => item.id), [7, 8, 6]);
  assert.deepEqual(plannedRemovals(rows, new Set([1, 2, 3])).map((item) => item.id), [7, 8, 6, 5]);
  const inUse = (from: ScheduleRow[], listed: number[]) =>
    assert.throws(() => plannedRemovals(from, new Set(listed)), (error: unknown) => error instanceof ApiError && error.code === "schedule_row_in_use");
  inUse(rows, [5, 6, 7, 8]); // heading 1 holds a member's own task
  inUse(rows.map((item) => item.id === 7 ? { ...item, started: true } : item), [1, 2, 3, 5]);
  inUse(rows.map((item) => item.id === 8 ? { ...item, pending: true } : item), [1, 2, 3, 5, 6, 7]);
  inUse(rows.map((item) => item.id === 8 ? { ...item, referenced: true } : item), [1, 2, 3, 5, 6, 7]);
});

test("Edit project sends a plan row back with the dates it shows: a row with functions or a predecessor keeps its own", () => {
  const plain = { planStart: "2026-11-03", planDays: 1, children: 0, startMode: "manual" };
  assert.deepEqual(keptPlanRowDates(plain, { start: "2026-11-03", finish: "2026-11-03" }, undefined), { planStart: "2026-11-03", planDays: 1, changed: false });
  assert.deepEqual(keptPlanRowDates(plain, { start: "2026-11-04", finish: "2026-11-06" }, undefined), { planStart: "2026-11-04", planDays: 3, changed: true });
  // Its functions run 4-6 November; the task itself was stored as 3 November, one day.
  const parent = { ...plain, children: 3 }, shown = { planStart: "2026-11-04", planFinish: "2026-11-06" };
  assert.deepEqual(keptPlanRowDates(parent, { start: "2026-11-04", finish: "2026-11-06" }, shown), { planStart: "2026-11-03", planDays: 1, changed: false });
  assert.equal(keptPlanRowDates(parent, { start: "2026-11-05", finish: "2026-11-06" }, shown).changed, true);
  const linked = { ...plain, startMode: "linked", planStart: null };
  assert.deepEqual(keptPlanRowDates(linked, { start: "2026-11-10", finish: "2026-11-10" }, { planStart: "2026-11-10", planFinish: "2026-11-10" }), { planStart: null, planDays: 1, changed: false });
});
