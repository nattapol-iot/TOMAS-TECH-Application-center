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
    // The screens pick owners from one list, read on every held role (see the follow-up test below).
    ["app/system/production/EstimateScreens.tsx", /const canOwnEstimate = \(person: RoleBearer\) => hasRole\(person, \.\.\.ESTIMATE_OWNER_ROLES\);/],
    ["app/system/production/EstimateLaborSheet.tsx", /const canOwnEstimate = \(person: RoleBearer\) => hasRole\(person, \.\.\.ESTIMATE_OWNER_ROLES\);/],
    ["app/system/production/InquiryScreens.tsx", /bootstrap\.team\.filter\(\(member\) => hasRole\(member, \.\.\.ESTIMATE_OWNER_ROLES\)\)/],
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

/*
 * Follow-up the same day (owner: "แก้ข้อ 3 ต่อเลย"): the lists that pick people by role, and the screens' role checks, read
 * every held role too, as the API's own checks do. The primary role stays what is displayed and what an audit row stamps.
 */
test("who may be picked by role reads every held role: estimate owner, site visit engineer, KPI roster", async () => {
  const { ESTIMATE_OWNER_ROLES, hasRole, rolesOf } = await import("../backend-node/src/user-roles.ts");
  const { kpiRoleSql } = await import("../backend-node/src/performance-framework.ts");
  assert.deepEqual([...ESTIMATE_OWNER_ROLES], ["Engineer", "Leader", "Engineering Manager", "Admin"]);
  assert.equal(hasRole({ role: "Viewer", roles: ["Viewer", "Engineer"] }, ...ESTIMATE_OWNER_ROLES), true, "an additional role counts");
  assert.equal(hasRole({ role: "Engineer" }, ...ESTIMATE_OWNER_ROLES), true, "a member without a roles list reads its primary role");
  assert.equal(hasRole({ role: "Viewer", roles: ["Viewer"] }, ...ESTIMATE_OWNER_ROLES), false);
  assert.deepEqual(rolesOf({ role: "Admin", roles: ["Admin", "Management"] }), ["Admin", "Management"]);

  for (const path of [
    "backend-node/src/routes/estimate-cost-write.ts",
    "backend-node/src/routes/estimate-workspace-write.ts",
    "backend-node/src/routes/estimates.ts",
    "backend-node/src/routes/estimate-excel-import.ts",
    "backend-node/src/routes/estimate-historical-import.ts",
  ]) {
    const text = await source(path);
    assert.match(text, /dbo\.users u INNER JOIN dbo\.user_effective_roles r ON r\.user_id=u\.id\s+WHERE u\.id=@owner(_id)? AND u\.is_active=1/, path);
    assert.doesNotMatch(text, /JOIN dbo\.roles r ON r\.id=u\.role_id\s+WHERE u\.id=@owner/, path);
  }
  assert.match(
    await source("backend-node/src/routes/inquiries.ts"),
    /SELECT u\.name,u\.email FROM dbo\.users u\s+WHERE u\.id=@owner_id AND u\.is_active=1 AND u\.deleted_at IS NULL\s+AND EXISTS \(SELECT 1 FROM dbo\.user_effective_roles r WHERE r\.user_id=u\.id AND r\.code IN \(N'Engineer',N'Leader',N'Engineering Manager',N'Admin'\)\);/,
  );
  const visitRoles = "er\\.code IN\\(N'Engineer',N'Leader',N'Engineering Manager',N'Engineering Coordinator',N'Project Manager',N'Admin'\\)";
  const [visitRead, visitWorkflow] = await Promise.all([source("backend-node/src/routes/site-visits-read.ts"), source("backend-node/src/routes/site-visits-workflow.ts")]);
  // The candidate list still shows each person's primary role; who qualifies reads every held role.
  assert.match(
    visitRead,
    new RegExp(
      "r\\.code role[\\s\\S]*FROM dbo\\.users u INNER JOIN dbo\\.roles r ON r\\.id=u\\.role_id WHERE u\\.is_active=1 AND u\\.deleted_at IS NULL AND EXISTS\\(SELECT 1 FROM dbo\\.user_effective_roles er WHERE er\\.user_id=u\\.id AND " +
        visitRoles +
        "\\) ORDER BY u\\.name;",
    ),
  );
  assert.match(
    visitWorkflow,
    new RegExp(
      "SELECT u\\.name FROM dbo\\.users u WHERE u\\.id=@id AND u\\.is_active=1 AND u\\.deleted_at IS NULL AND EXISTS\\(SELECT 1 FROM dbo\\.user_effective_roles er WHERE er\\.user_id=u\\.id AND " +
        visitRoles +
        "\\);",
    ),
  );

  // KPI: the role a person is reviewed under, primary first, then an additional role with a KPI framework.
  const performance = await source("backend-node/src/routes/performance.ts");
  assert.doesNotMatch(performance, /INNER JOIN dbo\.roles role ON role\.id=app_user\.role_id/);
  assert.equal(performance.match(/\$\{kpiRoleSql\("app_user"\)\}/g)?.length, 4);
  const kpiRole = kpiRoleSql("app_user");
  assert.match(kpiRole, /^CROSS APPLY \(SELECT COALESCE\(/);
  assert.match(
    kpiRole,
    /FROM dbo\.user_effective_roles held WHERE held\.user_id=app_user\.id AND held\.code IN\(N'Engineer',N'Leader',N'Project Manager',N'Engineering Manager',N'Sales Engineer',N'Sales Manager'\)/,
  );
  assert.match(kpiRole, /ORDER BY CASE WHEN held\.role_id=app_user\.role_id THEN 0 ELSE 1 END,held\.code\)/);
  assert.match(kpiRole, /\(SELECT primary_role\.code FROM dbo\.roles primary_role WHERE primary_role\.id=app_user\.role_id\)\) code\) role$/);
});

