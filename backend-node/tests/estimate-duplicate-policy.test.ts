import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { registerEstimateRoutes } from "../src/routes/estimates.js";
import type { Database } from "../src/db.js";
import type { AppConfig } from "../src/config.js";
import type { CurrentUserService } from "../src/users.js";
import { estimateDuplicateWarnings, withoutLegacyDuplicateErrors } from "../src/estimate-duplicate-policy.js";

const item = { id: 1, categoryCode: "01", module: "Panel A", itemCode: "PLC-1", model: "FX", description: "Controller" };

test("the same product in different modules or categories has no duplicate warning", () => {
  assert.deepEqual(estimateDuplicateWarnings([item, { ...item, id: 2, module: "Panel B" }, { ...item, id: 3, categoryCode: "03" }]), []);
});
test("one advisory per group identifies all rows and allows case/outer whitespace differences", () => {
  const warnings = estimateDuplicateWarnings([{ ...item, id: 3 }, item, { ...item, id: 2, module: " panel a ", itemCode: " plc-1 " }]);
  assert.equal(warnings.length, 1);
  assert.ok(warnings[0]);
  assert.equal(warnings[0].severity, "Warning");
  assert.equal(warnings[0].entityId, 1);
  assert.match(warnings[0].message, /PLC-1.*Panel A.*#1, #2, #3/);
});
test("different models or descriptions are not duplicates; unnamed modules are still checked", () => {
  assert.deepEqual(estimateDuplicateWarnings([item, { ...item, id: 2, model: "Other" }, { ...item, id: 3, description: "Other" }]), []);
  assert.equal(estimateDuplicateWarnings([{ ...item, module: "" }, { ...item, id: 2, module: " " }]).length, 1);
});
test("workflow policy removes only legacy duplicate blockers and preserves other errors", () => {
  const error = { code: "missing_unit_cost", entityId: 1 };
  assert.deepEqual(withoutLegacyDuplicateErrors([{ code: "duplicate_cost_item", entityId: 1 }, error]), [error]);
  assert.deepEqual(withoutLegacyDuplicateErrors([{ code: "duplicate_cost_item" }]), []);
});

for (const hasOtherError of [false, true]) test(`validation API ignores legacy duplicates; other error=${hasOtherError}`, async () => {
  const app = Fastify();
  const database = { async query(statement: string) {
    if (statement.includes("estimate_exists")) return { recordset: [{ estimate_exists: true }] };
    assert.match(statement, /dbo.fn_estimate_validation/);
    return { recordset: [
      { code: "duplicate_cost_item", message: "legacy", entity_type: "CostItem", entity_id: 1 },
      ...(hasOtherError ? [{ code: "missing_unit_cost", message: "price", entity_type: "CostItem", entity_id: 2 }] : []),
    ] };
  } } as unknown as Database;
  const users = { async demandPermission() {} } as unknown as CurrentUserService;
  registerEstimateRoutes(app, {} as AppConfig, database, users);
  try {
    const response = await app.inject({ method: "GET", url: "/api/v1/estimates/1/validation" });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().valid, !hasOtherError);
    assert.deepEqual(response.json().issues.map((issue: { code: string }) => issue.code), hasOtherError ? ["missing_unit_cost"] : []);
  } finally { await app.close(); }
});
