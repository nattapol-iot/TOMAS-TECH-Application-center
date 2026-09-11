import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import sql from "mssql";
import type { AppConfig } from "../src/config.js";
import type { Database } from "../src/db.js";
import { registerErrorHandler } from "../src/errors.js";
import { registerLaborPackageRoutes } from "../src/routes/labor-packages.js";
import { registerLaborRateRoutes } from "../src/routes/labor-rates.js";
import type { CurrentUserService } from "../src/users.js";

/* These routes are mostly locking, authorisation and statement order, so the
   tests drive the real handlers and capture the SQL they issue. Every statement
   is answered from a canned table keyed on a fragment of its text; anything not
   matched comes back empty, which is enough for audit and activity writes.

   sql.Request.prototype.query is patched rather than stubbed at the Database
   boundary because everything inside a transaction builds its own request. The
   original is always restored. */

type Recordset = { recordset: Array<Record<string, unknown>> };
type Responder = (statement: string, parameters: Record<string, unknown>) => Recordset | undefined;
type Captured = { sql: string; parameters: Record<string, unknown> };

const ROW_VERSION = Buffer.from("0000000000000001", "hex");
const NEXT_ROW_VERSION = Buffer.from("0000000000000002", "hex");
const BUSINESS_CONFIG = { businessTimeZone: "Asia/Bangkok" } as unknown as AppConfig;

function captureSql(responder: Responder) {
  const prototype = sql.Request.prototype as unknown as { query: unknown };
  const original = prototype.query;
  const statements: Captured[] = [];
  prototype.query = async function patched(this: { parameters: Record<string, { value: unknown }> }, statement: string) {
    const parameters = Object.fromEntries(
      Object.entries(this.parameters ?? {}).map(([name, parameter]) => [name, parameter.value]),
    );
    statements.push({ sql: statement, parameters });
    return responder(statement, parameters) ?? { recordset: [] };
  };
  return { statements, restore: () => { prototype.query = original; } };
}

/** A responder built from [fragment, rows] pairs, first match wins. */
function respondWith(...pairs: Array<[string, Array<Record<string, unknown>>]>): Responder {
  return (statement) => {
    for (const [fragment, rows] of pairs) if (statement.includes(fragment)) return { recordset: rows };
    return undefined;
  };
}

function transactionalDatabase(probe: Array<Record<string, unknown>>): Database {
  return {
    async query() { return { recordset: probe }; },
    async transaction(action: (transaction: object) => Promise<unknown>) { return action({}); },
  } as unknown as Database;
}

function userService(overrides: Partial<{ id: number; role: string }> = {}, permissions: string[] = []): CurrentUserService {
  return {
    async demandPermission(_request: unknown, permission: string) { permissions.push(permission); },
    async required() { return { id: 7, role: "Engineering Manager", name: "Rate Owner", ...overrides }; },
  } as unknown as CurrentUserService;
}

function firstMatching(statements: Captured[], fragment: string): Captured | undefined {
  return statements.find((entry) => entry.sql.includes(fragment));
}

function indexOfStatement(statements: Captured[], fragment: string): number {
  return statements.findIndex((entry) => entry.sql.includes(fragment));
}

/* ── EC-01 · rate master picker ─────────────────────────────────────────── */

test("the rate picker asks for estimate.read, not management access", async () => {
  const permissions: string[] = [];
  const app = Fastify(); registerErrorHandler(app);
  const database = {
    async query(statement: string) {
      return { recordset: statement.includes("COL_LENGTH") ? [{ present: 1 }] : [] };
    },
  } as unknown as Database;
  registerLaborRateRoutes(app, BUSINESS_CONFIG, database, userService({}, permissions));
  try {
    const response = await app.inject({ method: "GET", url: "/api/v1/labor-rates?costType=Engineering" });
    assert.equal(response.statusCode, 200, response.body);
    assert.deepEqual(permissions, ["estimate.read"]);
  } finally { await app.close(); }
});

test("the rate picker returns the daily and hourly figure for the cost type it was asked about", async () => {
  const row = {
    id: 12, code: "ENG-MID", level: "Middle Engineer", department: "Engineering", role_activity: "Commissioning",
    engineering_hourly: "625.0000", engineering_daily: "5000.0000",
    installation_hourly: "500.0000", installation_daily: "4000.0000",
    effective_from: "2026-01-01", effective_to: null, is_active: true, version: 2,
    default_erp_category: "Service", superseded_by_rate_id: null, notes: null,
    created_by_name: "Manager", total_count: 1,
  };
  const app = Fastify(); registerErrorHandler(app);
  const database = {
    async query(statement: string) {
      if (statement.includes("COL_LENGTH")) return { recordset: [{ present: 1 }] };
      return { recordset: [row] };
    },
  } as unknown as Database;
  registerLaborRateRoutes(app, BUSINESS_CONFIG, database, userService());
  try {
    const engineering = (await app.inject({ method: "GET", url: "/api/v1/labor-rates?costType=Engineering&on=2026-09-11" })).json();
    assert.equal(engineering.items[0].dailyRate, 5000);
    assert.equal(engineering.items[0].hourlyRate, 625);
    assert.equal(engineering.items[0].status, "Effective");
    assert.equal(engineering.items[0].defaultErpCategory, "Service");
    assert.equal(engineering.items[0].version, 2);
    assert.equal(engineering.masterFieldsAvailable, true);
    assert.equal(engineering.total, 1);

    const installation = (await app.inject({ method: "GET", url: "/api/v1/labor-rates?costType=Installation&on=2026-09-11" })).json();
    assert.equal(installation.items[0].dailyRate, 4000);
    assert.equal(installation.items[0].hourlyRate, 500);

    // Without a cost type the picker reports the window but no single rate.
    const neutral = (await app.inject({ method: "GET", url: "/api/v1/labor-rates" })).json();
    assert.equal(neutral.items[0].dailyRate, null);
    assert.equal(neutral.items[0].hourlyRate, null);
  } finally { await app.close(); }
});

