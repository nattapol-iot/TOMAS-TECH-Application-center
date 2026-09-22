import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type { Database } from "../src/db.js";
import { registerErrorHandler } from "../src/errors.js";
import { COST_ITEM_LOOKUP_SQL, escapeLikePattern, mapLookupRow, parseLookupField, registerEstimateCostLookupRoutes } from "../src/routes/estimate-cost-lookup.js";
import type { CurrentUserService } from "../src/users.js";

type Captured = { text: string; parameters: Record<string, unknown> };

/** Database stub: records the statement and bound parameters, answers with canned rows. */
function lookupDatabase(rows: Array<Record<string, unknown>>) {
  const calls: Captured[] = [];
  const database = {
    async query(text: string, bind?: (request: { input: (name: string, type: unknown, value: unknown) => void }) => void) {
      const parameters: Record<string, unknown> = {};
      bind?.({ input: (name, _type, value) => { parameters[name] = value; } });
      calls.push({ text, parameters });
      return { recordset: rows };
    },
  } as unknown as Database;
  return { database, calls };
}

function userService(permissions: string[]): CurrentUserService {
  return {
    async demandPermission(_request: unknown, permission: string) { permissions.push(permission); },
    async required() { return { id: 7, role: "Engineer", name: "Estimator" }; },
  } as unknown as CurrentUserService;
}

const row = {
  source_kind: "Estimate", source_id: "31", source_number: "EST-2026-0007", project_name: "Line 3",
  category_code: "01", category: "Hardware", subcategory: "", module: "PLC", item_code: "PLC-01", description: "PLC and HMI",
  brand: "Siemens", model: "S7-1500", specification: null, supplier_id: "5", supplier_name: "Siemens Thailand", unit: "Set",
  unit_cost: "48000.0000", price_source: "Supplier Quotation", reference_no: "QT-1", reference_project: "P-1",
  price_date: new Date("2026-08-14T00:00:00.000Z"), uses: "3",
};

test("LIKE wildcards in a part number are escaped so 50% and AB_1 match literally", () => {
  assert.equal(escapeLikePattern("50%_[a]\\"), "50\\%\\_\\[a]\\\\");
  assert.equal(escapeLikePattern("PLC-01"), "PLC-01");
  assert.match(COST_ITEM_LOOKUP_SQL, /LIKE @pattern ESCAPE '\\'/, "every LIKE must pair with the escape character");
  assert.doesNotMatch(COST_ITEM_LOOKUP_SQL, /LIKE @pattern(?! ESCAPE)/);
});

test("the lookup field is whitelisted; anything else is a 400, not a SQL fragment", () => {
  assert.equal(parseLookupField(undefined), "description");
  for (const field of ["itemCode", "description", "brand", "supplier"]) assert.equal(parseLookupField(field), field);
  assert.throws(() => parseLookupField("item_code; DROP TABLE"), /Lookup field is invalid/);
});

