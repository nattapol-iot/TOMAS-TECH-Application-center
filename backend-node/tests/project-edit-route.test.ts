import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type { AppConfig } from "../src/config.js";
import type { Database } from "../src/db.js";
import { ApiError, registerErrorHandler } from "../src/errors.js";
import type { CurrentUserService } from "../src/users.js";
import { registerProjectRoutes } from "../src/routes/projects.js";

const ROW_VERSION = Buffer.alloc(8).toString("base64");
const config = { businessTimeZone: "Asia/Bangkok", documentStorage: {} } as unknown as AppConfig;

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
