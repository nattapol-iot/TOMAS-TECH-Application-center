[CmdletBinding()]
param([switch] $Live)
$ErrorActionPreference = 'Stop'
$dashboardRuntime = Join-Path $env:LOCALAPPDATA 'IoTTeamCenter\TeamTest'
$dashboardSettings = Get-Content -LiteralPath (Join-Path $dashboardRuntime 'settings.json') -Raw | ConvertFrom-Json
$dashboardSecrets = Get-Content -LiteralPath (Join-Path $dashboardRuntime 'secrets.json') -Raw | ConvertFrom-Json
function Unlock-DashboardSecret([string] $Value) {
    $dashboardPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR((ConvertTo-SecureString $Value))
    try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($dashboardPointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($dashboardPointer) }
}
$dashboardPrevious = @{}
foreach ($dashboardName in @('DASHBOARD_CHECK_CONNECTION','DASHBOARD_CHECK_ROLE','DASHBOARD_CHECK_PASSWORD','DASHBOARD_CHECK_ORIGIN','DASHBOARD_CHECK_SIGNING_KEY')) {
    $dashboardPrevious[$dashboardName] = [Environment]::GetEnvironmentVariable($dashboardName,'Process')
}
try {
    $env:DASHBOARD_CHECK_CONNECTION = Unlock-DashboardSecret $dashboardSecrets.ConnectionString
    $env:DASHBOARD_CHECK_ROLE = if ($dashboardSecrets.ApplicationRolePassword) { [string]$dashboardSettings.AppLogin } else { $null }
    $env:DASHBOARD_CHECK_PASSWORD = if ($dashboardSecrets.ApplicationRolePassword) { Unlock-DashboardSecret $dashboardSecrets.ApplicationRolePassword } else { $null }
    $env:DASHBOARD_CHECK_ORIGIN = if ($Live) { "http://127.0.0.1:$($dashboardSettings.ApiPort)" } else { $null }
    $env:DASHBOARD_CHECK_SIGNING_KEY = if ($Live) { Unlock-DashboardSecret $dashboardSecrets.TeamTestSigningKey } else { $null }
    Push-Location (Join-Path (Split-Path -Parent $PSScriptRoot) 'backend-node')
    try { & node --import tsx tests/executive-dashboard-readiness.ts; if ($LASTEXITCODE -ne 0) { throw 'Executive dashboard read-only validation failed.' } }
    finally { Pop-Location }
}
finally {
    foreach ($dashboardName in $dashboardPrevious.Keys) { [Environment]::SetEnvironmentVariable($dashboardName,$dashboardPrevious[$dashboardName],'Process') }
}
