[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$kpiRuntimeRoot = Join-Path $env:LOCALAPPDATA 'IoTTeamCenter\TeamTest'
$kpiSettings = Get-Content -LiteralPath (Join-Path $kpiRuntimeRoot 'settings.json') -Raw | ConvertFrom-Json
if ($kpiSettings.SqlServer -ne 'localhost' -or $kpiSettings.DatabaseName -ne 'IoTTeamCenter_CodexTest_20260830_04') {
    throw 'This migration runner targets only the existing local Team Test database.'
}
$kpiBackupSql = @'
SET NOCOUNT ON;
IF DB_NAME()<>N'IoTTeamCenter_CodexTest_20260830_04' THROW 51300,'Unexpected database.',1;
IF EXISTS(SELECT 1 FROM dbo.schema_versions WHERE version=26)
BEGIN SELECT N'Migration 026 is already installed.' status; RETURN; END;
IF NOT EXISTS(SELECT 1 FROM dbo.schema_versions WHERE version=25) THROW 51301,'Migration 025 is required.',1;
DECLARE @directory nvarchar(4000)=CAST(SERVERPROPERTY('InstanceDefaultBackupPath') AS nvarchar(4000));
IF @directory IS NULL THROW 51302,'SQL Server backup directory is unavailable.',1;
IF RIGHT(@directory,1)<>N'\' SET @directory=@directory+N'\';
DECLARE @path nvarchar(4000)=@directory+N'IoTTeamCenter_before_kpi_performance_'+CONVERT(nvarchar(8),GETUTCDATE(),112)+N'_'+REPLACE(CONVERT(nvarchar(8),GETUTCDATE(),108),N':',N'')+N'.bak';
BACKUP DATABASE [IoTTeamCenter_CodexTest_20260830_04] TO DISK=@path WITH COPY_ONLY,CHECKSUM;
RESTORE VERIFYONLY FROM DISK=@path WITH CHECKSUM;
SELECT @path verified_backup;
'@
& sqlcmd -S localhost -E -C -I -b -d $kpiSettings.DatabaseName -Q $kpiBackupSql
if ($LASTEXITCODE -ne 0) { throw 'Backup or verification failed; migration was not applied.' }
$kpiMigration = Join-Path (Split-Path $PSScriptRoot -Parent) 'database\migrations\026_performance_reviews.sql'
& sqlcmd -S localhost -E -C -I -b -d $kpiSettings.DatabaseName -i $kpiMigration
if ($LASTEXITCODE -ne 0) { throw 'Migration failed. Inspect the error before retrying.' }
& sqlcmd -S localhost -E -C -I -b -d $kpiSettings.DatabaseName -Q "IF NOT EXISTS(SELECT 1 FROM dbo.schema_versions WHERE version=26) THROW 51303,'KPI migration is missing.',1; SELECT version,name FROM dbo.schema_versions WHERE version IN (25,26,27) ORDER BY version; SELECT code,name,status FROM dbo.kpi_review_cycles ORDER BY period_end DESC;"
if ($LASTEXITCODE -ne 0) { throw 'Migration verification failed.' }
