import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import sql from "mssql";
import type { Transaction } from "mssql";
import { registerErrorHandler } from "../src/errors.js";
import { assertEstimateTotals } from "../src/estimate-total-guard.js";

test("estimate total guard executes the database invariant for the locked estimate", async (t) => {
  let statement = "";
  let estimateId: unknown;
  t.mock.method(sql.Request.prototype, "input", function (this: InstanceType<typeof sql.Request>, name: string, _type: unknown, value: unknown) {
    if (name === "estimate_id") estimateId = value;
    return this;
  });
  t.mock.method(sql.Request.prototype, "query", async function (query: string) {
    statement = query;
    return { recordset: [] };
  });
  await assertEstimateTotals({} as Transaction, 42);
  assert.equal(estimateId, 42);
  assert.equal(statement, "EXEC dbo.assert_estimate_totals @estimate_id=@estimate_id;");
});

test("estimate total database overflow has a stable domain response", async () => {
  const app = Fastify();
  registerErrorHandler(app);
  app.get("/overflow", async () => {
    const error = Object.assign(Object.create(sql.RequestError.prototype) as sql.RequestError, { number: 51420, message: "Estimate total overflow" });
    throw error;
  });
  try {
    const response = await app.inject({ url: "/overflow" });
    assert.equal(response.statusCode, 422, response.body);
    assert.deepEqual(response.json(), {
      code: "estimate_total_out_of_range",
      message: "The estimate total exceeds the supported monetary range. Reduce quantities, rates, contingency or overhead before continuing.",
      details: null,
    });
  } finally { await app.close(); }
});
