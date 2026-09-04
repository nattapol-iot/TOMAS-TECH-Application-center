function Get-TeamTestCanonicalOrigin([string] $Origin) {
    try { $uri = [Uri]$Origin }
    catch { throw 'FrontendOrigin must be a valid absolute URI.' }

    $canonicalOrigin = if ($uri.IsAbsoluteUri) { $uri.GetLeftPart([UriPartial]::Authority) } else { '' }
    if (!$uri.IsAbsoluteUri `
        -or $uri.AbsolutePath -ne '/' `
        -or $uri.Query `
        -or $uri.Fragment `
        -or $uri.UserInfo `
        -or ![string]::Equals($Origin, $canonicalOrigin, [StringComparison]::Ordinal)) {
        throw 'FrontendOrigin must be a canonical origin without credentials, a trailing slash, path, query, or fragment.'
    }
    return $uri
}

function Test-TeamTestPrivateLanIpv4([string] $Address) {
    $parsedAddress = $null
    if (![Net.IPAddress]::TryParse($Address, [ref]$parsedAddress) `
        -or $parsedAddress.AddressFamily -ne [Net.Sockets.AddressFamily]::InterNetwork `
        -or ![string]::Equals($Address, $parsedAddress.IPAddressToString, [StringComparison]::Ordinal)) { return $false }
    $octets = $parsedAddress.GetAddressBytes()
    return $octets[0] -eq 10 `
        -or ($octets[0] -eq 172 -and $octets[1] -ge 16 -and $octets[1] -le 31) `
        -or ($octets[0] -eq 192 -and $octets[1] -eq 168)
}

function Get-TeamTestValidatedListenerConfiguration($Settings, [string[]] $AssignedAddresses = $null) {
    $apiPort = 0
    if (![int]::TryParse([string]$Settings.ApiPort, [ref]$apiPort) -or $apiPort -lt 1024 -or $apiPort -gt 65535) {
        throw 'Saved ApiPort must be an integer from 1024 through 65535.'
    }
    if ($null -eq $Settings.AllowPrivateLanHttp -or $Settings.AllowPrivateLanHttp -isnot [bool]) {
        throw 'Saved AllowPrivateLanHttp must be a Boolean value.'
    }

    $allowPrivateLanHttp = [bool]$Settings.AllowPrivateLanHttp
    $privateLanAddress = [string]$Settings.PrivateLanAddress
    $expectedAddresses = @('127.0.0.1')
    if ($allowPrivateLanHttp) {
        if (!(Test-TeamTestPrivateLanIpv4 $privateLanAddress)) {
            throw 'Saved PrivateLanAddress must be a canonical private IPv4 address.'
        }
        if ($null -eq $AssignedAddresses) {
            $AssignedAddresses = @([Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces() |
                Where-Object { $_.OperationalStatus -eq [Net.NetworkInformation.OperationalStatus]::Up } |
                ForEach-Object { $_.GetIPProperties().UnicastAddresses } |
                ForEach-Object { $_.Address.IPAddressToString })
        }
        if ($privateLanAddress -notin $AssignedAddresses) {
            throw 'Saved PrivateLanAddress is not assigned to an active network interface on this machine.'
        }
        $expectedAddresses += $privateLanAddress
    }
    elseif ($privateLanAddress) {
        throw 'Saved PrivateLanAddress requires AllowPrivateLanHttp.'
    }

    $expectedListenUrls = ($expectedAddresses | ForEach-Object { "http://${_}:${apiPort}" }) -join ';'
    if (![string]::Equals([string]$Settings.ListenUrls, $expectedListenUrls, [StringComparison]::Ordinal)) {
        throw "Saved ListenUrls must contain exactly $expectedListenUrls. Wildcard, hostname, and extra listeners are forbidden."
    }

    return [pscustomobject]@{
        ApiPort = $apiPort
        AllowPrivateLanHttp = $allowPrivateLanHttp
        PrivateLanAddress = $privateLanAddress
        ListenUrls = $expectedListenUrls
        Addresses = $expectedAddresses
    }
}
