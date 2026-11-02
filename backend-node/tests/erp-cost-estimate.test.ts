import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import sql from "mssql";
import type { Database } from "../src/db.js";
import type { ErpGateway, ErpResult } from "../src/erp-purchasing.js";
import type { CurrentUserService } from "../src/users.js";
import { ApiError, registerErrorHandler } from "../src/errors.js";
import { costEstimateArguments, costEstimateBlocker, readCostSheet, type CostEstimateHeader, type CostEstimateLine } from "../src/erp-cost-estimate.js";
import { registerEstimateErpRoutes } from "../src/routes/estimate-erp.js";

/*
 * An approved estimate goes to the Pegasus ERP as a Cost Sheet (cost_estimate_submit). The ERP refuses a sheet whose category
 * summary is not the sum of its lines, or whose total is not the lines plus overhead (0.01 tolerance), and keeps one sheet per
 * external_ref holding only the latest revision.
 */

const header: CostEstimateHeader = {
  estimateId: 41, externalRef: "ENGAPP-EST-00000000-0000-4000-8000-000000000001", revision: 2, estimateNo: "EST-2610-0023",
  projectNo: "PJ000000", projectName: "AI Camera", customer: "Unimicron (Thailand) Co., Ltd.", shortName: "UMTH",
  revisionDescription: "Customer added a second line", preparedByEmail: "owner@tomastc.com", approvedAt: "2026-11-02T03:00:00.000Z",
  appBaseUrl: "https://iot-team-center.tomastc.com:8444/",
};
const line = (overrides: Partial<CostEstimateLine>): CostEstimateLine => ({
  sourceType: "CostItem", internalCategory: "01 Hardware", erpCategory: "Hardware", description: "PLC CPU", amount: 0, ...overrides,
});

test("summary and total are built from the amounts actually sent, rounded to the satang", () => {
  const args = costEstimateArguments(header, [
    line({ amount: 1000.004, modelPartNumber: "KV-8000", brand: "Keyence", supplier: "Keyence Thailand", unitPrice: 500.002, quantity: 2, unit: "Pcs", module: "Control panel" }),
    line({ amount: 0.335, description: "Cable" }),
    line({ sourceType: "ManhourLine", internalCategory: "Engineering / Internal", erpCategory: "Service", description: "Programming", amount: 12000, unit: "man-day" }),
    line({ sourceType: "Contingency", internalCategory: "Contingency", erpCategory: "Service", description: "Contingency", amount: 650.556 }),
  ], 99.999);
  const lines = args.lines as Array<Record<string, unknown>>;
  assert.deepEqual(lines.map((entry) => entry.amount), [1000, 0.34, 12000, 650.56]);
  const summary = args.summary as Array<{ category: string; amount: number }>;
  assert.deepEqual(summary.map((entry) => entry.category), ["Hardware", "Software", "Service", "Installation", "License", "Maintenance", "Training"]);
  assert.equal(summary.find((entry) => entry.category === "Hardware")!.amount, 1000.34);
  assert.equal(summary.find((entry) => entry.category === "Service")!.amount, 12650.56);
  assert.equal(args.overhead_amount, 100);
  assert.equal(args.total, 13750.9);
  // Every summary amount equals its lines, as the ERP checks.
  for (const entry of summary) {
    const sum = lines.filter((item) => item.category === entry.category).reduce((total, item) => total + Number(item.amount), 0);
    assert.ok(Math.abs(sum - entry.amount) < 0.001, entry.category);
  }
  assert.equal(lines[0]!.part_number, "KV-8000");
  assert.equal(lines[0]!.module, "Control panel");
  assert.equal(lines[0]!.unit_price, 500.002);
  // Blank optional fields are left out rather than sent empty.
  assert.equal("brand" in lines[1]!, false);
  assert.equal("unit_price" in lines[1]!, false);
});

test("the header carries the proposed fields, drops a placeholder project and links back to the estimate", () => {
  const args = costEstimateArguments(header, [line({ amount: 10 })], 0);
  assert.equal(args.external_ref, header.externalRef);
  assert.equal(args.revision, 2);
  assert.equal(args.estimate_no, "EST-2610-0023");
  assert.equal("project_no" in args, false, "PJ000000 is not a project the ERP knows");
  assert.equal(args.currency, "THB");
  assert.equal(args.short_name, "UMTH");
  assert.equal(args.prepared_by_email, "owner@tomastc.com");
  assert.equal(args.approved_at, "2026-11-02T03:00:00.000Z");
  assert.equal(args.est_cost_url, "https://iot-team-center.tomastc.com:8444/#/estimates/41");
  assert.equal(costEstimateArguments({ ...header, projectNo: "PJ260172" }, [line({ amount: 10 })], 0).project_no, "PJ260172");
});

