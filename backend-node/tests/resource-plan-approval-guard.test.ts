import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import sql from "mssql";
import type { Transaction } from "mssql";
import { ApiError } from "../src/errors.js";
import { saveApprovedProjectPlan, type WorkRow } from "../src/resource-task-service.js";
import type { CurrentUser } from "../src/types.js";

/* Approving a Resource Plan task rewrites the schedule row it is linked to. It must not move a row that
   was removed meanwhile, or one whose PIC is waiting for an answer on a day request. */

const actor = { id: 5, role: "Engineering Manager", roles: ["Engineering Manager"] } as unknown as CurrentUser;
const row = { project_id: 9, title: "Wire panel A", schedule_task_id: 77 } as unknown as WorkRow;
const plan = { assigneeId: 21, start: "2026-10-12", workDays: 3, manDays: 3, note: "" };

function installSqlMock(t: TestContext, state: { live: boolean; pending: boolean; updated?: number }) {
  const statements: string[] = [];
  t.mock.method(sql.Request.prototype, "input", function (this: object) { return this; });
  t.mock.method(sql.Request.prototype, "query", async function (statement: string) {
    statements.push(statement);
    if (statement.includes("FROM dbo.holidays")) return { recordset: [], rowsAffected: [0] };
    if (statement.includes("FROM dbo.schedule_updates WITH(UPDLOCK,HOLDLOCK)")) return { recordset: [{ pending: state.pending }], rowsAffected: [1] };
    if (statement.includes("FROM dbo.schedule_tasks WITH(UPDLOCK,HOLDLOCK)")) return { recordset: [{ live: state.live }], rowsAffected: [1] };
    if (statement.startsWith("UPDATE dbo.schedule_tasks")) return { recordset: [], rowsAffected: [state.updated ?? 1] };
    return { recordset: [], rowsAffected: [1] };
  });
  return statements;
}

const refusedWith = (code: string) => (error: unknown) => error instanceof ApiError && error.statusCode === 409 && error.code === code;

test("an approved plan updates its live schedule row and resets the PIC", async (t) => {
  const statements = installSqlMock(t, { live: true, pending: false });
  assert.equal(await saveApprovedProjectPlan({} as Transaction, row, plan, actor), 77);
  const requests = statements.findIndex((statement) => statement.includes("FROM dbo.schedule_updates WITH(UPDLOCK,HOLDLOCK)"));
  const task = statements.findIndex((statement) => statement.includes("FROM dbo.schedule_tasks WITH(UPDLOCK,HOLDLOCK)"));
  const update = statements.findIndex((statement) => statement.startsWith("UPDATE dbo.schedule_tasks"));
  // Request rows first, then the task: the order answering a day request takes them.
  assert.ok(requests >= 0 && task > requests && update > task, "the rows are locked and checked before the task is written");
  assert.ok(statements.some((statement) => statement.includes("INSERT dbo.schedule_task_pics")));
});

test("a removed schedule row is refused instead of silently skipped", async (t) => {
  const statements = installSqlMock(t, { live: false, pending: false });
  await assert.rejects(saveApprovedProjectPlan({} as Transaction, row, plan, actor), refusedWith("schedule_task_missing"));
  assert.equal(statements.some((statement) => statement.startsWith("UPDATE dbo.schedule_tasks")), false);
});

test("a row with an unanswered day request keeps its dates until the request is answered", async (t) => {
  const statements = installSqlMock(t, { live: true, pending: true });
  await assert.rejects(saveApprovedProjectPlan({} as Transaction, row, plan, actor), refusedWith("schedule_day_request_pending"));
  assert.equal(statements.some((statement) => statement.startsWith("UPDATE dbo.schedule_tasks")), false);
  assert.match(statements.find((statement) => statement.includes("FROM dbo.schedule_updates WITH(UPDLOCK,HOLDLOCK)"))!, /field=N'request' AND request_days>0 AND answer IS NULL/);
});

test("an update that touches no row is a concurrency conflict", async (t) => {
  installSqlMock(t, { live: true, pending: false, updated: 0 });
  await assert.rejects(saveApprovedProjectPlan({} as Transaction, row, plan, actor), refusedWith("concurrency_conflict"));
});
