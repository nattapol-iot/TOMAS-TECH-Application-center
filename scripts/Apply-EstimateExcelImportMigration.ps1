[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$excelImportRuntimeRoot = Join-Path $env:LOCALAPPDATA 'IoTTeamCenter\TeamTest'
$excelImportSettings = Get-Content -LiteralPath (Join-Path $excelImportRuntimeRoot 'settings.json') -Raw | ConvertFrom-Json
if ($excelImportSettings.SqlServer -ne 'localhost' -or $excelImportSettings.DatabaseName -ne 'IoTTeamCenter_CodexTest_20260830_04') {
    throw 'This migration runner targets only the existing local Team Test database.'
}
$excelImportBackupSql = @'
SET NOCOUNT ON;
IF DB_NAME()<>N'IoTTeamCenter_CodexTest_20260830_04' THROW 51331,'Unexpected database.',1;
IF EXISTS(SELECT 1 FROM dbo.schema_versions WHERE version=32)
BEGIN SELECT N'Migration 032 is already installed.' status; RETURN; END;
IF NOT EXISTS(SELECT 1 FROM dbo.schema_versions WHERE version=31) THROW 51332,'Migration 031 is required.',1;
DECLARE @directory nvarchar(4000)=CAST(SERVERPROPERTY('InstanceDefaultBackupPath') AS nvarchar(4000));
IF @directory IS NULL THROW 51333,'SQL Server backup directory is unavailable.',1;
IF RIGHT(@directory,1)<>N'\' SET @directory=@directory+N'\';
DECLARE @path nvarchar(4000)=@directory+N'IoTTeamCenter_before_estimate_excel_import_'+CONVERT(nvarchar(8),GETUTCDATE(),112)+N'_'+REPLACE(CONVERT(nvarchar(8),GETUTCDATE(),108),N':',N'')+N'.bak';
BACKUP DATABASE [IoTTeamCenter_CodexTest_20260830_04] TO DISK=@path WITH COPY_ONLY,CHECKSUM;
RESTORE VERIFYONLY FROM DISK=@path WITH CHECKSUM;
SELECT @path verified_backup;
'@
& sqlcmd -S localhost -E -C -I -b -d $excelImportSettings.DatabaseName -Q $excelImportBackupSql
if ($LASTEXITCODE -ne 0) { throw 'Backup or verification failed; migration was not applied.' }
$excelImportMigration = Join-Path (Split-Path $PSScriptRoot -Parent) 'database\migrations\032_estimate_excel_import.sql'
& sqlcmd -S localhost -E -C -I -b -d $excelImportSettings.DatabaseName -i $excelImportMigration
if ($LASTEXITCODE -ne 0) { throw 'Migration failed. Inspect the error before retrying.' }
& sqlcmd -S localhost -E -C -I -b -d $excelImportSettings.DatabaseName -Q "IF NOT EXISTS(SELECT 1 FROM dbo.schema_versions WHERE version=32) THROW 51334,'Migration 032 is missing.',1; SELECT version,name FROM dbo.schema_versions WHERE version IN (28,29,30,31,32) ORDER BY version;"
if ($LASTEXITCODE -ne 0) { throw 'Migration verification failed.' }
