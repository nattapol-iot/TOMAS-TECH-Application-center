[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$taskRuntime = Join-Path $env:LOCALAPPDATA 'IoTTeamCenter\TeamTest'
$taskSettings = Get-Content (Join-Path $taskRuntime 'settings.json') -Raw | ConvertFrom-Json
if ($taskSettings.DatabaseName -ne 'IoTTeamCenter_CodexTest_20260830_04') { throw 'Restricted to named Team Test database.' }
$taskSecrets = Get-Content (Join-Path $taskRuntime 'secrets.json') -Raw | ConvertFrom-Json
$taskPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR((ConvertTo-SecureString $taskSecrets.TeamTestSigningKey))
try {
  $taskKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($taskPtr)
  function Headers([string]$email) {
    $hmac = [Security.Cryptography.HMACSHA256]::new([Text.Encoding]::UTF8.GetBytes($taskKey))
    try {
      $code = [Convert]::ToBase64String($hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($email))).TrimEnd('=').Replace('+','-').Replace('/','_')
      return @{'X-Team-Test-Email'=$email; 'X-Team-Test-Code'=$code}
    } finally { $hmac.Dispose() }
  }
  $taskHeaders = Headers 'nattapol.p@tomastc.com'
  $taskOrigin = "http://127.0.0.1:$($taskSettings.ApiPort)"
  function Api([string]$path, [string]$method='GET', $body=$null) {
    $arguments = @{Uri=$taskOrigin+$path; Method=$method; Headers=$taskHeaders; TimeoutSec=30}
    if ($null -ne $body) { $arguments.Body=$body|ConvertTo-Json -Depth 12; $arguments.ContentType='application/json' }
    Invoke-RestMethod @arguments
  }
  function Check([bool]$condition,[string]$message) { if (!$condition) {throw $message}; Write-Output "PASS: $message" }
  function Status([string]$path,[string]$method,$body,$headers=$taskHeaders) {
    $arguments=@{Uri=$taskOrigin+$path;Method=$method;Headers=$headers;SkipHttpErrorCheck=$true;TimeoutSec=30}
    if($null -ne $body){$arguments.Body=$body|ConvertTo-Json -Depth 12;$arguments.ContentType='application/json'}
    (Invoke-WebRequest @arguments).StatusCode
  }
  # Signing smoke checks never upload a specimen, sign a document, or alter a flow.
  $b = Api '/api/v1/bootstrap'
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $fixtureIds = [Collections.Generic.List[long]]::new()
  try {
    $payload = @{ code="UAT-AUTHOR-$stamp"; name="UAT Template authoring $stamp"; categoryCode='01'; status='Draft'; description='Non-production authoring verification'; lines=@(
      @{categoryCode='01'; subcategory='Control'; itemCode='UAT-PLC'; description='UAT controller'; quantityPerModule=1; unit='Pcs'; referenceUnitCost=100; brand='UAT'; model='Test'; specification='Preserve this specification'; referencePriceDate='2026-09-05'; referencePriceSource='Manual Estimate'; supplierId=$b.suppliers[0].id; remark='Preserve this remark'},
      @{categoryCode='03'; itemCode='UAT-SENSOR'; description='UAT sensor'; quantityPerModule=4; unit='pcs'; referenceUnitCost=25; remark='Preserve this note'}
    ) }
    $created = Api '/api/v1/module-templates' POST $payload
    $fixtureIds.Add($created.id)
    $detail = Api "/api/v1/module-templates/$($created.id)"
    Check ($detail.status -eq 'Draft' -and $detail.referenceTotal -eq 200) 'Create draft with multiple disciplines and correct total'
    Check ($detail.createdByName -eq $b.user.name -and $detail.updatedByName -eq $b.user.name -and $detail.createdAt -and $detail.updatedAt) 'Creator, editor and timestamps come from signed-in account'
    $active = Api "/api/v1/module-templates?status=Active&search=$($created.code)"
    Check ($active.total -eq 0) 'Draft is excluded from Estimate picker'
    $payload.status='Active'; $payload.rowVersion=$detail.rowVersion
    $updated = Api "/api/v1/module-templates/$($created.id)" PUT $payload
    Check ($updated.revision -eq 2) 'Publish advances revision'
    Check ((Status "/api/v1/module-templates/$($created.id)" PUT $payload) -eq 409) 'Concurrent stale save is rejected'
    $inquiry = Api '/api/v1/inquiries/' POST @{customerId=$b.customers[0].id; projectName="UAT Template authoring $stamp"; projectType='IoT'; estimateOwnerId=$b.user.id; dueDate='2026-09-30'; priority='Normal'; projectProbability=25; customerInterestGrade='C'; requirement='Non-production template authoring verification'}
    $estimate = Api '/api/v1/estimates/' POST @{inquiryId=$inquiry.id; ownerId=$b.user.id; dueDate='2026-09-30'; contingencyRate=3}
    $null = Api "/api/v1/estimates/$($estimate.id)/apply-template" POST @{estimateRowVersion=$estimate.rowVersion; templateId=$created.id; module='UAT authoring snapshot'; modules=3; ownerId=$b.user.id; keepReferencePrices=$true}
    $workspace = Api "/api/v1/estimates/$($estimate.id)/cost-workspace"
    $appliedLines = @($workspace.costItems | Where-Object module -eq 'UAT authoring snapshot')
    Check ($appliedLines.Count -eq 2 -and ($appliedLines | Measure-Object quantity -Sum).Sum -eq 15 -and ($appliedLines | Measure-Object lineTotal -Sum).Sum -eq 600) 'Apply three sets multiplies quantities and prices correctly'
    $appliedController = $appliedLines | Where-Object itemCode -eq 'UAT-PLC'
    Check ($appliedController.subcategory -eq 'Control' -and $appliedController.brand -eq 'UAT' -and $appliedController.model -eq 'Test' -and $appliedController.specification -eq 'Preserve this specification' -and $appliedController.supplierId -eq $b.suppliers[0].id -and $appliedController.unit -eq 'Pcs' -and $appliedController.remark -eq 'Preserve this remark') 'Shared item fields transfer without loss'
    Check ($appliedController.priceSource -eq 'Master Template' -and $appliedController.referenceNumber.StartsWith($created.code) -and $appliedController.ownerId -eq $b.user.id -and $appliedController.priceDate.StartsWith('2026-09-05')) 'Estimate assigns template provenance and owner while retaining price date'
    $detail = Api "/api/v1/module-templates/$($created.id)"
    $payload.rowVersion=$detail.rowVersion; $payload.lines[0].quantityPerModule=2
    $payload.lines=@($payload.lines[0])
    $null = Api "/api/v1/module-templates/$($created.id)" PUT $payload
    $edited = Api "/api/v1/module-templates/$($created.id)"
    Check ($edited.lines.Count -eq 1 -and $edited.lines[0].quantityPerModule -eq 2 -and $edited.lines[0].specification -eq 'Preserve this specification' -and $edited.revision -eq 3) 'Line edits/removal preserve detailed fields and advance revision'
    Check ($edited.createdAt -eq $detail.createdAt -and [datetime]$edited.updatedAt -ge [datetime]$detail.updatedAt -and $edited.updatedByName -eq $b.user.name) 'Edit preserves creation metadata and updates editor/time'
    $workspace = Api "/api/v1/estimates/$($estimate.id)/cost-workspace"
    $snapshot = @($workspace.costItems | Where-Object module -eq 'UAT authoring snapshot')
    Check ($snapshot.Count -eq 2 -and ($snapshot | Measure-Object lineTotal -Sum).Sum -eq 600) 'Template changes do not alter existing Estimate snapshot'
    $payload.Remove('rowVersion'); $payload.code="UAT-CLONE-$stamp"; $payload.name="UAT Template clone $stamp"; $payload.status='Draft'
    $clone = Api '/api/v1/module-templates' POST $payload
    $fixtureIds.Add($clone.id)
    $cloned = Api "/api/v1/module-templates/$($clone.id)"
    Check ($cloned.id -ne $edited.id -and $cloned.revision -eq 1 -and $cloned.status -eq 'Draft' -and $cloned.createdByName -eq $b.user.name) 'Duplicate creates independent draft with new attribution'
    Write-Output "UAT Estimate retained: $($estimate.number)"
  } finally {
    foreach ($fixtureId in $fixtureIds) {
      $cleanup = Api "/api/v1/module-templates/$fixtureId"
      if ($cleanup.status -ne 'Retired') { $null = Api "/api/v1/module-templates/$fixtureId/retire" POST @{rowVersion=$cleanup.rowVersion} }
    }
  }
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($taskPtr)
  $taskKey=$null; $taskHeaders=$null; $taskSecrets=$null
}
