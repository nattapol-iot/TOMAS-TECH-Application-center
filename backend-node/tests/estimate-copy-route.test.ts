import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import Fastify from "fastify";
import sql from "mssql";
import type { Transaction } from "mssql";
import type { AppConfig } from "../src/config.js";
import type { Database } from "../src/db.js";
import { registerErrorHandler } from "../src/errors.js";
import { registerEstimateCopyRoutes } from "../src/routes/estimate-copy.js";
import type { CurrentUserService } from "../src/users.js";

const TARGET_ID = 100;
const SOURCE_ID = 55;
const TARGET_REVISION = 2;
const ROW_VERSION = Buffer.from("rowversi");

type Statement = { statement: string; params: Record<string, unknown> };
type Answer = { recordset?: unknown[]; recordsets?: unknown[][] };

const targetHeader = {
  estimate_no: "EST-2026-0100", revision: TARGET_REVISION, status: "Draft", row_version: ROW_VERSION,
  owner_id: 7, due_date: "2026-12-31",
};

const sourceHeader = { id: SOURCE_ID, estimate_no: "EST-2026-0055", revision: 3, project_name: "Line 4 retrofit", status: "Approved" };

const costRows = [
  { id: 501, category_code: "01", category: "Hardware", subcategory: "", module: "Main panel", item_code: "PLC-01",
    description: "PLC CPU", brand: "Mitsubishi", model: "FX5U", specification: null, supplier_id: 4, supplier_state: "active",
    qty: 2, unit: "pc", unit_cost: 15000, price_source: "Supplier Quotation", reference_no: "QT-2026-11",
    reference_project: "P-2025-08", price_date: "2026-02-01", remark: null, erp_category: "Hardware" },
  { id: 502, category_code: "01", category: "Hardware", subcategory: "", module: "Main panel", item_code: "HMI-02",
    description: "HMI 10in", brand: "Mitsubishi", model: "GS21", specification: null, supplier_id: 9, supplier_state: "inactive",
    qty: 1, unit: "pc", unit_cost: 24000, price_source: "Price Library", reference_no: null,
    reference_project: null, price_date: "2026-01-15", remark: null, erp_category: "Unmapped" },
];

const manhourRows = [
  { id: 601, package: "Commissioning", activity: "PLC programming", department: "Software", level: "Senior",
    cost_type: "Engineering", provider: "Internal", supplier_id: null, supplier_state: null, quotation_no: null,
    price_date: "2025-06-01", engineers: 1, man_days: 10, hours_per_day: 8, daily_rate: 1234, remark: null, erp_category: "Service" },
  { id: 602, package: "Commissioning", activity: "Robot teaching", department: "Robot", level: "Specialist",
    cost_type: "Installation", provider: "Supplier", supplier_id: 4, supplier_state: "active", quotation_no: "QT-ROBOT-3",
    price_date: "2026-03-02", engineers: 2, man_days: 5, hours_per_day: 8, daily_rate: 8000, remark: null, erp_category: "Installation" },
];

const expenseRows = [
  { id: 701, package: "Commissioning", expense_type: "Travel", description: "Site travel", cost_type: "Installation",
    supplier_id: null, supplier_state: null, reference_no: null, qty: 4, unit: "trip", unit_cost: 3500, remark: null, erp_category: "Installation" },
];

const otherRows = [
  { id: 801, category: "Outsource", description: "Panel wiring subcontract", qty: 1, unit: "lot", unit_cost: 90000, remark: null, erp_category: "Service" },
];

/** Existing live item codes inside the target revision, so 'PLC-01' has to be renumbered. */
const takenCodes = [{ item_code: "PLC-01" }];

