import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type { AppConfig } from "../src/config.js";
import type { Database } from "../src/db.js";
import { ApiError, registerErrorHandler } from "../src/errors.js";
import { approvalSteps, type BomLineForRequest, MATERIAL_CATEGORY_CODES, MAX_PR_LINES, moduleBudgetFlags, PO_CREATION_STEP, planPrLines, type PrLineInput,
  remainingToRequest, type RuleFlag } from "../src/procurement-rules.js";
import { registerPurchaseRequisitionRoutes } from "../src/routes/purchase-requisitions.js";
import type { CurrentUserService } from "../src/users.js";

const overByPm: RuleFlag = { code: "over_module_budget", level: "manager", text: "Panel: 500 THB over budget (5.0%)" };
const overByManagement: RuleFlag = { code: "over_module_budget", level: "management", text: "Panel: 5,000 THB over budget (50.0%)" };
const names = (steps: ReturnType<typeof approvalSteps>) => steps.map((step) => step.name);

test("a PR needs the project's PM and Purchasing, then Purchasing raises the order", () => {
  const steps = approvalSteps(7, 3, []);
  assert.deepEqual(names(steps), ["Submitted by Requester", "Project Manager Approval", "Purchasing Review", PO_CREATION_STEP]);
  assert.deepEqual(steps[1], { name: "Project Manager Approval", role: null, approver: 3, rule: null, status: "Current" });
  assert.equal(steps[0]!.approver, 7);
  assert.equal(steps.filter((step) => step.status === "Current").length, 1);
  assert.equal(names(steps).some((name) => /Section Owner|Budget Owner/.test(name)), false);
});

test("a PM raising their own PR, or a project without a PM, goes to the Engineering Manager role", () => {
  for (const manager of [7, null]) {
    const step = approvalSteps(7, manager, [])[1]!;
    assert.equal(step.approver, null);
    assert.equal(step.role, "Engineering Manager");
  }
});

test("a module up to 10% over is the PM's decision; the PM step names it and nobody else is added", () => {
  const steps = approvalSteps(7, 3, [overByPm]);
  assert.deepEqual(names(steps), ["Submitted by Requester", "Project Manager Approval", "Purchasing Review", PO_CREATION_STEP]);
  assert.equal(steps[1]!.rule, overByPm.text);
});

test("more than 10% over adds the Engineering Manager once, never a second Engineering Manager step", () => {
  const flagged = approvalSteps(7, 3, [overByManagement]);
  assert.deepEqual(names(flagged), ["Submitted by Requester", "Project Manager Approval", "Purchasing Review", "Management Approval", PO_CREATION_STEP]);
  assert.equal(flagged[3]!.rule, overByManagement.text);
  // The PM is the requester, so the Engineering Manager already decides the project step.
  const own = approvalSteps(7, 7, [overByManagement]);
  assert.deepEqual(names(own), ["Submitted by Requester", "Project Manager Approval", "Purchasing Review", PO_CREATION_STEP]);
  assert.equal(own[1]!.rule, overByManagement.text);
});

test("the step rule fits its 100-character column", () => {
  const many = Array.from({ length: 6 }, (_, index) => ({ ...overByManagement, text: `Module ${index}: 9,999,999 THB over budget (99.9%)` }));
  for (const step of approvalSteps(7, 3, many)) assert.ok((step.rule ?? "").length <= 100);
});

test("a module within budget raises nothing; over it, the share decides who approves", () => {
  const spend = (budget: number, requestedElsewhere: number, thisRequest: number) => ({ module: "Panel", budget, requestedElsewhere, thisRequest });
  assert.deepEqual(moduleBudgetFlags([spend(10_000, 4_000, 6_000)]), []);
  assert.equal(moduleBudgetFlags([spend(10_000, 4_000, 7_000)])[0]!.level, "manager");
  assert.equal(moduleBudgetFlags([spend(10_000, 4_000, 7_000)])[0]!.text, "Panel: 1,000 THB over budget (10.0%)");
  assert.equal(moduleBudgetFlags([spend(10_000, 4_000, 7_001)])[0]!.level, "management");
  assert.equal(moduleBudgetFlags([spend(0, 0, 100)])[0]!.text, "Panel: 100 THB over budget (no budget)");
  assert.equal(moduleBudgetFlags([spend(0, 0, 100)])[0]!.level, "management");
  // A module this PR does not spend in is not this PR's problem, however far over it already is.
  assert.deepEqual(moduleBudgetFlags([spend(10_000, 50_000, 0)]), []);
});

test("every request covering a BOM line counts, ordered or not, and stock covers the rest", () => {
  const line = { required: 10, customerSupplied: 0, allocated: 0, activeReserved: 0, netIssued: 0, requested: 0 };
  assert.equal(remainingToRequest(line), 10);
  assert.equal(remainingToRequest({ ...line, customerSupplied: 2, requested: 4 }), 4);
  assert.equal(remainingToRequest({ ...line, allocated: 4, netIssued: 3, activeReserved: 2 }), 5);
  assert.equal(remainingToRequest({ ...line, requested: 12 }), 0);
});

