[CmdletBinding()]
param(
    [switch] $Apply,
    [string] $ActorEmail = 'nattapol.p@tomastc.com',
    [string] $RuntimeRoot = (Join-Path $env:LOCALAPPDATA 'IoTTeamCenter\TeamTest')
)

$ErrorActionPreference = 'Stop'
$settings = Get-Content -LiteralPath (Join-Path $RuntimeRoot 'settings.json') -Raw | ConvertFrom-Json
if ([string]$settings.DatabaseName -notmatch '^[A-Za-z0-9_]+$') { throw 'Unsafe Team Test database name.' }
if ($ActorEmail -match '[\x22\x27\r\n]' -or $ActorEmail.Length -gt 256) { throw 'Unsafe actor email.' }

function Get-SignificantTokens([string] $Name) {
    $tokens = @([regex]::Matches($Name.ToUpperInvariant().Replace('&', ' AND '), '[A-Z0-9]+') | ForEach-Object { $_.Value })
    $noise = @('CO', 'LTD', 'LIMITED', 'COMPANY', 'CORPORATION', 'PUBLIC', 'PTE', 'PVT', 'PT', 'MR')
    $tokens = @($tokens | Where-Object { $_ -notin $noise })
    if ($tokens.Count -gt 1 -and $tokens[0].Length -eq 1) {
        $letters = [Collections.Generic.List[string]]::new()
        $index = 0
        while ($index -lt $tokens.Count -and $tokens[$index].Length -eq 1) {
            $letters.Add($tokens[$index])
            $index += 1
        }
        $tokens = @(($letters -join '')) + @($tokens[$index..($tokens.Count - 1)])
    }
    return @($tokens)
}

function Get-ShortCode([string[]] $Tokens, [int] $Depth) {
    if ($Tokens.Count -eq 0) { throw 'Customer name has no usable code characters.' }
    $take = [Math]::Min([Math]::Max(1, $Depth), $Tokens.Count)
    $code = ($Tokens[0..($take - 1)] -join '-')
    if ($code.Length -le 30) { return $code }
    $bytes = [Text.Encoding]::UTF8.GetBytes($code)
    $sha = [Security.Cryptography.SHA256]::Create()
    try {
        $hash = ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-', '').Substring(0, 4)
        return $code.Substring(0, 25).TrimEnd('-') + '-' + $hash
    }
    finally { $sha.Dispose(); [Array]::Clear($bytes, 0, $bytes.Length) }
}

$rows = @(& sqlcmd -S $settings.SqlServer -d $settings.DatabaseName -E -C -W -s '|' -h -1 `
    -Q "SET NOCOUNT ON; SELECT code,name FROM dbo.customers WHERE deleted_at IS NULL AND code LIKE N'CSV-%' ORDER BY code;")
if ($LASTEXITCODE -ne 0) { throw 'Could not read imported customers.' }
$customers = @($rows | Where-Object { $_ -match '\|' } | ForEach-Object {
    $parts = $_ -split '\|', 2
    $name = $parts[1].Trim()
    $tokens = Get-SignificantTokens $name
    if ($name -match '^(?i)Hitachi\s+Astemo\b') { $tokens = @('ASTEMO') }
    [pscustomobject]@{ OldCode = $parts[0].Trim(); Name = $name; Tokens = $tokens; Depth = if ($tokens[0].Length -le 2 -and $tokens.Count -gt 1) { 2 } else { 1 }; NewCode = '' }
})
if ($customers.Count -eq 0) {
    [pscustomobject]@{ Status = 'NO_IMPORTED_CUSTOMERS'; Count = 0 }
    exit 0
}

foreach ($iteration in 1..10) {
    foreach ($customer in $customers) { $customer.NewCode = Get-ShortCode $customer.Tokens $customer.Depth }
    $duplicates = @($customers | Group-Object NewCode | Where-Object Count -gt 1)
    if ($duplicates.Count -eq 0) { break }
    foreach ($group in $duplicates) {
        foreach ($customer in $group.Group) {
            if ($customer.Depth -lt $customer.Tokens.Count) { $customer.Depth += 1 }
        }
    }
}

$remainingDuplicates = @($customers | Group-Object NewCode | Where-Object Count -gt 1)
foreach ($group in $remainingDuplicates) {
    $ordered = @($group.Group | Sort-Object OldCode)
    for ($index = 0; $index -lt $ordered.Count; $index += 1) {
        $suffix = '-{0:D2}' -f ($index + 1)
        $baseLength = 30 - $suffix.Length
        $ordered[$index].NewCode = $ordered[$index].NewCode.Substring(0, [Math]::Min($baseLength, $ordered[$index].NewCode.Length)).TrimEnd('-') + $suffix
    }
}

if (@($customers | Where-Object { $_.NewCode -notmatch '^[A-Z0-9][A-Z0-9-]{0,29}$' }).Count -gt 0) { throw 'Generated customer code is invalid.' }
if (@($customers | Group-Object NewCode | Where-Object Count -gt 1).Count -gt 0) { throw 'Generated customer codes are not unique.' }

$otherCodes = @(& sqlcmd -S $settings.SqlServer -d $settings.DatabaseName -E -C -W -h -1 `
    -Q "SET NOCOUNT ON; SELECT code FROM dbo.customers WHERE deleted_at IS NULL AND code NOT LIKE N'CSV-%';")
