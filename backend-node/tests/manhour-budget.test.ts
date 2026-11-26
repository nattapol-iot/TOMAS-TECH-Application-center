import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import Fastify from "fastify";
import sql from "mssql";
import type { Transaction } from "mssql";
import type { Database } from "../src/db.js";
import { registerErrorHandler } from "../src/errors.js";
import { budgetSource, manHourBudget, parseBudgetManDays, plannedEffort, type BudgetPlanRow, type StoredBudget } from "../src/manhour-budget.js";
import { registerScheduleRoutes } from "../src/routes/schedule.js";
import type { CurrentUserService } from "../src/users.js";

const row = (id: number, parentId: number | null, kind: string, planManDays: number, isMilestone = false): BudgetPlanRow => ({ id, parentId, kind, planManDays, isMilestone });

test("plannedEffort: sub rows with man-days replace the task's own figure, so a piece of work is counted once", () => {
  const rows = [
    row(1, null, "phase", 0),
    row(2, 1, "task", 10), // own 10, but its functions carry 4 + 2
    row(3, 2, "task", 4),
    row(4, 2, "detail", 2),
    row(5, 1, "task", 3), // no sub rows: its own 3
    row(6, 1, "task", 5), // sub rows without man-days: its own 5
    row(7, 6, "task", 0),
  ];
  assert.deepEqual(plannedEffort(rows), { manDays: 14, outsourcedManDays: 0, unplannedRows: 0 });
});

test("plannedEffort: counts the pieces of work with no man-days, not their sub rows, headings or milestones", () => {
  const rows = [
    row(1, null, "phase", 0),
    row(2, 1, "phase", 0), // a heading under a heading
    row(3, 2, "task", 0), // unplanned
    row(4, 3, "task", 0), // part of 3, not counted again
    row(5, 2, "task", 0, true), // milestone: a date, not work
    row(6, 1, "task", 1.5),
    row(7, 99, "task", 0), // parent gone: stands on its own, unplanned
  ];
  assert.deepEqual(plannedEffort(rows), { manDays: 1.5, outsourcedManDays: 0, unplannedRows: 2 });
});

test("plannedEffort: an empty plan and a parent loop do not break it", () => {
  assert.deepEqual(plannedEffort([]), { manDays: 0, outsourcedManDays: 0, unplannedRows: 0 });
  assert.deepEqual(plannedEffort([row(1, 2, "task", 1), row(2, 1, "task", 1)]), { manDays: 0, outsourcedManDays: 0, unplannedRows: 0 });
});

test("budgetSource: the estimate's own labor wins; a typed budget only fills in when it has none", () => {
  assert.equal(budgetSource(12, 30), "estimate");
  assert.equal(budgetSource(0, 30), "manual");
  assert.equal(budgetSource(0, null), "none");
});

test("parseBudgetManDays: null clears, a positive number is kept to 2 decimals, anything else is refused", () => {
  assert.equal(parseBudgetManDays(null), null);
  assert.equal(parseBudgetManDays(12.345), 12.35);
  for (const bad of [0, -1, 100000.01, Number.NaN, "5", undefined, {}]) assert.equal(parseBudgetManDays(bad), undefined);
});

test("manHourBudget: from the estimate with its disciplines; a manager may type one only when the estimate has no labor", () => {
  const plan = [row(1, null, "task", 8), row(2, null, "task", 0)];
  const fromEstimate: StoredBudget = {
    estimateNo: "EST-26-001",
    estimateManDays: 20,
    manualManDays: 99,
    disciplines: [
      { discipline: "Electrical", manDays: 12 },
      { discipline: "Software", manDays: 8 },
    ],
  };
  assert.deepEqual(manHourBudget(fromEstimate, plan, true), {
    source: "estimate",
    estimateNo: "EST-26-001",
    budgetManDays: 20,
    disciplines: fromEstimate.disciplines,
    plannedManDays: 8,
    outsourcedManDays: 0,
    unplannedRows: 1,
    hoursPerManDay: 8,
    canSetBudget: false,
    actualManDays: 0,
    actualPeople: 0,
    outsourceBudgetManDays: 0,
  });
  // Hours confirmed in My Work (migration 121) come through as man-days.
  const confirmed = manHourBudget({ ...fromEstimate, actualHours: 30, actualPeople: 2 }, plan, true);
  assert.equal(confirmed.actualManDays, 3.75);
  assert.equal(confirmed.actualPeople, 2);
  const typed: StoredBudget = { estimateNo: null, estimateManDays: 0, manualManDays: 15, disciplines: [] };
  const manual = manHourBudget(typed, plan, true);
  assert.equal(manual.source, "manual");
  assert.equal(manual.budgetManDays, 15);
  assert.equal(manual.canSetBudget, true);
  assert.equal(manHourBudget(typed, plan, false).canSetBudget, false);
  const none = manHourBudget({ ...typed, manualManDays: null }, plan, true);
  assert.equal(none.source, "none");
  assert.equal(none.budgetManDays, null);
  assert.equal(none.canSetBudget, true);
});

