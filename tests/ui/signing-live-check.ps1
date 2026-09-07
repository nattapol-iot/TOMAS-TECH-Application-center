$ErrorActionPreference='Stop'
$taskRuntime=Join-Path $env:LOCALAPPDATA 'IoTTeamCenter/TeamTest'
$taskSettings=Get-Content (Join-Path $taskRuntime 'settings.json') -Raw|ConvertFrom-Json
if($taskSettings.DatabaseName -ne 'IoTTeamCenter_CodexTest_20260830_04'){throw 'Named UAT only.'}
$taskSecret=Get-Content (Join-Path $taskRuntime 'secrets.json') -Raw|ConvertFrom-Json
$taskPtr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR((ConvertTo-SecureString $taskSecret.TeamTestSigningKey))
try {
 $taskKey=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($taskPtr)
 $env:SIGNING_TEST_EMAIL='nattapol.p@tomastc.com';$env:SIGNING_TEST_ORIGIN=$taskSettings.FrontendOrigin
 $taskHmac=[Security.Cryptography.HMACSHA256]::new([Text.Encoding]::UTF8.GetBytes($taskKey))
 try {$env:SIGNING_TEST_CODE=[Convert]::ToBase64String($taskHmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($env:SIGNING_TEST_EMAIL))).TrimEnd('=').Replace('+','-').Replace('/','_')} finally {$taskHmac.Dispose()}
 node (Join-Path $PSScriptRoot 'signing-live-check.mjs')
 if($LASTEXITCODE -ne 0){throw 'Live UI smoke failed.'}
} finally {[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($taskPtr);$taskKey=$null;$env:SIGNING_TEST_CODE=$null;$env:SIGNING_TEST_EMAIL=$null;$env:SIGNING_TEST_ORIGIN=$null}
