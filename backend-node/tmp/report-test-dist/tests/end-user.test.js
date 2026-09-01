import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import sql from "mssql/msnodesqlv8.js";
import { ApiError, registerErrorHandler } from "../src/errors.js";
import { demandEditableEndUser, endUserCustomerId, registerEndUserUpdateRoute } from "../src/end-user.js";
test("end user distinguishes omitted inheritance, explicit clearing and positive numeric identity", () => {
    assert.equal(endUserCustomerId(undefined), undefined);
    assert.equal(endUserCustomerId(null), null);
    assert.equal(endUserCustomerId(42), 42);
    assert.equal(endUserCustomerId(null, true), null);
    for (const value of [0, -1, 1.5, "42", "", false, true, {}, [], Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
        assert.throws(() => endUserCustomerId(value), (error) => error instanceof ApiError && error.statusCode === 400);
    }
    assert.throws(() => endUserCustomerId(undefined, true));
});
test("end user changes reject closed records while planning and approved records remain editable", () => {
    for (const status of ["Closed", "Cancelled", "Rejected"])
        assert.throws(() => demandEditableEndUser(status), (error) => error instanceof ApiError && error.statusCode === 409);
    for (const status of ["New", "Approved", "Planning", "Design", "On Hold"])
        assert.doesNotThrow(() => demandEditableEndUser(status));
});
test("end user updates require explicit write permission before any database access", async () => {
    const calls = [];
    const database = { async transaction() { throw new Error("Unexpected database access"); } };
    const users = { async demandPermission(_request, permission) { calls.push(permission); throw new ApiError(403, "permission_denied", "Denied"); } };
    const app = Fastify();
    registerErrorHandler(app);
    registerEndUserUpdateRoute(app, database, users, "Inquiry");
    registerEndUserUpdateRoute(app, database, users, "Project");
    try {
        for (const entity of ["inquiries", "projects"]) {
            const response = await app.inject({ method: "PUT", url: `/api/v1/${entity}/1/end-user`, payload: { endUserCustomerId: 42, rowVersion: "AAAAAAAAAAE=" } });
            assert.equal(response.statusCode, 403);
            assert.equal(response.json().code, "permission_denied");
        }
        assert.deepEqual(calls, ["inquiry.write", "project.write"]);
    }
    finally {
        await app.close();
    }
});
test("end user update rejects malformed body and missing rowVersion before transaction", async () => {
    let touched = false;
    const database = { async transaction() { touched = true; throw new Error("Unexpected database access"); } };
    const users = { async demandPermission() { }, async required() { return { id: 5 }; } };
    const app = Fastify();
    registerErrorHandler(app);
    registerEndUserUpdateRoute(app, database, users, "Inquiry");
    try {
        for (const payload of [{ rowVersion: "AAAAAAAAAAE=" }, { endUserCustomerId: null }, { endUserCustomerId: "42", rowVersion: "AAAAAAAAAAE=" }]) {
            assert.equal((await app.inject({ method: "PUT", url: "/api/v1/inquiries/1/end-user", payload })).statusCode, 400);
        }
        assert.equal(touched, false);
    }
    finally {
        await app.close();
    }
});
test("a writer outside project scope is denied before end user lookup or update", async (t) => {
    const statements = [];
    t.mock.method(sql.Request.prototype, "query", async function (statement) {
        statements.push(statement);
        return { recordset: [{ allowed: false }] };
    });
    const database = { async transaction(action) { return action({}); } };
    const users = { async demandPermission() { }, async required() { return { id: 5, role: "Engineer" }; } };
    const app = Fastify();
    registerErrorHandler(app);
    registerEndUserUpdateRoute(app, database, users, "Project");
    try {
        const response = await app.inject({ method: "PUT", url: "/api/v1/projects/1/end-user", payload: { endUserCustomerId: 42, rowVersion: "AAAAAAAAAAE=" } });
        assert.equal(response.statusCode, 403);
        assert.equal(response.json().code, "project_scope_forbidden");
        assert.equal(statements.length, 1);
        assert.match(statements[0], /project_members/);
    }
    finally {
        await app.close();
    }
});
test("stale end user update cannot validate references or write", async (t) => {
    const statements = [];
    t.mock.method(sql.Request.prototype, "query", async function (statement) {
        statements.push(statement);
        return { recordset: [{ number: "INQ-TEST", status: "New", row_version: Buffer.from("0000000000000002", "hex") }] };
    });
    const database = { async transaction(action) { return action({}); } };
    const users = { async demandPermission() { }, async required() { return { id: 5, role: "Sales Engineer" }; } };
    const app = Fastify();
    registerErrorHandler(app);
    registerEndUserUpdateRoute(app, database, users, "Inquiry");
    try {
        const response = await app.inject({ method: "PUT", url: "/api/v1/inquiries/1/end-user", payload: { endUserCustomerId: 42, rowVersion: "AAAAAAAAAAE=" } });
        assert.equal(response.statusCode, 409);
        assert.equal(response.json().code, "concurrency_conflict");
        assert.equal(statements.length, 1);
        assert.match(statements[0], /UPDLOCK,HOLDLOCK/);
    }
    finally {
        await app.close();
    }
});
//# sourceMappingURL=end-user.test.js.map