if ($LASTEXITCODE -ne 0) { throw 'Could not validate existing customer codes.' }
$otherCodeSet = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
foreach ($code in $otherCodes) { if ($code.Trim()) { [void]$otherCodeSet.Add($code.Trim()) } }
if (@($customers | Where-Object { $otherCodeSet.Contains($_.NewCode) }).Count -gt 0) { throw 'A generated code conflicts with an existing customer code.' }

if (!$Apply) {
    $customers | Select-Object OldCode,NewCode,Name
    [pscustomobject]@{ Status = 'PREVIEW'; Count = $customers.Count }
    exit 0
}

$sqlPath = Join-Path ([IO.Path]::GetTempPath()) ("iot-customer-code-normalization-$([Guid]::NewGuid().ToString('N')).sql")
$mappingRows = $customers | ForEach-Object { "(N'$($_.OldCode)', N'$($_.NewCode)')" }
$sql = @"
SET NOCOUNT ON;
SET XACT_ABORT ON;
USE [$($settings.DatabaseName)];
BEGIN TRY
    BEGIN TRANSACTION;
    DECLARE @actor bigint = (
        SELECT u.id
        FROM dbo.users u
        INNER JOIN dbo.roles r ON r.id = u.role_id
        INNER JOIN dbo.role_permissions rp ON rp.role_id = r.id
        INNER JOIN dbo.permissions p ON p.id = rp.permission_id
        WHERE u.email = N'$ActorEmail' AND u.is_active = 1 AND u.deleted_at IS NULL AND p.code = N'master.write'
    );
    IF @actor IS NULL THROW 51210, 'The audit actor does not have master.write permission.', 1;

    DECLARE @mapping table (old_code nvarchar(30) PRIMARY KEY, new_code nvarchar(30) UNIQUE);
    INSERT INTO @mapping(old_code, new_code) VALUES
    $($mappingRows -join ",`r`n    ");

    IF (SELECT COUNT(*) FROM dbo.customers c INNER JOIN @mapping m ON m.old_code = c.code WHERE c.deleted_at IS NULL) <> (SELECT COUNT(*) FROM @mapping)
        THROW 51211, 'The imported customer set changed after preview.', 1;
    IF EXISTS (SELECT 1 FROM dbo.customers c INNER JOIN @mapping m ON m.new_code = c.code WHERE c.code <> m.old_code AND c.deleted_at IS NULL)
        THROW 51212, 'A generated customer code conflicts with an existing record.', 1;

    DECLARE @changed table (id bigint, old_code nvarchar(30), new_code nvarchar(30), name nvarchar(300));
    UPDATE c
    SET code = m.new_code, updated_by = @actor, updated_at = SYSUTCDATETIME()
    OUTPUT inserted.id, deleted.code, inserted.code, inserted.name INTO @changed(id, old_code, new_code, name)
    FROM dbo.customers c INNER JOIN @mapping m ON m.old_code = c.code
    WHERE c.deleted_at IS NULL;

    INSERT INTO dbo.audit_log(actor_id, entity_type, entity_id, entity_no, action, before_json, after_json, reason)
    SELECT @actor, N'Customer', changed.id, changed.new_code, N'Code Updated',
           (SELECT changed.old_code AS code FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
           (SELECT changed.new_code AS code, changed.name AS name FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
           N'Normalized imported customer code to a readable Demo-style business code'
    FROM @changed changed;

    COMMIT TRANSACTION;
    SELECT COUNT(*) AS updated_count FROM @changed;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
"@

try {
    [IO.File]::WriteAllText($sqlPath, $sql, [Text.UTF8Encoding]::new($true))
    & sqlcmd -S $settings.SqlServer -d master -E -C -b -i $sqlPath
    if ($LASTEXITCODE -ne 0) { throw 'Customer code normalization failed.' }
}
finally {
    if (Test-Path -LiteralPath $sqlPath) { Remove-Item -LiteralPath $sqlPath -Force }
}

[pscustomobject]@{
    Status = 'UPDATED'
    Count = $customers.Count
    Examples = @($customers | Select-Object -First 12 OldCode,NewCode,Name)
}
