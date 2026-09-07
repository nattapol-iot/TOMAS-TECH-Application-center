[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$endUserRuntimeRoot = Join-Path $env:LOCALAPPDATA 'IoTTeamCenter\TeamTest'
$endUserSettings = Get-Content -LiteralPath (Join-Path $endUserRuntimeRoot 'settings.json') -Raw | ConvertFrom-Json
if ($endUserSettings.SqlServer -ne 'localhost' -or $endUserSettings.DatabaseName -ne 'IoTTeamCenter_CodexTest_20260830_04') {
    throw 'This migration runner targets only the existing local Team Test database.'
}
$endUserBackupSql = @'
SET NOCOUNT ON;
IF DB_NAME()<>N'IoTTeamCenter_CodexTest_20260830_04' THROW 51290,'Unexpected database.',1;
IF EXISTS(SELECT 1 FROM dbo.schema_versions WHERE version=28)
BEGIN SELECT N'Migration 028 is already installed.' status; RETURN; END;
IF NOT EXISTS(SELECT 1 FROM dbo.schema_versions WHERE version=27) THROW 51291,'Migration 027 is required.',1;
DECLARE @directory nvarchar(4000)=CAST(SERVERPROPERTY('InstanceDefaultBackupPath') AS nvarchar(4000));
IF @directory IS NULL THROW 51292,'SQL Server backup directory is unavailable.',1;
IF RIGHT(@directory,1)<>N'\' SET @directory=@directory+N'\';
DECLARE @path nvarchar(4000)=@directory+N'IoTTeamCenter_before_end_user_companies_'+CONVERT(nvarchar(8),GETUTCDATE(),112)+N'_'+REPLACE(CONVERT(nvarchar(8),GETUTCDATE(),108),N':',N'')+N'.bak';
BACKUP DATABASE [IoTTeamCenter_CodexTest_20260830_04] TO DISK=@path WITH COPY_ONLY,CHECKSUM;
RESTORE VERIFYONLY FROM DISK=@path WITH CHECKSUM;
SELECT @path verified_backup;
'@
& sqlcmd -S localhost -E -C -I -b -d $endUserSettings.DatabaseName -Q $endUserBackupSql
if ($LASTEXITCODE -ne 0) { throw 'Backup or verification failed; migration was not applied.' }
$endUserMigration = Join-Path (Split-Path $PSScriptRoot -Parent) 'database\migrations\028_end_user_companies.sql'
& sqlcmd -S localhost -E -C -I -b -d $endUserSettings.DatabaseName -i $endUserMigration
if ($LASTEXITCODE -ne 0) { throw 'Migration failed. Inspect the error before retrying.' }
& sqlcmd -S localhost -E -C -I -b -d $endUserSettings.DatabaseName -Q 'SELECT version,name FROM dbo.schema_versions WHERE version IN (27,28) ORDER BY version;'
if ($LASTEXITCODE -ne 0) { throw 'Migration verification failed.' }
