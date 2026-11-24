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
  id: 7,
  project_no: "PJ260091",
  name: "Line 3 IoT",
  customer_id: 3,
  customer_name: "ACME",
  status: "Design",
  project_type: "IoT",
  manager_name: "Somchai",
  end_user_customer_id: null,
  end_user_name: null,
  end_user_code: null,
  manager_id: 20,
  lead_engineer_id: 21,
  lead_engineer_name: "Lead",
  po_no: "PO-1",
  po_date: "2026-10-01",
  actual_delivery: null,
  site: "Plant A",
  remark: null,
  start_date: "2026-10-01",
  target_delivery: "2026-12-31",
  progress: 10,
  updated_at: "2026-11-01",
  row_version: Buffer.alloc(8),
  team: "IoT Team",
  payments_received: null,
  contact_ids: null,
};
/** One plan task as dbo.schedule_tasks returns it: 6 man-days from 2020, so all of it is due by today. */
const taskRow = {
  id: 501,
  project_id: 7,
  parent_id: null,
  sort_order: 1,
  kind: "task",
  name: "Panel wiring",
  is_milestone: false,
  origin: "manual",
  created_by: 1,
  visibility: "team",
  plan_start: "2020-01-06",
  plan_days: 5,
  start_mode: "manual",
  predecessor_id: null,
  lag_days: 0,
  pic_external: "",
  plan_man_days: 6,
  baseline_start: null,
  baseline_end: null,
  baseline_days: 0,
  baseline_rev: 0,
  actual_start: null,
  actual_end: null,
  forecast_end: null,
  percent_done: 0,
  status: "Not Started",
  blocked_reason: null,
  note: null,
  actual_man_days: 0,
  updated_by: 1,
  updated_at: "2026-11-01",
  row_version: Buffer.alloc(8),
  labor_source: null,
  labor_supplier: null,
  people_by_day: null,
};

/** A database that answers the cost routes' reads by what each statement names, and records what was asked. */
function fakeDatabase(options: { inScope?: boolean; planned?: boolean } = {}) {
  const statements: string[] = [];
  const database = {
    async query(text: string, bind?: (request: { input: (name: string, ...rest: unknown[]) => unknown }) => void) {
      const request = {
        input() {
          return request;
        },
      };
      bind?.(request);
      statements.push(text);
      const rows = (...sets: unknown[][]) => ({ recordset: sets[0] ?? [], recordsets: sets });
      if (text.includes("p.project_no,p.name")) return rows(options.inScope === false ? [] : [projectRow]);
      // Task doc 6.1: the plan rows, holidays, hours by day and by person for one project's Cost tab.
      if (text.includes("-- cost curve"))
        return options.planned
          ? rows(
              [{ ...taskRow, plan_man_days: 2 }],
              [],
              [
                { work_date: "2026-11-02", hours: 8 },
                { work_date: "2026-11-03", hours: 16 },
              ],
              [
                { id: 4, name: "Electrical engineer", department: "Electrical Engineer Dept.", hours: 16, days: 2, last_day: "2026-11-03" },
                { id: 5, name: "IoT engineer", department: "IoT Engineer Dept.", hours: 8, days: 1, last_day: "2026-11-02" },
              ],
            )
          : rows([], [], [], []);
      // The estimate's totals, then its internal labor by discipline: electrical 12 man-days at 4,000, software 8 at 4,000.
      if (text.includes("dbo.v_estimate_totals"))
        return rows(
          [{ project_id: 7, manhour_budget_days: null, estimate_no: "EST-26-010", material_total: 100000, outsource_total: 20000, total: 250000 }],
          [
            { project_id: 7, discipline: "Software", man_days: 8, cost: 32000 },
            { project_id: 7, discipline: "Electrical", man_days: 12, cost: 48000 },
          ],
        );
      if (text.includes("GROUP BY pr.project_id"))
        return rows([{ project_id: 7, requests: 2, hw_requested: 95000, hw_approved: 60000, hw_ordered: 30000, out_requested: 25000, out_approved: 0, out_ordered: 0 }]);
      // The plan rows, the holidays, the departments of each row's PICs, and the hours confirmed on the project
      // (My week, 2026-11-23): 16 by the electrical engineer and 8 by the IoT engineer on the row.
      if (text.includes("dbo.schedule_tasks"))
        return options.planned
          ? rows(
              [taskRow],
              [],
              [
                { task_id: 501, department: "Electrical Engineer Dept." },
                { task_id: 501, department: "IoT Engineer Dept." },
              ],
              [
                { project_id: 7, work_key: "Project-501", department: "Electrical Engineer Dept.", hours: 16 },
                { project_id: 7, work_key: "Project-501", department: "IoT Engineer Dept.", hours: 8 },
              ],
            )
          : rows([], [], [], []);
      if (text.includes("dbo.v_estimate_cost_amounts"))
        return rows([
          { module: "MZ01", budget: 70000 },
          { module: "MZ08", budget: 50000 },
        ]);
      if (text.includes("l.budget_module"))
        return rows([
          { module: "MZ01", requested: 95000, approved: 60000, ordered: 30000 },
          { module: "(No module)", requested: 25000, approved: 0, ordered: 0 },
        ]);
      if (text.includes("pr.pr_no"))
        return rows([{ id: 11, pr_no: "REQ-ME-PJ260091-MZ01-001", status: "Approved", required_date: "2026-11-30", unit: "ME · MZ01-U001 WIRE DUCT UNIT", amount: 95000, lines: 12 }]);
      // The role is the one gate: the cost routes never ask for a permission of their own.
      throw new Error(`Unexpected statement: ${text.slice(0, 120)}`);
    },
  } as unknown as Database;
  return { database, statements };
}

