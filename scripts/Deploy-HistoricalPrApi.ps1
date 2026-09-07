[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$prRuntime = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'IoTTeamCenter\TeamTest'))
$prSettingsPath = Join-Path $prRuntime 'settings.json'
$prOriginalSettings = Get-Content -LiteralPath $prSettingsPath -Raw
$prSettings = $prOriginalSettings | ConvertFrom-Json
if ($prSettings.ApiRuntime -ne 'Node' -or $prSettings.DatabaseName -ne 'IoTTeamCenter_CodexTest_20260830_04') { throw 'Expected local Node Team Test runtime.' }
$prReleases = [IO.Path]::GetFullPath((Join-Path $prRuntime 'releases')) + [IO.Path]::DirectorySeparatorChar
$prSource = [IO.Path]::GetFullPath($prSettings.ReleasePath)
$prTarget = [IO.Path]::GetFullPath((Join-Path $prReleases (([DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss')) + '-historical-pr')))
if (!$prSource.StartsWith($prReleases,[StringComparison]::OrdinalIgnoreCase) -or !$prTarget.StartsWith($prReleases,[StringComparison]::OrdinalIgnoreCase) -or $prSource -eq $prTarget -or (Test-Path -LiteralPath $prTarget)) { throw 'Release paths are invalid.' }
$prRoot = Split-Path $PSScriptRoot -Parent
$prCompiled = Join-Path $prRoot 'backend-node\dist\src'
foreach($relative in @('historical-pr.js','routes\historical-pr.js')) { if (!(Test-Path -LiteralPath (Join-Path $prCompiled $relative))) { throw 'Build the Historical PR API first.' } }
# Extend the running release with only this feature. Retain other independently released modules.
Copy-Item -LiteralPath $prSource -Destination $prTarget -Recurse
foreach($relative in @('historical-pr.js','routes\historical-pr.js')) { Copy-Item -LiteralPath (Join-Path $prCompiled $relative) -Destination (Join-Path $prTarget "dist\src\$relative") }
$prAppPath = Join-Path $prTarget 'dist\src\app.js'
$prApp = Get-Content -LiteralPath $prAppPath -Raw
if (!$prApp.Contains('registerHistoricalPrRoutes')) {
    $prAnchor = 'registerPurchaseRequisitionRoutes(app, config, database, users);'
    if ([regex]::Matches($prApp, [regex]::Escape($prAnchor)).Count -ne 1) { throw 'Expected API registration anchor exactly once.' }
    $prApp = 'import { registerHistoricalPrRoutes } from "./routes/historical-pr.js";' + [Environment]::NewLine + $prApp.Replace($prAnchor, $prAnchor + [Environment]::NewLine + '    registerHistoricalPrRoutes(app, database, users);')
    [IO.File]::WriteAllText($prAppPath, $prApp)
}
& npm install --prefix $prTarget --omit=dev --save-exact fflate@0.8.3 fast-xml-parser@5.11.1
if ($LASTEXITCODE -ne 0) { throw 'Could not install import dependencies; current release is still running.' }
if ((Get-Content -LiteralPath $prSettingsPath -Raw) -ne $prOriginalSettings) { throw 'Another release changed during staging. Retry from the latest release.' }
& (Join-Path $PSScriptRoot 'Stop-TeamTestHost.ps1') -RuntimeRoot $prRuntime | Out-Null
$prSettings.ReleasePath = $prTarget
[IO.File]::WriteAllText($prSettingsPath, ($prSettings | ConvertTo-Json))
try {
    & (Join-Path $PSScriptRoot 'Start-TeamTestHost.ps1') -RuntimeRoot $prRuntime
    [pscustomobject]@{Status='UPDATED';ReleasePath=$prTarget;PreviousRelease=$prSource}
} catch {
    [IO.File]::WriteAllText($prSettingsPath,$prOriginalSettings)
    & (Join-Path $PSScriptRoot 'Start-TeamTestHost.ps1') -RuntimeRoot $prRuntime | Out-Null
    throw
}
