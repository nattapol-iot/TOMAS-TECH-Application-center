import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type { Database } from "../src/db.js";
import { ApiError, registerErrorHandler } from "../src/errors.js";
import type { CurrentUserService } from "../src/users.js";
import { registerAdminRoutes } from "../src/routes/admin.js";
import { hasRole, rolesOf } from "../src/user-roles.js";
import type { CurrentUser } from "../src/types.js";

function app(database: Database, users: CurrentUserService) {
  const instance = Fastify();
  registerErrorHandler(instance);
  registerAdminRoutes(instance, database, users);
  return instance;
}

const admin = {
  async demandPermission() {},
  async required() { return { id: 1, role: "Admin", roles: ["Admin"] }; },
} as unknown as CurrentUserService;

test("an additional role is refused before any database work without admin.manage_roles", async () => {
  let touched = false;
  const database = {
    async query() { touched = true; throw new Error("Unexpected query"); },
    async transaction() { touched = true; throw new Error("Unexpected transaction"); },
  } as unknown as Database;
  const users = {
    async demandPermission() { throw new ApiError(403, "permission_denied", "Denied"); },
    async required() { throw new Error("Unexpected actor lookup"); },
  } as unknown as CurrentUserService;
  const server = app(database, users);
  try {
    for (const call of [
      { method: "GET" as const, url: "/api/v1/admin/users/7/roles" },
      { method: "POST" as const, url: "/api/v1/admin/users/7/roles", payload: { roleCode: "Admin", reason: "cover" } },
      { method: "DELETE" as const, url: "/api/v1/admin/users/7/roles/Admin" },
    ]) {
      const response = await server.inject(call);
      assert.equal(response.statusCode, 403, call.url);
      assert.equal(response.json().code, "permission_denied");
    }
    assert.equal(touched, false);
  } finally { await server.close(); }
});

test("granting a role needs a reason and a real user, and never opens a transaction first", async () => {
  let opened = false;
  const database = {
    async query() { return { recordset: [] }; },
    async transaction(work: (transaction: unknown) => Promise<unknown>) {
      opened = true;
      // The account lookup is the first statement inside the transaction.
      return work({ request: () => { throw new Error("unused"); } });
    },
  } as unknown as Database;
  const server = app(database, admin);
  try {
    // A missing reason is rejected by input validation, before the transaction.
    const noReason = await server.inject({ method: "POST", url: "/api/v1/admin/users/7/roles", payload: { roleCode: "Admin" } });
    assert.equal(noReason.statusCode, 400);
    assert.equal(opened, false);

    // A malformed user id never reaches the database either.
    for (const url of ["/api/v1/admin/users/0/roles", "/api/v1/admin/users/-3/roles"]) {
      const response = await server.inject({ method: "POST", url, payload: { roleCode: "Admin", reason: "cover" } });
      assert.equal(response.statusCode, 400, url);
    }
    assert.equal(opened, false);
  } finally { await server.close(); }
});

test("reading the roles of an account that does not exist reports 404", async () => {
  const database = {
    async query() { return { recordset: [] }; },
    async transaction() { throw new Error("Unexpected transaction"); },
  } as unknown as Database;
  const server = app(database, admin);
  try {
    const response = await server.inject({ method: "GET", url: "/api/v1/admin/users/7/roles" });
    assert.equal(response.statusCode, 404);
    assert.equal(response.json().code, "user_not_found");
  } finally { await server.close(); }
});

test("an account's roles are the primary role plus every unrevoked grant", async () => {
  const statements: string[] = [];
  const database = {
    async query(statement: string) {
      statements.push(statement);
      if (/FROM dbo\.users app_user/.test(statement)) {
        return { recordset: [{ role: "Engineer", row_version: Buffer.alloc(8) }] };
      }
      return { recordset: [{
        code: "Purchasing", name: "Purchasing", description: "Purchase requisitions",
        granted_at: "2026-09-15T00:00:00Z", granted_by_name: "Admin User", reason: "covers procurement",
      }] };
    },
    async transaction() { throw new Error("Unexpected transaction"); },
  } as unknown as Database;
  const server = app(database, admin);
  try {
    const response = await server.inject({ method: "GET", url: "/api/v1/admin/users/7/roles" });
    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.equal(body.primaryRole, "Engineer");
    assert.deepEqual(body.additional.map((role: { code: string }) => role.code), ["Purchasing"]);
    // A revoked grant must never be reported as held.
    assert.match(statements.join("\n"), /grant_row\.revoked_at IS NULL/);
  } finally { await server.close(); }
});

test("hasRole reads every role, and an actor without the field falls back to its primary role", () => {
  const engineer = { id: 1, role: "Engineer", roles: ["Engineer", "Purchasing"] } as CurrentUser;
  assert.equal(hasRole(engineer, "Purchasing"), true);
  assert.equal(hasRole(engineer, "Admin"), false);
  assert.equal(hasRole(engineer, "Admin", "Engineer"), true);

  // Actors rebuilt from a stored row carry only the primary role; they must not throw.
  const legacy = { id: 2, role: "Admin" } as CurrentUser;
  assert.deepEqual(rolesOf(legacy), ["Admin"]);
  assert.equal(hasRole(legacy, "Admin"), true);
  assert.equal(hasRole(legacy, "Purchasing"), false);
  assert.deepEqual(rolesOf({ role: "", roles: [] }), []);
});
