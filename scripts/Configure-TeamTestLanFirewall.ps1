[CmdletBinding()]
param(
    [string] $RuntimeRoot = (Join-Path $env:LOCALAPPDATA 'IoTTeamCenter\TeamTest')
)

$ErrorActionPreference = 'Stop'
$frontendPort = 3000
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

function Test-PrivateLanIpv4([string] $Address) {
    $parsedAddress = $null
    if (![Net.IPAddress]::TryParse($Address, [ref]$parsedAddress) `
        -or $parsedAddress.AddressFamily -ne [Net.Sockets.AddressFamily]::InterNetwork) { return $false }
    $octets = $parsedAddress.GetAddressBytes()
    return $octets[0] -eq 10 `
        -or ($octets[0] -eq 172 -and $octets[1] -ge 16 -and $octets[1] -le 31) `
        -or ($octets[0] -eq 192 -and $octets[1] -eq 168)
}

function Test-OnlyAnyValue([object] $Value) {
    $items = @($Value)
    return $items.Count -eq 1 -and [string]::Equals([string]$items[0], 'Any', [StringComparison]::OrdinalIgnoreCase)
}

function Test-RuleAppliesToProfile([object] $RuleProfile, [string] $FirewallProfile) {
    $profileNames = @(([string]$RuleProfile).Split(',') | ForEach-Object { $_.Trim() })
    return $profileNames -contains 'Any' -or $profileNames -contains $FirewallProfile
}

function Get-CanonicalPath([string] $Path) {
    if ([string]::IsNullOrWhiteSpace($Path) -or $Path -eq 'Any') { return $null }
    try { return [IO.Path]::GetFullPath([Environment]::ExpandEnvironmentVariables($Path)) }
    catch { return $null }
}

function Test-BroadProgramAllowRule(
    [object] $Rule,
    [string] $ProgramPath,
    [string] $FirewallProfile
) {
    if ([string]$Rule.Enabled -ne 'True' `
        -or [string]$Rule.Direction -ne 'Inbound' `
        -or [string]$Rule.Action -ne 'Allow' `
        -or !(Test-RuleAppliesToProfile $Rule.Profile $FirewallProfile)) { return $false }

    $portFilters = @($Rule | Get-NetFirewallPortFilter)
    $addressFilters = @($Rule | Get-NetFirewallAddressFilter)
    $applicationFilters = @($Rule | Get-NetFirewallApplicationFilter)
    if ($portFilters.Count -ne 1 -or $addressFilters.Count -ne 1 -or $applicationFilters.Count -ne 1) { return $false }

    $ruleProgram = Get-CanonicalPath ([string]$applicationFilters[0].Program)
    return $ruleProgram `
        -and $ruleProgram.Equals($ProgramPath, [StringComparison]::OrdinalIgnoreCase) `
        -and (Test-OnlyAnyValue $portFilters[0].LocalPort) `
        -and (Test-OnlyAnyValue $portFilters[0].RemotePort) `
        -and (Test-OnlyAnyValue $addressFilters[0].LocalAddress) `
        -and (Test-OnlyAnyValue $addressFilters[0].RemoteAddress)
}

function Test-ProtocolCanAdmitTcp([object] $Value) {
    $items = @($Value)
    if ($items.Count -eq 0) { return $true }
    foreach ($item in $items) {
        $text = ([string]$item).Trim()
        if ($text -in @('Any', '*', 'TCP', '6')) { return $true }
    }
    return $false
}

function Test-PortCanAdmit([object] $Value, [int] $TargetPort) {
    $items = @($Value | ForEach-Object { ([string]$_).Split(',') } | ForEach-Object { $_.Trim() } | Where-Object { $_ })
    if ($items.Count -eq 0) { return $true }
    foreach ($item in $items) {
        if ($item -in @('Any', '*')) { return $true }
        if ($item -match '^\d+$') {
            if ([int]$item -eq $TargetPort) { return $true }
            continue
        }
        if ($item -match '^(\d+)-(\d+)$') {
            if ($TargetPort -ge [int]$Matches[1] -and $TargetPort -le [int]$Matches[2]) { return $true }
            continue
        }

        # Service keywords and other forms cannot be proven not to include the
        # target port, so treat them as overlapping and fail closed.
        return $true
    }
    return $false
}

function Test-ProgramCanAdmit([object] $Value, [string] $TargetProgram) {
    $items = @($Value)
    if ($items.Count -eq 0) { return $true }
    foreach ($item in $items) {
        $text = ([string]$item).Trim()
        if (!$text -or $text -in @('Any', '*')) { return $true }
        $canonicalProgram = Get-CanonicalPath $text
        if (!$canonicalProgram) { return $true }
        if ($canonicalProgram.Equals($TargetProgram, [StringComparison]::OrdinalIgnoreCase)) { return $true }
    }
    return $false
}

function Test-LocalAddressCanAdmit([object] $Value, [string] $TargetAddress) {
    $items = @($Value)
    if ($items.Count -eq 0) { return $true }
    foreach ($item in $items) {
        $text = ([string]$item).Trim()
        if (!$text -or $text -in @('Any', '*')) { return $true }
        if ([string]::Equals($text, $TargetAddress, [StringComparison]::OrdinalIgnoreCase)) { return $true }

        $parsedAddress = $null
        if ([Net.IPAddress]::TryParse($text, [ref]$parsedAddress)) {
            if ($parsedAddress.AddressFamily -eq [Net.Sockets.AddressFamily]::InterNetwork `
                -and [string]::Equals($parsedAddress.IPAddressToString, $TargetAddress, [StringComparison]::Ordinal)) {
                return $true
            }
            continue
        }

        # Subnets, ranges, LocalSubnet, and other dynamic forms may include the
        # selected host address. They are relevant unless proven otherwise.
        return $true
    }
    return $false
}

