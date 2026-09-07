[CmdletBinding()]
param(
    [switch] $Apply,
    [string] $ActorEmail = 'nattapol.p@tomastc.com',
    [string] $DataPath,
    [string] $RuntimeRoot = (Join-Path $env:LOCALAPPDATA 'IoTTeamCenter\TeamTest')
)

$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
if (!$DataPath) { $DataPath = Join-Path $projectRoot 'database\imports\pj260068_supplier_price_history.json' }
$normalizedDataPath = [IO.Path]::GetFullPath($DataPath)
$projectPrefix = $projectRoot.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
if (!$normalizedDataPath.StartsWith($projectPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'DataPath must stay within the project workspace.'
}
if (!(Test-Path -LiteralPath $normalizedDataPath -PathType Leaf)) { throw "Import data is missing: $normalizedDataPath" }
if ($ActorEmail -match '[\x22\x27\r\n]' -or $ActorEmail.Length -gt 256) { throw 'Unsafe actor email.' }

$records = @(Get-Content -LiteralPath $normalizedDataPath -Raw | ConvertFrom-Json)
if ($records.Count -ne 76) { throw "Expected 76 audited PR lines, found $($records.Count)." }
if (@($records | Group-Object sourceKey | Where-Object Count -ne 1).Count -ne 0) { throw 'Source keys must be unique.' }
if (@($records | Where-Object { !$_.sourceKey -or !$_.itemCode -or !$_.description -or !$_.supplierName -or !$_.purchaseOrderNumber }).Count -ne 0) {
    throw 'Every history row requires source key, item code, description, supplier, and PO number.'
}
$supplierCount = @($records.supplierName | Sort-Object -Unique).Count
$quotationCount = @($records.quotationNumber | Where-Object { $_ } | Sort-Object -Unique).Count
$actualTotal = [decimal](($records | Measure-Object -Property actualLineCost -Sum).Sum)
if ($supplierCount -ne 9 -or $quotationCount -ne 16 -or [Math]::Abs($actualTotal - [decimal]304084.29) -gt [decimal]0.005) {
    throw "Audited control totals do not match (suppliers=$supplierCount, quotations=$quotationCount, total=$actualTotal)."
}

$preview = [pscustomobject]@{
    Status = $(if ($Apply) { 'VALIDATED_FOR_IMPORT' } else { 'PREVIEW' })
    Project = 'PJ260068 — Belt Conveyor B-G-Line'
    Lines = $records.Count
    Suppliers = $supplierCount
    QuotationReferences = $quotationCount
    ActualCostTHB = $actualTotal
    DataPath = $normalizedDataPath
}
if (!$Apply) { $preview; exit 0 }

$settingsPath = Join-Path $RuntimeRoot 'settings.json'
if (!(Test-Path -LiteralPath $settingsPath -PathType Leaf)) { throw 'Team Test runtime is not installed.' }
$settings = Get-Content -LiteralPath $settingsPath -Raw | ConvertFrom-Json
if ([string]$settings.SqlServer -notmatch '^[A-Za-z0-9_.\\(),-]+$') { throw 'Unsafe Team Test SQL Server name.' }
if ([string]$settings.DatabaseName -notmatch '^[A-Za-z0-9_]+$') { throw 'Unsafe Team Test database name.' }
if ([string]$settings.AppLogin -notmatch '^[A-Za-z][A-Za-z0-9_]{2,63}$') { throw 'Unsafe Team Test application principal.' }

$migrationPath = Join-Path $projectRoot 'database\migrations\012_supplier_price_history.sql'
$permissionsPath = Join-Path $projectRoot 'database\scripts\010_application_login.sql'
$versionResult = @(& sqlcmd -S $settings.SqlServer -d $settings.DatabaseName -E -C -W -h -1 -Q 'SET NOCOUNT ON; SELECT COUNT_BIG(*) FROM dbo.schema_versions WHERE version = 12;')
if ($LASTEXITCODE -ne 0) { throw 'Could not read Team Test schema version.' }
$versionInstalled = [long](($versionResult | Where-Object { $_.Trim() -match '^\d+$' } | Select-Object -First 1).Trim()) -eq 1
if (!$versionInstalled) {
    & sqlcmd -S $settings.SqlServer -d $settings.DatabaseName -E -C -b -i $migrationPath
    if ($LASTEXITCODE -ne 0) { throw 'Supplier price history migration failed.' }
}

& sqlcmd -S $settings.SqlServer -d master -E -C -b -i $permissionsPath -v "DatabaseName=$($settings.DatabaseName)" "AppLogin=$($settings.AppLogin)"
if ($LASTEXITCODE -ne 0) { throw 'Application role permission refresh failed.' }

function ConvertTo-SqlLiteral([AllowNull()] $Value) {
    if ($null -eq $Value) { return 'NULL' }
    return "N'$(([string]$Value).Replace("'", "''"))'"
}
function ConvertTo-SqlDecimal($Value) {
    return ([decimal]$Value).ToString('0.####', [Globalization.CultureInfo]::InvariantCulture)
}
function Get-SupplierCode([string] $Name) {
    $known = @{
        'EMMA' = 'EMMA'; 'KPT1993 Co., Ltd.' = 'KPT1993'; 'Planet T&S' = 'PLANET-TS';
        'Waree Pitak' = 'WAREE-PITAK'; 'Misumi' = 'MISUMI'; 'Natthawat 3556' = 'NATTHAWAT-3556';
        'Piyapoj Electric' = 'PIYAPOJ'; 'Helukabel' = 'HELUKABEL'; 'Shopee' = 'SHOPEE'
    }
    if ($known.ContainsKey($Name)) { return $known[$Name] }
    $code = (($Name.ToUpperInvariant() -replace '[^A-Z0-9]+', '-') -replace '(^-|-$)', '')
    if (!$code) { throw "Cannot generate supplier code for $Name." }
    return $code.Substring(0, [Math]::Min(30, $code.Length))
}

$supplierValues = @($records.supplierName | Sort-Object -Unique | ForEach-Object {
    "($(ConvertTo-SqlLiteral (Get-SupplierCode $_)), $(ConvertTo-SqlLiteral $_))"
})
$historyValues = @($records | ForEach-Object {
    $dateValue = if ($_.quotationDate) { "CONVERT(date, $(ConvertTo-SqlLiteral $_.quotationDate), 23)" } else { 'NULL' }
    $sourceFile = if ($_.sourceQuotationFile) { ConvertTo-SqlLiteral $_.sourceQuotationFile } else { 'NULL' }
    "($(ConvertTo-SqlLiteral $_.sourceKey), $(ConvertTo-SqlLiteral $_.projectNumber), $(ConvertTo-SqlLiteral $_.projectName), $(ConvertTo-SqlLiteral $_.customerName), $([int]$_.lineNumber), N'03', N'Electrical', N'Historical Purchase', $(ConvertTo-SqlLiteral $_.itemCode), $(ConvertTo-SqlLiteral $_.description), $(ConvertTo-SqlLiteral $_.brand), $(ConvertTo-SqlLiteral $_.supplierName), $(ConvertTo-SqlDecimal $_.quantity), $(ConvertTo-SqlLiteral $_.unit), $(ConvertTo-SqlDecimal $_.quoteUnitPrice), $(ConvertTo-SqlDecimal $_.actualUnitCost), $(ConvertTo-SqlDecimal $_.actualLineCost), $([int]$_.leadTimeDays), $(ConvertTo-SqlLiteral $_.quotationNumber), $dateValue, $(ConvertTo-SqlLiteral $_.purchaseOrderNumber), $(ConvertTo-SqlLiteral $_.purchaseOrderStatus), $(ConvertTo-SqlLiteral $_.remark), $(ConvertTo-SqlLiteral $_.sourceWorkbook), $sourceFile)"
})

$actorLiteral = ConvertTo-SqlLiteral $ActorEmail
$importBatchLiteral = ConvertTo-SqlLiteral 'PJ260068-PR-20260425-001-v1'
$sql = @"
SET NOCOUNT ON;
SET XACT_ABORT ON;
USE [$($settings.DatabaseName)];
BEGIN TRY
    BEGIN TRANSACTION;
    DECLARE @actor bigint = (
        SELECT TOP (1) u.id
        FROM dbo.users u
        INNER JOIN dbo.roles r ON r.id = u.role_id
        INNER JOIN dbo.role_permissions rp ON rp.role_id = r.id
        INNER JOIN dbo.permissions p ON p.id = rp.permission_id
        WHERE u.email = $actorLiteral AND u.is_active = 1 AND u.deleted_at IS NULL AND p.code = N'master.write'
    );
    IF @actor IS NULL THROW 51230, 'The import actor does not have master.write permission.', 1;

    DECLARE @suppliers table (code nvarchar(30) NOT NULL, name nvarchar(300) NOT NULL PRIMARY KEY);
    INSERT INTO @suppliers(code, name) VALUES
    $($supplierValues -join ",`r`n    ");

    INSERT INTO dbo.suppliers(code, name, category, contact, email, phone, brands_json, is_active, created_by, updated_by)
    SELECT source.code, source.name, N'Electrical', N'', N'', N'', N'[]', 1, @actor, @actor
    FROM @suppliers source
    WHERE NOT EXISTS (SELECT 1 FROM dbo.suppliers target WHERE target.name = source.name AND target.deleted_at IS NULL)
      AND NOT EXISTS (SELECT 1 FROM dbo.suppliers target WHERE target.code = source.code AND target.deleted_at IS NULL);

    DECLARE @source table (
        source_key nvarchar(300) NOT NULL PRIMARY KEY, project_number nvarchar(100) NOT NULL, project_name nvarchar(300) NOT NULL,
        customer_name nvarchar(300) NOT NULL, line_number int NOT NULL, category_code char(2) NOT NULL, category nvarchar(100) NOT NULL,
        module nvarchar(200) NOT NULL, item_code nvarchar(100) NOT NULL, description nvarchar(500) NOT NULL, brand nvarchar(100) NOT NULL,
        supplier_name nvarchar(300) NOT NULL, quantity decimal(19,4) NOT NULL, unit nvarchar(50) NOT NULL, quote_unit_price decimal(19,4) NOT NULL,
        actual_unit_cost decimal(19,4) NOT NULL, actual_line_cost decimal(19,4) NOT NULL, lead_time_days int NOT NULL,
        quotation_number nvarchar(200) NOT NULL, quotation_date date NULL, purchase_order_number nvarchar(100) NOT NULL,
        purchase_order_status nvarchar(100) NOT NULL, remark nvarchar(max) NOT NULL, source_workbook nvarchar(260) NOT NULL,
        source_quotation_file nvarchar(260) NULL
    );
    INSERT INTO @source VALUES
    $($historyValues -join ",`r`n    ");

    DECLARE @inserted table (id bigint NOT NULL, source_key nvarchar(300) NOT NULL, purchase_order_number nvarchar(100) NOT NULL);
    INSERT INTO dbo.supplier_price_history(
        source_key, project_number, project_name, customer_name, line_number, category_code, category, module,
        item_code, description, brand, supplier_id, supplier_name, quantity, unit, quote_unit_price, actual_unit_cost,
        actual_line_cost, lead_time_days, quotation_number, quotation_date, purchase_order_number, purchase_order_status,
        remark, source_workbook, source_quotation_file, import_batch, imported_by)
    OUTPUT inserted.id, inserted.source_key, inserted.purchase_order_number INTO @inserted(id, source_key, purchase_order_number)
    SELECT source.source_key, source.project_number, source.project_name, source.customer_name, source.line_number,
           source.category_code, source.category, source.module, source.item_code, source.description, source.brand,
           supplier.id, source.supplier_name, source.quantity, source.unit, source.quote_unit_price, source.actual_unit_cost,
           source.actual_line_cost, source.lead_time_days, source.quotation_number, source.quotation_date,
           source.purchase_order_number, source.purchase_order_status, source.remark, source.source_workbook,
           source.source_quotation_file, $importBatchLiteral, @actor
    FROM @source source
    LEFT JOIN dbo.suppliers supplier ON supplier.name = source.supplier_name AND supplier.deleted_at IS NULL
    WHERE NOT EXISTS (SELECT 1 FROM dbo.supplier_price_history target WHERE target.source_key = source.source_key);

    IF EXISTS (SELECT 1 FROM @source source LEFT JOIN dbo.suppliers supplier ON supplier.name = source.supplier_name AND supplier.deleted_at IS NULL WHERE supplier.id IS NULL)
        THROW 51231, 'One or more supplier names could not be resolved.', 1;

    INSERT INTO dbo.audit_log(actor_id, entity_type, entity_id, entity_no, action, after_json, reason)
    SELECT @actor, N'SupplierPriceHistory', inserted.id, inserted.purchase_order_number, N'Historical Price Imported',
           (SELECT inserted.source_key AS sourceKey, $importBatchLiteral AS importBatch FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
           N'Imported from audited PJ260068 PR workbook and linked supplier quotation files'
    FROM @inserted inserted;

    DECLARE @database_count bigint = (SELECT COUNT_BIG(*) FROM dbo.supplier_price_history WHERE import_batch = $importBatchLiteral);
    DECLARE @database_total decimal(19,4) = (SELECT COALESCE(SUM(actual_line_cost), 0) FROM dbo.supplier_price_history WHERE import_batch = $importBatchLiteral);
    IF @database_count <> 76 OR ABS(@database_total - CONVERT(decimal(19,4), 304084.29)) > CONVERT(decimal(19,4), 0.005)
        THROW 51232, 'Post-import control totals do not match the audited source.', 1;

    COMMIT TRANSACTION;
    SELECT COUNT_BIG(*) AS inserted_count FROM @inserted;
    SELECT @database_count AS imported_count, @database_total AS actual_cost_thb;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
"@

$sqlPath = Join-Path ([IO.Path]::GetTempPath()) ("iot-supplier-price-history-$([Guid]::NewGuid().ToString('N')).sql")
try {
    [IO.File]::WriteAllText($sqlPath, $sql, [Text.UTF8Encoding]::new($true))
    & sqlcmd -S $settings.SqlServer -d master -E -C -b -i $sqlPath
    if ($LASTEXITCODE -ne 0) { throw 'Historical supplier price import failed.' }
}
finally {
    if (Test-Path -LiteralPath $sqlPath) { Remove-Item -LiteralPath $sqlPath -Force }
}

[pscustomobject]@{
    Status = 'IMPORTED'
    Project = 'PJ260068 — Belt Conveyor B-G-Line'
    Lines = 76
    Suppliers = 9
    QuotationReferences = 16
    ActualCostTHB = [decimal]304084.29
    Database = $settings.DatabaseName
}
