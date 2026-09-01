[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$templateRuntimeRoot = Join-Path $env:LOCALAPPDATA 'IoTTeamCenter\TeamTest'
$templateSettings = Get-Content -LiteralPath (Join-Path $templateRuntimeRoot 'settings.json') -Raw | ConvertFrom-Json
if ($templateSettings.SqlServer -ne 'localhost' -or $templateSettings.DatabaseName -ne 'IoTTeamCenter_CodexTest_20260830_04') {
    throw 'This migration runner targets only the existing local Team Test database.'
}
$templateBackupSql = @'
SET NOCOUNT ON;
IF DB_NAME()<>N'IoTTeamCenter_CodexTest_20260830_04' THROW 51290,'Unexpected database.',1;
IF EXISTS(SELECT 1 FROM dbo.schema_versions WHERE version=27)
BEGIN SELECT N'Migration 027 is already installed.' status; RETURN; END;
IF NOT EXISTS(SELECT 1 FROM dbo.schema_versions WHERE version=25) THROW 51291,'Migration 025 is required.',1;
DECLARE @directory nvarchar(4000)=CAST(SERVERPROPERTY('InstanceDefaultBackupPath') AS nvarchar(4000));
IF @directory IS NULL THROW 51292,'SQL Server backup directory is unavailable.',1;
IF RIGHT(@directory,1)<>N'\' SET @directory=@directory+N'\';
DECLARE @path nvarchar(4000)=@directory+N'IoTTeamCenter_before_report_templates_'+CONVERT(nvarchar(8),GETUTCDATE(),112)+N'_'+REPLACE(CONVERT(nvarchar(8),GETUTCDATE(),108),N':',N'')+N'.bak';
BACKUP DATABASE [IoTTeamCenter_CodexTest_20260830_04] TO DISK=@path WITH COPY_ONLY,CHECKSUM;
RESTORE VERIFYONLY FROM DISK=@path WITH CHECKSUM;
SELECT @path verified_backup;
'@
& sqlcmd -S localhost -E -C -I -b -d $templateSettings.DatabaseName -Q $templateBackupSql
if ($LASTEXITCODE -ne 0) { throw 'Backup or verification failed; migration was not applied.' }
$templateMigration = Join-Path (Split-Path $PSScriptRoot -Parent) 'database\migrations\027_report_templates.sql'
& sqlcmd -S localhost -E -C -I -b -d $templateSettings.DatabaseName -i $templateMigration
if ($LASTEXITCODE -ne 0) { throw 'Migration failed. Inspect the error before retrying.' }
& sqlcmd -S localhost -E -C -I -b -d $templateSettings.DatabaseName -Q 'SELECT version,name FROM dbo.schema_versions WHERE version IN (25,27) ORDER BY version;'
if ($LASTEXITCODE -ne 0) { throw 'Migration verification failed.' }
