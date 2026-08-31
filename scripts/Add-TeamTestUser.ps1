[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string] $Email,
    [Parameter(Mandatory = $true)][string] $DisplayName,
    [Parameter(Mandatory = $true)][string] $Initials,
    [Parameter(Mandatory = $true)][string] $RoleCode,
    [string] $Department = 'IoT',
    [string] $Level = '',
    [string] $RuntimeRoot = (Join-Path $env:LOCALAPPDATA 'IoTTeamCenter\TeamTest')
)

$ErrorActionPreference = 'Stop'
$values = @($Email, $DisplayName, $Initials, $RoleCode, $Department, $Level)
if ($values | Where-Object { $_ -match '[\x22\x27\r\n]|\$\(' }) {
    throw 'Provisioning values cannot contain quotes, line breaks, or a SQLCMD expansion marker.'
}

$settings = Get-Content -LiteralPath (Join-Path $RuntimeRoot 'settings.json') -Raw | ConvertFrom-Json
$secrets = Get-Content -LiteralPath (Join-Path $RuntimeRoot 'secrets.json') -Raw | ConvertFrom-Json
$provisioningScriptPath = Join-Path (Split-Path -Parent $PSScriptRoot) 'database\scripts\035_provision_team_test_user.sql'
$sqlcmdInputPath = Join-Path ([IO.Path]::GetTempPath()) ("iot-team-test-provision-$([Guid]::NewGuid().ToString('N')).sql")
$sqlcmdInput = @(
    ":setvar DatabaseName `"$($settings.DatabaseName)`""
    ":setvar Email `"$Email`""
    ":setvar DisplayName `"$DisplayName`""
    ":setvar Initials `"$Initials`""
    ":setvar RoleCode `"$RoleCode`""
    ":setvar Department `"$Department`""
    ":setvar Level `"$Level`""
    ':setvar ConfirmTeamTest "YES"'
    ":r `"$provisioningScriptPath`""
) -join [Environment]::NewLine

$sqlcmdExitCode = 1
try {
    [IO.File]::WriteAllText($sqlcmdInputPath, $sqlcmdInput, [Text.UTF8Encoding]::new($true))
    & sqlcmd -S $settings.SqlServer -d master -E -C -b -i $sqlcmdInputPath
    $sqlcmdExitCode = $LASTEXITCODE
}
finally {
    if (Test-Path -LiteralPath $sqlcmdInputPath) { Remove-Item -LiteralPath $sqlcmdInputPath -Force }
}
if ($sqlcmdExitCode -ne 0) { throw 'Team-test user provisioning failed.' }

$secureSigningKey = ConvertTo-SecureString $secrets.TeamTestSigningKey
$keyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureSigningKey)
$hmac = $null
$keyBytes = $null
try {
    $signingKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPointer)
    $normalizedEmail = $Email.Trim().ToLowerInvariant()
    $keyBytes = [Text.Encoding]::UTF8.GetBytes($signingKey)
    $hmac = [Security.Cryptography.HMACSHA256]::new($keyBytes)
    $digest = $hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($normalizedEmail))
    $accessCode = [Convert]::ToBase64String($digest).TrimEnd('=').Replace('+', '-').Replace('/', '_')
    [pscustomobject]@{ Email = $normalizedEmail; Role = $RoleCode; AccessCode = $accessCode }
}
finally {
    if ($hmac) { $hmac.Dispose() }
    if ($keyBytes) { [Array]::Clear($keyBytes, 0, $keyBytes.Length) }
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPointer)
}
