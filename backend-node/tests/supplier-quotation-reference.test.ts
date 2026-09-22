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
 * A price read off a vendor's public page has no document behind it, so the link and
 * the date it was read are the whole of its evidence. The row therefore has to say
 * which kind it is and keep the two apart in both directions: a reference has no file
 * to download, and a quotation backed by a stored file may never swap it for a URL.
 */

const rowVersion = Buffer.from("0000000000000001", "hex");

function harness(
  t: { mock: { method: typeof import("node:test").mock.method } },
  options: { existingKind?: "Document" | "WebReference" } = {},
) {
  const seen = {
    numberedAs: "",
    insertStatement: "",
    insertedUrl: null as unknown,
    lineInserts: 0,
    lineDeletes: 0,
    updated: false,
  };
  t.mock.method(sql.Request.prototype, "execute", async function (this: sql.Request, procedure: string) {
    if (procedure !== "dbo.issue_document_number") throw Error("Unexpected procedure: " + procedure);
    seen.numberedAs = String(this.parameters.document_type!.value);
    return { output: { document_number: seen.numberedAs + "-2609-0001" } };
  });
  t.mock.method(sql.Request.prototype, "query", async function (this: sql.Request, statement: string) {
    if (statement.includes("FROM dbo.suppliers s")) return { recordset: [{ supplier_name: "Keyence (Thailand) CO.,LTD." }] };
    if (statement.includes("INSERT INTO dbo.supplier_quotations")) {
      seen.insertStatement = statement;
      seen.insertedUrl = this.parameters.url?.value ?? null;
      return { recordset: [{ id: 11, row_version: rowVersion }] };
    }
    if (statement.includes("FROM dbo.supplier_quotations WITH (UPDLOCK, HOLDLOCK)")) {
      return { recordset: [{
        supplier_id: 2, supplier_reference: "QT-1", received_date: "2026-09-01", valid_until: "2026-10-01",
        currency: "THB", amount: 1000, inquiry_id: null,
        source_kind: options.existingKind ?? "Document",
        source_url: options.existingKind === "WebReference" ? "https://vendor.example/pdp/kv-nc32exe" : "",
        row_version: rowVersion,
      }] };
    }
    if (statement.includes("UPDATE dbo.supplier_quotations")) {
      seen.updated = true;
      return { recordset: [{ row_version: rowVersion }] };
    }
    if (statement.includes("DELETE FROM dbo.supplier_quotation_lines")) { seen.lineDeletes += 1; return { recordset: [] }; }
    if (statement.includes("INSERT INTO dbo.supplier_quotation_lines")) { seen.lineInserts += 1; return { recordset: [] }; }
    if (statement.includes("audit_log")) return { recordset: [] };
    throw Error("Unexpected transaction query: " + statement);
  });
  const database = {
    async transaction(action: (transaction: object) => Promise<unknown>) { return action({}); },
    async query(statement: string) {
      if (statement.includes("source_kind,source_url FROM dbo.supplier_quotations")) {
        return { recordset: [{
          file_name: null, content_type: null, storage_key: null, size_bytes: null, sha256: null,
          source_kind: "WebReference", source_url: "https://vendor.example/pdp/kv-nc32exe",
        }] };
      }
      return { recordset: [{ id: 11 }] };
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

const reference = (overrides: Record<string, unknown> = {}) => ({
  supplierId: 2,
  sourceUrl: "https://vendor.example/pdp/kv-nc32exe",
  supplierReference: "PDP KV-NC32EXE",
  receivedDate: "2026-09-22",
  validUntil: "2026-10-22",
  currency: "THB",
  amount: 14400,
  lines: [{
    lineNo: 1, itemCode: "KV-NC32EXE", description: "Input Unit, 32 Point", brand: "Keyence", model: "",
    qty: 2, unit: "Pcs", unitPrice: 7200, currency: "THB", remark: "",
  }],
  ...overrides,
});

test("a price read off a page is stored as a reference with its link and no file", async (t) => {
  const { app, seen } = harness(t);
  try {
    const response = await app.inject({ method: "POST", url: "/api/v1/supplier-quotations/reference", payload: reference() });
    assert.equal(response.statusCode, 201, response.body);
    const created = JSON.parse(response.body);
    assert.equal(created.lineCount, 1);
    assert.equal(seen.lineInserts, 1);
    // A reference is numbered apart from a quotation so the difference survives export.
    assert.equal(seen.numberedAs, "RP");
    assert.equal(created.quotationNumber, "RP-2609-0001");
    assert.match(seen.insertStatement, /source_kind,source_url/);
    assert.match(seen.insertStatement, /N'WebReference'/);
    assert.equal(seen.insertedUrl, "https://vendor.example/pdp/kv-nc32exe");
    // No file columns are written at all: they stay null rather than holding blanks.
    assert.doesNotMatch(seen.insertStatement, /storage_key|sha256|file_name|size_bytes/);
  } finally { await app.close(); }
});

for (const [name, url] of [
  ["a bare page name", "vendor.example/pdp"],
  ["a script url", "javascript:alert(1)"],
  ["a file url", "ftp://vendor.example/price.txt"],
  ["a link pasted out of markup", 'https://vendor.example/a"><script>'],
  ["nothing at all", ""],
] as const) {
  test(`${name} is not a citable source and is refused`, async (t) => {
    const { app, seen } = harness(t);
    try {
      const response = await app.inject({
        method: "POST", url: "/api/v1/supplier-quotations/reference", payload: reference({ sourceUrl: url }),
      });
      assert.equal(response.statusCode, 400, response.body);
      // Named explicitly, so the case cannot pass because some earlier field failed.
      assert.match(response.body, /Source URL/);
      assert.equal(seen.insertStatement, "");
      assert.equal(seen.lineInserts, 0);
    } finally { await app.close(); }
  });
}

test("changing a quotation's supplier works from a JSON body", async (t) => {
  const { app, seen } = harness(t, { existingKind: "Document" });
  try {
    // supplierId arrives as a real number here, not the string a query parameter gives.
    const response = await app.inject({
      method: "PATCH", url: "/api/v1/supplier-quotations/11",
      payload: { supplierId: 5, rowVersion: rowVersion.toString("base64") },
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(seen.updated, true);
  } finally { await app.close(); }
});

test("a reference priced at nothing is refused", async (t) => {
  const { app, seen } = harness(t);
  try {
    const response = await app.inject({
      method: "POST", url: "/api/v1/supplier-quotations/reference", payload: reference({ amount: 0 }),
    });
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(seen.insertStatement, "");
  } finally { await app.close(); }
});

test("a reference cannot be read as current before the day it was captured", async (t) => {
  const { app, seen } = harness(t);
  try {
    const response = await app.inject({
      method: "POST", url: "/api/v1/supplier-quotations/reference",
      payload: reference({ receivedDate: "2026-09-22", validUntil: "2026-09-01" }),
    });
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(seen.insertStatement, "");
  } finally { await app.close(); }
});

test("a reference has no document to download and says what it cites instead", async (t) => {
  const { app } = harness(t);
  try {
    const response = await app.inject({ method: "GET", url: "/api/v1/supplier-quotations/11/content" });
    assert.equal(response.statusCode, 404, response.body);
    assert.match(response.body, /no_stored_document/);
    assert.match(response.body, /vendor\.example/);
  } finally { await app.close(); }
});

test("a quotation backed by a stored document cannot swap its file for a link", async (t) => {
  const { app, seen } = harness(t, { existingKind: "Document" });
  try {
    const response = await app.inject({
      method: "PATCH", url: "/api/v1/supplier-quotations/11",
      payload: { sourceUrl: "https://vendor.example/cheaper", rowVersion: rowVersion.toString("base64") },
    });
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(seen.updated, false);
  } finally { await app.close(); }
});

test("a reference's link can be corrected later", async (t) => {
  const { app, seen } = harness(t, { existingKind: "WebReference" });
  try {
    const response = await app.inject({
      method: "PATCH", url: "/api/v1/supplier-quotations/11",
      payload: { sourceUrl: "https://vendor.example/pdp/kv-nc32exe?v=2", rowVersion: rowVersion.toString("base64") },
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(seen.updated, true);
  } finally { await app.close(); }
});
