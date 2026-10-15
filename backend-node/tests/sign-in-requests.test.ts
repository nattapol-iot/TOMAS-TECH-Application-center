import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import Fastify from "fastify";
import type { Database } from "../src/db.js";
import { registerErrorHandler } from "../src/errors.js";
import { registerSignInRequestRoutes, SIGN_IN_REQUESTS_SQL, UNLINKED_ACCOUNTS_SQL } from "../src/routes/sign-in-requests.js";
import type { CurrentUserService } from "../src/users.js";

function server(options: { denied?: boolean } = {}) {
  const demanded: string[] = [];
  const statements: { text: string; inputs: Record<string, unknown> }[] = [];
  const users = {
    demandPermission: async (_request: unknown, permission: string) => {
      demanded.push(permission);
      if (options.denied) throw Object.assign(new Error("Denied"), { statusCode: 403 });
    },
    required: async () => ({ id: 1, roles: ["Admin"], role: "Admin" }),
  };
  const database = {
    async query(text: string, bind?: (request: { input(name: string, type: unknown, value: unknown): unknown }) => void) {
      const inputs: Record<string, unknown> = {};
      const request = { input(name: string, _type: unknown, value: unknown) { inputs[name] = value; return request; } };
      bind?.(request);
      statements.push({ text, inputs });
      if (text === UNLINKED_ACCOUNTS_SQL) return { recordset: [
        { id: "41", email: "soraya.n@tomastc.com", name: "Soraya Norasing", role: "Admin", department: "",
          created_at: new Date("2026-09-20T03:00:00Z"), last_used_at: new Date("2026-10-15T03:23:00Z"), employee_id: null, employee_no: null },
        { id: 52, email: "old.mail@tomastc.com", name: "Old Mail", role: "Engineer", department: null,
          created_at: new Date("2026-09-01T03:00:00Z"), last_used_at: null, employee_id: "7", employee_no: 1007 },
      ] };
      return { recordset: [
        { subject: "sub-1", email: "new.person@tomastc.com", name: "New Person", username: "new.person", attempts: 3,
          first_attempt_at: new Date("2026-10-14T01:00:00Z"), last_attempt_at: new Date("2026-10-15T02:00:00Z"), status: "new" },
        { subject: "sub-2", email: "moved@tomastc.com", name: "Moved Person", username: "moved", attempts: 1,
          first_attempt_at: new Date("2026-10-15T01:00:00Z"), last_attempt_at: new Date("2026-10-15T01:00:00Z"), status: "linkedElsewhere" },
      ] };
    },
  };
  const app = Fastify();
  registerErrorHandler(app);
  registerSignInRequestRoutes(app, database as unknown as Database, users as unknown as CurrentUserService);
  return { app, demanded, statements };
}

test("only those who may add employees see who is waiting to sign in", async () => {
  const { app, demanded, statements } = server({ denied: true });
  try {
    assert.equal((await app.inject({ method: "GET", url: "/api/v1/master/sign-in-requests" })).statusCode, 403);
    assert.equal((await app.inject({ method: "DELETE", url: "/api/v1/master/sign-in-requests/sub-1" })).statusCode, 403);
    assert.equal((await app.inject({ method: "GET", url: "/api/v1/master/unlinked-accounts" })).statusCode, 403);
    assert.deepEqual(demanded, ["master.write", "master.write", "master.write"]);
    assert.equal(statements.length, 0);
  } finally {
    await app.close();
  }
});

