[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$kpiRuntimeRoot = Join-Path $env:LOCALAPPDATA 'IoTTeamCenter\TeamTest'
$kpiSettings = Get-Content -LiteralPath (Join-Path $kpiRuntimeRoot 'settings.json') -Raw | ConvertFrom-Json
$apiOrigin = "http://127.0.0.1:$($kpiSettings.ApiPort)"
$frontendOrigin = [string]$kpiSettings.FrontendOrigin

$ready = Invoke-RestMethod -Uri "$apiOrigin/health/ready" -TimeoutSec 5
if ($ready.status -ne 'ready' -or [int]$ready.schemaVersion -lt 29) { throw 'API readiness failed.' }

$unauthenticated = $false
try { Invoke-WebRequest -Uri "$apiOrigin/api/v1/performance/overview" -UseBasicParsing -TimeoutSec 5 | Out-Null }
catch { $unauthenticated = $_.Exception.Response.StatusCode.value__ -eq 401 }
if (!$unauthenticated) { throw 'The KPI API did not reject an unauthenticated request.' }

$page = Invoke-WebRequest -Uri $frontendOrigin -UseBasicParsing -TimeoutSec 10
if ($page.StatusCode -ne 200) { throw 'Team Test frontend is unavailable.' }
$projectRoot = Split-Path $PSScriptRoot -Parent
$bundle = Get-ChildItem -LiteralPath (Join-Path $projectRoot 'dist\client\_next\static\chunks') -Filter 'PerformanceScreen-*.js' | Select-Object -First 1
if (!$bundle) { throw 'The KPI client bundle was not built.' }
$bundleResponse = Invoke-WebRequest -Uri "$frontendOrigin/_next/static/chunks/$($bundle.Name)" -UseBasicParsing -TimeoutSec 10
if ($bundleResponse.StatusCode -ne 200 -or $bundleResponse.Content -notmatch 'KPI & Growth' -or $bundleResponse.Content -notmatch 'Work evidence' -or $bundleResponse.Content -notmatch 'My Performance Pulse' -or $bundleResponse.Content -notmatch 'Decision support' -or $bundleResponse.Content -notmatch 'Sales KPI framework') {
    throw 'The served KPI bundle is missing required markers.'
}
$apiBundle = Get-ChildItem -LiteralPath (Join-Path $projectRoot 'dist\client\_next\static\chunks') -Filter '*.js' | Where-Object {
    $content = Get-Content -LiteralPath $_.FullName -Raw
    $content.Contains('performance/overview') -and $content.Contains('performance/evidence')
} | Select-Object -First 1
if (!$apiBundle) { throw 'The API client bundle was not built.' }
$apiBundleResponse = Invoke-WebRequest -Uri "$frontendOrigin/_next/static/chunks/$($apiBundle.Name)" -UseBasicParsing -TimeoutSec 10
if ($apiBundleResponse.StatusCode -ne 200 -or $apiBundleResponse.Content -notmatch 'performance/overview' -or $apiBundleResponse.Content -notmatch 'performance/evidence') { throw 'The served API client bundle is missing the KPI contract.' }

[pscustomobject]@{
    Status = 'LIVE'
    SchemaVersion = [int]$ready.schemaVersion
    ApiProcessId = (Get-Content -LiteralPath (Join-Path $kpiRuntimeRoot 'api.pid.json') -Raw | ConvertFrom-Json).ProcessId
    FrontendProcessId = (Get-Content -LiteralPath (Join-Path $kpiRuntimeRoot 'frontend.pid.json') -Raw | ConvertFrom-Json).ProcessId
    Bundle = $bundle.Name
}
