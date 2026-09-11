<#
.SYNOPSIS
    Read-only readiness preflight for the Team Test schema 39 -> 43 upgrade.

.DESCRIPTION
    Connects to the pinned Team Test database and answers one question: is this
    database safe to upgrade from schema 39 to schema 43 right now?

    The script is SELECT-only by construction. Every statement it sends is routed
    through Invoke-PreflightQuery, which refuses any text that is not a single
    SELECT/WITH read, so this tool cannot back up, migrate, grant, restart or
    otherwise mutate the server even if it is edited carelessly later.

    Credentials come from the existing DPAPI-protected secrets file written by the
    Team Test host installer. The plaintext connection string is never printed,
    logged or returned; only the server, database and login name appear in evidence.

.OUTPUTS
    A machine-readable summary object (or JSON with -AsJson):

        ready      [bool]   $true only when Blockers is empty.
        blockers   [string[]] Conditions that must be fixed before upgrading.
        warnings   [string[]] Conditions an operator should read but that do not stop the upgrade.
        evidence   [hashtable] The measured facts each decision was made from.

.EXAMPLE
    .\Invoke-TeamTestSchemaPreflight.ps1 -AllowUntrustedTeamTestCertificate -AsJson
#>
[CmdletBinding()]
param(
    [string] $DatabaseServer = '202.151.188.68',
    [string] $DatabaseName = 'IoTTeamCenterTeamTest',

    # The only schema version this preflight will approve for a 39 -> 43 upgrade.
    [ValidateRange(1, 999)][int] $ExpectedSchemaVersion = 39,

    # Same explicit exception the local launcher requires. Without it the script
    # refuses to send SQL credentials over an untrusted certificate chain.
    [switch] $AllowUntrustedTeamTestCertificate,

    [string] $RuntimeRoot = (Join-Path $env:LOCALAPPDATA 'IoTTeamCenter\TeamTest'),

    # Optional elevated login for the owner/permission checks. Its password stays
    # in a SecureString and is passed through SqlCredential, never a connection string.
    [System.Management.Automation.PSCredential] $DbaCredential,

    [switch] $AsJson
)

$ErrorActionPreference = 'Stop'

if ($DatabaseServer -ne '202.151.188.68' -or $DatabaseName -ne 'IoTTeamCenterTeamTest') {
    throw 'This preflight is pinned to the approved Team Test SQL endpoint and database.'
}
if (!$AllowUntrustedTeamTestCertificate) {
    throw 'The SQL certificate chain is not trusted. Refusing to send SQL credentials. Install the issuing CA/use a trusted DNS certificate, or explicitly pass -AllowUntrustedTeamTestCertificate for the existing Team Test exception.'
}

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

# Anything that is not a single read is rejected before it reaches the server.
$mutatingKeywords = @(
    'INSERT', 'UPDATE', 'DELETE', 'MERGE', 'TRUNCATE', 'DROP', 'CREATE', 'ALTER',
    'GRANT', 'REVOKE', 'DENY', 'BACKUP', 'RESTORE', 'EXEC', 'EXECUTE', 'SHUTDOWN',
    'RECONFIGURE', 'BULK', 'WRITETEXT', 'UPDATETEXT', 'DBCC'
)

function Assert-ReadOnlySql([string] $Sql) {
    $stripped = [regex]::Replace($Sql, '--[^\r\n]*', ' ')
    $stripped = [regex]::Replace($stripped, '/\*[\s\S]*?\*/', ' ')
    if ($stripped -notmatch '^\s*(?:WITH|SELECT)\b') {
        throw 'Preflight refuses a statement that does not begin with SELECT or WITH.'
    }
    if ($stripped -match ';') {
        throw 'Preflight refuses batched statements.'
    }
    foreach ($keyword in $mutatingKeywords) {
        if ($stripped -match ('(?i)\b' + $keyword + '\b')) {
            throw "Preflight refuses a statement containing the mutating keyword $keyword."
        }
    }
}

