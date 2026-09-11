<#
.SYNOPSIS
    Backup-first operator tool for the Team Test schema 39 -> 43 upgrade.

.DESCRIPTION
    Applies migrations 040, 041, 042 and 043 to the pinned Team Test database, in order,
    one at a time, stopping at the first error and verifying the exact schema
    identity after each one.

    Every mutating step is gated:

      * -AllowUntrustedTeamTestCertificate  the same explicit exception the local
        launcher requires before SQL credentials are sent.
      * -IHaveABackup                       the operator states a restorable backup
        already exists; this script still takes its own COPY_ONLY one.
        -SkipBackup may be used instead only when the operator explicitly accepts
        applying this non-production upgrade without a restore point.
      * -ConfirmDatabase IoTTeamCenterTeamTest  the database name must be retyped and
        must match the pinned target exactly.
      * -BackupDirectory                    a server-side path for the pre-migration
        backup, which is then proven with RESTORE VERIFYONLY.

    The read-only preflight (Invoke-TeamTestSchemaPreflight.ps1) runs first and any
    blocker it reports stops the upgrade.

    API automatic migration is never enabled. This script applies migrations itself
    and refuses to run if Database__RunMigrations is switched on in the environment.

.PARAMETER WhatIf
    Prints the exact sequence that would run and exits. In this mode the script does
    not open a SQL connection, read a credential, back anything up or change anything.

.EXAMPLE
    .\Invoke-TeamTestSchemaUpgrade.ps1 -WhatIf

.EXAMPLE
    .\Invoke-TeamTestSchemaUpgrade.ps1 -AllowUntrustedTeamTestCertificate -IHaveABackup `
        -ConfirmDatabase IoTTeamCenterTeamTest -BackupDirectory 'D:\SQLBackup'

.EXAMPLE
    .\Invoke-TeamTestSchemaUpgrade.ps1 -AllowUntrustedTeamTestCertificate -SkipBackup `
        -ConfirmDatabase IoTTeamCenterTeamTest
