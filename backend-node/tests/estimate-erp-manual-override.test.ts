import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import sql from "mssql";
import type { Database } from "../src/db.js";
import type { CurrentUserService } from "../src/users.js";
import { registerErrorHandler } from "../src/errors.js";
import { registerEstimateErpRoutes } from "../src/routes/estimate-erp.js";

const version = Buffer.from("0000000000000001", "hex");

/*
 * The ERP category of a labour line is derived from its cost type, provider and
 * discipline, and the summary recomputes it on every read. A person may now choose
 * a different one; that choice is recorded so the derived value stops winning, and
 * choosing the derived value again hands the line back to the rule.
 */
for (const scenario of ["overrides the rule", "matches the rule", "cost item"] as const) {
  test("ERP mapping: " + scenario, async (t) => {
    let written: { category: unknown; manual: unknown } | null = null;
    let audited: unknown = null;
    t.mock.method(sql.Request.prototype, "query", async function (this: sql.Request, statement: string) {
      if (statement.includes("FROM dbo.estimates WITH")) {
        return { recordset: [{ estimate_no: "EST-1", revision: 2, status: "Draft", owner_id: 7, row_version: version }] };
      }
      if (statement.includes("FROM dbo.manhour_lines l WITH")) return { recordset: [{ category: "Installation" }] };
      if (statement.includes("CONVERT(bit,CASE WHEN EXISTS")) return { recordset: [{ found: true }] };
      if (statement.includes("dbo.estimate_erp_mappings")) {
        written = { category: this.parameters.erp_category!.value, manual: this.parameters.manual_override!.value };
        assert.match(statement, /manual_override/);
        return { recordset: [{ id: 1 }] };
      }
      if (statement.includes("audit_log")) { audited = this.parameters.after_json?.value ?? null; return { recordset: [] }; }
      if (statement.includes("activity_events") || statement.includes("assert_estimate_totals")) return { recordset: [] };
      if (statement.includes("UPDATE dbo.estimates")) return { recordset: [] };
      throw Error("Unexpected query: " + statement);
    });
    const database = {
      async transaction(action: (transaction: object) => Promise<unknown>) { return action({}); },
      async query() {
        return { recordsets: [[{ id: 1, revision: 2, status: "Draft", owner_id: 7, row_version: version, canonical_total: 0, overhead_total: 0, overhead_state: "Zero", can_write: true, can_export: false }], []] };
      },
    } as unknown as Database;
    const users = { async demandPermission() {}, async required() { return { id: 7, role: "Engineer" }; } } as unknown as CurrentUserService;
    const app = Fastify(); registerErrorHandler(app); registerEstimateErpRoutes(app, database, users);
    try {
      const mapping = scenario === "cost item"
        ? { sourceType: "CostItem", sourceId: 5, erpCategory: "Service" }
        : { sourceType: "ManhourLine", sourceId: 5, erpCategory: scenario === "matches the rule" ? "Installation" : "Service" };
      const response = await app.inject({
        method: "PUT", url: "/api/v1/estimates/1/erp-mappings",
        payload: { estimateRowVersion: version.toString("base64"), mappings: [mapping] },
      });
      assert.equal(response.statusCode, 200, response.body);
      assert.deepEqual(written, {
        category: scenario === "cost item" ? "Service" : scenario === "matches the rule" ? "Installation" : "Service",
        // Only a labour line that departs from its rule is recorded as overridden.
        manual: scenario === "overrides the rule",
      });
      if (typeof audited === "string") assert.match(audited, scenario === "overrides the rule" ? /"manualOverride":true/ : /"manualOverride":false/);
    } finally { await app.close(); }
  });
}

test("the summary stops deriving a labour category once someone has overridden it", async () => {
  const source = await import("node:fs/promises").then(fs => fs.readFile("src/routes/estimate-erp.ts", "utf8"));
  // The derived value may only win while nobody has chosen otherwise.
  assert.match(source, /NOT IN\(N'Approved',N'Locked'\) AND COALESCE\(m\.manual_override,0\)=0/);
  assert.match(source, /CONVERT\(bit,COALESCE\(m\.manual_override,0\)\)/);
  assert.doesNotMatch(source, /automatic_erp_category/);
});