test("each waiting sign-in says whether to add the employee, ask for a new sign-in, or use the other sign-in", async () => {
  const { app } = server();
  try {
    const response = await app.inject({ method: "GET", url: "/api/v1/master/sign-in-requests" });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), [
      { subject: "sub-1", email: "new.person@tomastc.com", name: "New Person", username: "new.person", attempts: 3,
        firstAttemptAt: "2026-10-14T01:00:00.000Z", lastAttemptAt: "2026-10-15T02:00:00.000Z", status: "new" },
      { subject: "sub-2", email: "moved@tomastc.com", name: "Moved Person", username: "moved", attempts: 1,
        firstAttemptAt: "2026-10-15T01:00:00.000Z", lastAttemptAt: "2026-10-15T01:00:00.000Z", status: "linkedElsewhere" },
    ]);
  } finally {
    await app.close();
  }
  // A sign-in that has since linked is not listed; an email whose account already belongs to another TMT ID
  // sign-in (not a team-test leftover) is linkedElsewhere; an email with a free account is registered.
  assert.match(SIGN_IN_REQUESTS_SQL, /WHERE NOT EXISTS\(SELECT 1 FROM dbo\.users u WHERE u\.entra_object_id=r\.subject AND u\.deleted_at IS NULL\)/);
  assert.match(SIGN_IN_REQUESTS_SQL, /u\.entra_object_id<>r\.subject AND u\.entra_object_id NOT LIKE N'team-test:%'\) THEN N'linkedElsewhere'/);
  assert.match(SIGN_IN_REQUESTS_SQL, /WHEN EXISTS\(SELECT 1 FROM dbo\.users u WHERE u\.email=r\.email AND u\.deleted_at IS NULL\) THEN N'registered'/);
});

test("a request is dismissed by its subject, and a malformed subject is refused", async () => {
  const { app, statements } = server();
  try {
    assert.equal((await app.inject({ method: "DELETE", url: "/api/v1/master/sign-in-requests/sub-1" })).statusCode, 204);
    assert.equal(statements.length, 1);
    assert.equal(statements[0]!.text, "DELETE FROM dbo.sign_in_requests WHERE subject=@subject;");
    assert.deepEqual(statements[0]!.inputs, { subject: "sub-1" });
    assert.equal((await app.inject({ method: "DELETE", url: `/api/v1/master/sign-in-requests/${"x".repeat(65)}` })).statusCode, 400);
    assert.equal(statements.length, 1);
  } finally {
    await app.close();
  }
});

test("accounts no employee record points at are listed with their role, last use and any employee that has the email", async () => {
  const { app } = server();
  try {
    const response = await app.inject({ method: "GET", url: "/api/v1/master/unlinked-accounts" });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), [
      { userId: 41, email: "soraya.n@tomastc.com", name: "Soraya Norasing", role: "Admin", department: "",
        createdAt: "2026-09-20T03:00:00.000Z", lastUsedAt: "2026-10-15T03:23:00.000Z", employeeId: null, employeeNo: null },
      { userId: 52, email: "old.mail@tomastc.com", name: "Old Mail", role: "Engineer", department: "",
        createdAt: "2026-09-01T03:00:00.000Z", lastUsedAt: null, employeeId: 7, employeeNo: 1007 },
    ]);
  } finally {
    await app.close();
  }
  // Active accounts only, and only those no active employee points at; Admin accounts first.
  assert.match(UNLINKED_ACCOUNTS_SQL, /WHERE u\.is_active=1 AND u\.deleted_at IS NULL/);
  assert.match(UNLINKED_ACCOUNTS_SQL, /AND NOT EXISTS\(SELECT 1 FROM dbo\.employees linked WHERE linked\.user_id=u\.id AND linked\.is_active=1 AND linked\.deleted_at IS NULL\)/);
  assert.match(UNLINKED_ACCOUNTS_SQL, /LEFT JOIN dbo\.employees employee ON employee\.email=u\.email AND employee\.is_active=1 AND employee\.deleted_at IS NULL/);
  assert.match(UNLINKED_ACCOUNTS_SQL, /ORDER BY CASE WHEN r\.code=N'Admin' THEN 0 ELSE 1 END/);
});

test("migration 079 keeps one request per TMT ID subject and grants the API what it uses", () => {
  const migration = readFileSync(new URL("../../database/migrations/079_sign_in_requests.sql", import.meta.url), "utf8");
  assert.match(migration, /subject\s+nvarchar\(64\)\s+NOT NULL CONSTRAINT PK_sign_in_requests PRIMARY KEY/);
  assert.match(migration, /GRANT SELECT, INSERT, UPDATE, DELETE ON OBJECT::dbo\.sign_in_requests TO \[iot_team_app_role\]/);
  assert.match(migration, /VALUES \(79,N'Sign-in requests from unregistered people'\)/);
});