function installSqlMock(t: TestContext, answer: (statement: string, params: Record<string, unknown>) => Answer | undefined) {
  const statements: Statement[] = [];
  const bags = new WeakMap<object, Record<string, unknown>>();
  t.mock.method(sql.Request.prototype, "input", function (this: object, name: string, ...rest: unknown[]) {
    const bag = bags.get(this) ?? {};
    bag[name] = rest.length > 1 ? rest[1] : rest[0];
    bags.set(this, bag);
    return this;
  });
  t.mock.method(sql.Request.prototype, "query", async function (this: object, statement: string) {
    const params = { ...(bags.get(this) ?? {}) };
    statements.push({ statement, params });
    return answer(statement, params) ?? { recordset: [] };
  });
  return statements;
}

/** Default answers for a copy that has something to copy in every ledger. */
function defaultAnswer(assignmentFor: (section: unknown) => unknown[]) {
  let insertedId = 900;
  return (statement: string, params: Record<string, unknown>): Answer | undefined => {
    if (statement.includes("FROM dbo.estimates WITH (UPDLOCK,HOLDLOCK)")) return { recordset: [targetHeader] };
    if (statement.includes("FROM dbo.estimates WHERE id=@source_id")) return { recordset: [sourceHeader] };
    if (statement.includes("FROM dbo.cost_items c WITH (HOLDLOCK)")) {
      return { recordsets: [costRows, manhourRows, expenseRows, otherRows, takenCodes] };
    }
    if (statement.includes("SELECT TOP(1) a.owner_id,a.support_id")) return { recordset: assignmentFor(params.section) };
    if (statement.includes("owner_valid")) return { recordset: [{ owner_valid: true, supplier_valid: true }] };
    if (statement.includes("FROM dbo.engineering_rates")) return { recordset: [{ rate: 4500 }] };
    if (statement.includes("OUTPUT inserted.id INTO @created")) { insertedId += 1; return { recordset: [{ id: insertedId }] }; }
    if (statement.includes("UPDATE dbo.estimates SET updated_by=@actor")) return { recordset: [{ row_version: Buffer.from("nextvers") }] };
    return undefined;
  };
}

function harness(actor: { id: number; role: string }, answer: (statement: string, params: Record<string, unknown>) => Answer | undefined) {
  const app = Fastify();
  registerErrorHandler(app);
  const transactions: Array<"committed" | "rolled-back"> = [];
  const database = {
    transaction: async <T>(work: (transaction: Transaction) => Promise<T>) => {
      try { const value = await work({} as Transaction); transactions.push("committed"); return value; }
      catch (error) { transactions.push("rolled-back"); throw error; }
    },
  } as unknown as Database;
  const users = { demandPermission: async () => {}, required: async () => actor } as unknown as CurrentUserService;
  registerEstimateCopyRoutes(app, { businessTimeZone: "Asia/Bangkok" } as AppConfig, database, users);
  return { app, transactions, answer };
}

const payload = { estimateRowVersion: ROW_VERSION.toString("base64"), sourceEstimateId: SOURCE_ID, ownerId: 7 };

const mutating = (statement: string) => /\b(INSERT|UPDATE|DELETE|MERGE)\b/.test(statement);

test("one copy writes every ledger of the target in a single transaction and leaves the source untouched", async (t) => {
  const { app, transactions, answer } = harness({ id: 7, role: "Engineer" },
    defaultAnswer((section) => (section === "01" ? [{ owner_id: 9, support_id: null }] : [])));
  const statements = installSqlMock(t, answer);
  try {
    const response = await app.inject({ method: "POST", url: `/api/v1/estimates/${TARGET_ID}/copy-from`, payload });
    assert.equal(response.statusCode, 201, response.body);
    const body = response.json();
    assert.equal(body.sourceNumber, "EST-2026-0055");
    assert.deepEqual(
      { costItems: body.costItems, manhourLines: body.manhourLines, expenseLines: body.expenseLines, otherCostLines: body.otherCostLines },
      { costItems: 2, manhourLines: 2, expenseLines: 1, otherCostLines: 1 },
    );
    assert.deepEqual(transactions, ["committed"]);

    // Nothing the copy writes may name the source estimate.
    for (const { statement, params } of statements.filter((entry) => mutating(entry.statement))) {
      for (const key of ["estimate_id", "estimate", "source_id"]) {
        if (params[key] !== undefined) assert.notEqual(Number(params[key]), SOURCE_ID, statement);
      }
    }

    // Every copied ledger reaches the target's current revision.
    const inserts = statements.filter((entry) => entry.statement.includes("OUTPUT inserted.id INTO @created"));
    assert.equal(inserts.length, 6);
    for (const entry of inserts) assert.equal(entry.params.revision, TARGET_REVISION);
  } finally { await app.close(); }
});

