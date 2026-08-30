[CmdletBinding()]
param(
    [string] $RuntimeRoot = (Join-Path $env:LOCALAPPDATA 'IoTTeamCenter\TeamTest')
)

$ErrorActionPreference = 'Stop'
$pidPath = Join-Path $RuntimeRoot 'frontend.pid.json'
. (Join-Path $PSScriptRoot 'TeamTestLanFrontendProcess.ps1')
if (!(Test-Path -LiteralPath $pidPath)) {
    [pscustomobject]@{ Status = 'NOT_RUNNING' }
    exit 0
}

$runtimeState = Get-Content -LiteralPath $pidPath -Raw | ConvertFrom-Json
$processId = 0
$frontendPort = 0
if (![int]::TryParse([string]$runtimeState.ProcessId, [ref]$processId) -or $processId -le 0 `
    -or ![int]::TryParse([string]$runtimeState.FrontendPort, [ref]$frontendPort) `
    -or $frontendPort -lt 1024 -or $frontendPort -gt 65535 `
    -or !(Test-TeamTestPrivateLanIpv4 ([string]$runtimeState.LanAddress))) {
    throw 'The saved frontend process state is invalid; refusing to stop any process.'
}
$runtimeProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $processId" -ErrorAction SilentlyContinue
if ($runtimeProcess) {
    if (!(Test-TeamTestLanFrontendCommandLine `
            $runtimeProcess `
            ([string]$runtimeState.Entrypoint) `
            ([string]$runtimeState.LanAddress) `
            $frontendPort) `
        -or !(Test-TeamTestLanFrontendListener $processId ([string]$runtimeState.LanAddress) $frontendPort)) {
        throw 'The saved process does not match the exact entrypoint, dev arguments, address, port, and listener; refusing to stop it.'
    }
    $process = Get-Process -Id $processId
    Stop-Process -Id $processId -Force
    [void]$process.WaitForExit(5000)
}
Remove-Item -LiteralPath $pidPath -Force
[pscustomobject]@{ Status = 'STOPPED'; ProcessId = $processId }