test("notices and checks that looked people up by their primary role read every held role", async () => {
  const [common, stamps, reports, dashboard] = await Promise.all([
    source("backend-node/src/site-visit-common.ts"),
    source("backend-node/src/routes/signature-master.ts"),
    source("backend-node/src/unified-report-service.ts"),
    source("backend-node/src/routes/executive-dashboard.ts"),
  ]);
  // Site visit notices go to everyone holding the permission through any role.
  assert.match(common, /SELECT user_id id FROM dbo\.user_effective_permissions WHERE code=@permission;/);
  // A new stamp grant is told to everyone holding the custodian role.
  assert.match(stamps, /INNER JOIN dbo\.user_effective_roles custodian ON custodian\.role_id = s\.custodian_role_id\s+INNER JOIN dbo\.users u ON u\.id = custodian\.user_id/);
  assert.doesNotMatch(stamps, /u\.role_id = s\.custodian_role_id/);
  // A report reviewer's or approver's source scope is checked with every role they hold.
  assert.match(reports, /roles: user\.roles \? user\.roles\.split\("\|"\) : \[user\.role\]/);
  assert.match(reports, /\(SELECT STRING_AGG\(er\.code,N'\|'\) FROM dbo\.user_effective_roles er WHERE er\.user_id=u\.id\) roles/);
  // The dashboard's Project Manager filter lists anyone holding the role.
  assert.match(dashboard, /WHERE EXISTS\(SELECT 1 FROM dbo\.user_effective_roles pm WHERE pm\.user_id=u\.id AND pm\.code=N'Project Manager'\) AND u\.is_active=1/);
});

