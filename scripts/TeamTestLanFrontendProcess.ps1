. (Join-Path $PSScriptRoot 'TeamTestLanValidation.ps1')

function Test-TeamTestLanFrontendCommandLine(
    $Process,
    [string] $Entrypoint,
    [string] $LanAddress,
    [int] $FrontendPort
) {
    if (!$Process `
        -or $Process.Name -ne 'node.exe' `
        -or [string]::IsNullOrWhiteSpace([string]$Process.CommandLine) `
        -or [string]::IsNullOrWhiteSpace($Entrypoint) `
        -or !(Test-TeamTestPrivateLanIpv4 $LanAddress) `
        -or $FrontendPort -lt 1024 `
        -or $FrontendPort -gt 65535) { return $false }

    try { $canonicalEntrypoint = [IO.Path]::GetFullPath($Entrypoint) }
    catch { return $false }
    if (![string]::Equals($Entrypoint, $canonicalEntrypoint, [StringComparison]::OrdinalIgnoreCase)) { return $false }

    $entrypointPattern = [regex]::Escape($canonicalEntrypoint)
    $addressPattern = [regex]::Escape($LanAddress)
    $portPattern = [regex]::Escape([string]$FrontendPort)
    $argumentPattern = '(?:^|\s)"?' + $entrypointPattern + '"?\s+dev\s+--hostname\s+"?' +
        $addressPattern + '"?\s+--port\s+"?' + $portPattern + '"?\s*$'
    return [regex]::IsMatch(
        [string]$Process.CommandLine,
        $argumentPattern,
        [Text.RegularExpressions.RegexOptions]::IgnoreCase -bor [Text.RegularExpressions.RegexOptions]::CultureInvariant
    )
}

function Test-TeamTestLanFrontendListener([int] $ProcessId, [string] $LanAddress, [int] $FrontendPort) {
    try {
        $ownedListeners = @(Get-NetTCPConnection -State Listen -LocalPort $FrontendPort -ErrorAction Stop |
            Where-Object { $_.OwningProcess -eq $ProcessId })
        return $ownedListeners.Count -eq 1 -and $ownedListeners[0].LocalAddress -eq $LanAddress
    }
    catch { return $false }
}

function Test-TeamTestLanFrontendHealth([string] $LanAddress, [int] $FrontendPort) {
    try {
        $response = Invoke-WebRequest `
            -Uri "http://${LanAddress}:${FrontendPort}" `
            -UseBasicParsing `
            -TimeoutSec 3
        return $response.StatusCode -eq 200
    }
    catch { return $false }
}
