import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import sql from "mssql";
import type { AppConfig } from "../src/config.js";
import type { Database } from "../src/db.js";
import type { CurrentUserService } from "../src/users.js";
import { registerErrorHandler } from "../src/errors.js";
import { registerSupplierQuotationRoutes } from "../src/routes/supplier-quotations.js";

/*
 * A supplier quotation's lines are the only part of it the Price Library reads: the
 * document is evidence, the lines are the prices. A write that half-succeeds is a
 * price that silently never arrives, so the rows are replaced in one transaction and
 * a payload that cannot be stored is refused before anything is deleted.
 */

const rowVersion = Buffer.from("0000000000000001", "hex");

function quotationRow() {
  return {
    id: 4, quotation_no: "SQ-2609-0001", supplier_reference: "QT-1", supplier_id: 2, supplier_name: "Keyence",
    received_date: "2026-09-01", valid_until: "2026-10-01", inquiry_id: null, inquiry_no: null, project_name: null,
    currency: "THB", amount: 1000, display_status: "Valid", file_name: "q.pdf", content_type: "application/pdf",
    size_bytes: 10, uploaded_by_name: "Nattapol", uploaded_at: "2026-09-01T00:00:00Z", row_version: rowVersion,
    line_count: 3, total_count: 1,
  };
}

function harness(
  t: { mock: { method: typeof import("node:test").mock.method } },
  options: { quotationExists?: boolean } = {},
) {
  const seen = {
    deletes: 0,
    inserted: [] as Record<string, unknown>[],
    statements: [] as string[],
  };
  t.mock.method(sql.Request.prototype, "query", async function (this: sql.Request, statement: string) {
    if (statement.includes("DELETE FROM dbo.supplier_quotation_lines")) {
      seen.deletes += 1;
      return { recordset: [] };
    }
    if (statement.includes("INSERT INTO dbo.supplier_quotation_lines")) {
      const values: Record<string, unknown> = {};
      for (const [name, parameter] of Object.entries(this.parameters)) values[name] = (parameter as { value: unknown }).value;
      seen.inserted.push(values);
      return { recordset: [] };
    }
    throw Error("Unexpected transaction query: " + statement);
  });
  const database = {
    async transaction(action: (transaction: object) => Promise<unknown>) { return action({}); },
    async query(statement: string) {
      seen.statements.push(statement);
      if (statement.includes("WITH quotation_rows AS")) return { recordset: [quotationRow()] };
      return { recordset: options.quotationExists === false ? [] : [{ id: 4 }] };
    },
  } as unknown as Database;
  const users = {
    async demandPermission() {},
    async required() { return { id: 7, role: "Engineer" }; },
  } as unknown as CurrentUserService;
  const config = {
    businessTimeZone: "Asia/Bangkok",
    documentStorage: { maxFileSizeBytes: 1 },
    pdfParserUrl: "http://parser",
  } as unknown as AppConfig;
  const app = Fastify();
  registerErrorHandler(app);
  registerSupplierQuotationRoutes(app, config, database, users);
  return { app, seen };
}

const line = (overrides: Record<string, unknown> = {}) => ({
  lineNo: 1, itemCode: "KV-NC32EXE", description: "Input Unit, 32 Point", brand: "Keyence", model: "",
  qty: 2, unit: "Pcs", unitPrice: 7200, currency: "THB", remark: "", ...overrides,
});

test("saving lines clears the old rows and writes the new ones in one transaction", async (t) => {
  const { app, seen } = harness(t);
  try {
    const response = await app.inject({
      method: "PUT", url: "/api/v1/supplier-quotations/4/lines",
      payload: { lines: [line(), line({ lineNo: 2, itemCode: "KV-EP02", description: "Comm module", qty: 1, unitPrice: 7900 })] },
    });
    assert.equal(response.statusCode, 204, response.body);
    assert.equal(seen.deletes, 1);
    assert.equal(seen.inserted.length, 2);
    assert.deepEqual(seen.inserted.map((row) => row.no), [1, 2]);
    assert.deepEqual(seen.inserted.map((row) => row.price), [7200, 7900]);
    assert.equal(seen.inserted[0]!.brand, "Keyence");
  } finally { await app.close(); }
});

test("an empty list is a deliberate clear, not a refusal", async (t) => {
  const { app, seen } = harness(t);
  try {
    const response = await app.inject({ method: "PUT", url: "/api/v1/supplier-quotations/4/lines", payload: { lines: [] } });
    assert.equal(response.statusCode, 204, response.body);
    assert.equal(seen.deletes, 1);
    assert.equal(seen.inserted.length, 0);
  } finally { await app.close(); }
});

for (const [name, payload] of [
  ["a line with no description", line({ description: "   " })],
  ["a line with no quantity", line({ qty: 0 })],
  ["a line with a negative price", line({ unitPrice: -1 })],
  ["a line in a currency the ledger does not carry", line({ currency: "GBP" })],
] as const) {
  test(`${name} is refused before any row is deleted`, async (t) => {
    const { app, seen } = harness(t);
    try {
      const response = await app.inject({
        method: "PUT", url: "/api/v1/supplier-quotations/4/lines", payload: { lines: [payload] },
      });
      assert.equal(response.statusCode, 400, response.body);
      assert.equal(seen.deletes, 0);
      assert.equal(seen.inserted.length, 0);
    } finally { await app.close(); }
  });
}

test("lines cannot be written to a quotation that does not exist", async (t) => {
  const { app, seen } = harness(t, { quotationExists: false });
  try {
    const response = await app.inject({
      method: "PUT", url: "/api/v1/supplier-quotations/4/lines", payload: { lines: [line()] },
    });
    assert.equal(response.statusCode, 404, response.body);
    assert.equal(seen.deletes, 0);
  } finally { await app.close(); }
});

test("the register reports how many prices each document actually carries", async (t) => {
  const { app, seen } = harness(t);
  try {
    const response = await app.inject({ method: "GET", url: "/api/v1/supplier-quotations" });
    assert.equal(response.statusCode, 200, response.body);
    const listed = seen.statements.find((statement) => statement.includes("WITH quotation_rows AS"));
    assert.ok(listed, "the register query was not issued");
    assert.match(listed, /FROM dbo\.supplier_quotation_lines l WHERE l\.quotation_id=q\.id\) line_count/);
    assert.equal(JSON.parse(response.body).items[0].lineCount, 3);
  } finally { await app.close(); }
});
