import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { isApplicationTeam, mayCreateFromEstimate, mayCreateProject, mayCreateWithoutEstimate } from "../backend-node/src/project-create-access.ts";
import { canViewProjectCost } from "../backend-node/src/project-cost-model.ts";
import { approverByRole } from "../backend-node/src/issue-batches.ts";
import { PERFORMANCE_ROLES } from "../backend-node/src/performance-framework.ts";
import { approvesEstimates, approvesPurchases } from "../app/system/approvers.ts";
import { guidesFor } from "../app/system/production/guide-catalog.ts";

const root = new URL("../", import.meta.url);
const source = async (path) => (await readFile(new URL(path, root), "utf8")).replace(/\r\n/g, "\n");

/*
 * Role audit, 2026-11-25. The owner chose three fixes:
 * 1. checks read every held role, and named approvers (who decide without the approve permission) see what they decide;
 * 2. the Leader role the code and eight migrations already name is created (migration 135);
 * 3. the Application team creates a project without an estimate without project.write.
 */

test("migration 135 creates the Leader role with an Engineer's permissions and what earlier migrations meant for it", async () => {
  const [migration, rollback, validation, deploy] = await Promise.all([
    source("database/migrations/135_leader_role.sql"),
    source("database/rollback/135_leader_role.rollback.sql"),
    source("backend-node/src/migration-validation.ts"),
    source("database/scripts/020_deploy_fresh_database.sql"),
  ]);
  assert.match(migration, /IF NOT EXISTS \(SELECT 1 FROM dbo\.schema_versions WHERE version = 134\)/);
  assert.match(migration, /INSERT dbo\.roles\(code, name, description\)\s*VALUES \(N'Leader', N'Leader',/);
  // Everything the Engineer role holds, read from the database rather than copied.
  assert.match(migration, /WHERE engineer\.code = N'Engineer' AND held\.permission_id = p\.id/);
  for (const code of [
    "crm.read",
    "crm.write",
    "crm.activity.write",
    "crm.contact.write",
    "crm.read.team",
    "crm.convert",
    "monitor.read",
    "monitor.control",
    "monitor.manage",
    "monitor.deploy",
    "monitor.approve",
    "monitor.script",
    "asset.read",
    "asset.manage",
    "credential.read",
    "credential.reveal",
    "credential.manage",
    "repository.write",
    "inquiry.write",
  ])
    assert.match(migration, new RegExp(`N'${code.replace(/\./g, "\\.")}'`), code);
  // Re-running adds nothing twice.
  assert.match(migration, /AND NOT EXISTS \(SELECT 1 FROM dbo\.role_permissions rp WHERE rp\.role_id = leader\.id AND rp\.permission_id = p\.id\)/);
  assert.match(migration, /VALUES \(135, N'Leader role'\)/);
  assert.match(validation, /\{ version: 135, fileName: "135_leader_role\.sql", name: "Leader role" \}/);
  assert.match(deploy, /:r database\/migrations\/134_estimate_historical_import\.sql\n:r database\/migrations\/135_leader_role\.sql/);
  // The undo never takes a role away from someone who has it as their primary role.
  assert.match(rollback, /THROW 51936, 'Someone still has Leader as their primary role; change it first\.'/);
  assert.match(rollback, /UPDATE dbo\.roles SET is_active = 0 WHERE code = N'Leader';/);
});

test("a Leader counts as an engineer wherever one is chosen, and as a lead where the code already said so", async () => {
  assert.ok(PERFORMANCE_ROLES.includes("Leader"));
  assert.equal(canViewProjectCost(["Leader"]), true);
  assert.equal(canViewProjectCost(["Engineer"]), false);
  assert.equal(approverByRole({ role: "Engineer", roles: ["Engineer", "Leader"] }), true, "an additional Leader role counts");
  const files = {
    estimateOwner: [
      "backend-node/src/routes/estimate-cost-write.ts",
      "backend-node/src/routes/estimate-excel-import.ts",
      "backend-node/src/routes/estimate-historical-import.ts",
      "backend-node/src/routes/estimate-workspace-write.ts",
      "backend-node/src/routes/estimates.ts",
      "backend-node/src/routes/inquiries.ts",
    ],
    visitEngineer: ["backend-node/src/routes/site-visits-read.ts", "backend-node/src/routes/site-visits-workflow.ts"],
  };
  for (const path of files.estimateOwner) assert.match(await source(path), /IN ?\(N'Engineer',N'Leader',N'Engineering Manager',N'Admin'\)/, path);
  for (const path of files.visitEngineer) assert.match(await source(path), /IN\(N'Engineer',N'Leader',N'Engineering Manager',N'Engineering Coordinator',N'Project Manager',N'Admin'\)/, path);
  const projects = await source("backend-node/src/routes/projects.ts");
  assert.match(projects, /MAX\(CASE WHEN r\.code IN\(N'Engineer',N'Leader',N'Engineering Manager',N'Admin'\) THEN 1 ELSE 0 END\) canLead/);
  assert.match(projects, /code IN\(N'Engineer',N'Leader',N'Engineering Manager',N'Admin'\)\) AS lead_role;/);
  assert.match(projects, /!\["Engineer", "Leader", "Engineering Manager", "Admin"\]\.includes\(roles\.lead_role \?\? ""\)/);
  const performance = await source("backend-node/src/routes/performance.ts");
  assert.equal(performance.match(/role\.code IN\(N'Engineer',N'Leader',N'Project Manager',N'Engineering Manager'/g)?.length, 4);
  for (const [path, pattern] of [
    ["app/system/production/EstimateScreens.tsx", /const canOwnEstimate = \(role: string\) => \["Engineer", "Leader", "Engineering Manager", "Admin"\]/],
    ["app/system/production/EstimateLaborSheet.tsx", /const canOwnEstimate = \(role: string\) => \["Engineer", "Leader", "Engineering Manager", "Admin"\]/],
    ["app/system/production/InquiryScreens.tsx", /const OWNER_ROLES = \["Engineer", "Leader", "Engineering Manager", "Admin"\];/],
    ["app/system/production/CoreScreens.tsx", /eligible\(\["Engineer", "Leader", "Engineering Manager", "Admin"\], project\.leadEngineerId\)/],
  ])
    assert.match(await source(path), pattern, path);
});

test("the Application team creates a project without an estimate, project.write or not", () => {
  assert.equal(isApplicationTeam("Application Engineer Dept."), true);
  assert.equal(isApplicationTeam("Application Engineer Dept. 2G"), true);
  assert.equal(isApplicationTeam("IoT Engineer Dept."), false);
  assert.equal(isApplicationTeam(null), false);
  assert.equal(mayCreateWithoutEstimate(["Engineer"], "Application Engineer Dept. 1G"), true);
  assert.equal(mayCreateWithoutEstimate(["Viewer"], "Application Engineer Dept."), false, "a Viewer stays read-only");
  assert.equal(mayCreateWithoutEstimate(["Engineer"], "IoT Engineer Dept."), false);
  assert.equal(mayCreateWithoutEstimate(["Engineer", "Project Manager"], ""), true, "an additional role counts");
  assert.equal(mayCreateFromEstimate(["project.write"]), true);
  assert.equal(mayCreateFromEstimate(["project.read"]), false);
  assert.equal(mayCreateProject(["project.read"], ["Engineer"], "Application Engineer Dept."), true);
  assert.equal(mayCreateProject(["project.read"], ["Engineer"], "Mechanical Engineer Dept."), false);
});

test("the create route and form follow that rule, and a creator who sees only their own projects joins the new one", async () => {
  const [projects, scope, core, shell] = await Promise.all([
    source("backend-node/src/routes/projects.ts"),
    source("backend-node/src/project-scope.ts"),
    source("app/system/production/CoreScreens.tsx"),
    source("app/system/ProductionApp.tsx"),
  ]);
  assert.match(scope, /return mayCreateWithoutEstimate\(rolesOf\(user\), user\.department\);/);
  const create = projects.slice(projects.indexOf('app.post("/api/v1/projects", async'), projects.indexOf('app.post("/api/v1/projects", async') + 600);
  assert.match(create, /if \(!\(body\.withoutEstimate === true && canCreateWithoutEstimate\(actor\)\)\) await users\.demandPermission\(request, "project\.write"\);/);
  assert.doesNotMatch(create.slice(0, create.indexOf("const body")), /demandPermission/, "no project.write before the body is read");
  const options = projects.slice(projects.indexOf('app.get("/api/v1/projects/creation-options"'), projects.indexOf("canCreateFromEstimate: writesProjects"));
  assert.match(options, /if \(!writesProjects && !canCreateWithoutEstimate\(actor\)\) await users\.demandPermission\(request, "project\.write"\);/);
  assert.match(options, /const readsEstimates = writesProjects && \(await permissionFor\(database, actor\.id, "estimate\.read"\)\);/);
  assert.match(projects, /members\.input\("creator_joins", sql\.Bit, !isProjectElevated\(actor\)\);/);
  assert.match(
    projects,
    /IF @creator_joins=1 AND @actor NOT IN \(@manager_id,@lead_id\) INSERT INTO dbo\.project_members\(project_id,user_id,role_on_project,created_by\) VALUES \(@project_id,@actor,N'Member',@actor\);/,
  );
  // The button and the create page read the same rule as the API.
  assert.match(core, /const canCreate = mayCreateProject\(bootstrap\.permissions, bootstrap\.user\.roles \?\? \[bootstrap\.user\.role\], bootstrap\.user\.department\);/);
  // The list's Create button is the @tomas-tc/ui one (tomas-ui/ProjectList.tsx), shown on the same rule.
  assert.match(core, /create=\{canCreate \? \{ label: uiText\("Create project"\), onSelect:/);
  assert.match(shell, /const canCreateProject = mayCreateProject\(bootstrap\.permissions, heldRoles, bootstrap\.user\.department\);/);
  // Without project.write the form starts without an estimate; without schedule.plan it asks for dates only.
  assert.match(core, /if \(data\.canCreateFromEstimate === false\) setWithoutEstimate\(true\);/);
  assert.match(core, /const canPlan = bootstrap\.permissions\.includes\("schedule\.plan"\);/);
  assert.match(core, /\{canPlan \? \(\s*<>[\s\S]*?<MasterPlanSection[\s\S]*?\) : \(\s*<p className="muted pcp-note">\{t\("ProjectCreate\.planLater"\)\}<\/p>\s*\)\}/);
});

test("named approvers see the Approvals menu, its count, the dashboard queue and the guides", async () => {
  const named = { permissions: ["procurement.read", "estimate.read"], approverOf: { purchases: true, estimates: true } };
  const neither = { permissions: ["procurement.read", "estimate.read"], approverOf: { purchases: false, estimates: false } };
  assert.equal(approvesPurchases(named), true);
  assert.equal(approvesEstimates(named), true);
  assert.equal(approvesPurchases(neither), false);
  assert.equal(approvesPurchases({ permissions: ["procurement.approve"] }), true, "an older API build without approverOf");
  assert.equal(approvesEstimates({ permissions: ["estimate.approve"] }), true);

  const ids = (permissions, duties) => guidesFor(permissions, duties).map((guide) => guide.id);
  assert.ok(!ids(["procurement.read"]).includes("pr-approve"));
  assert.ok(ids(["procurement.read"], ["purchase-approver"]).includes("pr-approve"));
  assert.ok(ids(["estimate.read"], ["estimate-approver"]).includes("estimate-approve"));
  assert.ok(!ids(["project.read"]).includes("project-create"));
  assert.ok(ids(["project.read"], ["project-without-estimate"]).includes("project-create"));

  const [bootstrap, shell, core, material, executive] = await Promise.all([
    source("backend-node/src/routes/bootstrap.ts"),
    source("app/system/ProductionApp.tsx"),
    source("app/system/production/CoreScreens.tsx"),
    source("app/system/production/MaterialScreens.tsx"),
    source("app/system/production/ExecutiveDashboard.tsx"),
  ]);
  for (const table of ["pr_approval_settings WHERE final_approver_id", "pr_department_approvers WHERE approver_id", "pr_discipline_approvers WHERE approver_id"])
    assert.ok(bootstrap.includes(`FROM dbo.${table} = @user_id`), table);
  assert.match(bootstrap, /FROM dbo\.mat_pr_approval_steps WHERE approver_id = @user_id AND status = N'Current'/);
  assert.match(bootstrap, /OR EXISTS \(SELECT 1 FROM dbo\.estimate_approvers WHERE user_id = @user_id\)\s*THEN \(SELECT COUNT_BIG\(\*\) FROM dbo\.estimates/);
  assert.match(bootstrap, /approverOf: \{ purchases: Boolean\(count\?\.approves_purchases\), estimates: Boolean\(count\?\.approves_estimates\) \},/);
  assert.match(shell, /\(!item\.permission \|\| permissions\.includes\(item\.permission\) \|\| \(item\.orPurchaseApprover === true && approvesPurchases\(access\)\)\)/);
  assert.match(shell, /if \(!bootstrap \|\| !\(approvesPurchases\(bootstrap\) \|\| bootstrap\.permissions\.includes\("inventory\.adjust"\)\)\) return;/);
  assert.match(shell, /duties=\{guideDuties\}/);
  assert.match(core, /const canApproveEstimates = approvesEstimates\(bootstrap\);/);
  assert.match(core, /const canApproveProcurement = approvesPurchases\(bootstrap\);/);
  assert.match(material, /useEndpoint<PurchaseRequisition\[\]>\(approvesPurchases\(bootstrap\) \? "\/api\/v1\/purchase-requisitions\/\?waitingForMe=true" : null, EMPTY\)/);
  assert.match(executive, /\.\.\.\(approvesEstimates\(bootstrap\)\s*\?\s*estimates\s*\.filter\(\(e\) => e\.status === "Engineering Review"\)/);
  // A listed estimate approver may also send an approved estimate to the ERP again.
  assert.match(
    await source("backend-node/src/routes/estimate-erp.ts"),
    /!owner\.approver && !hasRole\(actor, "Engineering Manager", "Admin"\)\) await users\.demandPermission\(request, "estimate\.approve"\)/,
  );
});

test("signing, the rates menu and the historical PR import read every held role", async () => {
  const [signing, shell, historical, executive, material] = await Promise.all([
    source("backend-node/src/routes/signing.ts"),
    source("app/system/ProductionApp.tsx"),
    source("backend-node/src/routes/historical-pr.ts"),
    source("app/system/production/ExecutiveDashboard.tsx"),
    source("app/system/production/MaterialScreens.tsx"),
  ]);
  // The Sign Inbox and the step decision, as the stamp apply path (signing-core.ts) and the executive dashboard already did.
  assert.match(signing, /s\.assignee_role_id IN \(SELECT role_id FROM dbo\.user_effective_roles WHERE user_id = @actor\)/);
  assert.equal(signing.match(/ar\.code IN \(SELECT code FROM dbo\.user_effective_roles WHERE user_id = @actor\)/g)?.length, 2);
  assert.doesNotMatch(signing, /@role\b/);
  assert.doesNotMatch(signing, /assigneeRoleCode === actor\.role/);
  assert.match(signing, /rolesOf\(actor\)\.includes\(step\.assigneeRoleCode\)/);
  assert.match(shell, /\(!item\.rateAccess \|\| roles\.some\(canViewEngineeringRates\)\)/);
  assert.doesNotMatch(shell, /canViewEngineeringRates\(role\)/);
  assert.match(historical, /else if \(!hasRole\(actor, "Admin", "Purchasing", "Engineering Manager"\)\) throw/);
  assert.doesNotMatch(executive, /bootstrap\.user\.role!==/);
  assert.doesNotMatch(material, /bootstrap\.user\.role === "Admin"/);
});
