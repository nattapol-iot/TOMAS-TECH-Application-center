import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import Fastify from "fastify";
import sql from "mssql";
import type { Transaction } from "mssql";
import type { AppConfig } from "../src/config.js";
import type { Database } from "../src/db.js";
import { ApiError, registerErrorHandler } from "../src/errors.js";
import { registerProjectDocumentRoutes } from "../src/routes/project-documents.js";
import type { CurrentUserService } from "../src/users.js";

const PROJECT_ID = 7, DOCUMENT_ID = 31;
const VERSION = Buffer.from("0000000000000a01", "hex");
const config = { documentStorage: { maxFileSizeBytes: 1024 } } as unknown as AppConfig;
type Params = Record<string, unknown>;

/** Fakes mssql Requests inside the route's transaction; `procedure` answers the EXECUTE. */
function installSqlMock(t: TestContext, procedure: (params: Params) => void) {
  const calls: Array<{ statement: string; params: Params; execute: boolean }> = [];
  const bags = new WeakMap<object, Params>();
  t.mock.method(sql.Request.prototype, "input", function (this: object, name: string, ...rest: unknown[]) {
    const bag = bags.get(this) ?? {}; bag[name] = rest.length > 1 ? rest[1] : rest[0]; bags.set(this, bag); return this;
  });
  t.mock.method(sql.Request.prototype, "query", async function (this: object, statement: string) {
    calls.push({ statement, params: { ...(bags.get(this) ?? {}) }, execute: false });
    if (statement.includes("SELECT d.name,d.folder_code,p.project_no FROM dbo.project_docs")) return { recordset: [{ name: "wrong.pdf", folder_code: "02", project_no: "P-26-007" }] };
    return { recordset: [], rowsAffected: [1] };
  });
  t.mock.method(sql.Request.prototype, "execute", async function (this: object, name: string) {
    const params = { ...(bags.get(this) ?? {}) }; calls.push({ statement: name, params, execute: true });
    procedure(params);
    return { recordset: [], rowsAffected: [1] };
  });
  return calls;
}

function harness(options: { denied?: boolean } = {}) {
  const app = Fastify();
  registerErrorHandler(app);
  const transactions: string[] = [];
  let databaseTouched = false;
  const database = {
    transaction: async <T>(work: (tx: Transaction) => Promise<T>) => {
      databaseTouched = true;
      try { const value = await work({} as Transaction); transactions.push("committed"); return value; }
      catch (error) { transactions.push("rolled-back"); throw error; }
    },
    // demandProjectScope reads through database.query.
    query: async () => { databaseTouched = true; return { recordset: [{ allowed: true }] }; },
  } as unknown as Database;
  const users = {
    demandPermission: async () => { if (options.denied) throw new ApiError(403, "permission_denied", "Denied"); },
    required: async () => ({ id: 12, role: "Engineer", name: "Uploader" }),
  } as unknown as CurrentUserService;
  registerProjectDocumentRoutes(app, config, database, users);
  return { app, transactions, touched: () => databaseTouched };
}

const url = `/api/v1/projects/${PROJECT_ID}/documents/${DOCUMENT_ID}`;
const payload = { rowVersion: VERSION.toString("base64"), reason: "Uploaded to the wrong project" };

test("withdrawing a document needs project.write and is refused before any database work", async () => {
  const { app, touched } = harness({ denied: true });
  try {
    const response = await app.inject({ method: "DELETE", url, payload });
    assert.equal(response.statusCode, 403);
    assert.equal(touched(), false);
  } finally { await app.close(); }
});