$settings = Get-Content -LiteralPath $settingsPath -Raw | ConvertFrom-Json
$secrets = Get-Content -LiteralPath $secretsPath -Raw | ConvertFrom-Json
$connectionString = Unprotect-LocalString $secrets.ConnectionString
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

$loginName = [string]$builder.UserID
$sqlCredential = $null
if ($DbaCredential) {
    # Strip the stored login out of the connection string and supply the operator
    # credential separately, so no password is ever part of a string value.
    $builder.Remove('User ID') | Out-Null
    $builder.Remove('Password') | Out-Null
    # PowerShell's property binder serializes this as the unsupported keyword
    # "IntegratedSecurity". Use the canonical connection-string key explicitly.
    $builder['Integrated Security'] = $false
    $securePassword = $DbaCredential.Password.Copy()
    $securePassword.MakeReadOnly()
    $sqlCredential = [System.Data.SqlClient.SqlCredential]::new($DbaCredential.UserName, $securePassword)
    $loginName = $DbaCredential.UserName
}
$effectiveConnectionString = $builder.ConnectionString
$connectionString = $null

$blockers = [System.Collections.Generic.List[string]]::new()
$warnings = [System.Collections.Generic.List[string]]::new()
$evidence = [ordered]@{
    server                     = $DatabaseServer
    database                   = $DatabaseName
    login                      = $loginName
    checkedAtUtc               = (Get-Date).ToUniversalTime().ToString('o')
    expectedSchemaVersion      = $ExpectedSchemaVersion
    actualDatabase             = $null
    maxSchemaVersion           = $null
    schemaVersionCount         = $null
    missingSchemaVersions      = @()
    version37Name              = $null
    applicationRolePresent     = $null
    databaseOwnerSid           = $null
    databaseOwnerName          = $null
    liveEstimateCount          = $null
    overflowRiskEstimateCount  = $null
    overflowRiskEstimateIds    = @()
    maxObservedTotalMagnitude  = $null
}

$connection = if ($sqlCredential) {
    [System.Data.SqlClient.SqlConnection]::new($effectiveConnectionString, $sqlCredential)
}
else {
    [System.Data.SqlClient.SqlConnection]::new($effectiveConnectionString)
}

function Invoke-PreflightQuery {
    param([Parameter(Mandatory)][string] $Sql, [int] $TimeoutSeconds = 60)
    Assert-ReadOnlySql $Sql
    $command = $connection.CreateCommand()
    try {
        $command.CommandText = $Sql
        $command.CommandTimeout = $TimeoutSeconds
        $table = [System.Data.DataTable]::new()
        $reader = $command.ExecuteReader()
        try { $table.Load($reader) } finally { $reader.Close() }
        # PowerShell otherwise enumerates DataTable rows into the pipeline. Keep the
        # table intact because callers rely on its Rows collection, including when
        # the query returns exactly one row.
        return ,$table
    }
    finally { $command.Dispose() }
}

