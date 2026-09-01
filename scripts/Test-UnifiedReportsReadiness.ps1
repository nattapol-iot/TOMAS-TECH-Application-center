[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$reportRuntimeRoot = Join-Path $env:LOCALAPPDATA 'IoTTeamCenter\TeamTest'
$reportSettings = Get-Content -LiteralPath (Join-Path $reportRuntimeRoot 'settings.json') -Raw | ConvertFrom-Json
if ($reportSettings.DatabaseName -ne 'IoTTeamCenter_CodexTest_20260830_04') {
    throw 'Unexpected Team Test database.'
}

$reportSecrets = Get-Content -LiteralPath (Join-Path $reportRuntimeRoot 'secrets.json') -Raw | ConvertFrom-Json
$reportPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR((ConvertTo-SecureString $reportSecrets.TeamTestSigningKey))
try {
    $reportKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($reportPointer)
    $reportEmail = 'nattapol.p@tomastc.com'
    $reportHmac = [Security.Cryptography.HMACSHA256]::new([Text.Encoding]::UTF8.GetBytes($reportKey))
    try {
        $reportCode = [Convert]::ToBase64String($reportHmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($reportEmail))).TrimEnd('=').Replace('+','-').Replace('/','_')
    }
    finally { $reportHmac.Dispose() }

    $reportHeaders = @{'X-Team-Test-Email'=$reportEmail;'X-Team-Test-Code'=$reportCode}
    $reportOrigin = "http://127.0.0.1:$($reportSettings.ApiPort)"
    foreach ($reportPath in @(
        '/health/ready',
        '/api/v1/reports/workspace/templates',
        '/api/v1/reports/workspace/sources?page=1&pageSize=5',
        '/api/v1/reports/workspace?page=1&pageSize=5'
    )) {
        $reportResponse = Invoke-WebRequest -Uri ($reportOrigin + $reportPath) -Headers $reportHeaders -UseBasicParsing
        if ($reportResponse.StatusCode -ne 200) { throw "Readiness failed: $reportPath" }
        Write-Output "PASS $reportPath HTTP 200"
    }

    $reportTemplates = Invoke-RestMethod -Uri ($reportOrigin + '/api/v1/reports/workspace/templates') -Headers $reportHeaders
    $reportTypes = @($reportTemplates.templates | ForEach-Object { $_.reportType })
    foreach ($reportRequiredType in @('INSTALLATION','UAT','SERVICE','INSPECTION','POC')) {
        if ($reportTypes -notcontains $reportRequiredType) { throw "Template $reportRequiredType is missing." }
    }
    Write-Output 'PASS all five report templates are available'

    $reportInvalidToken = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
    try {
        Invoke-WebRequest -Uri ($reportOrigin + '/api/v1/report-acknowledgments/' + $reportInvalidToken) -UseBasicParsing | Out-Null
        throw 'Invalid customer token was unexpectedly accepted.'
    }
    catch {
        if ($_.Exception.Response.StatusCode.value__ -ne 404) { throw }
    }
    Write-Output 'PASS invalid public customer token is rejected without authentication'
}
finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($reportPointer)
    $reportKey = $null
    $reportCode = $null
    $reportHeaders = $null
}
