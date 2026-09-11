[CmdletBinding()]
param(
    [ValidateRange(1024, 65535)][int] $ApiPort = 5116,
    [string] $DatabaseServer = '202.151.188.68',
    [string] $DatabaseName = 'IoTTeamCenterTeamTest',
    [int] $ExpectedSchemaVersion = 43,
    [switch] $AllowUntrustedTeamTestCertificate,
    [switch] $AllowRemoteWrites,
    [string] $RuntimeRoot = (Join-Path $env:LOCALAPPDATA 'IoTTeamCenter\TeamTest')
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$backendRoot = Join-Path $projectRoot 'backend-node'
$settingsPath = Join-Path $RuntimeRoot 'settings.json'
$secretsPath = Join-Path $RuntimeRoot 'secrets.json'

if ($DatabaseServer -ne '202.151.188.68' -or $DatabaseName -ne 'IoTTeamCenterTeamTest') {
    throw 'This launcher is pinned to the approved Team Test SQL endpoint and database.'
}
if (!(Test-Path -LiteralPath $settingsPath) -or !(Test-Path -LiteralPath $secretsPath)) {
    throw 'The installed Team Test settings and DPAPI secrets are required.'
}
if (!$AllowUntrustedTeamTestCertificate) {
    throw 'The SQL certificate chain is not trusted. Refusing to send SQL credentials. Install the issuing CA/use a trusted DNS certificate, or explicitly pass -AllowUntrustedTeamTestCertificate for the existing Team Test exception.'
}
if (Get-NetTCPConnection -State Listen -LocalPort $ApiPort -ErrorAction SilentlyContinue) {
    throw "Local API port $ApiPort is already in use."
}

function Unprotect-LocalString([string] $CipherText) {
    $secureValue = ConvertTo-SecureString $CipherText
    $valuePointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureValue)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($valuePointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($valuePointer) }
}

$settings = Get-Content -LiteralPath $settingsPath -Raw | ConvertFrom-Json
$secrets = Get-Content -LiteralPath $secretsPath -Raw | ConvertFrom-Json
$connectionString = Unprotect-LocalString $secrets.ConnectionString
$signingKey = Unprotect-LocalString $secrets.TeamTestSigningKey
$applicationRolePassword = if ($secrets.ApplicationRolePassword) {
    Unprotect-LocalString $secrets.ApplicationRolePassword
}
else { $null }
$builder = [System.Data.SqlClient.SqlConnectionStringBuilder]::new($connectionString)
if (
    $builder.DataSource -ne $DatabaseServer `
    -or $builder.InitialCatalog -ne $DatabaseName `
    -or $builder.UserID -ne $settings.AppLogin `
    -or !$builder.Encrypt `
    -or !$builder.TrustServerCertificate
) {
    throw 'Installed credentials do not match the pinned Team Test server, database and login.'
}