test("an estimate with unmapped, too many or no lines is not sent", () => {
  assert.equal(costEstimateBlocker([line({ amount: 1 })]), null);
  assert.match(costEstimateBlocker([])!, /no cost line/);
  assert.match(costEstimateBlocker([line({ erpCategory: "Unmapped" })])!, /no ERP category/);
  assert.match(costEstimateBlocker(Array.from({ length: 2001 }, () => line({ amount: 1 })))!, /at most 2000/);
});

test("the ERP's answer is read from a nested sheet or the top level", () => {
  assert.deepEqual(readCostSheet({ result: "created", cost_sheet: { cost_sheet_no: "CS-2611-0007", status: "CONFIRMED", revision: 2, total: "13750.90", url: "https://pegasus-erp.tomastc.com/cost-sheets/7" } }),
    { result: "created", costSheetNo: "CS-2611-0007", status: "CONFIRMED", revision: 2, total: 13750.9, url: "https://pegasus-erp.tomastc.com/cost-sheets/7" });
  assert.deepEqual(readCostSheet({ no: "CS-1", status: "LINKED", revision: 3 }),
    { result: null, costSheetNo: "CS-1", status: "LINKED", revision: 3, total: null, url: null });
  assert.deepEqual(readCostSheet(null), { result: null, costSheetNo: null, status: null, revision: null, total: null, url: null });
});

const version = Buffer.from("0000000000000001", "hex");

function harness(t: { mock: { method: typeof import("node:test").mock.method } }, options: { status?: string; erpRevision?: number | null; answer?: ErpResult<Record<string, unknown>>; actorId?: number } = {}) {
  const seen = { calls: [] as Array<{ subject: string; tool: string; args: Record<string, unknown> }>, recordedError: null as unknown, recordedSheet: null as Record<string, unknown> | null, audits: 0, issued: 0 };
  t.mock.method(sql.Request.prototype, "query", async function (this: sql.Request, statement: string) {
    if (statement.includes("INSERT dbo.estimate_erp_links")) { seen.issued += 1; return { recordset: [{ external_ref: "ENGAPP-EST-test" }] }; }
    if (statement.includes("audit_log")) { seen.audits += 1; return { recordset: [] }; }
    if (statement.includes("activity_events")) return { recordset: [] };
    throw Error("Unexpected transaction query: " + statement);
  });
  const database = {
    async transaction(action: (transaction: object) => Promise<unknown>) { return action({}); },
    async query(statement: string, bind?: (request: { input: (name: string, type: unknown, value: unknown) => void }) => void) {
      const inputs: Record<string, unknown> = {};
      bind?.({ input: (name, _type, value) => { inputs[name] = value; } });
      if (statement.includes("SELECT owner_id FROM dbo.estimates")) return { recordset: [{ owner_id: 7 }] };
      if (statement.includes("INNER JOIN dbo.customers c")) {
        return { recordset: [{ estimate_no: "EST-2610-0023", revision: 2, status: options.status ?? "Approved", project_name: "AI Camera", locked_at: "2026-11-02T03:00:00Z",
          customer_name: "Unimicron", short_name: "UMTH", owner_email: "owner@tomastc.com", project_no: "PJ000000", revision_reason: null,
          erp_revision: options.erpRevision ?? null, cost_sheet_no: options.erpRevision === undefined || options.erpRevision === null ? null : "CS-1" }] };
      }
      if (statement.includes("v_estimate_totals t ON t.estimate_id=e.id")) {
        return { recordsets: [
          [{ id: 41, revision: 2, status: "Approved", owner_id: 7, row_version: version, canonical_total: 1500, overhead_total: 0, overhead_state: "Zero", can_write: true, can_export: true }],
          [
            { source_type: "CostItem", source_id: 5, description: "PLC CPU", internal_category: "01 Hardware", amount: 1000, erp_category: "Hardware", mapping_row_version: null, copied_from_revision: null, manual_override: false, item: "KV-8000", model_part_number: "KV-8000", supplier: "Keyence", brand: "Keyence", lead_time: null, quote_revision: "SQ-2611-0001", unit_price: 500, quantity: 2, unit: "Pcs", remark: null, module: "Control panel" },
            { source_type: "ManhourLine", source_id: 9, description: "Programming", internal_category: "Engineering / Internal", amount: 500, erp_category: "Service", mapping_row_version: null, copied_from_revision: null, manual_override: false, item: "Programming", model_part_number: "Senior", supplier: "Internal", brand: null, lead_time: null, quote_revision: null, unit_price: 500, quantity: 1, unit: "man-day", remark: null, module: "Software" },
          ],
          [],
        ] };
      }
      if (statement.includes("UPDATE dbo.estimate_erp_links SET error")) { seen.recordedError = inputs.error; return { recordset: [] }; }
      if (statement.includes("UPDATE dbo.estimate_erp_links SET cost_sheet_no")) { seen.recordedSheet = inputs; return { recordset: [] }; }
      if (statement.includes("SELECT external_ref FROM dbo.estimate_erp_links")) return { recordset: [{ external_ref: "ENGAPP-EST-test" }] };
      throw Error("Unexpected query: " + statement);
    },
  } as unknown as Database;
  const gateway: ErpGateway = {
    async call<T>(subject: string, tool: string, args: Record<string, unknown>) {
      seen.calls.push({ subject, tool, args });
      return (options.answer ?? { ok: true, data: { result: "created", cost_sheet: { cost_sheet_no: "CS-2611-0007", status: "CONFIRMED", revision: 2, total: 1500 } } }) as ErpResult<T>;
    },
  };
  const users = {
    async demandPermission(_request: unknown, permission: string) { if (permission === "estimate.approve" && options.actorId === 8) throw new ApiError(403, "permission_denied", "Permission 'estimate.approve' is required."); },
    async required() { return { id: options.actorId ?? 7, entraObjectId: "kc-subject-7", role: "Engineer", roles: ["Engineer"] }; },
  } as unknown as CurrentUserService;
  const app = Fastify(); registerErrorHandler(app);
  registerEstimateErpRoutes(app, database, users, { gateway, appBaseUrl: "https://iot-team-center.tomastc.com:8444" });
  return { app, seen };
}