function Test-InterfaceCanAdmit([object] $Value, [string] $TargetInterfaceAlias) {
    $items = @($Value)
    if ($items.Count -eq 0) { return $true }
    foreach ($item in $items) {
        $text = ([string]$item).Trim()
        if (!$text -or $text -in @('Any', '*')) { return $true }
        if ([string]::Equals($text, $TargetInterfaceAlias, [StringComparison]::OrdinalIgnoreCase)) { return $true }
    }
    return $false
}

function Test-RuleCanAdmitTarget(
    [object] $Rule,
    [string] $TargetProgram,
    [int] $TargetPort,
    [string] $TargetAddress,
    [string] $TargetInterfaceAlias,
    [string] $FirewallProfile
) {
    if ([string]$Rule.Enabled -ne 'True' `
        -or [string]$Rule.Direction -ne 'Inbound' `
        -or [string]$Rule.Action -ne 'Allow' `
        -or !(Test-RuleAppliesToProfile $Rule.Profile $FirewallProfile)) { return $false }

    # Packaged-app capability rules can report Program=Any and Port=Any, but
    # the package identity means they do not apply to node.exe or dotnet.exe.
    if (![string]::IsNullOrWhiteSpace([string]$Rule.PackageFamilyName)) { return $false }

    $serviceFilters = @($Rule | Get-NetFirewallServiceFilter)
    if ($serviceFilters.Count -ne 0 `
        -and @($serviceFilters | Where-Object {
            $service = ([string]$_.Service).Trim()
            !$service -or $service -in @('Any', '*')
        }).Count -eq 0) {
        return $false
    }

    $portFilters = @($Rule | Get-NetFirewallPortFilter)
    if ($portFilters.Count -eq 0) { return $true }
    $portCanAdmit = @($portFilters | Where-Object {
        (Test-ProtocolCanAdmitTcp $_.Protocol) -and (Test-PortCanAdmit $_.LocalPort $TargetPort)
    }).Count -ne 0
    if (!$portCanAdmit) { return $false }

    $applicationFilters = @($Rule | Get-NetFirewallApplicationFilter)
    if ($applicationFilters.Count -eq 0 `
        -or @($applicationFilters | Where-Object { Test-ProgramCanAdmit $_.Program $TargetProgram }).Count -ne 0) {
        $programCanAdmit = $true
    }
    else { $programCanAdmit = $false }
    if (!$programCanAdmit) { return $false }

    $addressFilters = @($Rule | Get-NetFirewallAddressFilter)
    if ($addressFilters.Count -ne 0 `
        -and @($addressFilters | Where-Object { Test-LocalAddressCanAdmit $_.LocalAddress $TargetAddress }).Count -eq 0) {
        return $false
    }

    $interfaceFilters = @($Rule | Get-NetFirewallInterfaceFilter)
    if ($interfaceFilters.Count -ne 0 `
        -and @($interfaceFilters | Where-Object { Test-InterfaceCanAdmit $_.InterfaceAlias $TargetInterfaceAlias }).Count -eq 0) {
        return $false
    }

    return $true
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
if (Test-Path -LiteralPath $statePath) {
    throw 'The Team Test LAN firewall is already configured. Run Remove-TeamTestLanFirewall.ps1 before reconfiguring it.'
}

$settings = Get-Content -LiteralPath $settingsPath -Raw | ConvertFrom-Json
if ($settings.AllowPrivateLanHttp -ne $true) { throw 'The installed Team Test runtime is not in explicit private LAN HTTP mode.' }
$lanAddress = [string]$settings.PrivateLanAddress
if (!(Test-PrivateLanIpv4 $lanAddress)) { throw 'The installed PrivateLanAddress is not an RFC1918 IPv4 address.' }

$apiPort = 0
if (![int]::TryParse([string]$settings.ApiPort, [ref]$apiPort) -or $apiPort -lt 1024 -or $apiPort -gt 65535) {
    throw 'The installed Team Test API port is invalid.'
}
if ($apiPort -eq $frontendPort) { throw 'The frontend and API ports must be different.' }
$expectedFrontendOrigin = "http://${lanAddress}:${frontendPort}"
if (![string]::Equals([string]$settings.FrontendOrigin, $expectedFrontendOrigin, [StringComparison]::OrdinalIgnoreCase)) {
    throw "The installed frontend origin must be exactly $expectedFrontendOrigin."
}
$listenUrls = @(([string]$settings.ListenUrls).Split(';', [StringSplitOptions]::RemoveEmptyEntries) | ForEach-Object { $_.Trim() })
$expectedListenUrls = @("http://127.0.0.1:${apiPort}", "http://${lanAddress}:${apiPort}")
if ($listenUrls.Count -ne $expectedListenUrls.Count `
    -or @($expectedListenUrls | Where-Object { $_ -notin $listenUrls }).Count -ne 0) {
    throw 'The installed API listeners are not the exact loopback and private LAN Team Test listeners.'
}

$addressEntries = @(Get-NetIPAddress -AddressFamily IPv4 -IPAddress $lanAddress -ErrorAction Stop |
    Where-Object { $_.AddressState -eq 'Preferred' })
if ($addressEntries.Count -ne 1) { throw 'PrivateLanAddress must identify one current preferred IPv4 address.' }
$addressEntry = $addressEntries[0]
if ([int]$addressEntry.PrefixLength -ne 24) { throw 'Team Test LAN firewall configuration supports only a /24 Wi-Fi network.' }

$adapters = @(Get-NetAdapter -InterfaceIndex $addressEntry.InterfaceIndex -ErrorAction Stop)
if ($adapters.Count -ne 1) { throw 'Unable to identify the Wi-Fi adapter for PrivateLanAddress.' }
$adapter = $adapters[0]
$isWifiAdapter = [string]$adapter.MediaType -eq 'Native 802.11' -or [int]$adapter.NdisPhysicalMedium -eq 9
if (!$isWifiAdapter -or !$adapter.HardwareInterface -or [string]$adapter.Status -ne 'Up') {
    throw 'PrivateLanAddress is not assigned to an active physical Wi-Fi adapter.'
}
$profiles = @(Get-NetConnectionProfile -InterfaceIndex $addressEntry.InterfaceIndex -ErrorAction Stop)
if ($profiles.Count -ne 1) { throw 'Unable to identify one current network profile for the Wi-Fi adapter.' }
$networkCategory = [string]$profiles[0].NetworkCategory
$firewallProfile = switch ($networkCategory) {
    'Public' { 'Public' }
    'Private' { 'Private' }
    'DomainAuthenticated' { 'Domain' }
    default { throw "Unsupported Wi-Fi network category: $networkCategory" }
}

$lanIp = [Net.IPAddress]::Parse($lanAddress)
$lanOctets = $lanIp.GetAddressBytes()
$remoteSubnet = "$($lanOctets[0]).$($lanOctets[1]).$($lanOctets[2]).0/24"
$interfaceAlias = [string]$adapter.Name
$nodePath = Get-CanonicalPath ((Get-Command node.exe -ErrorAction Stop).Source)
$dotnetPath = Get-CanonicalPath ((Get-Command dotnet.exe -ErrorAction Stop).Source)
if (!$nodePath -or !(Test-Path -LiteralPath $nodePath -PathType Leaf)) { throw 'node.exe was not found.' }
if (!$dotnetPath -or !(Test-Path -LiteralPath $dotnetPath -PathType Leaf)) { throw 'dotnet.exe was not found.' }

foreach ($managedRuleName in @($frontendRuleName, $apiRuleName)) {
    if (Get-NetFirewallRule -PolicyStore ActiveStore -Name $managedRuleName -ErrorAction SilentlyContinue) {
        throw "Firewall rule $managedRuleName already exists without the Team Test firewall state file. Remove it explicitly before continuing."
    }
}

$activeInboundAllowRules = @(Get-NetFirewallRule -PolicyStore ActiveStore | Where-Object {
    [string]$_.Enabled -eq 'True' `
        -and [string]$_.Direction -eq 'Inbound' `
        -and [string]$_.Action -eq 'Allow' `
        -and (Test-RuleAppliesToProfile $_.Profile $firewallProfile)
})
$broadRuntimeRules = @($activeInboundAllowRules | Where-Object {
    (Test-BroadProgramAllowRule $_ $nodePath $firewallProfile) `
        -or (Test-BroadProgramAllowRule $_ $dotnetPath $firewallProfile)
})
$externallyManagedBroadRules = @($broadRuntimeRules | Where-Object {
    [string]$_.PolicyStoreSourceType -ne 'Local' -or [string]$_.PolicyStoreSource -ne 'PersistentStore'
})
if ($externallyManagedBroadRules.Count -ne 0) {
    throw 'An externally managed broad Node.js or .NET inbound Allow rule applies to this Wi-Fi profile; scoped LAN exposure cannot be guaranteed.'
}

$managedRuleNames = @($frontendRuleName, $apiRuleName)
$handledBroadRuntimeRuleNames = @($broadRuntimeRules | ForEach-Object { [string]$_.Name })
$otherRelevantRules = @($activeInboundAllowRules | Where-Object {
    $ruleName = [string]$_.Name
    $ruleName -notin $managedRuleNames `
        -and $ruleName -notin $handledBroadRuntimeRuleNames `
        -and ((Test-RuleCanAdmitTarget $_ $nodePath $frontendPort $lanAddress $interfaceAlias $firewallProfile) `
            -or (Test-RuleCanAdmitTarget $_ $dotnetPath $apiPort $lanAddress $interfaceAlias $firewallProfile))
})
if ($otherRelevantRules.Count -ne 0) {
    $conflictingRuleNames = @($otherRelevantRules | ForEach-Object { [string]$_.Name } | Sort-Object -Unique)
    throw "Existing inbound Allow firewall rules could also admit the Team Test frontend or API, so the intended /24 scope cannot be guaranteed: $($conflictingRuleNames -join ', '). Disable or narrow those rules explicitly before continuing."
}

$disabledRuleNames = [Collections.Generic.List[string]]::new()
$createdRuleNames = [Collections.Generic.List[string]]::new()
$tempStatePath = Join-Path $RuntimeRoot ("$stateFileName.$([Guid]::NewGuid().ToString('N')).tmp")
try {
    foreach ($rule in $broadRuntimeRules) {
        $ruleName = [string]$rule.Name
        $disabledRuleNames.Add($ruleName)
        Get-NetFirewallRule -PolicyStore PersistentStore -Name $ruleName -ErrorAction Stop |
            Disable-NetFirewallRule | Out-Null
    }

    $createdRuleNames.Add($frontendRuleName)
    New-NetFirewallRule `
        -PolicyStore PersistentStore `
        -Name $frontendRuleName `
        -DisplayName 'IoT Team Center Team Test LAN Frontend' `
        -Description 'Scoped LAN access for the local IoT Team Center Team Test frontend.' `
        -Enabled True `
        -Direction Inbound `
        -Action Allow `
        -Profile $firewallProfile `
        -InterfaceAlias $interfaceAlias `
        -Protocol TCP `
        -LocalAddress $lanAddress `
        -RemoteAddress $remoteSubnet `
        -LocalPort $frontendPort `
        -Program $nodePath `
        -EdgeTraversalPolicy Block | Out-Null

    $createdRuleNames.Add($apiRuleName)
    New-NetFirewallRule `
        -PolicyStore PersistentStore `
        -Name $apiRuleName `
        -DisplayName 'IoT Team Center Team Test LAN API' `
        -Description 'Scoped LAN access for the local IoT Team Center Team Test API.' `
        -Enabled True `
        -Direction Inbound `
        -Action Allow `
        -Profile $firewallProfile `
        -InterfaceAlias $interfaceAlias `
        -Protocol TCP `
        -LocalAddress $lanAddress `
        -RemoteAddress $remoteSubnet `
        -LocalPort $apiPort `
        -Program $dotnetPath `
        -EdgeTraversalPolicy Block | Out-Null

    $state = @{
        Version = 2
        ConfiguredAt = [DateTimeOffset]::Now.ToString('O')
        ManagedRuleNames = @($frontendRuleName, $apiRuleName)
        DisabledBroadRuntimeRuleNames = @($disabledRuleNames)
        NodePath = $nodePath
        DotnetPath = $dotnetPath
        InterfaceAlias = $interfaceAlias
        InterfaceIndex = [int]$addressEntry.InterfaceIndex
        LocalAddress = $lanAddress
        PrefixLength = 24
        RemoteSubnet = $remoteSubnet
        NetworkCategory = $networkCategory
        FirewallProfile = $firewallProfile
        FrontendPort = $frontendPort
        ApiPort = $apiPort
    }
    [IO.File]::WriteAllText($tempStatePath, ($state | ConvertTo-Json -Depth 5))
    Move-Item -LiteralPath $tempStatePath -Destination $statePath

    [pscustomobject]@{
        Status = 'CONFIGURED'
        InterfaceAlias = $interfaceAlias
        LocalAddress = $lanAddress
        RemoteSubnet = $remoteSubnet
        FirewallProfile = $firewallProfile
        FrontendPort = $frontendPort
        ApiPort = $apiPort
        DisabledBroadRuntimeRuleCount = $disabledRuleNames.Count
    }
}
catch {
    $failureMessage = $_.Exception.Message
    $rollbackErrors = [Collections.Generic.List[string]]::new()
    foreach ($ruleName in $createdRuleNames) {
        try {
            Get-NetFirewallRule -PolicyStore PersistentStore -Name $ruleName -ErrorAction SilentlyContinue |
                Remove-NetFirewallRule -ErrorAction Stop
        }
        catch { $rollbackErrors.Add("remove ${ruleName}: $($_.Exception.Message)") }
    }
    foreach ($ruleName in $disabledRuleNames) {
        try {
            Get-NetFirewallRule -PolicyStore PersistentStore -Name $ruleName -ErrorAction Stop |
                Enable-NetFirewallRule -ErrorAction Stop | Out-Null
        }
        catch { $rollbackErrors.Add("restore ${ruleName}: $($_.Exception.Message)") }
    }
    if (Test-Path -LiteralPath $tempStatePath) {
        try { Remove-Item -LiteralPath $tempStatePath -Force }
        catch { $rollbackErrors.Add("remove temporary state: $($_.Exception.Message)") }
    }
    if ($rollbackErrors.Count -ne 0) {
        throw "$failureMessage Rollback errors: $($rollbackErrors -join '; ')"
    }
    throw
}
