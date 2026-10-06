import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type { Database } from "../src/db.js";
import { ApiError, registerErrorHandler } from "../src/errors.js";
import { parseTemplate, registerScheduleTemplateRoutes } from "../src/routes/schedule-templates.js";
import type { CurrentUserService } from "../src/users.js";

const rejects = (body: unknown, pattern: RegExp) => assert.throws(() => parseTemplate(body),
  (error: unknown) => error instanceof ApiError && error.statusCode === 400 && pattern.test(error.message));

test("a master schedule keeps its rows in order, with days or with only a name", () => {
  assert.deepEqual(parseTemplate({ name: " Line upgrade ", rows: [
    { name: " Kick-off ", startOffsetDays: 0, durationDays: 1 },
    { name: "Go Live" },
  ] }), { name: "Line upgrade", rows: [
    { name: "Kick-off", startOffsetDays: 0, durationDays: 1 },
    { name: "Go Live", startOffsetDays: null, durationDays: null },
  ] });
});

test("each row names what is wrong with it", () => {
  rejects({ name: "", rows: [{ name: "A" }] }, /Template name is required/);
  rejects({ name: "X", rows: [] }, /at least one row/);
  rejects({ name: "X", rows: Array.from({ length: 51 }, () => ({ name: "A" })) }, /more than 50 rows/);
  rejects({ name: "X", rows: [{ name: "" }] }, /Row 1 name is required/);
  rejects({ name: "X", rows: [{ name: "A", startOffsetDays: 3 }] }, /Row 1 needs both a start day and a duration, or neither/);
  rejects({ name: "X", rows: [{ name: "A", startOffsetDays: -1, durationDays: 2 }] }, /Row 1 start day/);
  rejects({ name: "X", rows: [{ name: "A", startOffsetDays: 0, durationDays: 0 }] }, /Row 1 duration/);
  rejects({ name: "X", rows: [{ name: "A", startOffsetDays: 1.5, durationDays: 2 }] }, /whole number of days/);
});

function routes(database: Database, users: CurrentUserService) {
  const instance = Fastify();
  registerErrorHandler(instance);
  registerScheduleTemplateRoutes(instance, database, users);
  return instance;
}
const untouchable = (onTouch: () => void) => ({
  async query() { onTouch(); throw new Error("Unexpected query"); },
  async transaction() { onTouch(); throw new Error("Unexpected transaction"); },
}) as unknown as Database;
const rows = [{ name: "Kick-off" }];

test("changing a master schedule needs schedule.plan, refused before any database work", async () => {
  let touched = false;
  const seen: string[] = [];
  const users = {
    async demandPermission(_request: unknown, permission: string) { seen.push(permission); throw new ApiError(403, "permission_denied", "Denied"); },
    async required() { throw new Error("Unexpected actor lookup"); },
  } as unknown as CurrentUserService;
  const server = routes(untouchable(() => { touched = true; }), users);
  try {
    for (const call of [
      { method: "POST" as const, url: "/api/v1/schedule-templates", payload: { name: "X", rows } },
      { method: "PUT" as const, url: "/api/v1/schedule-templates/1", payload: { name: "X", rows, rowVersion: "AAAAAAAAAAA=" } },
      { method: "DELETE" as const, url: "/api/v1/schedule-templates/1", payload: { rowVersion: "AAAAAAAAAAA=" } },
    ]) {
      const response = await server.inject(call);
      assert.equal(response.statusCode, 403, `${call.method} ${call.url}`);
    }
    assert.deepEqual(seen, ["schedule.plan", "schedule.plan", "schedule.plan"]);
    assert.equal(touched, false);
  } finally { await server.close(); }
});

test("deleting a master schedule names the version it saw, checked before the transaction opens", async () => {
  let touched = false;
  const users = {
    async demandPermission() {},
    async required() { return { id: 1 }; },
  } as unknown as CurrentUserService;
  const server = routes(untouchable(() => { touched = true; }), users);
  try {
    assert.equal((await server.inject({ method: "DELETE", url: "/api/v1/schedule-templates/1" })).statusCode, 400);
    const blank = await server.inject({ method: "DELETE", url: "/api/v1/schedule-templates/1", payload: {} });
    assert.equal(blank.statusCode, 400);
    assert.equal(touched, false);
  } finally { await server.close(); }
});

test("the template list stays open to every signed-in user", async () => {
  const seen: string[] = [];
  const users = {
    async demandPermission(_request: unknown, permission: string) { seen.push(permission); },
    async required() { return { id: 1 }; },
  } as unknown as CurrentUserService;
  const database = {
    async query() { return { recordsets: [[], []] }; },
  } as unknown as Database;
  const server = routes(database, users);
  try {
    const response = await server.inject({ method: "GET", url: "/api/v1/schedule-templates" });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), []);
    assert.deepEqual(seen, []);
  } finally { await server.close(); }
});