test("on a database without migration 044 the picker still works and says so", async () => {
  const statements: string[] = [];
  const app = Fastify(); registerErrorHandler(app);
  const database = {
    async query(statement: string) {
      statements.push(statement);
      if (statement.includes("COL_LENGTH")) return { recordset: [{ present: 0 }] };
      return { recordset: [] };
    },
  } as unknown as Database;
  registerLaborRateRoutes(app, BUSINESS_CONFIG, database, userService());
  try {
    const response = await app.inject({ method: "GET", url: "/api/v1/labor-rates?search=middle" });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().masterFieldsAvailable, false);
    const listed = statements.find((statement) => statement.includes("FROM dbo.engineering_rates"))!;
    // The 044 columns are selected as typed nulls and never named in the filter,
    // so the statement compiles against the older schema.
    assert.ok(listed.includes("CAST(NULL AS nvarchar(40)) AS code"));
    assert.ok(!listed.includes("rate.code LIKE"));
    assert.ok(!listed.includes("rate.role_activity"));
  } finally { await app.close(); }
});

test("rate versioning is refused rather than half-attempted without migration 044", async () => {
  let transactions = 0;
  const app = Fastify(); registerErrorHandler(app);
  const database = {
    async query() { return { recordset: [{ present: 0 }] }; },
    async transaction() { transactions += 1; return {}; },
  } as unknown as Database;
  registerLaborRateRoutes(app, BUSINESS_CONFIG, database, userService());
  try {
    for (const url of [
      "/api/v1/master/engineering-rates/12/supersede",
      "/api/v1/master/engineering-rates/12/retire",
    ]) {
      const response = await app.inject({
        method: "POST", url,
        payload: {
          rowVersion: ROW_VERSION.toString("base64"), effectiveFrom: "2026-10-01", effectiveTo: null,
          engineeringHourly: 1, engineeringDaily: 1, installationHourly: 1, installationDaily: 1,
          reason: "Annual review",
        },
      });
      assert.equal(response.statusCode, 503, response.body);
      assert.match(response.json().code, /labor_rate_(lifecycle_unavailable)/);
    }
    assert.equal(transactions, 0);
  } finally { await app.close(); }
});

test("only Engineering Manager or Admin may change a rate, and the check runs before any query", async () => {
  let touched = false;
  const app = Fastify(); registerErrorHandler(app);
  const database = {
    async query() { touched = true; throw new Error("Unexpected database access"); },
    async transaction() { touched = true; throw new Error("Unexpected database access"); },
  } as unknown as Database;
  registerLaborRateRoutes(app, BUSINESS_CONFIG, database, userService({ role: "Engineer" }));
  try {
    const response = await app.inject({
      method: "POST", url: "/api/v1/master/engineering-rates/12/supersede",
      payload: { rowVersion: ROW_VERSION.toString("base64"), effectiveFrom: "2026-10-01", engineeringHourly: 1, engineeringDaily: 1, installationHourly: 1, installationDaily: 1, reason: "x" },
    });
    assert.equal(response.statusCode, 403, response.body);
    assert.equal(response.json().code, "engineering_rate_management_required");
    assert.equal(touched, false);
  } finally { await app.close(); }
});

