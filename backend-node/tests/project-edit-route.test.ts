import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import sql from "mssql";
import { readFile } from "node:fs/promises";
import type { AppConfig } from "../src/config.js";
import type { Database } from "../src/db.js";
import { ApiError, registerErrorHandler } from "../src/errors.js";
import type { CurrentUserService } from "../src/users.js";
import { registerProjectRoutes } from "../src/routes/projects.js";

const ROW_VERSION = Buffer.alloc(8).toString("base64");
const config = { businessTimeZone: "Asia/Bangkok", documentStorage: {} } as unknown as AppConfig;

test("project deletion preserves work unless Management/Admin force it with the exact number", async (t) => {
  const cases = [
    { label: "Management hard delete", role: "Management", work: false, expected: 200, hard: true },
    { label: "Admin hard delete", role: "Admin", work: false, expected: 200, hard: true },
    { label: "Management soft delete", role: "Management", work: true, body: { force: true, confirmProjectNo: "P-26-007" }, expected: 200, soft: true },
    { label: "Admin soft delete", role: "Admin", work: true, body: { force: true, confirmProjectNo: "P-26-007" }, expected: 200, soft: true },
    { label: "no force", role: "Management", work: true, expected: 409 },
    { label: "false force", role: "Management", work: true, body: { force: false, confirmProjectNo: "P-26-007" }, expected: 409 },
    { label: "wrong number", role: "Management", work: true, body: { force: true, confirmProjectNo: "P-26-008" }, expected: 400 },
    { label: "whitespace is not exact", role: "Management", work: true, body: { force: true, confirmProjectNo: " P-26-007" }, expected: 400 },
    { label: "missing number", role: "Management", work: true, body: { force: true }, expected: 400 },
    { label: "Engineer forbidden", role: "Engineer", work: false, expected: 403 },
    { label: "Engineer cannot force", role: "Engineer", work: true, body: { force: true, confirmProjectNo: "P-26-007" }, expected: 403 },
    { label: "manager still hard deletes", role: "Project Manager", actor: 20, work: false, expected: 200, hard: true },
    { label: "manager cannot force", role: "Project Manager", actor: 20, work: true, body: { force: true, confirmProjectNo: "P-26-007" }, expected: 409 },
  ];
  for (const item of cases) await t.test(item.label, async (sub) => {
    const calls: Array<{ statement: string; params: Record<string, unknown> }> = [];
    const bags = new WeakMap<object, Record<string, unknown>>();
    sub.mock.method(sql.Request.prototype, "input", function (this: object, name: string, ...rest: unknown[]) {
      const bag = bags.get(this) ?? {}; bag[name] = rest.length > 1 ? rest[1] : rest[0]; bags.set(this, bag); return this;
    });
    sub.mock.method(sql.Request.prototype, "query", async function (this: object, statement: string) {
      const params = bags.get(this) ?? {}; calls.push({ statement, params });
      if (statement.includes("FROM dbo.projects WITH(UPDLOCK,HOLDLOCK)")) return { recordset: [{ project_no: "P-26-007", manager_id: 20, name: "Line 3 IoT" }] };
      return { recordset: [], rowsAffected: [1] };
    });
    sub.mock.method(sql.Request.prototype, "execute", async function (this: object, statement: string) {
      const params = bags.get(this) ?? {}; calls.push({ statement, params });
      if (statement === "dbo.delete_unstarted_project") return { recordsets: [item.work ? [{ source: "Schedule progress", row_count: 2 }] : [], []] };
      assert.equal(statement, "dbo.soft_delete_project"); return { recordset: [], rowsAffected: [1] };
    });
    const transactions: string[] = [];
    const database = {
      async query() { assert.equal(item.role, "Project Manager", "Management/Admin must bypass project membership scope"); return { recordset: [{ allowed: true }] }; },
      async transaction(work: (transaction: sql.Transaction) => Promise<unknown>) {
        try { const value = await work({} as sql.Transaction); transactions.push("committed"); return value; }
        catch (error) { transactions.push("rolled-back"); throw error; }
      },
    } as unknown as Database;
    const users = {
      async required() { return { id: item.actor ?? 99, role: "Engineer", roles: [item.role] }; },
      async demandPermission() { if (item.role !== "Project Manager") throw new ApiError(403, "permission_denied", "Denied"); },
    } as unknown as CurrentUserService;
    const server = app(database, users);
    try {
      const preview = await server.inject({ method: "GET", url: "/api/v1/projects/7/deletion" });
      if (item.role === "Engineer") assert.equal(preview.statusCode, 403);
      else {
        assert.equal(preview.statusCode, 200, preview.body);
        assert.deepEqual(preview.json(), { id: 7, canDelete: !item.work, blockers: item.work ? [{ source: "Schedule progress", count: 2 }] : [], canForceDelete: item.work && ["Management", "Admin"].includes(item.role) });
      }
      calls.length = 0; transactions.length = 0;
      const response = await server.inject({ method: "DELETE", url: "/api/v1/projects/7", ...(item.body ? { payload: item.body } : {}) });
      assert.equal(response.statusCode, item.expected, response.body);
      assert.equal(calls.some(call => call.statement === "dbo.delete_unstarted_project" && call.params.execute === true), Boolean(item.hard));
      assert.equal(calls.some(call => call.statement === "dbo.soft_delete_project"), Boolean(item.soft));
      if (item.soft) {
        const audit = calls.find(call => call.params.action === "Deleted with recorded work (soft)")!;
        assert.deepEqual(JSON.parse(String(audit.params.before)).blockers, [{ source: "Schedule progress", count: 2 }]);
        assert.deepEqual(transactions, ["committed"]);
      } else if (item.expected >= 400 && item.role !== "Engineer") assert.deepEqual(transactions, ["rolled-back"]);
    } finally { await server.close(); }
  });
});

