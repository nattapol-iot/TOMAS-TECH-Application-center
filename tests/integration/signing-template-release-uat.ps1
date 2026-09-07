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
  $flowResponse = Api '/api/v1/master/signature-flows'
  $flows = @($flowResponse)
  Check ($flows.Count -eq 8) 'Eight signature flow templates readable'
  Check (($flows|ForEach-Object {$_.steps.Count}|Measure-Object -Sum).Sum -eq 23) 'Twenty-three flow steps readable'
  Check ((@($flows|Where-Object status -eq 'ACTIVE').documentClass|Sort-Object) -join ',' -eq 'PR_PO,QUOTATION') 'Only PR_PO and QUOTATION active'
  $stampResponse = Api '/api/v1/master/company-stamps'
  $stamps = @($stampResponse)
  Check ($stamps.Count -eq 0) 'No company seal has been invented'
  $inbox = Api '/api/v1/signing/inbox'
  Check ($null -ne $inbox.waitingMe) 'Signing inbox API is available'
  $specimen = Api '/api/v1/me/signature'
  Check ($null -ne $specimen.history) 'Own signature metadata readable without creating a specimen'
  $viewer = Headers 'viewer.test@local.invalid'
  Check ((Status '/api/v1/me/signature' GET $null $viewer) -eq 200) 'Viewer may manage own specimen by design'
  Check ((Status '/api/v1/signing/inbox' GET $null $viewer) -eq 200) 'Viewer may read signing workflow by seeded policy'
  Check ((Status '/api/v1/signing/steps/1/sign' POST @{} $viewer) -eq 403) 'Viewer cannot sign a workflow step'
  Check ((Status '/api/v1/signing/inbox' GET $null @{}) -eq 401) 'Anonymous signing access denied'
  Check ((Status '/api/v1/signing/verify/TC-2222-2222-2222' GET $null) -eq 404) 'Unknown verification code returns not-found, not a false valid result'

  $b = Api '/api/v1/bootstrap'
  $stamp = [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss',[Globalization.CultureInfo]::InvariantCulture)
  $payload = @{code="UAT-MOD-$stamp";name="UAT Module Release $stamp";categoryCode='01';status='Active';description='Non-production release verification fixture';lines=@(
    @{categoryCode='01';itemCode='UAT-HARDWARE';description='UAT hardware only';quantityPerModule=2;unit='pcs';referenceUnitCost=125;referencePriceDate='2026-09-05'}
  )}
  Check ((Status '/api/v1/module-templates' POST $payload $viewer) -eq 403) 'Viewer cannot create templates'
  $created = Api '/api/v1/module-templates' POST $payload
  $detail = Api "/api/v1/module-templates/$($created.id)"
  Check ($detail.referenceTotal -eq 250 -and $detail.lines.Count -eq 1) 'Template and reference cost persisted'
  $payload.rowVersion = $detail.rowVersion
  $payload.name += ' verified'
  $updated = Api "/api/v1/module-templates/$($created.id)" PUT $payload
  Check ($updated.revision -eq 2) 'Template edit advances revision'
  Check ((Status "/api/v1/module-templates/$($created.id)" PUT $payload) -eq 409) 'Stale template edit rejected'
  $inquiry = Api '/api/v1/inquiries/' POST @{customerId=$b.customers[0].id;projectName="UAT Template Release $stamp";projectType='IoT';estimateOwnerId=$b.user.id;dueDate='2026-09-30';priority='Normal';projectProbability=25;customerInterestGrade='C';requirement='Non-production template apply test'}
  $estimate = Api '/api/v1/estimates/' POST @{inquiryId=$inquiry.id;ownerId=$b.user.id;dueDate='2026-09-30';contingencyRate=3}
  $apply = @{estimateRowVersion=$estimate.rowVersion;templateId=$created.id;module='UAT hardware with references';modules=3;ownerId=$b.user.id;keepReferencePrices=$true}
  $applied = Api "/api/v1/estimates/$($estimate.id)/apply-template" POST $apply
  Check ($applied.lines -eq 1) 'Template applied in one transaction'
  Check ((Status "/api/v1/estimates/$($estimate.id)/apply-template" POST $apply) -eq 409) 'Stale estimate apply rejected'
  $workspace = Api "/api/v1/estimates/$($estimate.id)/cost-workspace"
  $line = $workspace.costItems|Where-Object module -eq 'UAT hardware with references'
  Check ($line.quantity -eq 6 -and $line.unitCost -eq 125 -and $line.lineTotal -eq 750) 'Three modules multiply quantity and retain reference cost'
  $apply.estimateRowVersion = $applied.estimateRowVersion
  $apply.module = 'UAT hardware awaiting price'
  $apply.keepReferencePrices = $false
  $null = Api "/api/v1/estimates/$($estimate.id)/apply-template" POST $apply
  $workspace = Api "/api/v1/estimates/$($estimate.id)/cost-workspace"
  $zero = $workspace.costItems|Where-Object module -eq 'UAT hardware awaiting price'
  Check ($zero.quantity -eq 6 -and $zero.unitCost -eq 0) 'Apply without prices requires fresh pricing'
  $copy = Api '/api/v1/module-templates/from-estimate' POST @{estimateId=$estimate.id;module='UAT hardware with references';categoryCode='01';code="UAT-COPY-$stamp";name="UAT reusable hardware $stamp"}
  $copied = Api "/api/v1/module-templates/$($copy.id)"
  Check ($copied.referenceTotal -eq 750) 'Save estimate module back to library'
  $detail = Api "/api/v1/module-templates/$($created.id)"
  $null = Api "/api/v1/module-templates/$($created.id)/retire" POST @{rowVersion=$detail.rowVersion}
  $apply.estimateRowVersion = $workspace.header.rowVersion
  Check ((Status "/api/v1/estimates/$($estimate.id)/apply-template" POST $apply) -eq 409) 'Retired template cannot be applied'
  [pscustomobject]@{Estimate=$estimate.number;EstimateId=$estimate.id;Inquiry=$inquiry.number;Template=$copied.code;TemplateId=$copied.id}
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($taskPtr)
  $taskKey=$null;$taskHeaders=$null;$taskSecrets=$null
}