test("a BOM takes only the material categories of an estimate", () => {
  assert.deepEqual([...MATERIAL_CATEGORY_CODES], ["01", "02", "03", "04", "05"]);
});

const bomLine = (id: number, overrides: Partial<BomLineForRequest> = {}): BomLineForRequest => ({ id, itemId: 40 + id, itemCode: `IT-${id}`, partNumber: `PN-${id}`,
  description: `Item ${id}`, brand: "Omron", unit: "pcs", estimatedUnitCost: 100, module: "Panel", remaining: 10, ...overrides });
const bom = new Map([[1, bomLine(1)], [2, bomLine(2, { module: "Software", itemId: null, itemCode: "" })]]);
const modules = ["Panel", "Software"];
const input = (overrides: Partial<PrLineInput>): PrLineInput => ({ lineType: "Planned", bomLineId: 1, module: null, itemCode: null, partNumber: null, description: null, brand: null,
  unit: null, quantity: 1, coveredQuantity: null, unitPrice: 100, priceSource: "Estimate", supplierId: null, remark: null, ...overrides });
const rejects = (inputs: PrLineInput[], code: string, line: number) => assert.throws(() => planPrLines(inputs, bom, modules), (error: unknown) =>
  error instanceof ApiError && error.code === code && error.message.startsWith(`Line ${line}:`));

test("a planned line is its BOM line's item and may not ask for more than is left, across all lines of the PR", () => {
  const [line] = planPrLines([input({ quantity: 4, itemCode: "SOMETHING-ELSE" })], bom, modules);
  assert.deepEqual({ type: line!.lineType, item: line!.itemId, code: line!.itemCode, covered: line!.coveredQuantity, module: line!.budgetModule, estimate: line!.estimatedQuantity * line!.estimatedUnitCost },
    { type: "Planned", item: 41, code: "IT-1", covered: 4, module: "Panel", estimate: 400 });
  rejects([input({ quantity: 11 })], "quantity_exceeds_shortage", 1);
  rejects([input({ quantity: 6 }), input({ quantity: 5 })], "quantity_exceeds_shortage", 2);
});

test("a substitute replaces what is left of its BOM line by default, spends that line's module and is not the BOM item", () => {
  const [line] = planPrLines([input({ lineType: "Substitute", partNumber: "SIEMENS-X", description: "Siemens equivalent", quantity: 2, unit: "set", unitPrice: 450 })], bom, modules);
  assert.deepEqual({ type: line!.lineType, item: line!.itemId, covered: line!.coveredQuantity, unit: line!.unit, module: line!.budgetModule, estimate: line!.estimatedQuantity * line!.estimatedUnitCost },
    { type: "Substitute", item: null, covered: 10, unit: "set", module: "Panel", estimate: 1000 });
  // Once a substitute covers the line, nothing is left for a planned line.
  rejects([input({ lineType: "Substitute", description: "Other", quantity: 1 }), input({ quantity: 1 })], "quantity_exceeds_shortage", 2);
  rejects([input({ lineType: "Substitute", description: "Other", quantity: 1, coveredQuantity: 11 })], "covered_exceeds_remaining", 1);
  rejects([input({ lineType: "Substitute", quantity: 1 })], "validation_failed", 1);
});

test("an unplanned item names a module of this BOM, has no BOM line and covers nothing", () => {
  const [line] = planPrLines([input({ lineType: "Unplanned", bomLineId: null, module: " software ", description: "USB license dongle", unit: "pcs", quantity: 3 })], bom, modules);
  assert.deepEqual({ type: line!.lineType, bom: line!.bomLineId, module: line!.budgetModule, covered: line!.coveredQuantity, estimate: line!.estimatedUnitCost },
    { type: "Unplanned", bom: null, module: "Software", covered: 0, estimate: 0 });
  rejects([input({ lineType: "Unplanned", bomLineId: null, module: "Mechanical", description: "Bracket", unit: "pcs" })], "module_required", 1);
  rejects([input({ lineType: "Unplanned", bomLineId: 1, module: "Panel", description: "Bracket", unit: "pcs" })], "validation_failed", 1);
  rejects([input({ lineType: "Unplanned", bomLineId: null, module: "Panel", description: "Bracket" })], "validation_failed", 1);
});

test("a line naming a BOM line of another BOM, or none, is refused with its line number", () => {
  rejects([input({}), input({ bomLineId: 99 })], "bom_line_not_found", 2);
  rejects([input({ bomLineId: null })], "bom_line_not_found", 1);
});

const untouchedDatabase = () => {
  const state = { touched: false };
  const database = {
    async query() { state.touched = true; throw new Error("Unexpected query"); },
    async transaction() { state.touched = true; throw new Error("Unexpected transaction"); },
  } as unknown as Database;
  return { state, database };
};