test("migration 102 preserves the hard-delete procedure and grants only owner-executed soft deletion", async () => {
  const read = async (name: string) => (await readFile(new URL(`../../database/migrations/${name}`, import.meta.url), "utf8")).replaceAll("\r\n", "\n");
  const original = await read("064_schedule_templates_project_delete.sql"), migration = await read("102_management_project_delete.sql");
  const procedure = (text: string) => text.slice(text.indexOf("EXEC(N'CREATE OR ALTER PROCEDURE dbo.delete_unstarted_project"), text.indexOf("\nIF DATABASE_PRINCIPAL_ID", text.indexOf("EXEC(N'CREATE OR ALTER PROCEDURE dbo.delete_unstarted_project")));
  assert.equal(procedure(migration), procedure(original).replace("N''Engineering Manager'',N''Admin''", "N''Engineering Manager'',N''Management'',N''Admin''").replace("an Engineering Manager or an Admin can delete it.", "an Engineering Manager, Management or an Admin can delete it."));
  const soft = migration.slice(migration.indexOf("CREATE OR ALTER PROCEDURE dbo.soft_delete_project"));
  assert.match(soft, /WITH EXECUTE AS OWNER/);
  assert.match(soft, /code IN\(N''Management'',N''Admin''\)/);
  assert.match(soft, /UPDATE dbo.projects SET deleted_at=SYSUTCDATETIME\(\),updated_by=@actor,updated_at=SYSUTCDATETIME\(\)/);
  assert.match(soft, /WHERE id=@id AND deleted_at IS NULL/);
  assert.doesNotMatch(soft, /DELETE FROM|GRANT UPDATE/);
  assert.match(soft, /GRANT EXECUTE ON OBJECT::dbo.soft_delete_project TO \[iot_team_app_role\]/);
});

function app(database: Database, users: CurrentUserService) {
  const instance = Fastify();
  registerErrorHandler(instance);
  registerProjectRoutes(instance, config, database, users);
  return instance;
}

test("editing a project is refused before any database work when the permission is missing", async () => {
  let touchedDatabase = false;
  const database = {
    async transaction() { touchedDatabase = true; throw new Error("Unexpected transaction"); },
    async query() { touchedDatabase = true; throw new Error("Unexpected query"); },
  } as unknown as Database;
  const users = {
    async demandPermission() { throw new ApiError(403, "permission_denied", "Denied"); },
    async required() { throw new Error("Unexpected actor lookup"); },
  } as unknown as CurrentUserService;
  const server = app(database, users);
  try {
    const response = await server.inject({
      method: "PUT", url: "/api/v1/projects/7", payload: { rowVersion: ROW_VERSION, status: "Design" },
    });
    assert.equal(response.statusCode, 403);
    assert.equal(response.json().code, "permission_denied");
    assert.equal(touchedDatabase, false);
  } finally { await server.close(); }
});

test("a malformed project id or row version stops before the project is read", async () => {
  let touchedDatabase = false;
  const database = {
    async transaction() { touchedDatabase = true; throw new Error("Unexpected transaction"); },
    async query() { touchedDatabase = true; throw new Error("Unexpected query"); },
  } as unknown as Database;
  const users = {
    async demandPermission() {},
    async required() { return { id: 1, role: "Engineer" }; },
  } as unknown as CurrentUserService;
  const server = app(database, users);
  try {
    for (const url of ["/api/v1/projects/0", "/api/v1/projects/-3", "/api/v1/projects/1.5"]) {
      const response = await server.inject({ method: "PUT", url, payload: { rowVersion: ROW_VERSION } });
      assert.equal(response.statusCode, 400);
    }
    // An edit without a usable row version cannot overwrite a concurrent change.
    for (const rowVersion of [undefined, "", "not-base64", Buffer.alloc(4).toString("base64")]) {
      const response = await server.inject({ method: "PUT", url: "/api/v1/projects/7", payload: { rowVersion } });
      assert.equal(response.statusCode, 400);
      assert.equal(response.json().code, "invalid_row_version");
    }
    assert.equal(touchedDatabase, false);
  } finally { await server.close(); }
});

test("someone outside the project cannot edit it even with project.write", async () => {
  let openedTransaction = false;
  const database = {
    // demandProjectScope reads through database.query, and it must refuse before any write begins.
    async query() { return { recordset: [{ allowed: false }] }; },
    async transaction() { openedTransaction = true; throw new Error("Unexpected transaction"); },
  } as unknown as Database;
  const users = {
    async demandPermission() {},
    async required() { return { id: 42, role: "Engineer" }; },
  } as unknown as CurrentUserService;
  const server = app(database, users);
  try {
    const response = await server.inject({
      method: "PUT", url: "/api/v1/projects/7", payload: { rowVersion: ROW_VERSION, status: "Design" },
    });
    assert.equal(response.statusCode, 403);
    assert.equal(response.json().code, "project_scope_forbidden");
    assert.equal(openedTransaction, false);
  } finally { await server.close(); }
});

test("a project that does not exist reports 404 rather than a scope failure", async () => {
  const database = {
    async query() { return { recordset: [] }; },
    async transaction() { throw new Error("Unexpected transaction"); },
  } as unknown as Database;
  const users = {
    async demandPermission() {},
    async required() { return { id: 42, role: "Admin" }; },
  } as unknown as CurrentUserService;
  const server = app(database, users);
  try {
    const response = await server.inject({
      method: "PUT", url: "/api/v1/projects/7", payload: { rowVersion: ROW_VERSION },
    });
    assert.equal(response.statusCode, 404);
    assert.equal(response.json().code, "project_not_found");
  } finally { await server.close(); }
});
