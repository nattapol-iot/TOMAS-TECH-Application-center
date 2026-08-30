[CmdletBinding()]
param(
    [string] $SqlServer = 'localhost',
    [Parameter(Mandatory = $true)][string] $DatabaseName,
    [string] $AppLogin = 'iot_team_app_uat',
    [string] $FrontendOrigin = 'https://iot-team-center-preview.vercel.app',
    [string] $AllowedHosts = 'localhost;127.0.0.1',
    [string] $PrivateLanAddress = '',
    [switch] $AllowPrivateLanHttp,
    [ValidateRange(1024, 65535)]
    [int] $ApiPort = 5105,
    [switch] $TrustServerCertificateForTeamTest,
    [string] $RuntimeRoot = (Join-Path $env:LOCALAPPDATA 'IoTTeamCenter\TeamTest')
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'TeamTestLanValidation.ps1')
if ($AppLogin -notmatch '^[A-Za-z][A-Za-z0-9_]{2,63}$') { throw 'AppLogin contains unsupported characters.' }
if ($DatabaseName -notmatch '^[A-Za-z][A-Za-z0-9_]{2,127}$') { throw 'DatabaseName contains unsupported characters.' }
$runtimeBase = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'IoTTeamCenter\TeamTest'))
$normalizedRuntimeRoot = [IO.Path]::GetFullPath($RuntimeRoot)
$runtimePrefix = $runtimeBase.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
if (!$normalizedRuntimeRoot.Equals($runtimeBase, [StringComparison]::OrdinalIgnoreCase) `
    -and !$normalizedRuntimeRoot.StartsWith($runtimePrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw "RuntimeRoot must stay within $runtimeBase."
}
$RuntimeRoot = $normalizedRuntimeRoot
$frontendUri = Get-TeamTestCanonicalOrigin $FrontendOrigin

if ($AllowPrivateLanHttp) {
    if (!(Test-TeamTestPrivateLanIpv4 $PrivateLanAddress)) { throw 'PrivateLanAddress must be a canonical private IPv4 address.' }
    if ($frontendUri.Scheme -ne 'http' -or $frontendUri.Host -ne $PrivateLanAddress) {
        throw 'Private LAN mode requires an HTTP FrontendOrigin hosted on PrivateLanAddress.'
    }
    $assignedAddresses = [Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces() |
        ForEach-Object { $_.GetIPProperties().UnicastAddresses } |
        ForEach-Object { $_.Address.IPAddressToString }
    if ($PrivateLanAddress -notin $assignedAddresses) { throw 'PrivateLanAddress is not assigned to this machine.' }
    $allowedHostEntries = @($AllowedHosts.Split(';', [StringSplitOptions]::RemoveEmptyEntries) | ForEach-Object { $_.Trim() })
    if ($PrivateLanAddress -notin $allowedHostEntries) { $allowedHostEntries += $PrivateLanAddress }
    $AllowedHosts = ($allowedHostEntries | Select-Object -Unique) -join ';'
}
elseif ($PrivateLanAddress) {
    throw 'PrivateLanAddress requires AllowPrivateLanHttp.'
}
elseif ($frontendUri.Scheme -ne 'https') {
    throw 'FrontendOrigin must use HTTPS unless explicit private LAN mode is enabled.'
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$releaseId = [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss', [Globalization.CultureInfo]::InvariantCulture)
$releasePath = Join-Path $RuntimeRoot "releases\$releaseId"
$secretsPath = Join-Path $RuntimeRoot 'secrets.json'
$settingsPath = Join-Path $RuntimeRoot 'settings.json'

if (Test-Path -LiteralPath (Join-Path $RuntimeRoot 'api.pid.json')) {
    & (Join-Path $PSScriptRoot 'Stop-TeamTestHost.ps1') -RuntimeRoot $RuntimeRoot
}

New-Item -ItemType Directory -Path $releasePath -Force | Out-Null
$currentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
& icacls $RuntimeRoot /inheritance:r /grant:r "${currentIdentity}:(OI)(CI)F" 'NT AUTHORITY\SYSTEM:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Failed to restrict the Team Test runtime directory ACL.' }

& dotnet publish (Join-Path $projectRoot 'backend\IoTTeamCenter.Api\IoTTeamCenter.Api.csproj') `
    -c Release --no-self-contained -o $releasePath
if ($LASTEXITCODE -ne 0) { throw 'dotnet publish failed.' }

function New-RandomSecret([int] $byteCount) {
    $bytes = New-Object byte[] $byteCount
    $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
    $generator.GetBytes($bytes)
    try { return [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_') }
    finally {
        [Array]::Clear($bytes, 0, $bytes.Length)
        $generator.Dispose()
    }
}

$sqlPassword = New-RandomSecret 48
$signingKey = New-RandomSecret 48
$adminBuilder = [System.Data.SqlClient.SqlConnectionStringBuilder]::new()
$adminBuilder['Data Source'] = $SqlServer
$adminBuilder['Initial Catalog'] = 'master'
$adminBuilder['Integrated Security'] = $true
$adminBuilder['Encrypt'] = $true
$adminBuilder['TrustServerCertificate'] = $true
$adminBuilder['Persist Security Info'] = $false

$adminConnection = [System.Data.SqlClient.SqlConnection]::new($adminBuilder.ConnectionString)
try {
    $adminConnection.Open()
    $quotedLogin = '[' + $AppLogin.Replace(']', ']]') + ']'
    $loginLiteral = $AppLogin.Replace("'", "''")
    $passwordLiteral = $sqlPassword.Replace("'", "''")
    $authenticationModeCommand = $adminConnection.CreateCommand()
    $authenticationModeCommand.CommandText = "SELECT CAST(SERVERPROPERTY('IsIntegratedSecurityOnly') AS int);"
    $windowsAuthenticationOnly = [int]$authenticationModeCommand.ExecuteScalar() -eq 1

    if ($windowsAuthenticationOnly) {
        $databaseAdminBuilder = [System.Data.SqlClient.SqlConnectionStringBuilder]::new($adminBuilder.ConnectionString)
        $databaseAdminBuilder['Initial Catalog'] = $DatabaseName
        $databaseAdminConnection = [System.Data.SqlClient.SqlConnection]::new($databaseAdminBuilder.ConnectionString)
        try {
            $databaseAdminConnection.Open()
            $applicationRoleCommand = $databaseAdminConnection.CreateCommand()
            $applicationRoleCommand.CommandText = @"
IF EXISTS (SELECT 1 FROM sys.database_principals WHERE name=N'$loginLiteral' AND type<>N'A')
    THROW 51070, 'AppLogin already names a non-application-role database principal; choose a dedicated AppLogin.', 1;
IF EXISTS (SELECT 1 FROM sys.database_principals WHERE name=N'$loginLiteral' AND type=N'A')
BEGIN
    IF EXISTS (
        SELECT 1
        FROM sys.database_role_members drm
        INNER JOIN sys.database_principals role_principal ON role_principal.principal_id = drm.role_principal_id
        INNER JOIN sys.database_principals member_principal ON member_principal.principal_id = drm.member_principal_id
        WHERE role_principal.name=N'iot_team_app_role' AND member_principal.name=N'$loginLiteral'
    ) ALTER ROLE [iot_team_app_role] DROP MEMBER $quotedLogin;
    DROP APPLICATION ROLE $quotedLogin;
END;
CREATE APPLICATION ROLE $quotedLogin WITH PASSWORD=N'$passwordLiteral';
"@
            [void]$applicationRoleCommand.ExecuteNonQuery()
        }
        finally {
            $databaseAdminConnection.Dispose()
        }
    }
    else {
        $databaseCheckBuilder = [System.Data.SqlClient.SqlConnectionStringBuilder]::new($adminBuilder.ConnectionString)
        $databaseCheckBuilder['Initial Catalog'] = $DatabaseName
        $databaseCheckConnection = [System.Data.SqlClient.SqlConnection]::new($databaseCheckBuilder.ConnectionString)
        try {
            $databaseCheckConnection.Open()
            $databaseCheckCommand = $databaseCheckConnection.CreateCommand()
            $databaseCheckCommand.CommandText = "SELECT COUNT_BIG(*) FROM sys.database_principals WHERE name=N'$loginLiteral' AND NOT (type=N'S' AND authentication_type_desc=N'INSTANCE' AND sid=SUSER_SID(N'$loginLiteral'));"
            if ([long]$databaseCheckCommand.ExecuteScalar() -ne 0) {
                throw 'AppLogin already names an incompatible database principal; choose a dedicated AppLogin.'
            }
        }
        finally {
            $databaseCheckConnection.Dispose()
        }
        $loginCommand = $adminConnection.CreateCommand()
        $loginCommand.CommandText = "IF SUSER_ID(N'$loginLiteral') IS NULL CREATE LOGIN $quotedLogin WITH PASSWORD=N'$passwordLiteral', CHECK_POLICY=ON, CHECK_EXPIRATION=OFF; ELSE BEGIN ALTER LOGIN $quotedLogin WITH PASSWORD=N'$passwordLiteral'; ALTER LOGIN $quotedLogin ENABLE; END;"
        [void]$loginCommand.ExecuteNonQuery()
    }
}
finally {
    $adminConnection.Dispose()
}

& sqlcmd -S $SqlServer -d master -E -C -b `
    -i (Join-Path $projectRoot 'database\scripts\010_application_login.sql') `
    -v "DatabaseName=$DatabaseName" "AppLogin=$AppLogin"
if ($LASTEXITCODE -ne 0) { throw 'Application-role provisioning failed.' }

$appBuilder = [System.Data.SqlClient.SqlConnectionStringBuilder]::new()
$appBuilder['Data Source'] = $SqlServer
$appBuilder['Initial Catalog'] = $DatabaseName
if ($windowsAuthenticationOnly) {
    $appBuilder['Integrated Security'] = $true
}
else {
    $appBuilder['User ID'] = $AppLogin
    $appBuilder['Password'] = $sqlPassword
}
$appBuilder['Encrypt'] = $true
$appBuilder['TrustServerCertificate'] = [bool]$TrustServerCertificateForTeamTest
$appBuilder['Persist Security Info'] = $false
$appBuilder['Application Name'] = 'IoTTeamCenter.Api.TeamTest'

$connectionCipher = ConvertFrom-SecureString (ConvertTo-SecureString $appBuilder.ConnectionString -AsPlainText -Force)
$signingCipher = ConvertFrom-SecureString (ConvertTo-SecureString $signingKey -AsPlainText -Force)
$secretValues = @{ ConnectionString = $connectionCipher; TeamTestSigningKey = $signingCipher }
if ($windowsAuthenticationOnly) {
    $secretValues.ApplicationRolePassword = ConvertFrom-SecureString (ConvertTo-SecureString $sqlPassword -AsPlainText -Force)
}
$secretsJson = $secretValues | ConvertTo-Json
[IO.File]::WriteAllText($secretsPath, $secretsJson)

$settingsJson = @{
    ReleasePath = $releasePath
    SqlServer = $SqlServer
    DatabaseName = $DatabaseName
    AppLogin = $AppLogin
    DatabaseAuthenticationMode = $(if ($windowsAuthenticationOnly) { 'ApplicationRole' } else { 'SqlLogin' })
    FrontendOrigin = $FrontendOrigin
    AllowedHosts = $AllowedHosts
    ListenUrls = $(if ($AllowPrivateLanHttp) { "http://127.0.0.1:${ApiPort};http://${PrivateLanAddress}:${ApiPort}" } else { "http://127.0.0.1:${ApiPort}" })
    AllowPrivateLanHttp = [bool]$AllowPrivateLanHttp
    PrivateLanAddress = $PrivateLanAddress
    ApiPort = $ApiPort
    TrustServerCertificateForTeamTest = [bool]$TrustServerCertificateForTeamTest
} | ConvertTo-Json
[IO.File]::WriteAllText($settingsPath, $settingsJson)

$sqlPassword = $null
$signingKey = $null
if (!$windowsAuthenticationOnly) { $appBuilder['Password'] = '' }

& (Join-Path $PSScriptRoot 'Start-TeamTestHost.ps1') -RuntimeRoot $RuntimeRoot