test("screens decide on every held role, as the API does", async () => {
  const [estimates, labor, inquiries, visits, overhead, kpi, signing, shell] = await Promise.all([
    source("app/system/production/EstimateScreens.tsx"),
    source("app/system/production/EstimateLaborSheet.tsx"),
    source("app/system/production/InquiryScreens.tsx"),
    source("app/system/production/SiteVisitScreens.tsx"),
    source("app/system/production/EstimateOverheadPanel.tsx"),
    source("app/system/production/PerformanceScreen.tsx"),
    source("app/system/production/SigningScreens.tsx"),
    source("app/system/ProductionApp.tsx"),
  ]);
  for (const [name, text] of [
    ["EstimateScreens", estimates],
    ["EstimateLaborSheet", labor],
  ]) {
    assert.doesNotMatch(text, /canOwnEstimate\((member|bootstrap\.user)\.role\)/, name);
    assert.match(text, /canOwnEstimate\(member\)/, name);
  }
  assert.match(estimates, /const canAssignEstimateOwner = \(person: RoleBearer\) => hasRole\(person, "Engineering Manager", "Admin"\);/);
  assert.doesNotMatch(estimates, /canAssignEstimateOwner\(bootstrap\.user\.role\)/);
  assert.doesNotMatch(inquiries, /OWNER_ROLES\.includes|\.includes\(bootstrap\.user\.role\)/);
  assert.match(inquiries, /const canManageQueue = hasRole\(bootstrap\.user, "Admin", "Engineering Manager", "Project Manager", "Sales Manager"\);/);
  assert.match(inquiries, /defaultInquiryQueueScope\(rolesOf\(bootstrap\.user\)\)/);
  // An inquiry created from a site visit picks its owner like any inquiry owner, a Leader included.
  assert.match(visits, /const engineers = bootstrap\.team\.filter\(\(member\) => hasRole\(member, \.\.\.ESTIMATE_OWNER_ROLES\)\);/);
  assert.match(overhead, /hasRole\(bootstrap\.user, "Admin", "Engineering Manager"\)/);
  assert.match(kpi, /const roleCanManage = hasRole\(currentUser, "Admin", "Engineering Manager", "Project Manager", "Sales Manager", "Leader"\);/);
  // The document screen finds the step waiting for the person by any role they hold, as the Sign Inbox does.
  assert.match(signing, /step\.assigneeUserId === null && step\.assigneeRole !== null && rolesOf\(bootstrap\.user\)\.includes\(step\.assigneeRole\)/);
  assert.doesNotMatch(signing, /step\.assigneeRole === bootstrap\.user\.role/);
  assert.match(signing, /bootstrap\.team\.flatMap\(\(member\) => rolesOf\(member\)\)/);
  assert.match(shell, /heldRoles\.some\(\(role\) => DASHBOARD_ROLES\.includes\(role\)\) \? \(/);
  assert.doesNotMatch(shell, /DASHBOARD_ROLES\.includes\(bootstrap\.user\.role\)/);
});

/*
 * Owner 2026-11-25: "ให้ Sales Manager ใช้ CRM ได้ด้วย". Migration 053 granted the CRM to role codes that never existed
 * ("Sales", "Manager"), so the Sales Manager had no CRM menu and no My Work.
 */
test("the Sales Manager uses the CRM: a Sales Engineer's permissions plus the team's deals (migration 136)", async () => {
  const [migration, rollback, validation, deploy] = await Promise.all([
    source("database/migrations/136_sales_manager_crm.sql"),
    source("database/rollback/136_sales_manager_crm.rollback.sql"),
    source("backend-node/src/migration-validation.ts"),
    source("database/scripts/020_deploy_fresh_database.sql"),
  ]);
  const granted = ["crm.read", "crm.write", "crm.activity.write", "crm.contact.write", "crm.commercial.read", "crm.convert", "crm.read.team"];
  assert.match(migration, /IF NOT EXISTS \(SELECT 1 FROM dbo\.schema_versions WHERE version = 135\)/);
  assert.match(migration, /WHERE r\.code = N'Sales Manager'/);
  assert.match(migration, new RegExp(`AND p\\.code IN \\(${granted.map((code) => `N'${code.replace(/\./g, "\\.")}'`).join(", ")}\\)`));
  // Company-wide reading stays with Management and Admin, the CRM settings with Admin.
  assert.doesNotMatch(migration, /N'crm\.read\.all'|N'crm\.configure'/);
  assert.match(migration, /AND NOT EXISTS \(SELECT 1 FROM dbo\.role_permissions rp WHERE rp\.role_id = r\.id AND rp\.permission_id = p\.id\)/);
  assert.match(migration, /VALUES \(136, N'Sales Manager CRM'\)/);
  assert.match(validation, /\{ version: 136, fileName: "136_sales_manager_crm\.sql", name: "Sales Manager CRM" \}/);
  assert.match(deploy, /:r database\/migrations\/135_leader_role\.sql\n:r database\/migrations\/136_sales_manager_crm\.sql/);
  assert.match(rollback, /WHERE r\.code = N'Sales Manager'\s+AND p\.code IN \(N'crm\.read', N'crm\.write'/);

  // With those permissions the CRM guides are offered to a Sales Manager too.
  const offered = guidesFor(granted).map((guide) => guide.id);
  for (const id of ["crm-deal-create", "crm-activity-followup", "crm-send-estimate"]) assert.ok(offered.includes(id), id);
});

/*
 * Owner 2026-11-25: "ลบ role CEO ออกจากโค้ด". No migration creates a CEO role, so the checks that named it matched nobody.
 * The CEO summary screen and a project's CEO notes are features, not a role, and stay.
 */
test("no role check names a CEO role", async () => {
  const { DASHBOARD_ROLES } = await import("../backend-node/src/executive-dashboard-model.ts");
  assert.deepEqual(DASHBOARD_ROLES, ["Admin", "Management", "Engineering Manager", "Project Manager", "Sales Manager"]);
  assert.equal(canViewProjectCost(["Management"]), true);
  for (const path of ["backend-node/src/executive-dashboard-model.ts", "backend-node/src/project-cost-model.ts", "backend-node/src/routes/executive-dashboard.ts"])
    assert.doesNotMatch(await source(path), /["'`]CEO["'`]|N'CEO'/, path);
  assert.match(await source("backend-node/src/routes/executive-dashboard.ts"), /const executive = hasRole\(actor, "Management", "Admin"\);/);
});

/*
 * Owner 2026-11-26: a Leader plans every project of their own team, assesses the KPI of the team's Engineers and reviews
 * reports; the Application groups are one team in KPI and Team Activity; the Leader role is set on the web.
 */
test("a Leader leads their team: plans its projects, assesses its Engineers, reviews its reports (migration 137)", async () => {
  const [migration, rollback, validation, deploy] = await Promise.all([
    source("database/migrations/137_leader_team_work.sql"),
    source("database/rollback/137_leader_team_work.rollback.sql"),
    source("backend-node/src/migration-validation.ts"),
    source("database/scripts/020_deploy_fresh_database.sql"),
  ]);
  assert.match(migration, /IF NOT EXISTS \(SELECT 1 FROM dbo\.schema_versions WHERE version = 136\)/);
  assert.match(migration, /WHERE r\.code = N'Leader'\s+AND p\.code IN \(N'schedule\.plan', N'performance\.manage', N'report\.review'\)/);
  assert.match(migration, /UPDATE dbo\.roles\s+SET description = N'Leads a team''s work:/);
  assert.match(migration, /VALUES \(137, N'Leader team work'\)/);
  assert.match(validation, /\{ version: 137, fileName: "137_leader_team_work\.sql", name: "Leader team work" \}/);
  assert.match(deploy, /:r database\/migrations\/136_sales_manager_crm\.sql\n:r database\/migrations\/137_leader_team_work\.sql/);
  assert.match(rollback, /p\.code IN \(N'schedule\.plan', N'performance\.manage', N'report\.review'\)/);

  // The team rule, the same as the Projects screen's (lib/project-portfolio.ts).
  const scope = await import("../backend-node/src/leader-scope.ts");
  const { projectTeamOf } = await import("../lib/project-portfolio.ts");
  for (const text of [
    "Application Engineer Dept.",
    "Application Engineer Dept. 2G",
    "application 1G",
    "IoT Engineer Dept.",
    "IoT Team",
    "Electrical Engineer Dept.",
    "Mechanical Engineer Dept.",
    "Patriot",
    "System Architect & System Engineer Dept.",
    "",
    null,
  ])
    assert.equal(scope.projectTeamOf(text), projectTeamOf(text), String(text));
  const leader = { role: "Engineer", roles: ["Engineer", "Leader"], department: "Application Engineer Dept. 1G" };
  assert.equal(scope.leaderTeamOf(leader), "Application Team");
  assert.equal(scope.leaderTeamOf({ role: "Engineer", roles: ["Engineer"], department: "Application Engineer Dept." }), "", "not a Leader");
  assert.equal(scope.leaderPlansProject(leader, { team: "Application Team" }), true);
  assert.equal(scope.leaderPlansProject(leader, { team: null, leadDepartment: "Application Engineer Dept. 2G" }), true, "1G and 2G are one team; no team falls back to the lead's department");
  assert.equal(scope.leaderPlansProject(leader, { team: "IoT Team", leadDepartment: "Application Engineer Dept." }), false, "the project's own team wins");
  assert.equal(scope.leaderPlansProject({ ...leader, department: "" }, { team: "" }), false);
  assert.match(scope.projectTeamSql("p"), /COALESCE\(NULLIF\(LTRIM\(RTRIM\(p\.team\)\),N''\),\(SELECT team_lead\.department FROM dbo\.users team_lead WHERE team_lead\.id=p\.lead_engineer_id\),N''\)/);
  assert.ok(scope.leaderTeamProjectSql("p").startsWith("(@leader_team<>N'' AND "));

  // Plans: the plan owners, and who answers day requests and sets baselines, include a Leader of the project's team.
  const service = await source("backend-node/src/schedule-service.ts");
  assert.match(service, /!leaderPlansProject\(actor, project\) && !hasRole\(actor, "Engineering Manager", "Admin"\)/);
  assert.match(service, /return project\.managerId === actor\.id \|\| leaderPlansProject\(actor, project\) \|\| hasRole\(actor, "Engineering Manager", "Admin"\);/);
  assert.match(service, /\(SELECT team_lead\.department FROM dbo\.users team_lead WHERE team_lead\.id=lead_engineer_id\) lead_department/);
  // Sees the team's projects (project pages, the list, the inquiry's link, day requests, Team planner work, reports)...
  for (const [path, count] of [
    ["backend-node/src/project-scope.ts", 1],
    ["backend-node/src/routes/projects.ts", 3],
    ["backend-node/src/routes/schedule.ts", 1],
    ["backend-node/src/resource-task-service.ts", 2],
    ["backend-node/src/unified-report-service.ts", 1],
  ])
    assert.equal((await source(path)).match(/leaderTeamProjectSql\("p"\)/g)?.length, count, path);
  const projectScope = await source("backend-node/src/project-scope.ts");
  assert.match(projectScope, /request\.input\("leader_team", sql\.NVarChar\(40\), myWork \? "" : leaderTeamOf\(user\)\);/);
  assert.equal((await source("backend-node/src/routes/projects.ts")).match(/sqlRequest\.input\("leader_team", sql\.NVarChar\(40\), leaderTeamOf\(actor\)\);/g)?.length, 5);
  // ...but is not project-elevated: other teams' projects, PRs and site credentials stay closed to a Leader.
  assert.match(projectScope, /const ELEVATED_ROLES = new Set\(\["Admin", "Engineering Manager", "Project Manager", "Purchasing", "Warehouse", "Inventory Controller"\]\);/);

  // KPI: a Leader assesses the Engineers of their own team only.
  const { canManagePerformanceTarget } = await import("../backend-node/src/performance-framework.ts");
  assert.equal(canManagePerformanceTarget("Leader", "Engineer", "Application Engineer Dept.", "Application Engineer Dept."), true);
  assert.equal(canManagePerformanceTarget("Leader", "Leader", "Application Engineer Dept.", "Application Engineer Dept."), false);
  assert.equal(canManagePerformanceTarget("Leader", "Project Manager", "IoT Engineer Dept.", "IoT Engineer Dept."), false);
  assert.equal(canManagePerformanceTarget("Leader", "Engineer", "IoT Engineer Dept.", "Application Engineer Dept."), false);
  // A peer whose Leader role is an additional one on top of Engineer is not a team member to assess.
  assert.equal(canManagePerformanceTarget("Leader", "Engineer", "Application Engineer Dept.", "Application Engineer Dept.", true), false);
  const performance = await source("backend-node/src/routes/performance.ts");
  assert.match(performance, /const MANAGER_ROLES = new Set\(\["Admin", "Engineering Manager", "Project Manager", "Sales Manager", "Leader"\]\);/);
  assert.equal(performance.match(/er\.code =N'Leader'\) AND role\.code=N'Engineer' AND NOT \$\{leadsOthersSql\("app_user"\)\}/g)?.length, 2);
  assert.equal(performance.match(/canManagePerformanceTarget\(role, target\.target_role, target\.actor_team, target\.target_team, Boolean\(target\.target_leads\)\)/g)?.length, 3);
  assert.match(await source("app/system/production/PerformanceScreen.tsx"), /hasRole\(currentUser, "Admin", "Engineering Manager", "Project Manager", "Sales Manager", "Leader"\)/);

  // Reports: reviewer candidates are checked as themselves, every role and their department (a Leader of the team).
  assert.match(await source("backend-node/src/routes/unified-reports.ts"), /roles: row\.roles \? row\.roles\.split\("\|"\) : \[row\.role\], department: row\.department \?\? ""/);
});

test("the Application groups are one team in KPI and Team Activity, and a Leader heads their team there", async () => {
  const { teamOfSql, APPLICATION_TEAM } = await import("../backend-node/src/team-scope.ts");
  assert.equal(APPLICATION_TEAM, "Application Engineer Dept.");
  assert.match(teamOfSql("u.department"), /CASE WHEN u\.department LIKE N'%application%' THEN N'Application Engineer Dept\.' ELSE u\.department END/);
  const service = await source("backend-node/src/activity-service.ts");
  assert.match(service, /hasRole\(actor, "Engineering Manager", "Sales Manager", "Management", "Leader"\)/);
  assert.match(service, /\$\{teamOfSql\("u\.department"\)\}=\$\{teamOfSql\("@department"\)\}/);
  assert.match(
    service,
    /export const fullMember = \(scope: ActivityScope, user: \{ id: number; department: string \}\) => scope\.all \|\| scope\.actorId === user\.id \|\| inTeam\(scope, user\.department\);/,
  );
  const routes = await source("backend-node/src/routes/activity.ts");
  assert.doesNotMatch(routes, /scope\.department === row\.department|member\.department === scope\.department|u\.department=@department/);
  assert.match(routes, /const leads = !head && hasRole\(actor, "Leader"\) && \(await leaderMayReview\(id\)\);/);
  assert.match(routes, /return row\?\.code === "Engineer" && !row\.leads;/);
  assert.match(routes, /canReview: hasRole\(actor, "Admin", "Engineering Manager", "Sales Manager", "Leader"\)/);
});

test("an Admin sets the Leader role on the web, with How-to guides for that and for a head's KPI review", async () => {
  const { GUIDES, NO_GUIDE } = await import("../app/system/production/guide-catalog.ts");
  const role = GUIDES.find((guide) => guide.id === "user-role");
  assert.ok(role);
  assert.deepEqual(role.permissions, ["admin.manage_roles"]);
  assert.deepEqual(
    role.steps.map((step) => step.target),
    ["nav.user-accounts", "role.edit", "role.primary", "role.extra", "role.reason", "role.grant"],
  );
  assert.ok(!("user-accounts" in NO_GUIDE));
  assert.ok(GUIDES.some((guide) => guide.id === "kpi-review"));
  assert.ok(!("performance" in NO_GUIDE));
  assert.ok(guidesFor(["performance.read", "performance.manage"]).some((guide) => guide.id === "kpi-review"));
  // The dialog lists every active role from the database, Leader included (GET /api/v1/admin/roles).
  assert.match(await source("backend-node/src/routes/admin.ts"), /SELECT id,code,name,description\s+FROM dbo\.roles\s+WHERE is_active=1/);
  const core = await source("app/system/production/CoreScreens.tsx");
  for (const mark of ['data-guide="role.edit"', 'guide="role.primary"', 'guide="role.extra"', 'guide="role.reason"', 'data-guide="role.grant"', 'data-guide="role.save"'])
    assert.ok(core.includes(mark), mark);
});
