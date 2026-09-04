[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string] $PrivateLanAddress,
    [ValidateRange(1024, 65535)][int] $FrontendPort = 3000,
    [string] $RuntimeRoot = (Join-Path $env:LOCALAPPDATA 'IoTTeamCenter\TeamTest')
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'TeamTestLanValidation.ps1')

$runtimeBase = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'IoTTeamCenter\TeamTest'))
$normalizedRuntimeRoot = [IO.Path]::GetFullPath($RuntimeRoot)
$runtimePrefix = $runtimeBase.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
if (!$normalizedRuntimeRoot.Equals($runtimeBase, [StringComparison]::OrdinalIgnoreCase) `
    -and !$normalizedRuntimeRoot.StartsWith($runtimePrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw "RuntimeRoot must stay within $runtimeBase."
}
$RuntimeRoot = $normalizedRuntimeRoot

if (!(Test-TeamTestPrivateLanIpv4 $PrivateLanAddress)) {
    throw 'PrivateLanAddress must be a canonical RFC1918 IPv4 address.'
}
$assignedAddresses = @([Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces() |
    Where-Object { $_.OperationalStatus -eq [Net.NetworkInformation.OperationalStatus]::Up } |
    ForEach-Object { $_.GetIPProperties().UnicastAddresses } |
    ForEach-Object { $_.Address.IPAddressToString })
if ($PrivateLanAddress -notin $assignedAddresses) {
    throw 'PrivateLanAddress is not assigned to an active network interface on this machine.'
}

$settingsPath = Join-Path $RuntimeRoot 'settings.json'
$secretsPath = Join-Path $RuntimeRoot 'secrets.json'
if (!(Test-Path -LiteralPath $settingsPath) -or !(Test-Path -LiteralPath $secretsPath)) {
    throw 'Team Test runtime is not installed.'
}
foreach ($pidName in @('api.pid.json', 'frontend.pid.json')) {
    if (Test-Path -LiteralPath (Join-Path $RuntimeRoot $pidName)) {
        throw 'Stop both Team Test processes before changing the saved LAN address.'
    }
}

$settings = Get-Content -LiteralPath $settingsPath -Raw | ConvertFrom-Json
if ($settings.AllowPrivateLanHttp -ne $true) {
    throw 'The installed runtime is not configured for explicit private LAN HTTP.'
}
$apiPort = 0
if (![int]::TryParse([string]$settings.ApiPort, [ref]$apiPort) -or $apiPort -lt 1024 -or $apiPort -gt 65535) {
    throw 'The installed API port is invalid.'
}
if ($apiPort -eq $FrontendPort) { throw 'The frontend and API ports must be different.' }

$previousAddress = [string]$settings.PrivateLanAddress
$allowedHosts = @(([string]$settings.AllowedHosts).Split(';', [StringSplitOptions]::RemoveEmptyEntries) |
    ForEach-Object { $_.Trim() } |
    Where-Object { $_ -and ![string]::Equals($_, $previousAddress, [StringComparison]::Ordinal) })
$allowedHosts += @('localhost', '127.0.0.1', $PrivateLanAddress)

$settings.PrivateLanAddress = $PrivateLanAddress
$settings.FrontendOrigin = "http://${PrivateLanAddress}:${FrontendPort}"
$settings.AllowedHosts = ($allowedHosts | Select-Object -Unique) -join ';'
$settings.ListenUrls = "http://127.0.0.1:${apiPort};http://${PrivateLanAddress}:${apiPort}"

$temporaryPath = Join-Path $RuntimeRoot ("settings.json.$([Guid]::NewGuid().ToString('N')).tmp")
try {
    [IO.File]::WriteAllText($temporaryPath, ($settings | ConvertTo-Json -Depth 5))
    Move-Item -LiteralPath $temporaryPath -Destination $settingsPath -Force
}
finally {
    if (Test-Path -LiteralPath $temporaryPath) {
        Remove-Item -LiteralPath $temporaryPath -Force
    }
}

[pscustomobject]@{
    Status = 'UPDATED'
    PreviousLanOrigin = $(if ($previousAddress) { "http://${previousAddress}:${FrontendPort}" } else { $null })
    LanOrigin = $settings.FrontendOrigin
    ApiLanOrigin = "http://${PrivateLanAddress}:${apiPort}"
    SecretsPreserved = $true
}
