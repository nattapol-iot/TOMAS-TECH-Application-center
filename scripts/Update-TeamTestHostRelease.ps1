[CmdletBinding()]
param(
    [string] $RuntimeRoot = (Join-Path $env:LOCALAPPDATA 'IoTTeamCenter\TeamTest')
)

$ErrorActionPreference = 'Stop'
$runtimeBase = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'IoTTeamCenter\TeamTest'))
$normalizedRuntimeRoot = [IO.Path]::GetFullPath($RuntimeRoot)
$runtimePrefix = $runtimeBase.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
if (!$normalizedRuntimeRoot.Equals($runtimeBase, [StringComparison]::OrdinalIgnoreCase) `
    -and !$normalizedRuntimeRoot.StartsWith($runtimePrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw "RuntimeRoot must stay within $runtimeBase."
}
$RuntimeRoot = $normalizedRuntimeRoot
$settingsPath = Join-Path $RuntimeRoot 'settings.json'
$secretsPath = Join-Path $RuntimeRoot 'secrets.json'
if (!(Test-Path -LiteralPath $settingsPath) -or !(Test-Path -LiteralPath $secretsPath)) {
    throw 'Team Test runtime is not installed.'
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$backendRoot = Join-Path $projectRoot 'backend-node'
$releaseId = [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss', [Globalization.CultureInfo]::InvariantCulture)
$releasePath = Join-Path $RuntimeRoot "releases\$releaseId"
$originalSettings = Get-Content -LiteralPath $settingsPath -Raw
$settings = $originalSettings | ConvertFrom-Json

& npm --prefix $backendRoot run typecheck
if ($LASTEXITCODE -ne 0) { throw 'Node API type check failed; the running release was not changed.' }
& npm --prefix $backendRoot test
if ($LASTEXITCODE -ne 0) { throw 'Node API tests failed; the running release was not changed.' }
& npm --prefix $backendRoot run build
if ($LASTEXITCODE -ne 0 -or !(Test-Path -LiteralPath (Join-Path $backendRoot 'dist\src\server.js'))) {
    throw 'Node API build failed; the running release was not changed.'
}

New-Item -ItemType Directory -Path $releasePath -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $backendRoot 'dist') -Destination $releasePath -Recurse
Copy-Item -LiteralPath (Join-Path $backendRoot 'package.json') -Destination $releasePath
Copy-Item -LiteralPath (Join-Path $backendRoot 'package-lock.json') -Destination $releasePath
Push-Location $releasePath
try {
    & npm ci --omit=dev
    if ($LASTEXITCODE -ne 0) { throw 'Installing Node API production dependencies failed.' }
}
finally { Pop-Location }
if (!(Test-Path -LiteralPath (Join-Path $releasePath 'dist\src\server.js'))) {
    throw 'Published Node API server is missing.'
}

& (Join-Path $PSScriptRoot 'Stop-TeamTestHost.ps1') -RuntimeRoot $RuntimeRoot | Out-Null
$settings.ReleasePath = $releasePath
$settings | Add-Member -NotePropertyName ApiRuntime -NotePropertyValue 'Node' -Force
[IO.File]::WriteAllText($settingsPath, ($settings | ConvertTo-Json))

try {
    $started = & (Join-Path $PSScriptRoot 'Start-TeamTestHost.ps1') -RuntimeRoot $RuntimeRoot
    [pscustomobject]@{
        Status = 'UPDATED'
        ReleasePath = $releasePath
        ProcessId = $started.ProcessId
        LocalOrigin = $started.LocalOrigin
        LanOrigin = $started.LanOrigin
        FrontendOrigin = $started.FrontendOrigin
    }
}
catch {
    [IO.File]::WriteAllText($settingsPath, $originalSettings)
    try { & (Join-Path $PSScriptRoot 'Start-TeamTestHost.ps1') -RuntimeRoot $RuntimeRoot | Out-Null }
    catch { Write-Error "New release failed and the previous release could not be restarted: $($_.Exception.Message)" }
    throw
}