test("a withdrawal runs dbo.withdraw_project_document with the expected version and audits the reason", async (t) => {
  const { app, transactions } = harness();
  const calls = installSqlMock(t, () => {});
  try {
    const response = await app.inject({ method: "DELETE", url, payload });
    assert.equal(response.statusCode, 200, response.body);
    assert.deepEqual(response.json(), { id: DOCUMENT_ID, withdrawn: true });
    assert.deepEqual(transactions, ["committed"]);
    const procedure = calls.find((call) => call.execute)!;
    assert.equal(procedure.statement, "dbo.withdraw_project_document");
    assert.equal(procedure.params.document_id, DOCUMENT_ID);
    assert.equal(procedure.params.project_id, PROJECT_ID);
    assert.equal(procedure.params.actor, 12);
    assert.deepEqual(procedure.params.expected_row_version, VERSION);
    // The row and the file stay; only the audit trail and the procedure touch the database.
    assert.equal(calls.some((call) => /\bUPDATE dbo\.project_docs|\bDELETE FROM dbo\.project_docs/.test(call.statement)), false);
    assert.ok(calls.some((call) => call.statement.includes("audit") && JSON.stringify(call.params).includes("Uploaded to the wrong project")), "the reason is audited");
  } finally { await app.close(); }
});

test("procedure refusals become clear 4xx answers and roll back", async (t) => {
  const cases: Array<[number, number, string]> = [
    [51694, 409, "document_used_for_signing"], [51693, 403, "document_withdraw_forbidden"],
    [51692, 409, "concurrency_conflict"], [51691, 404, "document_not_found"],
  ];
  for (const [number, status, code] of cases) {
    await t.test(String(number), async (sub) => {
      const { app, transactions } = harness();
      installSqlMock(sub, () => { throw Object.assign(new sql.RequestError("procedure THROW", "EREQUEST"), { number }); });
      try {
        const response = await app.inject({ method: "DELETE", url, payload });
        assert.equal(response.statusCode, status, response.body);
        assert.equal(response.json().code, code);
        assert.deepEqual(transactions, ["rolled-back"]);
      } finally { await app.close(); }
    });
  }
});

test("a withdrawal needs a reason and the row version it was shown", async () => {
  const { app } = harness();
  try {
    assert.equal((await app.inject({ method: "DELETE", url, payload: { rowVersion: payload.rowVersion } })).statusCode, 400);
    assert.equal((await app.inject({ method: "DELETE", url, payload: { reason: "x" } })).statusCode, 400);
  } finally { await app.close(); }
});

test("the document list offers Withdraw only where the procedure would allow it", async () => {
  for (const [actor, elevated] of [[{ id: 12, role: "Engineer" }, false], [{ id: 40, role: "Engineer", roles: ["Engineer", "Engineering Manager"] }, true]] as const) {
    const app = Fastify();
    registerErrorHandler(app);
    const statements: Array<{ text: string; params: Params }> = [];
    const database = {
      query: async (text: string, bind?: (request: unknown) => void) => {
        const params: Params = {};
        const request = { input(name: string, ...rest: unknown[]) { params[name] = rest.length > 1 ? rest[1] : rest[0]; return request; } };
        bind?.(request);
        statements.push({ text, params });
        if (!text.includes("FROM dbo.project_docs d")) return { recordset: [{ allowed: true }] };
        return { recordset: [
          { id: 1, name: "a.pdf", can_withdraw: true, row_version: VERSION },
          { id: 2, name: "b.pdf", can_withdraw: false, row_version: VERSION },
        ] };
      },
    } as unknown as Database;
    const users = { demandPermission: async () => {}, required: async () => actor } as unknown as CurrentUserService;
    registerProjectDocumentRoutes(app, config, database, users);
    try {
      const response = await app.inject({ method: "GET", url: `/api/v1/projects/${PROJECT_ID}/documents` });
      assert.equal(response.statusCode, 200, response.body);
      assert.deepEqual(response.json().map((item: { id: number; canWithdraw: boolean }) => [item.id, item.canWithdraw]), [[1, true], [2, false]]);
      const list = statements.find((statement) => statement.text.includes("FROM dbo.project_docs d"))!;
      // The same four conditions dbo.withdraw_project_document checks.
      assert.match(list.text, /code=N'project\.write'/);
      assert.match(list.text, /d\.uploaded_by=@actor OR p\.manager_id=@actor OR @elevated=1/);
      assert.match(list.text, /dbo\.document_files df WHERE df\.project_doc_id=d\.id/);
      assert.match(list.text, /dbo\.signature_marks sm WHERE sm\.scan_project_doc_id=d\.id/);
      assert.equal(list.params.actor, actor.id);
      assert.equal(list.params.elevated, elevated, "an additional Engineering Manager role counts");
    } finally { await app.close(); }
  }
});
