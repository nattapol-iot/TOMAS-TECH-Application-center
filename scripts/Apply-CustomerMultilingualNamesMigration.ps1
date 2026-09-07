[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$customerNamesRuntimeRoot = Join-Path $env:LOCALAPPDATA 'IoTTeamCenter\TeamTest'
$customerNamesSettings = Get-Content -LiteralPath (Join-Path $customerNamesRuntimeRoot 'settings.json') -Raw | ConvertFrom-Json
if ($customerNamesSettings.SqlServer -ne 'localhost' -or $customerNamesSettings.DatabaseName -ne 'IoTTeamCenter_CodexTest_20260830_04') {
    throw 'This migration runner targets only the existing local Team Test database.'
}
$customerNamesBackupSql = @'
SET NOCOUNT ON;
IF DB_NAME()<>N'IoTTeamCenter_CodexTest_20260830_04' THROW 51331,'Unexpected database.',1;
IF EXISTS(SELECT 1 FROM dbo.schema_versions WHERE version=30)
BEGIN SELECT N'Migration 030 is already installed.' status; RETURN; END;
IF NOT EXISTS(SELECT 1 FROM dbo.schema_versions WHERE version=28) THROW 51332,'Migration 028 is required.',1;
DECLARE @directory nvarchar(4000)=CAST(SERVERPROPERTY('InstanceDefaultBackupPath') AS nvarchar(4000));
IF @directory IS NULL THROW 51333,'SQL Server backup directory is unavailable.',1;
IF RIGHT(@directory,1)<>N'\' SET @directory=@directory+N'\';
DECLARE @path nvarchar(4000)=@directory+N'IoTTeamCenter_before_customer_multilingual_names_'+CONVERT(nvarchar(8),GETUTCDATE(),112)+N'_'+REPLACE(CONVERT(nvarchar(8),GETUTCDATE(),108),N':',N'')+N'.bak';
BACKUP DATABASE [IoTTeamCenter_CodexTest_20260830_04] TO DISK=@path WITH COPY_ONLY,CHECKSUM;
RESTORE VERIFYONLY FROM DISK=@path WITH CHECKSUM;
SELECT @path verified_backup;
'@
& sqlcmd -S localhost -E -C -I -b -d $customerNamesSettings.DatabaseName -Q $customerNamesBackupSql
if ($LASTEXITCODE -ne 0) { throw 'Backup or verification failed; migration was not applied.' }
$customerNamesMigration = Join-Path (Split-Path $PSScriptRoot -Parent) 'database\migrations\030_customer_multilingual_names.sql'
& sqlcmd -S localhost -E -C -I -b -d $customerNamesSettings.DatabaseName -i $customerNamesMigration
if ($LASTEXITCODE -ne 0) { throw 'Migration failed. Inspect the error before retrying.' }
& sqlcmd -S localhost -E -C -I -b -d $customerNamesSettings.DatabaseName -Q "IF NOT EXISTS(SELECT 1 FROM dbo.schema_versions WHERE version=30) THROW 51334,'Migration 030 is missing.',1; SELECT version,name FROM dbo.schema_versions WHERE version IN (28,29,30) ORDER BY version;"
if ($LASTEXITCODE -ne 0) { throw 'Migration verification failed.' }
