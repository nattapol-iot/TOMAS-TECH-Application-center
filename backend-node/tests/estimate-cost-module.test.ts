import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import sql from "mssql";
import type { Database } from "../src/db.js";
import { registerErrorHandler } from "../src/errors.js";
import { assertCostItemIdentityUnchanged, registerEstimateCostWriteRoutes } from "../src/routes/estimate-cost-write.js";
import type { CurrentUserService } from "../src/users.js";

const version = (value: number) => {
  const buffer = Buffer.alloc(8); buffer.writeUInt32BE(value, 4); return buffer;
};

function modulePayload(lines: Array<{ id: number; rowVersion: string }>) {
  return {
    currentCategoryCode: "01", currentModule: "Control panel",
    module: "Main control panel",
    estimateRowVersion: version(1).toString("base64"), lines,
  };
}

test("single-line edits cannot split a module or move it to another category", () => {
  assert.doesNotThrow(() => assertCostItemIdentityUnchanged({ category_code: "01", module: "Control panel" }, "01", "Control panel"));
  for (const [categoryCode, module] of [["01", "Panel subset"], ["07", "Control panel"]] as Array<[string, string]>) {
    assert.throws(
      () => assertCostItemIdentityUnchanged({ category_code: "01", module: "Control panel" }, categoryCode, module),
      (error: unknown) => Boolean(error && typeof error === "object" && "code" in error && error.code === "module_identity_change_forbidden"),
    );
  }
});

test("module update validates its complete line-version contract before opening a transaction", async () => {
  let transactions = 0;
  const database = { async transaction() { transactions++; throw new Error("Unexpected transaction"); } } as unknown as Database;
  const users = { async demandPermission() {}, async required() { return { id: 7, role: "Admin" }; } } as unknown as CurrentUserService;
  const app = Fastify(); registerErrorHandler(app); registerEstimateCostWriteRoutes(app, database, users);
  try {
    const duplicate = { id: 10, rowVersion: version(2).toString("base64") };
    const duplicateResponse = await app.inject({ method: "PUT", url: "/api/v1/estimates/1/cost-modules", payload: modulePayload([duplicate, duplicate]) });
    assert.equal(duplicateResponse.statusCode, 400); assert.equal(duplicateResponse.json().code, "validation_failed");
    const categoryResponse = await app.inject({
      method: "PUT", url: "/api/v1/estimates/1/cost-modules",
      payload: { ...modulePayload([duplicate]), currentCategoryCode: "99" },
    });
    assert.equal(categoryResponse.statusCode, 400); assert.equal(categoryResponse.json().code, "validation_failed");
    assert.equal(transactions, 0);
  } finally { await app.close(); }
});

test("module update rejects a partial active-line selection before any update", async (t) => {
  const statements: string[] = [];
  t.mock.method(sql.Request.prototype, "query", async function (statement: string) {
    statements.push(statement);
    if (statement.includes("FROM dbo.estimates WITH (UPDLOCK,HOLDLOCK)")) {
      return { recordset: [{ estimate_no: "EST-001", revision: 1, status: "Draft", row_version: version(1), owner_id: 7, due_date: "2026-09-30" }] };
    }
    if (statement.includes("SELECT CASE WHEN EXISTS")) return { recordset: [{ present: 0 }] };
    if (statement.includes("FROM dbo.cost_items WITH (UPDLOCK,HOLDLOCK)")) {
      return { recordset: [
        { id: 10, category_code: "01", category: "Hardware", module: "Control panel", owner_id: 7, row_version: version(2) },
        { id: 11, category_code: "01", category: "Hardware", module: "Control panel", owner_id: 7, row_version: version(3) },
      ] };
    }
    throw new Error(`Unexpected SQL: ${statement}`);
  });
  const database = { async transaction(action: (transaction: object) => Promise<unknown>) { return action({}); } } as unknown as Database;
  const users = { async demandPermission() {}, async required() { return { id: 7, role: "Admin" }; } } as unknown as CurrentUserService;
  const app = Fastify(); registerErrorHandler(app); registerEstimateCostWriteRoutes(app, database, users);
  try {
    const response = await app.inject({
      method: "PUT", url: "/api/v1/estimates/1/cost-modules",
      payload: modulePayload([{ id: 10, rowVersion: version(2).toString("base64") }]),
    });
    assert.equal(response.statusCode, 409); assert.equal(response.json().code, "concurrency_conflict");
    assert.equal(statements.length, 2);
    assert.match(statements[1]!, /UPDLOCK,HOLDLOCK/);
    assert.doesNotMatch(statements.join("\n"), /UPDATE dbo\.cost_items/);
  } finally { await app.close(); }
});

