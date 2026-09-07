[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$kpiRuntimeRoot = Join-Path $env:LOCALAPPDATA 'IoTTeamCenter\TeamTest'
$kpiSettings = Get-Content -LiteralPath (Join-Path $kpiRuntimeRoot 'settings.json') -Raw | ConvertFrom-Json
if ($kpiSettings.SqlServer -ne 'localhost' -or $kpiSettings.DatabaseName -ne 'IoTTeamCenter_CodexTest_20260830_04') {
    throw 'This readiness check targets only the existing local Team Test database.'
}

$kpiReadinessSql = @'
SET NOCOUNT ON;
IF NOT EXISTS(SELECT 1 FROM dbo.schema_versions WHERE version=26) OR NOT EXISTS(SELECT 1 FROM dbo.schema_versions WHERE version=29) THROW 51310,'KPI schemas 026 and 029 are required.',1;
IF (SELECT COUNT(*) FROM dbo.permissions WHERE code IN(N'performance.read',N'performance.manage'))<>2 THROW 51311,'KPI permissions are incomplete.',1;
IF NOT EXISTS(SELECT 1 FROM dbo.kpi_review_cycles WHERE code=N'H2 2026' AND status=N'OPEN') THROW 51312,'The initial KPI review cycle is missing.',1;
IF OBJECT_ID(N'dbo.tr_kpi_completed_assessment_frozen',N'TR') IS NULL OR OBJECT_ID(N'dbo.tr_kpi_completed_scores_frozen',N'TR') IS NULL THROW 51313,'KPI completion freeze triggers are missing.',1;
IF NOT EXISTS(SELECT 1 FROM dbo.role_permissions mapping INNER JOIN dbo.permissions permission ON permission.id=mapping.permission_id INNER JOIN dbo.roles role ON role.id=mapping.role_id WHERE role.code=N'Sales Engineer' AND permission.code=N'performance.read') THROW 51314,'Sales Engineer KPI permission is missing.',1;
IF (SELECT COUNT(*) FROM dbo.role_permissions mapping INNER JOIN dbo.permissions permission ON permission.id=mapping.permission_id INNER JOIN dbo.roles role ON role.id=mapping.role_id WHERE role.code=N'Sales Manager' AND permission.code IN(N'performance.read',N'performance.manage'))<>2 THROW 51315,'Sales Manager KPI permissions are incomplete.',1;
SELECT version,name FROM dbo.schema_versions WHERE version IN(25,26,27,28,29) ORDER BY version;
SELECT permission.code,role.code role_code FROM dbo.role_permissions mapping INNER JOIN dbo.permissions permission ON permission.id=mapping.permission_id INNER JOIN dbo.roles role ON role.id=mapping.role_id WHERE permission.code IN(N'performance.read',N'performance.manage') ORDER BY permission.code,role.code;
'@
& sqlcmd -S localhost -E -C -I -b -d $kpiSettings.DatabaseName -Q $kpiReadinessSql
if ($LASTEXITCODE -ne 0) { throw 'KPI database readiness verification failed.' }

$ready = Invoke-RestMethod -Uri "http://127.0.0.1:$($kpiSettings.ApiPort)/health/ready" -TimeoutSec 5
if ($ready.status -ne 'ready' -or [int]$ready.schemaVersion -lt 29) { throw 'Team Test API readiness did not confirm the required schema.' }
[pscustomobject]@{ Status='READY'; SchemaVersion=[int]$ready.schemaVersion; ApiPort=[int]$kpiSettings.ApiPort }