try {
    $connection.Open()

    # ---- Identity and schema history -------------------------------------------------
    $versions = Invoke-PreflightQuery 'SELECT DB_NAME() AS database_name, version, name FROM dbo.schema_versions'
    $appliedMigrations = @{}
    foreach ($row in $versions.Rows) {
        $evidence.actualDatabase = [string]$row['database_name']
        $appliedMigrations[[int]$row['version']] = [string]$row['name']
    }
    if ($evidence.actualDatabase -ne $DatabaseName) {
        $blockers.Add("Connected database is '$($evidence.actualDatabase)', not '$DatabaseName'.")
    }

    $evidence.schemaVersionCount = $appliedMigrations.Count
    $evidence.maxSchemaVersion = if ($appliedMigrations.Count -gt 0) { ($appliedMigrations.Keys | Measure-Object -Maximum).Maximum } else { 0 }

    if ($evidence.maxSchemaVersion -ne $ExpectedSchemaVersion) {
        $blockers.Add("Maximum schema version is $($evidence.maxSchemaVersion); this upgrade path requires exactly $ExpectedSchemaVersion.")
    }

    $missing = @()
    foreach ($version in 1..$ExpectedSchemaVersion) {
        if (!$appliedMigrations.ContainsKey($version)) { $missing += $version }
    }
    $evidence.missingSchemaVersions = $missing
    if ($missing.Count -gt 0) {
        $blockers.Add("Schema history is not contiguous 1-$ExpectedSchemaVersion; missing $($missing -join ', ').")
    }

    # Migration 041 aborts with 51411 if version 37 carries the legacy role identity,
    # so the same condition is reported here rather than discovered mid-upgrade.
    $evidence.version37Name = $appliedMigrations[37]
    if ($evidence.version37Name -ne 'Archive generated report PDF/PPTX exports on NAS storage') {
        $blockers.Add("Schema version 37 identity is '$($evidence.version37Name)'; expected 'Archive generated report PDF/PPTX exports on NAS storage'. Migration 041 will refuse this database.")
    }

    # ---- Application role and database owner ------------------------------------------
    $principal = Invoke-PreflightQuery "SELECT DATABASE_PRINCIPAL_ID(N'iot_team_app_role') AS role_id"
    $roleId = $principal.Rows[0]['role_id']
    $evidence.applicationRolePresent = -not ($roleId -is [DBNull])
    if (!$evidence.applicationRolePresent) {
        $blockers.Add("Database role 'iot_team_app_role' does not exist. Migrations 040-043 would silently skip every least-privilege grant.")
    }

    $owner = Invoke-PreflightQuery "SELECT CONVERT(nvarchar(100), CONVERT(varbinary(85), owner_sid), 1) AS owner_sid, SUSER_SNAME(owner_sid) AS owner_name FROM sys.databases WHERE name = DB_NAME()"
    if ($owner.Rows.Count -eq 0) {
        $blockers.Add('The database row could not be read from sys.databases; the connected login cannot see database metadata.')
    }
    else {
        $evidence.databaseOwnerSid = [string]$owner.Rows[0]['owner_sid']
        $ownerName = $owner.Rows[0]['owner_name']
        $evidence.databaseOwnerName = if ($ownerName -is [DBNull]) { $null } else { [string]$ownerName }
        if (!$evidence.databaseOwnerName) {
            # dbo.assert_estimate_totals runs WITH EXECUTE AS OWNER. An orphaned owner
            # makes that procedure uncallable after migration 042 lands.
            $blockers.Add("Database owner SID $($evidence.databaseOwnerSid) does not resolve to a login. dbo.assert_estimate_totals runs WITH EXECUTE AS OWNER and will fail. Reassign the owner (ALTER AUTHORIZATION) before upgrading.")
        }
    }

    # ---- Workload size -----------------------------------------------------------------
    $estimates = Invoke-PreflightQuery 'SELECT COUNT_BIG(*) AS live_estimates FROM dbo.estimates WHERE deleted_at IS NULL'
    $evidence.liveEstimateCount = [int64]$estimates.Rows[0]['live_estimates']

    # ---- Possible decimal(19,4) overflow blockers for migration 042 ---------------------
    # Migration 042 walks every live estimate through dbo.assert_estimate_totals and
    # aborts the whole transaction on error 51420. This mirrors the v_estimate_totals
    # arithmetic in float, which cannot overflow, so the offending estimates can be
    # named up front instead of discovered by a failed migration. Schema 39 has no
    # overhead snapshot table and migration 040 does not backfill one, so every
    # existing estimate reaches migration 042 with zero overhead.
    $overflowSql = @'
WITH material AS (
    SELECT estimate_id, revision,
           SUM(CASE WHEN category_code IN ('01','02','03','04','05') THEN CONVERT(float, line_total) ELSE 0 END) AS material_total,
           SUM(CASE WHEN category_code = '07' THEN CONVERT(float, line_total) ELSE 0 END) AS outsource_total,
           SUM(CASE WHEN category_code = '08' THEN CONVERT(float, line_total) ELSE 0 END) AS transportation_total,
           SUM(CASE WHEN category_code = '09' THEN CONVERT(float, line_total) ELSE 0 END) AS accommodation_total,
           SUM(CASE WHEN category_code IN ('06','10') THEN CONVERT(float, line_total) ELSE 0 END) AS other_total
    FROM dbo.cost_items WHERE deleted_at IS NULL GROUP BY estimate_id, revision
), effort AS (
    SELECT estimate_id, revision,
           SUM(CONVERT(float, line_cost)) AS engineering_total,
           SUM(CASE WHEN provider = N'Internal' THEN CONVERT(float, engineers) * CONVERT(float, man_days) * CONVERT(float, hours_per_day) ELSE 0 END) AS internal_direct_hours
    FROM dbo.manhour_lines WHERE deleted_at IS NULL GROUP BY estimate_id, revision
), expense AS (
    SELECT estimate_id, revision,
           SUM(CASE WHEN expense_type IN (N'Travel',N'Transportation') THEN CONVERT(float, line_total) ELSE 0 END) AS transportation_expense,
           SUM(CASE WHEN expense_type IN (N'Accommodation',N'Per Diem') THEN CONVERT(float, line_total) ELSE 0 END) AS accommodation_expense,
           SUM(CASE WHEN expense_type NOT IN (N'Travel',N'Transportation',N'Accommodation',N'Per Diem') THEN CONVERT(float, line_total) ELSE 0 END) AS other_expense
    FROM dbo.expense_lines WHERE deleted_at IS NULL GROUP BY estimate_id, revision
), other_cost AS (
    SELECT estimate_id, revision,
           SUM(CASE WHEN category = N'Outsource' THEN CONVERT(float, line_total) ELSE 0 END) AS outsource_total,
           SUM(CASE WHEN category = N'Transportation' THEN CONVERT(float, line_total) ELSE 0 END) AS transportation_total,
           SUM(CASE WHEN category = N'Accommodation' THEN CONVERT(float, line_total) ELSE 0 END) AS accommodation_total,
           SUM(CASE WHEN category NOT IN (N'Outsource',N'Transportation',N'Accommodation') THEN CONVERT(float, line_total) ELSE 0 END) AS other_total
    FROM dbo.other_cost_lines WHERE deleted_at IS NULL GROUP BY estimate_id, revision
), base AS (
    SELECT e.id AS estimate_id,
           COALESCE(m.material_total,0) AS material_total,
           COALESCE(f.engineering_total,0) AS engineering_total,
           COALESCE(m.outsource_total,0) + COALESCE(o.outsource_total,0) AS outsource_total,
           COALESCE(m.transportation_total,0) + COALESCE(x.transportation_expense,0) + COALESCE(o.transportation_total,0) AS transportation_total,
           COALESCE(m.accommodation_total,0) + COALESCE(x.accommodation_expense,0) + COALESCE(o.accommodation_total,0) AS accommodation_total,
           COALESCE(m.other_total,0) + COALESCE(x.other_expense,0) + COALESCE(o.other_total,0) AS other_total,
           COALESCE(f.internal_direct_hours,0) AS internal_direct_hours,
           CONVERT(float, e.contingency_rate) AS contingency_rate,
           CAST(NULL AS float) AS hourly_rate
    FROM dbo.estimates e
    LEFT JOIN material m ON m.estimate_id = e.id AND m.revision = e.revision
    LEFT JOIN effort f ON f.estimate_id = e.id AND f.revision = e.revision
    LEFT JOIN expense x ON x.estimate_id = e.id AND x.revision = e.revision
    LEFT JOIN other_cost o ON o.estimate_id = e.id AND o.revision = e.revision
    WHERE e.deleted_at IS NULL
), calculated AS (
    SELECT estimate_id, material_total, engineering_total, outsource_total,
           transportation_total, accommodation_total, other_total,
           material_total + engineering_total + outsource_total + transportation_total + accommodation_total + other_total AS base_total,
           CASE WHEN hourly_rate IS NULL THEN 0 ELSE internal_direct_hours * hourly_rate END AS overhead_total,
           contingency_rate
    FROM base
), magnitudes AS (
    SELECT estimate_id,
           base_total + overhead_total + ROUND(base_total * contingency_rate / 100.0, 0) AS grand_total,
           base_total, overhead_total,
           ROUND(base_total * contingency_rate / 100.0, 0) AS contingency_total,
           material_total, engineering_total, outsource_total,
           transportation_total, accommodation_total, other_total
    FROM calculated
)
SELECT estimate_id,
       (SELECT MAX(v) FROM (VALUES
            (ABS(grand_total)), (ABS(base_total)), (ABS(overhead_total)), (ABS(contingency_total)),
            (ABS(material_total)), (ABS(engineering_total)), (ABS(outsource_total)),
            (ABS(transportation_total)), (ABS(accommodation_total)), (ABS(other_total))
        ) AS parts(v)) AS max_magnitude
FROM magnitudes
'@

    $magnitudes = Invoke-PreflightQuery $overflowSql -TimeoutSeconds 300

    # decimal(19,4) holds up to 999999999999999.9999. Float carries roughly 15-16
    # significant digits, so a slightly conservative threshold is used: anything at
    # or above it is reported as a *possible* blocker for an operator to inspect.
    $overflowThreshold = 999999999999999.0
    $riskIds = @()
    $maxMagnitude = 0.0
    foreach ($row in $magnitudes.Rows) {
        $magnitude = $row['max_magnitude']
        if ($magnitude -is [DBNull]) { continue }
        $value = [double]$magnitude
        if ($value -gt $maxMagnitude) { $maxMagnitude = $value }
        if ($value -ge $overflowThreshold) { $riskIds += [int64]$row['estimate_id'] }
    }
    $evidence.maxObservedTotalMagnitude = $maxMagnitude
    $evidence.overflowRiskEstimateCount = $riskIds.Count
    $evidence.overflowRiskEstimateIds = @($riskIds | Sort-Object | Select-Object -First 50)
    if ($riskIds.Count -gt 0) {
        $blockers.Add("$($riskIds.Count) live estimate(s) may exceed the decimal(19,4) aggregate range and would abort migration 042 with error 51420. Estimate ids: $(($evidence.overflowRiskEstimateIds) -join ', ').")
    }

    if ($evidence.liveEstimateCount -eq 0) {
        $warnings.Add('There are no live estimates; migration 042 will validate nothing and cannot be judged by its duration here.')
    }
    if ($evidence.liveEstimateCount -gt 5000) {
        $warnings.Add("Migration 042 iterates $($evidence.liveEstimateCount) live estimates one at a time; plan the maintenance window from the rehearsed per-estimate duration.")
    }
}
finally {
    $connection.Dispose()
    $effectiveConnectionString = $null
    $builder.Password = ''
}

$summary = [pscustomobject]@{
    ready    = ($blockers.Count -eq 0)
    blockers = @($blockers)
    warnings = @($warnings)
    evidence = $evidence
}

Write-Host "Team Test schema preflight - $DatabaseName on $DatabaseServer"
Write-Host "  schema version : $($evidence.maxSchemaVersion) ($($evidence.schemaVersionCount) applied)"
Write-Host "  app role       : $($evidence.applicationRolePresent)"
Write-Host "  owner          : $(if ($evidence.databaseOwnerName) { $evidence.databaseOwnerName } else { 'UNRESOLVED' })"
Write-Host "  live estimates : $($evidence.liveEstimateCount)"
Write-Host "  ready          : $($summary.ready)"
foreach ($blocker in $summary.blockers) { Write-Host "  BLOCKER: $blocker" }
foreach ($warning in $summary.warnings) { Write-Host "  warning: $warning" }

if ($AsJson) { $summary | ConvertTo-Json -Depth 6 } else { $summary }
