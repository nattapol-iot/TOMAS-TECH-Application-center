import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type { AppConfig } from "../src/config.js";
import type { Database } from "../src/db.js";
import { registerErrorHandler } from "../src/errors.js";
import type { ProjectCostDetail, ProjectCostOverview } from "../src/project-cost-model.js";
import { registerProjectRoutes } from "../src/routes/projects.js";
import type { CurrentUserService } from "../src/users.js";

const config = { businessTimeZone: "Asia/Bangkok", documentStorage: {} } as unknown as AppConfig;
const projectRow = {
  id: 7, project_no: "PJ260091", name: "Line 3 IoT", customer_id: 3, customer_name: "ACME", status: "Design", project_type: "IoT", manager_name: "Somchai",
  end_user_customer_id: null, end_user_name: null, end_user_code: null, manager_id: 20, lead_engineer_id: 21, lead_engineer_name: "Lead", po_no: "PO-1", po_date: "2026-10-01",
  actual_delivery: null, site: "Plant A", remark: null, start_date: "2026-10-01", target_delivery: "2026-12-31", progress: 10, updated_at: "2026-11-01", row_version: Buffer.alloc(8), team: "IoT Team",
  payments_received: null, contact_ids: null,
};

/** A database that answers the cost routes' reads by what each statement names, and records what was asked. */
function fakeDatabase(options: { permissions: string[]; inScope?: boolean }) {
  const statements: string[] = [];
  const database = {
    async query(text: string, bind?: (request: { input: (name: string, ...rest: unknown[]) => unknown }) => void) {
      const params: Record<string, unknown> = {};
      const request = { input(name: string, ...rest: unknown[]) { params[name] = rest.length > 1 ? rest[1] : rest[0]; return request; } };
      bind?.(request);
      statements.push(text);
      const rows = (recordset: unknown[], second: unknown[] = []) => ({ recordset, recordsets: [recordset, second] });
      if (text.includes("dbo.user_effective_permissions")) return rows([{ allowed: options.permissions.includes(String(params.permission)) }]);
      if (text.includes("p.project_no,p.name")) return rows(options.inScope === false ? [] : [projectRow]);
      if (text.includes("dbo.v_estimate_totals")) return rows([{ project_id: 7, manhour_budget_days: null, estimate_no: "EST-26-010", material_total: 100000, outsource_total: 20000, total: 250000, internal_cost: 80000, internal_days: 20 }]);
      if (text.includes("GROUP BY pr.project_id")) return rows([{ project_id: 7, requests: 2, hw_requested: 95000, hw_approved: 60000, hw_ordered: 30000, out_requested: 25000, out_approved: 0, out_ordered: 0 }]);
      if (text.includes("dbo.schedule_tasks")) return rows([], []);
      if (text.includes("dbo.v_estimate_cost_amounts")) return rows([{ module: "MZ01", budget: 70000 }, { module: "MZ08", budget: 50000 }]);
      if (text.includes("l.budget_module")) return rows([{ module: "MZ01", requested: 95000, approved: 60000, ordered: 30000 }, { module: "(No module)", requested: 25000, approved: 0, ordered: 0 }]);
      if (text.includes("pr.pr_no")) return rows([{ id: 11, pr_no: "REQ-ME-PJ260091-MZ01-001", status: "Approved", required_date: "2026-11-30", unit: "ME · MZ01-U001 WIRE DUCT UNIT", amount: 95000, lines: 12 }]);
      if (text.includes("COALESCE(l.discipline")) return rows([{ discipline: "Software", man_days: 8, cost: 32000 }, { discipline: "Electrical", man_days: 12, cost: 48000 }]);
      throw new Error(`Unexpected statement: ${text.slice(0, 120)}`);
    },
  } as unknown as Database;
  return { database, statements };
}

function server(database: Database, roles: string[]) {
  const users = {
    async required() { return { id: 99, role: roles[0], roles, department: "IoT" }; },
    async demandPermission() { /* project.read is held */ },
  } as unknown as CurrentUserService;
  const instance = Fastify();
  registerErrorHandler(instance);
  registerProjectRoutes(instance, config, database, users);
  return instance;
}

test("cost overview: refused below Leader before any figure is read", async () => {
  for (const role of ["Engineer", "Sales Engineer", "Purchasing"]) {
    const { database, statements } = fakeDatabase({ permissions: ["estimate.read", "procurement.read"] });
    const app = server(database, [role]);
    try {
      for (const url of ["/api/v1/projects/cost-overview", "/api/v1/projects/7/cost"]) {
        const response = await app.inject({ method: "GET", url });
        assert.equal(response.statusCode, 403, `${role} ${url}`);
        assert.equal(response.json().code, "project_cost_forbidden");
      }
      assert.deepEqual(statements, []);
    } finally { await app.close(); }
  }
});

