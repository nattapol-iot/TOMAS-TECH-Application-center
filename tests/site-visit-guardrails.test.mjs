import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/*
 * Structural guardrails for the Sales Intake & Site Visit module.
 *
 * These are the invariants that lint, type-check and the behavioural tests
 * cannot see: that the database still enforces what the code assumes, that the
 * Node API's status vocabulary has not drifted from the schema, and that the
 * separation between what sales said and what engineering concluded is still
 * a property of the schema rather than a convention somebody remembers.
 */

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("the site visit schema enforces its invariants in the database", async () => {
  const migration = await read("database/migrations/016_sales_intake_site_visit.sql");

  // Version gate, so the migration cannot land on the wrong schema.
  assert.match(migration, /WHERE version = 16/);
  assert.match(migration, /Migration 015 must be applied before migration 016/);

  // A double-booking is a relationship between rows; only a lock can stop it.
  assert.match(migration, /CREATE PROCEDURE dbo\.assert_engineer_available/);
  assert.match(migration, /UPDLOCK, HOLDLOCK/);
  // The override reports the conflict rather than skipping the check.
  assert.match(migration, /@allow_conflict bit = 0/);
  assert.match(migration, /@conflict_count int OUTPUT/);
  assert.match(migration, /IF @conflict_count > 0 AND @allow_conflict = 0/);

  // History is evidence, not working data.
  assert.match(migration, /trg_site_visit_status_history_append_only/);
  assert.match(migration, /trg_site_visit_schedule_history_append_only/);
  assert.match(migration, /INSTEAD OF UPDATE, DELETE/);
  // An approved report revision is frozen.
  assert.match(migration, /trg_site_visit_report_revisions_immutable/);
  assert.match(migration, /UX_site_visit_report_revisions_one_approved/);
  // Executed work is archived, never deleted.
  assert.match(migration, /trg_site_visits_no_hard_delete/);
  assert.match(migration, /trg_sales_intakes_no_hard_delete/);

  // One live assignment per engineer, one live lead.
  assert.match(migration, /UX_site_visit_assignments_active/);
  assert.match(migration, /UX_site_visit_assignments_lead/);
  // An override without a manager and a reason is not representable.
  assert.match(migration, /CK_site_visit_assignments_override/);
  assert.match(migration, /LEN\(LTRIM\(RTRIM\(override_reason\)\)\) >= 10/);
  // A completed visit was checked out of.
  assert.match(migration, /CK_site_visits_completed_requires_checkout/);
  // Location is only stored with consent.
  assert.match(migration, /CK_site_visits_geo/);
  assert.match(migration, /location_consent_given = 1/);

  // Notification de-duplication is an index, not a query somebody remembers.
  assert.match(migration, /UX_notifications_dedupe/);
  assert.match(migration, /WHERE dedupe_key IS NOT NULL/);

  // The customer's own reference may repeat; it is indexed, never unique.
  assert.match(migration, /IX_sales_intakes_customer_reference/);
  assert.doesNotMatch(migration, /UNIQUE.*customer_reference_no/);
});

test("sales requirement, technical assessment and site findings are separate tables", async () => {
  const migration = await read("database/migrations/016_sales_intake_site_visit.sql");
  for (const table of ["dbo.sales_intakes", "dbo.sales_intake_reviews", "dbo.site_visit_findings"]) {
    assert.match(migration, new RegExp(`CREATE TABLE ${table.replace(".", "\\.")} \\(`));
  }
  // A review is a record of a decision: inserted, never edited.
  assert.match(migration, /GRANT SELECT, INSERT ON OBJECT::dbo\.sales_intake_reviews/);
  assert.doesNotMatch(migration, /GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo\.sales_intake_reviews/);
  assert.match(migration, /GRANT SELECT, INSERT ON OBJECT::dbo\.site_visit_status_history/);

  // No engineering write path may reach the sales requirement columns. The
  // visit workflow and report routes are the ones that could, so they are
  // checked by name against the sales-only column list.
  const salesOnlyColumns = ["problem_statement", "desired_capability", "expected_result", "expected_scope"];
  const engineeringRoutes = await Promise.all([
    read("backend-node/src/routes/site-visits-workflow.ts"),
    read("backend-node/src/routes/site-visit-reports.ts"),
  ]);
  for (const source of engineeringRoutes) {
    for (const column of salesOnlyColumns) {
      assert.doesNotMatch(source, new RegExp(`UPDATE dbo\\.sales_intakes[^;]{0,400}${column}\\s*=`),
        `a site visit route must not write dbo.sales_intakes.${column}`);
    }
  }
});