test("pressing send submits the ERP summary with the presser's token and keeps the Cost Sheet", async (t) => {
  const { app, seen } = harness(t);
  try {
    const response = await app.inject({ method: "POST", url: "/api/v1/estimates/41/erp-send", payload: {} });
    assert.equal(response.statusCode, 200, response.body);
    assert.deepEqual(response.json(), { sent: true, result: "created", costSheetNo: "CS-2611-0007", status: "CONFIRMED" });
    assert.equal(seen.calls.length, 1);
    assert.equal(seen.calls[0]!.tool, "cost_estimate_submit");
    assert.equal(seen.calls[0]!.subject, "kc-subject-7");
    const args = seen.calls[0]!.args;
    assert.equal(args.external_ref, "ENGAPP-EST-test");
    assert.equal(args.total, 1500);
    assert.equal((args.lines as unknown[]).length, 2);
    assert.equal(seen.issued, 1);
    assert.equal(seen.recordedSheet?.no, "CS-2611-0007");
    assert.equal(seen.recordedSheet?.revision, 2);
    assert.equal(seen.recordedSheet?.sent_by, 7);
    assert.equal(seen.audits, 1);
  } finally { await app.close(); }
});

test("a refused send is kept on the link and reported, and the estimate stays as it is", async (t) => {
  const { app, seen } = harness(t, { answer: { ok: false, kind: "validation", message: "The given data was invalid.", errors: { total: ["The total does not match."] } } });
  try {
    const response = await app.inject({ method: "POST", url: "/api/v1/estimates/41/erp-send", payload: {} });
    assert.equal(response.statusCode, 422, response.body);
    assert.match(response.body, /total: The total does not match/);
    assert.match(String(seen.recordedError), /total: The total does not match/);
    assert.equal(seen.recordedSheet, null);
  } finally { await app.close(); }
});

test("an estimate that is not approved is not sent", async (t) => {
  const { app, seen } = harness(t, { status: "Engineering Review" });
  try {
    const response = await app.inject({ method: "POST", url: "/api/v1/estimates/41/erp-send", payload: {} });
    assert.equal(response.statusCode, 409, response.body);
    assert.equal(seen.calls.length, 0);
  } finally { await app.close(); }
});

test("a revision the ERP already holds is not sent again", async (t) => {
  const { app, seen } = harness(t, { erpRevision: 2 });
  try {
    const response = await app.inject({ method: "POST", url: "/api/v1/estimates/41/erp-send", payload: {} });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().result, "unchanged");
    assert.equal(seen.calls.length, 0);
  } finally { await app.close(); }
});

test("someone who is not the owner needs the approve permission to send", async (t) => {
  const { app, seen } = harness(t, { actorId: 8 });
  try {
    const response = await app.inject({ method: "POST", url: "/api/v1/estimates/41/erp-send", payload: {} });
    assert.equal(response.statusCode, 403, response.body);
    assert.equal(seen.calls.length, 0);
  } finally { await app.close(); }
});

test("checking the ERP reads the sheet by its reference and stores what it says", async (t) => {
  const { app, seen } = harness(t, { answer: { ok: true, data: { cost_sheet_no: "CS-2611-0007", status: "LINKED", revision: 2, total: 1500 } } });
  try {
    const response = await app.inject({ method: "POST", url: "/api/v1/estimates/41/erp-refresh", payload: {} });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(seen.calls[0]!.tool, "cost_estimate_get");
    assert.deepEqual(seen.calls[0]!.args, { external_ref: "ENGAPP-EST-test" });
    assert.equal(seen.recordedSheet?.status, "LINKED");
    assert.equal(seen.recordedSheet?.sent_by, null);
  } finally { await app.close(); }
});
