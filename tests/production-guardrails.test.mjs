import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("production entry is API-backed and has no demo fallback", async () => {
  const [page, productionApp, authClient, layout] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/system/ProductionApp.tsx", root), "utf8"),
    readFile(new URL("app/system/auth-client.ts", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
  ]);
  assert.match(page, /ProductionApp/);
  assert.doesNotMatch(page, /system\/App["']/);
  assert.doesNotMatch(productionApp, /from ["']\.\/data["']/);
  assert.doesNotMatch(productionApp, /screens\//);
  assert.doesNotMatch(productionApp, /\/demo/);
  assert.doesNotMatch(authClient, /\/demo/);
  assert.match(authClient, /apiApplicationId/);
  assert.doesNotMatch(authClient, /startsWith\(`api:\/\/\$\{clientId/);
  assert.match(layout, /system\/product/);
  assert.doesNotMatch(layout, /system\/data/);
});

test("demo dependency closure stays isolated from production", async () => {
  const [page, productionApp, authClient, layout, demoPage] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/system/ProductionApp.tsx", root), "utf8"),
    readFile(new URL("app/system/auth-client.ts", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
    readFile(new URL("app/demo/page.tsx", root), "utf8"),
  ]);

  assert.match(page, /ProductionApp/);
  assert.doesNotMatch(page, /system\/App["']/);
  assert.doesNotMatch(productionApp, /from ["']\.\/data["']/);
  assert.doesNotMatch(productionApp, /screens\//);
  assert.doesNotMatch(productionApp, /\/demo/);
  assert.doesNotMatch(authClient, /\/demo/);
  assert.match(layout, /system\/product/);
  assert.doesNotMatch(layout, /system\/data/);
  assert.match(demoPage, /import\(["']\.\.\/system\/App["']\)/);
  assert.match(demoPage, /<DemoApp\s+forceDemo\s*\/>/);

  const productionDirectory = new URL("app/system/production/", root);
  const productionSources = [];
  async function collectProductionSources(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = new URL(entry.isDirectory() ? `${entry.name}/` : entry.name, directory);
      if (entry.isDirectory()) await collectProductionSources(path);
      else if (/\.[cm]?[jt]sx?$/.test(entry.name)) productionSources.push(path);
    }
  }
  await collectProductionSources(productionDirectory);
  for (const path of productionSources) {
    const source = await readFile(path, "utf8");
    assert.doesNotMatch(
      source,
      /(?:from\s+|import\s*\(\s*)["'][^"']*screens\//,
      `${path.pathname} must not import the demo screens`,
    );
    assert.doesNotMatch(
      source,
      /(?:from\s+|import\s*\(\s*)["'][^"']*(?:data|calc|store|matstore|session)["']/,
      `${path.pathname} must not import demo data or in-memory stores`,
    );
  }
});

test("production workspace exposes every Demo menu through API-backed renderers", async () => {
  const productionApp = await readFile(new URL("app/system/ProductionApp.tsx", root), "utf8");
  const navSource = productionApp.slice(productionApp.indexOf("const NAV"), productionApp.indexOf("const IS_AUTH_CONFIGURED"));
  const menuLabels = [
    "Dashboard", "My Work", "Inquiry", "Estimate Cost", "Projects",
    "Price Library", "Supplier Quotation", "Waiting Supplier Price", "Resource Plan",
    "Procurement Dashboard", "BOM", "Purchase Requisition", "Purchase Orders", "Inventory",
    "Goods Receiving", "Material Issues", "Approvals", "Customers", "Reports", "Master Data",
    "Engineering Rate", "Audit Log", "Settings",
  ];
  for (const label of menuLabels) {
    assert.match(navSource, new RegExp(`label: ["']${label}["']`));
  }
  assert.equal((navSource.match(/label:\s*["'][^"']+["']/g) ?? []).length, menuLabels.length);
  for (const banned of ["data", "calc", "store", "matstore", "session"]) {
    assert.doesNotMatch(productionApp, new RegExp(`from ["'][^"']*\\/${banned}["']`));
  }
});

test("production My Work keeps the Demo workflow on live API contracts", async () => {
  const [screen, shell] = await Promise.all([
    readFile(new URL("app/system/production/PlanningPricingScreens.tsx", root), "utf8"),
    readFile(new URL("app/system/ProductionApp.tsx", root), "utf8"),
  ]);
  for (const label of [
    "Needs update", "Late", "Blocked", "Due this week", "Awaiting the PM",
    "My tasks", "My updates", "Needs your update", "Start today", "Finish today",
    "Forecast", "Request more days", "Add my task", "Whole plan",
  ]) {
    assert.match(screen, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(screen, /apiRequest<MyWorkItem\[]>\("\/api\/v1\/me\/work"\)/);
  assert.match(screen, /apiRequest<MyWorkUpdate\[]>\("\/api\/v1\/me\/work\/updates"\)/);
  assert.match(screen, /\/api\/v1\/schedule\/tasks\/\$\{item\.taskId\}\/updates/);
  assert.match(screen, /\/api\/v1\/schedule\/tasks\/\$\{item\.taskId\}\/day-requests/);
  assert.match(screen, /\/api\/v1\/schedule\/tasks\/\$\{item\.taskId\}\/details/);
  assert.match(screen, /\/api\/v1\/schedule\/day-requests\/\$\{request\.id\}\/answer/);
  assert.match(screen, /Review request for more days/);
  assert.match(screen, /item\.isOwnDetail/);
  assert.match(screen, /item\.canAddDetail/);
  assert.match(screen, /item\.canDeleteDetail/);
  assert.doesNotMatch(screen, /from ["'][^"']*(?:data|calc|store|session)["']/);
  assert.match(shell, /openProjectSchedule/);
  assert.match(shell, /myWorkUrgentCount/);
});

test("legacy unauthenticated D1 routes and binding are absent", async () => {
  const hosting = JSON.parse(await readFile(new URL(".openai/hosting.json", root), "utf8"));
  assert.equal(hosting.d1, null);
  for (const path of [
    "app/api/app-data/route.ts",
    "app/api/estimates/route.ts",
    "app/api/estimates/workflow/route.ts",
    "app/api/suppliers/route.ts",
    "drizzle.config.ts",
    "drizzle/0000_aromatic_zaran.sql",
    "examples/d1/app/api/notes/route.ts",
  ]) {
    await assert.rejects(access(new URL(path, root)));
  }
});

test("production build validates identity and HTTPS configuration", async () => {
  const [packageJson, validator] = await Promise.all([
    readFile(new URL("package.json", root), "utf8"),
    readFile(new URL("scripts/validate-production-env.mjs", root), "utf8"),
  ]);
  assert.match(packageJson, /validate-production-env\.mjs/);
  assert.match(validator, /NEXT_PUBLIC_ENTRA_TENANT_ID/);
  assert.match(validator, /NEXT_PUBLIC_ENTRA_CLIENT_ID/);
  assert.match(validator, /NEXT_PUBLIC_ENTRA_API_SCOPE/);
  assert.match(validator, /NEXT_PUBLIC_BUSINESS_TIME_ZONE/);
  assert.match(validator, /NEXT_PUBLIC_API_BASE_URL/);
  assert.match(validator, /NEXT_PUBLIC_AUTH_MODE/);
  assert.match(validator, /Team Test is forbidden/);
  assert.match(validator, /must use HTTPS/);
  assert.match(validator, /placeholder hostname/);
  assert.match(validator, /real Microsoft Entra GUID/);
});

test("production API requires the delegated Entra scope", async () => {
  const [program, settings] = await Promise.all([
    readFile(new URL("backend/IoTTeamCenter.Api/Program.cs", root), "utf8"),
    readFile(new URL("backend/IoTTeamCenter.Api/appsettings.json", root), "utf8"),
  ]);
  assert.match(program, /Authentication:RequiredScope/);
  assert.match(program, /Authentication:Audience/);
  assert.match(program, /FindAll\("scp"\)/);
  assert.match(program, /options\.DefaultPolicy = policy\.Build\(\)/);
  assert.doesNotMatch(program, /Audience = string\.IsNullOrWhiteSpace/);
  assert.match(program, /wildcard hosts are not allowed/);
  assert.match(program, /trusted HTTPS origins/);
  assert.match(program, /Business:TimeZoneId/);
  assert.match(program, /Guid\.Empty/);
  assert.match(settings, /"RequiredScope": "access_as_user"/);
});

test("team-test authentication is staging-only, secret-backed, and database-scoped", async () => {
  // The local Windows-host Team Test Mode tooling (Install-TeamTestHost.ps1 and its
  // start/stop/LAN-firewall/access-code siblings) was retired in favor of
  // docker-compose.dev.yml -- this test used to also assert on those scripts' content,
  // but they no longer exist. The backend TeamTest authentication mode itself is still
  // real (the sql-integration CI job depends on it), so those assertions remain.
  const [
    program,
    handler,
    users,
    sql,
    frontend,
    previewValidator,
    provisioning,
    stagingSettings,
    loginGrants,
    networkOrigin,
  ] = await Promise.all([
    readFile(new URL("backend/IoTTeamCenter.Api/Program.cs", root), "utf8"),
    readFile(new URL("backend/IoTTeamCenter.Api/Infrastructure/TeamTestAuthenticationHandler.cs", root), "utf8"),
    readFile(new URL("backend/IoTTeamCenter.Api/Infrastructure/CurrentUserService.cs", root), "utf8"),
    readFile(new URL("backend/IoTTeamCenter.Api/Infrastructure/SqlConnectionFactory.cs", root), "utf8"),
    readFile(new URL("app/system/team-test-client.ts", root), "utf8"),
    readFile(new URL("scripts/validate-team-test-env.mjs", root), "utf8"),
    readFile(new URL("database/scripts/035_provision_team_test_user.sql", root), "utf8"),
    readFile(new URL("backend/IoTTeamCenter.Api/appsettings.Staging.json", root), "utf8"),
    readFile(new URL("database/scripts/010_application_login.sql", root), "utf8"),
    readFile(new URL("app/system/network-origin.ts", root), "utf8"),
  ]);
  assert.match(program, /IsStaging\(\).*TeamTestAuthenticationHandler\.SchemeName/s);
  assert.match(program, /TeamTest authentication is allowed only in the Staging environment/);
  assert.match(program, /TeamTest:AllowPrivateLanHttp is allowed only in Staging TeamTest mode/);
  assert.match(program, /IsPrivateLanIpv4/);
  assert.match(program, /TeamTestSigningKey.*32-256 characters/s);
  assert.match(handler, /X-Team-Test-Code/);
  assert.match(handler, /X-Team-Test-Email/);
  assert.match(handler, /HMACSHA256/);
  assert.match(handler, /CryptographicOperations\.FixedTimeEquals/);
  assert.match(users, /u\.email = @identity/);
  assert.match(users, /u\.deleted_at IS NULL/);
  assert.match(sql, /TrustServerCertificateForTeamTest/);
  assert.match(sql, /allowed only in Staging TeamTest mode/);
  assert.match(frontend, /sessionStorage/);
  assert.doesNotMatch(frontend, /process\.env\.[A-Z0-9_]*ACCESS_KEY/);
  assert.match(previewValidator, /NEXT_PUBLIC_APP_MODE.*team-test/s);
  assert.match(previewValidator, /must use HTTPS for team testing/);
  assert.match(provisioning, /ConfirmTeamTest/);
  assert.match(provisioning, /team-test:/);
  assert.match(stagingSettings, /"Mode": "TeamTest"/);
  assert.doesNotMatch(stagingSettings, /TeamTestSigningKey"\s*:\s*"[^"\s]+"/);
  assert.match(sql, /Database application roles are allowed only in Staging TeamTest mode/);
  assert.match(sql, /Pooling = !useApplicationRole/);
  assert.match(sql, /sp_setapprole/);
  assert.match(sql, /ApplicationRolePasswordPattern/);
  assert.match(loginGrants, /APPLICATION_ROLE/);
  assert.match(networkOrigin, /isPrivateLanIpv4Host/);
  assert.match(networkOrigin, /allowPrivateLanHttp/);
});

test("SQL application login stays least-privileged and secret template fails closed", async () => {
  const [grants, loginTemplate] = await Promise.all([
    readFile(new URL("database/scripts/010_application_login.sql", root), "utf8"),
    readFile(new URL("database/scripts/005_create_server_login.template.sql", root), "utf8"),
  ]);
  assert.doesNotMatch(grants, /GRANT EXECUTE ON SCHEMA::dbo/i);
  assert.doesNotMatch(grants, /GRANT SELECT ON SCHEMA::dbo/i);
  assert.match(grants, /@permission_cleanup/);
  assert.match(grants, /permission\.class IN \(0, 3\)/);
  assert.match(grants, /Application-role database\/schema permission normalization did not complete/);
  assert.match(grants, /retained a database- or schema-wide grant/);
  assert.match(grants, /GRANT EXECUTE ON OBJECT::dbo\.issue_document_number/i);
  assert.match(grants, /REVOKE EXECUTE ON OBJECT::dbo\.answer_schedule_day_request FROM \[public\]/i);
  assert.match(grants, /GRANT INSERT ON OBJECT::dbo\.estimate_revisions/i);
  assert.doesNotMatch(grants, /GRANT INSERT, UPDATE ON OBJECT::dbo\.estimate_revisions/i);
  assert.match(grants, /GRANT SELECT ON OBJECT::dbo\.estimate_revisions/i);
  assert.match(grants, /GRANT INSERT, UPDATE ON OBJECT::dbo\.manhour_lines/i);
  assert.match(grants, /GRANT INSERT, UPDATE ON OBJECT::dbo\.expense_lines/i);
  assert.match(grants, /GRANT INSERT, UPDATE ON OBJECT::dbo\.other_cost_lines/i);
  assert.doesNotMatch(grants, /GRANT [^;]*DELETE[^;]*ON OBJECT::dbo\.(?:manhour_lines|expense_lines|other_cost_lines)/i);
  assert.match(grants, /GRANT SELECT ON OBJECT::dbo\.mat_items/i);
  assert.match(grants, /GRANT INSERT, UPDATE ON OBJECT::dbo\.boms/i);
  assert.match(grants, /GRANT INSERT, UPDATE, DELETE ON OBJECT::dbo\.mat_pr_approval_steps/i);
  assert.match(grants, /GRANT INSERT ON OBJECT::dbo\.stock_txns/i);
  assert.doesNotMatch(grants, /GRANT INSERT, UPDATE ON OBJECT::dbo\.stock_txns/i);
  assert.match(grants, /GRANT INSERT ON OBJECT::dbo\.mat_audit/i);
  assert.doesNotMatch(grants, /GRANT INSERT, UPDATE ON OBJECT::dbo\.mat_audit/i);
  assert.doesNotMatch(grants, /DENY DELETE ON SCHEMA::dbo/i);
  assert.match(loginTemplate, /@password = N'<GENERATE_A_LONG_RANDOM_PASSWORD_IN_THE_SECRET_MANAGER>'/);
  assert.match(loginTemplate, /LEN\(@password\) NOT BETWEEN 24 AND 128/);
});

test("user deprovisioning is guarded by exact identity and confirmation", async () => {
  const [script, provision] = await Promise.all([
    readFile(new URL("database/scripts/040_deprovision_user.sql", root), "utf8"),
    readFile(new URL("database/scripts/030_provision_user.sql", root), "utf8"),
  ]);
  assert.match(script, /EntraObjectId/);
  assert.match(script, /ExpectedEmail/);
  assert.match(script, /ConfirmDisable/);
  assert.match(script, /@confirmation <> N'YES'/);
  assert.match(script, /COUNT_BIG\(\*\).*<> 1/s);
  assert.match(script, /TRY_CONVERT\(uniqueidentifier/);
  assert.match(provision, /TRY_CONVERT\(uniqueidentifier/);
  assert.match(provision, /canonical non-zero GUID/);
});

test("SQL parameter helper preserves MAX fields and validates row versions", async () => {
  const helper = await readFile(new URL("backend/IoTTeamCenter.Api/Infrastructure/SqlExtensions.cs", root), "utf8");
  assert.match(helper, /size != 0 \? parameters\.Add\(name, type, size\)/);
  assert.match(helper, /bytes\.Length != 8/);
});

test("production baseline verifier checks schema, app role, and real identities", async () => {
  const verifier = await readFile(new URL("database/scripts/080_verify_production_baseline.sql", root), "utf8");
  assert.match(verifier, /schema_versions WHERE version = 9/);
  assert.match(verifier, /Schema-wide EXECUTE is forbidden/);
  assert.match(verifier, /Schema-wide SELECT is forbidden/);
  assert.match(verifier, /active production administrator/);
  assert.match(verifier, /TRY_CONVERT\(uniqueidentifier, entra_object_id\)/);
  assert.match(verifier, /sys\.server_role_members/);
  assert.match(verifier, /unexpected direct server permission/);
  assert.match(verifier, /unexpected direct database permission/);
  assert.match(verifier, /authentication_type_desc/);
  assert.match(verifier, /@app_authentication_type = N'INSTANCE'/);
  assert.match(verifier, /@allowed_public_database_permissions/);
  assert.match(verifier, /unexpected database- or schema-wide grant/);
  assert.match(verifier, /owner-executed application procedure is granted to an unexpected database principal/);
  assert.match(verifier, /principal_id IN \(@app_user_id, @app_role_id, @public_role_id\)/);
  assert.match(verifier, /HAS_PERMS_BY_NAME\(N'dbo', N'SCHEMA', N'CONTROL'\)/);
  assert.match(verifier, /EXECUTE AS USER/);
  assert.match(verifier, /@app_user_type = 'A'/);
  assert.match(verifier, /application-role principals cannot be impersonated/);
  assert.match(verifier, /HAS_PERMS_BY_NAME\(N'dbo\.project_docs'/);
  assert.match(verifier, /required_material_permissions/);
  assert.match(verifier, /unexpected material-workflow write grant/);
  assert.match(verifier, /COLLATE DATABASE_DEFAULT/);
  assert.match(verifier, /trg_stock_txns_append_only/);
  assert.match(verifier, /trg_mat_audit_append_only/);
  assert.match(verifier, /Estimate line triggers do not enforce current-revision inserts, updates, and deletes/);
  assert.match(verifier, /Estimate validation is missing a required production rule/);
  assert.match(verifier, /baseline_verification/);
});

test("estimate revisions remain immutable and writes are record-scoped", async () => {
  const [workflow, costs, workspaceApi, estimateScreen, immutabilityMigration, workspaceMigration, deployment, seed] = await Promise.all([
    readFile(new URL("backend/IoTTeamCenter.Api/Endpoints/EstimateEndpoints.cs", root), "utf8"),
    readFile(new URL("backend/IoTTeamCenter.Api/Endpoints/EstimateCostEndpoints.cs", root), "utf8"),
    readFile(new URL("backend/IoTTeamCenter.Api/Endpoints/EstimateWorkspaceEndpoints.cs", root), "utf8"),
    readFile(new URL("app/system/production/EstimateScreens.tsx", root), "utf8"),
    readFile(new URL("database/migrations/005_revision_immutability.sql", root), "utf8"),
    readFile(new URL("database/migrations/008_estimate_workspace_integrity.sql", root), "utf8"),
    readFile(new URL("database/scripts/020_deploy_fresh_database.sql", root), "utf8"),
    readFile(new URL("database/scripts/900_optional_development_seed.sql", root), "utf8"),
  ]);
  assert.match(workflow, /INSERT INTO dbo\.estimate_revisions/);
  assert.match(workflow, /CloneCurrentCostsAsync/);
  assert.match(workflow, /UPDATE dbo\.inquiries/);
  assert.match(workflow, /estimate_owner_required/);
  assert.match(costs, /estimate_section_forbidden/);
  assert.match(costs, /GetCategoryAssignmentAsync/);
  assert.match(costs, /if \(!IsAssigned\(actor, currentAssignment\)\)/);
  assert.match(costs, /if \(!IsAssigned\(actor, assignment\)\)/);
  assert.match(costs, /e\.revision=@revision/);
  assert.match(costs, /"Updated", before, after/);
  assert.doesNotMatch(workspaceApi, /HasAnyAssignmentAsync/);
  assert.match(workspaceApi, /HasSectionAssignmentAsync/);
  assert.match(workspaceApi, /DemandAssignedSectionWriterAsync[\s\S]*?"06"/);
  assert.match(workspaceApi, /ExpenseSectionCode\(request\.ExpenseType\)/);
  assert.match(workspaceApi, /"Travel" or "Transportation" => "08"/);
  assert.match(workspaceApi, /"Accommodation" or "Per Diem" => "09"/);
  assert.match(workspaceApi, /"Equipment Rental" or "Other" => "10"/);
  assert.match(workspaceApi, /assignedSections\.Contains\("06"\)/);
  assert.match(workspaceApi, /assignedSections\.Contains\(ExpenseSectionCode\(expenseType\)\)/);
  assert.match(workspaceApi, /CanEditCostItems, bool CanEditManhour, bool CanEditExpenses, bool CanEditOtherCosts/);
  assert.match(estimateScreen, /capabilities\.canEditCostItems/);
  assert.match(estimateScreen, /capabilities\.canEditManhour/);
  assert.match(estimateScreen, /capabilities\.canEditExpenses/);
  assert.match(estimateScreen, /capabilities\.canEditOtherCosts/);
  assert.match(estimateScreen, /EXPENSE_SECTION_BY_TYPE\[expenseType\]/);
  assert.match(estimateScreen, /issue\.severity\.trim\(\)\.toLowerCase\(\) === "error"/);
  assert.match(estimateScreen, /warning\(s\) are advisory and do not block workflow/);
  assert.match(workspaceApi, /maximumLineCost = 999_999_999_999_999m/);
  assert.match(workspaceApi, /ResolveDailyRateAsync[\s\S]*?ValidateManhourLineCost/);
  assert.doesNotMatch(estimateScreen, /priceDate:\s*""/);
  assert.match(estimateScreen, /update\("priceDate", event\.target\.value \|\| undefined\)/);
  for (const warning of [
    "cost_reference_missing",
    "cost_price_stale",
    "transportation_category_missing",
    "manhour_capacity_high",
    "supplier_price_stale",
    "installation_transportation_missing",
    "installation_accommodation_missing",
  ]) {
    assert.match(workspaceApi, new RegExp(warning));
  }
  assert.match(workspaceApi, /N'Warning'/);
  assert.match(workflow, /self_revision_forbidden/);
  assert.match(immutabilityMigration, /trg_estimate_revisions_append_only/);
  assert.match(immutabilityMigration, /Historical cost items cannot be changed/);
  for (const trigger of ["cost_items", "manhour_lines", "expense_lines", "other_cost_lines"]) {
    assert.match(workspaceMigration, new RegExp(`trg_${trigger}_current_revision_only[\\s\\S]*AFTER INSERT, UPDATE, DELETE`));
  }
  assert.match(workspaceMigration, /i\.revision <> e\.revision/);
  assert.match(workspaceMigration, /d\.revision <> e\.revision/);
  assert.match(workspaceMigration, /engineering_manhour_required/);
  assert.match(workspaceMigration, /internal_rate_mismatch/);
  assert.match(workspaceMigration, /supplier_quote_required/);
  assert.match(workspaceMigration, /duplicate_cost_item/);
  assert.match(workspaceMigration, /invalid_cost_category/);
  assert.match(workspaceMigration, /VALUES \(8, N'Production estimate workspace integrity and validation'\)/);
  assert.doesNotMatch(workspaceMigration, /\bseverity\b/i);
  assert.match(deployment, /008_estimate_workspace_integrity\.sql/);
  assert.match(deployment, /version IN \(1, 2, 3, 4, 5, 6, 7, 8, 9\)\) <> 9/);
  assert.match(seed, /schema_versions WHERE version = 8/);

  // SQL Server rejects OUTPUT without INTO on any table with an enabled DML
  // trigger. Migration 008 puts triggers on all four estimate line tables, so
  // keep every API statement that returns an inserted row compatible with it.
  for (const source of [costs, workspaceApi]) {
    for (const match of source.matchAll(/(?:INSERT INTO|UPDATE)\s+dbo\.(cost_items|manhour_lines|expense_lines|other_cost_lines)\b[\s\S]*?;/gi)) {
      if (/\bOUTPUT\b/i.test(match[0])) {
        assert.match(match[0], /\bOUTPUT\b[\s\S]*?\bINTO\s+@/i, `${match[1]} OUTPUT must target a table variable`);
      }
    }
  }
  assert.match(workspaceApi, /UPDATE \{tableName\}[\s\S]*?OUTPUT inserted\.row_version INTO @result/);

  const revisionStart = workflow.indexOf("private static async Task<IResult> RequestRevisionAsync");
  const revisionEnd = workflow.indexOf("private static async Task<IResult> TransitionAsync", revisionStart);
  assert.ok(revisionStart >= 0 && revisionEnd > revisionStart, "request-revision workflow must be present");
  const revisionFlow = workflow.slice(revisionStart, revisionEnd);
  assert.ok(
    revisionFlow.indexOf("SET revision = @next_revision") < revisionFlow.indexOf("CloneCurrentCostsAsync"),
    "the estimate revision must advance before migration 008 permits cloning current lines",
  );
});

test("project portfolio listing follows the same assignment scope as project workspaces", async () => {
  const projects = await readFile(new URL("backend/IoTTeamCenter.Api/Endpoints/ProjectEndpoints.cs", root), "utf8");
  assert.match(projects, /var actor = await users\.GetRequiredAsync/);
  assert.match(projects, /@elevated = 1 OR p\.manager_id = @actor OR p\.lead_engineer_id = @actor/);
  assert.match(projects, /dbo\.project_members m WHERE m\.project_id = p\.id AND m\.user_id = @actor/);
  assert.match(projects, /ProjectScope\.IsElevated\(actor\)/);
});

test("My Work does not treat the Project Manager role as globally project-scoped", async () => {
  const [scope, schedule] = await Promise.all([
    readFile(new URL("backend/IoTTeamCenter.Api/Infrastructure/ProjectScope.cs", root), "utf8"),
    readFile(new URL("backend/IoTTeamCenter.Api/Endpoints/ScheduleEndpoints.cs", root), "utf8"),
  ]);
  const myWorkPolicy = scope.match(/public static bool IsMyWorkElevated\(CurrentUser actor\) =>\s*([^;]+);/);
  assert.ok(myWorkPolicy, "My Work must have an explicit elevation policy");
  assert.match(myWorkPolicy[1], /Admin/);
  assert.match(myWorkPolicy[1], /Engineering Manager/);
  assert.doesNotMatch(myWorkPolicy[1], /Project Manager/);
  assert.equal([...schedule.matchAll(/ProjectScope\.IsMyWorkElevated\(actor\)/g)].length, 2);
  assert.equal([...schedule.matchAll(/ProjectScope\.DemandMyWorkAsync\(/g)].length, 4);
});

test("administrative read models are permission-gated and audit ledgers stay immutable", async () => {
  const [program, endpoints, grants, verifier] = await Promise.all([
    readFile(new URL("backend/IoTTeamCenter.Api/Program.cs", root), "utf8"),
    readFile(new URL("backend/IoTTeamCenter.Api/Endpoints/AdminReadEndpoints.cs", root), "utf8"),
    readFile(new URL("database/scripts/010_application_login.sql", root), "utf8"),
    readFile(new URL("database/scripts/080_verify_production_baseline.sql", root), "utf8"),
  ]);
  assert.match(program, /MapAdminReadEndpoints/);
  assert.match(endpoints, /MapGet\("\/engineering-rates"/);
  assert.match(endpoints, /DemandPermissionAsync\("master\.read"/);
  assert.match(endpoints, /MapGet\("\/audit"/);
  assert.match(endpoints, /DemandPermissionAsync\("audit\.read"/);
  assert.match(endpoints, /FROM dbo\.audit_log/);
  assert.match(endpoints, /FROM dbo\.mat_audit/);
  assert.doesNotMatch(endpoints, /Map(?:Post|Put|Delete|Patch)/);
  assert.match(grants, /GRANT SELECT ON OBJECT::dbo\.audit_log/i);
  assert.match(grants, /GRANT SELECT ON OBJECT::dbo\.mat_audit/i);
  assert.match(grants, /REVOKE UPDATE, DELETE ON OBJECT::dbo\.audit_log/i);
  assert.match(grants, /REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo\.mat_audit/i);
  assert.match(verifier, /\(N'audit_log', N'SELECT'\)/i);
  assert.match(verifier, /\(N'mat_audit', N'SELECT'\)/i);
});

test("inventory decisions revalidate live quantities under database locks", async () => {
  const [receipts, stock, migration, deployment, health] = await Promise.all([
    readFile(new URL("backend/IoTTeamCenter.Api/Endpoints/GoodsReceiptEndpoints.cs", root), "utf8"),
    readFile(new URL("backend/IoTTeamCenter.Api/Endpoints/StockControlEndpoints.cs", root), "utf8"),
    readFile(new URL("database/migrations/006_inventory_concurrency.sql", root), "utf8"),
    readFile(new URL("database/scripts/020_deploy_fresh_database.sql", root), "utf8"),
    readFile(new URL("backend/IoTTeamCenter.Api/Endpoints/HealthEndpoints.cs", root), "utf8"),
  ]);
  assert.match(receipts, /DemandConfirmableQuantitiesAsync/);
  assert.match(receipts, /previous WITH \(UPDLOCK, HOLDLOCK, INDEX\(IX_grn_lines_po_line\)\)/);
  assert.match(receipts, /gl\.allow_over_receipt/);
  assert.match(receipts, /"over_receipt"/);
  assert.match(stock, /stock_txns t WITH \(UPDLOCK, HOLDLOCK, INDEX\(IX_stock_txns_item\)\)/);
  assert.match(stock, /resulting < 0/);
  assert.match(stock, /"negative_balance"/);
  assert.match(migration, /ADD allow_over_receipt bit NOT NULL/);
  assert.match(migration, /schema_versions\(version, name\)[\s\S]*VALUES \(6,/);
  assert.match(deployment, /006_inventory_concurrency\.sql/);
  assert.match(health, /RequiredSchemaVersion = 9/);
});

test("schedule day-request answers are atomic and narrowly permissioned", async () => {
  const [migration, grants, verifier, deployment, schedule] = await Promise.all([
    readFile(new URL("database/migrations/007_schedule_day_request_answers.sql", root), "utf8"),
    readFile(new URL("database/scripts/010_application_login.sql", root), "utf8"),
    readFile(new URL("database/scripts/080_verify_production_baseline.sql", root), "utf8"),
    readFile(new URL("database/scripts/020_deploy_fresh_database.sql", root), "utf8"),
    readFile(new URL("backend/IoTTeamCenter.Api/Endpoints/ScheduleEndpoints.cs", root), "utf8"),
  ]);
  assert.match(migration, /PROCEDURE dbo\.answer_schedule_day_request/);
  assert.match(migration, /WITH EXECUTE AS OWNER/);
  assert.match(migration, /WITH \(UPDLOCK, HOLDLOCK\)/);
  assert.match(migration, /plan_days = plan_days \+ @request_days/);
  assert.match(migration, /answer = @answer/);
  assert.match(migration, /schema_versions\(version, name\)[\s\S]*VALUES \(7,/);
  assert.match(grants, /GRANT EXECUTE ON OBJECT::dbo\.answer_schedule_day_request/i);
  assert.doesNotMatch(grants, /GRANT UPDATE ON OBJECT::dbo\.schedule_updates/i);
  assert.match(verifier, /answer_schedule_day_request/);
  assert.match(deployment, /007_schedule_day_request_answers\.sql/);
  assert.match(schedule, /MapPost\("\/day-requests\/\{id:long\}\/answer"/);
  assert.match(schedule, /DemandPermissionAsync\("schedule\.plan"/);

  const answerSource = schedule.slice(
    schedule.indexOf("private static async Task<IResult> AnswerDayRequestAsync"),
    schedule.indexOf("private static async Task<IResult> CreateMemberDetailAsync"),
  );
  const requestSource = schedule.slice(
    schedule.indexOf("private static async Task<IResult> RequestMoreDaysAsync"),
    schedule.indexOf("private static async Task<IResult> AnswerDayRequestAsync"),
  );
  const answerTaskLock = answerSource.indexOf("ReadTaskAsync(connection, transaction");
  const answerRequestLock = answerSource.indexOf("FROM dbo.schedule_updates WITH (UPDLOCK, HOLDLOCK)");
  const requestTaskLock = requestSource.indexOf("ReadTaskAsync(connection, transaction");
  const requestPendingLock = requestSource.indexOf("HasPendingDayRequestAsync(connection, transaction");
  assert.ok(answerTaskLock >= 0 && answerRequestLock > answerTaskLock, "answer path must lock task before request");
  assert.ok(requestTaskLock >= 0 && requestPendingLock > requestTaskLock, "request path must lock task before pending requests");
  assert.ok(
    migration.indexOf("FROM dbo.schedule_tasks WITH (UPDLOCK, HOLDLOCK)")
      < migration.indexOf("FROM dbo.schedule_updates WITH (UPDLOCK, HOLDLOCK)"),
    "owner procedure must lock task before request",
  );
});

test("project documents use fail-closed NAS storage, scoped access, and append-only metadata", async () => {
  const [
    program,
    options,
    storage,
    endpoints,
    health,
    settings,
    developmentSettings,
    grants,
    verifier,
    probe,
    deployment,
    gitignore,
  ] = await Promise.all([
    readFile(new URL("backend/IoTTeamCenter.Api/Program.cs", root), "utf8"),
    readFile(new URL("backend/IoTTeamCenter.Api/Infrastructure/DocumentStorageOptions.cs", root), "utf8"),
    readFile(new URL("backend/IoTTeamCenter.Api/Infrastructure/ProjectDocumentStorage.cs", root), "utf8"),
    readFile(new URL("backend/IoTTeamCenter.Api/Endpoints/ProjectDocumentEndpoints.cs", root), "utf8"),
    readFile(new URL("backend/IoTTeamCenter.Api/Endpoints/HealthEndpoints.cs", root), "utf8"),
    readFile(new URL("backend/IoTTeamCenter.Api/appsettings.json", root), "utf8"),
    readFile(new URL("backend/IoTTeamCenter.Api/appsettings.Development.json", root), "utf8"),
    readFile(new URL("database/scripts/010_application_login.sql", root), "utf8"),
    readFile(new URL("database/scripts/080_verify_production_baseline.sql", root), "utf8"),
    readFile(new URL("scripts/Test-NasStorage.ps1", root), "utf8"),
    readFile(new URL("docs/PRODUCTION_DEPLOYMENT.md", root), "utf8"),
    readFile(new URL(".gitignore", root), "utf8"),
  ]);

  assert.match(program, /MapProjectDocumentEndpoints/);
  assert.match(program, /ClearProviders\(\)/);
  assert.doesNotMatch(program, /AddEventLog/);
  assert.match(program, /AddPolicy\("document-upload"/);
  assert.match(program, /PermitLimit = 6/);
  assert.match(options, /Mode must be 'Nas' in Production/);
  assert.match(options, /UNC path containing a server and share/);
  assert.match(settings, /"Mode": "Nas"/);
  assert.match(settings, /"RootPath": ""/);
  assert.doesNotMatch(settings, /100\.98\.152\.4/);
  assert.match(developmentSettings, /"Mode": "Local"/);

  assert.match(storage, /Guid\.NewGuid/);
  assert.match(storage, /HashAlgorithmName\.SHA256/);
  assert.match(storage, /outside the configured storage root/);
  assert.match(storage, /VerifyIntegrityAndRewindAsync/);
  assert.match(storage, /CryptographicOperations\.FixedTimeEquals/);
  assert.match(storage, /probe\.WaitAsync\(options\.AvailabilityProbeTimeout/);
  assert.match(endpoints, /DemandPermissionAsync\("project\.write"/);
  assert.match(endpoints, /RequireRateLimiting\("document-upload"\)/);
  assert.match(endpoints, /p\.manager_id = @actor/);
  assert.match(endpoints, /p\.lead_engineer_id = @actor/);
  assert.match(endpoints, /dbo\.project_members/);
  assert.equal((endpoints.match(/DemandProjectAccessScopeAsync\(\w+, projectId, actor/g) ?? []).length, 3);
  assert.match(endpoints, /MapGet\("\/"/);
  assert.match(endpoints, /MapPost\("\/"/);
  assert.match(endpoints, /MapGet\("\/\{documentId:long\}\/content"/);
  assert.doesNotMatch(endpoints, /MapDelete/);
  assert.match(endpoints, /provider_etag/);
  assert.match(endpoints, /VerifyIntegrityAndRewindAsync/);
  assert.match(endpoints, /commitOutcomeUnknown/);
  assert.match(endpoints, /preserving storage key/);
  assert.match(health, /documentStorage\.IsAvailableAsync/);
  assert.match(health, /document_storage_unavailable/);

  assert.match(grants, /GRANT SELECT ON OBJECT::dbo\.project_docs/i);
  assert.match(grants, /GRANT INSERT ON OBJECT::dbo\.project_docs/i);
  assert.match(grants, /REVOKE UPDATE, DELETE ON OBJECT::dbo\.project_docs/i);
  assert.match(verifier, /Project document metadata must not be updateable or deletable/i);

  assert.match(probe, /\[string\]\s+\$NasRoot/);
  assert.doesNotMatch(probe, /\[string\]\s+\$(?:Password|Credential)/i);
  assert.match(probe, /Test-NetConnection[^\r\n]+Port 445/);
  assert.match(probe, /WriteAllText/);
  assert.match(probe, /ReadAllText/);
  assert.match(probe, /Remove-Item -LiteralPath \$probePath -Force -ErrorAction Stop/);
  assert.ok(probe.indexOf("Remove-Item") < probe.indexOf("Status = 'PASS'"));
  assert.match(deployment, /does \*\*not\*\*\s+provide a malware scanner or quarantine workflow/);
  assert.match(gitignore, /^\*\*\/App_Data\/$/m);
  assert.match(gitignore, /^\/\.tmp\/$/m);
});
