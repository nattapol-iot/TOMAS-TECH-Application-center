import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type { AppConfig } from "../src/config.js";
import type { Database } from "../src/db.js";
import { ApiError, registerErrorHandler } from "../src/errors.js";
import { approvalSteps, MATERIAL_CATEGORY_CODES, PO_CREATION_STEP, remainingToRequest } from "../src/procurement-rules.js";
import { registerPurchaseRequisitionRoutes } from "../src/routes/purchase-requisitions.js";
import type { CurrentUserService } from "../src/users.js";

const flag = { code: "price_variance", text: "CPU-01 unit price is 12.0% above the estimate (limit 10%)" };
const names = (steps: ReturnType<typeof approvalSteps>) => steps.map((step) => step.name);

test("a PR needs the project's PM and Purchasing, then Purchasing raises the order", () => {
  const steps = approvalSteps(7, 3, []);
  assert.deepEqual(names(steps), ["Submitted by Requester", "Project Manager Approval", "Purchasing Review", PO_CREATION_STEP]);
  assert.deepEqual(steps[1], { name: "Project Manager Approval", role: null, approver: 3, rule: null, status: "Current" });
  assert.equal(steps[0]!.approver, 7);
  assert.equal(steps.filter((step) => step.status === "Current").length, 1);
});

test("the lead engineer no longer approves a PR", () => {
  assert.equal(names(approvalSteps(7, 3, [])).some((name) => /Section Owner|Budget Owner/.test(name)), false);
});

test("a PM raising their own PR, or a project without a PM, goes to the Engineering Manager role", () => {
  for (const manager of [7, null]) {
    const step = approvalSteps(7, manager, [])[1]!;
    assert.equal(step.approver, null);
    assert.equal(step.role, "Engineering Manager");
  }
});

test("a flagged PR adds Management once, never a second Engineering Manager step", () => {
  const flagged = approvalSteps(7, 3, [flag]);
  assert.deepEqual(names(flagged), ["Submitted by Requester", "Project Manager Approval", "Purchasing Review", "Management Approval", PO_CREATION_STEP]);
  assert.equal(flagged[3]!.rule, flag.text);
  // The PM is the requester, so the Engineering Manager already decides the project step: it carries the rule instead.
  const own = approvalSteps(7, 7, [flag]);
  assert.deepEqual(names(own), ["Submitted by Requester", "Project Manager Approval", "Purchasing Review", PO_CREATION_STEP]);
  assert.equal(own[1]!.rule, flag.text);
});

test("the step rule fits its 100-character column", () => {
  const many = Array.from({ length: 6 }, (_, index) => ({ code: "manual_price", text: `ITEM-${index} uses a manual price` }));
  assert.ok(approvalSteps(7, 3, many)[3]!.rule!.length <= 100);
});

test("every BOM line can be requested, whether or not it has an inventory item", () => {
  const line = { required: 10, customerSupplied: 0, allocated: 0, activeReserved: 0, netIssued: 0, onOrder: 0, onOpenPr: 0 };
  assert.equal(remainingToRequest(line), 10);
  assert.equal(remainingToRequest({ ...line, customerSupplied: 2, onOrder: 3, onOpenPr: 1 }), 4);
  // Issued and reserved quantity is covered once, by whichever is larger.
  assert.equal(remainingToRequest({ ...line, allocated: 4, netIssued: 3, activeReserved: 2 }), 5);
  assert.equal(remainingToRequest({ ...line, onOpenPr: 12 }), 0);
});

test("a BOM takes only the material categories of an estimate", () => {
  assert.deepEqual([...MATERIAL_CATEGORY_CODES], ["01", "02", "03", "04", "05"]);
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

function app(database: Database, users: CurrentUserService) {
  const instance = Fastify();
  registerErrorHandler(instance);
  registerPurchaseRequisitionRoutes(instance, {} as AppConfig, database, users);
  return instance;
}

test("Request Changes is refused before any database work", async () => {
  const { state, database } = untouchedDatabase();
  const server = app(database, approver);
  try {
    const response = await server.inject({ method: "POST", url: "/api/v1/purchase-requisitions/9/decide", payload: { decision: "Request Changes", comment: "fix the supplier" } });
    assert.equal(response.statusCode, 400);
    assert.equal(response.json().code, "validation_failed");
    assert.equal(state.touched, false);
  } finally { await server.close(); }
});

test("cancelling a PR needs procurement.request and a row version", async () => {
  const { state, database } = untouchedDatabase();
  const denied = app(database, {
    async demandPermission() { throw new ApiError(403, "permission_denied", "Denied"); },
    async required() { throw new Error("Unexpected actor lookup"); },
  } as unknown as CurrentUserService);
  const allowed = app(database, approver);
  try {
    assert.equal((await denied.inject({ method: "POST", url: "/api/v1/purchase-requisitions/9/cancel", payload: { rowVersion: "AAAAAAAAB9E=" } })).statusCode, 403);
    assert.equal((await allowed.inject({ method: "POST", url: "/api/v1/purchase-requisitions/9/cancel", payload: {} })).statusCode, 400);
    assert.equal(state.touched, false);
  } finally { await denied.close(); await allowed.close(); }
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
    // Role-addressed steps reach additional roles, and nobody counts their own request.
    assert.match(statement, /cs\.approver_role IN\(SELECT code FROM dbo\.user_effective_roles WHERE user_id=@actor\)/);
    assert.match(statement, /code=N'procurement\.approve'/);
    assert.match(statement, /code=N'inventory\.adjust'/);
    assert.equal((statement.match(/requested_by<>@actor/g) ?? []).length, 3);
    // Estimates in review belong to the Estimate badge, not this one.
    assert.doesNotMatch(statement, /dbo\.estimates/);
  } finally { await server.close(); }
});