test("a duplicate item code is renumbered instead of aborting the copy", async (t) => {
  const { app, answer } = harness({ id: 7, role: "Engineer" }, defaultAnswer(() => []));
  const statements = installSqlMock(t, answer);
  try {
    const response = await app.inject({ method: "POST", url: `/api/v1/estimates/${TARGET_ID}/copy-from`, payload });
    assert.equal(response.statusCode, 201, response.body);
    assert.deepEqual(response.json().renamedItemCodes, [{ original: "PLC-01", applied: "PLC-01-2" }]);
    const codes = statements.filter((entry) => entry.statement.includes("INSERT INTO dbo.cost_items")).map((entry) => entry.params.item_code);
    assert.deepEqual(codes, ["PLC-01-2", "HMI-02"]);
  } finally { await app.close(); }
});

test("copying never reassigns a section that already belongs to somebody", async (t) => {
  const { app, answer } = harness({ id: 7, role: "Engineer" },
    defaultAnswer((section) => (section === "01" ? [{ owner_id: 9, support_id: null }] : [])));
  const statements = installSqlMock(t, answer);
  try {
    assert.equal((await app.inject({ method: "POST", url: `/api/v1/estimates/${TARGET_ID}/copy-from`, payload })).statusCode, 201);
    const assignmentWrites = statements.filter((entry) => entry.statement.includes("dbo.estimate_assignments") && mutating(entry.statement));
    assert.ok(assignmentWrites.length > 0);
    for (const entry of assignmentWrites) {
      assert.match(entry.statement, /IF NOT EXISTS/);
      assert.match(entry.statement, /N'Not Started'/);
      assert.doesNotMatch(entry.statement, /UPDATE dbo\.estimate_assignments/);
    }
    // The section already owned by user 9 keeps producing lines owned by user 9.
    const costOwners = statements.filter((entry) => entry.statement.includes("INSERT INTO dbo.cost_items")).map((entry) => entry.params.owner_id);
    assert.deepEqual(costOwners, [9, 9]);
  } finally { await app.close(); }
});

test("internal man-hour re-rates at today's master rate while supplier man-hour keeps its quoted price", async (t) => {
  const { app, answer } = harness({ id: 7, role: "Engineer" }, defaultAnswer(() => []));
  const statements = installSqlMock(t, answer);
  try {
    assert.equal((await app.inject({ method: "POST", url: `/api/v1/estimates/${TARGET_ID}/copy-from`, payload })).statusCode, 201);
    const manhourInserts = statements.filter((entry) => entry.statement.includes("INSERT INTO dbo.manhour_lines"));
    assert.deepEqual(manhourInserts.map((entry) => entry.params.rate), [4500, 8000]);
    assert.deepEqual(manhourInserts.map((entry) => entry.params.quotation), [null, "QT-ROBOT-3"]);
    assert.equal(manhourInserts[1]?.params.price_date, "2026-03-02");
  } finally { await app.close(); }
});

