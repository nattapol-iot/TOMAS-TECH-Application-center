[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$templateRuntimeRoot = Join-Path $env:LOCALAPPDATA 'IoTTeamCenter\TeamTest'
$templateSettings = Get-Content -LiteralPath (Join-Path $templateRuntimeRoot 'settings.json') -Raw | ConvertFrom-Json
if ($templateSettings.SqlServer -ne 'localhost' -or $templateSettings.DatabaseName -ne 'IoTTeamCenter_CodexTest_20260830_04') {
    throw 'Unexpected Team Test configuration.'
}
$templateOrigin = 'http://127.0.0.1:' + $templateSettings.ApiPort
$templateHealth = Invoke-RestMethod -Uri ($templateOrigin + '/health/ready')
if ($templateHealth.status -ne 'ready' -or $templateHealth.schemaVersion -lt 27) {
    throw 'Report Templates schema readiness failed.'
}
Write-Output 'PASS public API readiness for Report Templates'
foreach ($templatePath in @('/api/v1/reports/workspace/library')) {
    try {
        Invoke-WebRequest -Uri ($templateOrigin + $templatePath) -UseBasicParsing | Out-Null
        throw 'Anonymous library access was unexpectedly accepted.'
    }
    catch {
        if ([int]$_.Exception.Response.StatusCode -ne 401) { throw }
    }
    Write-Output "PASS anonymous access rejected: $templatePath"
}
$templateFrontendResponse = Invoke-WebRequest -Uri $templateSettings.FrontendOrigin -UseBasicParsing
if ($templateFrontendResponse.StatusCode -ne 200) { throw 'Frontend is unavailable.' }
Write-Output 'PASS Team Test frontend HTTP 200'
# Windows integrated SQL authentication checks schema only. No runtime secrets,
# temporary login codes, real reports, templates, or signatures are read or created.
& sqlcmd -S localhost -E -C -I -b -d $templateSettings.DatabaseName -Q "IF NOT EXISTS(SELECT 1 FROM dbo.schema_versions WHERE version=25) OR NOT EXISTS(SELECT 1 FROM dbo.schema_versions WHERE version=27) THROW 51293,'Required report migrations are missing.',1; SELECT version,name FROM dbo.schema_versions WHERE version IN (25,27) ORDER BY version;"
if ($LASTEXITCODE -ne 0) { throw 'Schema verification failed.' }
