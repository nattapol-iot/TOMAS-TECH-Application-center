import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

test("KPI migration owns the review lifecycle, permissions, concurrency and immutable completion", async () => {
  const migration = await source("database/migrations/026_performance_reviews.sql");
  for (const table of ["kpi_review_cycles", "kpi_assessments", "kpi_assessment_scores"]) {
    assert.match(migration, new RegExp(`CREATE TABLE dbo\\.${table}`));
    assert.match(migration, new RegExp(`GRANT SELECT, INSERT, UPDATE ON dbo\\.${table}`));
  }
  assert.match(migration, /row_version rowversion NOT NULL/g);
  assert.match(migration, /performance\.read/);
  assert.match(migration, /performance\.manage/);
  assert.match(migration, /tr_kpi_completed_assessment_frozen/);
  assert.match(migration, /tr_kpi_completed_scores_frozen/);
  assert.match(migration, /VALUES \(26, N'Durable role-scoped KPI performance reviews'\)/);
});

test("the active Node production API enforces role scope, workflow, optimistic concurrency and audit", async () => {
  const node = await source("backend-node/src/routes/performance.ts");
  for (const path of ["performance/overview", "performance/cycles", "performance/assessments/:employeeId"]) assert.match(node, new RegExp(path));
  assert.match(node, /performance\.read/);
  assert.match(node, /performance\.manage/);
  assert.match(node, /performance_self_review_submitted/);
  assert.match(node, /performance_self_review_required/);
  assert.match(node, /performance_completion_conflict/);
  assert.match(node, /requires concrete evidence for a rating/);
  assert.match(node, /row_version/);
  assert.match(node, /KpiAssessment/);
  assert.match(node, /Completed after calibration/);
  assert.match(node, /status.*COMPLETED/s);
  assert.match(node, /visibleManager = \(canManage && Number\(row\.user_id\) !== actor\.id\) \|\| row\.status === "COMPLETED"/);
});

test("production KPI UI is API-backed while the demo keeps isolated sample state", async () => {
  const [screen, client, productionApp, demoApp] = await Promise.all([
    source("app/system/production/PerformanceScreen.tsx"),
    source("app/system/api-client.ts"),
    source("app/system/ProductionApp.tsx"),
    source("app/system/App.tsx"),
  ]);
  assert.match(productionApp, /<Performance[^>]*apiBacked/);
  assert.match(demoApp, /<Performance/);
  assert.doesNotMatch(demoApp, /<Performance[^>]*apiBacked/);
  assert.match(screen, /loadPerformanceOverview/);
  assert.match(screen, /updatePerformanceAssessment/);
  assert.match(screen, /completePerformanceAssessment/);
  assert.match(screen, /Awaiting self review/);
  assert.match(screen, /Submitted to manager/);
  assert.match(screen, /Employee evidence:/);
  assert.match(screen, /required for this rating/);
  assert.match(client, /\/api\/v1\/performance\/overview/);
  assert.match(client, /\/api\/v1\/performance\/assessments\/\$\{employeeId\}/);
});

test("Node KPI work evidence uses real assigned sources and keeps the final rating human-owned", async () => {
  const [route, engine, screen, client] = await Promise.all([
    source("backend-node/src/routes/performance.ts"),
    source("backend-node/src/performance-evidence.ts"),
    source("app/system/production/PerformanceScreen.tsx"),
    source("app/system/api-client.ts"),
  ]);
  assert.match(route, /performance\/evidence\/:employeeId/);
  assert.match(route, /schedule_task_pics/);
  assert.match(route, /resource_tasks/);
  assert.match(route, /inquiry_meetings/);
  assert.match(route, /performance\.manage/);
  assert.match(engine, /decision support only/i);
  assert.match(engine, /dueTasks\.length >= 3/);
  assert.match(screen, /loadPerformanceEvidence/);
  assert.match(screen, /Decision support, not an automatic final rating/);
  assert.match(screen, /Use evidence/);
  assert.match(screen, /performance-source-icon/);
  assert.doesNotMatch(screen, /19 of 21 milestones delivered on time/);
  assert.doesNotMatch(screen, /MQTT troubleshooting playbook published/);
  assert.match(client, /\/api\/v1\/performance\/evidence\/\$\{employeeId\}/);
});

test("Sales KPI uses a role-specific framework, scoped management and additive schema migration", async () => {
  const [migration, route, framework, engine, screen, client] = await Promise.all([
    source("database/migrations/029_sales_performance_reviews.sql"),
    source("backend-node/src/routes/performance.ts"),
    source("backend-node/src/performance-framework.ts"),
    source("backend-node/src/performance-evidence.ts"),
    source("app/system/production/PerformanceScreen.tsx"),
    source("app/system/api-client.ts"),
  ]);
  assert.match(migration, /Sales Engineer/);
  assert.match(migration, /Sales Manager/);
  assert.match(migration, /PIPELINE.*CUSTOMER.*FORECAST.*COMMERCIAL.*HANDOVER/s);
  assert.match(migration, /VALUES\(29,N'Role-specific Sales KPI performance reviews'\)/);
  assert.match(framework, /canManagePerformanceTarget/);
  assert.match(route, /buildSalesPerformanceEvidence/);
  assert.match(route, /performance_scope_denied/);
  assert.match(engine, /weighted recorded pipeline/);
  assert.match(engine, /probability calibration accuracy/);
  assert.match(screen, /Sales KPI framework/);
  assert.match(screen, /Sales Engineer/);
  assert.match(screen, /areasForRole/);
  assert.match(screen, /<Framework role=\{currentMember\.role\} canManage=\{managerView\}/);
  assert.match(screen, /canManage \|\| !isSalesRole\(role\)/);
  assert.match(screen, /canManage \|\| isSalesRole\(role\)/);
  assert.match(client, /frameworkCode: "ENGINEERING" \| "SALES"/);
});
