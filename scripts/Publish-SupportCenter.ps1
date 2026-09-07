[CmdletBinding()]
param([Parameter(Mandatory=$true)][string] $StageRoot)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$stageBase = [IO.Path]::GetFullPath((Join-Path $projectRoot 'backend-node\tmp')) + [IO.Path]::DirectorySeparatorChar
$stagePath = [IO.Path]::GetFullPath($StageRoot)
if (!$stagePath.StartsWith($stageBase, [StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid stage location.' }
$manifest = Get-Content -LiteralPath (Join-Path $stagePath 'support-release.json') -Raw | ConvertFrom-Json
$runtimeRoot = Join-Path $env:LOCALAPPDATA 'IoTTeamCenter\TeamTest'
$runtimeParent = Get-Item -LiteralPath (Split-Path -Parent $runtimeRoot)
if ($runtimeParent.LinkType -eq 'Junction' -and @($runtimeParent.Target).Count -eq 1) { $runtimeRoot = Join-Path ([string]@($runtimeParent.Target)[0]) 'TeamTest' }
$settingsPath = Join-Path $runtimeRoot 'settings.json'
$originalSettings = Get-Content -LiteralPath $settingsPath -Raw
$settings = $originalSettings | ConvertFrom-Json
if ($settings.DatabaseName -ne 'IoTTeamCenter_CodexTest_20260830_04' -or $settings.ApiRuntime -ne 'Node' -or $settings.ReleasePath -ne $manifest.baseline) { throw 'Runtime baseline changed. Restage and reverify.' }
$releaseBase = [IO.Path]::GetFullPath((Join-Path $runtimeRoot 'releases')) + [IO.Path]::DirectorySeparatorChar
if (!([IO.Path]::GetFullPath($settings.ReleasePath)).StartsWith($releaseBase,[StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid baseline release path.' }
foreach ($file in $manifest.files) {
 $target = [IO.Path]::GetFullPath((Join-Path $stagePath $file.path))
 if (!$target.StartsWith($stagePath + [IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase) -or (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash -ne $file.sha256) { throw 'Staged artifact verification failed.' }
}
$migration = Join-Path $projectRoot 'database\migrations\034_support_center.sql'
if ((Get-FileHash -LiteralPath $migration -Algorithm SHA256).Hash -ne $manifest.migrationSha256) { throw 'Migration changed after staging.' }
$stamp = [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss',[Globalization.CultureInfo]::InvariantCulture)
$releasePath = Join-Path $releaseBase ($stamp + '-support-center')
if(Test-Path -LiteralPath $releasePath) { throw 'Release already exists.' }
New-Item -ItemType Directory -Path $releasePath | Out-Null
Copy-Item -LiteralPath (Join-Path $stagePath 'dist') -Destination $releasePath -Recurse
& robocopy (Join-Path $manifest.baseline 'node_modules') (Join-Path $releasePath 'node_modules') /E /NFL /NDL /NJH /NJS /NP /R:1 /W:1 /MT:8 | Out-Null
if($LASTEXITCODE -ge 8) { throw 'Dependency copy failed.' }
Copy-Item -LiteralPath (Join-Path $manifest.baseline 'package.json') -Destination $releasePath
Copy-Item -LiteralPath (Join-Path $manifest.baseline 'package-lock.json') -Destination $releasePath
# Exact named Team Test database; preserve all business data with a verified backup.
$backupQuery = "DECLARE @dir nvarchar(4000)=CONVERT(nvarchar(4000),SERVERPROPERTY('InstanceDefaultBackupPath')); IF @dir IS NULL THROW 51343,'SQL backup directory is unavailable.',1; DECLARE @file nvarchar(4000)=@dir+CASE WHEN RIGHT(@dir,1) IN(N'\',N'/') THEN N'' ELSE N'\' END+N'IoTTeamCenter_before_support_$stamp.bak'; BACKUP DATABASE [IoTTeamCenter_CodexTest_20260830_04] TO DISK=@file WITH COPY_ONLY,CHECKSUM,INIT; RESTORE VERIFYONLY FROM DISK=@file WITH CHECKSUM; SELECT CONVERT(nvarchar(500),@file) AS verified_backup;"
& sqlcmd -S localhost -E -C -I -b -d master -Q $backupQuery
if($LASTEXITCODE -ne 0) { throw 'Backup verification failed; migration not applied.' }
& sqlcmd -S localhost -E -C -I -b -d $settings.DatabaseName -i $migration
if($LASTEXITCODE -ne 0) { throw 'Support migration failed; runtime unchanged.' }
& (Join-Path $PSScriptRoot 'Stop-TeamTestHost.ps1') -RuntimeRoot $runtimeRoot | Out-Null
$settings.ReleasePath = $releasePath
[IO.File]::WriteAllText($settingsPath,($settings | ConvertTo-Json))
try {
 $started = & (Join-Path $PSScriptRoot 'Start-TeamTestHost.ps1') -RuntimeRoot $runtimeRoot
 $ready = Invoke-RestMethod -Uri 'http://127.0.0.1:5105/health/ready' -TimeoutSec 15
 if($ready.status -ne 'ready' -or $ready.schemaVersion -lt 34) { throw 'Support release readiness failed.' }
 [pscustomobject]@{Status='UPDATED';ReleasePath=$releasePath;ProcessId=$started.ProcessId;SchemaVersion=$ready.schemaVersion}
} catch {
 & (Join-Path $PSScriptRoot 'Stop-TeamTestHost.ps1') -RuntimeRoot $runtimeRoot | Out-Null
 [IO.File]::WriteAllText($settingsPath,$originalSettings)
 & (Join-Path $PSScriptRoot 'Start-TeamTestHost.ps1') -RuntimeRoot $runtimeRoot | Out-Null
 throw
}
