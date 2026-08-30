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

$sqlcmdBase = @('-S', $SqlServer, '-b', '-r1', '-C')
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
        [Parameter(Mandatory)][ValidateSet('GET', 'POST', 'PUT')][string] $Method,
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
        if (-not [string]::IsNullOrWhiteSpace($details)) {
            throw "API $Method $Path failed: $details"
        }
        throw "API $Method $Path failed: $($_.Exception.Message)"
    }
}

function Assert-Equal {
    param([object] $Actual, [object] $Expected, [string] $Label)
    if ($Actual -ne $Expected) { throw "$Label expected '$Expected' but received '$Actual'." }
}

$apiProcess = $null
$stdoutPath = Join-Path ([IO.Path]::GetTempPath()) ("iot-team-api-{0}.out.log" -f [Guid]::NewGuid().ToString('N'))
$stderrPath = Join-Path ([IO.Path]::GetTempPath()) ("iot-team-api-{0}.err.log" -f [Guid]::NewGuid().ToString('N'))
$cleanupEligible = $true

try {
    Invoke-SqlFile (Join-Path $repoRoot 'database\scripts\020_deploy_fresh_database.sql')
    Invoke-SqlFile (Join-Path $PSScriptRoot 'seed-ci-users.sql')

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

    $inquiry = Invoke-Api POST '/api/v1/inquiries' 'dev-user' ([ordered]@{
        customerId = $customer.id; contact = ''; projectName = 'CI Full Material Flow'; projectType = 'Integration';
        rfqNo = 'CI-RFQ'; salesOwner = 'CI'; estimateOwnerId = $dev.id; dueDate = $future; priority = 'Normal';
        requirement = 'Automated material flow'; background = $null; scopeSummary = 'Integration'; technical = $null;
        targetDelivery = $delivery; siteLocation = 'CI'; standard = $null; special = $null; remark = $null
    })
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
    $submittedEstimate = Invoke-Api POST "/api/v1/estimates/$($estimate.id)/submit" 'dev-user' ([ordered]@{
        comment = 'CI submit'; rowVersion = $costItem.estimateRowVersion
    })
    $approvedEstimate = Invoke-Api POST "/api/v1/estimates/$($estimate.id)/approve" 'mgr-oid' ([ordered]@{
        comment = 'CI approve'; rowVersion = $submittedEstimate.rowVersion
    })
    Assert-Equal $approvedEstimate.status 'Approved' 'Estimate status'

    $project = Invoke-Api POST '/api/v1/projects' 'dev-user' ([ordered]@{
        estimateId = $estimate.id; purchaseOrderNumber = 'CI-CUSTOMER-PO'; purchaseOrderDate = $today;
        managerId = $manager.id; leadEngineerId = $dev.id; startDate = $today; targetDelivery = $delivery;
        site = 'CI'; remark = 'Automated integration flow'
    })
    $bom = Invoke-Api POST '/api/v1/boms' 'dev-user' ([ordered]@{ projectId = $project.id })
    $bomDetail = Invoke-Api GET "/api/v1/boms/$($bom.id)" 'dev-user'
    $bomLine = @($bomDetail.lines)[0]
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

    $pr = Invoke-Api POST '/api/v1/purchase-requisitions' 'dev-user' ([ordered]@{
        bomId = $bom.id; priority = 'Normal'; requiredDate = $future; purpose = 'CI';
        lines = @([ordered]@{
            bomLineId = $bomLine.id; supplierId = $supplier.id; quantity = 6; unitPrice = 10;
            priceSource = 'Supplier Quotation'; isUnplanned = $false; buyDespiteStock = $false;
            remark = $null; itemCodeOverride = $null
        })
    })
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

    $grn = Invoke-Api POST '/api/v1/goods-receipts' 'wh-oid' ([ordered]@{
        purchaseOrderId = $po.id; deliveryNote = 'CI-DN'; receivedDate = $today;
        lines = @([ordered]@{
            purchaseOrderLineId = $poLine.id; receivedQuantity = 6; acceptedQuantity = 6;
            damagedQuantity = 0; rejectedQuantity = 0; qcStatus = 'Passed'; lotNumber = 'CI-LOT';
            serialNumber = $null; location = 'CI-A1'; projectAllocationId = $project.id;
            allowOverReceipt = $false; remark = $null
        })
    })
    $confirmedGrn = Invoke-Api POST "/api/v1/goods-receipts/$($grn.id)/confirm" 'wh-oid' ([ordered]@{
        rowVersion = $grn.rowVersion; comment = 'CI confirm'
    })
    Assert-Equal $confirmedGrn.status 'Confirmed' 'GRN status'
    Assert-Equal $confirmedGrn.purchaseOrderStatus 'Received' 'Purchase order status'

    $mir = Invoke-Api POST '/api/v1/material-issues' 'dev-user' ([ordered]@{
        bomId = $bom.id; requiredDate = $future; purpose = 'CI';
        lines = @([ordered]@{ bomLineId = $bomLine.id; requestedQuantity = 7; location = 'CI-A1'; purpose = 'CI' })
    })
    $approvedMir = Invoke-Api POST "/api/v1/material-issues/$($mir.id)/decide" 'mgr-oid' ([ordered]@{
        decision = 'Approve'; comment = $null
    })
    $issuedMir = Invoke-Api POST "/api/v1/material-issues/$($mir.id)/issue" 'wh-oid' ([ordered]@{
        rowVersion = $approvedMir.rowVersion; comment = 'CI issue'
    })
    $receivedMir = Invoke-Api POST "/api/v1/material-issues/$($mir.id)/receipt" 'dev-user' ([ordered]@{
        rowVersion = $issuedMir.rowVersion; comment = 'CI received'
    })
    Assert-Equal $receivedMir.status 'Received' 'MIR status'
    $mirDetail = Invoke-Api GET "/api/v1/material-issues/$($mir.id)" 'dev-user'
    $mirLine = @($mirDetail.lines)[0]
    $null = Invoke-Api POST "/api/v1/material-issues/$($mir.id)/returns" 'wh-oid' ([ordered]@{
        lineId = $mirLine.id; quantity = 2; reason = 'CI unused'
    })

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

    $assertionSql = @"
SET NOCOUNT ON;
IF NOT EXISTS (SELECT 1 FROM dbo.reservations WHERE id = $($reservation.id) AND project_id = $($project.id) AND qty = 4 AND status = N'Consumed') THROW 51062, 'Reservation consumption mismatch.', 1;
IF EXISTS (SELECT 1 FROM dbo.reservations WHERE project_id = $($project.id) AND status = N'Active') THROW 51073, 'Active reservation remained.', 1;
IF COALESCE((SELECT status FROM dbo.mat_prs WHERE id = $($pr.id)), N'') <> N'Converted to PO' THROW 51063, 'PR status mismatch.', 1;
IF COALESCE((SELECT status FROM dbo.mat_pos WHERE id = $($po.id)), N'') <> N'Received' THROW 51064, 'PO status mismatch.', 1;
IF COALESCE((SELECT status FROM dbo.grns WHERE id = $($grn.id)), N'') <> N'Confirmed' THROW 51065, 'GRN status mismatch.', 1;
IF COALESCE((SELECT status FROM dbo.mirs WHERE id = $($mir.id)), N'') <> N'Received' THROW 51066, 'MIR status mismatch.', 1;
IF NOT EXISTS (SELECT 1 FROM dbo.mir_lines WHERE id = $($mirLine.id) AND issued_qty = 7 AND returned_qty = 2) THROW 51074, 'MIR line quantity mismatch.', 1;
IF (SELECT COUNT_BIG(*) FROM dbo.mat_pr_approval_steps WHERE pr_id = $($pr.id) AND status = N'Completed' AND decision = N'Approve' AND name IN (N'Section Owner Review', N'Budget Owner Approval', N'Purchasing Review')) <> 3 THROW 51075, 'PR approval chain mismatch.', 1;
IF ABS((SELECT COALESCE(SUM(qty), 0) FROM dbo.stock_txns WHERE item_id = $($item.id) AND bucket = N'stock') - 5) > 0.0001 THROW 51067, 'Stock balance mismatch.', 1;
IF ABS((SELECT COALESCE(SUM(-qty * unit_cost), 0) FROM dbo.stock_txns WHERE project_id = $($project.id) AND txn_type IN (N'MIR_ISSUE', N'MIR_RETURN')) - 50) > 0.0001 THROW 51068, 'Actual cost mismatch.', 1;
IF (SELECT COUNT_BIG(*) FROM dbo.stock_txns WHERE source_event_key = N'adj:$($adjustment.id)' AND txn_type = N'STOCK_ADJUSTMENT' AND qty = 4) <> 1 THROW 51069, 'Adjustment ledger idempotency mismatch.', 1;
IF (SELECT COUNT_BIG(*) FROM dbo.stock_txns WHERE source_event_key LIKE N'grn:$($grn.id):line:%:accepted' AND txn_type = N'GRN_RECEIPT' AND qty = 6) <> 1 THROW 51070, 'GRN ledger idempotency mismatch.', 1;
IF (SELECT COUNT_BIG(*) FROM dbo.stock_txns WHERE source_event_key = N'mir:$($mir.id):line:$($mirLine.id):issue' AND txn_type = N'MIR_ISSUE' AND qty = -7) <> 1 THROW 51071, 'MIR issue ledger mismatch.', 1;
IF (SELECT COUNT_BIG(*) FROM dbo.stock_txns WHERE source_event_key = N'mir:$($mir.id):line:$($mirLine.id):return:1' AND txn_type = N'MIR_RETURN' AND qty = 2) <> 1 THROW 51072, 'MIR return ledger mismatch.', 1;
SELECT N'PASS' AS full_material_flow;
"@
    Invoke-SqlQuery $databaseName $assertionSql
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
