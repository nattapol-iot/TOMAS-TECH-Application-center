[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$taskRuntime=Join-Path $env:LOCALAPPDATA 'IoTTeamCenter/TeamTest'
$taskSettings=Get-Content (Join-Path $taskRuntime 'settings.json') -Raw | ConvertFrom-Json
if($taskSettings.DatabaseName -ne 'IoTTeamCenter_CodexTest_20260830_04'){throw 'Restricted to named Team Test database.'}
$taskSecrets=Get-Content (Join-Path $taskRuntime 'secrets.json') -Raw | ConvertFrom-Json
$taskPtr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR((ConvertTo-SecureString $taskSecrets.TeamTestSigningKey))
try {
 $taskKey=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($taskPtr)
 foreach($taskEmail in @('nattapol.p@tomastc.com','taweesak.s@tomastc.com','phatthadon.i@tomastc.com')) {
  $taskHmac=[Security.Cryptography.HMACSHA256]::new([Text.Encoding]::UTF8.GetBytes($taskKey))
  try {$taskCode=[Convert]::ToBase64String($taskHmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($taskEmail))).TrimEnd('=').Replace('+','-').Replace('/','_')} finally {$taskHmac.Dispose()}
  $taskHeaders=@{'X-Team-Test-Email'=$taskEmail;'X-Team-Test-Code'=$taskCode}
  $taskOrigin="http://127.0.0.1:$($taskSettings.ApiPort)"
  $taskBootstrap=Invoke-RestMethod "$taskOrigin/api/v1/bootstrap" -Headers $taskHeaders -TimeoutSec 30
  if('signing.sign' -notin $taskBootstrap.permissions){throw "Missing signing.sign for $taskEmail"}
  if($taskEmail -eq 'nattapol.p@tomastc.com' -and ($taskBootstrap.user.role -ne 'Admin' -or 'master.write' -notin $taskBootstrap.permissions)){throw 'Admin rights were not preserved.'}
  if($taskEmail -eq 'nattapol.p@tomastc.com') {
   $taskEmployees=Invoke-RestMethod "$taskOrigin/api/v1/master/employees" -Headers $taskHeaders -TimeoutSec 30
   $taskEmployee=@($taskEmployees|Where-Object email -eq $taskEmail)|Select-Object -First 1
   if($taskEmployee.applicationRole -ne 'Admin + Management'){throw 'Employee Master additional role display was not updated.'}
  }
  $taskInbox=Invoke-RestMethod "$taskOrigin/api/v1/signing/inbox" -Headers $taskHeaders -TimeoutSec 30
  [pscustomobject]@{Email=$taskEmail;PrimaryRole=$taskBootstrap.user.role;SigningAllowed=$true;WaitingForMe=@($taskInbox.waitingMe).Count;HasSpecimen=$taskInbox.hasSpecimen}
 }
 $taskReady=Invoke-RestMethod "$taskOrigin/health/ready" -TimeoutSec 30
 $taskReady | ConvertTo-Json -Compress
} finally {
 [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($taskPtr)
 $taskKey=$null;$taskCode=$null;$taskHeaders=$null
}