test("superseding closes the incumbent, inserts the successor and links them — and never touches an estimate", async () => {
  const capture = captureSql(respondWith(
    ["FROM dbo.engineering_rates WITH (UPDLOCK, HOLDLOCK)", [{
      level: "Middle Engineer", department: "Engineering", code: "ENG-MID", role_activity: "Commissioning",
      default_erp_category: "Service", version: 1, effective_from: "2026-01-01", effective_to: null,
      is_active: true, superseded_by_rate_id: null,
      engineering_hourly: "625.0000", engineering_daily: "5000.0000",
      installation_hourly: "500.0000", installation_daily: "4000.0000", row_version: ROW_VERSION,
    }]],
    ["INSERT INTO dbo.engineering_rates", [{ id: 99, row_version: NEXT_ROW_VERSION }]],
  ));
  const app = Fastify(); registerErrorHandler(app);
  registerLaborRateRoutes(app, BUSINESS_CONFIG, transactionalDatabase([{ present: 1 }]), userService());
  try {
    const response = await app.inject({
      method: "POST", url: "/api/v1/master/engineering-rates/12/supersede",
      payload: {
        rowVersion: ROW_VERSION.toString("base64"), effectiveFrom: "2026-10-01",
        engineeringHourly: 700, engineeringDaily: 5600, installationHourly: 560, installationDaily: 4480,
        reason: "2027 rate card",
      },
    });
    assert.equal(response.statusCode, 201, response.body);
    const body = response.json();
    assert.equal(body.supersededRateId, 12);
    assert.equal(body.supersededEffectiveTo, "2026-09-30");
    assert.equal(body.rateId, 99);
    assert.equal(body.version, 2);
    assert.equal(body.effectiveFrom, "2026-10-01");

    const close = firstMatching(capture.statements, "SET effective_to = @effective_to")!;
    assert.equal(close.parameters.effective_to, "2026-09-30");
    const insert = firstMatching(capture.statements, "INSERT INTO dbo.engineering_rates")!;
    assert.equal(insert.parameters.effective_from, "2026-10-01");
    assert.equal(insert.parameters.version, 2);
    // The successor inherits identity from the incumbent rather than drifting.
    assert.equal(insert.parameters.level, "Middle Engineer");
    assert.equal(insert.parameters.department, "Engineering");
    assert.equal(insert.parameters.code, "ENG-MID");
    assert.equal(insert.parameters.erp_category, "Service");

    // Order matters: closing first is what keeps the two windows from overlapping.
    assert.ok(indexOfStatement(capture.statements, "SET effective_to = @effective_to")
      < indexOfStatement(capture.statements, "INSERT INTO dbo.engineering_rates"));
    assert.ok(indexOfStatement(capture.statements, "INSERT INTO dbo.engineering_rates")
      < indexOfStatement(capture.statements, "SET superseded_by_rate_id = @successor"));

    // Existing estimate data is never read or written by a rate change.
    for (const entry of capture.statements) {
      assert.ok(!entry.sql.includes("dbo.manhour_lines"), entry.sql);
      assert.ok(!entry.sql.includes("UPDATE dbo.estimates"), entry.sql);
    }
  } finally { capture.restore(); await app.close(); }
});

test("superseding refuses a stale row version and an already-superseded rate", async () => {
  const incumbent = {
    level: "Middle Engineer", department: "Engineering", code: null, role_activity: "",
    default_erp_category: null, version: 1, effective_from: "2026-01-01", effective_to: null,
    is_active: true, superseded_by_rate_id: null,
    engineering_hourly: "1", engineering_daily: "1", installation_hourly: "1", installation_daily: "1",
    row_version: ROW_VERSION,
  };
  const payload = {
    rowVersion: ROW_VERSION.toString("base64"), effectiveFrom: "2026-10-01",
    engineeringHourly: 1, engineeringDaily: 1, installationHourly: 1, installationDaily: 1, reason: "r",
  };
  for (const [expectedCode, row] of [
    ["concurrency_conflict", { ...incumbent, row_version: NEXT_ROW_VERSION }],
    ["labor_rate_already_superseded", { ...incumbent, superseded_by_rate_id: 99 }],
    ["labor_rate_inactive", { ...incumbent, is_active: false }],
  ] as Array<[string, Record<string, unknown>]>) {
    const capture = captureSql(respondWith(["FROM dbo.engineering_rates WITH (UPDLOCK, HOLDLOCK)", [row]]));
    const app = Fastify(); registerErrorHandler(app);
    registerLaborRateRoutes(app, BUSINESS_CONFIG, transactionalDatabase([{ present: 1 }]), userService());
    try {
      const response = await app.inject({ method: "POST", url: "/api/v1/master/engineering-rates/12/supersede", payload });
      assert.equal(response.statusCode, 409, response.body);
      assert.equal(response.json().code, expectedCode);
      assert.equal(firstMatching(capture.statements, "INSERT INTO dbo.engineering_rates"), undefined);
    } finally { capture.restore(); await app.close(); }
  }
});

test("retiring a rate that still prices live lines is refused, and writes nothing", async () => {
  const capture = captureSql(respondWith(
    ["FROM dbo.engineering_rates WITH (UPDLOCK, HOLDLOCK)", [{
      level: "Middle Engineer", department: "Engineering", effective_from: "2026-01-01", effective_to: null,
      is_active: true, engineering_daily: "5000.0000", installation_daily: "4000.0000", row_version: ROW_VERSION,
    }]],
    ["WITH priced AS", [
      { estimate_no: "EST-2026-0001", affected_estimates: 2 },
      { estimate_no: "EST-2026-0007", affected_estimates: 2 },
    ]],
  ));
  const app = Fastify(); registerErrorHandler(app);
  registerLaborRateRoutes(app, BUSINESS_CONFIG, transactionalDatabase([{ present: 1 }]), userService());
  try {
    const response = await app.inject({
      method: "POST", url: "/api/v1/master/engineering-rates/12/retire",
      payload: { rowVersion: ROW_VERSION.toString("base64"), effectiveTo: "2026-06-30", reason: "superseded by contract" },
    });
    assert.equal(response.statusCode, 409, response.body);
    const error = response.json();
    assert.equal(error.code, "labor_rate_in_use");
    assert.equal(error.details.affectedEstimates, 2);
    assert.deepEqual(error.details.sample, ["EST-2026-0001", "EST-2026-0007"]);
    // Nothing was closed: the saved lines keep the rate they were priced at.
    assert.equal(firstMatching(capture.statements, "SET effective_to = @effective_to"), undefined);
    const probe = firstMatching(capture.statements, "WITH priced AS")!;
    assert.equal(probe.parameters.effective_to, "2026-06-30");
    assert.equal(probe.parameters.engineering_daily, 5000);
  } finally { capture.restore(); await app.close(); }
});