function server(database: Database, roles: string[]) {
  const users = {
    async required() {
      return { id: 99, role: roles[0], roles, department: "IoT" };
    },
    async demandPermission() {
      /* project.read is held */
    },
  } as unknown as CurrentUserService;
  const instance = Fastify();
  registerErrorHandler(instance);
  registerProjectRoutes(instance, config, database, users);
  return instance;
}

test("cost overview: refused below Leader before any figure is read", async () => {
  for (const role of ["Engineer", "Sales Engineer", "Purchasing"]) {
    const { database, statements } = fakeDatabase();
    const app = server(database, [role]);
    try {
      for (const url of ["/api/v1/projects/cost-overview", "/api/v1/projects/7/cost"]) {
        const response = await app.inject({ method: "GET", url });
        assert.equal(response.statusCode, 403, `${role} ${url}`);
        assert.equal(response.json().code, "project_cost_forbidden");
      }
      assert.deepEqual(statements, []);
    } finally {
      await app.close();
    }
  }
});

test("cost overview: a Leader sees every figure, people in man-days only, never in money (owner 2026-11-23)", async () => {
  const { database } = fakeDatabase();
  const app = server(database, ["Engineer", "Leader"]);
  try {
    const response = await app.inject({ method: "GET", url: "/api/v1/projects/cost-overview" });
    assert.equal(response.statusCode, 200, response.body);
    const body = response.json() as ProjectCostOverview;
    assert.deepEqual(body.access, { budget: true, purchases: true, laborMoney: false });
    assert.equal(body.hoursPerManDay, 8);
    assert.equal(body.items.length, 1);
    const item = body.items[0]!;
    assert.deepEqual(
      [item.id, item.number, item.customerName, item.managerName, item.status, item.estimateNo, item.estimateTotal, item.requests],
      [7, "PJ260091", "ACME", "Somchai", "Design", "EST-26-010", 250000, 2],
    );
    assert.deepEqual(item.hardware, { budget: 100000, requested: 95000, approved: 60000, ordered: 30000 });
    assert.deepEqual(item.outsource, { budget: 20000, requested: 25000, approved: 0, ordered: 0 });
    assert.deepEqual(item.labor, {
      source: "estimate",
      budgetManDays: 20,
      plannedManDays: 0,
      outsourcedManDays: 0,
      toDateManDays: 0,
      unplannedRows: 0,
      dailyRate: null,
      budgetCost: null,
      plannedCost: null,
      toDateCost: null,
      actualManDays: 0,
      forecastManDays: 0,
      actualCost: null,
      forecastCost: null,
      disciplines: [
        {
          discipline: "Electrical",
          budgetManDays: 12,
          plannedManDays: 0,
          toDateManDays: 0,
          budgetCost: null,
          plannedCost: null,
          toDateCost: null,
          actualManDays: 0,
          forecastManDays: 0,
          actualCost: null,
          forecastCost: null,
        },
        {
          discipline: "Software",
          budgetManDays: 8,
          plannedManDays: 0,
          toDateManDays: 0,
          budgetCost: null,
          plannedCost: null,
          toDateCost: null,
          actualManDays: 0,
          forecastManDays: 0,
          actualCost: null,
          forecastCost: null,
        },
      ],
    });
  } finally {
    await app.close();
  }
});