test("permissions are declared once and enforced on every write path", async () => {
  const [migration, core, intake, visit, reports, master, operations] = await Promise.all([
    read("database/migrations/016_sales_intake_site_visit.sql"),
    read("backend-node/src/site-visit-common.ts"),
    read("backend-node/src/routes/sales-intakes.ts"),
    read("backend-node/src/routes/site-visits-workflow.ts"),
    read("backend-node/src/routes/site-visit-reports.ts"),
    read("backend-node/src/routes/visit-master.ts"),
    read("backend-node/src/site-visit-operations.ts"),
  ]);

  const permissions = [
    "intake.read", "intake.write", "intake.review", "visit.read", "visit.schedule",
    "visit.override", "visit.execute", "visit.report", "visit.report_approve",
    "visit.link", "visit.admin",
  ];
  for (const permission of permissions) {
    assert.match(migration, new RegExp(`\\(N'${permission.replace(".", "\\.")}',`), `${permission} is not seeded`);
    assert.match(core, new RegExp(`"${permission.replace(".", "\\.")}"`), `${permission} is missing from site-visit-common.ts`);
  }

  // Sales roles get intake.write but never visit.schedule — the rule that
  // "sales may not finally assign an engineer" lives in this grant.
  assert.match(migration, /p\.code = N'intake\.write'[\s\S]{0,200}N'Sales Engineer'/);
  const scheduleGrant = migration.slice(migration.indexOf("N'intake.review', N'visit.schedule'"));
  const scheduleRoles = scheduleGrant.slice(0, 400);
  assert.doesNotMatch(scheduleRoles, /Sales Engineer/);
  // Overriding a conflict is a manager decision only.
  assert.match(migration, /p\.code = N'visit\.override'[\s\S]{0,200}N'Engineering Manager', N'Admin'/);

  // Every mutating route demands a permission before it touches anything.
  for (const [name, source] of [["intake", intake], ["visit", visit], ["report", reports], ["master", master]]) {
    const mutations = source.match(/app\.(?:post|put|patch|delete)\(/g) ?? [];
    assert.ok(mutations.length > 0, `${name} routes expose no mutations?`);
    const demands = source.match(/demandPermission\(|hasRolePermission\(|rolePermissions\(/g) ?? [];
    assert.ok(demands.length >= mutations.length, `${name} has ${mutations.length} mutations but only ${demands.length} authorisation calls`);
  }

  // Holding visit.execute is necessary, not sufficient: the caller must also
  // be an engineer who accepted this particular visit.
  assert.match(operations, /async function demandAssignedEngineer/);
  // A report author cannot approve their own report.
  assert.match(reports, /self_approval_forbidden/);
});

test("concurrency and transactions are used on every stateful write", async () => {
  const [intake, visit, reports, read_] = await Promise.all([
    read("backend-node/src/routes/sales-intakes.ts"),
    read("backend-node/src/routes/site-visits-workflow.ts"),
    read("backend-node/src/routes/site-visit-reports.ts"),
    read("backend-node/src/routes/site-visits-read.ts"),
  ]);
  for (const source of [intake, visit, reports]) {
    assert.match(source, /\.transaction\(/);
    assert.match(source, /WITH\s*\(\s*UPDLOCK\s*,\s*HOLDLOCK\s*\)/i);
  }
  for (const source of [intake, visit]) assert.match(source, /requireRowVersion\(/);
  // The readiness score is recomputed from the database, never trusted from the request body.
  assert.match(intake, /readiness_blocked/);
  assert.doesNotMatch(intake, /body\.readinessScore/);
  // The availability check is the database's, not a client-side guess.
  assert.match(read_, /dbo\.assert_engineer_available/);
});

test("the module is registered, audited and notified", async () => {
  const [app, core, intake, visit, reports] = await Promise.all([
    read("backend-node/src/app.ts"),
    read("backend-node/src/site-visit-common.ts"),
    read("backend-node/src/routes/sales-intakes.ts"),
    read("backend-node/src/routes/site-visits-workflow.ts"),
    read("backend-node/src/routes/site-visit-reports.ts"),
  ]);
  for (const register of ["registerSalesIntakeRoutes", "registerSiteVisitReadRoutes", "registerSiteVisitWorkflowRoutes", "registerSiteVisitReportRoutes", "registerVisitMasterRoutes"]) {
    assert.match(app, new RegExp(`${register}\\(app,`));
  }

  // Audit, status history and notifications are written from one place, so a
  // new route cannot quietly skip them.
  assert.match(core, /export async function siteVisitAudit/);
  assert.match(core, /export async function recordSiteVisitStatus/);
  assert.match(core, /export async function notifyUsers/);
  // De-duplication is enforced by the index and guarded by the insert.
  assert.match(core, /dedupe_key/);
  assert.match(core, /IF NOT EXISTS/);

  for (const source of [intake, visit, reports]) {
    assert.match(source, /siteVisitAudit\(/);
    assert.match(source, /recordSiteVisitStatus\(/);
    assert.match(source, /notifyUsers\(/);
  }
});

test("the status vocabulary is identical in the API and the schema", async () => {
  const [core, migration] = await Promise.all([
    read("backend-node/src/site-visit-common.ts"),
    read("database/migrations/016_sales_intake_site_visit.sql"),
  ]);
  /** The literal transition table exported by site-visit-common.ts. */
  const table = (name) => {
    const literal = new RegExp(`export const ${name}[^=]*=\\s*(\\{[^\\n]*\\});`).exec(core);
    assert.ok(literal, `${name} not found in site-visit-common.ts`);
    return Function(`return (${literal[1]});`)();
  };
  const statuses = (map) => new Set(Object.entries(map).flatMap(([from, edges]) => [from, ...edges.map(([to]) => to)]));

  // The CHECK constraint is the authority; every state the API can reach must be allowed by it.
  const intakeCheck = migration.slice(migration.indexOf("CK_sales_intakes_status"), migration.indexOf("CK_sales_intakes_priority"));
  for (const status of statuses(table("INTAKE_TRANSITIONS"))) {
    assert.ok(intakeCheck.includes(`N'${status}'`), `dbo.sales_intakes does not allow '${status}'`);
  }
  const visitCheck = migration.slice(migration.indexOf("CK_site_visits_status"), migration.indexOf("CK_site_visits_schedule_range"));
  for (const status of statuses(table("VISIT_TRANSITIONS"))) {
    assert.ok(visitCheck.includes(`N'${status}'`), `dbo.site_visits does not allow '${status}'`);
  }
  // Every edge names a permission the migration seeds.
  for (const map of [table("INTAKE_TRANSITIONS"), table("VISIT_TRANSITIONS")]) {
    for (const [, permission] of Object.values(map).flat()) {
      assert.match(migration, new RegExp(`\\(N'${permission.replace(".", "\\.")}',`), `${permission} is not seeded`);
    }
  }
});

test("the site visit screens are API-backed and permission-filtered", async () => {
  const [screen, client, shell] = await Promise.all([
    read("app/system/production/SiteVisitScreens.tsx"),
    read("app/system/api-client.ts"),
    read("app/system/ProductionApp.tsx"),
  ]);

  // The production screens must never reach for the demo dataset.
  assert.doesNotMatch(screen, /from ["'][^"']*(?:\/data|\/calc|\/store|\/matstore|\/session)["']/);
  assert.match(screen, /from "\.\.\/api-client"/);

  // Every screen the requirement asks for is present.
  for (const label of [
    "คำขอเข้าหน้างาน / Visit preparation", "Technical Review Queue", "Sales Dashboard",
    "Site Visit Requests", "Engineer Availability Calendar", "Engineering Dashboard",
    "Pre-visit brief", "My Assignments", "Visit Master Data",
    "Checklist Templates", "Engineer Skills", "Site visit report",
  ]) {
    assert.ok(screen.includes(label), `the production module is missing the '${label}' screen`);
  }

  // The typed client covers the workflow end to end.
  for (const call of [
    "listSalesIntakes", "createSalesIntake", "changeIntakeStatus", "submitTechnicalReview",
    "createSiteVisit", "assignVisitEngineer", "respondToAssignment", "recordVisitConfirmation",
    "checkInSiteVisit", "checkOutSiteVisit", "saveVisitChecklist", "saveVisitReport",
    "reviewVisitReport", "createInquiryFromVisit", "createEstimateFromVisit",
    "loadVisitCalendar", "loadMyAssignments", "loadVisitMasterData", "listNotifications",
  ]) {
    assert.match(client, new RegExp(`export const ${call}|export async function ${call}`), `api-client is missing ${call}`);
  }

  // The shell filters the new menus by permission rather than by role name.
  assert.match(screen, /tab === "preparation".*ProductionSalesIntake/);
  assert.match(screen, /relatedInquiryId: inquiry\?\.id/);
  assert.match(shell, /view: "site-visits", label: "Site Visit", icon: "truck", permission: "visit\.read"/);
  assert.match(shell, /view: "my-assignments", label: "My Assignments", icon: "play", permission: "visit\.read"/);
  assert.match(shell, /"view":"visit-master","label":"Site Visit Reference Data","icon":"layers","permission":"visit\.read"/);
});

test("every CSS class the module renders is actually defined", async () => {
  // Lint, type-check and the tests cannot see a class name that does not
  // exist — it is only a string. This module shipped eighteen undefined
  // classes once before, so the check is here rather than in a comment.
  const [production, css] = await Promise.all([
    read("app/system/production/SiteVisitScreens.tsx"),
    Promise.all([read("app/globals.css"), read("app/system/production/site-visit-workspace.css")]).then((styles) => styles.join("\n")),
  ]);
  const missing = new Set();
  for (const match of production.matchAll(/className="([a-z0-9 _-]+)"/g)) {
    for (const name of match[1].split(/\s+/).filter(Boolean)) {
      if (!new RegExp(`\\.${name}\\b`).test(css)) missing.add(name);
    }
  }
  assert.deepEqual([...missing], [], "these CSS classes are rendered but never defined");
});

test("the site visit module is part of deployment and of the production baseline", async () => {
  const [deployment, grants, verifier, seed] = await Promise.all([
    read("database/scripts/020_deploy_fresh_database.sql"),
    read("database/scripts/010_application_login.sql"),
    read("database/scripts/080_verify_production_baseline.sql"),
    read("database/scripts/920_site_visit_master_seed.sql"),
  ]);
  assert.match(deployment, /016_sales_intake_site_visit\.sql/);
  assert.match(deployment, /version BETWEEN 1 AND 73\) <> 73/);

  // The application role may create and read a notification, and mark it read.
  // It may never delete one, nor delete from any append-only ledger.
  assert.match(grants, /GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo\.notifications/);
  assert.match(grants, /GRANT SELECT, INSERT ON OBJECT::dbo\.site_visit_status_history/);
  assert.match(grants, /GRANT SELECT, INSERT ON OBJECT::dbo\.sales_intake_reviews/);
  assert.match(verifier, /assert_engineer_available/);
  assert.match(verifier, /trg_site_visit_report_revisions_immutable/);
  assert.match(verifier, /UX_notifications_dedupe/);
  assert.match(verifier, /append-only ledger/);

  // The seed carries Thai and Japanese text, so it must warn about -f 65001.
  assert.match(seed, /-f 65001/);
  assert.match(seed, /NOT EXISTS/);
});
