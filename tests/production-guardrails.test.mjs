import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
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

test("mock route, seed dataset, and demo-only dependency closure are absent", async () => {
  for (const path of [
    "app/demo/page.tsx",
    "app/system/App.tsx",
    "app/system/data.ts",
    "app/system/calc.ts",
    "app/system/store.ts",
    "app/system/matstore.ts",
    "app/system/session.ts",
    "app/system/routes.ts",
    "app/system/screens/Admin.tsx",
    "app/system/screens/Bom.tsx",
    "app/system/screens/Dashboard.tsx",
    "app/system/screens/EstimateList.tsx",
    "app/system/screens/Inquiry.tsx",
    "app/system/screens/Inventory.tsx",
    "app/system/screens/Issue.tsx",
    "app/system/screens/MatApprovals.tsx",
    "app/system/screens/MatDashboard.tsx",
    "app/system/screens/MyWork.tsx",
    "app/system/screens/Price.tsx",
    "app/system/screens/PriceSearch.tsx",
    "app/system/screens/Project.tsx",
    "app/system/screens/Receiving.tsx",
    "app/system/screens/Requisition.tsx",
    "app/system/screens/Resource.tsx",
    "app/system/screens/Schedule.tsx",
    "app/system/screens/Workspace.tsx",
    "lib/export-xlsx.ts",
  ]) {
    await assert.rejects(access(new URL(path, root)), `${path} must stay removed`);
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
  assert.doesNotMatch(grants, /GRANT INSERT, UPDATE ON OBJECT::dbo\.boms/i);
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
  assert.match(grants, /REVOKE UPDATE ON OBJECT::dbo\.project_docs/i);
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
