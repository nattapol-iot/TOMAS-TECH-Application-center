[CmdletBinding()]
param([string] $ApiOrigin = 'http://127.0.0.1:5105', [string] $RuntimeRoot = (Join-Path $env:LOCALAPPDATA 'IoTTeamCenter\TeamTest'))
$ErrorActionPreference = 'Stop'
# Use the installed Team Test identity without writing or displaying its credentials.
$protected = Get-Content -LiteralPath (Join-Path $RuntimeRoot 'secrets.json') -Raw | ConvertFrom-Json
$secure = ConvertTo-SecureString $protected.TeamTestSigningKey
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try { $key = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
$email = 'nattapol.p@tomastc.com'
$hmac = [Security.Cryptography.HMACSHA256]::new([Text.Encoding]::UTF8.GetBytes($key))
try { $code = [Convert]::ToBase64String($hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($email))).TrimEnd('=').Replace('+','-').Replace('/','_') }
finally { $hmac.Dispose(); $key = $null }
$headers = @{ 'X-Team-Test-Email' = $email; 'X-Team-Test-Code' = $code }
function Call-Api($method, $path, $body = $null) {
    $args = @{ Method=$method; Uri="$ApiOrigin$path"; Headers=$headers; TimeoutSec=30 }
    if ($null -ne $body) { $args.ContentType='application/json'; $args.Body=$body | ConvertTo-Json -Depth 20 -Compress }
    Invoke-RestMethod @args
}
function Assert-Flow($condition, $message) { if (!$condition) { throw $message }; $script:checks++ }
$checks = 0
$intake = $null
try {
    $bootstrap = Call-Api GET '/api/v1/bootstrap'
    $customer = $bootstrap.customers | Select-Object -First 1
    $run = 'INQUIRY-FLOW-UAT-' + [DateTime]::UtcNow.ToString('yyyyMMddHHmmss', [Globalization.CultureInfo]::InvariantCulture)
    $due = [DateTime]::UtcNow.AddDays(14).ToString('yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture)
    $inquiryBody = @{
        customerId=[long]$customer.id; contact='TEST ONLY'; projectName=$run; projectType='Automation'
        salesOwner=$bootstrap.user.name; estimateOwnerId=[long]$bootstrap.user.id; dueDate=$due
        priority='Normal'; projectProbability=25; customerInterestGrade='C'
        requirement='TEST ONLY: Verify inquiry-first site survey flow.'; siteLocation='TEST ONLY site'
    }
    $pending = Call-Api GET '/api/v1/inquiries?page=1&pageSize=10&search=INQUIRY-FLOW-UAT-&status=New'
    $inquiry = $pending.items | Where-Object { $_.projectName -like 'INQUIRY-FLOW-UAT-*' } | Select-Object -First 1
    if ($inquiry) { $run=$inquiry.projectName } else { $inquiry = Call-Api POST '/api/v1/inquiries' $inquiryBody }
    $detail = Call-Api GET "/api/v1/inquiries/$($inquiry.id)"
    Assert-Flow ($detail.projectName -eq $run) 'Inquiry was not created.'
    $payload = @{
        customerId=[long]$detail.customerId; subject=$detail.projectName; salesOwnerId=[long]$bootstrap.user.id
        priority=$detail.priority; relatedInquiryId=[long]$detail.id; source='Meeting'; requiredResponseDate=$due
        contact=@{siteName=$detail.siteLocation; siteAddress=$detail.siteLocation; contactName=$detail.contact; contactChannel='Email'}
        requirement=@{problemStatement=$detail.requirement}; machine=@{}
        visitTypeIds=@(); skillIds=@(); windows=@()
    }
    $intake = Call-Api POST '/api/v1/sales-intakes/' $payload
    $saved = Call-Api GET "/api/v1/sales-intakes/$($intake.id)"
    Assert-Flow ($saved.relatedInquiryId -eq $inquiry.id) 'Request did not retain its parent inquiry.'
    Assert-Flow ($saved.requirement.problemStatement -eq $detail.requirement) 'Customer requirement changed.'
    Assert-Flow ($saved.contact.siteName -eq $detail.siteLocation) 'Site was not carried over.'
    $page = Call-Api GET "/api/v1/sales-intakes/?page=1&pageSize=10&relatedInquiryId=$($inquiry.id)&includeArchived=true"
    Assert-Flow ($page.total -eq 1 -and $page.items[0].id -eq $intake.id) 'Inquiry filtering leaked unrelated requests.'
    $other = Call-Api GET '/api/v1/sales-intakes/?page=1&pageSize=10&relatedInquiryId=2147483647'
    Assert-Flow ($other.total -eq 0) 'Unknown inquiry returned unrelated requests.'
    $badCustomer = $bootstrap.customers | Where-Object id -ne $detail.customerId | Select-Object -First 1
    if ($badCustomer) {
        $invalid = $payload.Clone(); $invalid.customerId=[long]$badCustomer.id
        $rejected=$false
        try { $null=Call-Api POST '/api/v1/sales-intakes/' $invalid }
        catch { $rejected=[int]$_.Exception.Response.StatusCode -eq 422 }
        Assert-Flow $rejected 'Cross-customer inquiry link was not rejected.'
    }
    # Only exercise rejection against an already linked UAT visit; never mutate it.
    $visits = Call-Api GET '/api/v1/site-visits/?page=1&pageSize=100'
    $linkedVisit=$null
    foreach ($item in $visits.items) {
        $visit = Call-Api GET "/api/v1/site-visits/$($item.id)"
        if ($visit.intakeSubject -like '*UAT*' -and @($visit.links | Where-Object targetType -eq 'Inquiry').Count -gt 0) { $linkedVisit=$visit; break }
    }
    if (!$linkedVisit) { throw 'No existing linked UAT visit available for the duplicate-inquiry regression check.' }
    $rejected=$false
    try { $null=Call-Api POST "/api/v1/site-visits/$($linkedVisit.id)/inquiry" $inquiryBody }
    catch { $rejected=[int]$_.Exception.Response.StatusCode -eq 409 -and $_.ErrorDetails.Message -match 'inquiry_already_linked' }
    Assert-Flow $rejected 'Duplicate inquiry creation was not rejected.'
    $estimate = Call-Api POST '/api/v1/estimates' @{ inquiryId=[long]$inquiry.id; ownerId=[long]$bootstrap.user.id; dueDate=$due; contingencyRate=0 }
    $after = Call-Api GET "/api/v1/inquiries/$($inquiry.id)"
    Assert-Flow ($after.estimate.id -eq $estimate.id) 'Estimate did not remain on the original inquiry.'
    [pscustomobject]@{ Status='PASS'; Checks=$checks; Inquiry=$inquiry.number; Request=$intake.number; Estimate=$estimate.number; DuplicateVisit=$linkedVisit.number }
}
finally {
    if ($intake) {
        $latest=Call-Api GET "/api/v1/sales-intakes/$($intake.id)"
        $null=Call-Api POST "/api/v1/sales-intakes/$($intake.id)/status" @{status='Cancelled'; reason='Automated Inquiry-first UAT finished; no real visit requested.'; rowVersion=$latest.rowVersion}
    }
    $headers=$null; $code=$null
}
