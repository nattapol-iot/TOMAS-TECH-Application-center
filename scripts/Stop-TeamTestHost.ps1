[CmdletBinding()]
param(
    [string] $RuntimeRoot = (Join-Path $env:LOCALAPPDATA 'IoTTeamCenter\TeamTest')
)

$ErrorActionPreference = 'Stop'
$pidPath = Join-Path $RuntimeRoot 'api.pid.json'
if (!(Test-Path -LiteralPath $pidPath)) {
    [pscustomobject]@{ Status = 'NOT_RUNNING' }
    exit 0
}

$runtimeState = Get-Content -LiteralPath $pidPath -Raw | ConvertFrom-Json
$runtimeProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $($runtimeState.ProcessId)" -ErrorAction SilentlyContinue
if ($runtimeProcess) {
    $expectedCommandLine = if ($runtimeProcess.Name -eq 'node.exe') {
        "*$($runtimeState.ReleasePath)\dist\src\server.js*"
    }
    elseif ($runtimeProcess.Name -eq 'dotnet.exe') {
        "*$($runtimeState.ReleasePath)\IoTTeamCenter.Api.dll*"
    }
    else { $null }
    if (!$expectedCommandLine -or $runtimeProcess.CommandLine -notlike $expectedCommandLine) {
        throw 'The saved process id belongs to a different process; refusing to stop it.'
    }
    $process = Get-Process -Id $runtimeState.ProcessId
    Stop-Process -Id $runtimeState.ProcessId -Force
    [void]$process.WaitForExit(5000)
}
Remove-Item -LiteralPath $pidPath -Force
[pscustomobject]@{ Status = 'STOPPED'; ProcessId = $runtimeState.ProcessId }
