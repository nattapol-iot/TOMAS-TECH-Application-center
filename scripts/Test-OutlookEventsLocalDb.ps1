[CmdletBinding()]
param()

# Migration 089 (Outlook calendar events on the team board) on a private LocalDB instance:
# schema 88 -> 089 applied twice -> structure and insert checks, then a full fresh deployment
# through 089 and the same checks. Nothing outside the generated instance is touched.

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$localDbCommand = (Get-Command SqlLocalDB.exe -ErrorAction Stop).Source
$sqlCommand = (Get-Command sqlcmd.exe -ErrorAction Stop).Source
$testSuffix = [Guid]::NewGuid().ToString('N')
$instanceName = 'IoTOutlookCI_' + $testSuffix.Substring(0, 16)
$serverName = '(localdb)\' + $instanceName
$upgradeDatabase = 'IoTTeamCenter_OutlookUpgradeCI_' + $testSuffix
$freshDatabase = 'IoTTeamCenter_OutlookFreshCI_' + $testSuffix
$fixture = Join-Path $repoRoot 'database/tests/outlook-events-089.sql'
$migration = Join-Path $repoRoot 'database/migrations/089_outlook_calendar_events.sql'
$baselineFile = Join-Path ([IO.Path]::GetTempPath()) ('iot-outlook-baseline-' + $testSuffix + '.sql')
$instanceCreated = $false

function Invoke-TestSql {
    param([string[]]$SqlArguments)
    & $sqlCommand -S $serverName -E -C -I -b -l 15 @SqlArguments
    if ($LASTEXITCODE -ne 0) { throw "Isolated SQL check failed with exit code $LASTEXITCODE." }
}

Push-Location -LiteralPath $repoRoot
try {
    & $localDbCommand create $instanceName -s
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the private LocalDB instance.' }
    $instanceCreated = $true

    $baselineLines = @(':on error exit', ':r database/scripts/000_create_database.sql')
    $baselineMigrations = Get-ChildItem -LiteralPath (Join-Path $repoRoot 'database/migrations') -File |
        Where-Object { $_.Name -match '^\d{3}_[A-Za-z0-9_]+\.sql$' -and [int]$_.Name.Substring(0, 3) -le 88 } |
        Sort-Object Name
    foreach ($baselineMigration in $baselineMigrations) {
        $baselineLines += @('USE [$(DatabaseName)];', 'GO', (':r database/migrations/' + $baselineMigration.Name))
    }
    $baselineLines += @("IF (SELECT MAX(version) FROM dbo.schema_versions) <> 88 THROW 51999, 'Expected schema088 baseline.', 1;", 'GO')
    [IO.File]::WriteAllText($baselineFile, ($baselineLines -join "`n"), [Text.UTF8Encoding]::new($false))

    Write-Output 'Checking migration 088 -> 089 and repeat application.'
    Invoke-TestSql -SqlArguments @('-i', $baselineFile, '-v', "DatabaseName=$upgradeDatabase")
    Invoke-TestSql -SqlArguments @('-d', $upgradeDatabase, '-i', $migration)
    Invoke-TestSql -SqlArguments @('-d', $upgradeDatabase, '-i', $migration)
    Invoke-TestSql -SqlArguments @('-d', $upgradeDatabase, '-i', $fixture)

    Write-Output 'Checking full fresh deployment through 089.'
    Invoke-TestSql -SqlArguments @('-i', 'database/scripts/020_deploy_fresh_database.sql', '-v', "DatabaseName=$freshDatabase")
    Invoke-TestSql -SqlArguments @('-d', $freshDatabase, '-i', $fixture)
    Write-Output 'PASS: private LocalDB upgrade, repeat application, structure, an Outlook event and fresh deployment.'
}
finally {
    if ($instanceCreated) {
        foreach ($testDatabase in @($upgradeDatabase, $freshDatabase)) {
            if ($testDatabase -notmatch '^IoTTeamCenter_Outlook(?:Upgrade|Fresh)CI_[a-f0-9]{32}$' -or
                $instanceName -notmatch '^IoTOutlookCI_[a-f0-9]{16}$') {
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
