[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$reportRuntimeRoot = Join-Path $env:LOCALAPPDATA 'IoTTeamCenter\TeamTest'
$reportSettingsPath = Join-Path $reportRuntimeRoot 'settings.json'
if (!(Test-Path -LiteralPath $reportSettingsPath)) {
    throw 'Team Test runtime is not installed.'
}

$reportSettings = Get-Content -LiteralPath $reportSettingsPath -Raw | ConvertFrom-Json
if ($reportSettings.SqlServer -ne 'localhost' -or $reportSettings.DatabaseName -ne 'IoTTeamCenter_CodexTest_20260830_04') {
    throw 'This reviewed migration runner targets only the existing local Team Test database.'
}

$reportBackupSql = @'
SET NOCOUNT ON;
IF DB_NAME()<>N'IoTTeamCenter_CodexTest_20260830_04' THROW 51285,'Unexpected database.',1;
IF EXISTS(SELECT 1 FROM dbo.schema_versions WHERE version=25)
BEGIN SELECT N'Migration 025 is already installed.' status; RETURN; END;
IF NOT EXISTS(SELECT 1 FROM dbo.schema_versions WHERE version=24) THROW 51286,'Migration 024 is required.',1;
DECLARE @directory nvarchar(4000)=CAST(SERVERPROPERTY('InstanceDefaultBackupPath') AS nvarchar(4000));
IF @directory IS NULL THROW 51287,'SQL Server backup directory is unavailable.',1;
IF RIGHT(@directory,1)<>N'\' SET @directory=@directory+N'\';
DECLARE @path nvarchar(4000)=@directory+N'IoTTeamCenter_before_unified_reports_'+CONVERT(nvarchar(8),GETUTCDATE(),112)+N'_'+REPLACE(CONVERT(nvarchar(8),GETUTCDATE(),108),N':',N'')+N'.bak';
BACKUP DATABASE [IoTTeamCenter_CodexTest_20260830_04] TO DISK=@path WITH COPY_ONLY,CHECKSUM;
RESTORE VERIFYONLY FROM DISK=@path WITH CHECKSUM;
SELECT @path verified_backup;
'@

& sqlcmd -S localhost -E -C -I -b -d $reportSettings.DatabaseName -Q $reportBackupSql
if ($LASTEXITCODE -ne 0) { throw 'Backup or verification failed; migration was not applied.' }

$reportMigration = Join-Path (Split-Path $PSScriptRoot -Parent) 'database\migrations\025_reports.sql'
& sqlcmd -S localhost -E -C -I -b -d $reportSettings.DatabaseName -i $reportMigration
if ($LASTEXITCODE -ne 0) { throw 'Migration failed. Inspect the error before retrying.' }

$reportVerifySql = @'
SET NOCOUNT ON;
SELECT version,name FROM dbo.schema_versions WHERE version=25;
SELECT name FROM sys.tables WHERE name IN
 (N'unified_reports',N'unified_report_revisions',N'unified_report_signatures',N'unified_report_customer_links',N'unified_report_acknowledgments')
 ORDER BY name;
'@
& sqlcmd -S localhost -E -C -I -b -d $reportSettings.DatabaseName -Q $reportVerifySql
if ($LASTEXITCODE -ne 0) { throw 'Migration verification failed.' }