test("cost overview: plan man-days go to the disciplines of the row's PICs, with no money", async () => {
  const { database } = fakeDatabase({ planned: true });
  const app = server(database, ["Project Manager"]);
  try {
    const response = await app.inject({ method: "GET", url: "/api/v1/projects/cost-overview?includeClosed=1" });
    assert.equal(response.statusCode, 200, response.body);
    const item = (response.json() as ProjectCostOverview).items[0]!;
    // 6 man-days held by an electrical and an IoT engineer: 3 each, all due by today. No rate and no money is sent.
    assert.deepEqual(
      [item.labor.budgetManDays, item.labor.plannedManDays, item.labor.toDateManDays, item.labor.dailyRate, item.labor.budgetCost, item.labor.plannedCost, item.labor.toDateCost],
      [20, 6, 6, null, null, null, null],
    );
    // Confirmed: 2 electrical man-days and 1 software, by each engineer's department; the plan has nothing left to do, so that is the forecast.
    assert.deepEqual([item.labor.actualManDays, item.labor.forecastManDays, item.labor.actualCost, item.labor.forecastCost], [3, 3, null, null]);
    assert.deepEqual(item.labor.disciplines, [
      {
        discipline: "Electrical",
        budgetManDays: 12,
        plannedManDays: 3,
        toDateManDays: 3,
        budgetCost: null,
        plannedCost: null,
        toDateCost: null,
        actualManDays: 2,
        forecastManDays: 2,
        actualCost: null,
        forecastCost: null,
      },
      {
        discipline: "Software",
        budgetManDays: 8,
        plannedManDays: 3,
        toDateManDays: 3,
        budgetCost: null,
        plannedCost: null,
        toDateCost: null,
        actualManDays: 1,
        forecastManDays: 1,
        actualCost: null,
        forecastCost: null,
      },
    ]);
  } finally {
    await app.close();
  }
});

test("project cost: one project's breakdown by module, request and plan row, with its labor by discipline", async () => {
  const { database } = fakeDatabase({ planned: true });
  const app = server(database, ["Leader"]);
  try {
    const response = await app.inject({ method: "GET", url: "/api/v1/projects/7/cost" });
    assert.equal(response.statusCode, 200, response.body);
    const body = response.json() as ProjectCostDetail;
    assert.equal(body.project.number, "PJ260091");
    assert.deepEqual(body.access, { budget: true, purchases: true, laborMoney: false });
    // Task doc 6.1: who confirmed the hours, most first, by the discipline of their department, and the weekly curve.
    assert.deepEqual(body.people, [
      { id: 4, name: "Electrical engineer", discipline: "Electrical", hours: 16, days: 2, lastDay: "2026-11-03" },
      { id: 5, name: "IoT engineer", discipline: "Software", hours: 8, days: 1, lastDay: "2026-11-02" },
    ]);
    assert.equal(body.curve?.at(-1)?.actualManDays, 3, "24 confirmed hours are 3 man-days");
    assert.equal(body.curve?.at(-1)?.plannedManDays, 2);
    // Modules by name, and what belongs to no module last.
    assert.deepEqual(body.modules, [
      { module: "MZ01", budget: 70000, requested: 95000, approved: 60000, ordered: 30000 },
      { module: "MZ08", budget: 50000, requested: 0, approved: 0, ordered: 0 },
      { module: "(No module)", budget: 0, requested: 25000, approved: 0, ordered: 0 },
    ]);
    assert.deepEqual(body.requests, [{ id: 11, number: "REQ-ME-PJ260091-MZ01-001", status: "Approved", requiredDate: "2026-11-30", unit: "ME · MZ01-U001 WIRE DUCT UNIT", amount: 95000, lines: 12 }]);
    assert.deepEqual(
      body.project.labor.disciplines.map((row) => [row.discipline, row.budgetManDays, row.plannedManDays, row.budgetCost]),
      [
        ["Electrical", 12, 3, null],
        ["Software", 8, 3, null],
      ],
    );
    assert.deepEqual(
      body.plan.map((row) => [row.id, row.name, row.plannedManDays, row.toDateManDays, row.plannedCost]),
      [[501, "Panel wiring", 6, 6, null]],
    );
  } finally {
    await app.close();
  }
});

test("project cost: a project outside the viewer's scope is not found, and nothing of it is read", async () => {
  const { database, statements } = fakeDatabase({ inScope: false });
  const app = server(database, ["Leader"]);
  try {
    const response = await app.inject({ method: "GET", url: "/api/v1/projects/7/cost" });
    assert.equal(response.statusCode, 404, response.body);
    assert.equal(
      statements.some((text) => text.includes("dbo.v_estimate_totals")),
      false,
    );
  } finally {
    await app.close();
  }
});
