[CmdletBinding()]
param(
    [ValidateRange(1024, 65535)][int] $FrontendPort = 3010,
    [switch] $AllowRemoteWrites
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
if (Get-NetTCPConnection -State Listen -LocalPort $FrontendPort -ErrorAction SilentlyContinue) {
    throw "Local frontend port $FrontendPort is already in use."
}
$environmentValues = @{
    NEXT_PUBLIC_APP_MODE = 'team-test'
    NEXT_PUBLIC_AUTH_MODE = 'team-test'
    NEXT_PUBLIC_API_BASE_URL = 'http://127.0.0.1:5116'
    NEXT_PUBLIC_BUSINESS_TIME_ZONE = 'Asia/Bangkok'
    NEXT_PUBLIC_LOCAL_READ_ONLY = if ($AllowRemoteWrites) { 'false' } else { 'true' }
    NEXT_PUBLIC_CONNECTED_SCHEMA_VERSION = '43'
    SITE_ORIGIN = "http://127.0.0.1:$FrontendPort"
}
$previousEnvironment = @{}
try {
    foreach ($name in $environmentValues.Keys) {
        $previousEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
        [Environment]::SetEnvironmentVariable($name, $environmentValues[$name], 'Process')
    }
    Write-Output "Starting local frontend at http://127.0.0.1:$FrontendPort. Press Ctrl+C to stop."
    & npm.cmd --prefix $projectRoot run dev -- --hostname 127.0.0.1 --port $FrontendPort
    if ($LASTEXITCODE -ne 0) { throw "Local frontend exited with code $LASTEXITCODE." }
}
finally {
    foreach ($name in $environmentValues.Keys) {
        [Environment]::SetEnvironmentVariable($name, $previousEnvironment[$name], 'Process')
    }
}