test("module update renames the complete module, touches the estimate once, and audits every line", async (t) => {
  const statements: string[] = [];
  let moduleReads = 0;
  t.mock.method(sql.Request.prototype, "query", async function (statement: string) {
    statements.push(statement);
    if (statement.includes("FROM dbo.estimates WITH (UPDLOCK,HOLDLOCK)")) {
      return { recordset: [{ estimate_no: "EST-001", revision: 1, status: "Draft", row_version: version(1), owner_id: 7, due_date: "2026-09-30" }] };
    }
    if (statement.includes("FROM dbo.cost_items WITH (UPDLOCK,HOLDLOCK)")) {
      moduleReads++;
      const renamed = moduleReads > 1;
      return { recordset: [
        { id: 10, category_code: "01", category: "Hardware", module: renamed ? "Main control panel" : "Control panel", owner_id: 7, row_version: version(renamed ? 4 : 2) },
        { id: 11, category_code: "01", category: "Hardware", module: renamed ? "Main control panel" : "Control panel", owner_id: 7, row_version: version(renamed ? 5 : 3) },
      ] };
    }
    if (statement.includes("UPDATE dbo.estimates SET")) return { recordset: [{ row_version: version(6) }] };
    return { recordset: [] };
  });
  const database = { async transaction(action: (transaction: object) => Promise<unknown>) { return action({}); } } as unknown as Database;
  const users = { async demandPermission() {}, async required() { return { id: 7, role: "Admin" }; } } as unknown as CurrentUserService;
  const app = Fastify(); registerErrorHandler(app); registerEstimateCostWriteRoutes(app, database, users);
  try {
    const response = await app.inject({
      method: "PUT", url: "/api/v1/estimates/1/cost-modules",
      payload: modulePayload([
        { id: 10, rowVersion: version(2).toString("base64") },
        { id: 11, rowVersion: version(3).toString("base64") },
      ]),
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.deepEqual(response.json(), { estimateRowVersion: version(6).toString("base64"), lines: 2 });
    const moduleUpdate = statements.find((statement) => statement.includes("UPDATE dbo.cost_items SET module=@module"));
    assert.ok(moduleUpdate);
    assert.doesNotMatch(moduleUpdate.slice(0, moduleUpdate.indexOf("WHERE")), /category_code\s*=/);
    assert.equal(statements.filter((statement) => statement.includes("UPDATE dbo.estimates SET")).length, 1);
    assert.equal(statements.filter((statement) => statement.includes("INSERT INTO dbo.audit_log")).length, 2);
    assert.equal(statements.filter((statement) => statement.includes("INSERT dbo.activity_events")).length, 2);
  } finally { await app.close(); }
});

test("module update blocks a duplicate name in the same category before writing", async (t) => {
  const statements: string[] = [];
  t.mock.method(sql.Request.prototype, "query", async function (statement: string) {
    statements.push(statement);
    if (statement.includes("FROM dbo.estimates WITH (UPDLOCK,HOLDLOCK)")) {
      return { recordset: [{ estimate_no: "EST-001", revision: 1, status: "Draft", row_version: version(1), owner_id: 7, due_date: "2026-09-30" }] };
    }
    if (statement.includes("SELECT CASE WHEN EXISTS")) return { recordset: [{ present: 1 }] };
    if (statement.includes("FROM dbo.cost_items WITH (UPDLOCK,HOLDLOCK)")) {
      return { recordset: [
        { id: 10, category_code: "01", category: "Hardware", module: "Control panel", owner_id: 7, row_version: version(2) },
        { id: 11, category_code: "01", category: "Hardware", module: "Control panel", owner_id: 7, row_version: version(3) },
      ] };
    }
    throw new Error(`Unexpected SQL: ${statement}`);
  });
  const database = { async transaction(action: (transaction: object) => Promise<unknown>) { return action({}); } } as unknown as Database;
  const users = { async demandPermission() {}, async required() { return { id: 7, role: "Admin" }; } } as unknown as CurrentUserService;
  const app = Fastify(); registerErrorHandler(app); registerEstimateCostWriteRoutes(app, database, users);
  try {
    const response = await app.inject({
      method: "PUT", url: "/api/v1/estimates/1/cost-modules",
      payload: modulePayload([
        { id: 10, rowVersion: version(2).toString("base64") },
        { id: 11, rowVersion: version(3).toString("base64") },
      ]),
    });
    assert.equal(response.statusCode, 409); assert.equal(response.json().code, "module_name_conflict");
    assert.doesNotMatch(statements.join("\n"), /UPDATE dbo\.cost_items/);
  } finally { await app.close(); }
});
