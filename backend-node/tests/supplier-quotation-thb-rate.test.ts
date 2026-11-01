import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import sql from "mssql";
import type { AppConfig } from "../src/config.js";
import type { Database } from "../src/db.js";
import type { CurrentUserService } from "../src/users.js";
import { registerErrorHandler } from "../src/errors.js";
import { parseThbRate, registerSupplierQuotationRoutes } from "../src/routes/supplier-quotations.js";

/*
 * A cost line has no currency, so a JPY, USD or EUR quotation reaches an estimate only through
 * the THB rate filed on it. A THB quotation never holds one, and a rate belongs to the currency
 * it was stated for: changing the currency without a new rate drops the old one.
 */

const rowVersion = Buffer.from("0000000000000001", "hex");

function harness(t: { mock: { method: typeof import("node:test").mock.method } }) {
  const seen = { insertedRate: undefined as unknown, updatedRate: undefined as unknown, listBinds: {} as Record<string, unknown>, listSql: "" };
  t.mock.method(sql.Request.prototype, "execute", async function () {
    return { output: { document_number: "RP-2611-0001" } };
  });
  t.mock.method(sql.Request.prototype, "query", async function (this: sql.Request, statement: string) {
    if (statement.includes("FROM dbo.suppliers s")) return { recordset: [{ supplier_name: "Keyence Japan" }] };
    if (statement.includes("INSERT INTO dbo.supplier_quotations")) {
      seen.insertedRate = this.parameters.thb_rate?.value;
      return { recordset: [{ id: 11, row_version: rowVersion }] };
    }
    if (statement.includes("FROM dbo.supplier_quotations WITH (UPDLOCK, HOLDLOCK)")) {
      return { recordset: [{
        supplier_id: 2, supplier_reference: "QT-1", received_date: "2026-10-01", valid_until: "2026-11-01",
        currency: "JPY", amount: 100000, thb_rate: 0.24, inquiry_id: null, source_kind: "Document", source_url: "", row_version: rowVersion,
      }] };
    }
    if (statement.includes("UPDATE dbo.supplier_quotations")) {
      seen.updatedRate = this.parameters.thb_rate?.value;
      return { recordset: [{ row_version: rowVersion }] };
    }
    if (statement.includes("supplier_quotation_lines") || statement.includes("audit_log")) return { recordset: [] };
    throw Error("Unexpected transaction query: " + statement);
  });
  const database = {
    async transaction(action: (transaction: object) => Promise<unknown>) { return action({}); },
    async query(statement: string, bind?: (request: { input: (name: string, type: unknown, value: unknown) => void }) => void) {
      seen.listSql = statement;
      bind?.({ input: (name, _type, value) => { seen.listBinds[name] = value; } });
      return { recordset: [{
        id: 11, quotation_no: "SQ-2611-0001", supplier_reference: "QT-1", supplier_id: 2, supplier_name: "Keyence Japan",
        received_date: "2026-10-01", valid_until: "2026-11-01", inquiry_id: 5, inquiry_no: "RFQ-5", project_name: "Line 3",
        currency: "JPY", amount: 100000, thb_rate: 0.24, display_status: "Valid", file_name: "q.pdf", content_type: "application/pdf",
        size_bytes: 10, uploaded_by_name: "A", uploaded_at: "2026-10-01T00:00:00Z", row_version: rowVersion,
        source_kind: "Document", source_url: "", line_count: 2, total_count: 1,
      }] };
    },
  } as unknown as Database;
  const users = { async demandPermission() {}, async required() { return { id: 7, role: "Engineer" }; } } as unknown as CurrentUserService;
  const config = { businessTimeZone: "Asia/Bangkok", documentStorage: { maxFileSizeBytes: 1 }, pdfParserUrl: "http://parser" } as unknown as AppConfig;
  const app = Fastify(); registerErrorHandler(app); registerSupplierQuotationRoutes(app, config, database, users);
  return { app, seen };
}

const reference = (overrides: Record<string, unknown> = {}) => ({
  supplierId: 2, sourceUrl: "https://vendor.example/kv", receivedDate: "2026-10-01", validUntil: "2026-11-01",
  currency: "JPY", amount: 100000, thbRate: 0.2412345678,
  lines: [{ lineNo: 1, itemCode: "KV", description: "PLC", brand: "", model: "", qty: 1, unit: "Pcs", unitPrice: 100000, currency: "JPY", remark: "" }],
  ...overrides,
});

test("the rate is kept to six decimals, only for a foreign currency, and only when positive", () => {
  assert.equal(parseThbRate("0.2412345678", "JPY"), 0.241235);
  assert.equal(parseThbRate(35.5, "USD"), 35.5);
  assert.equal(parseThbRate(35.5, "THB"), null);
  assert.equal(parseThbRate("", "EUR"), null);
  assert.equal(parseThbRate(undefined, "EUR"), null);
  for (const bad of [0, -1, "abc", 100_001, "1e-9"]) assert.throws(() => parseThbRate(bad, "JPY"), /THB rate/);
});

test("a foreign reference price is stored with its rate", async (t) => {
  const { app, seen } = harness(t);
  try {
    const response = await app.inject({ method: "POST", url: "/api/v1/supplier-quotations/reference", payload: reference() });
    assert.equal(response.statusCode, 201, response.body);
    assert.equal(seen.insertedRate, 0.241235);
  } finally { await app.close(); }
});

test("a THB reference price never stores a rate", async (t) => {
  const { app, seen } = harness(t);
  try {
    const response = await app.inject({ method: "POST", url: "/api/v1/supplier-quotations/reference", payload: reference({ currency: "THB", thbRate: 35 }) });
    assert.equal(response.statusCode, 201, response.body);
    assert.equal(seen.insertedRate, null);
  } finally { await app.close(); }
});

test("a rate of zero is refused before anything is written", async (t) => {
  const { app, seen } = harness(t);
  try {
    const response = await app.inject({ method: "POST", url: "/api/v1/supplier-quotations/reference", payload: reference({ thbRate: 0 }) });
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(seen.insertedRate, undefined);
  } finally { await app.close(); }
});

for (const [name, patch, expected] of [
  ["an edit that leaves the rate alone keeps it", { amount: 120000 }, 0.24],
  ["a new rate replaces the old one", { thbRate: 0.25 }, 0.25],
  ["a new currency without a rate drops the old one", { currency: "USD" }, null],
  ["a quotation changed to THB drops its rate", { currency: "THB", thbRate: 0.25 }, null],
  ["a rate can be cleared", { thbRate: null }, null],
] as const) {
  test(name, async (t) => {
    const { app, seen } = harness(t);
    try {
      const response = await app.inject({ method: "PATCH", url: "/api/v1/supplier-quotations/11", payload: { ...patch, rowVersion: rowVersion.toString("base64") } });
      assert.equal(response.statusCode, 200, response.body);
      assert.equal(seen.updatedRate, expected);
    } finally { await app.close(); }
  });
}

test("the register lists one RFQ's quotations and reports each rate", async (t) => {
  const { app, seen } = harness(t);
  try {
    const response = await app.inject({ method: "GET", url: "/api/v1/supplier-quotations?inquiryId=5" });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(seen.listBinds.inquiry, 5);
    assert.match(seen.listSql, /@inquiry IS NULL OR inquiry_id=@inquiry/);
    assert.equal(response.json().items[0].thbRate, 0.24);
  } finally { await app.close(); }
});