// ── Routes ──────────────────────────────────────────────────────────────────

type Params = Record<string, unknown>;
type Answer = { recordset?: unknown[]; rowsAffected?: number[] };
const PROJECT_ID = 7;
const projectRaw = (status = "Design") => ({ id: PROJECT_ID, project_no: "P-26-007", name: "Line 3 IoT", manager_id: 20, lead_engineer_id: null, status, target_delivery: "2027-12-31" });

function installSqlMock(t: TestContext, answer: (statement: string, params: Params) => Answer | undefined) {
  const statements: { statement: string; params: Params }[] = [];
  const bags = new WeakMap<object, Params>();
  t.mock.method(sql.Request.prototype, "input", function (this: object, name: string, ...rest: unknown[]) {
    const bag = bags.get(this) ?? {};
    bag[name] = rest.length > 1 ? rest[1] : rest[0];
    bags.set(this, bag);
    return this;
  });
  t.mock.method(sql.Request.prototype, "query", async function (this: object, statement: string) {
    const params = { ...(bags.get(this) ?? {}) };
    statements.push({ statement, params });
    return answer(statement, params) ?? { recordset: [], rowsAffected: [1] };
  });
  return statements;
}

function harness(roles: string[]) {
  const app = Fastify();
  registerErrorHandler(app);
  const database = {
    transaction: async <T>(work: (transaction: Transaction) => Promise<T>) => work({} as Transaction),
    query: async () => ({ recordset: [{ allowed: true }] }),
  } as unknown as Database;
  const users = { demandPermission: async () => undefined, required: async () => ({ id: 20, role: roles[0], roles }) } as unknown as CurrentUserService;
  registerScheduleRoutes(app, database, users, "Asia/Bangkok");
  return app;
}

function budgetAnswers(options: { status?: string; estimateManDays?: number; manual?: number | null } = {}) {
  return (statement: string): Answer | undefined => {
    if (statement.includes("FROM dbo.projects p WHERE p.id=@project_id")) return { recordset: [{ allowed: true }] };
    if (statement.includes("SELECT id,project_no,name,manager_id,lead_engineer_id,status,target_delivery,team,")) return { recordset: [projectRaw(options.status)] };
    if (statement.includes("SELECT p.manhour_budget_days,e.estimate_no"))
      return { recordset: [{ manhour_budget_days: options.manual ?? null, estimate_no: options.estimateManDays ? "EST-26-001" : null }] };
    if (statement.includes("FROM dbo.manhour_lines") || statement.includes("INNER JOIN dbo.manhour_lines")) {
      return {
        recordset: options.estimateManDays
          ? [
              { discipline: "Software", man_days: options.estimateManDays },
              { discipline: "Electrical", man_days: 2 },
            ]
          : [],
      };
    }
    return undefined;
  };
}

const put = (app: ReturnType<typeof harness>, payload: unknown) => app.inject({ method: "PUT", url: `/api/v1/projects/${PROJECT_ID}/manhour-budget`, payload: payload as object });

test("PUT manhour-budget: a manager types the budget of a project with no estimated labor, and it is audited", async (t) => {
  const app = harness(["Project Manager"]);
  const statements = installSqlMock(t, budgetAnswers({ manual: 10 }));
  try {
    const response = await put(app, { manDays: 42.5 });
    assert.equal(response.statusCode, 200, response.body);
    assert.deepEqual(response.json(), { manDays: 42.5 });
    const update = statements.find((entry) => entry.statement.includes("UPDATE dbo.projects SET manhour_budget_days=@days"));
    assert.ok(update, "the budget is written");
    assert.equal(update.params.days, 42.5);
    assert.equal(update.params.project, PROJECT_ID);
    const audit = statements.find((entry) => entry.statement.includes("INSERT INTO dbo.audit_log"));
    assert.ok(audit, "the change is audited");
    assert.equal(audit.params.action, "Set man-hour budget");
    assert.match(String(audit.params.before), /10/);
    assert.match(String(audit.params.after), /42\.5/);
  } finally {
    await app.close();
  }
});

test("PUT manhour-budget: empty clears the budget", async (t) => {
  const app = harness(["Admin"]);
  const statements = installSqlMock(t, budgetAnswers({ manual: 10 }));
  try {
    const response = await put(app, { manDays: null });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(statements.find((entry) => entry.statement.includes("UPDATE dbo.projects SET manhour_budget_days=@days"))?.params.days, null);
  } finally {
    await app.close();
  }
});

