[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$evidenceRuntime = Join-Path $env:LOCALAPPDATA 'IoTTeamCenter\TeamTest'
$evidenceSettingsPath = Join-Path $evidenceRuntime 'settings.json'
if (!(Test-Path -LiteralPath $evidenceSettingsPath)) { throw 'Team Test runtime is not installed.' }
$evidenceSettings = Get-Content -LiteralPath $evidenceSettingsPath -Raw | ConvertFrom-Json
if ($evidenceSettings.SqlServer -ne 'localhost' -or $evidenceSettings.DatabaseName -ne 'IoTTeamCenter_CodexTest_20260830_04') { throw 'Report evidence migration targets only the configured local Team Test database.' }
$evidenceBackupSql = @'
SET NOCOUNT ON;
IF DB_NAME()<>N'IoTTeamCenter_CodexTest_20260830_04' THROW 51362,'Unexpected database.',1;
IF EXISTS(SELECT 1 FROM dbo.schema_versions WHERE version=36) BEGIN SELECT N'Already installed' status; RETURN; END;
IF NOT EXISTS(SELECT 1 FROM dbo.schema_versions WHERE version=35) THROW 51363,'Migration 035 is required.',1;
DECLARE @directory nvarchar(4000)=CAST(SERVERPROPERTY('InstanceDefaultBackupPath') AS nvarchar(4000));
IF @directory IS NULL THROW 51364,'Backup directory unavailable.',1;
IF RIGHT(@directory,1)<>N'\' SET @directory=@directory+N'\';
DECLARE @path nvarchar(4000)=@directory+N'IoTTeamCenter_before_report_evidence_'+CONVERT(nvarchar(8),GETUTCDATE(),112)+N'_'+REPLACE(CONVERT(nvarchar(8),GETUTCDATE(),108),N':',N'')+N'.bak';
BACKUP DATABASE [IoTTeamCenter_CodexTest_20260830_04] TO DISK=@path WITH COPY_ONLY,CHECKSUM;
RESTORE VERIFYONLY FROM DISK=@path WITH CHECKSUM;
SELECT @path verified_backup;
'@
& sqlcmd -S localhost -E -C -I -b -d $evidenceSettings.DatabaseName -Q $evidenceBackupSql
if ($LASTEXITCODE -ne 0) { throw 'Backup failed; report evidence migration was not applied.' }
$evidenceMigration = Join-Path (Split-Path $PSScriptRoot -Parent) 'database\migrations\036_report_evidence_images.sql'
& sqlcmd -S localhost -E -C -I -b -d $evidenceSettings.DatabaseName -i $evidenceMigration
if ($LASTEXITCODE -ne 0) { throw 'Report evidence migration failed.' }
& sqlcmd -S localhost -E -C -I -b -d $evidenceSettings.DatabaseName -Q "IF NOT EXISTS(SELECT 1 FROM dbo.schema_versions WHERE version=36) THROW 51365,'Migration 036 is missing.',1; SELECT version,name FROM dbo.schema_versions WHERE version=36; SELECT name FROM sys.tables WHERE name=N'unified_report_evidence_files';"
if ($LASTEXITCODE -ne 0) { throw 'Report evidence migration verification failed.' }
