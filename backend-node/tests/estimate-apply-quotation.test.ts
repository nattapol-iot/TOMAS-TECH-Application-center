import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import sql from "mssql";
import type { Database } from "../src/db.js";
import type { CurrentUserService } from "../src/users.js";
import { registerErrorHandler } from "../src/errors.js";
import { parseQuotationPicks, registerEstimateCostWriteRoutes } from "../src/routes/estimate-cost-write.js";

/*
 * Lines picked from a supplier quotation become cost lines in one transaction. The price is
 * read from the stored quotation line, never from the request, and a cost line has no
 * currency, so a foreign price lands in baht at the THB rate filed on the quotation.
 */

const version = Buffer.from("0000000000000001", "hex");

type Scenario = {
  currency?: string; thbRate?: number | null; status?: string; lineCurrency?: string;
  actorId?: number; quotationMissing?: boolean;
};

function harness(t: { mock: { method: typeof import("node:test").mock.method } }, scenario: Scenario = {}) {
  const seen = { committed: false, inserts: [] as Record<string, unknown>[], audits: [] as string[] };
  t.mock.method(sql.Request.prototype, "query", async function (this: sql.Request, statement: string) {
    if (statement.includes("FROM dbo.estimates WITH")) return { recordset: [{ estimate_no: "EST-1", revision: 2, owner_id: 7, status: "Draft", row_version: version, due_date: "2026-11-30" }] };
    if (statement.includes("FROM dbo.estimate_assignments")) return { recordset: [] };
    if (statement.includes("FROM dbo.supplier_quotations WITH (HOLDLOCK)")) {
      return { recordset: scenario.quotationMissing ? [] : [{
        quotation_no: "SQ-2611-0001", supplier_reference: "QT-88", supplier_id: 4, received_date: new Date("2026-10-30T00:00:00Z"),
        currency: scenario.currency ?? "JPY", thb_rate: scenario.thbRate === undefined ? 0.24 : scenario.thbRate,
        status: scenario.status ?? "Active", source_kind: "Document",
      }] };
    }
    if (statement.includes("FROM dbo.supplier_quotation_lines WHERE quotation_id=@quotation_id")) {
      return { recordset: [
        { id: 31, line_no: 1, item_code: "KV-8000", description: "PLC CPU", brand: "Keyence", model: "KV-8000", unit: "Pcs", unit_price: 120000, currency: scenario.lineCurrency ?? scenario.currency ?? "JPY", remark: null },
        { id: 32, line_no: 2, item_code: "", description: "Cable 2 m", brand: "", model: "", unit: "m", unit_price: 500, currency: scenario.lineCurrency ?? scenario.currency ?? "JPY", remark: "cut to length" },
      ] };
    }
    if (statement.includes("FROM dbo.users u INNER JOIN dbo.roles")) return { recordset: [{ owner_valid: true, supplier_valid: true }] };
    if (statement.includes("INSERT INTO dbo.cost_items")) {
      seen.inserts.push(Object.fromEntries(Object.entries(this.parameters).map(([key, parameter]) => [key, parameter.value])));
      return { recordset: [] };
    }
    if (statement.includes("assert_estimate_totals")) return { recordset: [] };
    if (statement.includes("UPDATE dbo.estimates")) return { recordset: [{ row_version: version }] };
    if (statement.includes("audit_log")) { seen.audits.push(String(this.parameters.action?.value ?? "")); return { recordset: [] }; }
    if (statement.includes("activity_events")) return { recordset: [] };
    throw Error("Unexpected SQL: " + statement);
  });
  const database = { async transaction(action: (transaction: object) => Promise<unknown>) { const result = await action({}); seen.committed = true; return result; } } as unknown as Database;
  const users = {
    async demandPermission(_request: unknown, permission: string) { assert.equal(permission, "estimate.write"); },
    async required() { return { id: scenario.actorId ?? 7, role: "Engineer" }; },
  } as unknown as CurrentUserService;
  const app = Fastify(); registerErrorHandler(app); registerEstimateCostWriteRoutes(app, database, users);
  return { app, seen };
}

const payload = (overrides: Record<string, unknown> = {}) => ({
  estimateRowVersion: version.toString("base64"), quotationId: 9, categoryCode: "01", module: "Control panel", ownerId: 7,
  lines: [{ lineId: 31, quantity: 2 }, { lineId: 32, quantity: 3, unitCost: 1 }], ...overrides,
});

