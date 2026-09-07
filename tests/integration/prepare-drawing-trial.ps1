# Explicitly authorized Team Test preparation. NEVER calls request, sign or specimen writes.
[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$taskRuntime=Join-Path $env:LOCALAPPDATA 'IoTTeamCenter/TeamTest'
$taskSettings=Get-Content (Join-Path $taskRuntime 'settings.json') -Raw | ConvertFrom-Json
if($taskSettings.DatabaseName -ne 'IoTTeamCenter_CodexTest_20260830_04'){throw 'Named UAT database only.'}
$taskSecrets=Get-Content (Join-Path $taskRuntime 'secrets.json') -Raw | ConvertFrom-Json
$taskPtr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR((ConvertTo-SecureString $taskSecrets.TeamTestSigningKey))
try {
 $taskKey=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($taskPtr)
 function Headers([string]$email) {
  $h=[Security.Cryptography.HMACSHA256]::new([Text.Encoding]::UTF8.GetBytes($taskKey))
  try {return @{'X-Team-Test-Email'=$email;'X-Team-Test-Code'=[Convert]::ToBase64String($h.ComputeHash([Text.Encoding]::UTF8.GetBytes($email))).TrimEnd('=').Replace('+','-').Replace('/','_')}} finally {$h.Dispose()}
 }
 $taskOrigin="http://127.0.0.1:$($taskSettings.ApiPort)"
 $taskManager=Headers 'nattapol.p@tomastc.com'
 $taskMember=Headers 'phatthadon.i@tomastc.com'
 function Api($path,$headers,$body=$null) {
  $p=@{Uri=$taskOrigin+$path;Headers=$headers;TimeoutSec=30;Method='GET'}
  if($null -ne $body){$p.Method='POST';$p.Body=$body|ConvertTo-Json -Depth 10;$p.ContentType='application/json'}
  Invoke-RestMethod @p
 }
 $taskUser=(Api '/api/v1/bootstrap' $taskMember).user
 if($taskUser.email -ne 'phatthadon.i@tomastc.com' -or $taskUser.role -ne 'Engineer'){throw 'Unexpected Member identity.'}
 $taskSchedule=Api '/api/v1/projects/1/schedule' $taskManager
 if($taskSchedule.projectNo -ne 'PJ-2608-0001' -or $taskSchedule.managerId -ne 8){throw 'Unexpected project.'}
 $taskName='UAT Drawing Release - Design by Phatthadon (TEST ONLY)'
 $taskRow=@($taskSchedule.tasks|Where-Object name -eq $taskName)|Select-Object -First 1
 if(!$taskRow){
  $taskRow=Api '/api/v1/projects/1/schedule/tasks' $taskManager @{
   name=$taskName;kind='task';visibility='Internal';startMode='manual';parentId=$null;sortOrder=100;planStart='2026-09-07';planDays=1;lagDays=0;planManDays=1;picUserIds=@([int]$taskUser.id);scheduleVersion=$taskSchedule.scheduleVersion
  }
 }
 $taskTitle='UAT Drawing Release - Phatthadon / Taweesak / Nattapol - TEST ONLY'
 $taskExisting=Api '/api/v1/signing/documents?pageSize=100' $taskMember
 $taskDocument=@($taskExisting.items|Where-Object title -eq $taskTitle)|Select-Object -First 1
 if(!$taskDocument){
  $taskPdf=Get-Item (Join-Path $PSScriptRoot '../../output/pdf/test-only-drawing.pdf')
  $taskFile=Invoke-RestMethod "$taskOrigin/api/v1/projects/1/documents" -Headers $taskMember -Method POST -TimeoutSec 60 -Form @{folderCode='02';documentType='Drawing';taskId=[string]$taskRow.id;file=$taskPdf}
  $taskDocument=Api '/api/v1/signing/documents' $taskMember @{documentClass='DRAWING';documentLocale='en';projectDocumentId=$taskFile.id;taskId=$taskRow.id;title=$taskTitle;revisionLabel='R00'}
 }
 $taskDetail=Api "/api/v1/signing/documents/$($taskDocument.id)" $taskMember
 [pscustomobject]@{TaskId=$taskRow.id;DocumentId=$taskDocument.id;Document=$taskDetail.document;LiveRequest=$taskDetail.liveRequest}|ConvertTo-Json -Depth 7
} finally {[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($taskPtr);$taskKey=$null;$taskManager=$null;$taskMember=$null}
