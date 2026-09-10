import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

/*
 * Structural guardrails for the Sales Intake & Site Visit module.
 *
 * These are the invariants that lint, type-check and the behavioural tests
 * cannot see: that the database still enforces what the code assumes, that the
 * three copies of the status vocabulary have not drifted, and that the
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
  // review and the visit endpoints are the two that could, so they are checked
  // by name against the sales-only column list.
  const salesOnlyColumns = ["problem_statement", "desired_capability", "expected_result", "expected_scope"];
  const visitEndpoints = await read("backend/IoTTeamCenter.Api/Endpoints/SiteVisitEndpoints.cs");
  for (const column of salesOnlyColumns) {
    assert.doesNotMatch(visitEndpoints, new RegExp(`UPDATE dbo\\.sales_intakes[\\s\\S]{0,400}${column}\\s*=`),
      `SiteVisitEndpoints must not write dbo.sales_intakes.${column}`);
  }
});

test("permissions are declared once and enforced on every write path", async () => {
  const [migration, core, intake, visit, master] = await Promise.all([
    read("database/migrations/016_sales_intake_site_visit.sql"),
    read("backend/IoTTeamCenter.Api/Endpoints/SiteVisitCore.cs"),
    read("backend/IoTTeamCenter.Api/Endpoints/SalesIntakeEndpoints.cs"),
    read("backend/IoTTeamCenter.Api/Endpoints/SiteVisitEndpoints.cs"),
    read("backend/IoTTeamCenter.Api/Endpoints/SiteVisitMasterEndpoints.cs"),
  ]);

  const permissions = [
    "intake.read", "intake.write", "intake.review", "visit.read", "visit.schedule",
    "visit.override", "visit.execute", "visit.report", "visit.report_approve",
    "visit.link", "visit.admin",
  ];
  for (const permission of permissions) {
    assert.match(migration, new RegExp(`\\(N'${permission.replace(".", "\\.")}',`), `${permission} is not seeded`);
    assert.match(core, new RegExp(`"${permission.replace(".", "\\.")}"`), `${permission} is missing from SiteVisitCore`);
  }

  // Sales roles get intake.write but never visit.schedule — the rule that
  // "sales may not finally assign an engineer" lives in this grant.
  assert.match(migration, /p\.code = N'intake\.write'[\s\S]{0,200}N'Sales Engineer'/);
  const scheduleGrant = migration.slice(migration.indexOf("N'intake.review', N'visit.schedule'"));
  const scheduleRoles = scheduleGrant.slice(0, 400);
  assert.doesNotMatch(scheduleRoles, /Sales Engineer/);
  // Overriding a conflict is a manager decision only.
  assert.match(migration, /p\.code = N'visit\.override'[\s\S]{0,200}N'Engineering Manager', N'Admin'/);

  // Every mutating endpoint demands a permission before it touches anything.
  for (const [name, source] of [["intake", intake], ["visit", visit], ["master", master]]) {
    const mutations = source.match(/private static async Task<IResult> (Create|Save|Change|Submit|Assign|Respond|Record|Check|Review|Acknowledge|Close|Link|Delete|Withdraw|Reschedule|Mark)\w*Async\(/g) ?? [];
    assert.ok(mutations.length > 0, `${name} endpoints expose no mutations?`);
    const demands = source.match(/DemandPermissionAsync|LoadPermissionsAsync|GetRequiredAsync/g) ?? [];
    assert.ok(demands.length >= mutations.length, `${name} has ${mutations.length} mutations but only ${demands.length} authorisation calls`);
  }

  // Holding visit.execute is necessary, not sufficient: the caller must also
  // be an engineer who accepted this particular visit.
  assert.match(visit, /DemandAssignedEngineerAsync/);
  assert.match(visit, /not_assigned/);
  // A report author cannot approve their own report.
  assert.match(visit, /self_approval_forbidden/);
});

test("concurrency and transactions are used on every stateful write", async () => {
  const [intake, visit] = await Promise.all([
    read("backend/IoTTeamCenter.Api/Endpoints/SalesIntakeEndpoints.cs"),
    read("backend/IoTTeamCenter.Api/Endpoints/SiteVisitEndpoints.cs"),
  ]);
  for (const source of [intake, visit]) {
    assert.match(source, /IsolationLevel\.Serializable/);
    assert.match(source, /WITH \(UPDLOCK, HOLDLOCK\)/);
    assert.match(source, /RequireSameVersion/);
    assert.match(source, /RollbackAsync/);
  }
  // The readiness score is recomputed from the database, never trusted from
  // the request body.
  assert.match(intake, /RecomputeReadinessAsync/);
  assert.match(intake, /readiness_blocked/);
  assert.doesNotMatch(intake, /request\.ReadinessScore/);
  // Every assignment and reschedule re-runs the availability check.
  assert.match(visit, /dbo\.assert_engineer_available/);
  assert.match(visit, /schedule_conflict/);
});

test("the module is registered, audited and notified", async () => {
  const [program, core, intake, visit] = await Promise.all([
    read("backend/IoTTeamCenter.Api/Program.cs"),
    read("backend/IoTTeamCenter.Api/Endpoints/SiteVisitCore.cs"),
    read("backend/IoTTeamCenter.Api/Endpoints/SalesIntakeEndpoints.cs"),
    read("backend/IoTTeamCenter.Api/Endpoints/SiteVisitEndpoints.cs"),
  ]);
  assert.match(program, /MapSalesIntakeEndpoints\(\)/);
  assert.match(program, /MapSiteVisitEndpoints\(\)/);
  assert.match(program, /MapSiteVisitMasterEndpoints\(\)/);

  // Audit and status history are written from one place, so a new endpoint
  // cannot quietly skip them.
  assert.match(core, /public static async Task AuditAsync/);
  assert.match(core, /public static async Task RecordStatusAsync/);
  assert.match(core, /public static async Task NotifyAsync/);
  // De-duplication is enforced by the index and guarded by the insert.
  assert.match(core, /dedupe_key/);
  assert.match(core, /IF NOT EXISTS/);

  for (const source of [intake, visit]) {
    assert.match(source, /SiteVisitCore\.AuditAsync/);
    assert.match(source, /SiteVisitCore\.RecordStatusAsync/);
    assert.match(source, /SiteVisitCore\.NotifyAsync/);
  }
});

test("the status vocabulary is identical in the rules module, the API and the schema", async () => {
  const [rulesSource, core, migration] = await Promise.all([
    read("lib/site-visit-rules.ts"),
    read("backend/IoTTeamCenter.Api/Endpoints/SiteVisitCore.cs"),
    read("database/migrations/016_sales_intake_site_visit.sql"),
  ]);
  const compiled = ts.transpileModule(rulesSource, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    fileName: "site-visit-rules.ts",
  }).outputText;
  const rules = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

  // The CHECK constraint is the authority; the other two must agree with it.
  const intakeCheck = migration.slice(migration.indexOf("CK_sales_intakes_status"), migration.indexOf("CK_sales_intakes_priority"));
  for (const status of rules.INTAKE_STATUSES) {
    assert.ok(intakeCheck.includes(`N'${status}'`), `dbo.sales_intakes does not allow '${status}'`);
    assert.ok(core.includes(`"${status}"`), `SiteVisitCore does not know '${status}'`);
  }
  const visitCheck = migration.slice(migration.indexOf("CK_site_visits_status"), migration.indexOf("CK_site_visits_schedule_range"));
  for (const status of rules.VISIT_STATUSES) {
    assert.ok(visitCheck.includes(`N'${status}'`), `dbo.site_visits does not allow '${status}'`);
    assert.ok(core.includes(`"${status}"`), `SiteVisitCore does not know '${status}'`);
  }
  const reportCheck = migration.slice(migration.indexOf("CK_site_visit_reports_status"), migration.indexOf("CK_site_visit_reports_revision"));
  for (const status of rules.REPORT_STATUSES) {
    assert.ok(reportCheck.includes(`N'${status}'`), `dbo.site_visit_reports does not allow '${status}'`);
  }

  // Every transition edge in TypeScript exists in C# too. The action text is
  // the cheapest thing to compare that would change if an edge were edited.
  for (const [map, name] of [[rules.INTAKE_TRANSITIONS, "intake"], [rules.VISIT_TRANSITIONS, "visit"]]) {
    for (const [from, edges] of Object.entries(map)) {
      for (const edge of edges) {
        assert.ok(core.includes(`new("${edge.to}", ${csharpPermission(edge.permission)}, ${edge.requiresReason ? "true" : "false"}, "${edge.action}")`),
          `${name}: ${from} -> ${edge.to} is missing or different in SiteVisitCore.cs`);
      }
    }
  }
});

/** Maps a permission code to the SiteVisitCore constant that holds it. */
function csharpPermission(code) {
  return {
    "intake.read": "PermIntakeRead",
    "intake.write": "PermIntakeWrite",
    "intake.review": "PermIntakeReview",
    "visit.read": "PermVisitRead",
    "visit.schedule": "PermVisitSchedule",
    "visit.override": "PermVisitOverride",
    "visit.execute": "PermVisitExecute",
    "visit.report": "PermVisitReport",
    "visit.report_approve": "PermVisitReportApprove",
    "visit.link": "PermVisitLink",
    "visit.admin": "PermVisitAdmin",
  }[code];
}

