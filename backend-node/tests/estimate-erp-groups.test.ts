import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import sql from "mssql";
import type { Database } from "../src/db.js";
import type { CurrentUserService } from "../src/users.js";
import { registerErrorHandler } from "../src/errors.js";
import { registerEstimateErpRoutes } from "../src/routes/estimate-erp.js";

const version = Buffer.from("0000000000000001", "hex");

/*
 * A merged line says how cost lines are written on the ERP sheet. It must never
 * touch a cost line, and a line may belong to one merged line at a time.
 */
function harness(t: { mock: { method: typeof import("node:test").mock.method } }, options: { existing?: string; memberExists?: boolean; removed?: boolean } = {}) {
  const seen: { inserted: string | null; deleted: boolean; costWrites: number } = { inserted: null, deleted: false, costWrites: 0 };
  t.mock.method(sql.Request.prototype, "query", async function (this: sql.Request, statement: string) {
    if (statement.includes("FROM dbo.estimates WITH")) {
      return { recordset: [{ estimate_no: "EST-1", revision: 2, status: "Draft", owner_id: 7, row_version: version }] };
    }
    if (statement.includes("SELECT id,members FROM dbo.estimate_erp_groups")) {
      return { recordset: options.existing ? [{ id: 9, members: options.existing }] : [] };
    }
    if (statement.includes("CONVERT(bit,CASE WHEN EXISTS")) return { recordset: [{ found: options.memberExists !== false }] };
    if (statement.includes("INSERT dbo.estimate_erp_groups")) {
      seen.inserted = String(this.parameters.members!.value);
      return { recordset: [] };
    }
    if (statement.includes("DELETE FROM dbo.estimate_erp_groups")) {
      seen.deleted = true;
      return { recordset: options.removed === false ? [] : [{ title: "Network accessories", members: '[{"sourceType":"CostItem","sourceId":5}]' }] };
    }
    if (statement.includes("UPDATE dbo.estimate_erp_groups")) return { recordset: [{ id: 9 }] };
    if (statement.includes("dbo.cost_items") || statement.includes("dbo.manhour_lines") || statement.includes("dbo.expense_lines") || statement.includes("dbo.other_cost_lines")) {
      seen.costWrites += 1; return { recordset: [] };
    }
    if (statement.includes("audit_log") || statement.includes("activity_events") || statement.includes("assert_estimate_totals")) return { recordset: [] };
    if (statement.includes("UPDATE dbo.estimates")) return { recordset: [] };
    throw Error("Unexpected query: " + statement);
  });
  const database = {
    async transaction(action: (transaction: object) => Promise<unknown>) { return action({}); },
    async query() {
      return { recordsets: [[{ id: 1, revision: 2, status: "Draft", owner_id: 7, row_version: version, canonical_total: 0, overhead_total: 0, overhead_state: "Zero", can_write: true, can_export: false }], [], []] };
    },
  } as unknown as Database;
  const users = { async demandPermission() {}, async required() { return { id: 7, role: "Engineer" }; } } as unknown as CurrentUserService;
  const app = Fastify(); registerErrorHandler(app); registerEstimateErpRoutes(app, database, users);
  return { app, seen };
}

test("merging writes only the group and never a cost line", async (t) => {
  const { app, seen } = harness(t);
  try {
    const response = await app.inject({
      method: "POST", url: "/api/v1/estimates/1/erp-groups",
      payload: {
        estimateRowVersion: version.toString("base64"), title: "Network accessories",
        members: [{ sourceType: "CostItem", sourceId: 5 }, { sourceType: "CostItem", sourceId: 6 }],
      },
    });
    assert.equal(response.statusCode, 201, response.body);
    assert.equal(seen.inserted, '[{"sourceType":"CostItem","sourceId":5},{"sourceType":"CostItem","sourceId":6}]');
    assert.equal(seen.costWrites, 0);
  } finally { await app.close(); }
});

test("a line already inside another merged line is refused", async (t) => {
  const { app, seen } = harness(t, { existing: '[{"sourceType":"CostItem","sourceId":6}]' });
  try {
    const response = await app.inject({
      method: "POST", url: "/api/v1/estimates/1/erp-groups",
      payload: {
        estimateRowVersion: version.toString("base64"), title: "Network accessories",
        members: [{ sourceType: "CostItem", sourceId: 5 }, { sourceType: "CostItem", sourceId: 6 }],
      },
    });
    assert.equal(response.statusCode, 409);
    assert.match(response.body, /already part of another merged line/);
    assert.equal(seen.inserted, null);
  } finally { await app.close(); }
});

test("a member that no longer exists in this revision is refused", async (t) => {
  const { app, seen } = harness(t, { memberExists: false });
  try {
    const response = await app.inject({
      method: "POST", url: "/api/v1/estimates/1/erp-groups",
      payload: {
        estimateRowVersion: version.toString("base64"), title: "Network accessories",
        members: [{ sourceType: "CostItem", sourceId: 5 }, { sourceType: "CostItem", sourceId: 6 }],
      },
    });
    assert.equal(response.statusCode, 404);
    assert.equal(seen.inserted, null);
  } finally { await app.close(); }
});

for (const [name, members] of [
  ["one line is not a merge", [{ sourceType: "CostItem", sourceId: 5 }]],
  ["the same line twice is not a merge", [{ sourceType: "CostItem", sourceId: 5 }, { sourceType: "CostItem", sourceId: 5 }]],
  ["contingency has no line to merge", [{ sourceType: "Contingency", sourceId: null }, { sourceType: "CostItem", sourceId: 5 }]],
] as const) {
  test(name, async (t) => {
    const { app, seen } = harness(t);
    try {
      const response = await app.inject({
        method: "POST", url: "/api/v1/estimates/1/erp-groups",
        payload: { estimateRowVersion: version.toString("base64"), title: "Network accessories", members },
      });
      assert.equal(response.statusCode, 400);
      assert.equal(seen.inserted, null);
    } finally { await app.close(); }
  });
}

test("splitting removes the group and leaves the lines behind", async (t) => {
  const { app, seen } = harness(t);
  try {
    const response = await app.inject({
      method: "DELETE", url: "/api/v1/estimates/1/erp-groups/9",
      payload: { estimateRowVersion: version.toString("base64") },
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.ok(seen.deleted);
    assert.equal(seen.costWrites, 0);
  } finally { await app.close(); }
});

test("splitting a merged line that is already gone says so", async (t) => {
  const { app } = harness(t, { removed: false });
  try {
    const response = await app.inject({
      method: "DELETE", url: "/api/v1/estimates/1/erp-groups/9",
      payload: { estimateRowVersion: version.toString("base64") },
    });
    assert.equal(response.statusCode, 404);
  } finally { await app.close(); }
});

test("renaming a merged line is pinned to the version it was read at", async (t) => {
  const { app, seen } = harness(t);
  try {
    const response = await app.inject({
      method: "PUT", url: "/api/v1/estimates/1/erp-groups/9",
      payload: { estimateRowVersion: version.toString("base64"), groupRowVersion: version.toString("base64"), title: "Accessories", quantity: 2, unit: "Set" },
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(seen.costWrites, 0);
  } finally { await app.close(); }
});
