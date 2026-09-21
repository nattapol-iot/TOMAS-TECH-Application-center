import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type { Database } from "../src/db.js";
import { registerErrorHandler } from "../src/errors.js";
import { registerEstimateAssignmentReadRoutes } from "../src/routes/estimate-assignments-read.js";
import type { CurrentUserService } from "../src/users.js";

const row = {
  assignment_id: 12, estimate_id: 100, estimate_no: "EST-2026-0100", project_name: "Line 4 retrofit",
  customer_name: "Acme", inquiry_no: "INQ-2026-0044", revision: 2, estimate_status: "Engineering Input",
  estimate_due_date: "2026-12-31", estimate_owner_id: 7, estimate_owner_name: "Owner", section: "03 Electrical",
  role: "Responsible", owner_id: 9, owner_name: "Assignee", support_id: null, support_name: null,
  due_date: "2026-11-30", status: "Not Started", progress: 0, comment: "Panel scope", cost_line_count: 0,
  updated_at: "2026-09-10T03:00:00Z",
};

function harness(actorId: number) {
  const app = Fastify();
  registerErrorHandler(app);
  const calls: Array<{ statement: string; params: Record<string, unknown> }> = [];
  const database = {
    query: async (statement: string, bind: (request: { input: (name: string, _type: unknown, value: unknown) => void }) => void) => {
      const params: Record<string, unknown> = {};
      bind({ input: (name, _type, value) => { params[name] = value; } });
      calls.push({ statement, params });
      return { recordset: [row] };
    },
  } as unknown as Database;
  const demanded: string[] = [];
  const users = {
    demandPermission: async (_request: unknown, permission: string) => { demanded.push(permission); },
    required: async () => ({ id: actorId, role: "Engineer" }),
  } as unknown as CurrentUserService;
  registerEstimateAssignmentReadRoutes(app, database, users);
  return { app, calls, demanded };
}

test("an engineer only ever reads the estimate sections they are responsible for or support", async () => {
  const { app, calls, demanded } = harness(9);
  try {
    const response = await app.inject({ method: "GET", url: "/api/v1/me/estimate-assignments" });
    assert.equal(response.statusCode, 200, response.body);
    assert.deepEqual(demanded, ["estimate.read"]);
    const { statement, params } = calls[0]!;
    assert.match(statement, /WHERE \(a\.owner_id=@actor OR a\.support_id=@actor\)/);
    assert.equal(params.actor, 9);
    // No other identity column may widen the result set.
    assert.doesNotMatch(statement, /e\.owner_id=@actor/);
  } finally { await app.close(); }
});

test("work that has been assigned but not started is returned, and finished work is filtered out by default", async () => {
  const { app, calls } = harness(9);
  try {
    const response = await app.inject({ method: "GET", url: "/api/v1/me/estimate-assignments" });
    assert.equal(response.statusCode, 200);
    const { statement, params } = calls[0]!;
    assert.equal(params.include_closed, false);
    assert.match(statement, /a\.status NOT IN\(N'Completed',N'Reviewed'\)/);
    assert.match(statement, /e\.status NOT IN\(N'Approved',N'Locked',N'Cancelled'\)/);
    assert.match(statement, /e\.archived_at IS NULL AND i\.archived_at IS NULL/);
    // Nothing may hide a not-started assignment, and nothing may change its status to reveal it.
    assert.doesNotMatch(statement, /N'Not Started'/);
    assert.doesNotMatch(statement, /\b(UPDATE|INSERT|DELETE|MERGE)\b/);
    assert.equal(response.json()[0].status, "Not Started");
  } finally { await app.close(); }
});

test("deleted estimates stay hidden and the section's line count follows the current revision", async () => {
  const { app, calls } = harness(9);
  try {
    assert.equal((await app.inject({ method: "GET", url: "/api/v1/me/estimate-assignments" })).statusCode, 200);
    const { statement } = calls[0]!;
    assert.match(statement, /e\.deleted_at IS NULL AND i\.deleted_at IS NULL/);
    assert.match(statement, /line\.revision=e\.revision/);
    assert.match(statement, /line\.deleted_at IS NULL/);
    assert.match(statement, /ORDER BY a\.due_date,e\.estimate_no,a\.section/);
  } finally { await app.close(); }
});

test("closed work can be asked for explicitly without changing who may see it", async () => {
  const { app, calls } = harness(9);
  try {
    assert.equal((await app.inject({ method: "GET", url: "/api/v1/me/estimate-assignments?includeClosed=true" })).statusCode, 200);
    assert.equal(calls[0]!.params.include_closed, true);
    assert.equal(calls[0]!.params.actor, 9);
    assert.match(calls[0]!.statement, /WHERE \(a\.owner_id=@actor OR a\.support_id=@actor\)/);
  } finally { await app.close(); }
});

test("the queue row carries everything the engineer needs to act on it", async () => {
  const { app } = harness(9);
  try {
    const [record] = (await app.inject({ method: "GET", url: "/api/v1/me/estimate-assignments" })).json();
    assert.deepEqual(record, {
      assignmentId: 12, estimateId: 100, estimateNumber: "EST-2026-0100", inquiryNumber: "INQ-2026-0044",
      projectName: "Line 4 retrofit", customerName: "Acme", revision: 2, estimateStatus: "Engineering Input",
      estimateDueDate: "2026-12-31", estimateOwnerId: 7, estimateOwnerName: "Owner", section: "03 Electrical",
      sectionCode: "03", role: "Responsible", ownerId: 9, ownerName: "Assignee", supportId: null, supportName: null,
      dueDate: "2026-11-30", status: "Not Started", progress: 0, comment: "Panel scope", costLineCount: 0,
      updatedAt: "2026-09-10T03:00:00Z",
    });
  } finally { await app.close(); }
});