test("the readiness rules are identical in the rules module and the API", async () => {
  const [rulesSource, core] = await Promise.all([
    read("lib/site-visit-rules.ts"),
    read("backend/IoTTeamCenter.Api/Endpoints/SiteVisitCore.cs"),
  ]);
  const compiled = ts.transpileModule(rulesSource, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    fileName: "site-visit-rules.ts",
  }).outputText;
  const rules = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

  for (const check of rules.READINESS_CHECKS) {
    assert.ok(core.includes(`new("${check.key}", "${check.label}", ${check.weight}, "${check.severity}"`),
      `readiness check '${check.key}' differs between lib/site-visit-rules.ts and SiteVisitCore.cs`);
  }
  assert.equal(rules.READINESS_CHECKS.reduce((sum, check) => sum + check.weight, 0), 100);
});

test("the site visit screens are API-backed and permission-filtered", async () => {
  const [screen, client, shell, demo] = await Promise.all([
    read("app/system/production/SiteVisitScreens.tsx"),
    read("app/system/api-client.ts"),
    read("app/system/ProductionApp.tsx"),
    read("app/system/screens/SiteVisit.tsx"),
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
  assert.match(shell, /view: "visit-master", label: "Visit Master Data", icon: "layers", permission: "visit\.read"/);

  // The demo screen exists so nav parity holds, and stays a demo.
  assert.match(demo, /Demo only/);
});

test("every CSS class the module renders is actually defined", async () => {
  // Lint, type-check and the tests cannot see a class name that does not
  // exist — it is only a string. This module shipped eighteen undefined
  // classes once before, so the check is here rather than in a comment.
  const [production, demo, css] = await Promise.all([
    read("app/system/production/SiteVisitScreens.tsx"),
    read("app/system/screens/SiteVisit.tsx"),
    Promise.all([read("app/globals.css"), read("app/system/production/site-visit-workspace.css")]).then((styles) => styles.join("\n")),
  ]);
  const missing = new Set();
  for (const source of [production, demo]) {
    for (const match of source.matchAll(/className="([a-z0-9 _-]+)"/g)) {
      for (const name of match[1].split(/\s+/).filter(Boolean)) {
        if (!new RegExp(`\\.${name}\\b`).test(css)) missing.add(name);
      }
    }
  }
  assert.deepEqual([...missing], [], "these CSS classes are rendered but never defined");
});

test("the site visit module is part of deployment and of the production baseline", async () => {
  const [deployment, grants, verifier, health, seed] = await Promise.all([
    read("database/scripts/020_deploy_fresh_database.sql"),
    read("database/scripts/010_application_login.sql"),
    read("database/scripts/080_verify_production_baseline.sql"),
    read("backend/IoTTeamCenter.Api/Endpoints/HealthEndpoints.cs"),
    read("database/scripts/920_site_visit_master_seed.sql"),
  ]);
  assert.match(deployment, /016_sales_intake_site_visit\.sql/);
  assert.match(deployment, /14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41\)\) <> 41/);
  assert.match(health, /RequiredSchemaVersion = 28/);

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
