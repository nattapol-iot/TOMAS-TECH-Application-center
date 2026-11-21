import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type { AppConfig } from "../src/config.js";
import type { Database } from "../src/db.js";
import { EmailService } from "../src/email.js";
import { registerErrorHandler } from "../src/errors.js";
import { registerInquiryRoutes } from "../src/routes/inquiries.js";
import type { CurrentUserService } from "../src/users.js";

// The Sales V2 RFQ list (2026-11-21) asks GET /api/v1/inquiries?summary=true for one count per status over every filter but
// the status itself, so each cell of its summary bar counts exactly what pressing it lists.
async function listWith(url: string) {
  const statements: string[] = [];
  const parameters = new Map<string, unknown>();
  const database = {
    async query(text: string, bind?: (request: unknown) => void) {
      statements.push(text);
      const request = { input(key: string, _type: unknown, value: unknown) { parameters.set(key, value); return request; } };
      bind?.(request);
      if (/user_effective_permissions/.test(text)) return { recordset: [{ code: "inquiry.read" }], recordsets: [] };
      return {
        recordset: [],
        recordsets: [[], [{ status: "New", inquiry_count: 4 }, { status: "Approved", inquiry_count: "2" }]],
      };
    },
  } as unknown as Database;
  const users = {
    async demandPermission() { /* allowed */ },
    async required() { return { id: 7, department: "Sales" }; },
  } as unknown as CurrentUserService;
  const app = Fastify();
  registerErrorHandler(app);
  registerInquiryRoutes(app, { businessTimeZone: "Asia/Bangkok" } as AppConfig, database, users, new EmailService({ mode: "Disabled" } as never));
  try {
    const response = await app.inject({ method: "GET", url });
    return { status: response.statusCode, body: response.json() as Record<string, unknown>, list: statements.at(-1) ?? "", parameters };
  } finally {
    await app.close();
  }
}

test("?summary=true adds the status counts over every filter but the status", async () => {
  const { status, body, list, parameters } = await listWith("/api/v1/inquiries?summary=true&status=New&search=line");
  assert.equal(status, 200);
  assert.deepEqual(body.statusSummary, [{ status: "New", count: 4 }, { status: "Approved", count: 2 }]);
  assert.equal(parameters.get("status"), "New");
  const [rows = "", counts = ""] = list.split(/ORDER BY i\.updated_at DESC, i\.id DESC[\s\S]*?ONLY;/);
  assert.match(rows, /AND \(@status IS NULL OR i\.status = @status\)/, "the rows still follow the status filter");
  assert.match(counts, /SELECT i\.status, COUNT_BIG\(\*\) AS inquiry_count[\s\S]+GROUP BY i\.status;/);
  assert.doesNotMatch(counts, /@status/, "the counts ignore it");
  assert.match(counts, /@search IS NULL OR i\.inquiry_no LIKE/, "and keep every other filter");
});

test("without ?summary the list runs one statement and returns no counts", async () => {
  const { status, body, list } = await listWith("/api/v1/inquiries?page=1");
  assert.equal(status, 200);
  assert.equal("statusSummary" in body, false);
  assert.doesNotMatch(list, /GROUP BY i\.status/);
});
