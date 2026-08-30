[CmdletBinding()]
param(
    [string] $RuntimeRoot = (Join-Path $env:LOCALAPPDATA 'IoTTeamCenter\TeamTest')
)

$ErrorActionPreference = 'Stop'
$settingsPath = Join-Path $RuntimeRoot 'settings.json'
$secretsPath = Join-Path $RuntimeRoot 'secrets.json'
$pidPath = Join-Path $RuntimeRoot 'api.pid.json'

if (!(Test-Path -LiteralPath $settingsPath) -or !(Test-Path -LiteralPath $secretsPath)) {
    throw 'Team Test runtime is not installed. Run Install-TeamTestHost.ps1 first.'
}

if (Test-Path -LiteralPath $pidPath) {
    $existingState = Get-Content -LiteralPath $pidPath -Raw | ConvertFrom-Json
    $existingProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $($existingState.ProcessId)" -ErrorAction SilentlyContinue
    if ($existingProcess -and $existingProcess.Name -eq 'dotnet.exe' -and $existingProcess.CommandLine -like "*$($existingState.ReleasePath)\IoTTeamCenter.Api.dll*") {
        [pscustomobject]@{ Status = 'ALREADY_RUNNING'; ProcessId = $existingState.ProcessId }
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

$settings = Get-Content -LiteralPath $settingsPath -Raw | ConvertFrom-Json
$secrets = Get-Content -LiteralPath $secretsPath -Raw | ConvertFrom-Json
$connectionString = Unprotect-String $secrets.ConnectionString
$signingKey = Unprotect-String $secrets.TeamTestSigningKey
$applicationRolePassword = if ($secrets.ApplicationRolePassword) { Unprotect-String $secrets.ApplicationRolePassword } else { $null }
$logRoot = Join-Path $RuntimeRoot 'logs'
New-Item -ItemType Directory -Path $logRoot -Force | Out-Null
$logStamp = [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss', [Globalization.CultureInfo]::InvariantCulture)

$env:ASPNETCORE_ENVIRONMENT = 'Staging'
$env:ASPNETCORE_URLS = "http://127.0.0.1:$($settings.ApiPort)"
$env:AllowedHosts = $settings.AllowedHosts
$env:Authentication__Mode = 'TeamTest'
$env:Authentication__TeamTestSigningKey = $signingKey
$env:Database__TrustServerCertificateForTeamTest = [string]$settings.TrustServerCertificateForTeamTest
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
    $health = $null
    foreach ($attempt in 1..15) {
        Start-Sleep -Seconds 1
        if ($process.HasExited) { throw "Team Test API exited with code $($process.ExitCode)." }
        try {
            $health = Invoke-WebRequest `
                -Uri "http://127.0.0.1:$($settings.ApiPort)/health/live" `
                -UseBasicParsing `
                -TimeoutSec 2
            if ($health.StatusCode -eq 200) { break }
        }
        catch {
            if ($attempt -eq 15) { throw }
        }
    }
    if (!$health -or $health.StatusCode -ne 200) { throw 'Team Test API did not become healthy in time.' }
    [IO.File]::WriteAllText($pidPath, (@{
        ProcessId = $process.Id
        ReleasePath = $settings.ReleasePath
        StartedAt = [DateTimeOffset]::Now.ToString('O')
    } | ConvertTo-Json))
    [pscustomobject]@{
        Status = 'RUNNING'
        ProcessId = $process.Id
        LocalOrigin = "http://127.0.0.1:$($settings.ApiPort)"
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
    $connectionString = $null
    $signingKey = $null
    $applicationRolePassword = $null
}
