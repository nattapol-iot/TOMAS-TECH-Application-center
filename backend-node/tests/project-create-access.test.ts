import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type { AppConfig } from "../src/config.js";
import type { Database } from "../src/db.js";
import { ApiError, registerErrorHandler } from "../src/errors.js";
import { registerProjectRoutes } from "../src/routes/projects.js";
import type { CurrentUser } from "../src/types.js";
import type { CurrentUserService } from "../src/users.js";

/* Owner decision 2026-11-25: the Application team creates a project without an estimate without project.write (their
   accounts are mostly Engineers, who do not hold it). A project from an approved estimate still needs project.write. */

const config = { businessTimeZone: "Asia/Bangkok", documentStorage: {} } as unknown as AppConfig;
const user = (roles: string[], department: string) => ({ id: 9, name: "Creator", roles, role: roles[0], department }) as unknown as CurrentUser;
const standaloneBody = {
  withoutEstimate: true,
  customerId: 3,
  projectName: "Line monitoring app",
  projectType: "Software",
  projectNumber: "PJ260099",
  purchaseOrderNumber: "PO-9",
  purchaseOrderDate: "2026-10-01",
  managerId: 5,
  leadEngineerId: 6,
  startDate: "2026-10-01",
  targetDelivery: "2026-12-01",
  site: "Factory",
};

/** The actor holds the given permissions; the create reaches its transaction (counted) only when it is allowed. */
async function call(actor: CurrentUser, permissions: string[], request: { method: "GET" | "POST"; url: string; payload?: Record<string, unknown> }) {
  let transactions = 0;
  const database = {
    async transaction() {
      transactions += 1;
      throw new Error("stop at the write");
    },
    async query(statement: string, bind?: (r: { input: (name: string, type: unknown, value: unknown) => void }) => void) {
      const inputs: Record<string, unknown> = {};
      bind?.({
        input: (name, _type, value) => {
          inputs[name] = value;
        },
      });
      if (statement.includes("FROM dbo.user_effective_permissions WHERE user_id=@user_id AND code=@permission")) return { recordset: [{ allowed: permissions.includes(String(inputs.permission)) }] };
      return { recordset: [], recordsets: [[], []] };
    },
  } as unknown as Database;
  const users = {
    async demandPermission(_request: unknown, permission: string) {
      if (!permissions.includes(permission)) throw new ApiError(403, "permission_denied", `Permission '${permission}' is required.`);
    },
    async required() {
      return actor;
    },
  } as unknown as CurrentUserService;
  const server = Fastify();
  registerErrorHandler(server);
  registerProjectRoutes(server, config, database, users);
  const response = await server.inject(request);
  await server.close();
  return { response, transactions };
}

const engineer = ["project.read", "estimate.read", "schedule.read", "schedule.progress"];

test("an Application engineer without project.write creates a project without an estimate", async () => {
  const { response, transactions } = await call(user(["Engineer"], "Application Engineer Dept. 2G"), engineer, { method: "POST", url: "/api/v1/projects", payload: standaloneBody });
  assert.notEqual(response.statusCode, 403, response.body);
  assert.equal(transactions, 1, "the create went on to write the project");
});

test("an Application engineer without project.write is refused a project from an estimate", async () => {
  const { response, transactions } = await call(user(["Engineer"], "Application Engineer Dept."), engineer, {
    method: "POST",
    url: "/api/v1/projects",
    payload: { ...standaloneBody, withoutEstimate: undefined, estimateId: 41 },
  });
  assert.equal(response.statusCode, 403);
  assert.match(response.body, /project\.write/);
  assert.equal(transactions, 0);
});

test("an engineer outside the Application team still needs project.write", async () => {
  const { response, transactions } = await call(user(["Engineer"], "IoT Engineer Dept."), engineer, { method: "POST", url: "/api/v1/projects", payload: standaloneBody });
  assert.equal(response.statusCode, 403);
  assert.match(response.body, /project\.write/);
  assert.equal(transactions, 0);
});

test("a Viewer in the Application team stays read-only", async () => {
  const { response } = await call(user(["Viewer"], "Application Engineer Dept."), ["project.read"], { method: "POST", url: "/api/v1/projects", payload: standaloneBody });
  assert.equal(response.statusCode, 403);
});

test("the creation options open to the Application team, without estimates to start from", async () => {
  const { response } = await call(user(["Engineer"], "Application Engineer Dept."), engineer, { method: "GET", url: "/api/v1/projects/creation-options" });
  assert.equal(response.statusCode, 200, response.body);
  const body = response.json();
  assert.equal(body.canCreateWithoutEstimate, true);
  assert.equal(body.canCreateFromEstimate, false);
  const refused = await call(user(["Engineer"], "Mechanical Engineer Dept."), engineer, { method: "GET", url: "/api/v1/projects/creation-options" });
  assert.equal(refused.response.statusCode, 403);
});
