[CmdletBinding()]
param(
    [string] $RuntimeRoot = (Join-Path $env:LOCALAPPDATA 'IoTTeamCenter\TeamTest')
)

$ErrorActionPreference = 'Stop'
$frontendRuleName = 'IoTTeamCenter-TeamTest-LAN-Frontend'
$apiRuleName = 'IoTTeamCenter-TeamTest-LAN-API'
$stateFileName = 'lan-firewall-state.json'

function Assert-Administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    if (!$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw 'Run this script from an elevated PowerShell session (Run as administrator).'
    }
}

Assert-Administrator

$runtimeBase = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'IoTTeamCenter\TeamTest'))
$normalizedRuntimeRoot = [IO.Path]::GetFullPath($RuntimeRoot)
$runtimePrefix = $runtimeBase.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
if (!$normalizedRuntimeRoot.Equals($runtimeBase, [StringComparison]::OrdinalIgnoreCase) `
    -and !$normalizedRuntimeRoot.StartsWith($runtimePrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw "RuntimeRoot must stay within $runtimeBase."
}
$RuntimeRoot = $normalizedRuntimeRoot
$settingsPath = Join-Path $RuntimeRoot 'settings.json'
$statePath = Join-Path $RuntimeRoot $stateFileName
if (!(Test-Path -LiteralPath $settingsPath)) {
    throw 'Team Test runtime is not installed. Run Install-TeamTestHost.ps1 first.'
}

# Read the installed settings before changing firewall state so cleanup targets only
# the runtime selected by RuntimeRoot. Rule removal itself relies on the recorded state.
$null = Get-Content -LiteralPath $settingsPath -Raw | ConvertFrom-Json
$state = if (Test-Path -LiteralPath $statePath) {
    Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
} else { $null }
if ($state -and [int]$state.Version -notin @(1, 2)) { throw 'Unsupported Team Test LAN firewall state version.' }

$removedRuleCount = 0
foreach ($managedRuleName in @($frontendRuleName, $apiRuleName)) {
    $managedRules = @(Get-NetFirewallRule -PolicyStore PersistentStore -Name $managedRuleName -ErrorAction SilentlyContinue)
    foreach ($managedRule in $managedRules) {
        $managedRule | Remove-NetFirewallRule -ErrorAction Stop
        $removedRuleCount++
    }
}

$restoredRuleCount = 0
if ($state) {
    $recordedNames = if ([int]$state.Version -eq 1) {
        $state.DisabledBroadNodeRuleNames
    } else {
        $state.DisabledBroadRuntimeRuleNames
    }
    $recordedRuleNames = @($recordedNames | Where-Object { ![string]::IsNullOrWhiteSpace([string]$_) } | Select-Object -Unique)
    foreach ($recordedRuleName in $recordedRuleNames) {
        $recordedRules = @(Get-NetFirewallRule -PolicyStore PersistentStore -Name ([string]$recordedRuleName) -ErrorAction SilentlyContinue)
        if ($recordedRules.Count -ne 1) {
            throw "Recorded runtime firewall rule was not found uniquely: $recordedRuleName"
        }
        if ([string]$recordedRules[0].Enabled -ne 'True') {
            $recordedRules[0] | Enable-NetFirewallRule -ErrorAction Stop | Out-Null
            $restoredRuleCount++
        }
    }
    Remove-Item -LiteralPath $statePath -Force
}

[pscustomobject]@{
    Status = $(if ($state -or $removedRuleCount -ne 0) { 'REMOVED' } else { 'NOT_CONFIGURED' })
    RemovedManagedRuleCount = $removedRuleCount
    RestoredBroadRuntimeRuleCount = $restoredRuleCount
}
