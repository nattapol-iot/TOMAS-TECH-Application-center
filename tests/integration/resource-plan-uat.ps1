[CmdletBinding()]
param([int]$ResumeInquiryId=0)
$ErrorActionPreference='Stop'
$taskRuntime=Join-Path $env:LOCALAPPDATA 'IoTTeamCenter\TeamTest'
$taskSettings=Get-Content -LiteralPath (Join-Path $taskRuntime 'settings.json') -Raw|ConvertFrom-Json
if ($taskSettings.DatabaseName -ne 'IoTTeamCenter_CodexTest_20260830_04') { throw 'This UAT fixture is restricted to the named Team Test database.' }
$taskSecrets=Get-Content -LiteralPath (Join-Path $taskRuntime 'secrets.json') -Raw|ConvertFrom-Json
$taskPtr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR((ConvertTo-SecureString $taskSecrets.TeamTestSigningKey))
try {
 $taskKey=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($taskPtr)
 function Headers([string]$email) {
   $hmac=[Security.Cryptography.HMACSHA256]::new([Text.Encoding]::UTF8.GetBytes($taskKey))
   try { $code=[Convert]::ToBase64String($hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($email))).TrimEnd('=').Replace('+','-').Replace('/','_')
     return @{'X-Team-Test-Email'=$email;'X-Team-Test-Code'=$code}
   } finally { $hmac.Dispose() }
 }
 $taskHeaders=Headers 'nattapol.p@tomastc.com'
 $taskOrigin="http://127.0.0.1:$($taskSettings.ApiPort)"
 function Api([string]$path,[string]$method='GET',$body=$null) {
   $args=@{Uri=$taskOrigin+$path;Method=$method;Headers=$taskHeaders}
   if($null-ne$body){$args.Body=($body|ConvertTo-Json -Depth 10);$args.ContentType='application/json'}
   Invoke-RestMethod @args
 }
 function Check([bool]$condition,[string]$message) {if(!$condition){throw $message};Write-Output "PASS: $message"}
 $b=Api '/api/v1/bootstrap'
 $owner=$b.team|Where-Object email -eq 'revision.owner@local.invalid'|Select-Object -First 1
 if(!$owner){throw 'Expected existing UAT owner is missing.'}
 $plan=Api '/api/v1/resource-planning'
 Check ($null-ne$plan.holidays) 'Authorized planning read'
 $title='UAT Resource Plan '+[DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss',[Globalization.CultureInfo]::InvariantCulture)
 $start=[DateTime]::UtcNow.Date.AddDays(2).ToString('yyyy-MM-dd',[Globalization.CultureInfo]::InvariantCulture)
 $end=[DateTime]::UtcNow.Date.AddDays(13).ToString('yyyy-MM-dd',[Globalization.CultureInfo]::InvariantCulture)
 if($ResumeInquiryId) {
   $inquiry=Api "/api/v1/inquiries/$ResumeInquiryId"
   if($inquiry.projectName -notlike 'UAT Resource Plan *'){throw 'Only the named UAT fixture can be resumed.'}
   $title=$inquiry.projectName
 } else {
   $inquiry=Api '/api/v1/inquiries/' POST @{customerId=$b.customers[0].id;projectName=$title;projectType='IoT';estimateOwnerId=$owner.id;dueDate=$end;priority='Normal';projectProbability=25;customerInterestGrade='C';requirement='Non-production Resource Plan verification fixture.'}
 }
 $initialEffort=$plan.efforts|Where-Object { $_.entityType-eq'Inquiry'-and$_.entityId-eq$inquiry.id }|Select-Object -First 1
 $e=Api "/api/v1/resource-planning/Inquiry/$($inquiry.id)" PUT @{start=$start;end=$end;manDays=4;rowVersion=$initialEffort.rowVersion}
 Check ($e.manDays-eq 4) 'Create persisted inquiry effort'
 $conflict=Invoke-WebRequest -Uri "$taskOrigin/api/v1/resource-planning/Inquiry/$($inquiry.id)" -Method PUT -Headers $taskHeaders -ContentType 'application/json' -Body (@{start=$start;end=$end;manDays=20;rowVersion=$null}|ConvertTo-Json) -SkipHttpErrorCheck
 Check ($conflict.StatusCode-eq 409) 'Concurrent create rejected'
 $e2=Api "/api/v1/resource-planning/Inquiry/$($inquiry.id)" PUT @{start=$start;end=$end;manDays=5;rowVersion=$e.rowVersion}
 Check ($e2.rowVersion-ne $e.rowVersion) 'Update advances row version'
 $estimate=Api '/api/v1/estimates/' POST @{inquiryId=$inquiry.id;ownerId=$owner.id;dueDate=$end;contingencyRate=3}
 $ee=Api "/api/v1/resource-planning/Estimate/$($estimate.id)" PUT @{start=$start;end=$end;manDays=8;rowVersion=$null}
 Check ($ee.manDays-eq 8) 'Create persisted estimate effort'
 $existing=$plan.capacities|Where-Object userId -eq $owner.id|Select-Object -First 1
 if(!$existing) {
   $capacity=Api "/api/v1/resource-planning/capacity/$($owner.id)" PUT @{daysPerWeek=5;rowVersion=$null}
   Check ($capacity.daysPerWeek-eq 5) 'Configure UAT fixture capacity'
 }
 $fresh=Api '/api/v1/resource-planning'
 Check (($fresh.efforts|Where-Object { $_.entityType-eq'Inquiry'-and$_.entityId-eq$inquiry.id }).manDays-eq 5) 'Reload confirms SQL persistence'
 $viewer=Headers 'viewer.test@local.invalid'
 $denied=Invoke-WebRequest -Uri "$taskOrigin/api/v1/resource-planning/capacity/$($owner.id)" -Method PUT -Headers $viewer -ContentType 'application/json' -Body '{"daysPerWeek":1,"rowVersion":null}' -SkipHttpErrorCheck
 Check ($denied.StatusCode-eq 403) 'Viewer cannot change capacity'
 $current=Api "/api/v1/inquiries/$($inquiry.id)"
 $same=Api "/api/v1/inquiries/$($inquiry.id)/assignment" PUT @{estimateOwnerId=$owner.id;rowVersion=$current.rowVersion}
 Check ($same.estimateOwnerId-eq $owner.id) 'Inquiry assignment endpoint persists selected owner'
 [pscustomobject]@{Fixture=$title;InquiryId=$inquiry.id;InquiryNumber=$inquiry.number;EstimateId=$estimate.id;EstimateNumber=$estimate.number;OwnerId=$owner.id}
} finally {
 [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($taskPtr)
 $taskKey=$null;$taskHeaders=$null;$taskSecrets=$null
}