test("PUT manhour-budget: refused for an engineer, a bad figure, a closed project and a project whose estimate has labor", async (t) => {
  const cases: Array<{ roles: string[]; payload: unknown; answers: ReturnType<typeof budgetAnswers>; status: number; code: string }> = [
    { roles: ["Engineer"], payload: { manDays: 5 }, answers: budgetAnswers(), status: 403, code: "manhour_budget_forbidden" },
    { roles: ["Admin"], payload: { manDays: 0 }, answers: budgetAnswers(), status: 400, code: "validation_failed" },
    { roles: ["Admin"], payload: { manDays: "5" }, answers: budgetAnswers(), status: 400, code: "validation_failed" },
    { roles: ["Admin"], payload: { manDays: 5 }, answers: budgetAnswers({ status: "Closed" }), status: 409, code: "project_closed" },
    { roles: ["Engineering Manager"], payload: { manDays: 5 }, answers: budgetAnswers({ estimateManDays: 30 }), status: 409, code: "manhour_budget_from_estimate" },
  ];
  for (const item of cases) {
    const app = harness(item.roles);
    const statements = installSqlMock(t, item.answers);
    try {
      const response = await put(app, item.payload);
      assert.equal(response.statusCode, item.status, response.body);
      assert.match(response.body, new RegExp(item.code));
      assert.equal(
        statements.some((entry) => entry.statement.includes("UPDATE dbo.projects")),
        false,
        `${item.code}: nothing is written`,
      );
    } finally {
      await app.close();
      t.mock.restoreAll();
    }
  }
});

test("GET schedule: carries the man-hour budget from the estimate, by discipline in the estimate's order, and the confirmed hours", async (t) => {
  const app = harness(["Engineer"]);
  const base = budgetAnswers({ estimateManDays: 30 });
  installSqlMock(t, (statement) =>
    statement.includes("FROM dbo.schedule_tasks WHERE project_id=@project AND deleted_at IS NULL ORDER BY")
      ? { recordset: [] }
      : statement.includes("FROM dbo.work_hours h WHERE h.project_id=@project")
        ? { recordset: [{ hours: 36, people: 2 }] }
        : // Task doc 3.7: supplier labor lines and Outsource (07) lines priced by time.
          statement.includes("l.provider=N'Supplier'")
          ? { recordset: [{ man_days: 3 }] }
          : base(statement),
  );
  try {
    const response = await app.inject({ method: "GET", url: `/api/v1/projects/${PROJECT_ID}/schedule` });
    assert.equal(response.statusCode, 200, response.body);
    assert.deepEqual(response.json().manHours, {
      source: "estimate",
      estimateNo: "EST-26-001",
      budgetManDays: 32,
      disciplines: [
        { discipline: "Electrical", manDays: 2 },
        { discipline: "Software", manDays: 30 },
      ],
      plannedManDays: 0,
      outsourcedManDays: 0,
      unplannedRows: 0,
      hoursPerManDay: 8,
      canSetBudget: false,
      actualManDays: 4.5,
      actualPeople: 2,
      outsourceBudgetManDays: 3,
    });
  } finally {
    await app.close();
  }
});

test("Outsource (07) cost lines count as labor only when priced by the man-day or the hour (task doc 3.7)", async () => {
  const { OUTSOURCE_TIME_UNITS_SQL } = await import("../src/manhour-budget.js");
  assert.match(OUTSOURCE_TIME_UNITS_SQL, /N'md'[^)]*N'วัน'[^)]*\) THEN c\.qty/);
  assert.match(OUTSOURCE_TIME_UNITS_SQL, /N'hour'[^)]*N'ชม\.'[^)]*\) THEN c\.qty\/8\.0/);
  assert.match(OUTSOURCE_TIME_UNITS_SQL, /ELSE 0 END/);
});

test("GET schedule: confirmed hours by discipline, counted as the Overview and Cost tabs count them (QA 2026-11-26)", async (t) => {
  const app = harness(["Engineer"]);
  const base = budgetAnswers({ estimateManDays: 30 });
  installSqlMock(t, (statement) =>
    statement.includes("SELECT h.work_key,u.department,SUM(h.hours) hours")
      ? {
          recordset: [
            // A row this plan no longer has, a meeting, nothing named: the worker's department (the rows' own rules are
            // project-cost-actual.test.ts actualDiscipline's).
            { work_key: "Project-71", department: "Electrical Engineer Dept.", hours: 6 },
            { work_key: "Meeting-3", department: "IoT Engineer Dept.", hours: 4 },
            { work_key: null, department: "Electrical Engineer Dept.", hours: 2 },
          ],
        }
      : statement.includes("FROM dbo.schedule_tasks WHERE project_id=@project AND deleted_at IS NULL ORDER BY")
        ? { recordset: [] }
        : base(statement),
  );
  try {
    const response = await app.inject({ method: "GET", url: `/api/v1/projects/${PROJECT_ID}/schedule` });
    assert.equal(response.statusCode, 200, response.body);
    assert.deepEqual(response.json().actualByDiscipline, [
      { discipline: "Electrical", hours: 8 },
      { discipline: "Software", hours: 4 },
    ]);
  } finally {
    await app.close();
  }
});
