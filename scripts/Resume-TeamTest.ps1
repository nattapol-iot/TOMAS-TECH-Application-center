[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$runtimeRoot = Join-Path $env:LOCALAPPDATA 'IoTTeamCenter\TeamTest'
if (!(Test-Path -LiteralPath (Join-Path $runtimeRoot 'settings.json'))) {
    $runtimeRoot = Join-Path $env:LOCALAPPDATA 'Packages\OpenAI.Codex_2p2nqsd0c76g0\LocalCache\Local\IoTTeamCenter\TeamTest'
}
if (!(Test-Path -LiteralPath (Join-Path $runtimeRoot 'settings.json'))) {
    throw 'The existing Team Test settings were not found. Restore the runtime before starting; do not reinstall over the database.'
}
$shellPath = (Get-Process -Id $PID).Path
# Run the managed launchers in child shells: their ALREADY_RUNNING exit must
# not skip starting the other service. No credentials are passed on the CLI.
foreach ($launcher in @('Start-TeamTestHost.ps1', 'Start-TeamTestLanFrontend.ps1')) {
    & $shellPath -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot $launcher) -RuntimeRoot $runtimeRoot
    if ($LASTEXITCODE -ne 0) { throw "$launcher failed; see the error above." }
}
$settings = Get-Content -LiteralPath (Join-Path $runtimeRoot 'settings.json') -Raw | ConvertFrom-Json
$ready = Invoke-RestMethod -Uri "http://127.0.0.1:$($settings.ApiPort)/health/ready" -TimeoutSec 15
$page = Invoke-WebRequest -Uri $settings.FrontendOrigin -UseBasicParsing -TimeoutSec 15
if ($ready.status -ne 'ready' -or $page.StatusCode -ne 200) { throw 'The system started but did not pass the readiness check.' }
Write-Output "Ready: $($settings.FrontendOrigin)"