test("price provenance survives the copy and an inactive optional supplier is cleared, not silently kept", async (t) => {
  const { app, answer } = harness({ id: 7, role: "Engineer" }, defaultAnswer(() => []));
  const statements = installSqlMock(t, answer);
  try {
    const response = await app.inject({ method: "POST", url: `/api/v1/estimates/${TARGET_ID}/copy-from`, payload });
    assert.equal(response.statusCode, 201);
    const costInserts = statements.filter((entry) => entry.statement.includes("INSERT INTO dbo.cost_items"));
    assert.deepEqual(costInserts.map((entry) => entry.params.price_source), ["Supplier Quotation", "Price Library"]);
    assert.deepEqual(costInserts.map((entry) => entry.params.reference_no), ["QT-2026-11", null]);
    assert.deepEqual(costInserts.map((entry) => entry.params.price_date), ["2026-02-01", "2026-01-15"]);
    assert.deepEqual(costInserts.map((entry) => entry.params.supplier_id), [4, null]);
    assert.deepEqual(response.json().droppedSuppliers, [{ line: "HMI-02", supplierId: 9 }]);
  } finally { await app.close(); }
});

test("ERP classifications follow their line without claiming an earlier revision of this estimate", async (t) => {
  const { app, answer } = harness({ id: 7, role: "Engineer" }, defaultAnswer(() => []));
  const statements = installSqlMock(t, answer);
  try {
    const response = await app.inject({ method: "POST", url: `/api/v1/estimates/${TARGET_ID}/copy-from`, payload });
    assert.equal(response.statusCode, 201);
    // Five source lines carry a category; 'Unmapped' is left for the ERP screen to fill in.
    assert.equal(response.json().erpCategories, 5);
    const mappings = statements.filter((entry) => entry.statement.includes("INSERT INTO dbo.estimate_erp_mappings"));
    assert.equal(mappings.length, 5);
    for (const entry of mappings) {
      assert.equal(entry.params.revision, TARGET_REVISION);
      assert.notEqual(entry.params.erp_category, "Unmapped");
      assert.doesNotMatch(entry.statement, /copied_from_mapping_id|copied_from_revision/);
    }
    assert.deepEqual(mappings.map((entry) => entry.params.source_type), ["CostItem", "ManhourLine", "ManhourLine", "ExpenseLine", "OtherCostLine"]);
  } finally { await app.close(); }
});

test("a failure anywhere in the copy rolls the whole transaction back", async (t) => {
  const base = defaultAnswer(() => []);
  const { app, transactions, answer } = harness({ id: 7, role: "Engineer" }, (statement, params) => {
    if (statement.includes("assert_estimate_totals")) throw new Error("aggregate guard tripped");
    return base(statement, params);
  });
  installSqlMock(t, answer);
  try {
    const response = await app.inject({ method: "POST", url: `/api/v1/estimates/${TARGET_ID}/copy-from`, payload });
    assert.equal(response.statusCode, 500);
    assert.deepEqual(transactions, ["rolled-back"]);
  } finally { await app.close(); }
});

test("an engineer cannot copy into a section that is not assigned to them", async (t) => {
  const { app, transactions, answer } = harness({ id: 42, role: "Engineer" }, defaultAnswer(() => []));
  installSqlMock(t, answer);
  try {
    const response = await app.inject({ method: "POST", url: `/api/v1/estimates/${TARGET_ID}/copy-from`, payload: { ...payload, ownerId: 42 } });
    assert.equal(response.statusCode, 403);
    assert.equal(response.json().code, "estimate_section_forbidden");
    assert.deepEqual(transactions, ["rolled-back"]);
  } finally { await app.close(); }
});

test("an assigned engineer may not park a copied line on somebody outside their section", async (t) => {
  const { app, answer } = harness({ id: 42, role: "Engineer" },
    defaultAnswer(() => [{ owner_id: 42, support_id: null }]));
  installSqlMock(t, answer);
  try {
    const response = await app.inject({ method: "POST", url: `/api/v1/estimates/${TARGET_ID}/copy-from`, payload: { ...payload, ownerId: 77 } });
    assert.equal(response.statusCode, 403);
    assert.equal(response.json().code, "cost_owner_forbidden");
  } finally { await app.close(); }
});

