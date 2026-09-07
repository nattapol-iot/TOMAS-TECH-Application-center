[CmdletBinding()]
param(
    [string] $SqlServer = $env:IOT_SQL_SERVER,
    [string] $SqlUser = $env:IOT_SQL_USER,
    [string] $SqlPassword = $env:IOT_SQL_PASSWORD
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($SqlServer)) { $SqlServer = 'localhost' }
if (-not [string]::IsNullOrWhiteSpace($SqlUser) -and [string]::IsNullOrWhiteSpace($SqlPassword)) {
    throw 'IOT_SQL_PASSWORD is required when IOT_SQL_USER is set.'
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$backendRoot = Join-Path $repoRoot 'backend\IoTTeamCenter.Api'
$databaseName = 'IoTTeamCenter_CI_{0}_{1}' -f ([DateTime]::UtcNow.ToString('yyyyMMddHHmmss')), ([Guid]::NewGuid().ToString('N'))
if ($databaseName -notmatch '^IoTTeamCenter_CI_[A-Za-z0-9_]+$') { throw 'Generated CI database name is outside the cleanup boundary.' }
$appRoleName = 'iot_ci_app_role'
$appRolePassword = '{0}{1}' -f ([Guid]::NewGuid().ToString('N')), ([Guid]::NewGuid().ToString('N'))

$sqlcmdBase = @('-S', $SqlServer, '-b', '-r1', '-C', '-I')
$oldSqlcmdPassword = $env:SQLCMDPASSWORD
if ([string]::IsNullOrWhiteSpace($SqlUser)) {
    $sqlcmdBase += '-E'
} else {
    $env:SQLCMDPASSWORD = $SqlPassword
    $sqlcmdBase += @('-U', $SqlUser)
}

function Invoke-SqlFile {
    param([Parameter(Mandatory)][string] $Path)
    Push-Location $repoRoot
    try {
        & sqlcmd @sqlcmdBase -i $Path -v "DatabaseName=$databaseName"
        if ($LASTEXITCODE -ne 0) { throw "sqlcmd failed for $Path with exit code $LASTEXITCODE." }
    } finally {
        Pop-Location
    }
}

function Invoke-SqlQuery {
    param(
        [Parameter(Mandatory)][string] $Database,
        [Parameter(Mandatory)][string] $Query
    )
    & sqlcmd @sqlcmdBase -d $Database -Q $Query
    if ($LASTEXITCODE -ne 0) { throw "sqlcmd query failed with exit code $LASTEXITCODE." }
}

function Get-FreePort {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
    $listener.Start()
    try { return ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port }
    finally { $listener.Stop() }
}

function Invoke-Api {
    param(
        [Parameter(Mandatory)][ValidateSet('GET', 'POST', 'PUT', 'DELETE')][string] $Method,
        [Parameter(Mandatory)][string] $Path,
        [Parameter(Mandatory)][string] $Identity,
        [object] $Body
    )
    $parameters = @{
        Uri = "$script:apiBase$Path"
        Method = $Method
        Headers = @{ 'X-Dev-User-Id' = $Identity }
        ContentType = 'application/json'
        TimeoutSec = 30
    }
    if ($null -ne $Body) { $parameters.Body = ($Body | ConvertTo-Json -Depth 20 -Compress) }
    try {
        return Invoke-RestMethod @parameters
    } catch {
        $details = $null
        if ($null -ne $_.ErrorDetails -and $null -ne $_.ErrorDetails.PSObject.Properties['Message']) {
            $details = $_.ErrorDetails.Message
        }
        if ([string]::IsNullOrWhiteSpace($details) -and $null -ne $_.Exception.Response) {
            try {
                $stream = $_.Exception.Response.GetResponseStream()
                $streamReader = [IO.StreamReader]::new($stream)
                try { $details = $streamReader.ReadToEnd() }
                finally { $streamReader.Dispose(); $stream.Dispose() }
            } catch { $details = $null }
        }
        $apiLogTail = ''
        if (Test-Path -LiteralPath $script:stdoutPath) {
            $apiLogTail = @(Get-Content -LiteralPath $script:stdoutPath -Tail 80) -join [Environment]::NewLine
        }
        if (Test-Path -LiteralPath $script:stderrPath) {
            $stderrTail = @(Get-Content -LiteralPath $script:stderrPath -Tail 80) -join [Environment]::NewLine
            $apiLogTail = @($apiLogTail, $stderrTail) -join [Environment]::NewLine
        }
        $failure = if (-not [string]::IsNullOrWhiteSpace($details)) { $details } else { $_.Exception.Message }
        if (-not [string]::IsNullOrWhiteSpace($apiLogTail)) {
            throw "API $Method $Path failed: $failure`nAPI error log tail:`n$apiLogTail"
        }
        throw "API $Method $Path failed: $failure"
    }
}

function Assert-ApiError {
    param(
        [Parameter(Mandatory)][ValidateSet('GET', 'POST', 'PUT', 'DELETE')][string] $Method,
        [Parameter(Mandatory)][string] $Path,
        [Parameter(Mandatory)][string] $Identity,
        [object] $Body,
        [Parameter(Mandatory)][string] $ExpectedCode,
        [int] $ExpectedStatus = 0
    )
    $parameters = @{
        Uri = "$script:apiBase$Path"
        Method = $Method
        Headers = @{ 'X-Dev-User-Id' = $Identity }
        ContentType = 'application/json'
        TimeoutSec = 30
    }
    if ($null -ne $Body) { $parameters.Body = ($Body | ConvertTo-Json -Depth 20 -Compress) }
    try {
        $null = Invoke-RestMethod @parameters
    } catch {
        if ($null -eq $_.Exception.Response) { throw }
        $status = [int]$_.Exception.Response.StatusCode
        $details = if ($null -ne $_.ErrorDetails) { $_.ErrorDetails.Message } else { $null }
        if ([string]::IsNullOrWhiteSpace($details)) {
            $stream = $_.Exception.Response.GetResponseStream()
            $streamReader = [IO.StreamReader]::new($stream)
            try { $details = $streamReader.ReadToEnd() }
            finally { $streamReader.Dispose(); $stream.Dispose() }
        }
        $payload = $details | ConvertFrom-Json
        if ($ExpectedStatus -gt 0) { Assert-Equal $status $ExpectedStatus "API $Method $Path status" }
        Assert-Equal $payload.code $ExpectedCode "API $Method $Path error code"
        return $payload
    }
    throw "API $Method $Path unexpectedly succeeded; expected error '$ExpectedCode'."
}

function Assert-Equal {
    param([object] $Actual, [object] $Expected, [string] $Label)
    if ($Actual -ne $Expected) { throw "$Label expected '$Expected' but received '$Actual'." }
}

$apiProcess = $null
$script:stdoutPath = Join-Path ([IO.Path]::GetTempPath()) ("iot-team-api-{0}.out.log" -f [Guid]::NewGuid().ToString('N'))
$stdoutPath = $script:stdoutPath
$script:stderrPath = Join-Path ([IO.Path]::GetTempPath()) ("iot-team-api-{0}.err.log" -f [Guid]::NewGuid().ToString('N'))
$stderrPath = $script:stderrPath
$cleanupEligible = $true

try {
    Invoke-SqlFile (Join-Path $repoRoot 'database\scripts\020_deploy_fresh_database.sql')
    Invoke-SqlFile (Join-Path $PSScriptRoot 'seed-ci-users.sql')
    $escapedAppRolePassword = $appRolePassword.Replace("'", "''")
    Invoke-SqlQuery $databaseName "IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NULL EXEC(N'CREATE ROLE [iot_team_app_role]'); CREATE APPLICATION ROLE [$appRoleName] WITH PASSWORD = N'$escapedAppRolePassword'; GRANT CONTROL TO [iot_team_app_role]; GRANT CONTROL ON SCHEMA::dbo TO [iot_team_app_role]; GRANT CONTROL TO [$appRoleName]; GRANT CONTROL ON SCHEMA::dbo TO [$appRoleName]; GRANT EXECUTE ON OBJECT::dbo.answer_schedule_day_request TO [public];"
    Push-Location $repoRoot
    try {
        & sqlcmd @sqlcmdBase -i (Join-Path $repoRoot 'database\scripts\010_application_login.sql') `
            -v "DatabaseName=$databaseName" "AppLogin=$appRoleName"
        if ($LASTEXITCODE -ne 0) { throw 'Application-role grant script failed.' }
    } finally {
        Pop-Location
    }
    Invoke-SqlQuery $databaseName @"
IF EXISTS (
    SELECT 1 FROM sys.database_permissions
    WHERE grantee_principal_id = DATABASE_PRINCIPAL_ID(N'public')
      AND class = 1
      AND major_id = OBJECT_ID(N'dbo.answer_schedule_day_request')
      AND permission_name = N'EXECUTE'
      AND state IN ('G', 'W'))
    THROW 51073, 'Application login provisioning retained public EXECUTE on the owner procedure.', 1;
DECLARE @cookie varbinary(8000);
EXEC sys.sp_setapprole @rolename = N'$appRoleName', @password = N'$escapedAppRolePassword',
    @fCreateCookie = 1, @cookie = @cookie OUTPUT;
IF COALESCE(HAS_PERMS_BY_NAME(DB_NAME(), N'DATABASE', N'CONTROL'), 0) <> 0
    THROW 51074, 'Application login provisioning retained database CONTROL.', 1;
IF COALESCE(HAS_PERMS_BY_NAME(N'dbo', N'SCHEMA', N'CONTROL'), 0) <> 0
   OR COALESCE(HAS_PERMS_BY_NAME(N'dbo', N'SCHEMA', N'SELECT'), 0) <> 0
   OR COALESCE(HAS_PERMS_BY_NAME(N'dbo', N'SCHEMA', N'EXECUTE'), 0) <> 0
   OR COALESCE(HAS_PERMS_BY_NAME(N'dbo', N'SCHEMA', N'INSERT'), 0) <> 0
   OR COALESCE(HAS_PERMS_BY_NAME(N'dbo', N'SCHEMA', N'UPDATE'), 0) <> 0
   OR COALESCE(HAS_PERMS_BY_NAME(N'dbo', N'SCHEMA', N'DELETE'), 0) <> 0
    THROW 51075, 'Application login provisioning retained a schema-wide data permission.', 1;
IF COALESCE(HAS_PERMS_BY_NAME(N'dbo.audit_log', N'OBJECT', N'SELECT'), 0) <> 1
    THROW 51076, 'Application role cannot read the core audit ledger.', 1;
IF COALESCE(HAS_PERMS_BY_NAME(N'dbo.mat_audit', N'OBJECT', N'SELECT'), 0) <> 1
    THROW 51077, 'Application role cannot read the material audit ledger.', 1;
SELECT TOP (0) id FROM dbo.audit_log;
SELECT TOP (0) id FROM dbo.mat_audit;
EXEC sys.sp_unsetapprole @cookie = @cookie;
"@

    & dotnet build (Join-Path $backendRoot 'IoTTeamCenter.Api.csproj') -c Release --nologo
    if ($LASTEXITCODE -ne 0) { throw 'Release build failed before the integration flow.' }

    $port = Get-FreePort
    $script:apiBase = "http://127.0.0.1:$port"
    $env:ASPNETCORE_ENVIRONMENT = 'Development'
    $env:ASPNETCORE_URLS = $script:apiBase
    if ([string]::IsNullOrWhiteSpace($SqlUser)) {
        $env:ConnectionStrings__IoTTeamCenter = "Server=$SqlServer;Database=$databaseName;Integrated Security=true;TrustServerCertificate=true"
    } else {
        $env:ConnectionStrings__IoTTeamCenter = "Server=$SqlServer;Database=$databaseName;User ID=$SqlUser;Password=$SqlPassword;Encrypt=true;TrustServerCertificate=true"
    }
    $env:Database__TrustServerCertificateForDevelopment = 'true'

    $startArguments = @{
        FilePath = 'dotnet'
        ArgumentList = @('run', '-c', 'Release', '--no-build')
        WorkingDirectory = $backendRoot
        PassThru = $true
        RedirectStandardOutput = $stdoutPath
        RedirectStandardError = $stderrPath
    }
    if ($env:OS -eq 'Windows_NT') { $startArguments.WindowStyle = 'Hidden' }
    $apiProcess = Start-Process @startArguments

    $ready = $false
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        if ($apiProcess.HasExited) { break }
        try {
            $health = Invoke-RestMethod -Uri "$script:apiBase/health/live" -TimeoutSec 2
            if ($health.status -eq 'ok') { $ready = $true; break }
        } catch { Start-Sleep -Milliseconds 500 }
    }
    if (-not $ready) {
        $stderr = if (Test-Path $stderrPath) { Get-Content -LiteralPath $stderrPath -Raw } else { '' }
        throw "The integration API did not become ready. $stderr"
    }

    $dev = Invoke-Api GET '/api/v1/me' 'dev-user'
    $otherEngineer = Invoke-Api GET '/api/v1/me' 'engineer-oid'
    $otherProjectManager = Invoke-Api GET '/api/v1/me' 'pm-oid'
    $manager = Invoke-Api GET '/api/v1/me' 'mgr-oid'
    $today = [DateTime]::UtcNow.Date.ToString('yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture)
    $future = [DateTime]::UtcNow.Date.AddDays(30).ToString('yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture)
    $delivery = [DateTime]::UtcNow.Date.AddDays(90).ToString('yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture)

    $customer = Invoke-Api POST '/api/v1/master/customers' 'dev-user' ([ordered]@{
        code = 'CI-CUST'; name = 'CI Customer'; contact = ''; email = ''; phone = '';
        industry = 'Test'; site = 'CI'
    })
    $supplier = Invoke-Api POST '/api/v1/master/suppliers' 'dev-user' ([ordered]@{
        code = 'CI-SUP'; name = 'CI Supplier'; category = 'General'; contact = '';
        email = ''; phone = ''; brands = @()
    })
    $item = Invoke-Api POST '/api/v1/master/inventory-items' 'dev-user' ([ordered]@{
        itemCode = 'CI-ITEM'; partNumber = 'CI-PART'; description = 'CI material'; brand = '';
        unit = 'pcs'; location = 'CI-A1'; reorderLevel = 0; averageUnitCost = 10;
        leadTimeDays = 1; preferredSupplierId = $supplier.id
    })
    $rate = Invoke-Api POST '/api/v1/master/engineering-rates' 'dev-user' ([ordered]@{
        level = 'CI Engineer'; department = 'CI Engineering';
        engineeringHourly = 500; engineeringDaily = 4000;
        installationHourly = 450; installationDaily = 3600;
        effectiveFrom = $today; effectiveTo = $null
    })

    $inquiry = Invoke-Api POST '/api/v1/inquiries' 'dev-user' ([ordered]@{
        customerId = $customer.id; contact = ''; projectName = 'CI Full Material Flow'; projectType = 'Integration';
        rfqNo = 'CI-RFQ'; salesOwner = 'CI'; estimateOwnerId = $dev.id; dueDate = $future; priority = 'Normal';
        projectProbability = 60; customerInterestGrade = 'B'; qualificationNote = 'CI initial qualification';
        requirement = 'Automated material flow'; background = $null; scopeSummary = 'Integration'; technical = $null;
        targetDelivery = $delivery; siteLocation = 'CI'; standard = $null; special = $null; remark = $null
    })
    $qualification = Invoke-Api PUT "/api/v1/inquiries/$($inquiry.id)/qualification" 'dev-user' ([ordered]@{
        projectProbability = 80; customerInterestGrade = 'A'; qualificationNote = 'CI confirmed budget and timeline'; rowVersion = $inquiry.rowVersion
    })
    Assert-Equal $qualification.projectProbability 80 'Inquiry project probability'
    Assert-Equal $qualification.customerInterestGrade 'A' 'Inquiry customer interest grade'
    $estimate = Invoke-Api POST '/api/v1/estimates' 'dev-user' ([ordered]@{
        inquiryId = $inquiry.id; ownerId = $dev.id; dueDate = $future; contingencyRate = 0
    })
    $costItem = Invoke-Api POST "/api/v1/estimates/$($estimate.id)/cost-items" 'dev-user' ([ordered]@{
        estimateRowVersion = $estimate.rowVersion; lineRowVersion = $null; categoryCode = '01'; category = 'Hardware';
        subcategory = ''; module = 'CI'; itemCode = 'CI-ITEM'; description = 'CI material'; brand = ''; model = '';
        specification = $null; supplierId = $supplier.id; quantity = 10; unit = 'pcs'; unitCost = 10;
        priceSource = 'Supplier Quotation'; referenceNumber = 'CI'; referenceProject = $null; priceDate = $today;
        remark = $null; ownerId = $dev.id
    })

    # An engineer assigned only to section 01 may edit section-01 material cost,
    # but must not inherit write access to section 06 man-hour, section 10
    # expenses, other project cost, or another material category.
    Invoke-SqlQuery $databaseName "UPDATE dbo.estimate_assignments SET owner_id = $($otherEngineer.id), support_id = NULL WHERE estimate_id = $($estimate.id) AND section = N'01'; IF @@ROWCOUNT <> 1 THROW 51122, 'Scoped estimate assignment fixture was not created.', 1;"
    $scopedEstimateWorkspace = Invoke-Api GET "/api/v1/estimates/$($estimate.id)/cost-workspace" 'engineer-oid'
    Assert-Equal $scopedEstimateWorkspace.capabilities.canEditCostItems $true 'Section-scoped cost capability'
    Assert-Equal $scopedEstimateWorkspace.capabilities.canEditManhour $false 'Section-scoped man-hour capability'
    Assert-Equal $scopedEstimateWorkspace.capabilities.canEditExpenses $false 'Section-scoped expense capability'
    Assert-Equal $scopedEstimateWorkspace.capabilities.canEditOtherCosts $false 'Section-scoped other-cost capability'
    $scopedCostItem = @($scopedEstimateWorkspace.costItems | Where-Object { $_.id -eq $costItem.id })[0]
    Assert-Equal $scopedCostItem.canEdit $true 'Assigned category cost-line capability'
    $null = Assert-ApiError POST "/api/v1/estimates/$($estimate.id)/manhour-lines" 'engineer-oid' ([ordered]@{
        estimateRowVersion = $costItem.estimateRowVersion; lineRowVersion = $null
        package = 'Unauthorized CI Engineering'; activity = 'Unauthorized CI design'; department = 'CI Engineering'; level = 'CI Engineer'
        costType = 'Engineering'; provider = 'Internal'; supplierId = $null; quotationNumber = $null; priceDate = $null
        engineers = 1; manDays = 1; hoursPerDay = 8; dailyRate = 0; ownerId = $otherEngineer.id; remark = $null
    }) 'estimate_section_forbidden' 403
    $null = Assert-ApiError POST "/api/v1/estimates/$($estimate.id)/expense-lines" 'engineer-oid' ([ordered]@{
        estimateRowVersion = $costItem.estimateRowVersion; lineRowVersion = $null
        package = 'Unauthorized CI Expense'; expenseType = 'Other'; description = 'Unauthorized CI expense'; costType = 'Engineering'
        supplierId = $null; referenceNumber = 'CI-DENIED'; quantity = 1; unit = 'lot'; unitCost = 1
        ownerId = $otherEngineer.id; remark = $null
    }) 'estimate_section_forbidden' 403
    $null = Assert-ApiError POST "/api/v1/estimates/$($estimate.id)/other-cost-lines" 'engineer-oid' ([ordered]@{
        estimateRowVersion = $costItem.estimateRowVersion; lineRowVersion = $null
        category = 'Other Cost'; description = 'Unauthorized CI other cost'; quantity = 1; unit = 'lot'; unitCost = 1; remark = $null
    }) 'estimate_owner_required' 403
    $null = Assert-ApiError POST "/api/v1/estimates/$($estimate.id)/cost-items" 'engineer-oid' ([ordered]@{
        estimateRowVersion = $costItem.estimateRowVersion; lineRowVersion = $null; categoryCode = '02'; category = 'Software';
        subcategory = ''; module = 'CI'; itemCode = 'CI-DENIED'; description = 'Unauthorized category'; brand = ''; model = '';
        specification = $null; supplierId = $null; quantity = 1; unit = 'pcs'; unitCost = 1;
        priceSource = 'Manual Estimate'; referenceNumber = 'CI-DENIED'; referenceProject = $null; priceDate = $today;
        remark = $null; ownerId = $otherEngineer.id
    }) 'estimate_section_forbidden' 403

    # Owning a line is not a lasting authorization grant: revoking the category
    # assignment must immediately revoke update/remove access as well.
    Invoke-SqlQuery $databaseName "UPDATE dbo.estimate_assignments SET owner_id = $($dev.id), support_id = NULL WHERE estimate_id = $($estimate.id) AND section = N'01'; IF @@ROWCOUNT <> 1 THROW 51123, 'Scoped estimate assignment revocation fixture failed.', 1;"
    $null = Assert-ApiError PUT "/api/v1/estimates/$($estimate.id)/cost-items/$($costItem.id)" 'engineer-oid' ([ordered]@{
        estimateRowVersion = $costItem.estimateRowVersion; lineRowVersion = $costItem.rowVersion; categoryCode = '01'; category = 'Hardware';
        subcategory = ''; module = 'CI'; itemCode = 'CI-ITEM'; description = 'CI material'; brand = ''; model = '';
        specification = $null; supplierId = $supplier.id; quantity = 10; unit = 'pcs'; unitCost = 10;
        priceSource = 'Supplier Quotation'; referenceNumber = 'CI'; referenceProject = $null; priceDate = $today;
        remark = $null; ownerId = $dev.id
    }) 'cost_line_forbidden' 403

    # Values fit each source column but their computed product does not fit the
    # decimal(19,4) ledger. The API must reject this as a 400 before SQL DML.
    $null = Assert-ApiError POST "/api/v1/estimates/$($estimate.id)/manhour-lines" 'dev-user' ([ordered]@{
        estimateRowVersion = $costItem.estimateRowVersion; lineRowVersion = $null
        package = 'CI Overflow'; activity = 'CI overflow guard'; department = 'CI Engineering'; level = 'CI Engineer'
        costType = 'Engineering'; provider = 'Internal'; supplierId = $null; quotationNumber = $null; priceDate = $null
        engineers = 1000000; manDays = 1000000; hoursPerDay = 8; dailyRate = 0; ownerId = $dev.id; remark = $null
    }) 'validation_failed' 400

    # Exercise optimistic concurrency and soft-delete through the public API. The
    # temporary line must affect live totals while active and disappear after
    # removal without ever being deleted from the audit/history tables.
    $temporaryCostItem = Invoke-Api POST "/api/v1/estimates/$($estimate.id)/cost-items" 'dev-user' ([ordered]@{
        estimateRowVersion = $costItem.estimateRowVersion; lineRowVersion = $null; categoryCode = '01'; category = 'Hardware';
        subcategory = ''; module = 'CI'; itemCode = 'CI-TEMP'; description = 'CI temporary material'; brand = ''; model = '';
        specification = $null; supplierId = $supplier.id; quantity = 1; unit = 'pcs'; unitCost = 50;
        priceSource = 'Supplier Quotation'; referenceNumber = 'CI-TEMP'; referenceProject = $null; priceDate = $today;
        remark = 'Temporary integration line'; ownerId = $dev.id
    })
    $updatedTemporaryCostItem = Invoke-Api PUT "/api/v1/estimates/$($estimate.id)/cost-items/$($temporaryCostItem.id)" 'dev-user' ([ordered]@{
        estimateRowVersion = $temporaryCostItem.estimateRowVersion; lineRowVersion = $temporaryCostItem.rowVersion; categoryCode = '01'; category = 'Hardware';
        subcategory = ''; module = 'CI'; itemCode = 'CI-TEMP'; description = 'CI temporary material'; brand = ''; model = '';
        specification = $null; supplierId = $supplier.id; quantity = 1; unit = 'pcs'; unitCost = 60;
        priceSource = 'Supplier Quotation'; referenceNumber = 'CI-TEMP'; referenceProject = $null; priceDate = $today;
        remark = 'Temporary integration line updated'; ownerId = $dev.id
    })
    $null = Assert-ApiError PUT "/api/v1/estimates/$($estimate.id)/cost-items/$($temporaryCostItem.id)" 'dev-user' ([ordered]@{
        estimateRowVersion = $temporaryCostItem.estimateRowVersion; lineRowVersion = $temporaryCostItem.rowVersion; categoryCode = '01'; category = 'Hardware';
        subcategory = ''; module = 'CI'; itemCode = 'CI-TEMP'; description = 'CI stale material update'; brand = ''; model = '';
        specification = $null; supplierId = $supplier.id; quantity = 1; unit = 'pcs'; unitCost = 70;
        priceSource = 'Supplier Quotation'; referenceNumber = 'CI-TEMP'; referenceProject = $null; priceDate = $today;
        remark = 'This stale update must fail'; ownerId = $dev.id
    }) 'concurrency_conflict' 409
    $workspaceAfterTemporaryUpdate = Invoke-Api GET "/api/v1/estimates/$($estimate.id)/cost-workspace" 'dev-user'
    Assert-Equal $workspaceAfterTemporaryUpdate.header.totals.material 160 'Estimate material total after cost update'
    Assert-Equal @($workspaceAfterTemporaryUpdate.costItems | Where-Object { $_.id -eq $temporaryCostItem.id }).Count 1 'Updated temporary cost line visibility'

    $removedTemporaryCostItem = Invoke-Api POST "/api/v1/estimates/$($estimate.id)/cost-items/$($temporaryCostItem.id)/remove" 'dev-user' ([ordered]@{
        estimateRowVersion = $updatedTemporaryCostItem.estimateRowVersion
        lineRowVersion = $updatedTemporaryCostItem.rowVersion
        reason = 'CI soft-delete verification'
    })
    $workspaceAfterTemporaryRemove = Invoke-Api GET "/api/v1/estimates/$($estimate.id)/cost-workspace" 'dev-user'
    Assert-Equal $workspaceAfterTemporaryRemove.header.totals.material 100 'Estimate material total after cost removal'
    Assert-Equal @($workspaceAfterTemporaryRemove.costItems | Where-Object { $_.id -eq $temporaryCostItem.id }).Count 0 'Removed temporary cost line visibility'

    # Add every remaining cost family through the same production endpoints used
    # by the Estimate workspace. Internal engineering rate is derived server-side.
    $manhourLine = Invoke-Api POST "/api/v1/estimates/$($estimate.id)/manhour-lines" 'dev-user' ([ordered]@{
        estimateRowVersion = $removedTemporaryCostItem.estimateRowVersion; lineRowVersion = $null
        package = 'CI Engineering'; activity = 'CI design'; department = 'CI Engineering'; level = 'CI Engineer'
        costType = 'Engineering'; provider = 'Internal'; supplierId = $null; quotationNumber = $null; priceDate = $null
        engineers = 1; manDays = 2; hoursPerDay = 8; dailyRate = 0; ownerId = $dev.id
        remark = 'CI internal engineering'
    })
    $expenseLine = Invoke-Api POST "/api/v1/estimates/$($estimate.id)/expense-lines" 'dev-user' ([ordered]@{
        estimateRowVersion = $manhourLine.estimateRowVersion; lineRowVersion = $null
        package = 'CI Engineering'; expenseType = 'Other'; description = 'CI engineering expense'; costType = 'Engineering'
        supplierId = $null; referenceNumber = 'CI-EXP'; quantity = 1; unit = 'lot'; unitCost = 100
        ownerId = $dev.id; remark = 'CI expense'
    })
    $otherCostLine = Invoke-Api POST "/api/v1/estimates/$($estimate.id)/other-cost-lines" 'dev-user' ([ordered]@{
        estimateRowVersion = $expenseLine.estimateRowVersion; lineRowVersion = $null
        category = 'Other Cost'; description = 'CI other project cost'; quantity = 1; unit = 'lot'; unitCost = 200
        remark = 'CI other cost'
    })
    $contingency = Invoke-Api PUT "/api/v1/estimates/$($estimate.id)/contingency" 'dev-user' ([ordered]@{
        rowVersion = $otherCostLine.estimateRowVersion; contingencyRate = 5
    })
    $estimateWorkspace = Invoke-Api GET "/api/v1/estimates/$($estimate.id)/cost-workspace" 'dev-user'
    Assert-Equal $estimateWorkspace.header.totals.material 100 'Estimate workspace material total'
    Assert-Equal $estimateWorkspace.header.totals.engineering 8000 'Estimate workspace engineering total'
    Assert-Equal $estimateWorkspace.header.totals.other 300 'Estimate workspace other total'
    Assert-Equal $estimateWorkspace.header.totals.subtotal 8400 'Estimate workspace subtotal'
    Assert-Equal $estimateWorkspace.header.totals.contingency 420 'Estimate workspace contingency'
    Assert-Equal $estimateWorkspace.header.totals.total 8820 'Estimate workspace grand total'
    Assert-Equal $estimateWorkspace.header.contingencyRate 5 'Estimate workspace contingency rate'
    Assert-Equal @($estimateWorkspace.manhourLines).Count 1 'Estimate workspace man-hour line count'
    Assert-Equal @($estimateWorkspace.manhourLines)[0].dailyRate 4000 'Estimate workspace derived engineering daily rate'
    Assert-Equal @($estimateWorkspace.manhourLines)[0].lineCost 8000 'Estimate workspace engineering line cost'
    Assert-Equal @($estimateWorkspace.expenseLines).Count 1 'Estimate workspace expense line count'
    Assert-Equal @($estimateWorkspace.expenseLines)[0].lineTotal 100 'Estimate workspace expense line total'
    Assert-Equal @($estimateWorkspace.otherCostLines).Count 1 'Estimate workspace other-cost line count'
    Assert-Equal @($estimateWorkspace.otherCostLines)[0].lineTotal 200 'Estimate workspace other-cost line total'
    Assert-Equal @($estimateWorkspace.validationIssues | Where-Object { $_.severity -eq 'Error' }).Count 0 'Estimate workspace blocking validation issue count'
    Assert-Equal @($estimateWorkspace.validationIssues | Where-Object { $_.severity -eq 'Warning' -and $_.code -eq 'transportation_category_missing' }).Count 1 'Estimate workspace non-blocking warning count'

    $submittedEstimate = Invoke-Api POST "/api/v1/estimates/$($estimate.id)/submit" 'dev-user' ([ordered]@{
        comment = 'CI submit'; rowVersion = $contingency.rowVersion
    })
    $null = Assert-ApiError POST "/api/v1/estimates/$($estimate.id)/request-revision" 'dev-user' ([ordered]@{
        comment = 'CI self revision must be rejected'; rowVersion = $submittedEstimate.rowVersion
    }) 'self_revision_forbidden' 403
    $approvedEstimate = Invoke-Api POST "/api/v1/estimates/$($estimate.id)/approve" 'mgr-oid' ([ordered]@{
        comment = 'CI approve'; rowVersion = $submittedEstimate.rowVersion
    })
    Assert-Equal $approvedEstimate.status 'Approved' 'Estimate status'

    $project = Invoke-Api POST '/api/v1/projects' 'dev-user' ([ordered]@{
        estimateId = $estimate.id; purchaseOrderNumber = 'CI-CUSTOMER-PO'; purchaseOrderDate = $today;
        managerId = $manager.id; leadEngineerId = $dev.id; startDate = $today; targetDelivery = $delivery;
        site = 'CI'; remark = 'Automated integration flow'
    })
    Invoke-SqlQuery $databaseName "INSERT INTO dbo.project_members (project_id, user_id, role_on_project, created_by) VALUES ($($project.id), $($otherEngineer.id), N'CI observer', $($dev.id)), ($($project.id), $($otherProjectManager.id), N'CI PM observer', $($dev.id));"
    $bom = Invoke-Api POST '/api/v1/boms' 'dev-user' ([ordered]@{ projectId = $project.id })
    $bomDetail = Invoke-Api GET "/api/v1/boms/$($bom.id)" 'dev-user'
    $bomLine = @($bomDetail.lines)[0]
    $null = Assert-ApiError POST "/api/v1/boms/$($bom.id)/reservations" 'dev-user' ([ordered]@{
        bomLineId = $bomLine.id; quantity = 1; requiredDate = $future
    }) 'bom_not_released' 409
    $releasedBom = Invoke-Api POST "/api/v1/boms/$($bom.id)/release" 'mgr-oid' ([ordered]@{
        rowVersion = $bomDetail.bom.rowVersion; comment = 'CI release'
    })
    Assert-Equal $releasedBom.status 'Released' 'BOM status'

    $adjustment = Invoke-Api POST '/api/v1/stock-adjustments' 'wh-oid' ([ordered]@{
        itemId = $item.id; quantityChange = 4; reason = 'CI opening stock'
    })
    $approvedAdjustment = Invoke-Api POST "/api/v1/stock-adjustments/$($adjustment.id)/decide" 'inv-oid' ([ordered]@{
        decision = 'Approve'; comment = 'CI approval'
    })
    Assert-Equal $approvedAdjustment.status 'Approved' 'Stock adjustment status'

    $reservation = Invoke-Api POST "/api/v1/boms/$($bom.id)/reservations" 'dev-user' ([ordered]@{
        bomLineId = $bomLine.id; quantity = 4; requiredDate = $future
    })
    Assert-Equal $reservation.quantity 4 'Reservation quantity'
    Assert-Equal $reservation.remainingDemand 6 'Reservation remaining BOM demand'
    $null = Assert-ApiError POST "/api/v1/boms/$($bom.id)/reservations" 'dev-user' ([ordered]@{
        bomLineId = $bomLine.id; quantity = 7; requiredDate = $future
    }) 'quantity_exceeds_bom_demand' 409

    $null = Assert-ApiError POST '/api/v1/purchase-requisitions' 'dev-user' ([ordered]@{
        bomId = $bom.id; priority = 'Normal'; requiredDate = $future; purpose = 'CI mismatch check';
        lines = @([ordered]@{
            bomLineId = $bomLine.id; supplierId = $supplier.id; quantity = 6; unitPrice = 10;
            priceSource = 'Supplier Quotation'; isUnplanned = $false; buyDespiteStock = $false;
            remark = $null; itemCodeOverride = 'CI-WRONG-ITEM'
        })
    }) 'item_code_override_mismatch' 400

    $pr = Invoke-Api POST '/api/v1/purchase-requisitions' 'dev-user' ([ordered]@{
        bomId = $bom.id; priority = 'Normal'; requiredDate = $future; purpose = 'CI';
        lines = @([ordered]@{
            bomLineId = $bomLine.id; supplierId = $supplier.id; quantity = 6; unitPrice = 10;
            priceSource = 'Supplier Quotation'; isUnplanned = $false; buyDespiteStock = $false;
            remark = $null; itemCodeOverride = $null
        })
    })
    $bomAfterPr = Invoke-Api GET "/api/v1/boms/$($bom.id)" 'dev-user'
    $bomLineAfterPr = @($bomAfterPr.lines | Where-Object { $_.id -eq $bomLine.id })[0]
    Assert-Equal $bomLineAfterPr.onOpenPr 6 'BOM open PR commitment'
    Assert-Equal $bomLineAfterPr.purchaseRequired 0 'BOM purchase requirement after open PR'
    $submittedPr = Invoke-Api POST "/api/v1/purchase-requisitions/$($pr.id)/submit" 'dev-user' ([ordered]@{
        comment = 'CI submit'; rowVersion = $pr.rowVersion
    })
    $decision = Invoke-Api POST "/api/v1/purchase-requisitions/$($pr.id)/decide" 'mgr-oid' ([ordered]@{ decision = 'Approve'; comment = $null })
    $decision = Invoke-Api POST "/api/v1/purchase-requisitions/$($pr.id)/decide" 'mgr-oid' ([ordered]@{ decision = 'Approve'; comment = $null })
    $decision = Invoke-Api POST "/api/v1/purchase-requisitions/$($pr.id)/decide" 'buy-oid' ([ordered]@{ decision = 'Approve'; comment = $null })
    Assert-Equal $decision.status 'Approved' 'Purchase requisition approval status'

    $converted = Invoke-Api POST "/api/v1/purchase-requisitions/$($pr.id)/convert" 'buy-oid' ([ordered]@{
        rowVersion = $decision.rowVersion; expectedDate = $future
    })
    Assert-Equal $converted.status 'Converted to PO' 'Purchase requisition conversion status'
    $po = @($converted.purchaseOrders)[0]
    $poDetail = Invoke-Api GET "/api/v1/purchase-orders/$($po.id)" 'buy-oid'
    $poLine = @($poDetail.lines)[0]

    $grnRequest = [ordered]@{
        purchaseOrderId = $po.id; deliveryNote = 'CI-DN'; receivedDate = $today;
        lines = @([ordered]@{
            purchaseOrderLineId = $poLine.id; receivedQuantity = 6; acceptedQuantity = 6;
            damagedQuantity = 0; rejectedQuantity = 0; qcStatus = 'Passed'; lotNumber = 'CI-LOT';
            serialNumber = $null; location = 'CI-A1'; projectAllocationId = $project.id;
            allowOverReceipt = $false; remark = $null
        })
    }
    $grn = Invoke-Api POST '/api/v1/goods-receipts' 'wh-oid' $grnRequest
    # This second draft sees the same remaining quantity. Confirmation must
    # revalidate after the first draft wins instead of double-receiving the PO.
    $conflictingGrn = Invoke-Api POST '/api/v1/goods-receipts' 'wh-oid' $grnRequest
    $conflictingGrnDetail = Invoke-Api GET "/api/v1/goods-receipts/$($conflictingGrn.id)" 'wh-oid'
    Assert-Equal @($conflictingGrnDetail.lines)[0].allowOverReceipt $false 'GRN persisted over-receipt authorization'
    $confirmedGrn = Invoke-Api POST "/api/v1/goods-receipts/$($grn.id)/confirm" 'wh-oid' ([ordered]@{
        rowVersion = $grn.rowVersion; comment = 'CI confirm'
    })
    Assert-Equal $confirmedGrn.status 'Confirmed' 'GRN status'
    Assert-Equal $confirmedGrn.purchaseOrderStatus 'Received' 'Purchase order status'
    $null = Assert-ApiError POST "/api/v1/goods-receipts/$($conflictingGrn.id)/confirm" 'wh-oid' ([ordered]@{
        rowVersion = $conflictingGrn.rowVersion; comment = 'CI conflicting confirm'
    }) 'over_receipt' 409

    # This was valid while ten units were on hand (opening 4 + GRN 6). It must
    # be checked again at approval after subsequent material issues consume it.
    $staleNegativeAdjustment = Invoke-Api POST '/api/v1/stock-adjustments' 'wh-oid' ([ordered]@{
        itemId = $item.id; quantityChange = -6; reason = 'CI pending shrinkage revalidation'
    })

    $mir = Invoke-Api POST '/api/v1/material-issues' 'dev-user' ([ordered]@{
        bomId = $bom.id; requiredDate = $future; purpose = 'CI';
        lines = @([ordered]@{ bomLineId = $bomLine.id; requestedQuantity = 7; location = 'CI-A1'; purpose = 'CI' })
    })
    Assert-ApiError POST '/api/v1/material-issues' 'dev-user' ([ordered]@{
        bomId = $bom.id; requiredDate = $future; purpose = 'CI overcommit guard';
        lines = @([ordered]@{ bomLineId = $bomLine.id; requestedQuantity = 4; location = 'CI-A1'; purpose = 'CI' })
    }) 'exceeds_bom_quantity'
    $staleMir = Invoke-Api POST '/api/v1/material-issues' 'dev-user' ([ordered]@{
        bomId = $bom.id; requiredDate = $future; purpose = 'CI stale concurrency fixture';
        lines = @([ordered]@{ bomLineId = $bomLine.id; requestedQuantity = 3; location = 'CI-A1'; purpose = 'CI' })
    })
    $approvedMir = Invoke-Api POST "/api/v1/material-issues/$($mir.id)/decide" 'mgr-oid' ([ordered]@{
        decision = 'Approve'; comment = $null
    })
    $approvedStaleMir = Invoke-Api POST "/api/v1/material-issues/$($staleMir.id)/decide" 'mgr-oid' ([ordered]@{
        decision = 'Approve'; comment = $null
    })
    # Simulate an old/concurrently-created request whose snapshot no longer
    # represents the live BOM allowance. IssueAsync must protect the ledger
    # even when such legacy data reaches the approved state.
    Invoke-SqlQuery $databaseName "UPDATE dbo.mir_lines SET requested_qty = 4 WHERE mir_id = $($staleMir.id); IF @@ROWCOUNT <> 1 THROW 51078, 'Stale MIR fixture update failed.', 1;"
    $issuedMir = Invoke-Api POST "/api/v1/material-issues/$($mir.id)/issue" 'wh-oid' ([ordered]@{
        rowVersion = $approvedMir.rowVersion; comment = 'CI issue'
    })
    Assert-ApiError POST "/api/v1/material-issues/$($staleMir.id)/issue" 'wh-oid' ([ordered]@{
        rowVersion = $approvedStaleMir.rowVersion; comment = 'CI stale issue must be blocked'
    }) 'exceeds_bom_quantity'
    $receivedMir = Invoke-Api POST "/api/v1/material-issues/$($mir.id)/receipt" 'dev-user' ([ordered]@{
        rowVersion = $issuedMir.rowVersion; comment = 'CI received'
    })
    Assert-Equal $receivedMir.status 'Received' 'MIR status'
    $mirDetail = Invoke-Api GET "/api/v1/material-issues/$($mir.id)" 'dev-user'
    $mirLine = @($mirDetail.lines)[0]
    $null = Invoke-Api POST "/api/v1/material-issues/$($mir.id)/returns" 'wh-oid' ([ordered]@{
        lineId = $mirLine.id; quantity = 2; reason = 'CI unused'
    })

    $null = Assert-ApiError POST "/api/v1/stock-adjustments/$($staleNegativeAdjustment.id)/decide" 'inv-oid' ([ordered]@{
        decision = 'Approve'; comment = 'CI stale negative adjustment must be blocked'
    }) 'negative_balance' 409

    $inventory = Invoke-Api GET '/api/v1/inventory/items?reorderOnly=false' 'dev-user'
    $inventoryItem = @($inventory | Where-Object { $_.itemId -eq $item.id })[0]
    Assert-Equal $inventoryItem.usable 5 'Final usable stock'
    Assert-Equal $inventoryItem.quarantine 0 'Final quarantine stock'
    Assert-Equal $inventoryItem.reserved 0 'Final active reservation'
    Assert-Equal $inventoryItem.available 5 'Final available stock'
    Assert-Equal $inventoryItem.onOrder 0 'Final on-order stock'

    $projectCost = Invoke-Api GET "/api/v1/reports/project-cost?projectId=$($project.id)" 'dev-user'
    Assert-Equal $projectCost.budget.approvedMaterial 100 'Approved material budget'
    Assert-Equal $projectCost.actual.materialConsumed 50 'Net material actual cost'

    $inventoryValue = Invoke-Api GET "/api/v1/reports/inventory-value?asOf=$today&slowMovingDays=90&slowMovingOnly=false" 'dev-user'
    $inventoryValueItem = @($inventoryValue.items | Where-Object { $_.id -eq $item.id })[0]
    Assert-Equal $inventoryValueItem.usable 5 'Inventory-value usable quantity'
    Assert-Equal $inventoryValueItem.usableValue 50 'Inventory-value usable value'

    $supplierPerformance = Invoke-Api GET "/api/v1/reports/supplier-performance?from=$today&to=$today&supplierId=$($supplier.id)" 'dev-user'
    $supplierResult = @($supplierPerformance.suppliers)[0]
    Assert-Equal $supplierResult.purchaseOrderCount 1 'Supplier report purchase-order count'
    Assert-Equal $supplierResult.fullyReceivedPurchaseOrderCount 1 'Supplier report completed purchase orders'
    Assert-Equal $supplierResult.openValue 0 'Supplier report open value'

    $prCycle = Invoke-Api GET "/api/v1/reports/pr-cycle-time?from=$today&to=$today&projectId=$($project.id)" 'dev-user'
    Assert-Equal $prCycle.lifecycle.prCount 1 'PR cycle report requisition count'
    Assert-Equal $prCycle.statusCounts.'Converted to PO' 1 'PR cycle report converted count'

    $scheduleMondayDate = [DateTime]::UtcNow.Date
    while ($scheduleMondayDate.DayOfWeek -ne [DayOfWeek]::Monday) { $scheduleMondayDate = $scheduleMondayDate.AddDays(1) }
    $scheduleMonday = $scheduleMondayDate.ToString('yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture)
    $scheduleHoliday = $scheduleMondayDate.AddDays(2).ToString('yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture)
    Invoke-SqlQuery $databaseName "INSERT INTO dbo.holidays (holiday_date, name, created_by) VALUES ('$scheduleHoliday', N'CI NETWORKDAYS holiday', $($dev.id));"

    $schedulePhase = Invoke-Api POST "/api/v1/projects/$($project.id)/schedule/tasks" 'mgr-oid' ([ordered]@{
        scheduleVersion = $null; parentId = $null; sortOrder = 1; kind = 'phase'; name = 'CI delivery phase';
        isMilestone = $false; visibility = 'Internal'; planStart = $null; planDays = 1; startMode = 'manual';
        predecessorId = $null; lagDays = 0; picUserIds = @(); picExternal = ''; planManDays = 0
    })
    $oneDayTask = Invoke-Api POST "/api/v1/projects/$($project.id)/schedule/tasks" 'mgr-oid' ([ordered]@{
        scheduleVersion = $schedulePhase.scheduleVersion; parentId = $schedulePhase.id; sortOrder = 1; kind = 'task'; name = 'CI one-day task';
        isMilestone = $false; visibility = 'Internal'; planStart = $scheduleMonday; planDays = 1; startMode = 'manual';
        predecessorId = $null; lagDays = 0; picUserIds = @($dev.id); picExternal = ''; planManDays = 1
    })
    $fourWorkDayTask = Invoke-Api POST "/api/v1/projects/$($project.id)/schedule/tasks" 'mgr-oid' ([ordered]@{
        scheduleVersion = $oneDayTask.scheduleVersion; parentId = $schedulePhase.id; sortOrder = 2; kind = 'task'; name = 'CI holiday-spanning task';
        isMilestone = $false; visibility = 'Internal'; planStart = $scheduleMonday; planDays = 5; startMode = 'manual';
        predecessorId = $null; lagDays = 0; picUserIds = @($dev.id); picExternal = ''; planManDays = 4
    })
    $progressTask = Invoke-Api POST "/api/v1/schedule/tasks/$($oneDayTask.id)/updates" 'dev-user' ([ordered]@{
        scheduleVersion = $fourWorkDayTask.scheduleVersion; rowVersion = $oneDayTask.rowVersion; percentComplete = 100;
        actualStart = $scheduleMonday; actualFinish = $scheduleMonday; status = 'Done'; remark = 'CI complete'
    })
    $schedule = Invoke-Api GET "/api/v1/projects/$($project.id)/schedule" 'dev-user'
    Assert-Equal $schedule.summary.percentComplete 20 'Schedule roll-up progress'
    Assert-Equal $schedule.summary.workDays 4 'Schedule NETWORKDAYS summary'
    Assert-Equal $schedule.summary.taskCount 2 'Schedule leaf count'
    $phaseNode = @($schedule.tasks)[0]
    Assert-Equal $phaseNode.percentComplete 20 'Parent weighted progress'
    Assert-Equal @($phaseNode.children).Count 2 'Parent child count'
    Assert-Equal @($phaseNode.children)[0].wbs '1.1' 'First child WBS'
    Assert-Equal @($phaseNode.children)[1].workDays 4 'Holiday-spanning work days'
    $baseline = Invoke-Api POST "/api/v1/projects/$($project.id)/schedule/baseline" 'mgr-oid' ([ordered]@{
        scheduleVersion = $progressTask.scheduleVersion; label = 'CI baseline'; reason = 'Automated integration baseline'
    })
    Assert-Equal $baseline.revision 1 'Schedule baseline revision'
    $myWork = Invoke-Api GET '/api/v1/me/work' 'dev-user'
    Assert-Equal @($myWork).Count 2 'My Work task count'
    $myWorkTask = @($myWork | Where-Object { $_.taskId -eq $fourWorkDayTask.id })[0]
    Assert-Equal $myWorkTask.managerId $manager.id 'My Work project manager id'
    Assert-Equal $myWorkTask.managerName $manager.name 'My Work project manager name'
    Assert-Equal $myWorkTask.projectStatus 'Planning' 'My Work project status'
    Assert-Equal $myWorkTask.canUpdate $true 'My Work update capability'
    Assert-Equal $myWorkTask.kind 'task' 'My Work leaf kind'
    Assert-Equal $myWorkTask.origin 'PM' 'My Work task origin'
    Assert-Equal $myWorkTask.phaseWbs '1' 'My Work top phase WBS'
    Assert-Equal $myWorkTask.phaseName 'CI delivery phase' 'My Work top phase name'
    Assert-Equal $myWorkTask.isOwnDetail $false 'PM task is not a member-owned detail'
    Assert-Equal $myWorkTask.canAddDetail $true 'Pristine manual task member-detail capability'
    Assert-Equal $myWorkTask.canDeleteDetail $false 'PM task delete-detail capability'
    if ([string]::IsNullOrWhiteSpace($myWorkTask.scheduleVersion)) { throw 'My Work did not return the project schedule version.' }

    $forecastFinish = $scheduleMondayDate.AddDays(7).ToString('yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture)
    $null = Assert-ApiError POST "/api/v1/schedule/tasks/$($fourWorkDayTask.id)/updates" 'dev-user' ([ordered]@{
        scheduleVersion = $myWorkTask.scheduleVersion; rowVersion = $myWorkTask.rowVersion; percentComplete = 25;
        actualStart = $scheduleMonday; actualFinish = $null; forecastFinish = $forecastFinish;
        status = 'Blocked'; remark = ''
    }) 'validation_failed' 400
    $blockedTask = Invoke-Api POST "/api/v1/schedule/tasks/$($fourWorkDayTask.id)/updates" 'dev-user' ([ordered]@{
        scheduleVersion = $myWorkTask.scheduleVersion; rowVersion = $myWorkTask.rowVersion; percentComplete = 25;
        actualStart = $scheduleMonday; actualFinish = $null; forecastFinish = $forecastFinish;
        status = 'Blocked'; remark = 'CI dependency blocked'
    })
    if ([string]::IsNullOrWhiteSpace($blockedTask.scheduleVersion)) { throw 'Progress update did not return the new schedule version.' }

    $dayRequest = Invoke-Api POST "/api/v1/schedule/tasks/$($fourWorkDayTask.id)/day-requests" 'dev-user' ([ordered]@{
        requestDays = 3; comment = 'CI needs extra commissioning time'
    })
    Assert-Equal $dayRequest.requestDays 3 'My Work requested day count'
    $null = Assert-ApiError POST "/api/v1/schedule/tasks/$($fourWorkDayTask.id)/day-requests" 'dev-user' ([ordered]@{
        requestDays = 2; comment = 'CI duplicate request'
    }) 'schedule_day_request_pending' 409

    $myWorkAfterUpdate = Invoke-Api GET '/api/v1/me/work' 'dev-user'
    $updatedWorkTask = @($myWorkAfterUpdate | Where-Object { $_.taskId -eq $fourWorkDayTask.id })[0]
    Assert-Equal $updatedWorkTask.status 'Blocked' 'My Work blocked status persistence'
    Assert-Equal $updatedWorkTask.forecastFinish $forecastFinish 'My Work forecast persistence'
    Assert-Equal $updatedWorkTask.remark 'CI dependency blocked' 'My Work remark persistence'
    Assert-Equal $updatedWorkTask.pendingRequest.id $dayRequest.id 'My Work pending request id'
    Assert-Equal $updatedWorkTask.pendingRequest.requestDays 3 'My Work pending request days'
    Assert-Equal $updatedWorkTask.canAddDetail $false 'Pending or started task add-detail capability'

    $null = Assert-ApiError PUT "/api/v1/schedule/tasks/$($fourWorkDayTask.id)" 'mgr-oid' ([ordered]@{
        scheduleVersion = $updatedWorkTask.scheduleVersion; rowVersion = $updatedWorkTask.rowVersion;
        parentId = $schedulePhase.id; sortOrder = 2; kind = 'task'; name = 'CI holiday-spanning task';
        isMilestone = $false; visibility = 'Internal'; planStart = $scheduleMonday; planDays = 6;
        startMode = 'manual'; predecessorId = $null; lagDays = 0; picUserIds = @($dev.id);
        picExternal = ''; planManDays = 4
    }) 'schedule_day_request_pending' 409
    $null = Assert-ApiError PUT "/api/v1/schedule/tasks/$($fourWorkDayTask.id)" 'mgr-oid' ([ordered]@{
        scheduleVersion = $updatedWorkTask.scheduleVersion; rowVersion = $updatedWorkTask.rowVersion;
        parentId = $schedulePhase.id; sortOrder = 2; kind = 'task'; name = 'CI holiday-spanning task';
        isMilestone = $false; visibility = 'Internal'; planStart = $scheduleMonday; planDays = 5;
        startMode = 'manual'; predecessorId = $null; lagDays = 0; picUserIds = @($dev.id, $manager.id);
        picExternal = ''; planManDays = 4
    }) 'schedule_day_request_pending' 409

    $acceptedRequest = Invoke-Api POST "/api/v1/schedule/day-requests/$($dayRequest.id)/answer" 'mgr-oid' ([ordered]@{
        scheduleVersion = $updatedWorkTask.scheduleVersion; rowVersion = $updatedWorkTask.rowVersion;
        answer = 'Accepted'; note = 'CI PM approved extra time'
    })
    Assert-Equal $acceptedRequest.answer 'Accepted' 'Accepted day request answer'
    Assert-Equal $acceptedRequest.planDays 8 'Accepted day request task duration'
    $null = Assert-ApiError POST "/api/v1/schedule/day-requests/$($dayRequest.id)/answer" 'mgr-oid' ([ordered]@{
        scheduleVersion = $acceptedRequest.scheduleVersion; rowVersion = $acceptedRequest.rowVersion;
        answer = 'Rejected'; note = 'CI duplicate answer'
    }) 'schedule_day_request_answered' 409

    $myWorkAfterAccept = Invoke-Api GET '/api/v1/me/work' 'dev-user'
    $acceptedWorkTask = @($myWorkAfterAccept | Where-Object { $_.taskId -eq $fourWorkDayTask.id })[0]
    if ($null -ne $acceptedWorkTask.pendingRequest) { throw 'An accepted day request remained pending in My Work.' }
    $scheduleAfterAccept = Invoke-Api GET "/api/v1/projects/$($project.id)/schedule" 'mgr-oid'
    $acceptedScheduleTask = @(@($scheduleAfterAccept.tasks)[0].children | Where-Object { $_.id -eq $fourWorkDayTask.id })[0]
    Assert-Equal $acceptedScheduleTask.planDays 8 'Accepted request schedule plan days'
    $acceptedScheduleRequest = @($scheduleAfterAccept.recentUpdates | Where-Object { $_.id -eq $dayRequest.id })[0]
    Assert-Equal $acceptedScheduleRequest.requestDays 3 'Project schedule request metadata days'
    Assert-Equal $acceptedScheduleRequest.answer 'Accepted' 'Project schedule request metadata answer'
    Assert-Equal $acceptedScheduleRequest.answerBy.id $manager.id 'Project schedule request metadata answer actor'
    Assert-Equal $acceptedScheduleRequest.answerNote 'CI PM approved extra time' 'Project schedule request metadata note'

    $rejectedDayRequest = Invoke-Api POST "/api/v1/schedule/tasks/$($fourWorkDayTask.id)/day-requests" 'dev-user' ([ordered]@{
        requestDays = 1; comment = 'CI second request for rejection coverage'
    })
    $myWorkBeforeReject = Invoke-Api GET '/api/v1/me/work' 'dev-user'
    $rejectWorkTask = @($myWorkBeforeReject | Where-Object { $_.taskId -eq $fourWorkDayTask.id })[0]
    $rejectedRequest = Invoke-Api POST "/api/v1/schedule/day-requests/$($rejectedDayRequest.id)/answer" 'mgr-oid' ([ordered]@{
        scheduleVersion = $rejectWorkTask.scheduleVersion; rowVersion = $rejectWorkTask.rowVersion;
        answer = 'Rejected'; note = 'CI PM kept the current plan'
    })
    Assert-Equal $rejectedRequest.answer 'Rejected' 'Rejected day request answer'
    Assert-Equal $rejectedRequest.planDays 8 'Rejected day request leaves duration unchanged'
    $myWorkAfterReject = Invoke-Api GET '/api/v1/me/work' 'dev-user'
    $updatedWorkTask = @($myWorkAfterReject | Where-Object { $_.taskId -eq $fourWorkDayTask.id })[0]
    if ($null -ne $updatedWorkTask.pendingRequest) { throw 'A rejected day request remained pending in My Work.' }

    $null = Assert-ApiError POST "/api/v1/schedule/tasks/$($fourWorkDayTask.id)/details" 'dev-user' ([ordered]@{
        scheduleVersion = $updatedWorkTask.scheduleVersion; rowVersion = $updatedWorkTask.rowVersion;
        name = 'CI member-owned detail'; planDays = 2
    }) 'schedule_detail_parent_started' 409

    $linkedDetailParentTask = Invoke-Api POST "/api/v1/projects/$($project.id)/schedule/tasks" 'mgr-oid' ([ordered]@{
        scheduleVersion = $updatedWorkTask.scheduleVersion; parentId = $schedulePhase.id; sortOrder = 30; kind = 'task'; name = 'CI linked detail parent task';
        isMilestone = $false; visibility = 'Internal'; planStart = $null; planDays = 2; startMode = 'linked';
        predecessorId = $oneDayTask.id; lagDays = 0; picUserIds = @($dev.id); picExternal = ''; planManDays = 2
    })
    $null = Assert-ApiError POST "/api/v1/schedule/tasks/$($linkedDetailParentTask.id)/details" 'dev-user' ([ordered]@{
        scheduleVersion = $linkedDetailParentTask.scheduleVersion; rowVersion = $linkedDetailParentTask.rowVersion;
        name = 'CI linked member detail'; planDays = 2
    }) 'schedule_detail_parent_linked' 409
    $myWorkWithLinkedParent = Invoke-Api GET '/api/v1/me/work' 'dev-user'
    $linkedParentWork = @($myWorkWithLinkedParent | Where-Object { $_.taskId -eq $linkedDetailParentTask.id })[0]
    Assert-Equal $linkedParentWork.canAddDetail $false 'Linked task add-detail capability'

    $detailParentTask = Invoke-Api POST "/api/v1/projects/$($project.id)/schedule/tasks" 'mgr-oid' ([ordered]@{
        scheduleVersion = $linkedDetailParentTask.scheduleVersion; parentId = $schedulePhase.id; sortOrder = 40; kind = 'task'; name = 'CI detail parent task';
        isMilestone = $false; visibility = 'Internal'; planStart = $scheduleMonday; planDays = 3; startMode = 'manual';
        predecessorId = $null; lagDays = 0; picUserIds = @($dev.id); picExternal = ''; planManDays = 3
    })
    $null = Assert-ApiError POST "/api/v1/schedule/tasks/$($detailParentTask.id)/details" 'dev-user' ([ordered]@{
        scheduleVersion = $detailParentTask.scheduleVersion; rowVersion = $detailParentTask.rowVersion;
        name = 'CI boundary-changing detail'; planDays = 2
    }) 'schedule_detail_outside_parent_plan' 422

    $detailParentRequest = Invoke-Api POST "/api/v1/schedule/tasks/$($detailParentTask.id)/day-requests" 'dev-user' ([ordered]@{
        requestDays = 1; comment = 'CI pending request blocks adding a child row'
    })
    $null = Assert-ApiError POST "/api/v1/schedule/tasks/$($detailParentTask.id)/details" 'dev-user' ([ordered]@{
        scheduleVersion = $detailParentTask.scheduleVersion; rowVersion = $detailParentTask.rowVersion;
        name = 'CI pending-request detail'; planDays = 3
    }) 'schedule_day_request_pending' 409
    $clearedDetailParentRequest = Invoke-Api POST "/api/v1/schedule/day-requests/$($detailParentRequest.id)/answer" 'mgr-oid' ([ordered]@{
        scheduleVersion = $detailParentTask.scheduleVersion; rowVersion = $detailParentTask.rowVersion;
        answer = 'Rejected'; note = 'CI clear pending request before adding detail'
    })
    $scheduleBeforeMemberDetail = Invoke-Api GET "/api/v1/projects/$($project.id)/schedule" 'mgr-oid'

    $memberDetail = Invoke-Api POST "/api/v1/schedule/tasks/$($detailParentTask.id)/details" 'dev-user' ([ordered]@{
        scheduleVersion = $clearedDetailParentRequest.scheduleVersion; rowVersion = $clearedDetailParentRequest.rowVersion;
        name = 'CI member-owned detail'; planDays = 3
    })
    $myWorkWithDetail = Invoke-Api GET '/api/v1/me/work' 'dev-user'
    Assert-Equal @($myWorkWithDetail).Count 4 'My Work leaf-only count after member detail creation'
    if (@($myWorkWithDetail | Where-Object { $_.taskId -eq $detailParentTask.id }).Count -ne 0) {
        throw 'My Work returned a parent task after it gained an active child.'
    }
    $memberDetailWork = @($myWorkWithDetail | Where-Object { $_.taskId -eq $memberDetail.id })[0]
    Assert-Equal $memberDetailWork.kind 'detail' 'Member detail kind'
    Assert-Equal $memberDetailWork.origin 'Member' 'Member detail origin'
    Assert-Equal $memberDetailWork.phaseWbs '1' 'Member detail phase WBS'
    Assert-Equal $memberDetailWork.isOwnDetail $true 'Member detail ownership capability'
    Assert-Equal $memberDetailWork.canAddDetail $false 'Member detail cannot add another detail'
    Assert-Equal $memberDetailWork.canDeleteDetail $true 'Pristine owned member detail delete capability'
    $scheduleWithMemberDetail = Invoke-Api GET "/api/v1/projects/$($project.id)/schedule" 'mgr-oid'
    Assert-Equal $scheduleWithMemberDetail.summary.planStart $scheduleBeforeMemberDetail.summary.planStart 'Member detail preserves project plan start'
    Assert-Equal $scheduleWithMemberDetail.summary.planFinish $scheduleBeforeMemberDetail.summary.planFinish 'Member detail preserves project plan finish'
    Assert-Equal $scheduleWithMemberDetail.summary.percentComplete $scheduleBeforeMemberDetail.summary.percentComplete 'Member detail preserves project progress'
    $detailParentSchedule = @(@($scheduleWithMemberDetail.tasks)[0].children | Where-Object { $_.id -eq $detailParentTask.id })[0]
    $detailParentFinish = $scheduleMondayDate.AddDays(2).ToString('yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture)
    Assert-Equal $detailParentSchedule.planStart $scheduleMonday 'Member detail preserves parent plan start'
    Assert-Equal $detailParentSchedule.planFinish $detailParentFinish 'Member detail preserves parent plan finish'
    Assert-Equal $detailParentSchedule.percentComplete 0 'Member detail preserves pristine parent progress'

    $null = Assert-ApiError DELETE "/api/v1/schedule/tasks/$($memberDetail.id)/details" 'engineer-oid' ([ordered]@{
        scheduleVersion = $memberDetail.scheduleVersion; rowVersion = $memberDetail.rowVersion
    }) 'schedule_member_detail_owner_required' 403
    $memberDetailRequest = Invoke-Api POST "/api/v1/schedule/tasks/$($memberDetail.id)/day-requests" 'dev-user' ([ordered]@{
        requestDays = 1; comment = 'CI pending request blocks deleting the task row'
    })
    $myWorkWithPendingDetail = Invoke-Api GET '/api/v1/me/work' 'dev-user'
    $pendingDetailWork = @($myWorkWithPendingDetail | Where-Object { $_.taskId -eq $memberDetail.id })[0]
    Assert-Equal $pendingDetailWork.canDeleteDetail $false 'Pending request disables member-detail deletion capability'
    $null = Assert-ApiError DELETE "/api/v1/schedule/tasks/$($memberDetail.id)/details" 'dev-user' ([ordered]@{
        scheduleVersion = $memberDetail.scheduleVersion; rowVersion = $memberDetail.rowVersion
    }) 'schedule_day_request_pending' 409
    $clearedMemberDetailRequest = Invoke-Api POST "/api/v1/schedule/day-requests/$($memberDetailRequest.id)/answer" 'mgr-oid' ([ordered]@{
        scheduleVersion = $memberDetail.scheduleVersion; rowVersion = $memberDetail.rowVersion;
        answer = 'Rejected'; note = 'CI clear pending request before deleting detail'
    })
    $deletedDetail = Invoke-Api DELETE "/api/v1/schedule/tasks/$($memberDetail.id)/details" 'dev-user' ([ordered]@{
        scheduleVersion = $clearedMemberDetailRequest.scheduleVersion; rowVersion = $clearedMemberDetailRequest.rowVersion
    })
    Assert-Equal $deletedDetail.deleted $true 'Member detail soft delete'

    $myUpdates = Invoke-Api GET '/api/v1/me/work/updates' 'dev-user'
    $requestHistory = @($myUpdates | Where-Object { $_.id -eq $dayRequest.id })[0]
    Assert-Equal $requestHistory.projectId $project.id 'My Work update project id'
    Assert-Equal $requestHistory.taskId $fourWorkDayTask.id 'My Work update task id'
    Assert-Equal $requestHistory.wbs '1.2' 'My Work update task WBS'
    Assert-Equal $requestHistory.field 'request' 'My Work request history field'
    Assert-Equal $requestHistory.requestDays 3 'My Work request history days'
    Assert-Equal $requestHistory.comment 'CI needs extra commissioning time' 'My Work request history comment'
    Assert-Equal $requestHistory.answer 'Accepted' 'My Work request history answer'
    Assert-Equal $requestHistory.answerNote 'CI PM approved extra time' 'My Work request history answer note'
    if (@($myUpdates | Where-Object { $_.taskId -eq $fourWorkDayTask.id -and $_.field -eq 'forecast_finish' }).Count -lt 1) {
        throw 'My Work update history did not include the persisted forecast change.'
    }

    # A task PIC is not itself project authorization. Keep a real task and
    # update owned by the engineer, then remove only project membership so the
    # stale PIC rows prove that both My Work read models and mutations enforce
    # ProjectScope independently.
    $stalePicTask = Invoke-Api POST "/api/v1/projects/$($project.id)/schedule/tasks" 'mgr-oid' ([ordered]@{
        scheduleVersion = $deletedDetail.scheduleVersion; parentId = $schedulePhase.id; sortOrder = 3;
        kind = 'task'; name = 'CI stale PIC scope task'; isMilestone = $false; visibility = 'Internal';
        planStart = $scheduleMonday; planDays = 1; startMode = 'manual'; predecessorId = $null; lagDays = 0;
        picUserIds = @($otherEngineer.id, $otherProjectManager.id); picExternal = ''; planManDays = 1
    })
    $scopedEngineerWork = Invoke-Api GET '/api/v1/me/work' 'engineer-oid'
    $scopedEngineerTask = @($scopedEngineerWork | Where-Object { $_.taskId -eq $stalePicTask.id })[0]
    Assert-Equal $scopedEngineerTask.canUpdate $true 'In-scope PIC My Work update capability'
    $stalePicUpdate = Invoke-Api POST "/api/v1/schedule/tasks/$($stalePicTask.id)/updates" 'engineer-oid' ([ordered]@{
        scheduleVersion = $scopedEngineerTask.scheduleVersion; rowVersion = $scopedEngineerTask.rowVersion;
        percentComplete = 25; actualStart = $scheduleMonday; actualFinish = $null;
        forecastFinish = $scheduleMonday; status = 'In Progress'; remark = 'CI scoped update before removal'
    })
    $scopedEngineerUpdates = Invoke-Api GET '/api/v1/me/work/updates' 'engineer-oid'
    if (@($scopedEngineerUpdates | Where-Object { $_.projectId -eq $project.id -and $_.taskId -eq $stalePicTask.id }).Count -lt 1) {
        throw 'The in-scope engineer update was missing before project membership removal.'
    }

    # The Project Manager role is project-scoped here: it must not become a
    # global My Work bypass merely because the actor manages other projects.
    $scopedProjectManagerWork = Invoke-Api GET '/api/v1/me/work' 'pm-oid'
    $scopedProjectManagerTask = @($scopedProjectManagerWork | Where-Object { $_.taskId -eq $stalePicTask.id })[0]
    Assert-Equal $scopedProjectManagerTask.canUpdate $true 'In-scope Project Manager PIC My Work capability'
    $staleProjectManagerUpdate = Invoke-Api POST "/api/v1/schedule/tasks/$($stalePicTask.id)/updates" 'pm-oid' ([ordered]@{
        scheduleVersion = $stalePicUpdate.scheduleVersion; rowVersion = $stalePicUpdate.rowVersion;
        percentComplete = 30; actualStart = $scheduleMonday; actualFinish = $null;
        forecastFinish = $scheduleMonday; status = 'In Progress'; remark = 'CI scoped PM update before removal'
    })
    $scopedProjectManagerUpdates = Invoke-Api GET '/api/v1/me/work/updates' 'pm-oid'
    if (@($scopedProjectManagerUpdates | Where-Object { $_.projectId -eq $project.id -and $_.taskId -eq $stalePicTask.id }).Count -lt 1) {
        throw 'The in-scope Project Manager update was missing before project membership removal.'
    }

    Invoke-SqlQuery $databaseName "DELETE FROM dbo.project_members WHERE project_id = $($project.id) AND user_id IN ($($otherEngineer.id), $($otherProjectManager.id)); IF @@ROWCOUNT <> 2 THROW 51091, 'Stale PIC membership fixture removal failed.', 1;"
    $outOfScopeWork = Invoke-Api GET '/api/v1/me/work' 'engineer-oid'
    if (@($outOfScopeWork | Where-Object { $_.projectId -eq $project.id }).Count -ne 0) {
        throw 'My Work exposed a stale PIC after project membership was removed.'
    }
    $outOfScopeUpdates = Invoke-Api GET '/api/v1/me/work/updates' 'engineer-oid'
    if (@($outOfScopeUpdates | Where-Object { $_.projectId -eq $project.id }).Count -ne 0) {
        throw 'My Work update history exposed a project after membership was removed.'
    }
    $outOfScopeProjectManagerWork = Invoke-Api GET '/api/v1/me/work' 'pm-oid'
    if (@($outOfScopeProjectManagerWork | Where-Object { $_.projectId -eq $project.id }).Count -ne 0) {
        throw 'My Work treated the Project Manager role as globally elevated after membership was removed.'
    }
    $outOfScopeProjectManagerUpdates = Invoke-Api GET '/api/v1/me/work/updates' 'pm-oid'
    if (@($outOfScopeProjectManagerUpdates | Where-Object { $_.projectId -eq $project.id }).Count -ne 0) {
        throw 'My Work update history treated the Project Manager role as globally elevated after membership was removed.'
    }
    $null = Assert-ApiError POST "/api/v1/schedule/tasks/$($stalePicTask.id)/updates" 'engineer-oid' ([ordered]@{
        scheduleVersion = $staleProjectManagerUpdate.scheduleVersion; rowVersion = $staleProjectManagerUpdate.rowVersion;
        percentComplete = 50; actualStart = $scheduleMonday; actualFinish = $null;
        forecastFinish = $scheduleMonday; status = 'In Progress'; remark = 'CI stale PIC update must fail'
    }) 'project_scope_forbidden' 403
    $null = Assert-ApiError POST "/api/v1/schedule/tasks/$($stalePicTask.id)/updates" 'pm-oid' ([ordered]@{
        scheduleVersion = $staleProjectManagerUpdate.scheduleVersion; rowVersion = $staleProjectManagerUpdate.rowVersion;
        percentComplete = 50; actualStart = $scheduleMonday; actualFinish = $null;
        forecastFinish = $scheduleMonday; status = 'In Progress'; remark = 'CI stale Project Manager PIC update must fail'
    }) 'project_scope_forbidden' 403

    $oldPendingRequest = Invoke-Api POST "/api/v1/schedule/tasks/$($fourWorkDayTask.id)/day-requests" 'dev-user' ([ordered]@{
        requestDays = 2; comment = 'CI pending request older than the recent activity window'
    })
    $historyNoiseSql = @"
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET NUMERIC_ROUNDABORT OFF;
SET NOCOUNT ON;
DECLARE @history_counter int = 1;
WHILE @history_counter <= 105
BEGIN
    INSERT INTO dbo.schedule_updates (
        project_id, task_id, actor_id, field, from_value, to_value, comment)
    VALUES (
        $($project.id), $($fourWorkDayTask.id), $($manager.id), N'ci_history_noise', NULL,
        CONVERT(nvarchar(20), @history_counter), N'CI recent activity window fixture');
    SET @history_counter += 1;
END;
"@
    Invoke-SqlQuery $databaseName $historyNoiseSql
    $scheduleWithOldPending = Invoke-Api GET "/api/v1/projects/$($project.id)/schedule" 'mgr-oid'
    $oldPendingMatches = @($scheduleWithOldPending.recentUpdates | Where-Object { $_.id -eq $oldPendingRequest.id })
    Assert-Equal $oldPendingMatches.Count 1 'Project schedule old pending request inclusion without duplicate'
    Assert-Equal $oldPendingMatches[0].requestDays 2 'Project schedule old pending request days'
    if ($null -ne $oldPendingMatches[0].answer) { throw 'The old pending request was unexpectedly answered.' }
    Assert-Equal @($scheduleWithOldPending.recentUpdates).Count 101 'Project schedule latest 100 plus all pending requests'
    Invoke-SqlQuery $databaseName "SET ANSI_NULLS ON; SET QUOTED_IDENTIFIER ON; SET ANSI_PADDING ON; SET ANSI_WARNINGS ON; SET ARITHABORT ON; SET CONCAT_NULL_YIELDS_NULL ON; SET NUMERIC_ROUNDABORT OFF; UPDATE dbo.projects SET status = N'Closed', updated_by = $($manager.id), updated_at = SYSUTCDATETIME() WHERE id = $($project.id); IF @@ROWCOUNT <> 1 THROW 51098, 'Closed-project My Work fixture update failed.', 1;"
    $closedProjectWork = Invoke-Api GET '/api/v1/me/work' 'dev-user'
    $closedProjectTask = @($closedProjectWork | Where-Object { $_.taskId -eq $fourWorkDayTask.id })[0]
    Assert-Equal $closedProjectTask.projectStatus 'Closed' 'Closed project My Work status'
    Assert-Equal $closedProjectTask.canUpdate $false 'Closed project My Work update capability'
    $rates = Invoke-Api GET '/api/v1/admin/engineering-rates?page=1&pageSize=25&activeOnly=true' 'mgr-oid'
    Assert-Equal @($rates.items).Count 1 'Engineering rate read model count'
    Assert-Equal @($rates.items)[0].id $rate.id 'Engineering rate read model id'
    $audit = Invoke-Api GET '/api/v1/admin/audit?page=1&pageSize=100' 'mgr-oid'
    if (@($audit.items).Count -lt 1) { throw 'Administrative audit read model did not return the recorded workflow events.' }

    $assertionSql = @"
SET NOCOUNT ON;
IF NOT EXISTS (SELECT 1 FROM dbo.reservations WHERE id = $($reservation.id) AND project_id = $($project.id) AND qty = 4 AND status = N'Consumed') THROW 51062, 'Reservation consumption mismatch.', 1;
IF NOT EXISTS (SELECT 1 FROM dbo.cost_items WHERE id = $($temporaryCostItem.id) AND estimate_id = $($estimate.id) AND deleted_at IS NOT NULL AND unit_cost = 60) THROW 51117, 'Estimate cost-line soft-delete persistence mismatch.', 1;
IF NOT EXISTS (SELECT 1 FROM dbo.manhour_lines WHERE id = $($manhourLine.id) AND estimate_id = $($estimate.id) AND deleted_at IS NULL AND cost_type = N'Engineering' AND provider = N'Internal' AND daily_rate = 4000 AND line_cost = 8000) THROW 51118, 'Estimate man-hour persistence or internal-rate derivation mismatch.', 1;
IF NOT EXISTS (SELECT 1 FROM dbo.expense_lines WHERE id = $($expenseLine.id) AND estimate_id = $($estimate.id) AND deleted_at IS NULL AND qty = 1 AND unit_cost = 100 AND line_total = 100) THROW 51119, 'Estimate expense persistence mismatch.', 1;
IF NOT EXISTS (SELECT 1 FROM dbo.other_cost_lines WHERE id = $($otherCostLine.id) AND estimate_id = $($estimate.id) AND deleted_at IS NULL AND qty = 1 AND unit_cost = 200 AND line_total = 200) THROW 51120, 'Estimate other-cost persistence mismatch.', 1;
IF NOT EXISTS (SELECT 1 FROM dbo.estimates WHERE id = $($estimate.id) AND status = N'Approved' AND contingency_rate = 5) THROW 51121, 'Estimate approval or contingency persistence mismatch.', 1;
IF NOT EXISTS (SELECT 1 FROM dbo.inquiries WHERE id = $($inquiry.id) AND project_probability = 80 AND customer_interest_grade = 'A' AND qualification_note = N'CI confirmed budget and timeline') THROW 51124, 'Inquiry qualification persistence mismatch.', 1;
IF EXISTS (SELECT 1 FROM dbo.reservations WHERE project_id = $($project.id) AND status = N'Active') THROW 51073, 'Active reservation remained.', 1;
IF COALESCE((SELECT status FROM dbo.mat_prs WHERE id = $($pr.id)), N'') <> N'Converted to PO' THROW 51063, 'PR status mismatch.', 1;
IF COALESCE((SELECT status FROM dbo.mat_pos WHERE id = $($po.id)), N'') <> N'Received' THROW 51064, 'PO status mismatch.', 1;
IF COALESCE((SELECT status FROM dbo.grns WHERE id = $($grn.id)), N'') <> N'Confirmed' THROW 51065, 'GRN status mismatch.', 1;
IF COALESCE((SELECT status FROM dbo.grns WHERE id = $($conflictingGrn.id)), N'') <> N'Draft' THROW 51082, 'Conflicting GRN was not left as a draft.', 1;
IF COALESCE((SELECT status FROM dbo.mirs WHERE id = $($mir.id)), N'') <> N'Received' THROW 51066, 'MIR status mismatch.', 1;
IF NOT EXISTS (SELECT 1 FROM dbo.mir_lines WHERE id = $($mirLine.id) AND issued_qty = 7 AND returned_qty = 2) THROW 51074, 'MIR line quantity mismatch.', 1;
IF NOT EXISTS (SELECT 1 FROM dbo.mirs WHERE id = $($staleMir.id) AND status = N'Approved') THROW 51079, 'Blocked stale MIR status mismatch.', 1;
IF EXISTS (SELECT 1 FROM dbo.stock_txns WHERE source_event_key LIKE N'mir:$($staleMir.id):line:%:issue') THROW 51080, 'Blocked stale MIR moved stock.', 1;
IF (SELECT COUNT_BIG(*) FROM dbo.mat_pr_approval_steps WHERE pr_id = $($pr.id) AND status = N'Completed' AND decision = N'Approve' AND name IN (N'Section Owner Review', N'Budget Owner Approval', N'Purchasing Review')) <> 3 THROW 51075, 'PR approval chain mismatch.', 1;
IF ABS((SELECT COALESCE(SUM(qty), 0) FROM dbo.stock_txns WHERE item_id = $($item.id) AND bucket = N'stock') - 5) > 0.0001 THROW 51067, 'Stock balance mismatch.', 1;
IF ABS((SELECT COALESCE(SUM(-qty * unit_cost), 0) FROM dbo.stock_txns WHERE project_id = $($project.id) AND txn_type IN (N'MIR_ISSUE', N'MIR_RETURN')) - 50) > 0.0001 THROW 51068, 'Actual cost mismatch.', 1;
IF (SELECT COUNT_BIG(*) FROM dbo.stock_txns WHERE source_event_key = N'adj:$($adjustment.id)' AND txn_type = N'STOCK_ADJUSTMENT' AND qty = 4) <> 1 THROW 51069, 'Adjustment ledger idempotency mismatch.', 1;
IF COALESCE((SELECT status FROM dbo.stock_adjustments WHERE id = $($staleNegativeAdjustment.id)), N'') <> N'Pending Approval' THROW 51083, 'Rejected stale stock adjustment was not left pending.', 1;
IF EXISTS (SELECT 1 FROM dbo.stock_txns WHERE source_event_key = N'adj:$($staleNegativeAdjustment.id)') THROW 51084, 'Rejected stale stock adjustment changed the ledger.', 1;
IF (SELECT COUNT_BIG(*) FROM dbo.stock_txns WHERE source_event_key LIKE N'grn:$($grn.id):line:%:accepted' AND txn_type = N'GRN_RECEIPT' AND qty = 6) <> 1 THROW 51070, 'GRN ledger idempotency mismatch.', 1;
IF (SELECT COUNT_BIG(*) FROM dbo.stock_txns WHERE source_event_key = N'mir:$($mir.id):line:$($mirLine.id):issue' AND txn_type = N'MIR_ISSUE' AND qty = -7) <> 1 THROW 51071, 'MIR issue ledger mismatch.', 1;
IF (SELECT COUNT_BIG(*) FROM dbo.stock_txns WHERE source_event_key = N'mir:$($mir.id):line:$($mirLine.id):return:1' AND txn_type = N'MIR_RETURN' AND qty = 2) <> 1 THROW 51072, 'MIR return ledger mismatch.', 1;
IF NOT EXISTS (SELECT 1 FROM dbo.schedule_tasks WHERE id = $($fourWorkDayTask.id) AND forecast_end = '$forecastFinish' AND status = N'Blocked' AND blocked_reason = N'CI dependency blocked' AND note = N'CI dependency blocked') THROW 51085, 'Schedule forecast or blocked reason persistence mismatch.', 1;
IF NOT EXISTS (SELECT 1 FROM dbo.schedule_updates WHERE id = $($dayRequest.id) AND task_id = $($fourWorkDayTask.id) AND actor_id = $($dev.id) AND field = N'request' AND request_days = 3 AND answer = N'Accepted' AND answer_by = $($manager.id) AND answer_note = N'CI PM approved extra time') THROW 51086, 'Accepted schedule day request persistence mismatch.', 1;
IF NOT EXISTS (SELECT 1 FROM dbo.schedule_updates WHERE id = $($rejectedDayRequest.id) AND task_id = $($fourWorkDayTask.id) AND answer = N'Rejected' AND answer_by = $($manager.id)) THROW 51088, 'Rejected schedule day request persistence mismatch.', 1;
IF NOT EXISTS (SELECT 1 FROM dbo.schedule_tasks WHERE id = $($fourWorkDayTask.id) AND plan_days = 8) THROW 51089, 'Accepted schedule day request did not extend plan days exactly once.', 1;
IF NOT EXISTS (SELECT 1 FROM dbo.schedule_updates WHERE id = $($oldPendingRequest.id) AND task_id = $($fourWorkDayTask.id) AND request_days = 2 AND answer IS NULL) THROW 51090, 'Old pending schedule request fixture mismatch.', 1;
IF NOT EXISTS (SELECT 1 FROM dbo.schedule_tasks WHERE id = $($memberDetail.id) AND origin = N'Member' AND kind = N'detail' AND created_by = $($dev.id) AND deleted_at IS NOT NULL) THROW 51087, 'Member detail ownership or soft delete mismatch.', 1;
IF NOT EXISTS (SELECT 1 FROM dbo.schedule_tasks WHERE id = $($detailParentTask.id) AND plan_days = 3 AND percent_done = 0 AND status = N'Not Started' AND actual_start IS NULL AND actual_end IS NULL) THROW 51095, 'Member detail parent boundary or progress changed.', 1;
IF NOT EXISTS (SELECT 1 FROM dbo.schedule_tasks WHERE id = $($linkedDetailParentTask.id) AND start_mode = N'linked' AND predecessor_id = $($oneDayTask.id) AND deleted_at IS NULL) THROW 51099, 'Linked detail parent lost its live dependency.', 1;
IF EXISTS (SELECT 1 FROM dbo.schedule_tasks WHERE parent_id = $($linkedDetailParentTask.id) AND deleted_at IS NULL) THROW 51100, 'A member detail was added beneath a linked task.', 1;
IF NOT EXISTS (SELECT 1 FROM dbo.schedule_updates WHERE id = $($detailParentRequest.id) AND answer = N'Rejected' AND answer_by = $($manager.id)) THROW 51096, 'Parent pending-request guard fixture was not resolved.', 1;
IF NOT EXISTS (SELECT 1 FROM dbo.schedule_updates WHERE id = $($memberDetailRequest.id) AND answer = N'Rejected' AND answer_by = $($manager.id)) THROW 51097, 'Detail delete pending-request guard fixture was not resolved.', 1;
IF EXISTS (SELECT 1 FROM dbo.project_members WHERE project_id = $($project.id) AND user_id IN ($($otherEngineer.id), $($otherProjectManager.id))) THROW 51092, 'Stale PIC actors remained project members.', 1;
IF (SELECT COUNT_BIG(*) FROM dbo.schedule_task_pics WHERE task_id = $($stalePicTask.id) AND user_id IN ($($otherEngineer.id), $($otherProjectManager.id))) <> 2 THROW 51093, 'Stale PIC fixtures were not preserved.', 1;
IF (SELECT COUNT_BIG(*) FROM dbo.schedule_updates WHERE task_id = $($stalePicTask.id) AND actor_id IN ($($otherEngineer.id), $($otherProjectManager.id))) < 2 THROW 51094, 'Stale PIC update-history fixtures were not preserved.', 1;
SELECT N'PASS' AS full_material_flow;
"@
    Invoke-SqlQuery $databaseName $assertionSql

    # Exercise the production verifier against the application-role auth path.
    # The CI identities use readable aliases during API calls; replace only the
    # external object IDs now that the HTTP flow is complete so production's
    # canonical-GUID identity guard can run against this disposable database.
    Invoke-SqlQuery $databaseName "UPDATE dbo.users SET entra_object_id = CONVERT(nvarchar(36), NEWID());"
    Push-Location $repoRoot
    try {
        & sqlcmd @sqlcmdBase -i (Join-Path $repoRoot 'database\scripts\080_verify_production_baseline.sql') `
            -v "DatabaseName=$databaseName" "AppLogin=$appRoleName"
        if ($LASTEXITCODE -ne 0) { throw 'Production baseline verifier failed for the application-role fixture.' }
    } finally {
        Pop-Location
    }
    Write-Output "Full material flow, schedule, reports, stock balance, and actual cost passed in $databaseName."
} finally {
    if ($null -ne $apiProcess -and -not $apiProcess.HasExited) {
        Stop-Process -Id $apiProcess.Id -Force -ErrorAction SilentlyContinue
        $apiProcess.WaitForExit(10000) | Out-Null
    }

    if ($cleanupEligible) {
        try { Invoke-SqlFile (Join-Path $PSScriptRoot 'drop-ci-database.sql') }
        catch { Write-Error "CI database cleanup failed for the validated target $databaseName. $_" }
    }

    if ($null -eq $oldSqlcmdPassword) { Remove-Item Env:SQLCMDPASSWORD -ErrorAction SilentlyContinue }
    else { $env:SQLCMDPASSWORD = $oldSqlcmdPassword }
    Remove-Item -LiteralPath $stdoutPath -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $stderrPath -Force -ErrorAction SilentlyContinue
}