test("the query reads only live current-revision lines and collapses to one row per part", () => {
  assert.match(COST_ITEM_LOOKUP_SQL, /e\.revision=ci\.revision AND e\.deleted_at IS NULL/);
  assert.match(COST_ITEM_LOOKUP_SQL, /WHERE ci\.deleted_at IS NULL/);
  assert.match(COST_ITEM_LOOKUP_SQL, /FROM dbo\.supplier_price_history h/);
  assert.match(COST_ITEM_LOOKUP_SQL, /ROW_NUMBER\(\) OVER \(PARTITION BY c\.item_code, c\.description, c\.brand, c\.model, c\.supplier_id/);
  assert.match(COST_ITEM_LOOKUP_SQL, /WHERE rn=1/);
  assert.doesNotMatch(COST_ITEM_LOOKUP_SQL, /\b(INSERT|UPDATE|DELETE|MERGE)\b/, "the lookup never writes");
});

test("GET cost-item-lookup asks for estimate.read, binds escaped patterns, clamps the limit and maps rows", async () => {
  const permissions: string[] = [];
  const { database, calls } = lookupDatabase([row]);
  const app = Fastify(); registerErrorHandler(app);
  registerEstimateCostLookupRoutes(app, database, userService(permissions));
  const response = await app.inject({ method: "GET", url: "/api/v1/estimates/cost-item-lookup?q=PLC_0&field=itemCode&limit=99" });
  assert.equal(response.statusCode, 200, response.body);
  assert.deepEqual(permissions, ["estimate.read"]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.text, COST_ITEM_LOOKUP_SQL);
  assert.deepEqual(calls[0]!.parameters, { pattern: "%PLC\\_0%", prefix: "PLC\\_0%", field: "itemCode", limit: 30 });
  const body = response.json() as { items: Array<ReturnType<typeof mapLookupRow>> };
  assert.equal(body.items.length, 1);
  assert.deepEqual(body.items[0], {
    key: "estimate:31", sourceKind: "Estimate", sourceNumber: "EST-2026-0007", projectName: "Line 3",
    categoryCode: "01", category: "Hardware", subcategory: "", module: "PLC", itemCode: "PLC-01", description: "PLC and HMI",
    brand: "Siemens", model: "S7-1500", specification: null, supplierId: 5, supplierName: "Siemens Thailand", unit: "Set",
    unitCost: 48000, priceSource: "Supplier Quotation", referenceNumber: "QT-1", referenceProject: "P-1", priceDate: "2026-08-14", uses: 3,
  });
  await app.close();
});

test("a query under two characters returns nothing without touching the database", async () => {
  const { database, calls } = lookupDatabase([row]);
  const app = Fastify(); registerErrorHandler(app);
  registerEstimateCostLookupRoutes(app, database, userService([]));
  for (const url of ["/api/v1/estimates/cost-item-lookup?q=P", "/api/v1/estimates/cost-item-lookup?q=%20%20", "/api/v1/estimates/cost-item-lookup"]) {
    const response = await app.inject({ method: "GET", url });
    assert.equal(response.statusCode, 200, url);
    assert.deepEqual(response.json(), { items: [] });
  }
  assert.equal(calls.length, 0);
  await app.close();
});

test("an unknown field is rejected before any query runs", async () => {
  const { database, calls } = lookupDatabase([row]);
  const app = Fastify(); registerErrorHandler(app);
  registerEstimateCostLookupRoutes(app, database, userService([]));
  const response = await app.inject({ method: "GET", url: "/api/v1/estimates/cost-item-lookup?q=PLC&field=model" });
  assert.equal(response.statusCode, 400);
  assert.equal(calls.length, 0);
  await app.close();
});

test("history rows map to the Historical Purchase kind with their own key space", () => {
  const mapped = mapLookupRow({ ...row, source_kind: "Historical Purchase", source_id: 31, supplier_id: null, supplier_name: "Local Vendor", price_date: null, uses: 1 });
  assert.equal(mapped.key, "history:31");
  assert.equal(mapped.sourceKind, "Historical Purchase");
  assert.equal(mapped.supplierId, null);
  assert.equal(mapped.priceDate, null);
});

/*
 * The Price Library is built from three feeds — estimate cost lines, imported purchase
 * history, and supplier quotation lines. The type-ahead read only the first two, so a
 * price entered through a quotation showed in the library and never in the Item box.
 */

test("quotation lines are one of the sources the type-ahead searches", () => {
  assert.match(COST_ITEM_LOOKUP_SQL, /FROM dbo\.supplier_quotation_lines l/);
  assert.match(COST_ITEM_LOOKUP_SQL, /INNER JOIN dbo\.supplier_quotations q ON q\.id=l\.quotation_id/);
  // A superseded quotation is not a current price, exactly as the Price Library reads it.
  assert.match(COST_ITEM_LOOKUP_SQL, /q\.status IS NULL OR q\.status<>N'Superseded'/);
  // A cost line has no currency column, so only THB may be offered as a unit cost.
  assert.match(COST_ITEM_LOOKUP_SQL, /AND l\.currency=N'THB'/);
  // Every branch of the union must select the same 22 columns.
  const branches = COST_ITEM_LOOKUP_SQL.slice(
    COST_ITEM_LOOKUP_SQL.indexOf("WITH candidates AS ("),
    COST_ITEM_LOOKUP_SQL.indexOf("), ranked AS ("),
  ).split(/\bUNION ALL\b/);
  assert.equal(branches.length, 3, "the candidate union should carry all three price feeds");
});

test("a quoted line and a referenced line keep their own provenance and key space", () => {
  const quoted = mapLookupRow({
    ...row, source_kind: "Supplier Quotation", source_id: 31, source_number: "SQ-2609-0003",
    price_source: "Supplier Quotation", category_code: "", category: "", module: "",
  });
  assert.equal(quoted.key, "quotation:31");
  assert.equal(quoted.sourceKind, "Supplier Quotation");
  assert.equal(quoted.priceSource, "Supplier Quotation");

  const referenced = mapLookupRow({
    ...row, source_kind: "Web Reference", source_id: 32, source_number: "RP-2609-0001",
    price_source: "Web Reference", category_code: "", category: "", module: "",
  });
  assert.equal(referenced.key, "quotation:32");
  assert.equal(referenced.sourceKind, "Web Reference");
  assert.equal(referenced.priceSource, "Web Reference");
});

test("an unrecognised source kind falls back rather than inventing a key space", () => {
  const mapped = mapLookupRow({ ...row, source_kind: "Something New", source_id: 9 });
  assert.equal(mapped.sourceKind, "Estimate");
  assert.equal(mapped.key, "estimate:9");
});