test("a supplier man-hour line whose supplier was deactivated is refused by name, not written half-formed", async (t) => {
  const base = defaultAnswer(() => []);
  const { app, transactions, answer } = harness({ id: 7, role: "Engineer" }, (statement, params) => {
    if (statement.includes("FROM dbo.cost_items c WITH (HOLDLOCK)")) {
      return { recordsets: [[], [{ ...manhourRows[1], supplier_state: "inactive" }], [], [], takenCodes] };
    }
    return base(statement, params);
  });
  installSqlMock(t, answer);
  try {
    const response = await app.inject({ method: "POST", url: `/api/v1/estimates/${TARGET_ID}/copy-from`, payload });
    assert.equal(response.statusCode, 422);
    assert.equal(response.json().code, "supplier_inactive");
    assert.match(response.json().message, /Robot teaching/);
    assert.deepEqual(transactions, ["rolled-back"]);
  } finally { await app.close(); }
});

test("copying an estimate onto itself, or with nothing selected, is rejected before any write", async (t) => {
  const { app, answer } = harness({ id: 7, role: "Engineer" }, defaultAnswer(() => []));
  const statements = installSqlMock(t, answer);
  try {
    const self = await app.inject({ method: "POST", url: `/api/v1/estimates/${TARGET_ID}/copy-from`, payload: { ...payload, sourceEstimateId: TARGET_ID } });
    assert.equal(self.statusCode, 400);
    const empty = await app.inject({ method: "POST", url: `/api/v1/estimates/${TARGET_ID}/copy-from`, payload: { ...payload, sections: ["99"] } });
    assert.equal(empty.statusCode, 400);
    assert.equal(statements.filter((entry) => mutating(entry.statement)).length, 0);
  } finally { await app.close(); }
});

test("a section selection restricts what the copy reads and writes", async (t) => {
  const base = defaultAnswer(() => []);
  const { app, answer } = harness({ id: 7, role: "Engineer" }, (statement, params) => {
    if (statement.includes("FROM dbo.cost_items c WITH (HOLDLOCK)")) {
      assert.match(statement, /c\.category_code IN \('01'\)/);
      return { recordsets: [costRows, [], expenseRows, otherRows, takenCodes] };
    }
    return base(statement, params);
  });
  const statements = installSqlMock(t, answer);
  try {
    const response = await app.inject({ method: "POST", url: `/api/v1/estimates/${TARGET_ID}/copy-from`, payload: { ...payload, sections: ["01"] } });
    assert.equal(response.statusCode, 201, response.body);
    const body = response.json();
    // Expense 'Travel' maps to 08 and other-cost 'Outsource' to 07, so neither belongs to a 01-only copy.
    assert.deepEqual({ expenseLines: body.expenseLines, otherCostLines: body.otherCostLines, sections: body.sections }, { expenseLines: 0, otherCostLines: 0, sections: ["01"] });
    assert.equal(statements.filter((entry) => entry.statement.includes("INSERT INTO dbo.expense_lines")).length, 0);
    assert.equal(statements.filter((entry) => entry.statement.includes("INSERT INTO dbo.other_cost_lines")).length, 0);
  } finally { await app.close(); }
});

test("a locked target refuses the copy through the shared editable-estimate lock", async (t) => {
  const base = defaultAnswer(() => []);
  const { app, transactions, answer } = harness({ id: 7, role: "Engineer" }, (statement, params) => {
    if (statement.includes("FROM dbo.estimates WITH (UPDLOCK,HOLDLOCK)")) return { recordset: [{ ...targetHeader, status: "Approved" }] };
    return base(statement, params);
  });
  installSqlMock(t, answer);
  try {
    const response = await app.inject({ method: "POST", url: `/api/v1/estimates/${TARGET_ID}/copy-from`, payload });
    assert.equal(response.statusCode, 409);
    assert.equal(response.json().code, "estimate_locked");
    assert.deepEqual(transactions, ["rolled-back"]);
  } finally { await app.close(); }
});
