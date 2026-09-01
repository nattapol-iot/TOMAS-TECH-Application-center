[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$resourceRuntimeRoot = Join-Path $env:LOCALAPPDATA 'IoTTeamCenter\TeamTest'
$resourceSettings = Get-Content (Join-Path $resourceRuntimeRoot 'settings.json') -Raw | ConvertFrom-Json
if ($resourceSettings.SqlServer -ne 'localhost' -or $resourceSettings.DatabaseName -ne 'IoTTeamCenter_CodexTest_20260830_04') {
    throw 'This reviewed migration runner targets only the existing local Team Test database.'
}
$resourceBackupSql = @'
SET NOCOUNT ON;
IF DB_NAME()<>N'IoTTeamCenter_CodexTest_20260830_04' THROW 51275,'Unexpected database.',1;
IF EXISTS(SELECT 1 FROM dbo.schema_versions WHERE version=24)
BEGIN SELECT N'Migration 024 is already installed.' status; RETURN; END;
IF NOT EXISTS(SELECT 1 FROM dbo.schema_versions WHERE version=23) THROW 51276,'Migration 023 is required.',1;
DECLARE @directory nvarchar(4000)=CAST(SERVERPROPERTY('InstanceDefaultBackupPath') AS nvarchar(4000));
IF @directory IS NULL THROW 51277,'SQL Server backup directory is unavailable.',1;
IF RIGHT(@directory,1)<>N'\' SET @directory=@directory+N'\';
DECLARE @path nvarchar(4000)=@directory+N'IoTTeamCenter_before_resource_tasks_'+CONVERT(nvarchar(8),GETUTCDATE(),112)+N'_'+REPLACE(CONVERT(nvarchar(8),GETUTCDATE(),108),N':',N'')+N'.bak';
BACKUP DATABASE [IoTTeamCenter_CodexTest_20260830_04] TO DISK=@path WITH COPY_ONLY,CHECKSUM;
RESTORE VERIFYONLY FROM DISK=@path WITH CHECKSUM;
SELECT @path verified_backup;
'@
& sqlcmd -S localhost -E -C -I -b -d $resourceSettings.DatabaseName -Q $resourceBackupSql
if ($LASTEXITCODE -ne 0) { throw 'Backup or verification failed; migration was not applied.' }
$resourceMigration = Join-Path (Split-Path $PSScriptRoot -Parent) 'database\migrations\024_resource_task_lifecycle.sql'
& sqlcmd -S localhost -E -C -I -b -d $resourceSettings.DatabaseName -i $resourceMigration
if ($LASTEXITCODE -ne 0) { throw 'Migration failed. Inspect the error before retrying.' }
& sqlcmd -S localhost -E -C -I -b -d $resourceSettings.DatabaseName -Q "SELECT version,name FROM dbo.schema_versions WHERE version=24; SELECT COUNT(*) resource_tasks FROM dbo.resource_tasks;"
if ($LASTEXITCODE -ne 0) { throw 'Migration verification failed.' }