test("retiring a rate nothing depends on closes it without repricing anything", async () => {
  const capture = captureSql(respondWith(
    ["FROM dbo.engineering_rates WITH (UPDLOCK, HOLDLOCK)", [{
      level: "Middle Engineer", department: "Engineering", effective_from: "2026-01-01", effective_to: null,
      is_active: true, engineering_daily: "5000.0000", installation_daily: "4000.0000", row_version: ROW_VERSION,
    }]],
    ["WITH priced AS", []],
    ["SET effective_to = @effective_to", [{ row_version: NEXT_ROW_VERSION }]],
  ));
  const app = Fastify(); registerErrorHandler(app);
  registerLaborRateRoutes(app, BUSINESS_CONFIG, transactionalDatabase([{ present: 1 }]), userService());
  try {
    const response = await app.inject({
      method: "POST", url: "/api/v1/master/engineering-rates/12/retire",
      payload: { rowVersion: ROW_VERSION.toString("base64"), effectiveTo: "2026-12-31", reason: "new rate card" },
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.deepEqual(response.json(), {
      id: 12, effectiveTo: "2026-12-31", alreadyClosed: false, rowVersion: NEXT_ROW_VERSION.toString("base64"),
    });
    // No UPDATE of a man-hour line, no estimate touch: amounts cannot move.
    for (const entry of capture.statements) {
      assert.ok(!entry.sql.includes("UPDATE dbo.manhour_lines"), entry.sql);
      assert.ok(!entry.sql.includes("UPDATE dbo.estimates"), entry.sql);
    }
  } finally { capture.restore(); await app.close(); }
});

/* ── EC-02 · reusable labor packages ───────────────────────────────────── */

const PACKAGE_PAYLOAD = {
  code: "LP-COMM", name: "Commissioning", costType: "Engineering", status: "Draft",
  lines: [{
    activity: "Site commissioning", department: "Engineering", level: "Middle Engineer",
    costType: "Engineering", provider: "Internal", rateBasis: "Hourly", defaultHours: 10,
    defaultHoursPerDay: 8, defaultEngineers: 2, defaultErpCategory: "Service",
  }],
};

test("labor package endpoints are refused with a plain message without migration 044", async () => {
  let transactions = 0;
  const app = Fastify(); registerErrorHandler(app);
  const database = {
    async query() { return { recordset: [{ present: 0 }] }; },
    async transaction() { transactions += 1; return {}; },
  } as unknown as Database;
  registerLaborPackageRoutes(app, BUSINESS_CONFIG, database, userService());
  try {
    const list = await app.inject({ method: "GET", url: "/api/v1/labor-packages" });
    assert.equal(list.statusCode, 503, list.body);
    assert.equal(list.json().code, "labor_packages_unavailable");
    const apply = await app.inject({
      method: "POST", url: "/api/v1/estimates/5/apply-labor-package",
      payload: { estimateRowVersion: ROW_VERSION.toString("base64"), packageId: 3, ownerId: 7 },
    });
    assert.equal(apply.statusCode, 503, apply.body);
    assert.equal(transactions, 0);
  } finally { await app.close(); }
});

test("the package list counts with the same filter it lists with", async () => {
  const statements: string[] = [];
  const app = Fastify(); registerErrorHandler(app);
  const database = {
    async query(statement: string) {
      statements.push(statement);
      if (statement.includes("OBJECT_ID")) return { recordset: [{ present: 1 }] };
      if (statement.includes("SELECT COUNT(*) AS total")) return { recordset: [{ total: 0 }] };
      return { recordset: [] };
    },
  } as unknown as Database;
  registerLaborPackageRoutes(app, BUSINESS_CONFIG, database, userService());
  try {
    const response = await app.inject({ method: "GET", url: "/api/v1/labor-packages?search=commission&costType=Engineering" });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().total, 0);
    const filtered = statements.filter((statement) => statement.includes("FROM dbo.labor_packages p"));
    assert.equal(filtered.length, 2);
    for (const statement of filtered) assert.ok(statement.includes("@search = N'' OR p.code LIKE"));
  } finally { await app.close(); }
});

test("publishing a package needs master.write; drafting it does not", async () => {
  for (const [status, expected] of [["Draft", ["estimate.write"]], ["Active", ["estimate.write", "master.write"]]] as Array<[string, string[]]>) {
    const permissions: string[] = [];
    const capture = captureSql(respondWith(["INSERT INTO dbo.labor_packages", [{ id: 31 }]]));
    const app = Fastify(); registerErrorHandler(app);
    registerLaborPackageRoutes(app, BUSINESS_CONFIG, transactionalDatabase([{ present: 1 }]), userService({}, permissions));
    try {
      const response = await app.inject({ method: "POST", url: "/api/v1/labor-packages", payload: { ...PACKAGE_PAYLOAD, status } });
      assert.equal(response.statusCode, 201, response.body);
      assert.deepEqual(permissions, expected);
    } finally { capture.restore(); await app.close(); }
  }
});

test("a stored hourly line keeps both the authored hours and the man-days the ledger uses", async () => {
  const capture = captureSql(respondWith(["INSERT INTO dbo.labor_packages", [{ id: 31 }]]));
  const app = Fastify(); registerErrorHandler(app);
  registerLaborPackageRoutes(app, BUSINESS_CONFIG, transactionalDatabase([{ present: 1 }]), userService());
  try {
    const response = await app.inject({ method: "POST", url: "/api/v1/labor-packages", payload: PACKAGE_PAYLOAD });
    assert.equal(response.statusCode, 201, response.body);
    const line = firstMatching(capture.statements, "INSERT INTO dbo.labor_package_lines")!;
    assert.equal(line.parameters.hours, 10);
    assert.equal(line.parameters.man_days, 1.25);
    assert.equal(line.parameters.hours_per_day, 8);
    assert.equal(line.parameters.rate_basis, "Hourly");
    assert.equal(line.parameters.erp_category, "Service");
  } finally { capture.restore(); await app.close(); }
});

test("a package holds one cost type, and an unknown vocabulary value is rejected before SQL", async () => {
  let transactions = 0;
  const app = Fastify(); registerErrorHandler(app);
  const database = {
    async query() { return { recordset: [{ present: 1 }] }; },
    async transaction() { transactions += 1; return {}; },
  } as unknown as Database;
  registerLaborPackageRoutes(app, BUSINESS_CONFIG, database, userService());
  try {
    const mixed = await app.inject({
      method: "POST", url: "/api/v1/labor-packages",
      payload: { ...PACKAGE_PAYLOAD, lines: [{ ...PACKAGE_PAYLOAD.lines[0], costType: "Installation" }] },
    });
    assert.equal(mixed.statusCode, 400, mixed.body);
    assert.match(mixed.json().message, /package is Engineering/);

    const unknownBasis = await app.inject({
      method: "POST", url: "/api/v1/labor-packages",
      payload: { ...PACKAGE_PAYLOAD, lines: [{ ...PACKAGE_PAYLOAD.lines[0], rateBasis: "Monthly" }] },
    });
    assert.equal(unknownBasis.statusCode, 400, unknownBasis.body);

    const supplierWithoutRate = await app.inject({
      method: "POST", url: "/api/v1/labor-packages",
      payload: { ...PACKAGE_PAYLOAD, lines: [{ ...PACKAGE_PAYLOAD.lines[0], provider: "Supplier" }] },
    });
    assert.equal(supplierWithoutRate.statusCode, 400, supplierWithoutRate.body);
    assert.match(supplierWithoutRate.json().message, /reference daily rate/);

    assert.equal(transactions, 0);
  } finally { await app.close(); }
});

test("a published package cannot be overwritten in place", async () => {
  const capture = captureSql(respondWith(
    ["FROM dbo.labor_packages WITH (UPDLOCK,HOLDLOCK)", [{
      code: "LP-COMM", name: "Commissioning", status: "Active", revision: 3, row_version: ROW_VERSION,
    }]],
  ));
  const app = Fastify(); registerErrorHandler(app);
  registerLaborPackageRoutes(app, BUSINESS_CONFIG, transactionalDatabase([{ present: 1 }]), userService());
  try {
    const response = await app.inject({
      method: "PUT", url: "/api/v1/labor-packages/31",
      payload: { ...PACKAGE_PAYLOAD, rowVersion: ROW_VERSION.toString("base64") },
    });
    assert.equal(response.statusCode, 409, response.body);
    assert.equal(response.json().code, "published_package_locked");
    assert.equal(firstMatching(capture.statements, "UPDATE dbo.labor_packages SET code=@code"), undefined);
  } finally { capture.restore(); await app.close(); }
});

/* ── EC-02 / EC-03 · applying a package ────────────────────────────────── */

const ESTIMATE = {
  estimate_no: "EST-2026-0001", project_name: "Line 3 retrofit", revision: 2, status: "Engineering Input",
  owner_id: 7, due_date: "2026-12-01", row_version: ROW_VERSION,
};

function applyResponder(lines: Array<Record<string, unknown>>, packageOverrides: Record<string, unknown> = {}): Responder {
  return respondWith(
    ["FROM dbo.estimates WITH (UPDLOCK,HOLDLOCK)", [ESTIMATE]],
    ["FROM dbo.labor_packages WITH(UPDLOCK,HOLDLOCK)", [{
      code: "LP-COMM", name: "Commissioning", cost_type: "Engineering", revision: 3, status: "Active",
      ...packageOverrides,
    }]],
    ["FROM dbo.labor_package_lines WHERE package_id=@package_id", lines],
    ["FROM dbo.engineering_rates WHERE level=@level", [{ rate: "5000.0000" }]],
    ["owner_valid", [{ owner_valid: true, supplier_valid: true }]],
    ["INSERT INTO dbo.manhour_lines", [{ id: 900 }]],
    ["INSERT INTO dbo.estimate_erp_mappings", [{ seeded: 1 }]],
    ["UPDATE dbo.estimates SET updated_by=@actor", [{ row_version: NEXT_ROW_VERSION }]],
  );
}

const INTERNAL_LINE = {
  id: 51, activity: "Site commissioning", department: "Engineering", level: "Middle Engineer",
  cost_type: "Engineering", provider: "Internal", rate_basis: "Hourly",
  default_engineers: "2.00", default_man_days: "1.25", default_hours: "10.00", default_hours_per_day: "8.00",
  reference_daily_rate: "4800.0000", default_erp_category: "Service", remark: "from the library",
};

test("applying a package writes man-hour lines at the live master rate, not the package's reference", async () => {
  const capture = captureSql(applyResponder([INTERNAL_LINE]));
  const app = Fastify(); registerErrorHandler(app);
  registerLaborPackageRoutes(app, BUSINESS_CONFIG, transactionalDatabase([{ present: 1 }]), userService());
  try {
    const response = await app.inject({
      method: "POST", url: "/api/v1/estimates/5/apply-labor-package",
      payload: { estimateRowVersion: ROW_VERSION.toString("base64"), packageId: 31, ownerId: 7 },
    });
    assert.equal(response.statusCode, 201, response.body);
    const body = response.json();
    assert.equal(body.lines, 1);
    assert.equal(body.reference, "LP-COMM R03");
    assert.equal(body.workPackage, "Commissioning");
    assert.equal(body.estimateRowVersion, NEXT_ROW_VERSION.toString("base64"));

    const insert = firstMatching(capture.statements, "INSERT INTO dbo.manhour_lines")!;
    // 5000 from dbo.engineering_rates, not the 4800 the package remembered.
    assert.equal(insert.parameters.rate, 5000);
    assert.equal(insert.parameters.engineers, 2);
    assert.equal(insert.parameters.man_days, 1.25);
    assert.equal(insert.parameters.hours, 8);
    assert.equal(insert.parameters.provider, "Internal");
    assert.equal(insert.parameters.supplier, null);
    assert.equal(insert.parameters.quotation, null);
    assert.equal(insert.parameters.revision, 2);
    assert.equal(insert.parameters.remark, "from the library");

    const applied = body.appliedLines[0];
    assert.equal(applied.dailyRate, 5000);
    assert.equal(applied.rateSource, "Engineering Rate Master");
    assert.equal(applied.requestedHours, 10);
    assert.equal(applied.effectiveHours, 10);
    assert.equal(applied.erpCategory, "Service");

    // The whole apply sits inside the estimate lock and the aggregate guard.
    assert.ok(indexOfStatement(capture.statements, "FROM dbo.estimates WITH (UPDLOCK,HOLDLOCK)") === 0);
    assert.ok(firstMatching(capture.statements, "EXEC dbo.assert_estimate_totals"));
  } finally { capture.restore(); await app.close(); }
});

test("an applied ERP category is seeded only where the estimator has not already chosen one", async () => {
  const capture = captureSql(applyResponder([INTERNAL_LINE]));
  const app = Fastify(); registerErrorHandler(app);
  registerLaborPackageRoutes(app, BUSINESS_CONFIG, transactionalDatabase([{ present: 1 }]), userService());
  try {
    const response = await app.inject({
      method: "POST", url: "/api/v1/estimates/5/apply-labor-package",
      payload: {
        estimateRowVersion: ROW_VERSION.toString("base64"), packageId: 31, ownerId: 7,
        lines: [{ lineId: 51, erpCategory: "Installation" }],
      },
    });
    assert.equal(response.statusCode, 201, response.body);
    const mapping = firstMatching(capture.statements, "INSERT INTO dbo.estimate_erp_mappings")!;
    // The override wins over the package default...
    assert.equal(mapping.parameters.category, "Installation");
    assert.equal(mapping.parameters.revision, 2);
    // ...but an existing mapping is never replaced.
    assert.ok(mapping.sql.includes("WHERE NOT EXISTS"));
    assert.ok(mapping.sql.includes("source_type=N'ManhourLine'"));
    assert.ok(!mapping.sql.includes("UPDATE dbo.estimate_erp_mappings"));
  } finally { capture.restore(); await app.close(); }
});

test("no ERP row is written when neither the package nor the caller names a category", async () => {
  const capture = captureSql(applyResponder([{ ...INTERNAL_LINE, default_erp_category: null }]));
  const app = Fastify(); registerErrorHandler(app);
  registerLaborPackageRoutes(app, BUSINESS_CONFIG, transactionalDatabase([{ present: 1 }]), userService());
  try {
    const response = await app.inject({
      method: "POST", url: "/api/v1/estimates/5/apply-labor-package",
      payload: { estimateRowVersion: ROW_VERSION.toString("base64"), packageId: 31, ownerId: 7 },
    });
    assert.equal(response.statusCode, 201, response.body);
    // Left for materializeErpMappings to default at submit, exactly as today.
    assert.equal(firstMatching(capture.statements, "INSERT INTO dbo.estimate_erp_mappings"), undefined);
    assert.equal(response.json().appliedLines[0].erpCategory, null);
  } finally { capture.restore(); await app.close(); }
});

test("every stored default is overrideable at apply time", async () => {
  const capture = captureSql(applyResponder([INTERNAL_LINE]));
  const app = Fastify(); registerErrorHandler(app);
  registerLaborPackageRoutes(app, BUSINESS_CONFIG, transactionalDatabase([{ present: 1 }]), userService());
  try {
    const response = await app.inject({
      method: "POST", url: "/api/v1/estimates/5/apply-labor-package",
      payload: {
        estimateRowVersion: ROW_VERSION.toString("base64"), packageId: 31, ownerId: 7,
        package: "Stage 2 commissioning",
        lines: [{ lineId: 51, activity: "Hot commissioning", engineers: 3, hours: 4, hoursPerDay: 10, remark: null }],
      },
    });
    assert.equal(response.statusCode, 201, response.body);
    const insert = firstMatching(capture.statements, "INSERT INTO dbo.manhour_lines")!;
    assert.equal(insert.parameters.package, "Stage 2 commissioning");
    assert.equal(insert.parameters.activity, "Hot commissioning");
    assert.equal(insert.parameters.engineers, 3);
    assert.equal(insert.parameters.man_days, 0.4);
    assert.equal(insert.parameters.hours, 10);
    assert.equal(insert.parameters.remark, null);
  } finally { capture.restore(); await app.close(); }
});

test("an internal rate cannot be set on the line, and a supplier activity needs its quotation", async () => {
  const supplierLine = {
    ...INTERNAL_LINE, id: 52, provider: "Supplier", rate_basis: "Daily",
    default_hours: null, reference_daily_rate: "7500.0000",
  };
  for (const [expectedCode, lines, overrides] of [
    ["internal_rate_not_editable", [INTERNAL_LINE], [{ lineId: 51, dailyRate: 9999 }]],
    ["validation_failed", [supplierLine], []],
  ] as Array<[string, Array<Record<string, unknown>>, Array<Record<string, unknown>>]>) {
    const capture = captureSql(applyResponder(lines));
    const app = Fastify(); registerErrorHandler(app);
    registerLaborPackageRoutes(app, BUSINESS_CONFIG, transactionalDatabase([{ present: 1 }]), userService());
    try {
      const response = await app.inject({
        method: "POST", url: "/api/v1/estimates/5/apply-labor-package",
        payload: { estimateRowVersion: ROW_VERSION.toString("base64"), packageId: 31, ownerId: 7, lines: overrides },
      });
      assert.equal(response.statusCode, 400, response.body);
      assert.equal(response.json().code, expectedCode);
      assert.equal(firstMatching(capture.statements, "INSERT INTO dbo.manhour_lines"), undefined);
    } finally { capture.restore(); await app.close(); }
  }
});

test("a supplier activity applies with its own quotation and its own rate", async () => {
  const supplierLine = {
    ...INTERNAL_LINE, id: 52, activity: "Outsourced commissioning", provider: "Supplier", rate_basis: "Daily",
    default_hours: null, default_man_days: "2.00", reference_daily_rate: "7500.0000",
  };
  const capture = captureSql(applyResponder([supplierLine]));
  const app = Fastify(); registerErrorHandler(app);
  registerLaborPackageRoutes(app, BUSINESS_CONFIG, transactionalDatabase([{ present: 1 }]), userService());
  try {
    const response = await app.inject({
      method: "POST", url: "/api/v1/estimates/5/apply-labor-package",
      payload: {
        estimateRowVersion: ROW_VERSION.toString("base64"), packageId: 31, ownerId: 7,
        lines: [{ lineId: 52, supplierId: 14, quotationNumber: "QT-2026-118", priceDate: "2026-09-01", dailyRate: 7900 }],
      },
    });
    assert.equal(response.statusCode, 201, response.body);
    const insert = firstMatching(capture.statements, "INSERT INTO dbo.manhour_lines")!;
    assert.equal(insert.parameters.provider, "Supplier");
    assert.equal(insert.parameters.supplier, 14);
    assert.equal(insert.parameters.quotation, "QT-2026-118");
    assert.equal(insert.parameters.price_date, "2026-09-01");
    assert.equal(insert.parameters.rate, 7900);
    // A supplier line never consults the internal rate master.
    assert.equal(firstMatching(capture.statements, "FROM dbo.engineering_rates WHERE level=@level"), undefined);
    assert.equal(response.json().appliedLines[0].rateSource, "Supplier quotation");
  } finally { capture.restore(); await app.close(); }
});

test("a missing master rate fails the whole apply instead of pricing a line at zero", async () => {
  const responder = respondWith(
    ["FROM dbo.estimates WITH (UPDLOCK,HOLDLOCK)", [ESTIMATE]],
    ["FROM dbo.labor_packages WITH(UPDLOCK,HOLDLOCK)", [{
      code: "LP-COMM", name: "Commissioning", cost_type: "Engineering", revision: 3, status: "Active",
    }]],
    ["FROM dbo.labor_package_lines WHERE package_id=@package_id", [INTERNAL_LINE]],
    ["FROM dbo.engineering_rates WHERE level=@level", []],
  );
  const capture = captureSql(responder);
  const app = Fastify(); registerErrorHandler(app);
  registerLaborPackageRoutes(app, BUSINESS_CONFIG, transactionalDatabase([{ present: 1 }]), userService());
  try {
    const response = await app.inject({
      method: "POST", url: "/api/v1/estimates/5/apply-labor-package",
      payload: { estimateRowVersion: ROW_VERSION.toString("base64"), packageId: 31, ownerId: 7 },
    });
    assert.equal(response.statusCode, 422, response.body);
    assert.equal(response.json().code, "engineering_rate_missing");
    assert.match(response.json().message, /Site commissioning/);
    assert.equal(firstMatching(capture.statements, "INSERT INTO dbo.manhour_lines"), undefined);
  } finally { capture.restore(); await app.close(); }
});

test("an unpublished package, an unknown override and an all-skipped apply are all refused", async () => {
  const cases: Array<[number, string, Record<string, unknown>, Responder]> = [
    [409, "labor_package_not_published",
      { estimateRowVersion: ROW_VERSION.toString("base64"), packageId: 31, ownerId: 7 },
      applyResponder([INTERNAL_LINE], { status: "Draft" })],
    [400, "validation_failed",
      { estimateRowVersion: ROW_VERSION.toString("base64"), packageId: 31, ownerId: 7, lines: [{ lineId: 999 }] },
      applyResponder([INTERNAL_LINE])],
    [400, "validation_failed",
      { estimateRowVersion: ROW_VERSION.toString("base64"), packageId: 31, ownerId: 7, lines: [{ lineId: 51, skip: true }] },
      applyResponder([INTERNAL_LINE])],
  ];
  for (const [status, code, payload, responder] of cases) {
    const capture = captureSql(responder);
    const app = Fastify(); registerErrorHandler(app);
    registerLaborPackageRoutes(app, BUSINESS_CONFIG, transactionalDatabase([{ present: 1 }]), userService());
    try {
      const response = await app.inject({ method: "POST", url: "/api/v1/estimates/5/apply-labor-package", payload });
      assert.equal(response.statusCode, status, response.body);
      assert.equal(response.json().code, code);
      assert.equal(firstMatching(capture.statements, "INSERT INTO dbo.manhour_lines"), undefined);
    } finally { capture.restore(); await app.close(); }
  }
});

test("capturing a package from an estimate keeps the rate provenance and the chosen ERP category", async () => {
  const capture = captureSql(respondWith(
    ["FROM dbo.manhour_lines line", [{
      activity: "Site commissioning", department: "Engineering", level: "Middle Engineer",
      cost_type: "Engineering", provider: "Internal", engineers: "2.00", man_days: "1.25",
      hours_per_day: "8.00", daily_rate: "5000.0000", remark: null, rate_id: 12, erp_category: "Service",
    }]],
    ["INSERT INTO dbo.labor_packages", [{ id: 44 }]],
  ));
  const app = Fastify(); registerErrorHandler(app);
  registerLaborPackageRoutes(app, BUSINESS_CONFIG, transactionalDatabase([{ present: 1 }]), userService());
  try {
    const response = await app.inject({
      method: "POST", url: "/api/v1/labor-packages/from-estimate",
      payload: { estimateId: 5, package: "Commissioning", costType: "Engineering", code: "lp-comm", name: "Commissioning" },
    });
    assert.equal(response.statusCode, 201, response.body);
    assert.deepEqual(response.json(), { id: 44, code: "LP-COMM", lineCount: 1 });
    const line = firstMatching(capture.statements, "INSERT INTO dbo.labor_package_lines")!;
    assert.equal(line.parameters.rate_id, 12);
    assert.equal(line.parameters.erp_category, "Service");
    assert.equal(line.parameters.man_days, 1.25);
    assert.equal(line.parameters.reference_rate, 5000);
    assert.equal(line.parameters.rate_basis, "Daily");
    // A captured package is a draft: publishing it stays a master-data act.
    const header = firstMatching(capture.statements, "INSERT INTO dbo.labor_packages")!;
    assert.ok(header.sql.includes("N'Draft'"));
    // Unmapped is not carried into the library as a default.
    const source = firstMatching(capture.statements, "FROM dbo.manhour_lines line")!;
    assert.ok(source.sql.includes("NULLIF(mapping.erp_category, N'Unmapped')"));
  } finally { capture.restore(); await app.close(); }
});
