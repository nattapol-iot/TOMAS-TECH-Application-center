[CmdletBinding()]
param()

# Migration 074 (flexible purchase requisition lines) and the PR API on a private LocalDB instance:
# schema 73 with legacy PRs and POs -> 074 applied twice -> backfill, keys and line-kind checks -> the PR flow through the
# real routes (substitute, unplanned, module budget, supplier choice, ERP order, a 1,000-line PR) -> a fresh deployment through 074.
# Nothing outside the generated instance is touched.

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$localDbCommand = (Get-Command SqlLocalDB.exe -ErrorAction Stop).Source
$sqlCommand = (Get-Command sqlcmd.exe -ErrorAction Stop).Source
$testSuffix = [Guid]::NewGuid().ToString('N')
$instanceName = 'IoTProcCI_' + $testSuffix.Substring(0, 16)
$serverName = '(localdb)\' + $instanceName
$upgradeDatabase = 'IoTTeamCenter_ProcCI_' + $testSuffix
$freshDatabase = 'IoTTeamCenter_ProcFreshCI_' + $testSuffix
$seed = Join-Path $repoRoot 'database/tests/procurement-074-seed.sql'
$fixture = Join-Path $repoRoot 'database/tests/procurement-074.sql'
$migration = Join-Path $repoRoot 'database/migrations/074_flexible_purchase_requisition_lines.sql'
$baselineFile = Join-Path ([IO.Path]::GetTempPath()) ('iot-procurement-baseline-' + $testSuffix + '.sql')
$instanceCreated = $false

function Invoke-TestSql {
    param([string[]]$SqlArguments)
    & $sqlCommand -S $serverName -E -C -I -b -f 65001 -l 20 @SqlArguments
    if ($LASTEXITCODE -ne 0) { throw "Isolated SQL check failed with exit code $LASTEXITCODE." }
}

Push-Location -LiteralPath $repoRoot
try {
    & $localDbCommand create $instanceName -s
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the private LocalDB instance.' }
    $instanceCreated = $true

    $baselineLines = @(':on error exit', ':r database/scripts/000_create_database.sql')
    $baselineMigrations = Get-ChildItem -LiteralPath (Join-Path $repoRoot 'database/migrations') -File |
        Where-Object { $_.Name -match '^\d{3}_[A-Za-z0-9_]+\.sql$' -and [int]$_.Name.Substring(0, 3) -le 73 } |
        Sort-Object Name
    foreach ($baselineMigration in $baselineMigrations) {
        $baselineLines += @('USE [$(DatabaseName)];', 'GO', (':r database/migrations/' + $baselineMigration.Name))
    }
    $baselineLines += @("IF (SELECT MAX(version) FROM dbo.schema_versions) <> 73 THROW 51999, 'Expected schema073 baseline.', 1;", 'GO')
    [IO.File]::WriteAllText($baselineFile, ($baselineLines -join "`n"), [Text.UTF8Encoding]::new($false))

    Write-Output 'Checking migration 073 -> 074 with legacy PRs and POs, and repeat application.'
    Invoke-TestSql -SqlArguments @('-i', $baselineFile, '-v', "DatabaseName=$upgradeDatabase")
    Invoke-TestSql -SqlArguments @('-d', $upgradeDatabase, '-i', $seed)
    Invoke-TestSql -SqlArguments @('-d', $upgradeDatabase, '-i', $migration)
    Invoke-TestSql -SqlArguments @('-d', $upgradeDatabase, '-i', $migration)
    Invoke-TestSql -SqlArguments @('-d', $upgradeDatabase, '-i', $fixture)

    Write-Output 'Checking the PR API on the upgraded database.'
    $env:PROCUREMENT_TEST_SERVER = $serverName
    $env:PROCUREMENT_TEST_DATABASE = $upgradeDatabase
    & node --import ./backend-node/node_modules/tsx/dist/loader.mjs backend-node/tests/procurement-integration.ts
    if ($LASTEXITCODE -ne 0) { throw 'Procurement API / SQL integration failed.' }

    $freshRunner = Get-Content -LiteralPath 'database/scripts/020_deploy_fresh_database.sql' -Raw
    if ($freshRunner -match '074_flexible_purchase_requisition_lines\.sql') {
        Write-Output 'Checking full fresh deployment through 074.'
        Invoke-TestSql -SqlArguments @('-i', 'database/scripts/020_deploy_fresh_database.sql', '-v', "DatabaseName=$freshDatabase")
        Invoke-TestSql -SqlArguments @('-d', $freshDatabase, '-Q', "IF COL_LENGTH(N'dbo.mat_pr_lines',N'line_type') IS NULL OR COLUMNPROPERTY(OBJECT_ID(N'dbo.mat_pr_lines'),N'supplier_id','AllowsNull')<>1 OR OBJECT_ID(N'dbo.CK_mat_pr_lines_line_type',N'C') IS NULL OR OBJECT_ID(N'dbo.FK_mat_po_lines_pr_line',N'F') IS NULL OR NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version=74) THROW 51999, 'Fresh deployment is missing the 074 columns, keys or version.', 1;")
    }
    else { Write-Output 'SKIP: 020_deploy_fresh_database.sql does not run 074 yet.' }
    Write-Output 'PASS: private LocalDB upgrade with legacy PRs, repeat application, backfill, keys, line kinds and the PR API.'
}
finally {
    Remove-Item Env:PROCUREMENT_TEST_SERVER -ErrorAction SilentlyContinue
    Remove-Item Env:PROCUREMENT_TEST_DATABASE -ErrorAction SilentlyContinue
    if ($instanceCreated) {
        foreach ($testDatabase in @($upgradeDatabase, $freshDatabase)) {
            if ($testDatabase -notmatch '^IoTTeamCenter_Proc(?:Fresh)?CI_[a-f0-9]{32}$' -or $instanceName -notmatch '^IoTProcCI_[a-f0-9]{16}$') {
                throw 'Refusing cleanup outside this generated test scope.'
            }
            Invoke-TestSql -SqlArguments @('-d', 'master', '-Q', "IF DB_ID(N'$testDatabase') IS NOT NULL BEGIN ALTER DATABASE [$testDatabase] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [$testDatabase]; END;")
        }
        & $localDbCommand stop $instanceName
        if ($LASTEXITCODE -ne 0) { throw "Could not stop owned test instance $instanceName." }
        & $localDbCommand delete $instanceName
        if ($LASTEXITCODE -ne 0) { throw "Could not remove owned test instance $instanceName." }
    }
    if (Test-Path -LiteralPath $baselineFile) { Remove-Item -LiteralPath $baselineFile }
    Pop-Location
}