test("a JPY quotation's lines land in baht at the quotation's rate, priced from the stored lines", async (t) => {
  const { app, seen } = harness(t);
  try {
    const response = await app.inject({ method: "POST", url: "/api/v1/estimates/1/apply-quotation", payload: payload() });
    assert.equal(response.statusCode, 201, response.body);
    assert.equal(response.json().lines, 2);
    assert.equal(response.json().reference, "SQ-2611-0001");
    assert.equal(seen.committed, true);
    const [cpu, cable] = seen.inserts;
    assert.equal(cpu!.unit_cost, 28800);
    assert.equal(cpu!.qty, 2);
    assert.equal(cpu!.price_source, "Supplier Quotation");
    assert.equal(cpu!.reference_no, "SQ-2611-0001");
    assert.equal(cpu!.price_date, "2026-10-30");
    assert.equal(cpu!.supplier_id, 4);
    assert.equal(cpu!.module, "Control panel");
    assert.match(String(cpu!.remark), /JPY 120,000 × 0\.24 = 28,800 THB/);
    assert.match(String(cpu!.remark), /Supplier ref QT-88/);
    // A unit cost sent by the client is ignored: the server prices from the quotation line.
    assert.equal(cable!.unit_cost, 120);
    // A line with no part number is named after its source rather than refused.
    assert.equal(cable!.item_code, "SQ-2611-0001-2");
    assert.match(String(cable!.remark), /cut to length/);
    assert.equal(seen.audits.length, 1);
  } finally { await app.close(); }
});

test("a THB quotation's lines keep their price and carry no conversion note", async (t) => {
  const { app, seen } = harness(t, { currency: "THB", thbRate: null });
  try {
    const response = await app.inject({ method: "POST", url: "/api/v1/estimates/1/apply-quotation", payload: payload() });
    assert.equal(response.statusCode, 201, response.body);
    assert.equal(seen.inserts[0]!.unit_cost, 120000);
    assert.doesNotMatch(String(seen.inserts[0]!.remark), /×/);
  } finally { await app.close(); }
});

for (const [name, scenario, status, code] of [
  ["a foreign quotation without a THB rate", { thbRate: null }, 409, "quotation_rate_missing"],
  ["a line in another currency than its quotation", { currency: "THB", thbRate: null, lineCurrency: "USD" }, 409, "quotation_line_currency"],
  ["a superseded quotation", { status: "Superseded" }, 409, "quotation_superseded"],
  ["a quotation that does not exist", { quotationMissing: true }, 404, "quotation_not_found"],
  ["an engineer with no section of the estimate", { actorId: 8 }, 403, "estimate_section_forbidden"],
] as const) {
  test(`${name} adds nothing`, async (t) => {
    const { app, seen } = harness(t, scenario);
    try {
      const response = await app.inject({ method: "POST", url: "/api/v1/estimates/1/apply-quotation", payload: payload() });
      assert.equal(response.statusCode, status, response.body);
      assert.match(response.body, new RegExp(code));
      assert.equal(seen.inserts.length, 0);
      assert.equal(seen.committed, false);
    } finally { await app.close(); }
  });
}

test("a line that left the quotation stops the whole add", async (t) => {
  const { app, seen } = harness(t);
  try {
    const response = await app.inject({ method: "POST", url: "/api/v1/estimates/1/apply-quotation", payload: payload({ lines: [{ lineId: 31, quantity: 1 }, { lineId: 99, quantity: 1 }] }) });
    assert.equal(response.statusCode, 409, response.body);
    assert.match(response.body, /quotation_changed/);
    assert.equal(seen.committed, false);
  } finally { await app.close(); }
});

test("picks must name each line once with a whole quantity", () => {
  assert.deepEqual(parseQuotationPicks([{ lineId: 3, quantity: 2 }]), [{ lineId: 3, quantity: 2 }]);
  assert.throws(() => parseQuotationPicks([]), /at least one/);
  assert.throws(() => parseQuotationPicks([{ lineId: 3, quantity: 1.5 }]), /quantity is invalid/);
  assert.throws(() => parseQuotationPicks([{ lineId: 3, quantity: 0 }]), /quantity is invalid/);
  assert.throws(() => parseQuotationPicks([{ lineId: 3, quantity: 1 }, { lineId: 3, quantity: 2 }]), /picked twice/);
  assert.throws(() => parseQuotationPicks(Array.from({ length: 201 }, (_, index) => ({ lineId: index + 1, quantity: 1 }))), /at most 200/);
});
