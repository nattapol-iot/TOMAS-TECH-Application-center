[CmdletBinding()]
param([Parameter(Mandatory=$true)][string] $StageRoot)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$stageBase = [IO.Path]::GetFullPath((Join-Path $projectRoot 'backend-node\tmp')) + [IO.Path]::DirectorySeparatorChar
$stagePath = [IO.Path]::GetFullPath($StageRoot)
if (!$stagePath.StartsWith($stageBase, [StringComparison]::OrdinalIgnoreCase)) { throw 'Stage must be inside backend-node/tmp.' }
$manifest = Get-Content -LiteralPath (Join-Path $stagePath 'hotfix.json') -Raw | ConvertFrom-Json
$runtimeRoot = Join-Path $env:LOCALAPPDATA 'IoTTeamCenter\TeamTest'
$settingsPath = Join-Path $runtimeRoot 'settings.json'
$originalSettings = Get-Content -LiteralPath $settingsPath -Raw
$settings = $originalSettings | ConvertFrom-Json
if ($settings.DatabaseName -ne 'IoTTeamCenter_CodexTest_20260830_04' -or $settings.ApiRuntime -ne 'Node') { throw 'Unexpected Team Test runtime.' }
$baseline = [IO.Path]::GetFullPath($settings.ReleasePath)
$releaseBase = [IO.Path]::GetFullPath((Join-Path $runtimeRoot 'releases')) + [IO.Path]::DirectorySeparatorChar
if (!$baseline.StartsWith($releaseBase, [StringComparison]::OrdinalIgnoreCase) -or $baseline -ne $manifest.baseline) { throw 'The runtime baseline changed; rebuild and retest the selective patch.' }
foreach ($file in $manifest.files) {
    $target = [IO.Path]::GetFullPath((Join-Path $stagePath $file.path))
    if (!$target.StartsWith($stagePath + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid staged file path.' }
    if ((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash -ne $file.sha256) { throw "Staged file changed: $($file.path)" }
}
$releasePath = Join-Path $releaseBase ([DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss', [Globalization.CultureInfo]::InvariantCulture) + '-four-feature-completion')
if (Test-Path -LiteralPath $releasePath) { throw 'Release already exists.' }
New-Item -ItemType Directory -Path $releasePath | Out-Null
Copy-Item -LiteralPath (Join-Path $stagePath 'dist') -Destination $releasePath -Recurse
& robocopy (Join-Path $baseline 'node_modules') (Join-Path $releasePath 'node_modules') /E /NFL /NDL /NJH /NJS /NP /R:1 /W:1 /MT:16 | Out-Null
if ($LASTEXITCODE -ge 8) { throw 'Dependency copy failed before runtime switch.' }
Copy-Item -LiteralPath (Join-Path $baseline 'package.json') -Destination $releasePath
Copy-Item -LiteralPath (Join-Path $baseline 'package-lock.json') -Destination $releasePath
& (Join-Path $PSScriptRoot 'Stop-TeamTestHost.ps1') -RuntimeRoot $runtimeRoot | Out-Null
$settings.ReleasePath = $releasePath
[IO.File]::WriteAllText($settingsPath, ($settings | ConvertTo-Json))
try {
    $started = & (Join-Path $PSScriptRoot 'Start-TeamTestHost.ps1') -RuntimeRoot $runtimeRoot
    $ready = Invoke-RestMethod -Uri 'http://127.0.0.1:5105/health/ready' -TimeoutSec 10
    if ($ready.status -ne 'ready' -or $ready.schemaVersion -lt 33) { throw 'Expected healthy schema 33 with Sales KPI029 and all report/import migrations.' }
    [pscustomobject]@{Status='UPDATED'; ReleasePath=$releasePath; ProcessId=$started.ProcessId; SchemaVersion=$ready.schemaVersion}
} catch {
    & (Join-Path $PSScriptRoot 'Stop-TeamTestHost.ps1') -RuntimeRoot $runtimeRoot | Out-Null
    [IO.File]::WriteAllText($settingsPath, $originalSettings)
    & (Join-Path $PSScriptRoot 'Start-TeamTestHost.ps1') -RuntimeRoot $runtimeRoot | Out-Null
    throw
}