test("cost overview: a Leader sees budgets, requests and man-days, and no people cost in money", async () => {
  const { database } = fakeDatabase({ permissions: ["estimate.read", "procurement.read"] });
  const app = server(database, ["Engineer", "Leader"]);
  try {
    const response = await app.inject({ method: "GET", url: "/api/v1/projects/cost-overview" });
    assert.equal(response.statusCode, 200, response.body);
    const body = response.json() as ProjectCostOverview;
    assert.deepEqual(body.access, { budget: true, purchases: true, laborMoney: false });
    assert.equal(body.hoursPerManDay, 8);
    assert.equal(body.items.length, 1);
    const item = body.items[0]!;
    assert.deepEqual([item.id, item.number, item.customerName, item.managerName, item.status, item.estimateNo, item.estimateTotal, item.requests], [7, "PJ260091", "ACME", "Somchai", "Design", "EST-26-010", 250000, 2]);
    assert.deepEqual(item.hardware, { budget: 100000, requested: 95000, approved: 60000, ordered: 30000 });
    assert.deepEqual(item.outsource, { budget: 20000, requested: 25000, approved: 0, ordered: 0 });
    assert.deepEqual(item.labor, { source: "estimate", budgetManDays: 20, plannedManDays: 0, outsourcedManDays: 0, toDateManDays: 0, unplannedRows: 0, dailyRate: null, budgetCost: null, plannedCost: null, toDateCost: null });
  } finally { await app.close(); }
});

test("cost overview: a manager sees people cost in money; without procurement.read the requests are not read at all", async () => {
  const { database, statements } = fakeDatabase({ permissions: ["estimate.read"] });
  const app = server(database, ["Project Manager"]);
  try {
    const response = await app.inject({ method: "GET", url: "/api/v1/projects/cost-overview?includeClosed=1" });
    assert.equal(response.statusCode, 200, response.body);
    const body = response.json() as ProjectCostOverview;
    assert.deepEqual(body.access, { budget: true, purchases: false, laborMoney: true });
    const item = body.items[0]!;
    assert.deepEqual(item.hardware, { budget: 100000, requested: null, approved: null, ordered: null });
    assert.equal(item.requests, null);
    assert.deepEqual([item.labor.dailyRate, item.labor.budgetCost, item.labor.plannedCost], [4000, 80000, 0]);
    assert.equal(statements.some((text) => text.includes("dbo.mat_prs")), false);
  } finally { await app.close(); }
});

test("project cost: one project's breakdown by module, request, discipline and plan row", async () => {
  const { database } = fakeDatabase({ permissions: ["estimate.read", "procurement.read"] });
  const app = server(database, ["Engineering Manager"]);
  try {
    const response = await app.inject({ method: "GET", url: "/api/v1/projects/7/cost" });
    assert.equal(response.statusCode, 200, response.body);
    const body = response.json() as ProjectCostDetail;
    assert.equal(body.project.number, "PJ260091");
    // Modules by name, and what belongs to no module last.
    assert.deepEqual(body.modules, [
      { module: "MZ01", budget: 70000, requested: 95000, approved: 60000, ordered: 30000 },
      { module: "MZ08", budget: 50000, requested: 0, approved: 0, ordered: 0 },
      { module: "(No module)", budget: 0, requested: 25000, approved: 0, ordered: 0 },
    ]);
    assert.deepEqual(body.requests, [{ id: 11, number: "REQ-ME-PJ260091-MZ01-001", status: "Approved", requiredDate: "2026-11-30", unit: "ME · MZ01-U001 WIRE DUCT UNIT", amount: 95000, lines: 12 }]);
    // Disciplines come in the estimate's order, with money for a manager.
    assert.deepEqual(body.disciplines, [{ discipline: "Electrical", manDays: 12, cost: 48000 }, { discipline: "Software", manDays: 8, cost: 32000 }]);
    assert.deepEqual(body.plan, []);
  } finally { await app.close(); }
});

test("project cost: a project outside the viewer's scope is not found, and a Leader gets no discipline cost", async () => {
  const hidden = fakeDatabase({ permissions: ["estimate.read", "procurement.read"], inScope: false });
  const first = server(hidden.database, ["Leader"]);
  try {
    const response = await first.inject({ method: "GET", url: "/api/v1/projects/7/cost" });
    assert.equal(response.statusCode, 404, response.body);
    assert.equal(hidden.statements.some((text) => text.includes("dbo.v_estimate_totals")), false);
  } finally { await first.close(); }
  const { database } = fakeDatabase({ permissions: ["estimate.read", "procurement.read"] });
  const second = server(database, ["Leader"]);
  try {
    const body = (await second.inject({ method: "GET", url: "/api/v1/projects/7/cost" })).json() as ProjectCostDetail;
    assert.deepEqual(body.disciplines.map((row) => row.cost), [null, null]);
  } finally { await second.close(); }
});
