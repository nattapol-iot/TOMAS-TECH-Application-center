[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$Path,
    [string]$ActorEmail='nattapol.p@tomastc.com',
    [switch]$Apply
)
$ErrorActionPreference = 'Stop'
$prRuntime = Join-Path $env:LOCALAPPDATA 'IoTTeamCenter\TeamTest'
$prSettings = Get-Content -LiteralPath (Join-Path $prRuntime 'settings.json') -Raw | ConvertFrom-Json
if ($prSettings.DatabaseName -ne 'IoTTeamCenter_CodexTest_20260830_04' -or $prSettings.SqlServer -ne 'localhost') { throw 'Only the local Team Test host is supported.' }
$prFile = Get-Item -LiteralPath $Path
if ($prFile.Extension -ne '.xlsx' -or $prFile.Length -gt 8388608) { throw 'Expected .xlsx up to 8 MB.' }
$prSecrets = Get-Content -LiteralPath (Join-Path $prRuntime 'secrets.json') -Raw | ConvertFrom-Json
$prSecure = ConvertTo-SecureString $prSecrets.TeamTestSigningKey
$prPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($prSecure)
try { $prSigningKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($prPointer) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($prPointer) }
$prHmac = [Security.Cryptography.HMACSHA256]::new([Text.Encoding]::UTF8.GetBytes($prSigningKey))
try { $prCode = [Convert]::ToBase64String($prHmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($ActorEmail.Trim().ToLowerInvariant()))).TrimEnd('=').Replace('+','-').Replace('/','_') }
finally { $prHmac.Dispose(); $prSigningKey=$null }
$prHeaders = @{'X-Team-Test-Email'=$ActorEmail;'X-Team-Test-Code'=$prCode}
$prApi = "http://127.0.0.1:$($prSettings.ApiPort)/api/v1/historical-pr"
$prPayload = @{sourceName=$prFile.Name;fileBase64=[Convert]::ToBase64String([IO.File]::ReadAllBytes($prFile.FullName))}
try {
    $prPreview = Invoke-RestMethod -Uri "$prApi/preview" -Method Post -Headers $prHeaders -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes(($prPayload | ConvertTo-Json -Depth 5)))
    [pscustomobject]@{Status='PREVIEW';Project=$prPreview.project.number;ProjectLinked=($null -ne $prPreview.project.id);Lines=$prPreview.workbook.lines.Count;Totals=$prPreview.workbook.totals;DuplicateId=$prPreview.duplicateId;ExistingId=$prPreview.existingId}
    if (!$Apply) { return }
    # Changing an existing source document requires the interactive version preview.
    if ($prPreview.existingId -and !$prPreview.duplicateId) { throw 'An older import exists; use the UI to review the new version.' }
    $prPayload.documentReference=$prPreview.documentReference
    $prPayload.expectedCurrentId=$prPreview.existingId
    $prResult = Invoke-RestMethod -Uri $prApi -Method Post -Headers $prHeaders -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes(($prPayload | ConvertTo-Json -Depth 5)))
    $prDetail = Invoke-RestMethod -Uri "$prApi/$($prResult.id)" -Headers $prHeaders
    if ($prDetail.workbook.sourceHash -ne $prPreview.workbook.sourceHash -or $prDetail.workbook.lines.Count -ne $prPreview.workbook.lines.Count) { throw 'Post-import verification did not match the source.' }
    [pscustomobject]@{Status='IMPORTED';Id=$prResult.id;AlreadyImported=$prResult.alreadyImported;Project=$prDetail.workbook.projectNumber;ProjectLinked=($null -ne $prDetail.projectId);Lines=$prDetail.workbook.lines.Count;Totals=$prDetail.workbook.totals;SourceHash=$prDetail.workbook.sourceHash}
} finally { $prHeaders=$null; $prCode=$null; $prSecrets=$null }