#>
[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
param(
    [string] $DatabaseServer = '202.151.188.68',
    [string] $DatabaseName = 'IoTTeamCenterTeamTest',

    # Operator attestation that a restorable backup of this database already exists.
    [switch] $IHaveABackup,

    # Explicit operator override for a disposable/non-production database where
    # the user has accepted running without a backup.
    [switch] $SkipBackup,

    # The target database name, retyped. Must match $DatabaseName exactly.
    [string] $ConfirmDatabase,

    [switch] $AllowUntrustedTeamTestCertificate,

    # Server-side directory for the COPY_ONLY pre-migration backup.
    [string] $BackupDirectory,

    # DBA login. Prompted for if omitted. The password stays in a SecureString and
    # is passed through SqlCredential, so it never appears in a process argument,
    # a connection string, a log line or a file.
    [System.Management.Automation.PSCredential] $DbaCredential,

    [string] $RuntimeRoot = (Join-Path $env:LOCALAPPDATA 'IoTTeamCenter\TeamTest')
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path

$plan = @(
    [pscustomobject]@{ Version = 40; File = '040_estimate_overhead_policy.sql'; Name = 'Immutable overhead policies and estimate revision snapshots' }
    [pscustomobject]@{ Version = 41; File = '041_user_role_management.sql'; Name = 'Admin-managed primary user roles with audited least-privilege writes' }
    [pscustomobject]@{ Version = 42; File = '042_estimate_total_guard.sql'; Name = 'Guard estimate aggregates within supported decimal precision' }
    [pscustomobject]@{ Version = 43; File = '043_estimate_erp_cost_mapping.sql'; Name = 'Revision-scoped Estimate ERP cost classifications' }
)
$preflightScript = Join-Path $PSScriptRoot 'Invoke-TeamTestSchemaPreflight.ps1'

if ($DatabaseServer -ne '202.151.188.68' -or $DatabaseName -ne 'IoTTeamCenterTeamTest') {
    throw 'This upgrade tool is pinned to the approved Team Test SQL endpoint and database.'
}
foreach ($migration in $plan) {
    $path = Join-Path $repoRoot ('database/migrations/' + $migration.File)
    if (!(Test-Path -LiteralPath $path) -or !(Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "Required migration file is missing: $path"
    }
}
if (!(Test-Path -LiteralPath $preflightScript)) { throw "Required preflight script is missing: $preflightScript" }

# ---------------------------------------------------------------------------------
# -WhatIf: describe the sequence and stop. No connection, no credential, no change.
# ---------------------------------------------------------------------------------
if ($WhatIfPreference) {
    Write-Output "What if: Team Test schema upgrade 39 -> 43 against $DatabaseName on $DatabaseServer."
    Write-Output 'What if: no SQL connection is opened, no credential is read and nothing is changed in this mode.'
    Write-Output ''
    Write-Output 'Gates that a real run requires:'
    Write-Output '  1. -AllowUntrustedTeamTestCertificate  explicit Team Test certificate exception'
    Write-Output '  2. Choose -IHaveABackup or explicit -SkipBackup'
    Write-Output "  3. -ConfirmDatabase $DatabaseName      the exact database name, retyped"
    Write-Output '  4. -BackupDirectory <server-side path> unless -SkipBackup is selected'
    Write-Output '  5. -DbaCredential                      a DBA login (prompted for if omitted)'
    Write-Output ''
    Write-Output 'Sequence a real run would perform:'
    Write-Output "  Step 1. Run Invoke-TeamTestSchemaPreflight.ps1 against $DatabaseName and refuse every reported blocker."
    if ($SkipBackup) {
        Write-Output '  Step 2. Skip backup by explicit operator request.'
        Write-Output '  Step 3. Continue without RESTORE VERIFYONLY.'
    }
    else {
        Write-Output "  Step 2. BACKUP DATABASE [$DatabaseName] TO DISK = '<BackupDirectory>/$($DatabaseName)_before_schema43_<timestamp>.bak' WITH COPY_ONLY, CHECKSUM, INIT, STATS = 5."
        Write-Output '  Step 3. RESTORE VERIFYONLY FROM DISK = <that file> WITH CHECKSUM.'
    }
    $step = 4
    foreach ($migration in $plan) {
        Write-Output "  Step $step. Apply database/migrations/$($migration.File), stopping on the first error."
        $step++
        Write-Output "  Step $step. Verify dbo.schema_versions holds exactly version $($migration.Version) named '$($migration.Name)' and that it is the new maximum."
        $step++
    }
    Write-Output "  Step $step. Print the final schema version and the backup file path for the handover record."
    Write-Output ''
    Write-Output 'API automatic migration (Database__RunMigrations) is never enabled by this script.'
    Write-Output 'What if: finished without connecting to the database.'
    return
}

# ---------------------------------------------------------------------------------
# Gates for a real run.
# ---------------------------------------------------------------------------------
if (!$AllowUntrustedTeamTestCertificate) {
    throw 'The SQL certificate chain is not trusted. Refusing to send SQL credentials. Install the issuing CA/use a trusted DNS certificate, or explicitly pass -AllowUntrustedTeamTestCertificate for the existing Team Test exception.'
}
if ($SkipBackup -and $IHaveABackup) {
    throw 'Choose either -IHaveABackup or -SkipBackup, not both.'
}
if (!$SkipBackup -and !$IHaveABackup) {
    throw 'Refusing to migrate without -IHaveABackup. Take and verify a restorable backup first; this script then takes its own COPY_ONLY backup on top of it.'
}
if ($ConfirmDatabase -cne $DatabaseName) {
    throw "Refusing to migrate: -ConfirmDatabase must be exactly '$DatabaseName'."
}
if (!$SkipBackup -and [string]::IsNullOrWhiteSpace($BackupDirectory)) {
    throw 'Refusing to migrate without -BackupDirectory. It must be a path the SQL Server service account can write to on the database host.'
}
if ($env:Database__RunMigrations -eq 'true') {
    throw 'Database__RunMigrations is enabled in this environment. This upgrade applies migrations explicitly; automatic API migration must stay disabled.'
}
if (!$DbaCredential) {
    $DbaCredential = Get-Credential -Message "DBA login for $DatabaseName on $DatabaseServer"
}
if (!$DbaCredential) { throw 'A DBA credential is required.' }

$settingsPath = Join-Path $RuntimeRoot 'settings.json'
$secretsPath = Join-Path $RuntimeRoot 'secrets.json'
if (!(Test-Path -LiteralPath $settingsPath) -or !(Test-Path -LiteralPath $secretsPath)) {
    throw "The installed Team Test settings and DPAPI secrets are required at $RuntimeRoot."
}

function Unprotect-LocalString([string] $CipherText) {
    $secureValue = ConvertTo-SecureString $CipherText
    $valuePointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureValue)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($valuePointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($valuePointer) }
}

# ---------------------------------------------------------------------------------
# Step 1: read-only preflight. Any blocker stops the upgrade.
# ---------------------------------------------------------------------------------
Write-Output 'Step 1: running the read-only preflight.'
$preflight = & $preflightScript -DatabaseServer $DatabaseServer -DatabaseName $DatabaseName `
    -AllowUntrustedTeamTestCertificate:$AllowUntrustedTeamTestCertificate -RuntimeRoot $RuntimeRoot -DbaCredential $DbaCredential
if (!$preflight.ready) {
    throw ("Preflight refused this database:`n  " + (($preflight.blockers) -join "`n  "))
}
Write-Output "Preflight passed at schema version $($preflight.evidence.maxSchemaVersion) with $($preflight.evidence.liveEstimateCount) live estimate(s)."

# ---------------------------------------------------------------------------------
# Connection. The stored connection string supplies server, database and encryption
# settings; the DBA password is supplied separately as a SqlCredential.
# ---------------------------------------------------------------------------------
$settings = Get-Content -LiteralPath $settingsPath -Raw | ConvertFrom-Json
$secrets = Get-Content -LiteralPath $secretsPath -Raw | ConvertFrom-Json
$storedConnectionString = Unprotect-LocalString $secrets.ConnectionString
$builder = [System.Data.SqlClient.SqlConnectionStringBuilder]::new($storedConnectionString)
if (
    $builder.DataSource -ne $DatabaseServer `
    -or $builder.InitialCatalog -ne $DatabaseName `
    -or $builder.UserID -ne $settings.AppLogin `
    -or !$builder.Encrypt `
    -or !$builder.TrustServerCertificate
) {
    throw 'Installed credentials do not match the pinned Team Test server, database and login.'
}
$builder.Remove('User ID') | Out-Null
$builder.Remove('Password') | Out-Null
# PowerShell's property binder serializes this as the unsupported keyword
# "IntegratedSecurity". Use the canonical connection-string key explicitly.
$builder['Integrated Security'] = $false
$storedConnectionString = $null

$securePassword = $DbaCredential.Password.Copy()
$securePassword.MakeReadOnly()
$sqlCredential = [System.Data.SqlClient.SqlCredential]::new($DbaCredential.UserName, $securePassword)
$connection = [System.Data.SqlClient.SqlConnection]::new($builder.ConnectionString, $sqlCredential)

function Invoke-UpgradeSql {
    param([Parameter(Mandatory)][string] $Sql, [int] $TimeoutSeconds = 600, [hashtable] $Parameters = @{})
    $command = $connection.CreateCommand()
    try {
        $command.CommandText = $Sql
        $command.CommandTimeout = $TimeoutSeconds
        foreach ($name in $Parameters.Keys) { [void]$command.Parameters.AddWithValue($name, $Parameters[$name]) }
        [void]$command.ExecuteNonQuery()
    }
    finally { $command.Dispose() }
}

function Invoke-UpgradeScalar {
    param([Parameter(Mandatory)][string] $Sql, [hashtable] $Parameters = @{})
    $command = $connection.CreateCommand()
    try {
        $command.CommandText = $Sql
        $command.CommandTimeout = 120
        foreach ($name in $Parameters.Keys) { [void]$command.Parameters.AddWithValue($name, $Parameters[$name]) }
        return $command.ExecuteScalar()
    }
    finally { $command.Dispose() }
}

# sqlcmd's GO is a client directive, so the file is split the same way here.
function Split-SqlBatches([string] $Sql) {
    return [regex]::Split($Sql, '(?im)^\s*GO\s*(?:--[^\r\n]*)?\s*$') |
        Where-Object { $_.Trim().Length -gt 0 }
}

$backupFile = $null
try {
    $connection.Open()

    $actualDatabase = [string](Invoke-UpgradeScalar 'SELECT DB_NAME();')
    if ($actualDatabase -cne $DatabaseName) {
        throw "Connected database is '$actualDatabase', not the confirmed '$DatabaseName'."
    }

    # -----------------------------------------------------------------------------
    # Steps 2 and 3: COPY_ONLY backup with CHECKSUM, then RESTORE VERIFYONLY.
    # -----------------------------------------------------------------------------
    if ($SkipBackup) {
        Write-Warning 'Backup explicitly skipped by the operator. The upgrade will apply migrations without a restore point.'
    }
    else {
        $timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
        # This script runs on Windows while the approved SQL Server runs on Linux.
        # Preserve the separator style of the server-side path instead of applying
        # the operator workstation's filesystem rules through Join-Path.
        $separator = if ($BackupDirectory.Contains('/')) { '/' } else { '\' }
        $trimmedBackupDirectory = $BackupDirectory.TrimEnd([char[]]@('/', '\'))
        $backupFile = $trimmedBackupDirectory + $separator + ("{0}_before_schema43_{1}.bak" -f $DatabaseName, $timestamp)
        if (!$PSCmdlet.ShouldProcess($DatabaseName, "COPY_ONLY backup to $backupFile")) {
            throw 'The pre-migration backup was not approved. No migration was applied.'
        }
        Write-Output "Step 2: backing up $DatabaseName to $backupFile."
        Invoke-UpgradeSql -Sql "BACKUP DATABASE [$DatabaseName] TO DISK = @path WITH COPY_ONLY, CHECKSUM, INIT, NAME = N'Before Team Test schema 43', STATS = 5;" -Parameters @{ '@path' = $backupFile } -TimeoutSeconds 7200
        Write-Output 'Step 3: verifying the backup.'
        Invoke-UpgradeSql -Sql 'RESTORE VERIFYONLY FROM DISK = @path WITH CHECKSUM;' -Parameters @{ '@path' = $backupFile } -TimeoutSeconds 7200
        Write-Output 'Backup verified.'
    }

    # -----------------------------------------------------------------------------
    # Steps 4+: one migration at a time, stop on first error, verify each identity.
    # -----------------------------------------------------------------------------
    foreach ($migration in $plan) {
        $version = $migration.Version
        $file = $migration.File
        $expectedName = $migration.Name
        if (!$PSCmdlet.ShouldProcess($DatabaseName, "apply migration $file")) { continue }

        Write-Output "Applying migration $file."
        $sql = Get-Content -LiteralPath (Join-Path $repoRoot ('database/migrations/' + $file)) -Raw
        $batches = Split-SqlBatches $sql
        try {
            foreach ($batch in $batches) { Invoke-UpgradeSql -Sql $batch }
        }
        catch {
            # A migration that failed mid-transaction must not leave one open on this
            # connection; XACT_ABORT normally rolls back, this is the belt and braces.
            try { Invoke-UpgradeSql -Sql 'IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;' -TimeoutSeconds 60 } catch { }
            $recovery = if ($backupFile) { "Restore from $backupFile if the database is not consistent." } else { 'No backup was created for this run.' }
            throw "Migration $file failed and the upgrade stopped. Nothing after it was applied. $recovery Error: $($_.Exception.Message)"
        }

        $identity = Invoke-UpgradeScalar 'SELECT name FROM dbo.schema_versions WHERE version = @version;' -Parameters @{ '@version' = $version }
        if ([string]$identity -cne $expectedName) {
            throw "Migration $file did not record schema version $version as '$expectedName' (found '$identity'). The upgrade stopped."
        }
        $maximum = [int](Invoke-UpgradeScalar 'SELECT MAX(version) FROM dbo.schema_versions;')
        if ($maximum -ne $version) {
            throw "After $file the maximum schema version is $maximum, not $version. The upgrade stopped."
        }
        Write-Output "Verified schema version $version - $expectedName."
    }

    $finalVersion = [int](Invoke-UpgradeScalar 'SELECT MAX(version) FROM dbo.schema_versions;')
    Write-Output ''
    Write-Output "$DatabaseName is now at schema version $finalVersion."
    Write-Output $(if ($backupFile) { "Pre-migration backup: $backupFile" } else { 'Pre-migration backup: SKIPPED by operator request' })
    Write-Output 'API automatic migration was not enabled. Restart the API separately and confirm Database__RunMigrations is still false.'
}
finally {
    $connection.Dispose()
    $builder.Password = ''
    $sqlCredential = $null
}
