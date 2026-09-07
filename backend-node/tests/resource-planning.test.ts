import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { registerResourcePlanningRoutes } from "../src/routes/resource-planning.js";
import type { Database } from "../src/db.js";
import type { CurrentUserService } from "../src/users.js";

test("resource planning requires server-side read permission", async () => {
  const app = Fastify();
  const users = {
    demandPermission: async (_request: unknown, p: string) => {
      assert.equal(p, "schedule.read");
      throw Object.assign(new Error("Denied"), { statusCode: 403 });
    },
  };
  registerResourcePlanningRoutes(
    app,
    {} as Database,
    users as unknown as CurrentUserService,
  );
  const r = await app.inject({
    method: "GET",
    url: "/api/v1/resource-planning",
  });
  assert.equal(r.statusCode, 403);
  await app.close();
});
test("source planning requires schedule.plan AND source write permission before database mutation", async () => {
  const calls: string[] = [];
  const app = Fastify();
  const users = {
    required: async () => ({ id: 1 }),
    demandPermission: async (_request: unknown, p: string) => {
      calls.push(p);
      if (p === "inquiry.write")
        throw Object.assign(new Error("Denied"), { statusCode: 403 });
    },
  };
  registerResourcePlanningRoutes(
    app,
    {} as Database,
    users as unknown as CurrentUserService,
  );
  const r = await app.inject({
    method: "PUT",
    url: "/api/v1/resource-planning/Inquiry/1",
    payload: { manDays: 5, start: "2026-09-07", end: "2026-09-11" },
  });
  assert.equal(r.statusCode, 403);
  assert.deepEqual(calls, ["schedule.plan", "inquiry.write"]);
  await app.close();
});
test("capacity and effort inputs reject invalid amounts, dates and arbitrary table names", async () => {
  const app = Fastify();
  app.setErrorHandler((e, _r, reply) =>
    reply
      .code((e as { statusCode?: number }).statusCode ?? 500)
      .send({ error: "rejected" }),
  );
  const users = {
    required: async () => ({ id: 1 }),
    demandPermission: async () => {},
  };
  const db = {
    transaction: () => {
      throw new Error("Invalid input reached database");
    },
  };
  registerResourcePlanningRoutes(
    app,
    db as unknown as Database,
    users as unknown as CurrentUserService,
  );
  for (const [path, payload] of [
    ["capacity", { daysPerWeek: 6 }],
    ["capacity", { daysPerWeek: -1 }],
    ["capacity", { daysPerWeek: 1.234 }],
    ["Inquiry", { start: "2026-09-11", end: "2026-09-07", manDays: 5 }],
    ["dbo.users", { manDays: 1 }],
  ] as const) {
    const r = await app.inject({
      method: "PUT",
      url: "/api/v1/resource-planning/" + path + "/1",
      payload,
    });
    assert.equal(r.statusCode, 400);
  }
  await app.close();
});
