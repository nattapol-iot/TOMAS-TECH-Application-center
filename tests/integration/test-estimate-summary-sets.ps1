param([string]$Server = 'localhost')
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$database = 'IoTTeamCenter_CI_SetTotals_' + [Guid]::NewGuid().ToString('N')
$created = $false
Push-Location $repo
try {
    & sqlcmd -S $Server -E -C -b -Q "CREATE DATABASE [$database];"
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the isolated test database.' }
    $created = $true
    foreach ($file in Get-ChildItem database/migrations/*.sql | Sort-Object Name) {
        if ([int]$file.Name.Substring(0, 3) -gt 60) { continue }
        & sqlcmd -S $Server -E -C -I -b -d $database -i $file.FullName
        if ($LASTEXITCODE -ne 0) { throw "Migration failed: $($file.Name)" }
    }
    & sqlcmd -S $Server -E -C -I -b -d $database -i tests/integration/estimate-summary-sets.sql
    if ($LASTEXITCODE -ne 0) { throw 'Summary Set regression failed.' }
} finally {
    if ($created -and $database -match '^IoTTeamCenter_CI_SetTotals_[a-f0-9]{32}$') {
        & sqlcmd -S $Server -E -C -b -Q "DROP DATABASE [$database];"
        if ($LASTEXITCODE -ne 0) { Write-Warning "Could not remove test database $database." }
    }
    Pop-Location
}
