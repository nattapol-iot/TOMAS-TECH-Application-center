[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$localDbCommand = (Get-Command SqlLocalDB.exe -ErrorAction Stop).Source
$sqlCommand = (Get-Command sqlcmd.exe -ErrorAction Stop).Source
$testSuffix = [Guid]::NewGuid().ToString('N')
$instanceName = 'IoTCostCI_' + $testSuffix.Substring(0, 16)
$serverName = '(localdb)\' + $instanceName
$upgradeDatabase = 'IoTTeamCenter_CostUpgradeCI_' + $testSuffix
$freshDatabase = 'IoTTeamCenter_CostFreshCI_' + $testSuffix
$preflightDatabase = 'IoTTeamCenter_CostPreflightCI_' + $testSuffix
$fixture = Join-Path $repoRoot 'database/tests/estimate-total-boundaries.sql'
$invalidFixture = Join-Path $repoRoot 'database/tests/estimate-total-invalid-baseline.sql'
$migration = Join-Path $repoRoot 'database/migrations/042_estimate_total_guard.sql'
$baselineFile = Join-Path ([IO.Path]::GetTempPath()) ('iot-cost-baseline-' + $testSuffix + '.sql')
$instanceCreated = $false

function Invoke-TestSql {
    param([string[]]$SqlArguments)
    & $sqlCommand -S $serverName -E -C -I -b -l 15 @SqlArguments
    if ($LASTEXITCODE -ne 0) { throw "Isolated SQL check failed with exit code $LASTEXITCODE." }
}

if (-not (Test-Path -LiteralPath $fixture) -or -not (Test-Path -LiteralPath $invalidFixture) -or -not (Test-Path -LiteralPath $migration)) {
    throw 'Migration042 and its boundary fixture must exist before this check runs.'
}

Push-Location -LiteralPath $repoRoot
try {
    # A random, newly created instance is the only target. Existing company SQL
    # instances, SQL logins, services and databases are never selected.
    & $localDbCommand create $instanceName -s
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the private LocalDB instance.' }
    $instanceCreated = $true

    # Generate the historical baseline separately: the current fresh runner
    # intentionally requires042 in its final readiness assertions.
    $baselineLines = @(':on error exit', ':r database/scripts/000_create_database.sql')
    $baselineMigrations = Get-ChildItem -LiteralPath (Join-Path $repoRoot 'database/migrations') -File |
        Where-Object { $_.Name -match '^\d{3}_[A-Za-z0-9_]+\.sql$' -and [int]$_.Name.Substring(0, 3) -le 41 } |
        Sort-Object Name
    foreach ($baselineMigration in $baselineMigrations) {
        $baselineLines += @('USE [$(DatabaseName)];', 'GO', (':r database/migrations/' + $baselineMigration.Name))
    }
    $baselineLines += @("IF (SELECT MAX(version) FROM dbo.schema_versions) <> 41 THROW 51999, 'Expected schema041 baseline.', 1;", 'GO')
    [IO.File]::WriteAllText($baselineFile, ($baselineLines -join "`n"), [Text.UTF8Encoding]::new($false))

    Write-Output 'Checking migration041 -> 042 upgrade and repeat application.'
    Invoke-TestSql -SqlArguments @('-i', $baselineFile, '-v', "DatabaseName=$upgradeDatabase")
    Invoke-TestSql -SqlArguments @('-d', $upgradeDatabase, '-i', $migration)
    Invoke-TestSql -SqlArguments @('-d', $upgradeDatabase, '-i', $migration)
    Invoke-TestSql -SqlArguments @('-d', $upgradeDatabase, '-i', $fixture)

    Write-Output 'Checking full fresh deployment and cost boundaries.'
    Invoke-TestSql -SqlArguments @('-i', 'database/scripts/020_deploy_fresh_database.sql', '-v', "DatabaseName=$freshDatabase")
    Invoke-TestSql -SqlArguments @('-d', $freshDatabase, '-i', $fixture)

    Write-Output 'Checking atomic refusal of a pre-existing invalid aggregate.'
    Invoke-TestSql -SqlArguments @('-i', $baselineFile, '-v', "DatabaseName=$preflightDatabase")
    Invoke-TestSql -SqlArguments @('-d', $preflightDatabase, '-i', $invalidFixture)
    $preflightOutput = & $sqlCommand -S $serverName -E -C -I -b -l 15 -d $preflightDatabase -i $migration
    $preflightExit = $LASTEXITCODE
    if ($preflightExit -eq 0 -or ($preflightOutput -join "`n") -notmatch 'Msg 51420\b') {
        throw ('Expected migration preflight overflow51420; received: ' + ($preflightOutput -join "`n"))
    }
    Invoke-TestSql -SqlArguments @('-d', $preflightDatabase, '-Q', "IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version=42) OR OBJECT_ID(N'dbo.assert_estimate_totals',N'P') IS NOT NULL THROW 51999, 'Failed migration left schema changes behind.', 1; IF (SELECT COUNT(*) FROM dbo.cost_items WHERE item_code IN (N'TB-PREFLIGHT-1',N'TB-PREFLIGHT-2'))<>2 THROW 51999, 'Preflight changed existing fixture data.', 1;")
    Write-Output 'PASS: private LocalDB upgrade, repeat application, fresh deployment, boundaries and atomic preflight refusal.'
}
finally {
    if ($instanceCreated) {
        foreach ($testDatabase in @($upgradeDatabase, $freshDatabase, $preflightDatabase)) {
            if ($testDatabase -notmatch '^IoTTeamCenter_Cost(?:Upgrade|Fresh|Preflight)CI_[a-f0-9]{32}$' -or
                $instanceName -notmatch '^IoTCostCI_[a-f0-9]{16}$') {
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