const approver = {
  async demandPermission() {},
  async required() { return { id: 5, role: "Project Manager", roles: ["Project Manager"] }; },
} as unknown as CurrentUserService;
const denied = {
  async demandPermission() { throw new ApiError(403, "permission_denied", "Denied"); },
  async required() { throw new Error("Unexpected actor lookup"); },
} as unknown as CurrentUserService;

function app(database: Database, users: CurrentUserService) {
  const instance = Fastify();
  registerErrorHandler(instance);
  registerPurchaseRequisitionRoutes(instance, { businessTimeZone: "Asia/Bangkok" } as AppConfig, database, users);
  return instance;
}

test("input mistakes are refused before any database work, and name the line", async () => {
  const { state, database } = untouchedDatabase();
  const server = app(database, approver);
  const line = { bomLineId: 1, quantity: 1, unitPrice: 10 };
  try {
    const cases: Array<{ url: string; method: "POST" | "PUT"; payload: unknown; status: number; message?: RegExp; code?: string }> = [
      { method: "POST", url: "/api/v1/purchase-requisitions/9/decide", payload: { decision: "Request Changes", comment: "fix it" }, status: 400 },
      { method: "POST", url: "/api/v1/purchase-requisitions/9/cancel", payload: {}, status: 400, code: "invalid_row_version" },
      { method: "POST", url: "/api/v1/purchase-requisitions", status: 400, message: /at most 2000 lines/,
        payload: { bomId: 1, priority: "Normal", requiredDate: "2099-01-01", lines: Array.from({ length: MAX_PR_LINES + 1 }, () => line) } },
      { method: "POST", url: "/api/v1/purchase-requisitions", status: 400, message: /^Line 3: Quantity/,
        payload: { bomId: 1, priority: "Normal", requiredDate: "2099-01-01", lines: [line, line, { ...line, quantity: -1 }] } },
      { method: "POST", url: "/api/v1/purchase-requisitions", status: 400, message: /^Line 1: Line type/,
        payload: { bomId: 1, priority: "Normal", requiredDate: "2099-01-01", lines: [{ ...line, lineType: "Alternative" }] } },
      { method: "PUT", url: "/api/v1/purchase-requisitions/9/suppliers", payload: { assignments: [{ lineId: 1, supplierId: 2 }, { lineId: 1, supplierId: 3 }] }, status: 400 },
      { method: "POST", url: "/api/v1/purchase-requisitions/9/erp-order", payload: { rowVersion: "AAAAAAAAB9E=" }, status: 400, message: /ERP PO number/ },
    ];
    for (const item of cases) {
      const response = await server.inject({ method: item.method, url: item.url, payload: item.payload as object });
      assert.equal(response.statusCode, item.status, item.url);
      assert.equal(response.json().code, item.code ?? "validation_failed", item.url);
      if (item.message) assert.match(response.json().message, item.message);
    }
    assert.equal(state.touched, false);
  } finally { await server.close(); }
});

test("only Purchasing sets suppliers or records the ERP order, and nothing is converted in this app any more", async () => {
  const { state, database } = untouchedDatabase();
  const refused = app(database, denied);
  const allowed = app(database, approver);
  try {
    for (const call of [
      { method: "PUT" as const, url: "/api/v1/purchase-requisitions/9/suppliers", payload: { assignments: [{ lineId: 1, supplierId: 2 }] } },
      { method: "POST" as const, url: "/api/v1/purchase-requisitions/9/erp-order", payload: { rowVersion: "AAAAAAAAB9E=", erpPoRef: "PO-ERP-1" } },
      { method: "POST" as const, url: "/api/v1/purchase-requisitions/9/cancel", payload: { rowVersion: "AAAAAAAAB9E=" } },
    ]) assert.equal((await refused.inject(call)).statusCode, 403, call.url);
    assert.equal((await allowed.inject({ method: "POST", url: "/api/v1/purchase-requisitions/9/convert", payload: { rowVersion: "AAAAAAAAB9E=" } })).statusCode, 404);
    assert.equal(state.touched, false);
  } finally { await refused.close(); await allowed.close(); }
});

test("the Approvals badge counts what the Approvals screen lists for the user", async () => {
  let statement = ""; const inputs: Record<string, unknown> = {};
  const database = {
    async query(text: string, bind: (request: { input: (name: string, _type: unknown, value: unknown) => void }) => void) {
      statement = text; bind({ input: (name, _type, value) => { inputs[name] = value; } });
      return { recordset: [{ waiting: 4 }] };
    },
  } as unknown as Database;
  const server = app(database, approver);
  try {
    const response = await server.inject({ method: "GET", url: "/api/v1/procurement/approvals/attention" });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { waiting: 4 });
    assert.equal(inputs.actor, 5);
    assert.match(statement, /cs\.approver_role IN\(SELECT code FROM dbo\.user_effective_roles WHERE user_id=@actor\)/);
    assert.match(statement, /code=N'procurement\.approve'/);
    assert.match(statement, /code=N'inventory\.adjust'/);
    assert.equal((statement.match(/requested_by<>@actor/g) ?? []).length, 3);
    assert.doesNotMatch(statement, /dbo\.estimates/);
  } finally { await server.close(); }
});
