[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$resourceRuntime=Join-Path $env:LOCALAPPDATA 'IoTTeamCenter\TeamTest'
$resourceSettings=Get-Content (Join-Path $resourceRuntime 'settings.json') -Raw | ConvertFrom-Json
if ($resourceSettings.DatabaseName -ne 'IoTTeamCenter_CodexTest_20260830_04') { throw 'Unexpected Team Test database.' }
$resourceSecrets=Get-Content (Join-Path $resourceRuntime 'secrets.json') -Raw | ConvertFrom-Json
$resourcePointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR((ConvertTo-SecureString $resourceSecrets.TeamTestSigningKey))
try {
    $resourceKey=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($resourcePointer)
    $resourceEmail='nattapol.p@tomastc.com'
    $resourceHmac=[Security.Cryptography.HMACSHA256]::new([Text.Encoding]::UTF8.GetBytes($resourceKey))
    try { $resourceCode=[Convert]::ToBase64String($resourceHmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($resourceEmail))).TrimEnd('=').Replace('+','-').Replace('/','_') } finally { $resourceHmac.Dispose() }
    $resourceHeaders=@{'X-Team-Test-Email'=$resourceEmail;'X-Team-Test-Code'=$resourceCode}
    $resourceOrigin="http://127.0.0.1:$($resourceSettings.ApiPort)"
    foreach($resourcePath in @('/health/ready','/api/v1/resource-tasks/sources','/api/v1/resource-tasks','/api/v1/resource-tasks?mine=true&filter=Acknowledgment','/api/v1/resource-tasks?issues=true','/api/v1/resource-tasks/commitments')) {
        $resourceResponse=Invoke-WebRequest -Uri ($resourceOrigin+$resourcePath) -Headers $resourceHeaders -UseBasicParsing
        if($resourceResponse.StatusCode -ne 200) { throw "Readiness failed: $resourcePath" }
        Write-Output "PASS $resourcePath HTTP 200"
    }
    $resourceSources=Invoke-RestMethod -Uri ($resourceOrigin+'/api/v1/resource-tasks/sources') -Headers $resourceHeaders
    $resourceSource=$resourceSources | Where-Object { $_.assigneeIds.Count -gt 0 } | Select-Object -First 1
    if ($resourceSource) {
        $resourceBody=@{sourceKind=$resourceSource.kind;sourceId=$resourceSource.id;plan=@{assigneeId=$resourceSource.assigneeIds[0];start='2026-09-07';workDays=5;manDays=1;note='Read-only readiness calculation'}} | ConvertTo-Json -Depth 5
        $resourcePreview=Invoke-RestMethod -Uri ($resourceOrigin+'/api/v1/resource-tasks/preview') -Method POST -Headers $resourceHeaders -ContentType 'application/json' -Body $resourceBody
        if (!$resourcePreview.weeks.Count) { throw 'Preview did not return weekly impact.' }
        Write-Output 'PASS non-mutating assignment workload preview'
    }
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($resourcePointer)
    $resourceKey=$null;$resourceCode=$null;$resourceHeaders=$null
}
