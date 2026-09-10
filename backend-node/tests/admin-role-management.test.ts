import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import sql from "mssql";
import type { Database } from "../src/db.js";
import { ApiError, registerErrorHandler } from "../src/errors.js";
import { registerAdminRoutes } from "../src/routes/admin.js";
import type { CurrentUserService } from "../src/users.js";

const currentVersion = Buffer.from("0000000000000001", "hex");
const nextVersion = Buffer.from("0000000000000002", "hex");

function databaseWithTransaction(): Database {
  return {
    async transaction(action: (transaction: object) => Promise<unknown>) { return action({}); },
  } as unknown as Database;
}

test("role management requires its dedicated Admin permission before database access", async () => {
  let touched = false;
  const permissions: string[] = [];
  const database = {
    async query() { touched = true; throw new Error("Unexpected database access"); },
    async transaction() { touched = true; throw new Error("Unexpected database access"); },
  } as unknown as Database;
  const users = {
    async demandPermission(_request: unknown, permission: string) {
      permissions.push(permission);
      throw new ApiError(403, "permission_denied", "Denied");
    },
  } as unknown as CurrentUserService;
  const app = Fastify(); registerErrorHandler(app); registerAdminRoutes(app, database, users);
  try {
    const roles = await app.inject({ method: "GET", url: "/api/v1/admin/roles" });
    const update = await app.inject({ method: "PUT", url: "/api/v1/admin/users/7/role", payload: { roleCode: "Engineer", rowVersion: currentVersion.toString("base64") } });
    assert.equal(roles.statusCode, 403);
    assert.equal(update.statusCode, 403);
    assert.deepEqual(permissions, ["admin.manage_roles", "admin.manage_roles"]);
    assert.equal(touched, false);
  } finally { await app.close(); }
});

test("role picker returns active database roles instead of a hard-coded UI list", async () => {
  let statement = "";
  const database = {
    async query(query: string) {
      statement = query;
      return { recordset: [{ id: 1, code: "Admin", name: "Admin", description: "Full administration" }] };
    },
  } as unknown as Database;
  const users = { async demandPermission() {} } as unknown as CurrentUserService;
  const app = Fastify(); registerErrorHandler(app); registerAdminRoutes(app, database, users);
  try {
    const response = await app.inject({ method: "GET", url: "/api/v1/admin/roles" });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { items: [{ id: 1, code: "Admin", name: "Admin", description: "Full administration" }] });
    assert.match(statement, /FROM dbo\.roles/);
    assert.match(statement, /WHERE is_active=1/);
  } finally { await app.close(); }
});

test("stale role edits stop before update and audit writes", async (t) => {
  const statements: string[] = [];
  t.mock.method(sql.Request.prototype, "query", async function (statement: string) {
    statements.push(statement);
    if (/FROM dbo\.users app_user/.test(statement)) return { recordset: [{ id: 7, name: "User", email: "user@example.com", role: "Engineer", row_version: nextVersion }] };
    if (/FROM dbo\.roles/.test(statement)) return { recordset: [{ id: 1, code: "Admin", name: "Admin", description: "" }] };
    throw new Error(`Unexpected query: ${statement}`);
  });
  const users = { async demandPermission() {}, async required() { return { id: 1 }; } } as unknown as CurrentUserService;
  const app = Fastify(); registerErrorHandler(app); registerAdminRoutes(app, databaseWithTransaction(), users);
  try {
    const response = await app.inject({ method: "PUT", url: "/api/v1/admin/users/7/role", payload: { roleCode: "Admin", rowVersion: currentVersion.toString("base64") } });
    assert.equal(response.statusCode, 409);
    assert.equal(response.json().code, "concurrency_conflict");
    assert.equal(statements.length, 2);
    assert.equal(statements.some((statement) => /UPDATE dbo\.users/.test(statement)), false);
  } finally { await app.close(); }
});

test("the final active Admin cannot be demoted", async (t) => {
  const statements: string[] = [];
  t.mock.method(sql.Request.prototype, "query", async function (statement: string) {
    statements.push(statement);
    if (/SELECT app_user\.id/.test(statement)) return { recordset: [{ id: 7, name: "Admin User", email: "admin@example.com", role: "Admin", row_version: currentVersion }] };
    if (/FROM dbo\.roles/.test(statement)) return { recordset: [{ id: 2, code: "Engineer", name: "Engineer", description: "" }] };
    if (/COUNT_BIG/.test(statement)) return { recordset: [{ count: 1 }] };
    throw new Error(`Unexpected query: ${statement}`);
  });
  const users = { async demandPermission() {}, async required() { return { id: 7 }; } } as unknown as CurrentUserService;
  const app = Fastify(); registerErrorHandler(app); registerAdminRoutes(app, databaseWithTransaction(), users);
  try {
    const response = await app.inject({ method: "PUT", url: "/api/v1/admin/users/7/role", payload: { roleCode: "Engineer", rowVersion: currentVersion.toString("base64") } });
    assert.equal(response.statusCode, 409);
    assert.equal(response.json().code, "last_admin_required");
    assert.equal(statements.some((statement) => /UPDATE dbo\.users/.test(statement)), false);
  } finally { await app.close(); }
});

test("a valid role edit updates only the role and records audit history", async (t) => {
  const statements: string[] = [];
  t.mock.method(sql.Request.prototype, "query", async function (statement: string) {
    statements.push(statement);
    if (/SELECT app_user\.id/.test(statement)) return { recordset: [{ id: 7, name: "User", email: "user@example.com", role: "Engineer", row_version: currentVersion }] };
    if (/FROM dbo\.roles/.test(statement)) return { recordset: [{ id: 1, code: "Admin", name: "Admin", description: "" }] };
    if (/UPDATE dbo\.users/.test(statement)) return { recordset: [{ row_version: nextVersion }] };
    return { recordset: [] };
  });
  const users = { async demandPermission() {}, async required() { return { id: 1 }; } } as unknown as CurrentUserService;
  const app = Fastify(); registerErrorHandler(app); registerAdminRoutes(app, databaseWithTransaction(), users);
  try {
    const response = await app.inject({ method: "PUT", url: "/api/v1/admin/users/7/role", payload: { roleCode: "Admin", rowVersion: currentVersion.toString("base64") } });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { id: 7, role: "Admin", rowVersion: nextVersion.toString("base64") });
    const update = statements.find((statement) => /UPDATE dbo\.users/.test(statement));
    assert.match(update ?? "", /SET role_id=@role_id,updated_at=SYSUTCDATETIME\(\)/);
    assert.match(update ?? "", /row_version=@row_version/);
    assert.equal(statements.some((statement) => /INSERT INTO dbo\.audit_log/.test(statement)), true);
  } finally { await app.close(); }
});
