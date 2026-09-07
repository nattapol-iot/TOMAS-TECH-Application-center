[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$prRuntime = Join-Path $env:LOCALAPPDATA 'IoTTeamCenter\TeamTest'
$prSettings = Get-Content -LiteralPath (Join-Path $prRuntime 'settings.json') -Raw | ConvertFrom-Json
if ($prSettings.SqlServer -ne 'localhost' -or $prSettings.DatabaseName -ne 'IoTTeamCenter_CodexTest_20260830_04') {
    throw 'Historical PR migration targets only the configured local Team Test database.'
}
$prBackupSql = @'
SET NOCOUNT ON;
IF DB_NAME()<>N'IoTTeamCenter_CodexTest_20260830_04' THROW 51331,'Unexpected database.',1;
IF EXISTS(SELECT 1 FROM dbo.schema_versions WHERE version=33) BEGIN SELECT N'Already installed' status; RETURN; END;
DECLARE @directory nvarchar(4000)=CAST(SERVERPROPERTY('InstanceDefaultBackupPath') AS nvarchar(4000));
IF @directory IS NULL THROW 51332,'Backup directory unavailable.',1;
IF RIGHT(@directory,1)<>N'\' SET @directory=@directory+N'\';
DECLARE @path nvarchar(4000)=@directory+N'IoTTeamCenter_before_historical_pr_'+CONVERT(nvarchar(8),GETUTCDATE(),112)+N'_'+REPLACE(CONVERT(nvarchar(8),GETUTCDATE(),108),N':',N'')+N'.bak';
BACKUP DATABASE [IoTTeamCenter_CodexTest_20260830_04] TO DISK=@path WITH COPY_ONLY,CHECKSUM;
RESTORE VERIFYONLY FROM DISK=@path WITH CHECKSUM;
SELECT @path verified_backup;
'@
& sqlcmd -S localhost -E -C -I -b -d $prSettings.DatabaseName -Q $prBackupSql
if ($LASTEXITCODE -ne 0) { throw 'Backup failed; no migration applied.' }
$prMigration = Join-Path (Split-Path $PSScriptRoot -Parent) 'database\migrations\033_historical_pr_import.sql'
& sqlcmd -S localhost -E -C -I -b -d $prSettings.DatabaseName -i $prMigration
if ($LASTEXITCODE -ne 0) { throw 'Historical PR migration failed.' }
& sqlcmd -S localhost -E -C -I -b -d $prSettings.DatabaseName -Q 'SELECT version,name FROM dbo.schema_versions WHERE version=33;'
if ($LASTEXITCODE -ne 0) { throw 'Migration verification failed.' }
