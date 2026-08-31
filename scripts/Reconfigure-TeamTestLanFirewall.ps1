[CmdletBinding()]
param(
    [string] $RuntimeRoot = (Join-Path $env:LOCALAPPDATA 'IoTTeamCenter\TeamTest')
)

$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'Remove-TeamTestLanFirewall.ps1') -RuntimeRoot $RuntimeRoot
& (Join-Path $PSScriptRoot 'Configure-TeamTestLanFirewall.ps1') -RuntimeRoot $RuntimeRoot
