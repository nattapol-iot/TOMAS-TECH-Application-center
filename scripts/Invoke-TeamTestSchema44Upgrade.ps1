[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
param(
    [switch] $SkipBackup,
    [switch] $AllowUntrustedTeamTestCertificate,
    [string] $ConfirmDatabase,
    [System.Management.Automation.PSCredential] $DbaCredential
)
$ErrorActionPreference = 'Stop'
$databaseName = 'IoTTeamCenterTeamTest'
$migrationPath = Join-Path $PSScriptRoot '../database/migrations/044_estimate_labor_masters.sql'
if (!(Test-Path -LiteralPath $migrationPath)) { throw 'Migration 044 is missing.' }
if ($WhatIfPreference) {
    Write-Output 'What if: verify Team Test schema 43, apply only migration 044 transactionally, verify schema 44 and labor tables. Target 202.151.188.68 / IoTTeamCenterTeamTest. No connection opened.'
    return
}
if (!$SkipBackup -or !$AllowUntrustedTeamTestCertificate -or $ConfirmDatabase -cne $databaseName) {
    throw 'Requires explicit -SkipBackup, -AllowUntrustedTeamTestCertificate and -ConfirmDatabase IoTTeamCenterTeamTest.'
}
if ($env:Database__RunMigrations -eq 'true') { throw 'Automatic API migration must remain disabled.' }
if (!$DbaCredential) {
    $loginName = Read-Host 'DBA Username'
    $loginPassword = Read-Host 'DBA Password' -AsSecureString
    $DbaCredential = [pscredential]::new($loginName, $loginPassword)
}
$builder = [System.Data.SqlClient.SqlConnectionStringBuilder]::new()
$builder['Data Source'] = '202.151.188.68'
$builder['Initial Catalog'] = $databaseName
$builder['Encrypt'] = $true
$builder['TrustServerCertificate'] = $true
$builder['Integrated Security'] = $false
$builder['Connect Timeout'] = 20
$password = $DbaCredential.Password.Copy()
$password.MakeReadOnly()
$credential = [System.Data.SqlClient.SqlCredential]::new($DbaCredential.UserName, $password)
$connection = [System.Data.SqlClient.SqlConnection]::new($builder.ConnectionString, $credential)
function Invoke-Scalar([string] $Sql) {
    $command = $connection.CreateCommand()
    try { $command.CommandText = $Sql; $command.CommandTimeout = 60; return $command.ExecuteScalar() }
    finally { $command.Dispose() }
}
try {
    $connection.Open()
    if ((Invoke-Scalar 'SELECT DB_NAME();') -cne $databaseName) { throw 'Database identity mismatch.' }
    $preflight = @'
SELECT CASE WHEN
 (SELECT COUNT(*) FROM dbo.schema_versions) = 43
 AND (SELECT MIN(version) FROM dbo.schema_versions) = 1
 AND (SELECT MAX(version) FROM dbo.schema_versions) = 43
 AND (SELECT COUNT(DISTINCT version) FROM dbo.schema_versions) = 43
 AND EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version=43 AND name=N'Revision-scoped Estimate ERP cost classifications')
 AND DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL
 AND HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'CONTROL') = 1
 THEN 1 ELSE 0 END;
'@
    if ([int](Invoke-Scalar $preflight) -ne 1) { throw 'Preflight requires contiguous schema 1-43, correct 043 identity, application role, and DBA database CONTROL permission.' }
    Write-Output 'Preflight passed: schema 43. Backup skipped by explicit user request.'
    if (!$PSCmdlet.ShouldProcess('202.151.188.68 / IoTTeamCenterTeamTest', 'Apply migration 044 without backup')) { return }
    $migrationSql = Get-Content -LiteralPath $migrationPath -Raw
    foreach ($batch in [regex]::Split($migrationSql, '(?im)^\s*GO\s*(?:--[^\r\n]*)?\s*$')) {
        if (!$batch.Trim()) { continue }
        $command = $connection.CreateCommand()
        try { $command.CommandText = $batch; $command.CommandTimeout = 600; [void]$command.ExecuteNonQuery() }
        finally { $command.Dispose() }
    }
    $verification = @'
SELECT CASE WHEN
 (SELECT COUNT(*) FROM dbo.schema_versions)=44
 AND (SELECT MAX(version) FROM dbo.schema_versions)=44
 AND EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version=44 AND name=N'Reusable labor rate masters and estimate labor packages')
 AND OBJECT_ID(N'dbo.labor_packages', N'U') IS NOT NULL
 AND OBJECT_ID(N'dbo.labor_package_lines', N'U') IS NOT NULL
 AND COL_LENGTH(N'dbo.engineering_rates', N'role_activity') IS NOT NULL
 THEN 1 ELSE 0 END;
'@
    if ([int](Invoke-Scalar $verification) -ne 1) { throw 'Post-migration verification failed; inspect database before retrying.' }
    Write-Output 'SUCCESS: IoTTeamCenterTeamTest verified at schema 44. Automatic API migration remains disabled.'
}
catch {
    if ($connection.State -eq 'Open') {
        try { [void](Invoke-Scalar 'IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;') } catch { }
    }
    throw
}
finally { $connection.Dispose(); $password.Dispose(); $credential = $null; $DbaCredential = $null }