# Prove the database, contiguous version history and required migration identities before exporting credentials to the API.
$expectedMigrationNames = [ordered]@{
    25 = 'Unified revisioned reports and customer acknowledgment'
    26 = 'Durable role-scoped KPI performance reviews'
    27 = 'Reusable sanitized report templates and frozen provenance'
    28 = 'Optional end user companies for inquiries and projects'
    29 = 'Role-specific Sales KPI performance reviews'
    30 = 'Customer and contact names in Thai, English and Japanese'
    31 = 'Customer contact titles in Thai, English and Japanese'
    32 = 'Estimate Excel import audited historical rate provenance'
    33 = 'Historical PR workbook imports with source versions and reconciliation links'
    34 = 'Support Center and reporter contribution points'
    35 = 'Team activity, reporting discipline and versioned KPI contribution'
    36 = 'Report evidence images with immutable file hashes'
    37 = 'Archive generated report PDF/PPTX exports on NAS storage'
    38 = 'supplier_quotation_lines'
    39 = 'NAS storage connection draft settings'
    40 = 'Immutable overhead policies and estimate revision snapshots'
    41 = 'Admin-managed primary user roles with audited least-privilege writes'
    42 = 'Guard estimate aggregates within supported decimal precision'
    43 = 'Revision-scoped Estimate ERP cost classifications'
}
$connection = [System.Data.SqlClient.SqlConnection]::new($connectionString)
try {
    $connection.Open()
    $command = $connection.CreateCommand()
    $command.CommandText = 'SELECT DB_NAME() database_name, version, name FROM dbo.schema_versions ORDER BY version;'
    $reader = $command.ExecuteReader()
    $appliedMigrations = @{}
    $actualDatabase = $null
    while ($reader.Read()) {
        $actualDatabase = $reader.GetString(0)
        $appliedMigrations[[int]$reader.GetInt32(1)] = $reader.GetString(2)
    }
    $reader.Close()
    if ($actualDatabase -ne $DatabaseName -or $appliedMigrations.Count -ne $ExpectedSchemaVersion) {
        throw "Expected $DatabaseName with $ExpectedSchemaVersion contiguous migrations; found $actualDatabase with $($appliedMigrations.Count). Review before continuing."
    }
    foreach ($version in 1..$ExpectedSchemaVersion) {
        if (!$appliedMigrations.ContainsKey($version)) { throw "Required schema version $version is missing." }
    }
    foreach ($entry in $expectedMigrationNames.GetEnumerator()) {
        if ($appliedMigrations[[int]$entry.Key] -ne [string]$entry.Value) {
            throw "Schema version $($entry.Key) identity does not match the candidate."
        }
    }
}
finally { $connection.Dispose() }

$localStorage = Join-Path $env:LOCALAPPDATA 'IoTTeamCenter\LocalReadOnly\documents'
New-Item -ItemType Directory -Path $localStorage -Force | Out-Null
$readOnly = !$AllowRemoteWrites
$environmentValues = @{
    NODE_ENV = 'staging'
    HOST = '127.0.0.1'
    PORT = [string]$ApiPort
    AllowedHosts = '127.0.0.1;localhost'
    Authentication__Mode = 'TeamTest'
    Authentication__TeamTestSigningKey = $signingKey
    Cors__AllowedOrigins__0 = 'http://127.0.0.1:3010'
    Cors__AllowedOrigins__1 = 'http://localhost:3010'
    Business__TimeZoneId = 'Asia/Bangkok'
    ConnectionStrings__IoTTeamCenter = $connectionString
    Database__TrustServerCertificateForTeamTest = 'true'
    Database__RunMigrations = 'false'
    Database__ReadOnly = if ($readOnly) { 'true' } else { 'false' }
    DocumentStorage__Mode = 'Local'
    DocumentStorage__RootPath = $localStorage
    Email__Mode = 'Disabled'
}
if ($applicationRolePassword) {
    $environmentValues.Database__ApplicationRoleName = [string]$settings.AppLogin
    $environmentValues.Database__ApplicationRolePassword = $applicationRolePassword
}
$previousEnvironment = @{}
try {
    foreach ($name in $environmentValues.Keys) {
        $previousEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
        [Environment]::SetEnvironmentVariable($name, $environmentValues[$name], 'Process')
    }
    $accessMode = if ($readOnly) { 'read-only' } else { 'writable' }
    Write-Output "Starting local $accessMode API at http://127.0.0.1:$ApiPort against $DatabaseName schema $ExpectedSchemaVersion."
    Write-Warning 'SQL certificate validation is disabled only for this explicit Team Test run.'
    if ($readOnly) {
        Write-Output 'Migrations, database transactions and mutating SQL/HTTP methods are disabled. GET, HEAD and OPTIONS remain available. Press Ctrl+C to stop.'
    }
    else {
        Write-Warning 'Remote Team Test writes are enabled. Changes are committed to 202.151.188.68. Automatic migrations and email delivery remain disabled.'
        Write-Output 'Press Ctrl+C to stop.'
    }
    & npm.cmd --prefix $backendRoot run dev
    if ($LASTEXITCODE -ne 0) { throw "Local API exited with code $LASTEXITCODE." }
}
finally {
    foreach ($name in $environmentValues.Keys) {
        [Environment]::SetEnvironmentVariable($name, $previousEnvironment[$name], 'Process')
    }
    $builder.Password = ''
    $connectionString = $null
    $signingKey = $null
    $applicationRolePassword = $null
}
