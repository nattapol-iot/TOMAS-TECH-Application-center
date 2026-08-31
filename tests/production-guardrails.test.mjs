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
  }
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
  assert.match(lanFrontendProcess, /\\s\+dev\\s\+/);
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
  assert.match(grants, /GRANT EXECUTE ON OBJECT::dbo\.issue_document_number/i);
  assert.match(grants, /GRANT INSERT ON OBJECT::dbo\.estimate_revisions/i);
  assert.doesNotMatch(grants, /GRANT INSERT, UPDATE ON OBJECT::dbo\.estimate_revisions/i);
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
  assert.match(verifier, /schema_versions WHERE version = 5/);
  assert.match(verifier, /Schema-wide EXECUTE is forbidden/);
  assert.match(verifier, /Schema-wide SELECT is forbidden/);
  assert.match(verifier, /active production administrator/);
  assert.match(verifier, /TRY_CONVERT\(uniqueidentifier, entra_object_id\)/);
  assert.match(verifier, /sys\.server_role_members/);
  assert.match(verifier, /unexpected direct server permission/);
  assert.match(verifier, /unexpected direct database permission/);
  assert.match(verifier, /EXECUTE AS USER/);
  assert.match(verifier, /HAS_PERMS_BY_NAME\(N'dbo\.project_docs'/);
  assert.match(verifier, /required_material_permissions/);
  assert.match(verifier, /unexpected material-workflow write grant/);
  assert.match(verifier, /COLLATE DATABASE_DEFAULT/);
  assert.match(verifier, /trg_stock_txns_append_only/);
  assert.match(verifier, /trg_mat_audit_append_only/);
  assert.match(verifier, /baseline_verification/);
});

test("estimate revisions remain immutable and writes are record-scoped", async () => {
  const [workflow, costs, migration] = await Promise.all([
    readFile(new URL("backend/IoTTeamCenter.Api/Endpoints/EstimateEndpoints.cs", root), "utf8"),
    readFile(new URL("backend/IoTTeamCenter.Api/Endpoints/EstimateCostEndpoints.cs", root), "utf8"),
    readFile(new URL("database/migrations/005_revision_immutability.sql", root), "utf8"),
  ]);
  assert.match(workflow, /INSERT INTO dbo\.estimate_revisions/);
  assert.match(workflow, /CloneCurrentCostsAsync/);
  assert.match(workflow, /UPDATE dbo\.inquiries/);
  assert.match(workflow, /estimate_owner_required/);
  assert.match(costs, /estimate_section_forbidden/);
  assert.match(costs, /GetCategoryAssignmentAsync/);
  assert.match(costs, /"Updated", before, after/);
  assert.match(migration, /trg_estimate_revisions_append_only/);
  assert.match(migration, /Historical cost items cannot be changed/);
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
