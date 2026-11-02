import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import sql from "mssql";
import type { AppConfig } from "../src/config.js";
import type { Database } from "../src/db.js";
import type { ErpGateway } from "../src/erp-purchasing.js";
import type { CurrentUserService } from "../src/users.js";
import { registerErrorHandler } from "../src/errors.js";
import { registerEstimateRoutes } from "../src/routes/estimates.js";

/*
 * Approving an estimate sends it to the Pegasus ERP with the approver's token once the approval has committed. The send
 * can fail (no ERP right, sign-in ended, ERP down); the approval stands either way and the answer says what happened.
 */

const version = Buffer.from("0000000000000001", "hex");

function harness(t: { mock: { method: typeof import("node:test").mock.method } }, options: { erp: boolean; sendFails?: boolean; notSentYet?: boolean }) {
  const seen = { approved: false, sendLookups: 0 };
  t.mock.method(sql.Request.prototype, "query", async function (this: sql.Request, statement: string) {
    if (statement.includes("INNER JOIN dbo.inquiries i WITH (UPDLOCK,HOLDLOCK)")) {
      return { recordset: [{ estimate_no: "EST-1", status: "Engineering Review", progress: 90, revision: 2, owner_id: 7, inquiry_id: 3,
        inquiry_no: "RFQ-3", inquiry_status: "Engineering Review", inquiry_progress: 90 }] };
    }
    if (statement.includes("assert_estimate_totals") || statement.includes("fn_estimate_validation")) return { recordset: [] };
    if (statement.includes("unmapped_count")) return { recordset: [{ unmapped_count: 0 }] };
    if (statement.includes("UPDATE dbo.estimates SET status=@status")) { seen.approved = true; return { recordset: [{ row_version: version }] }; }
    if (statement.includes("INSERT INTO dbo.estimate_revisions")) return { recordset: [{ id: 1 }] };
    if (statement.includes("UPDATE dbo.inquiries")) return { recordset: [], rowsAffected: [1] };
    if (statement.includes("audit_log") || statement.includes("activity_events")) return { recordset: [] };
    throw Error("Unexpected transaction query: " + statement);
  });
  const database = {
    async transaction(action: (transaction: object) => Promise<unknown>) { return action({}); },
    async query(statement: string) {
      if (statement.includes("INNER JOIN dbo.customers c")) {
        seen.sendLookups += 1;
        if (options.sendFails) throw new Error("The database went away.");
        // The ERP already holds this revision, so the send answers without calling it.
        return { recordset: [{ estimate_no: "EST-1", revision: 2, status: "Approved", project_name: "Line 3", locked_at: "2026-11-02T03:00:00Z",
          customer_name: "Customer", short_name: "", owner_email: "owner@tomastc.com", project_no: null, revision_reason: null,
          erp_revision: options.notSentYet ? null : 2, cost_sheet_no: options.notSentYet ? null : "CS-1" }] };
      }
      throw Error("Unexpected query: " + statement);
    },
  } as unknown as Database;
  const gateway: ErpGateway = { async call() { throw new Error("The ERP must not be called for a revision it already holds."); } };
  const users = {
    async demandPermission(_request: unknown, permission: string) { assert.equal(permission, "estimate.approve"); },
    async required() { return { id: 9, entraObjectId: "kc-approver", role: "Engineering Manager", roles: ["Engineering Manager"] }; },
  } as unknown as CurrentUserService;
  const app = Fastify(); registerErrorHandler(app);
  registerEstimateRoutes(app, { businessTimeZone: "Asia/Bangkok" } as AppConfig, database, users, options.erp ? { gateway, appBaseUrl: "https://app.example" } : null);
  return { app, seen };
}

const approve = (app: ReturnType<typeof Fastify>, extra: Record<string, unknown> = {}) =>
  app.inject({ method: "POST", url: "/api/v1/estimates/1/approve", payload: { rowVersion: version.toString("base64"), ...extra } });

test("approval sends the estimate to the ERP and says so", async (t) => {
  const { app, seen } = harness(t, { erp: true });
  try {
    const response = await approve(app);
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().status, "Approved");
    assert.deepEqual(response.json().erp, { sent: true, result: "unchanged", costSheetNo: "CS-1" });
    assert.equal(seen.approved, true);
    assert.equal(seen.sendLookups, 1);
  } finally { await app.close(); }
});

test("a send that fails leaves the estimate approved", async (t) => {
  const { app, seen } = harness(t, { erp: true, sendFails: true });
  try {
    const response = await approve(app);
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().status, "Approved");
    assert.equal(response.json().erp.sent, false);
    assert.match(response.json().erp.message, /database went away/);
    assert.equal(seen.approved, true);
  } finally { await app.close(); }
});

test("without an ERP connection approval answers as before", async (t) => {
  const { app, seen } = harness(t, { erp: false });
  try {
    const response = await approve(app);
    assert.equal(response.statusCode, 200, response.body);
    assert.equal("erp" in response.json(), false);
    assert.equal(seen.sendLookups, 0);
  } finally { await app.close(); }
});

test("approval without the sheet's rows leaves the send to the ERP tab", async (t) => {
  const { app } = harness(t, { erp: true, notSentYet: true });
  try {
    const response = await approve(app);
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().status, "Approved");
    assert.equal(response.json().erp.sent, false);
    assert.match(response.json().erp.message, /ERP tab/);
  } finally { await app.close(); }
});

test("approval with unreadable sheet rows still approves and says why nothing was sent", async (t) => {
  const { app, seen } = harness(t, { erp: true, notSentYet: true });
  try {
    const response = await approve(app, { erpLines: [{ description: "PLC System", amount: 1000 }] });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(seen.approved, true);
    assert.equal(response.json().erp.sent, false);
    assert.match(response.json().erp.message, /row 1 has no ERP category/);
  } finally { await app.close(); }
});
