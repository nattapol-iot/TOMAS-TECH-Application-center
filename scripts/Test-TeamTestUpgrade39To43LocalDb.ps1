<#
.SYNOPSIS
    Rehearses the Team Test schema 39 -> 40 -> 41 -> 42 -> 43 upgrade in isolation.

.DESCRIPTION
    Creates a randomly named private LocalDB instance and two disposable databases,
    builds a through-39 baseline from the repository migrations, then applies 040,
    041, 042 and 043 in order and verifies the result.

    Nothing outside the generated instance is touched: no company SQL instance, no
    existing database, no SQL login, no service and no remote server. Both databases
    and the instance itself are removed in the finally block.

.NOTES
    Proven here, in one run:
      * 040 -> 041 -> 042 -> 043 apply cleanly on a through-39 database.
      * The upgraded database matches database/tests/schema-39-to-42-upgrade.sql.
      * Repeating 040 and 043 fails with their documented errors; repeating 041 and 042 is safe.
      * An Estimate whose aggregate overflows decimal(19,4) aborts 042 with 51420
        and leaves neither schema version 42 nor dbo.assert_estimate_totals behind.
#>
[CmdletBinding()]
param(
    # Valid estimates seeded before migration 042 so its measured duration reflects
    # a real per-estimate cost rather than an empty cursor.
    [ValidateRange(0, 100000)][int] $EstimateCount = 50
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$localDbCommand = (Get-Command SqlLocalDB.exe -ErrorAction Stop).Source
$sqlCommand = (Get-Command sqlcmd.exe -ErrorAction Stop).Source

$testSuffix = [Guid]::NewGuid().ToString('N')
$instanceName = 'IoTUpg3942CI_' + $testSuffix.Substring(0, 16)
$serverName = '(localdb)\' + $instanceName
$upgradeDatabase = 'IoTTeamCenter_Upgrade3942CI_' + $testSuffix
$blockerDatabase = 'IoTTeamCenter_Blocker3942CI_' + $testSuffix
$baselineFile = Join-Path ([IO.Path]::GetTempPath()) ('iot-schema39-baseline-' + $testSuffix + '.sql')
$instanceCreated = $false

$migrationDirectory = Join-Path $repoRoot 'database/migrations'
$migration040 = Join-Path $migrationDirectory '040_estimate_overhead_policy.sql'
$migration041 = Join-Path $migrationDirectory '041_user_role_management.sql'
$migration042 = Join-Path $migrationDirectory '042_estimate_total_guard.sql'
$migration043 = Join-Path $migrationDirectory '043_estimate_erp_cost_mapping.sql'
$upgradeFixture = Join-Path $repoRoot 'database/tests/schema-39-to-42-upgrade.sql'
$blockerFixture = Join-Path $repoRoot 'database/tests/schema-39-to-42-preflight-blockers.sql'

foreach ($required in @($migration040, $migration041, $migration042, $migration043, $upgradeFixture, $blockerFixture)) {
    if (!(Test-Path -LiteralPath $required)) { throw "Required file is missing: $required" }
}

function Invoke-TestSql {
    param([string[]] $SqlArguments)
    & $sqlCommand -S $serverName -E -C -I -b -l 30 @SqlArguments
    if ($LASTEXITCODE -ne 0) { throw "Isolated SQL check failed with exit code $LASTEXITCODE." }
}

function Invoke-ExpectedFailure {
    param([string[]] $SqlArguments, [string] $ExpectedMessageNumber, [string] $Because)
    $output = & $sqlCommand -S $serverName -E -C -I -b -l 30 @SqlArguments 2>&1
    $exitCode = $LASTEXITCODE
    $text = ($output | Out-String)
    if ($exitCode -eq 0 -or $text -notmatch ('Msg ' + $ExpectedMessageNumber + '\b')) {
        throw ("Expected " + $Because + " to fail with Msg " + $ExpectedMessageNumber + "; received exit code " + $exitCode + ": " + $text)
    }
    return $text
}

function Assert-SchemaIdentity {
    param([string] $Database, [int] $Version, [string] $Name)
    $escapedName = $Name.Replace("'", "''")
    Invoke-TestSql -SqlArguments @('-d', $Database, '-Q', "IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version=$Version AND name=N'$escapedName') THROW 51999, 'Schema version $Version identity is missing after its migration.', 1; IF (SELECT MAX(version) FROM dbo.schema_versions)<>$Version THROW 51999, 'Unexpected maximum schema version after migration $Version.', 1;")
}

Push-Location -LiteralPath $repoRoot
try {
    # A random, newly created instance is the only target. Existing company SQL
    # instances, SQL logins, services and databases are never selected.
    & $localDbCommand create $instanceName -s
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the private LocalDB instance.' }
    $instanceCreated = $true

    # ---- Through-39 baseline ---------------------------------------------------------
    $baselineLines = @(':on error exit', ':r database/scripts/000_create_database.sql')
    $baselineMigrations = Get-ChildItem -LiteralPath $migrationDirectory -File |
        Where-Object { $_.Name -match '^\d{3}_[A-Za-z0-9_]+\.sql$' -and [int]$_.Name.Substring(0, 3) -le 39 } |
        Sort-Object Name
    if ($baselineMigrations.Count -ne 39) {
        throw "Expected 39 baseline migrations; found $($baselineMigrations.Count)."
    }
    foreach ($baselineMigration in $baselineMigrations) {
        $baselineLines += @('USE [$(DatabaseName)];', 'GO', (':r database/migrations/' + $baselineMigration.Name))
    }
    $baselineLines += @(
        "IF (SELECT MAX(version) FROM dbo.schema_versions) <> 39 THROW 51999, 'Expected a schema039 baseline.', 1;",
        "IF (SELECT COUNT(*) FROM dbo.schema_versions) <> 39 THROW 51999, 'Expected a contiguous 1-39 baseline.', 1;",
        # 010_application_login.sql owns the real role; the rehearsal creates it so the
        # conditional grants inside 040/041/042 are actually exercised.
        "IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NULL CREATE ROLE [iot_team_app_role];",
        'GO'
    )
    [IO.File]::WriteAllText($baselineFile, ($baselineLines -join "`n"), [Text.UTF8Encoding]::new($false))

    Write-Output "Building a through-39 baseline in $upgradeDatabase."
    Invoke-TestSql -SqlArguments @('-i', $baselineFile, '-v', "DatabaseName=$upgradeDatabase")

    # ---- Representative workload ------------------------------------------------------
    if ($EstimateCount -gt 0) {
        Write-Output "Seeding $EstimateCount valid live estimates before migration 042."
        $seedSql = @"
SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;
DECLARE @admin_role bigint=(SELECT id FROM dbo.roles WHERE code=N'Admin');
IF @admin_role IS NULL THROW 51999, 'Seed requires the seeded Admin role.', 1;
INSERT dbo.users(entra_object_id,email,name,role_id,department)
VALUES(N'schema-3942-seed-admin',N'schema-3942-seed@test.invalid',N'TEST ONLY Schema 39-42 Seed Admin',@admin_role,N'Engineering');
DECLARE @admin bigint=SCOPE_IDENTITY();
INSERT dbo.customers(code,name,created_by,updated_by) VALUES(N'SCHEMA-3942-SEED',N'TEST ONLY schema 39-42 seed customer',@admin,@admin);
DECLARE @customer bigint=SCOPE_IDENTITY();
WITH numbers AS (SELECT TOP ($EstimateCount) ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS n FROM sys.all_objects)
INSERT dbo.inquiries(inquiry_no,inquiry_date,customer_id,project_name,project_type,estimate_owner_id,due_date,priority,status,created_by,updated_by)
SELECT N'SC3942-'+RIGHT(N'00000'+CONVERT(nvarchar(10),n),5),CONVERT(date,'20990101'),@customer,N'TEST ONLY seed '+CONVERT(nvarchar(10),n),N'IoT',@admin,CONVERT(date,'20990102'),N'Normal',N'Estimating',@admin,@admin
FROM numbers;
INSERT dbo.estimates(estimate_no,inquiry_id,customer_id,project_name,project_type,owner_id,created_date,due_date,status,contingency_rate,created_by,updated_by)
SELECT inquiry.inquiry_no,inquiry.id,@customer,inquiry.project_name,N'IoT',@admin,CONVERT(date,'20990101'),CONVERT(date,'20990102'),N'Draft',10,@admin,@admin
FROM dbo.inquiries inquiry WHERE inquiry.inquiry_no LIKE N'SC3942-%';
INSERT dbo.cost_items(estimate_id,revision,category_code,category,subcategory,module,item_code,description,brand,model,unit,qty,unit_cost,price_source,owner_id,status,created_by,updated_by)
SELECT estimate.id,0,'01',N'Hardware',N'',N'TEST',N'SEED-'+estimate.estimate_no,N'TEST ONLY seeded line',N'',N'',N'Lot',2,1500.5000,N'Test',@admin,N'Draft',@admin,@admin
FROM dbo.estimates estimate WHERE estimate.estimate_no LIKE N'SC3942-%';
INSERT dbo.manhour_lines(estimate_id,revision,package,activity,department,level,cost_type,provider,engineers,man_days,hours_per_day,daily_rate,owner_id,created_by,updated_by)
SELECT estimate.id,0,N'TEST',N'Seeded effort',N'Engineering',N'Engineer',N'Engineering',N'Internal',1,3,8,4000,@admin,@admin,@admin
FROM dbo.estimates estimate WHERE estimate.estimate_no LIKE N'SC3942-%';
IF (SELECT COUNT(*) FROM dbo.estimates WHERE deleted_at IS NULL) <> $EstimateCount
    THROW 51999, 'Seed did not produce the requested number of live estimates.', 1;
COMMIT TRANSACTION;
"@
        Invoke-TestSql -SqlArguments @('-d', $upgradeDatabase, '-Q', $seedSql)
    }

    # ---- 040 -> 041 -> 042 -> 043 -----------------------------------------------------
    Write-Output 'Applying migration 040.'
    Invoke-TestSql -SqlArguments @('-d', $upgradeDatabase, '-i', $migration040)
    Assert-SchemaIdentity $upgradeDatabase 40 'Immutable overhead policies and estimate revision snapshots'

    Write-Output 'Applying migration 041.'
    Invoke-TestSql -SqlArguments @('-d', $upgradeDatabase, '-i', $migration041)
    Assert-SchemaIdentity $upgradeDatabase 41 'Admin-managed primary user roles with audited least-privilege writes'

    Write-Output 'Applying migration 042.'
    $stopwatch = [Diagnostics.Stopwatch]::StartNew()
    Invoke-TestSql -SqlArguments @('-d', $upgradeDatabase, '-i', $migration042)
    $stopwatch.Stop()
    $migration042Duration = $stopwatch.Elapsed
    Assert-SchemaIdentity $upgradeDatabase 42 'Guard estimate aggregates within supported decimal precision'

    Write-Output 'Verifying the schema 42 database.'
    Invoke-TestSql -SqlArguments @('-d', $upgradeDatabase, '-i', $upgradeFixture)

    Write-Output 'Applying migration 043.'
    Invoke-TestSql -SqlArguments @('-d', $upgradeDatabase, '-i', $migration043)
    Assert-SchemaIdentity $upgradeDatabase 43 'Revision-scoped Estimate ERP cost classifications'
    Invoke-TestSql -SqlArguments @('-d', $upgradeDatabase, '-Q', "IF OBJECT_ID(N'dbo.estimate_erp_mappings',N'U') IS NULL THROW 51999, 'ERP mapping table is missing.', 1; IF OBJECT_ID(N'dbo.trg_estimate_erp_mappings_current_revision_only',N'TR') IS NULL THROW 51999, 'ERP mapping trigger is missing.', 1; IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.estimate_erp_mappings') AND name=N'UX_estimate_erp_mappings_line' AND is_unique=1) THROW 51999, 'ERP line mapping unique index is missing.', 1; IF NOT EXISTS (SELECT 1 FROM sys.database_permissions permission INNER JOIN sys.database_principals principal ON principal.principal_id=permission.grantee_principal_id WHERE principal.name=N'iot_team_app_role' AND permission.major_id=OBJECT_ID(N'dbo.estimate_erp_mappings') AND permission.permission_name=N'DELETE' AND permission.state=N'D') THROW 51999, 'ERP mapping DELETE denial is missing.', 1;")

    # ---- Repeat-application behaviour --------------------------------------------------
    Write-Output 'Checking repeat application of 040, 041, 042 and 043.'
    [void](Invoke-ExpectedFailure -SqlArguments @('-d', $upgradeDatabase, '-i', $migration040) -ExpectedMessageNumber '51401' -Because 'a repeat of migration 040')
    Invoke-TestSql -SqlArguments @('-d', $upgradeDatabase, '-i', $migration041)
    Invoke-TestSql -SqlArguments @('-d', $upgradeDatabase, '-i', $migration042)
    [void](Invoke-ExpectedFailure -SqlArguments @('-d', $upgradeDatabase, '-i', $migration043) -ExpectedMessageNumber '51431' -Because 'a repeat of migration 043')
    Invoke-TestSql -SqlArguments @('-d', $upgradeDatabase, '-Q', "IF (SELECT COUNT(*) FROM dbo.schema_versions)<>43 OR (SELECT MAX(version) FROM dbo.schema_versions)<>43 THROW 51999, 'Repeat application changed the schema history.', 1; IF OBJECT_ID(N'dbo.assert_estimate_totals',N'P') IS NULL THROW 51999, 'Repeat application removed the aggregate guard.', 1; IF OBJECT_ID(N'dbo.estimate_erp_mappings',N'U') IS NULL THROW 51999, 'Repeat application removed ERP mappings.', 1;")

    # ---- Negative control: an overflowing Estimate must abort 042 ----------------------
    Write-Output "Building a through-41 database with an overflowing Estimate in $blockerDatabase."
    Invoke-TestSql -SqlArguments @('-i', $baselineFile, '-v', "DatabaseName=$blockerDatabase")
    Invoke-TestSql -SqlArguments @('-d', $blockerDatabase, '-i', $migration040)
    Invoke-TestSql -SqlArguments @('-d', $blockerDatabase, '-i', $migration041)
    Invoke-TestSql -SqlArguments @('-d', $blockerDatabase, '-i', $blockerFixture)

    [void](Invoke-ExpectedFailure -SqlArguments @('-d', $blockerDatabase, '-i', $migration042) -ExpectedMessageNumber '51420' -Because 'migration 042 against an overflowing Estimate')
    Invoke-TestSql -SqlArguments @('-d', $blockerDatabase, '-Q', "IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version=42) THROW 51999, 'A failed migration 042 still recorded schema version 42.', 1; IF OBJECT_ID(N'dbo.assert_estimate_totals',N'P') IS NOT NULL THROW 51999, 'A failed migration 042 left its procedure behind.', 1; IF (SELECT MAX(version) FROM dbo.schema_versions)<>41 THROW 51999, 'A failed migration 042 changed the schema history.', 1; IF (SELECT COUNT(*) FROM dbo.cost_items WHERE item_code IN (N'SC3942-BLOCK-1',N'SC3942-BLOCK-2'))<>2 THROW 51999, 'A failed migration 042 changed existing fixture data.', 1;")

    Write-Output ''
    Write-Output 'PASS: private LocalDB 39->40->41->42->43 upgrade, object/permission verification, repeat-application behaviour and overflow refusal.'
    Write-Output ("Migration 042 duration: {0:N3} seconds over {1} live estimate(s)." -f $migration042Duration.TotalSeconds, $EstimateCount)
    if ($EstimateCount -gt 0) {
        Write-Output ("Migration 042 per-estimate cost: {0:N3} ms." -f ($migration042Duration.TotalMilliseconds / $EstimateCount))
    }
}
finally {
    if ($instanceCreated) {
        foreach ($testDatabase in @($upgradeDatabase, $blockerDatabase)) {
            if ($testDatabase -notmatch '^IoTTeamCenter_(?:Upgrade|Blocker)3942CI_[a-f0-9]{32}$' -or
                $instanceName -notmatch '^IoTUpg3942CI_[a-f0-9]{16}$') {
                throw 'Refusing cleanup outside this generated test scope.'
            }
            Invoke-TestSql -SqlArguments @('-d', 'master', '-Q', "IF DB_ID(N'$testDatabase') IS NOT NULL BEGIN ALTER DATABASE [$testDatabase] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [$testDatabase]; END;")
        }
        Invoke-TestSql -SqlArguments @('-d', 'master', '-Q', "IF EXISTS (SELECT 1 FROM sys.databases WHERE name LIKE N'IoTTeamCenter_%3942CI[_]%') THROW 51999, 'A rehearsal database survived cleanup.', 1;")
        & $localDbCommand stop $instanceName
        if ($LASTEXITCODE -ne 0) { throw "Could not stop owned test instance $instanceName." }
        & $localDbCommand delete $instanceName
        if ($LASTEXITCODE -ne 0) { throw "Could not remove owned test instance $instanceName." }
        Write-Output "Removed disposable databases and LocalDB instance $instanceName."
    }
    if (Test-Path -LiteralPath $baselineFile) { Remove-Item -LiteralPath $baselineFile }
    Pop-Location
}
