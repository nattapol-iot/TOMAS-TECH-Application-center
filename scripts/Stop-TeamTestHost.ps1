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
    if ($runtimeProcess.Name -ne 'dotnet.exe' -or $runtimeProcess.CommandLine -notlike "*$($runtimeState.ReleasePath)\IoTTeamCenter.Api.dll*") {
        throw 'The saved process id belongs to a different process; refusing to stop it.'
    }
    $process = Get-Process -Id $runtimeState.ProcessId
    Stop-Process -Id $runtimeState.ProcessId -Force
    [void]$process.WaitForExit(5000)
}
Remove-Item -LiteralPath $pidPath -Force
[pscustomobject]@{ Status = 'STOPPED'; ProcessId = $runtimeState.ProcessId }
