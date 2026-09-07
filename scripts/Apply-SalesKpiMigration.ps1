[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$salesKpiRuntimeRoot = Join-Path $env:LOCALAPPDATA 'IoTTeamCenter\TeamTest'
$salesKpiSettings = Get-Content -LiteralPath (Join-Path $salesKpiRuntimeRoot 'settings.json') -Raw | ConvertFrom-Json
if ($salesKpiSettings.SqlServer -ne 'localhost' -or $salesKpiSettings.DatabaseName -ne 'IoTTeamCenter_CodexTest_20260830_04') {
    throw 'This migration runner targets only the existing local Team Test database.'
}
$salesKpiBackupSql = @'
SET NOCOUNT ON;
IF DB_NAME()<>N'IoTTeamCenter_CodexTest_20260830_04' THROW 51323,'Unexpected database.',1;
IF EXISTS(SELECT 1 FROM dbo.schema_versions WHERE version=29)
BEGIN SELECT N'Migration 029 is already installed.' status; RETURN; END;
IF NOT EXISTS(SELECT 1 FROM dbo.schema_versions WHERE version=28) THROW 51324,'Migration 028 is required.',1;
DECLARE @directory nvarchar(4000)=CAST(SERVERPROPERTY('InstanceDefaultBackupPath') AS nvarchar(4000));
IF @directory IS NULL THROW 51325,'SQL Server backup directory is unavailable.',1;
IF RIGHT(@directory,1)<>N'\' SET @directory=@directory+N'\';
DECLARE @path nvarchar(4000)=@directory+N'IoTTeamCenter_before_sales_kpi_'+CONVERT(nvarchar(8),GETUTCDATE(),112)+N'_'+REPLACE(CONVERT(nvarchar(8),GETUTCDATE(),108),N':',N'')+N'.bak';
BACKUP DATABASE [IoTTeamCenter_CodexTest_20260830_04] TO DISK=@path WITH COPY_ONLY,CHECKSUM;
RESTORE VERIFYONLY FROM DISK=@path WITH CHECKSUM;
SELECT @path verified_backup;
'@
& sqlcmd -S localhost -E -C -I -b -d $salesKpiSettings.DatabaseName -Q $salesKpiBackupSql
if ($LASTEXITCODE -ne 0) { throw 'Backup or verification failed; migration was not applied.' }
$salesKpiMigration = Join-Path (Split-Path $PSScriptRoot -Parent) 'database\migrations\029_sales_performance_reviews.sql'
& sqlcmd -S localhost -E -C -I -b -d $salesKpiSettings.DatabaseName -i $salesKpiMigration
if ($LASTEXITCODE -ne 0) { throw 'Migration failed. Inspect the error before retrying.' }
& sqlcmd -S localhost -E -C -I -b -d $salesKpiSettings.DatabaseName -Q 'SELECT version,name FROM dbo.schema_versions WHERE version IN (26,28,29) ORDER BY version;'
if ($LASTEXITCODE -ne 0) { throw 'Migration verification failed.' }
