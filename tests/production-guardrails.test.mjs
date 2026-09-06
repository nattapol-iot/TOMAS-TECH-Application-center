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

test("production workspace exposes API-backed menus with Inquiry as the intake entry", async () => {
  const productionApp = await readFile(new URL("app/system/ProductionApp.tsx", root), "utf8");
  const navSource = productionApp.slice(productionApp.indexOf("const NAV"), productionApp.indexOf("const IS_AUTH_CONFIGURED"));
  const menuLabels = [
    "Dashboard", "My Work", "Inquiry", "Estimate Cost", "Projects", "Knowledge Hub",
    "Site Visit", "My Assignments",
    "Price Library", "Supplier Quotation", "Waiting Supplier Price", "Project Timeline", "Resource Plan",
    "Procurement Dashboard", "BOM", "Purchase Requisition", "Purchase Orders", "Inventory",
    "Goods Receiving", "Material Issues", "Approvals",
    // Document signing (DSN-TC-005). "My signature" is deliberately not here:
    // a specimen is a preference, reached from the user menu, because putting it
    // in the sidebar would imply the image is what authorises.
    "Sign Inbox", "Signed Documents",
    "Team Activity", "KPI & Growth", "Reports", "Master Data", "Module Templates",
    "Company Stamps", "Audit Log", "Visit Master Data", "Settings",
  ];
  for (const label of menuLabels) {
    assert.match(navSource, new RegExp(`label: ["']${label}["']`));
  }
  assert.equal((navSource.match(/label:\s*["'][^"']+["']/g) ?? []).length, menuLabels.length);
  assert.doesNotMatch(navSource, /label: ["']Sales Intake["']/);
  assert.match(productionApp, /openVisit=\{openSiteVisit\}/);
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
    "Search project, WBS or task", "All projects", "Priority first", "Update details",
    "Quick update", "No tasks match these filters", "Clear filters",
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
  assert.match(screen, /const visibleTasks = useMemo/);
  assert.match(screen, /taskFilter === "attention"/);
  assert.match(screen, /workUserNote/, "import provenance must not be presented as the employee note");
  assert.doesNotMatch(screen, /\{needsUpdate\.map\(/, "urgent tasks must not be rendered twice");
  assert.doesNotMatch(screen, /from ["'][^"']*(?:data|calc|store|session)["']/);
  assert.match(shell, /openProjectSchedule/);
  assert.match(shell, /myWorkUrgentCount/);
});

test("production Projects table defaults to 10 rows and supports page-size selection", async () => {
  const screen = await readFile(new URL("app/system/production/CoreScreens.tsx", root), "utf8");
  const projects = screen.slice(
    screen.indexOf("export function ProductionProjects"),
    screen.indexOf("function ProjectDocumentsModal"),
  );

  assert.match(projects, /const \[pageSize, setPageSize\] = useState\(10\)/);
  assert.match(projects, /listProjects\(\{ page, pageSize, search/);
  assert.match(projects, /<TablePageSize value=\{pageSize\}/);
  assert.match(projects, /setPageSize\(value\); setPage\(1\)/);
});

test("inquiry qualification persists probability and customer interest with audited concurrency", async () => {
  const [screen, client, endpoint, models, migration, shell] = await Promise.all([
    readFile(new URL("app/system/production/InquiryScreens.tsx", root), "utf8"),
    readFile(new URL("app/system/api-client.ts", root), "utf8"),
    readFile(new URL("backend/IoTTeamCenter.Api/Endpoints/InquiryEndpoints.cs", root), "utf8"),
    readFile(new URL("backend/IoTTeamCenter.Api/Models/ApiModels.cs", root), "utf8"),
    readFile(new URL("database/migrations/010_inquiry_qualification.sql", root), "utf8"),
    readFile(new URL("app/system/ProductionApp.tsx", root), "utf8"),
  ]);
  assert.match(migration, /project_probability tinyint NOT NULL/);
  assert.match(migration, /customer_interest_grade char\(1\) NOT NULL/);
  assert.match(migration, /CHECK \(project_probability BETWEEN 0 AND 100\)/);
  assert.match(migration, /CHECK \(customer_interest_grade IN \(''A'', ''B'', ''C'', ''D''\)\)/);
  assert.match(migration, /VALUES \(10, N'Inquiry project probability and customer interest qualification'\)/);
  assert.match(models, /InquiryQualificationRequest/);
  assert.match(endpoint, /MapPut\("\/\{id:long\}\/qualification", UpdateQualificationAsync\)/);
  assert.match(endpoint, /FROM dbo\.inquiries WITH \(UPDLOCK, HOLDLOCK\)/);
  assert.match(endpoint, /row_version = @row_version/);
  assert.match(endpoint, /"Qualification updated"/);
  assert.match(client, /updateInquiryQualification/);
  assert.match(client, /interestGrade\?: string/);
  assert.match(client, /probabilityFrom\?: number/);
  assert.match(screen, /Project Probability/);
  assert.match(screen, /Customer Interest Grade/);
  assert.match(screen, /QualificationDrawer/);
  assert.match(screen, /openEstimate\?\.\(detail\.estimate!\.id\)/);
  assert.match(screen, /openEstimate\?\.\(estimate\.id\)/);
  assert.match(shell, /initialEstimateId=\{preferredEstimateId\}/);
  assert.match(shell, /key=\{preferredEstimateId \?\? "estimate-list"\}/);
  for (const grade of ["A", "B", "C", "D"]) assert.match(screen, new RegExp(`value: "${grade}"`));
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
  const [
    program,
    handler,
    users,
    sql,
    frontend,
    previewValidator,
    provisioning,
    stagingSettings,
    installer,
    starter,
    stopper,
    addUser,
    loginGrants,
    networkOrigin,
    lanFrontendStarter,
    lanFrontendStopper,
    lanFrontendProcess,
    lanValidation,
    lanFirewallConfigurator,
    lanFirewallRemover,
  ] = await Promise.all([
    readFile(new URL("backend/IoTTeamCenter.Api/Program.cs", root), "utf8"),
    readFile(new URL("backend/IoTTeamCenter.Api/Infrastructure/TeamTestAuthenticationHandler.cs", root), "utf8"),
    readFile(new URL("backend/IoTTeamCenter.Api/Infrastructure/CurrentUserService.cs", root), "utf8"),
    readFile(new URL("backend/IoTTeamCenter.Api/Infrastructure/SqlConnectionFactory.cs", root), "utf8"),
    readFile(new URL("app/system/team-test-client.ts", root), "utf8"),
    readFile(new URL("scripts/validate-team-test-env.mjs", root), "utf8"),
    readFile(new URL("database/scripts/035_provision_team_test_user.sql", root), "utf8"),
    readFile(new URL("backend/IoTTeamCenter.Api/appsettings.Staging.json", root), "utf8"),
    readFile(new URL("scripts/Install-TeamTestHost.ps1", root), "utf8"),
    readFile(new URL("scripts/Start-TeamTestHost.ps1", root), "utf8"),
    readFile(new URL("scripts/Stop-TeamTestHost.ps1", root), "utf8"),
    readFile(new URL("scripts/Add-TeamTestUser.ps1", root), "utf8"),
    readFile(new URL("database/scripts/010_application_login.sql", root), "utf8"),
    readFile(new URL("app/system/network-origin.ts", root), "utf8"),
    readFile(new URL("scripts/Start-TeamTestLanFrontend.ps1", root), "utf8"),
    readFile(new URL("scripts/Stop-TeamTestLanFrontend.ps1", root), "utf8"),
    readFile(new URL("scripts/TeamTestLanFrontendProcess.ps1", root), "utf8"),
    readFile(new URL("scripts/TeamTestLanValidation.ps1", root), "utf8"),
    readFile(new URL("scripts/Configure-TeamTestLanFirewall.ps1", root), "utf8"),
    readFile(new URL("scripts/Remove-TeamTestLanFirewall.ps1", root), "utf8"),
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
  assert.match(installer, /ConvertFrom-SecureString/);
  assert.match(installer, /Integrated Security/);
  assert.match(installer, /CREATE APPLICATION ROLE/);
  assert.match(installer, /RuntimeRoot must stay within/);
  assert.match(installer, /non-application-role database principal/);
  assert.match(installer, /PrivateLanAddress is not assigned to this machine/);
  assert.match(installer, /AllowPrivateLanHttp/);
  assert.match(installer, /Get-TeamTestCanonicalOrigin/);
  assert.match(lanValidation, /GetLeftPart\(\[UriPartial\]::Authority\)/);
  assert.match(lanValidation, /canonical origin without credentials, a trailing slash/);
  assert.doesNotMatch(installer, /contained database authentication/i);
  assert.match(starter, /Get-TeamTestValidatedListenerConfiguration/);
  assert.match(lanValidation, /Saved ListenUrls must contain exactly/);
  assert.match(lanValidation, /Wildcard, hostname, and extra listeners are forbidden/);
  assert.match(starter, /Test-ExactApiListeners/);
  assert.match(starter, /Test-TeamTestApiHealth/);
  assert.match(starter, /ASPNETCORE_URLS = \$listenerConfiguration\.ListenUrls/);
  assert.match(starter, /http:\/\/127\.0\.0\.1:/);
  assert.match(starter, /Database__ApplicationRolePassword/);
  assert.match(starter, /-WindowStyle Hidden/);
  assert.match(stopper, /CommandLine -notlike/);
  assert.match(stopper, /refusing to stop it/);
  assert.match(addUser, /035_provision_team_test_user\.sql/);
  assert.match(addUser, /TeamTestSigningKey/);
  assert.match(addUser, /iot-team-test-provision-/);
  assert.match(addUser, /:setvar DisplayName/);
  assert.match(addUser, /Remove-Item.*\$sqlcmdInputPath/s);
  assert.doesNotMatch(addUser, /sqlcmd[^\n]*\s-v(?:\s|`)/);
  assert.doesNotMatch(addUser, /TeamTestSigningKey\s*=\s*["'][^"']+["']/);
  assert.match(networkOrigin, /isPrivateLanIpv4Host/);
  assert.match(networkOrigin, /allowPrivateLanHttp/);
  assert.match(lanFrontendStarter, /--hostname/);
  assert.match(lanFrontendStarter, /NEXT_PUBLIC_API_BASE_URL/);
  assert.match(lanFrontendStarter, /savedStateMatches/);
  assert.match(lanFrontendStarter, /Test-TeamTestLanFrontendHealth/);
  assert.doesNotMatch(lanFrontendStarter, /0\.0\.0\.0/);
  assert.match(lanFrontendStopper, /Test-TeamTestLanFrontendCommandLine/);
  assert.match(lanFrontendStopper, /Test-TeamTestLanFrontendListener/);
  assert.match(lanFrontendStopper, /refusing to stop it/);
  assert.match(lanFrontendProcess, /RuntimeCommand/);
  assert.match(lanFrontendStarter, /run build:local/);
  assert.match(lanFrontendStarter, /'start'/);
  assert.match(lanFrontendProcess, /--hostname/);
  assert.match(lanFrontendProcess, /--port/);
  assert.match(lanFrontendProcess, /Get-NetTCPConnection/);
  assert.match(lanFrontendProcess, /OwningProcess/);
  assert.match(lanFirewallConfigurator, /Assert-Administrator/);
  assert.match(lanFirewallConfigurator, /Test-BroadProgramAllowRule/);
  assert.match(lanFirewallConfigurator, /Test-RuleCanAdmitTarget/);
  assert.match(lanFirewallConfigurator, /Get-PrivateLanSubnetCidr/);
  assert.match(lanFirewallConfigurator, /PrefixLength = \$prefixLength/);
  assert.match(lanFirewallConfigurator, /Get-NetFirewallPortFilter/);
  assert.match(lanFirewallConfigurator, /Get-NetFirewallApplicationFilter/);
  assert.match(lanFirewallConfigurator, /Get-NetFirewallAddressFilter/);
  assert.match(lanFirewallConfigurator, /Get-NetFirewallInterfaceFilter/);
  assert.match(lanFirewallConfigurator, /Existing inbound Allow firewall rules could also admit/);
  assert.match(lanFirewallConfigurator, /\$ruleName -notin \$managedRuleNames/);
  assert.match(lanFirewallConfigurator, /\$ruleName -notin \$handledBroadRuntimeRuleNames/);
  assert.match(lanFirewallConfigurator, /PolicyStoreSourceType.*Local/s);
  assert.match(lanFirewallConfigurator, /-InterfaceAlias\s+\$interfaceAlias/);
  assert.match(lanFirewallConfigurator, /-LocalAddress\s+\$lanAddress/);
  assert.match(lanFirewallConfigurator, /-RemoteAddress\s+\$remoteSubnet/);
  assert.match(lanFirewallConfigurator, /-Profile\s+\$firewallProfile/);
  assert.match(lanFirewallConfigurator, /-EdgeTraversalPolicy\s+Block/);
  assert.doesNotMatch(lanFirewallConfigurator, /-RemoteAddress\s+['"]?(?:Any|\*)/i);
  assert.match(lanFirewallRemover, /DisabledBroadRuntimeRuleNames/);
  assert.match(lanFirewallRemover, /IoTTeamCenter-TeamTest-LAN-Frontend/);
  assert.match(lanFirewallRemover, /IoTTeamCenter-TeamTest-LAN-API/);
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
  assert.match(verifier, /schema_versions WHERE version = 25/);
  assert.match(verifier, /schema_versions WHERE version = 27/);
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
  assert.match(estimateScreen, /const \[pageSize, setPageSize\] = useState\(50\)/);
  assert.match(estimateScreen, /<TablePageSize value=\{pageSize\}/);
  assert.match(estimateScreen, /<StatusLegend items=/);
  for (const tab of ["Summary", "Cost Items", "Engineering Man-hour", "Other Project Cost", "Assignment", "Validation", "Revision History", "Compare Revision", "Engineering Review"]) {
    assert.match(estimateScreen, new RegExp(tab.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  for (const action of ["New Work Package", "Add activity", "Supplier man-hour", "Add expense", "Continue to activity", "Search Price Library", "Import Excel", "Copy Previous Estimate", "Add with details", "New Main Module"]) {
    assert.match(estimateScreen, new RegExp(action));
  }
  assert.match(estimateScreen, /loadPriceLibraryRecords/);
  assert.match(estimateScreen, /readSpreadsheet/);
  assert.match(estimateScreen, /createCostItem\(estimateId, \{ \.\.\.seed, estimateRowVersion: rowVersion \}/);
  assert.match(estimateScreen, /Price selected from live Price Library/);
  assert.match(estimateScreen, /written to SQL Server/);
  assert.match(estimateScreen, /className="inline-draft-row"/);
  assert.match(estimateScreen, /event\.key === "Enter"/);
  assert.match(estimateScreen, /saveQuickRow\(true\)/);
  assert.match(estimateScreen, /Activity created · press Enter to continue adding rows/);
  assert.match(estimateScreen, /className="cost-inline-sheet cost-sheet"/);
  assert.match(estimateScreen, /Cost item created · press Enter to continue adding rows/);
  assert.match(estimateScreen, /aria-label=\{uiText\("Item code"\)\}/);
  assert.match(estimateScreen, /workspace\.expenseLines\.map\(\(line\) => `\$\{line\.costType\}\\u0000\$\{line\.package\}`\)/);
  assert.match(estimateScreen, /setManhourSeed\(seed\)/);
  assert.match(estimateScreen, /setExpenseSeed\(seed\)/);
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
  assert.match(deployment, /009_inquiry_workspace\.sql/);
  assert.match(deployment, /010_inquiry_qualification\.sql/);
  assert.match(deployment, /011_employee_master\.sql/);
  assert.match(deployment, /012_supplier_price_history\.sql/);
  assert.match(deployment, /013_supplier_quotations\.sql/);
  assert.match(deployment, /014_knowledge_hub\.sql/);
  assert.match(deployment, /015_knowledge_hub_workflow_hardening\.sql/);
  assert.match(deployment, /027_report_templates\.sql/);
  assert.match(deployment, /026_performance_reviews\.sql/);
  // Migration 017 extended the list. The assertion still pins an exact count,
  // so a migration added to the runner but never applied still fails the build.
  assert.match(deployment, /version IN \(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35\)\) <> 35/);
  assert.match(seed, /schema_versions WHERE version = 15/);

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
  assert.match(health, /RequiredSchemaVersion = 28/);
});

test("audited supplier purchase history is read-only to the application and reusable by Estimate Cost", async () => {
  const [migration, importer, endpoint, program, client, estimateScreen, pricingScreen, grants, verifier] = await Promise.all([
    readFile(new URL("database/migrations/012_supplier_price_history.sql", root), "utf8"),
    readFile(new URL("scripts/Import-SupplierPriceHistory.ps1", root), "utf8"),
    readFile(new URL("backend/IoTTeamCenter.Api/Endpoints/SupplierPriceHistoryEndpoints.cs", root), "utf8"),
    readFile(new URL("backend/IoTTeamCenter.Api/Program.cs", root), "utf8"),
    readFile(new URL("app/system/api-client.ts", root), "utf8"),
    readFile(new URL("app/system/production/EstimateScreens.tsx", root), "utf8"),
    readFile(new URL("app/system/production/PlanningPricingScreens.tsx", root), "utf8"),
    readFile(new URL("database/scripts/010_application_login.sql", root), "utf8"),
    readFile(new URL("database/scripts/080_verify_production_baseline.sql", root), "utf8"),
  ]);
  assert.match(migration, /CREATE TABLE dbo\.supplier_price_history/);
  assert.match(migration, /UQ_supplier_price_history_source_key/);
  assert.match(migration, /VALUES \(12, N'Audited supplier quotation and historical purchase price ledger'\)/);
  assert.match(importer, /Expected 76 audited PR lines/);
  assert.match(importer, /304084\.29/);
  assert.match(importer, /WHERE NOT EXISTS \(SELECT 1 FROM dbo\.supplier_price_history target WHERE target\.source_key = source\.source_key\)/);
  assert.doesNotMatch(importer, /INSERT INTO dbo\.(?:mat_prs|mat_pos|stock_txns)/);
  assert.match(endpoint, /DemandPermissionAsync\("estimate\.read"/);
  assert.match(endpoint, /FROM dbo\.supplier_price_history/);
  assert.match(program, /MapSupplierPriceHistoryEndpoints/);
  assert.match(client, /listSupplierPriceHistory/);
  assert.match(estimateScreen, /Historical Purchase/);
  assert.match(estimateScreen, /Purchase Price/);
  assert.match(pricingScreen, /loadAllSupplierPriceHistory/);
  assert.match(pricingScreen, /record\.sourceKind === "Estimate"/);
  const priceLibrarySource = pricingScreen.slice(
    pricingScreen.indexOf("export function ProductionPriceLibrary"),
    pricingScreen.indexOf("const supplierQuotationCurrency"),
  );
  assert.match(priceLibrarySource, /useState\(50\)/);
  assert.match(priceLibrarySource, /<TablePageSize value=\{pageSize\}/);
  assert.match(priceLibrarySource, /<Pagination page=\{currentPage\}/);
  assert.match(priceLibrarySource, /table style=\{\{ minWidth: 1580 \}\}/);
  assert.match(grants, /GRANT SELECT ON OBJECT::dbo\.supplier_price_history/);
  assert.match(grants, /REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo\.supplier_price_history/);
  assert.match(verifier, /\(N'supplier_price_history', N'SELECT'\)/);
});

test("supplier quotations are uploaded to secure storage and listed in the standard production grid", async () => {
  const [migration, endpoint, storage, program, client, screen, grants, verifier] = await Promise.all([
    readFile(new URL("database/migrations/013_supplier_quotations.sql", root), "utf8"),
    readFile(new URL("backend/IoTTeamCenter.Api/Endpoints/SupplierQuotationEndpoints.cs", root), "utf8"),
    readFile(new URL("backend/IoTTeamCenter.Api/Infrastructure/ProjectDocumentStorage.cs", root), "utf8"),
    readFile(new URL("backend/IoTTeamCenter.Api/Program.cs", root), "utf8"),
    readFile(new URL("app/system/api-client.ts", root), "utf8"),
    readFile(new URL("app/system/production/PlanningPricingScreens.tsx", root), "utf8"),
    readFile(new URL("database/scripts/010_application_login.sql", root), "utf8"),
    readFile(new URL("database/scripts/080_verify_production_baseline.sql", root), "utf8"),
  ]);
  assert.match(migration, /CREATE TABLE dbo\.supplier_quotations/);
  assert.match(migration, /UQ_supplier_quotations_no/);
  assert.match(migration, /VALUES \(13, N'Supplier quotation document registry and secure attachments'\)/);
  assert.match(endpoint, /MapPost\("\/", CreateAsync\)/);
  assert.match(endpoint, /DemandPermissionAsync\("estimate\.write"/);
  assert.match(endpoint, /CreateSupplierQuotationStorageKey/);
  assert.match(endpoint, /AddParameter\("@sha256"/);
  assert.match(endpoint, /VerifyIntegrityAndRewindAsync/);
  assert.match(storage, /supplier-quotations/);
  assert.match(program, /MapSupplierQuotationEndpoints/);
  assert.match(client, /createSupplierQuotation/);
  assert.match(client, /downloadSupplierQuotation/);
  assert.match(screen, /function SupplierQuotationUploadModal/);
  assert.match(screen, /<TablePageSize value=\{pageSize\}/);
  assert.match(screen, /<Pagination page=\{page\}/);
  assert.match(screen, /useState\(50\)/);
  assert.match(grants, /GRANT SELECT ON OBJECT::dbo\.supplier_quotations/);
  assert.match(grants, /GRANT INSERT ON OBJECT::dbo\.supplier_quotations/);
  assert.match(verifier, /\(N'supplier_quotations', N'SELECT'\), \(N'supplier_quotations', N'INSERT'\)/);
});

test("employee master backs assignment identities without granting login access", async () => {
  const [migration, directoryMigration, endpoints, nodeEndpoints, bootstrap, nodeBootstrap, models, client, screen, grants] = await Promise.all([
    readFile(new URL("database/migrations/011_employee_master.sql", root), "utf8"),
    readFile(new URL("database/migrations/022_employee_directory_assignments.sql", root), "utf8"),
    readFile(new URL("backend/IoTTeamCenter.Api/Endpoints/MasterDataEndpoints.cs", root), "utf8"),
    readFile(new URL("backend-node/src/routes/master.ts", root), "utf8"),
    readFile(new URL("backend/IoTTeamCenter.Api/Endpoints/BootstrapEndpoints.cs", root), "utf8"),
    readFile(new URL("backend-node/src/routes/bootstrap.ts", root), "utf8"),
    readFile(new URL("backend/IoTTeamCenter.Api/Models/ApiModels.cs", root), "utf8"),
    readFile(new URL("app/system/api-client.ts", root), "utf8"),
    readFile(new URL("app/system/production/CoreScreens.tsx", root), "utf8"),
    readFile(new URL("database/scripts/010_application_login.sql", root), "utf8"),
  ]);
  assert.match(migration, /CREATE TABLE dbo\.employees/);
  assert.match(migration, /user_id bigint NULL/);
  assert.match(migration, /FK_employees_user/);
  assert.match(directoryMigration, /ALTER COLUMN entra_object_id nvarchar\(64\) NULL/);
  assert.match(directoryMigration, /CREATE UNIQUE INDEX UX_users_entra_object_id[\s\S]*WHERE entra_object_id IS NOT NULL/);
  assert.match(directoryMigration, /PROCEDURE dbo\.sync_employee_directory_user/);
  assert.match(directoryMigration, /WITH EXECUTE AS OWNER/);
  assert.match(directoryMigration, /EXEC dbo\.sync_employee_directory_user @employee_id/);
  assert.match(endpoints, /MapGet\("\/employees", ListEmployeesAsync\)/);
  assert.match(endpoints, /MapPost\("\/employees", CreateEmployeeAsync\)/);
  assert.match(endpoints, /MapPut\("\/employees\/\{id:long\}", UpdateEmployeeAsync\)/);
  assert.match(endpoints, /DemandPermissionAsync\("master\.write"/);
  assert.match(endpoints, /row_version=@row_version/);
  assert.match(endpoints, /"Employee"[\s\S]*?"Updated"/);
  assert.match(endpoints, /SyncEmployeeDirectoryUserAsync/);
  assert.match(nodeEndpoints, /syncEmployeeDirectoryUser/);
  assert.match(bootstrap, /FROM dbo\.employees employee/);
  assert.match(bootstrap, /INNER JOIN dbo\.users app_user ON app_user\.id = employee\.user_id/);
  assert.match(bootstrap, /employee\.employee_no/);
  assert.match(nodeBootstrap, /FROM dbo\.employees employee/);
  assert.match(nodeBootstrap, /INNER JOIN dbo\.users app_user ON app_user\.id = employee\.user_id/);
  assert.match(nodeBootstrap, /employee\.employee_no/);
  assert.match(models, /record CreateEmployeeRequest/);
  assert.match(client, /api\/v1\/master\/employees/);
  assert.match(screen, /function EmployeeMasterTab/);
  assert.match(screen, /Creating an employee does not create a login account/);
  assert.match(grants, /GRANT SELECT ON OBJECT::dbo\.employees/);
  assert.match(grants, /GRANT INSERT, UPDATE ON OBJECT::dbo\.employees/);
  assert.match(grants, /GRANT EXECUTE ON OBJECT::dbo\.sync_employee_directory_user/);
});

test("customer master editing is audited, concurrent, and narrowly permissioned", async () => {
  const [screen, ui, endpoint, models, bootstrap, grants, verifier] = await Promise.all([
    readFile(new URL("app/system/production/AdminAnalyticsScreens.tsx", root), "utf8"),
    readFile(new URL("app/system/ui.tsx", root), "utf8"),
    readFile(new URL("backend/IoTTeamCenter.Api/Endpoints/MasterDataEndpoints.cs", root), "utf8"),
    readFile(new URL("backend/IoTTeamCenter.Api/Models/ApiModels.cs", root), "utf8"),
    readFile(new URL("backend/IoTTeamCenter.Api/Endpoints/BootstrapEndpoints.cs", root), "utf8"),
    readFile(new URL("database/scripts/010_application_login.sql", root), "utf8"),
    readFile(new URL("database/scripts/080_verify_production_baseline.sql", root), "utf8"),
  ]);
  assert.match(endpoint, /MapPut\("\/customers\/\{id:long\}", UpdateCustomerAsync\)/);
  assert.match(endpoint, /FROM dbo\.customers WITH \(UPDLOCK, HOLDLOCK\)/);
  assert.match(endpoint, /row_version=@row_version/);
  assert.match(endpoint, /"Customer"[\s\S]*?"Updated"/);
  assert.match(models, /record UpdateCustomerRequest/);
  assert.match(bootstrap, /c\.row_version/);
  assert.match(screen, /title=\{customer \? "Edit customer" : "New customer"\}/);
  assert.match(screen, /method: customer \? "PUT" : "POST"/);
  assert.match(screen, /<TablePageSize value=\{pageSize\}/);
  assert.match(ui, /export function TablePageSize/);
  assert.match(ui, /\[10, 25, 50, 100\]/);
  assert.match(grants, /GRANT INSERT, UPDATE ON OBJECT::dbo\.customers/);
  assert.match(verifier, /\(N'customers', N'SELECT'\), \(N'customers', N'INSERT'\), \(N'customers', N'UPDATE'\)/);
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

test("Knowledge Hub is permission-filtered, revision-safe, and included in production deployment", async () => {
  const [migration, hardening, endpoint, screen, client, program, deployment, grants, verifier, health, seed] = await Promise.all([
    readFile(new URL("database/migrations/014_knowledge_hub.sql", root), "utf8"),
    readFile(new URL("database/migrations/015_knowledge_hub_workflow_hardening.sql", root), "utf8"),
    readFile(new URL("backend/IoTTeamCenter.Api/Endpoints/KnowledgeEndpoints.cs", root), "utf8"),
    readFile(new URL("app/system/production/KnowledgeScreens.tsx", root), "utf8"),
    readFile(new URL("app/system/api-client.ts", root), "utf8"),
    readFile(new URL("backend/IoTTeamCenter.Api/Program.cs", root), "utf8"),
    readFile(new URL("database/scripts/020_deploy_fresh_database.sql", root), "utf8"),
    readFile(new URL("database/scripts/010_application_login.sql", root), "utf8"),
    readFile(new URL("database/scripts/080_verify_production_baseline.sql", root), "utf8"),
    readFile(new URL("backend/IoTTeamCenter.Api/Endpoints/HealthEndpoints.cs", root), "utf8"),
    readFile(new URL("database/scripts/910_knowledge_hub_seed.sql", root), "utf8"),
  ]);
  assert.match(migration, /UX_knowledge_document_versions_one_published/);
  assert.match(migration, /trg_knowledge_document_versions_immutable/);
  assert.match(migration, /trg_knowledge_audit_events_append_only/);
  assert.match(migration, /UPDLOCK, HOLDLOCK/);
  assert.match(migration, /knowledge\.manage_permissions/);
  assert.match(hardening, /Approved.*Published/s);
  assert.match(hardening, /extracted_text/);
  assert.match(endpoint, /VisibilityPredicate/);
  assert.match(endpoint, /DemandPermissionAsync\("knowledge\.publish"/);
  assert.match(endpoint, /self_approval_forbidden/);
  assert.match(endpoint, /IsolationLevel\.Serializable/);
  assert.match(endpoint, /CreateKnowledgeStorageKey/);
  assert.match(screen, /Standards Register/);
  assert.match(screen, /Presentation Library/);
  assert.match(screen, /My Acknowledgements/);
  assert.match(screen, /useState\(50\)/);
  assert.match(client, /listKnowledgeDocuments/);
  assert.match(program, /MapKnowledgeEndpoints/);
  assert.match(deployment, /014_knowledge_hub\.sql/);
  assert.match(deployment, /015_knowledge_hub_workflow_hardening\.sql/);
  assert.match(deployment, /14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35\)\) <> 35/);
  assert.match(grants, /GRANT INSERT ON OBJECT::dbo\.knowledge_audit_events/);
  assert.match(grants, /GRANT INSERT, UPDATE, DELETE ON OBJECT::dbo\.knowledge_document_approvals/);
  assert.doesNotMatch(grants, /GRANT INSERT, UPDATE ON OBJECT::dbo\.knowledge_audit_events/);
  assert.match(verifier, /issue_knowledge_document_number/);
  assert.match(verifier, /knowledge_audit_events/);
  assert.match(health, /RequiredSchemaVersion = 28/);
  assert.match(seed, /Migration 015/);
  assert.match(seed, /highest_number > s\.last_number/);
});

test("Node backend keeps the per-route document upload and download limits", async () => {
  const [storage, inquiryAttachments, projectDocuments, app] = await Promise.all([
    readFile(new URL("backend-node/src/document-storage.ts", root), "utf8"),
    readFile(new URL("backend-node/src/routes/inquiry-attachments.ts", root), "utf8"),
    readFile(new URL("backend-node/src/routes/project-documents.ts", root), "utf8"),
    readFile(new URL("backend-node/src/app.ts", root), "utf8"),
  ]);

  // The C#-to-Node cutover kept the global 300/minute ceiling but dropped the
  // two narrower policies. These routes move whole files across the NAS link
  // and each download re-hashes the file to verify it, so the global ceiling is
  // far too generous for them.
  assert.match(app, /max: 300/);
  assert.match(storage, /DOCUMENT_UPLOAD_RATE_LIMIT = \{ max: 6, timeWindow: "1 minute" \}/);
  assert.match(storage, /DOCUMENT_DOWNLOAD_RATE_LIMIT = \{ max: 12, timeWindow: "1 minute" \}/);

  for (const [name, source] of [
    ["inquiry-attachments", inquiryAttachments],
    ["project-documents", projectDocuments],
  ]) {
    assert.match(source, /rateLimit: DOCUMENT_UPLOAD_RATE_LIMIT/, `${name} upload must carry the upload limit`);
    assert.match(source, /rateLimit: DOCUMENT_DOWNLOAD_RATE_LIMIT/, `${name} download must carry the download limit`);
  }
});

test("document signing keeps files immutable, marks append-only, and the seal accountable", async () => {
  const [migration, grants, deployment, core, routes, master, certificate, app, screens, shell] = await Promise.all([
    readFile(new URL("database/migrations/018_document_signing.sql", root), "utf8"),
    readFile(new URL("database/scripts/010_application_login.sql", root), "utf8"),
    readFile(new URL("database/scripts/020_deploy_fresh_database.sql", root), "utf8"),
    readFile(new URL("backend-node/src/signing-core.ts", root), "utf8"),
    readFile(new URL("backend-node/src/routes/signing.ts", root), "utf8"),
    readFile(new URL("backend-node/src/routes/signature-master.ts", root), "utf8"),
    readFile(new URL("backend-node/src/signing-certificate.ts", root), "utf8"),
    readFile(new URL("backend-node/src/app.ts", root), "utf8"),
    readFile(new URL("app/system/production/SigningScreens.tsx", root), "utf8"),
    readFile(new URL("app/system/ProductionApp.tsx", root), "utf8"),
  ]);

  assert.match(deployment, /018_document_signing\.sql/);

  // A signature points at one exact byte sequence, so the file row cannot change
  // and the marks, the output and the chain cannot be rewritten.
  for (const trigger of [
    "trg_document_files_immutable",
    "trg_signature_marks_append_only",
    "trg_signed_documents_append_only",
    "trg_sign_events_append_only",
  ]) {
    assert.ok(migration.includes(`CREATE OR ALTER TRIGGER dbo.${trigger}`), `${trigger} must exist`);
    assert.match(migration.slice(migration.indexOf(trigger)).slice(0, 400), /INSTEAD OF UPDATE, DELETE/,
      `${trigger} must refuse update and delete`);
  }

  // A frozen revision points at the stored bytes instead of copying them, so two
  // revisions may legitimately share a storage key. Uniqueness belongs to
  // (document, revision) and nowhere else on this table.
  assert.match(migration, /CONSTRAINT UQ_document_files_revision UNIQUE \(document_id, revision_label\)/);
  assert.doesNotMatch(migration, /UQ_document_files_storage_hash/);

  // The worst available failure is a mark that outlives the file it was placed on.
  assert.match(routes, /UPDATE dbo\.sign_steps SET state = N'VOIDED'/);
  assert.match(routes, /REQUEST_SUPERSEDED/);
  assert.match(routes, /unsigned steps voided; signed marks stay on the superseded file/);

  // A second signature only means something if a second person made it.
  assert.match(migration, /does not allow one person to fill two steps/);
  assert.match(migration, /requires the company stamp; a signature alone does not close it/);
  assert.match(migration, /An ordered signature flow requires earlier steps to close first/);
  assert.match(migration, /complete only when every mandatory step is signed/);

  // Admin configures the system; the business signs. Enforced twice.
  assert.match(migration, /trg_stamp_authorities_exclude_admin/);
  assert.match(migration, /The Admin role cannot hold company stamp authority/);
  assert.match(master, /admin_cannot_hold_stamp/);
  const adminGrant = migration.slice(migration.indexOf("SELECT N'Admin', code FROM dbo.permissions"), migration.indexOf("SELECT N'Admin', code FROM dbo.permissions") + 200);
  assert.match(adminGrant, /N'signing\.read', N'signing\.master'/);
  assert.doesNotMatch(adminGrant, /signing\.sign/);

  // Every stamp application names the person and the grant that permitted it.
  assert.match(migration, /CK_signature_marks_stamp/);
  assert.match(core, /resolveStampAuthority/);
  assert.match(routes, /stamp_authority_missing/);
  assert.match(routes, /STAMP_APPLIED/);

  // The mark is for the reader; the chain is for the audit. This application
  // holds no password, so assurance is a fresh interactive sign-in whose
  // evidence label is written into the chain rather than assumed.
  assert.match(core, /reauthentication_required/);
  assert.match(core, /entra-auth_time/);
  assert.match(core, /holds no password/);
  assert.doesNotMatch(core, /PasswordHash|verifyPassword/);
  assert.match(routes, /const assurance = evaluateSigningAssurance\(request\);/);
  assert.match(core, /chainHash/);
  assert.match(core, /verifyChain/);
  // datetimeoffset(0) drops milliseconds, so the hashed timestamp has to be the
  // one the column will actually hold or the chain fails its own check.
  assert.match(core, /truncateToSecond/);

  // A downloadable seal or specimen is a forgery kit: no route serves either,
  // and the only image route returns the caller's own specimen.
  assert.match(master, /There is deliberately no route that takes a user id/);
  assert.match(master, /Only PNG images are accepted/);
  assert.doesNotMatch(master, /company-stamps\/:stampId\/image".*get/i);

  // Signing is not approving, and the estimate is deliberately not signable.
  assert.match(migration, /Signing is not approving/);
  const classes = core.slice(core.indexOf("DOCUMENT_CLASSES = ["), core.indexOf("DOCUMENT_CLASSES = [") + 200);
  assert.doesNotMatch(classes, /"ESTIMATE"/);

  // The application role can append to the ledgers but never rewrite them.
  for (const table of ["document_files", "signature_marks", "signed_documents", "sign_events"]) {
    assert.ok(grants.includes(`GRANT INSERT ON OBJECT::dbo.${table} TO [iot_team_app_role];`),
      `${table} must be append-only for the application role`);
    assert.ok(!grants.includes(`GRANT INSERT, UPDATE ON OBJECT::dbo.${table} TO`), `${table} must not receive UPDATE`);
    assert.ok(!grants.includes(`GRANT DELETE ON OBJECT::dbo.${table} TO`), `${table} must not receive DELETE`);
  }

  // SQL Server refuses OUTPUT without INTO on a table carrying a trigger, and
  // four of these tables carry one.
  for (const source of [routes, master]) {
    for (const match of source.matchAll(/INSERT INTO dbo\.(document_files|sign_requests|signature_specimens|stamp_authorities)[\s\S]{0,400}?OUTPUT inserted\.id( INTO)?/g)) {
      assert.ok(match[2], `${match[1]} insert must capture OUTPUT INTO a table variable`);
    }
  }

  // Wiring and the surfaces the feature needs to exist at all.
  assert.match(app, /registerSigningRoutes/);
  assert.match(app, /registerSignatureMasterRoutes/);
  assert.match(shell, /ProductionSignInbox/);
  assert.match(shell, /ProductionSignedDocuments/);
  assert.match(shell, /ProductionCompanyStamps/);
  assert.match(shell, /ProductionMySignature/);
  assert.match(screens, /prepareSigningSession/);
  assert.match(screens, /attachPaperSignature/);
  assert.match(screens, /Return to owner/);
  assert.doesNotMatch(screens, /from ["'][^"']*\/(?:data|calc|store|matstore|session)["']/);

  // Loading a project, its stored files, and the assigned Design task are
  // separate requests. A transient API restart must not turn an endpoint
  // failure into a fake form field or leave the user without a retry action.
  const createModal = screens.slice(
    screens.indexOf("export function CreateSignableDocumentModal"),
    screens.indexOf("function FreezeRevisionModal"),
  );
  assert.match(createModal, /size="lg"/);
  assert.match(createModal, /className="form-grid two"/);
  for (const endpoint of ["projects", "attachments", "tasks"]) {
    assert.match(createModal, new RegExp(`${endpoint}\\.error \\? <LoadError[^>]+retry=\\{${endpoint}\\.reload\\}`));
  }
  assert.doesNotMatch(createModal, /<ActionError message=\{tasks\.error\}/);

  // The certificate states what it is and what it is not.
  assert.match(certificate, /not a certificate issued by one/);
  assert.match(certificate, /RDL-039/);
});

test("the verification code on a certificate resolves to a real, authenticated page", async () => {
  const [page, entry, routes, screens, shell] = await Promise.all([
    readFile(new URL("app/verify/page.tsx", root), "utf8"),
    readFile(new URL("app/system/VerifyEntry.tsx", root), "utf8"),
    readFile(new URL("backend-node/src/routes/signing.ts", root), "utf8"),
    readFile(new URL("app/system/production/SigningScreens.tsx", root), "utf8"),
    readFile(new URL("app/system/ProductionApp.tsx", root), "utf8"),
  ]);

  // The printed link and QR have to land somewhere that exists. The code goes in
  // the query string because that is what the page reads.
  assert.ok(routes.includes("verifyUrl: `${verifyBaseUrl}?code=${verifyCode}`"),
    "the certificate link must carry the code in the query string the page reads");
  assert.ok(page.includes('import("../system/VerifyEntry")'), "the verify route must load the entry component");
  assert.match(page, /ssr: false/);
  assert.match(entry, /searchParams|URLSearchParams/);

  // It renders the production workspace, so the visitor signs in first. v1 of
  // signing is internal-only (RDL-008) and external reachability is RDL-036.
  assert.match(entry, /ProductionApp/);
  assert.match(entry, /RDL-036/);
  assert.match(shell, /initialVerifyCode/);
  assert.match(screens, /initialVerifyCode/);
});

test("a signature specimen is every signed-in user own preference, by design", async () => {
  const [master, shell, sheet] = await Promise.all([
    readFile(new URL("backend-node/src/routes/signature-master.ts", root), "utf8"),
    readFile(new URL("app/system/ProductionApp.tsx", root), "utf8"),
    readFile(new URL("../../../../03. IoT Team Center/design/sheet5-document-signing.html", root), "utf8"),
  ]);

  // DSN-TC-005 s8 gives every role "Maintain own signature specimen: Yes", so
  // the three /me/signature routes check authentication and nothing else. This
  // is deliberate, not an oversight: a person own signature is theirs, and
  // gating it behind a permission would imply it is an organisational asset.
  assert.ok(sheet.includes('Maintain own signature specimen</td><td class="yes">Yes'),
    "DSN-TC-005 s8 gives every role its own specimen; change the sheet before changing the code");
  const meRoutes = master.slice(master.indexOf("/api/v1/me/signature"), master.indexOf("/api/v1/master/company-stamps"));
  assert.ok(!meRoutes.includes('demandPermission(request, "signing.'),
    "the specimen routes must not gain a signing permission without changing DSN-TC-005 s8");
  assert.ok(meRoutes.includes("users.required(request)"));

  // Which is why "My signature" sits in the user menu beside Permissions rather
  // than in the permission-filtered navigation.
  const navSource = shell.slice(shell.indexOf("const NAV"), shell.indexOf("const IS_AUTH_CONFIGURED"));
  assert.doesNotMatch(navSource, /My signature/);
  assert.ok(shell.includes('setView("signature")'));
});
