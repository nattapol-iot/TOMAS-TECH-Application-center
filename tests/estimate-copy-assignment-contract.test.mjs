import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

test("Copy Previous Estimate sends the whole selection to one server transaction", async () => {
  const [screen, client, app] = await Promise.all([
    source("app/system/production/EstimateScreens.tsx"),
    source("app/system/api-client.ts"),
    source("backend-node/src/app.ts"),
  ]);
  assert.match(client, /apiRequest<EstimateCopyResult>\(`\/api\/v1\/estimates\/\$\{estimateId\}\/copy-from`, \{ method: "POST"/);
  assert.match(app, /registerEstimateCopyRoutes\(app, config, database, users\);/);
  // The copy tool is the one that was already there, now calling the transactional endpoint.
  assert.match(screen, /setTool\("copy"\)/);
  assert.match(screen, /tool === "copy" \? <CopyPreviousEstimateModal/);
  assert.match(screen, /copyEstimateContent\(estimateId, \{ \.\.\.input, estimateRowVersion: workspace\.header\.rowVersion, ownerId: workspace\.header\.ownerId \}\)/);
  // The per-line loop must not be how a copy is written any more.
  const copyHandler = screen.slice(screen.indexOf("onCopyFrom={async"), screen.indexOf("onEdit={(line) => { setCostSeed({}); setCostEditor(line); }}"));
  assert.doesNotMatch(copyHandler, /onBulkAddCost|createCostItem/);
  assert.match(screen, /Copied from \$\{result\.sourceNumber\}/);
});

test("the copy modal offers every ledger and only the sections the account may write", async () => {
  const screen = await source("app/system/production/EstimateScreens.tsx");
  const modal = screen.slice(screen.indexOf("function CopyPreviousEstimateModal"), screen.indexOf("const OTHER_COST_SECTION_BY_CATEGORY"));
  for (const flag of ["includeManhour", "includeExpenses", "includeOtherCosts", "includeErpCategories"]) assert.ok(modal.includes(flag), flag);
  assert.match(modal, /canEditAllSections \|\| workspace\.capabilities\.editableSections\.includes\(code\)/);
  assert.match(modal, /sections: selected\.filter\(allowedSection\)/);
});

test("the copy route is one transaction that never writes to the source estimate", async () => {
  const route = await source("backend-node/src/routes/estimate-copy.ts");
  assert.match(route, /database\.transaction\(async \(transaction\) => \{/);
  assert.match(route, /await lockEditableEstimate\(transaction, targetId, estimateRowVersion\)/);
  assert.match(route, /await assertEstimateTotals\(transaction, targetId\)/);
  assert.match(route, /await touchEstimate\(transaction, targetId, actor\.id\)/);
  // Every write names the target; the source is only ever read.
  for (const table of ["dbo.cost_items", "dbo.manhour_lines", "dbo.expense_lines", "dbo.other_cost_lines", "dbo.estimate_erp_mappings"]) {
    assert.ok(route.includes(`INSERT INTO ${table}`), table);
  }
  assert.doesNotMatch(route, /UPDATE dbo\.(cost_items|manhour_lines|expense_lines|other_cost_lines)/);
  // `@source_id` may only ever appear in a read; no write statement may bind it.
  for (const line of route.split("\n")) {
    if (!line.includes("@source_id")) continue;
    assert.doesNotMatch(line, /\b(INSERT|UPDATE|DELETE|MERGE)\b/, line);
  }
});

test("a copy carries provenance and classification but never approval state or an existing assignee", async () => {
  const route = await source("backend-node/src/routes/estimate-copy.ts");
  // Price provenance is copied verbatim rather than overwritten with a generic source label.
  for (const column of ["price_source", "reference_no", "reference_project", "price_date"]) {
    assert.ok(route.includes(`@${column}`), column);
  }
  // Approval, submission, revision history and export records are not part of a copy.
  for (const table of ["estimate_revisions", "estimate_erp_export_events", "estimate_overhead_snapshots"]) {
    assert.ok(!route.includes(table), table);
  }
  // Assignments are per discipline (Electrical / Mechanical / Software) and are made explicitly:
  // a copy never creates, rewrites or starts one.
  assert.doesNotMatch(route, /INSERT INTO dbo\.estimate_assignments/);
  assert.doesNotMatch(route, /UPDATE dbo\.estimate_assignments/);
  assert.match(route, /estimateAssignees\(transaction, targetId, estimate\.revision\)/);
  // ERP provenance columns stay null because the constraint describes a later revision of the same estimate.
  assert.doesNotMatch(route, /INSERT INTO dbo\.estimate_erp_mappings[\s\S]{0,400}copied_from_mapping_id/);
});

test("internal labour is re-rated from the live master, so a copy cannot import historical rates", async () => {
  const [route, workspaceWrite] = await Promise.all([
    source("backend-node/src/routes/estimate-copy.ts"),
    source("backend-node/src/routes/estimate-workspace-write.ts"),
  ]);
  const rateQuery = /FROM dbo\.engineering_rates WHERE level=@level AND department=@department AND is_active=1 AND effective_from<=@today/;
  assert.match(workspaceWrite, rateQuery);
  assert.match(route, rateQuery);
  assert.match(route, /isSupplier \? Number\(row\.daily_rate\) : await resolveInternalRate/);
  assert.match(route, /engineering_rate_missing/);
});

test("My Work lists the estimate sections assigned to the signed-in engineer", async () => {
  const [screens, app, client, backendApp] = await Promise.all([
    source("app/system/production/PlanningPricingScreens.tsx"),
    source("app/system/ProductionApp.tsx"),
    source("app/system/api-client.ts"),
    source("backend-node/src/app.ts"),
  ]);
  assert.match(client, /apiRequest<MyEstimateAssignment\[\]>\(`\/api\/v1\/me\/estimate-assignments\$\{queryString\(values\)\}`\)/);
  assert.match(backendApp, /registerEstimateAssignmentReadRoutes\(app, database, users\);/);
  assert.match(screens, /function MyEstimateAssignmentsPanel/);
  assert.match(screens, /useMyEstimateAssignments\(bootstrap\.permissions\.includes\("estimate\.read"\)\)/);
  // The panel is reachable whether or not the account also has schedule permissions.
  assert.equal(screens.match(/\{estimateAssignmentsPanel\}/g)?.length, 2);
  // My Work can open the estimate directly, using the app's existing navigation.
  assert.match(app, /openEstimate,\r?\n {4}onMyWorkUrgentCountChange: setMyWorkUrgentCount,/);
  assert.match(screens, /onOpenEstimate=\{openEstimate\}/);
});

test("the assignment queue groups sections by estimate revision with one navigation action", async () => {
  const screens = await source("app/system/production/PlanningPricingScreens.tsx");
  const panel = screens.slice(screens.indexOf("function MyEstimateAssignmentsPanel"), screens.indexOf("function useMyEstimateAssignments"));
  assert.match(panel, /const grouped = new Map/);
  assert.match(panel, /`\$\{record\.estimateId\}:\$\{record\.revision\}`/);
  assert.match(panel, /className="estimate-work-group"/);
  assert.match(panel, /className="estimate-work-sections"/);
  assert.equal((panel.match(/text=\{"Open Estimate"\}/g) ?? []).length, 1);
  assert.doesNotMatch(panel, /<table|<thead|<tbody/);
  assert.match(panel, /assignmentNextAction\(record\)/);
  assert.match(panel, /sectionName\(record\.sectionCode\)/);
  assert.match(panel, /sortAssignmentQueue\(assignments, todayIso\)/);
  assert.match(panel, /assignmentQueueSummary\(assignments, todayIso\)/);
  assert.match(panel, /quietDays\(updatedAt\)/);
  // Visibility never depends on the engineer changing the status first.
  assert.doesNotMatch(panel, /patchProgress|apiRequest\(/);
});

test("the assignment read is scoped to the caller and respects finished and archived states", async () => {
  const route = await source("backend-node/src/routes/estimate-assignments-read.ts");
  assert.match(route, /WHERE \(a\.owner_id=@actor OR a\.support_id=@actor\)/);
  assert.match(route, /e\.deleted_at IS NULL AND i\.deleted_at IS NULL/);
  assert.match(route, /CLOSED_ASSIGNMENT_STATUSES = \["Completed", "Reviewed"\]/);
  assert.match(route, /CLOSED_ESTIMATE_STATUSES = \["Approved", "Locked"\]/);
  assert.match(route, /line\.revision=e\.revision/);
  // A read must not move work along to make it visible.
  assert.doesNotMatch(route, /\b(UPDATE|INSERT|DELETE|MERGE)\b/);
});

test("the copy and assignment work adds no migration, so the labor lane keeps 044", async () => {
  const [route, read] = await Promise.all([
    source("backend-node/src/routes/estimate-copy.ts"),
    source("backend-node/src/routes/estimate-assignments-read.ts"),
  ]);
  for (const file of [route, read]) {
    assert.doesNotMatch(file, /CREATE TABLE|ALTER TABLE|CREATE INDEX|DROP /);
  }
});
