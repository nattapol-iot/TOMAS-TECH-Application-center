import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type { Database } from "../src/db.js";
import { isReadOnlySql } from "../src/db.js";
import type { CurrentUserService } from "../src/users.js";
import { ApiError, registerErrorHandler } from "../src/errors.js";
import { ESTIMATE_CHANGES, registerRecordPresenceRoutes } from "../src/routes/record-presence.js";

type Captured = { queries: string[]; params: Array<Record<string, unknown>>; transactions: number; permissions: string[] };

function harness(options: { readOnly?: boolean; live?: boolean; deny?: boolean } = {}) {
  const captured: Captured = { queries: [], params: [], transactions: 0, permissions: [] };
  const cursor = Buffer.from("00000000000007d1", "hex");
  const database = {
    readOnly: options.readOnly === true,
    // The beat's own SQL runs against a real server in the integration test; here it is
    // enough to know whether one was attempted.
    async transaction() { captured.transactions += 1; },
    async query(text: string, bind?: (request: unknown) => void) {
      captured.queries.push(text);
      const params: Record<string, unknown> = {};
      const request = { input(name: string, _type: unknown, value: unknown) { params[name] = value; return request; } };
      bind?.(request);
      captured.params.push(params);
      const live = options.live !== false;
      if (text.includes("MIN_ACTIVE_ROWVERSION")) {
        return { recordsets: [
          [{ live, next_cursor: cursor, changed: 3 }],
          [{ name: "Chalermchai, T." }, { name: "Somchai" }],
          [{ user_id: 9, name: "Somchai", editing_key: "cost:412", last_at: new Date("2026-09-24T03:00:00Z") }],
        ] };
      }
      return { recordsets: [[{ live }], [{ user_id: 9, name: "Somchai", editing_key: null, last_at: new Date("2026-09-24T03:00:00Z") }]] };
    },
  } as unknown as Database;
  const users = {
    async demandPermission(_request: unknown, permission: string) {
      captured.permissions.push(permission);
      if (options.deny) throw new ApiError(403, "permission_denied", "Denied");
    },
    async required() { return { id: 7, name: "Me", permissions: [] }; },
  } as unknown as CurrentUserService;
  const app = Fastify();
  registerErrorHandler(app);
  registerRecordPresenceRoutes(app, database, users);
  return { app, captured };
}

test("the change window is taken from MIN_ACTIVE_ROWVERSION before any row is read", () => {
  const watermark = ESTIMATE_CHANGES.indexOf("DECLARE @next binary(8) = MIN_ACTIVE_ROWVERSION();");
  assert.ok(watermark >= 0, "the watermark comes from MIN_ACTIVE_ROWVERSION()");
  for (const table of ["dbo.estimates", "dbo.cost_items", "dbo.manhour_lines", "dbo.expense_lines", "dbo.other_cost_lines", "dbo.estimate_assignments"]) {
    const read = ESTIMATE_CHANGES.indexOf(`FROM ${table}`);
    assert.ok(read > watermark, `${table} is read after the watermark`);
  }
  // @@DBTS is the high-water mark. Handing it back would skip a write that took its
  // rowversion before the read and committed after it -- for good.
  assert.doesNotMatch(ESTIMATE_CHANGES, /@@DBTS/);
});

test("every table is read over the same half-open window, deletions included", () => {
  const ranges = ESTIMATE_CHANGES.match(/row_version >= @since AND (?:[a-z]+\.)?row_version < @next/g) ?? [];
  assert.equal(ranges.length, 6, "estimate header, four line tables and assignments");
  // A line is removed by setting deleted_at, which moves its rowversion. Filtering on
  // deleted_at would make a deletion the one change nobody else ever sees.
  // (Whether the estimate itself is live is a separate question, asked afterwards.)
  const counting = ESTIMATE_CHANGES.slice(ESTIMATE_CHANGES.indexOf("INSERT @changed"));
  assert.doesNotMatch(counting.slice(0, counting.indexOf(";")), /deleted_at/);
});

test("the change feed is a pure read, so a read-only deployment still stays current", () => {
  assert.equal(isReadOnlySql(ESTIMATE_CHANGES), true);
});

