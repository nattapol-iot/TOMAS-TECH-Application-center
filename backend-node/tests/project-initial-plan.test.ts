import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type { AppConfig } from "../src/config.js";
import type { Database } from "../src/db.js";
import { ApiError, registerErrorHandler } from "../src/errors.js";
import { parseInitialPlan, parseProjectNumber, planSpan } from "../src/project-initial-plan.js";
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
  assert.deepEqual(plan, { milestones: [], team: [] });
  assert.equal(planSpan(plan), null);
});

test("master plan and team rows are read in order, and the span covers both", () => {
  const plan = parseInitialPlan({
    masterPlan: [
      { name: " Kick-off meeting ", start: "2026-08-05", finish: "2026-08-05" },
      { name: "Go Live", start: "2027-04-01", finish: "2027-04-30" },
    ],
    team: [{ userId: 7, task: "Software development - Web", start: "2026-07-20", finish: "2026-11-16", planManDays: 20.5 }],
  });
  assert.deepEqual(plan.milestones.map((row) => row.name), ["Kick-off meeting", "Go Live"]);
  assert.deepEqual(plan.team[0], { userId: 7, task: "Software development - Web", start: "2026-07-20", finish: "2026-11-16", planManDays: 20.5 });
  assert.deepEqual(planSpan(plan), { start: "2026-07-20", finish: "2027-04-30" });
});

test("a team row's plan may be left blank and counts as zero man-days", () => {
  const plan = parseInitialPlan({ team: [{ userId: 3, task: "Installation", start: "2026-10-01", finish: "2026-10-03" }] });
  assert.equal(plan.team[0]!.planManDays, 0);
});

test("each row names what is wrong with it", () => {
  rejects(() => parseInitialPlan({ masterPlan: [{ name: "Go Live", start: "2027-04-30", finish: "2027-04-01" }] }), /Master plan row 1 finishes before it starts/);
  rejects(() => parseInitialPlan({ masterPlan: [{ name: "", start: "2027-04-01", finish: "2027-04-01" }] }), /Master plan row 1 name is required/);
  rejects(() => parseInitialPlan({ masterPlan: [{ name: "Go Live", start: "2027-02-30", finish: "2027-03-01" }] }), /Master plan row 1 start/);
  rejects(() => parseInitialPlan({ masterPlan: [{ name: "Long", start: "2020-01-01", finish: "2031-01-01" }] }), /longer than 3650 days/);
  rejects(() => parseInitialPlan({ team: [{ userId: 0, task: "Web", start: "2026-10-01", finish: "2026-10-01" }] }), /Team plan row 1 member is invalid/);
  rejects(() => parseInitialPlan({ team: [{ userId: 2, task: "Web", start: "2026-10-01", finish: "2026-10-01", planManDays: 1.234 }] }), /Team plan row 1 plan/);
  rejects(() => parseInitialPlan({ team: [{ userId: 2, task: "Web", start: "2026-10-01", finish: "2026-10-01", planManDays: -1 }] }), /Team plan row 1 plan/);
  rejects(() => parseInitialPlan({ masterPlan: "Kick-off" }), /Master plan must be a list/);
  rejects(() => parseInitialPlan({ team: Array.from({ length: 51 }, () => ({})) }), /more than 50 rows/);
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

test("Edit Master Plan renames, re-dates and removes rows made in Project Schedule, on the plan-row terms", async () => {
  const { parseOtherPlanRows, planOtherRowEdits } = await import("../src/project-initial-plan.js");
  const row = (id: number, parentId: number | null, change: Partial<import("../src/project-initial-plan.js").ScheduleRow> = {}) => ({
    id, parentId, kind: "task", name: `Row ${id}`, sortOrder: id, startMode: "manual", planStart: "2026-08-01", planDays: 5, planManDays: 0,
    started: false, children: 0, pending: false, referenced: false, pic: null, picCount: 0, ...change,
  });
  const rows = [
    row(1, null, { kind: "phase", name: "Design", children: 2, planStart: null }), row(2, 1), row(3, 1, { started: true }),
    row(4, null, { kind: "phase", name: "Master Plan", children: 1 }), row(5, 4),
    row(6, null, { startMode: "predecessor" }), row(7, 2, { kind: "detail" }),
  ];
  assert.equal(parseOtherPlanRows(undefined), null);
  assert.deepEqual(parseOtherPlanRows([{ id: 2, name: " FAT " }, { id: 6, remove: true }]), [{ id: 2, name: "FAT" }, { id: 6, remove: true }]);
  rejects(() => parseOtherPlanRows([{ id: 2, name: "A" }, { id: 2, remove: true }]), /listed twice/);
  rejects(() => parseOtherPlanRows([{ id: 2, name: "A", start: "2026-08-05", finish: "2026-08-01" }]), /finishes before it starts/);

  const renamed = planOtherRowEdits(rows, [{ id: 2, name: "FAT", start: "2026-08-03", finish: "2026-08-04" }]);
  assert.deepEqual(renamed.map((action) => action.kind === "update" && [action.row.id, action.name, action.planStart, action.planDays]), [[2, "FAT", "2026-08-03", 2]]);
  // Unchanged rows are skipped; a started row may be renamed but not removed.
  assert.deepEqual(planOtherRowEdits(rows, [{ id: 2, name: "Row 2" }]), []);
  assert.equal(planOtherRowEdits(rows, [{ id: 3, name: "Still running" }]).length, 1);
  const conflict = (edits: Parameters<typeof planOtherRowEdits>[1], code: string) =>
    assert.throws(() => planOtherRowEdits(rows, edits), (error: unknown) => error instanceof ApiError && error.code === code);
  conflict([{ id: 3, remove: true }], "schedule_row_in_use");
  // A phase goes only with every row under it, and after them.
  conflict([{ id: 1, remove: true }, { id: 2, remove: true }], "schedule_row_in_use");
  const parentRows = rows.map((item) => item.id === 3 ? { ...item, started: false } : item).filter((item) => item.id !== 7);
  assert.deepEqual(planOtherRowEdits(parentRows, [{ id: 1, remove: true }, { id: 2, remove: true }, { id: 3, remove: true }]).map((action) => action.row.id), [2, 3, 1]);
  conflict([{ id: 6, name: "Row 6", start: "2026-09-01", finish: "2026-09-02" }], "schedule_rollup_plan_derived");
  conflict([{ id: 5, name: "Kick-off" }], "validation_failed");
  conflict([{ id: 7, remove: true }], "schedule_member_detail");
  conflict([{ id: 99, remove: true }], "schedule_row_missing");
});
