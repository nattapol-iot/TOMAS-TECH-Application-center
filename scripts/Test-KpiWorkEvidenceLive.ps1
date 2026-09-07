[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$evidenceRuntimeRoot = Join-Path $env:LOCALAPPDATA 'IoTTeamCenter\TeamTest'
$evidenceSettings = Get-Content -LiteralPath (Join-Path $evidenceRuntimeRoot 'settings.json') -Raw | ConvertFrom-Json
$evidenceSecrets = Get-Content -LiteralPath (Join-Path $evidenceRuntimeRoot 'secrets.json') -Raw | ConvertFrom-Json
$evidenceApiOrigin = "http://127.0.0.1:$($evidenceSettings.ApiPort)"

$evidenceEmailOutput = & sqlcmd -S ([string]$evidenceSettings.SqlServer) -E -C -I -b -d ([string]$evidenceSettings.DatabaseName) -h -1 -W -Q "SET NOCOUNT ON; SELECT TOP(1) app_user.email FROM dbo.users app_user INNER JOIN dbo.roles role ON role.id=app_user.role_id WHERE role.code=N'Admin' AND app_user.is_active=1 AND app_user.deleted_at IS NULL ORDER BY app_user.id;"
if ($LASTEXITCODE -ne 0) { throw 'The Team Test administrator lookup failed.' }
$evidenceEmail = ([string]($evidenceEmailOutput | Select-Object -First 1)).Trim()
if (!$evidenceEmail) { throw 'No active Team Test administrator is available for the read-only smoke test.' }

$evidencePointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR((ConvertTo-SecureString $evidenceSecrets.TeamTestSigningKey))
try {
    $evidenceKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($evidencePointer)
    $evidenceHmac = [Security.Cryptography.HMACSHA256]::new([Text.Encoding]::UTF8.GetBytes($evidenceKey))
    try {
        $evidenceCode = [Convert]::ToBase64String($evidenceHmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($evidenceEmail.ToLowerInvariant()))).TrimEnd('=').Replace('+','-').Replace('/','_')
    }
    finally { $evidenceHmac.Dispose() }
}
finally {
    if ($evidencePointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($evidencePointer) }
    $evidenceKey = $null
}

$evidenceHeaders = @{'X-Team-Test-Email'=$evidenceEmail;'X-Team-Test-Code'=$evidenceCode}
$evidenceOverview = Invoke-RestMethod -Uri "$evidenceApiOrigin/api/v1/performance/overview" -Headers $evidenceHeaders -TimeoutSec 10
$evidenceAssessment = @($evidenceOverview.assessments | Where-Object frameworkCode -eq 'ENGINEERING')[0]
if (!$evidenceAssessment -or !$evidenceOverview.selectedCycle) { throw 'The KPI overview has no employee or cycle available for evidence verification.' }
$evidencePayload = Invoke-RestMethod -Uri "$evidenceApiOrigin/api/v1/performance/evidence/$($evidenceAssessment.employeeId)?cycleId=$($evidenceOverview.selectedCycle.id)" -Headers $evidenceHeaders -TimeoutSec 10

if ($evidencePayload.employeeId -ne $evidenceAssessment.employeeId) { throw 'The evidence response returned the wrong employee.' }
if (@($evidencePayload.sources).Count -ne 3 -or @($evidencePayload.areas).Count -ne 4) { throw 'The evidence response is incomplete.' }
if ((@($evidencePayload.sources).key -join ',') -ne 'PROJECT,INQUIRY,TASK') { throw 'The evidence source contract changed unexpectedly.' }
if ($evidencePayload.confidence -notin @('LOW','MEDIUM','HIGH')) { throw 'The evidence confidence is invalid.' }
if ($evidencePayload.methodology -notmatch 'decision support only') { throw 'The human-decision safeguard is missing.' }

$salesAssessment = @($evidenceOverview.assessments | Where-Object frameworkCode -eq 'SALES')[0]
$salesPayload = $null
if ($salesAssessment) {
    $salesPayload = Invoke-RestMethod -Uri "$evidenceApiOrigin/api/v1/performance/evidence/$($salesAssessment.employeeId)?cycleId=$($evidenceOverview.selectedCycle.id)" -Headers $evidenceHeaders -TimeoutSec 10
    if ($salesPayload.frameworkCode -ne 'SALES') { throw 'The Sales evidence response returned the wrong framework.' }
    if (@($salesPayload.sources).Count -ne 4 -or @($salesPayload.areas).Count -ne 5) { throw 'The Sales evidence response is incomplete.' }
    if ((@($salesPayload.sources).key -join ',') -ne 'INQUIRY,MEETING,ESTIMATE,PROJECT') { throw 'The Sales evidence source contract changed unexpectedly.' }
    if ((@($salesPayload.areas).areaCode -join ',') -ne 'PIPELINE,CUSTOMER,FORECAST,COMMERCIAL,HANDOVER') { throw 'The Sales KPI area contract changed unexpectedly.' }
}

[pscustomobject]@{
    Status = 'LIVE'
    EmployeeId = [int64]$evidencePayload.employeeId
    Cycle = [string]$evidencePayload.cycleCode
    Projects = [int]$evidencePayload.metrics.projectCount
    Inquiries = [int]$evidencePayload.metrics.inquiryCount
    AssignedTasks = [int]$evidencePayload.metrics.assignedTaskCount
    Confidence = [string]$evidencePayload.confidence
    SalesStatus = if ($salesPayload) { 'LIVE' } else { 'NO_LINKED_EMPLOYEE' }
    SalesEmployeeId = if ($salesPayload) { [int64]$salesPayload.employeeId } else { $null }
    SalesInquiries = if ($salesPayload) { [int]$salesPayload.metrics.inquiryCount } else { $null }
    SalesMeetings = if ($salesPayload) { [int]$salesPayload.metrics.meetingCount } else { $null }
    SalesConfidence = if ($salesPayload) { [string]$salesPayload.confidence } else { $null }
}