test("a caller without the record's read permission reaches no SQL at all", async () => {
  const { app, captured } = harness({ deny: true });
  for (const [method, url] of [["POST", "/api/v1/estimates/5/sync"], ["POST", "/api/v1/inquiries/5/presence"],
    ["DELETE", "/api/v1/estimates/5/presence"], ["DELETE", "/api/v1/inquiries/5/presence"]] as const) {
    const response = await app.inject({ method, url, ...(method === "POST" ? { payload: {} } : {}) });
    assert.equal(response.statusCode, 403, `${method} ${url}`);
  }
  assert.deepEqual(captured.queries, []);
  assert.equal(captured.transactions, 0);
  // No wider than the record's own read route.
  assert.deepEqual([...new Set(captured.permissions)].sort(), ["estimate.read", "inquiry.read"]);
});

test("a beat reports the cursor, what changed, who changed it and who else is here", async () => {
  const { app, captured } = harness();
  const response = await app.inject({ method: "POST", url: "/api/v1/estimates/5/sync", payload: { since: "00000000000007d0", editingKey: "cost:412" } });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    cursor: "00000000000007d1",
    changed: 3,
    // A name is free text; a comma inside one must not split it into two people.
    changedBy: ["Chalermchai, T.", "Somchai"],
    viewers: [{ userId: 9, name: "Somchai", editingKey: "cost:412", lastAt: "2026-09-24T03:00:00.000Z" }],
  });
  assert.equal(captured.transactions, 1, "the caller's presence is recorded");
  assert.deepEqual(captured.params[0]!.since, Buffer.from("00000000000007d0", "hex"));
  assert.equal(captured.params[0]!.entity, 5);
  assert.equal(captured.params[0]!.actor, 7);
});

test("with no cursor yet the window is empty and the caller only learns where to start", async () => {
  const { app, captured } = harness();
  const response = await app.inject({ method: "POST", url: "/api/v1/estimates/5/sync", payload: {} });
  assert.equal(response.statusCode, 200);
  // Every rowversion is below 0xFFFFFFFFFFFFFFFF, so nothing is reported as "since".
  assert.deepEqual(captured.params[0]!.since, Buffer.alloc(8, 0xff));
});

test("a read-only connection skips the presence write but still answers", async () => {
  const { app, captured } = harness({ readOnly: true });
  const response = await app.inject({ method: "POST", url: "/api/v1/estimates/5/sync", payload: { since: "00000000000007d0" } });
  assert.equal(response.statusCode, 200);
  assert.equal(captured.transactions, 0);
  assert.equal(response.json().changed, 3);
  const leave = await app.inject({ method: "DELETE", url: "/api/v1/estimates/5/presence" });
  assert.equal(leave.statusCode, 204);
  assert.equal(captured.transactions, 0);
});

test("a malformed cursor or editing key is refused before SQL", async () => {
  const { app, captured } = harness();
  for (const payload of [{ since: "7d0" }, { since: "zz00000000000000" }, { since: 2000 },
    { editingKey: "<img src=x>" }, { editingKey: "cost:" }, { editingKey: "cost:1;DROP" }]) {
    const response = await app.inject({ method: "POST", url: "/api/v1/estimates/5/sync", payload });
    assert.equal(response.statusCode, 400, JSON.stringify(payload));
  }
  assert.deepEqual(captured.queries, []);
  assert.equal(captured.transactions, 0);
});

test("a record that is gone answers 404 rather than an empty room", async () => {
  const { app } = harness({ live: false });
  assert.equal((await app.inject({ method: "POST", url: "/api/v1/estimates/5/sync", payload: {} })).statusCode, 404);
  assert.equal((await app.inject({ method: "POST", url: "/api/v1/inquiries/5/presence", payload: {} })).statusCode, 404);
});

test("an inquiry beat answers who else has it open", async () => {
  const { app, captured } = harness();
  const response = await app.inject({ method: "POST", url: "/api/v1/inquiries/5/presence", payload: {} });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { viewers: [{ userId: 9, name: "Somchai", editingKey: null, lastAt: "2026-09-24T03:00:00.000Z" }] });
  assert.equal(captured.params[0]!.type, "Inquiry");
});
