[CmdletBinding()]
param(
    [string] $RuntimeRoot = (Join-Path $env:LOCALAPPDATA 'IoTTeamCenter\TeamTest')
)

$ErrorActionPreference = 'Stop'
$settingsPath = Join-Path $RuntimeRoot 'settings.json'
$secretsPath = Join-Path $RuntimeRoot 'secrets.json'
$pidPath = Join-Path $RuntimeRoot 'api.pid.json'
. (Join-Path $PSScriptRoot 'TeamTestLanValidation.ps1')

if (!(Test-Path -LiteralPath $settingsPath) -or !(Test-Path -LiteralPath $secretsPath)) {
    throw 'Team Test runtime is not installed. Run Install-TeamTestHost.ps1 first.'
}

function Test-ExactApiListeners($Configuration, [int] $ProcessId) {
    $ownedListeners = @(Get-NetTCPConnection -State Listen -LocalPort $Configuration.ApiPort -ErrorAction SilentlyContinue |
        Where-Object { $_.OwningProcess -eq $ProcessId })
    if ($ownedListeners.Count -ne $Configuration.Addresses.Count) { return $false }
    foreach ($address in $Configuration.Addresses) {
        if (@($ownedListeners | Where-Object { $_.LocalAddress -eq $address }).Count -ne 1) { return $false }
    }
    return $true
}

function Test-TeamTestApiHealth($Configuration) {
    foreach ($address in $Configuration.Addresses) {
        try {
            $response = Invoke-WebRequest `
                -Uri "http://${address}:$($Configuration.ApiPort)/health/live" `
                -UseBasicParsing `
                -TimeoutSec 2
            if ($response.StatusCode -ne 200) { return $false }
        }
        catch { return $false }
    }
    return $true
}

$settings = Get-Content -LiteralPath $settingsPath -Raw | ConvertFrom-Json
$listenerConfiguration = Get-TeamTestValidatedListenerConfiguration $settings

if (Test-Path -LiteralPath $pidPath) {
    $existingState = Get-Content -LiteralPath $pidPath -Raw | ConvertFrom-Json
    $existingProcessId = 0
    [void][int]::TryParse([string]$existingState.ProcessId, [ref]$existingProcessId)
    $existingProcess = if ($existingProcessId -gt 0) {
        Get-CimInstance Win32_Process -Filter "ProcessId = $existingProcessId" -ErrorAction SilentlyContinue
    }
    if ($existingProcess -and $existingProcess.Name -eq 'dotnet.exe' -and $existingProcess.CommandLine -like "*$($existingState.ReleasePath)\IoTTeamCenter.Api.dll*") {
        if (!(Test-ExactApiListeners $listenerConfiguration $existingProcessId) `
            -or !(Test-TeamTestApiHealth $listenerConfiguration)) {
            throw 'The saved API process does not own the exact configured listeners or is unhealthy; refusing to report it as running.'
        }
        [pscustomobject]@{ Status = 'ALREADY_RUNNING'; ProcessId = $existingProcessId }
        exit 0
    }
    Remove-Item -LiteralPath $pidPath -Force
}

function Unprotect-String([string] $cipherText) {
    $secureValue = ConvertTo-SecureString $cipherText
    $valuePointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureValue)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($valuePointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($valuePointer) }
}

$secrets = Get-Content -LiteralPath $secretsPath -Raw | ConvertFrom-Json
$connectionString = Unprotect-String $secrets.ConnectionString
$signingKey = Unprotect-String $secrets.TeamTestSigningKey
$applicationRolePassword = if ($secrets.ApplicationRolePassword) { Unprotect-String $secrets.ApplicationRolePassword } else { $null }
$logRoot = Join-Path $RuntimeRoot 'logs'
New-Item -ItemType Directory -Path $logRoot -Force | Out-Null
$logStamp = [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss', [Globalization.CultureInfo]::InvariantCulture)

$env:ASPNETCORE_ENVIRONMENT = 'Staging'
$env:ASPNETCORE_URLS = $listenerConfiguration.ListenUrls
$env:AllowedHosts = $settings.AllowedHosts
$env:Authentication__Mode = 'TeamTest'
$env:Authentication__TeamTestSigningKey = $signingKey
$env:Database__TrustServerCertificateForTeamTest = [string]$settings.TrustServerCertificateForTeamTest
$env:TeamTest__AllowPrivateLanHttp = [string]$listenerConfiguration.AllowPrivateLanHttp
if ($applicationRolePassword) {
    $env:Database__ApplicationRoleName = $settings.AppLogin
    $env:Database__ApplicationRolePassword = $applicationRolePassword
}
$env:Cors__AllowedOrigins__0 = $settings.FrontendOrigin
$env:Business__TimeZoneId = 'SE Asia Standard Time'
$env:ConnectionStrings__IoTTeamCenter = $connectionString
$env:DocumentStorage__Mode = 'Local'
$env:DocumentStorage__RootPath = (Join-Path $RuntimeRoot 'documents')

$dotnetPath = (Get-Command dotnet -ErrorAction Stop).Source
$apiDll = Join-Path $settings.ReleasePath 'IoTTeamCenter.Api.dll'
if (!(Test-Path -LiteralPath $apiDll)) { throw "Published API is missing: $apiDll" }

$process = Start-Process -FilePath $dotnetPath `
    -ArgumentList @($apiDll) `
    -WorkingDirectory $settings.ReleasePath `
    -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $logRoot "api-$logStamp.out.log") `
    -RedirectStandardError (Join-Path $logRoot "api-$logStamp.err.log") `
    -PassThru

try {
    $healthy = $false
    foreach ($attempt in 1..15) {
        Start-Sleep -Seconds 1
        if ($process.HasExited) { throw "Team Test API exited with code $($process.ExitCode)." }
        $healthy = Test-TeamTestApiHealth $listenerConfiguration
        if ($healthy) { break }
    }
    if (!$healthy) { throw 'Team Test API did not become healthy on every configured listener in time.' }
    if (!(Test-ExactApiListeners $listenerConfiguration $process.Id)) {
        throw 'Team Test API does not own exactly the configured loopback and private LAN listeners.'
    }
    [IO.File]::WriteAllText($pidPath, (@{
        ProcessId = $process.Id
        ReleasePath = $settings.ReleasePath
        StartedAt = [DateTimeOffset]::Now.ToString('O')
    } | ConvertTo-Json))
    [pscustomobject]@{
        Status = 'RUNNING'
        ProcessId = $process.Id
        LocalOrigin = "http://127.0.0.1:$($listenerConfiguration.ApiPort)"
        LanOrigin = $(if ($listenerConfiguration.AllowPrivateLanHttp) { "http://$($listenerConfiguration.PrivateLanAddress):$($listenerConfiguration.ApiPort)" } else { $null })
        FrontendOrigin = $settings.FrontendOrigin
    }
}
catch {
    if (!$process.HasExited) { Stop-Process -Id $process.Id -Force }
    throw
}
finally {
    $env:Authentication__TeamTestSigningKey = $null
    $env:ConnectionStrings__IoTTeamCenter = $null
    $env:Database__ApplicationRoleName = $null
    $env:Database__ApplicationRolePassword = $null
    $env:TeamTest__AllowPrivateLanHttp = $null
    $connectionString = $null
    $signingKey = $null
    $applicationRolePassword = $null
}
