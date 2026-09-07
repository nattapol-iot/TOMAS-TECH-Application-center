[CmdletBinding()]
param(
    [string] $RuntimeRoot = (Join-Path $env:LOCALAPPDATA 'IoTTeamCenter\TeamTest'),
    [string] $HostAddress = '127.0.0.1',
    [ValidateRange(1, 65535)]
    [int] $Port = 5105
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$serverPath = Join-Path $projectRoot 'dist\src\server.js'
$settingsPath = Join-Path $RuntimeRoot 'settings.json'
$secretsPath = Join-Path $RuntimeRoot 'secrets.json'

if (!(Test-Path -LiteralPath $serverPath)) {
    throw "Node backend build is missing: $serverPath. Run npm run build in backend-node first."
}
if (!(Test-Path -LiteralPath $settingsPath) -or !(Test-Path -LiteralPath $secretsPath)) {
    throw 'Team Test runtime is not installed.'
}

function Unprotect-String([string] $CipherText) {
    $secureValue = ConvertTo-SecureString $CipherText
    $valuePointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureValue)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($valuePointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($valuePointer) }
}

$settings = Get-Content -Raw -LiteralPath $settingsPath | ConvertFrom-Json
$secrets = Get-Content -Raw -LiteralPath $secretsPath | ConvertFrom-Json
$connectionString = Unprotect-String $secrets.ConnectionString
$signingKey = Unprotect-String $secrets.TeamTestSigningKey
$applicationRolePassword = if ($secrets.ApplicationRolePassword) {
    Unprotect-String $secrets.ApplicationRolePassword
} else {
    $null
}

try {
    $env:NODE_ENV = 'staging'
    $env:HOST = $HostAddress
    $env:PORT = [string]$Port
    $env:AllowedHosts = "localhost;127.0.0.1;$HostAddress"
    $env:Authentication__Mode = 'TeamTest'
    $env:Authentication__TeamTestSigningKey = $signingKey
    $env:ConnectionStrings__IoTTeamCenter = $connectionString
    $env:Database__TrustServerCertificateForTeamTest = [string]$settings.TrustServerCertificateForTeamTest
    $env:Cors__AllowedOrigins__0 = $settings.FrontendOrigin
    $env:Business__TimeZoneId = 'Asia/Bangkok'
    $env:DocumentStorage__Mode = 'Local'
    $env:DocumentStorage__RootPath = Join-Path $RuntimeRoot 'documents'
    $env:Email__Mode = 'Disabled'
    if ($applicationRolePassword) {
        $env:Database__ApplicationRoleName = $settings.AppLogin
        $env:Database__ApplicationRolePassword = $applicationRolePassword
    }

    & (Get-Command node -ErrorAction Stop).Source $serverPath
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
