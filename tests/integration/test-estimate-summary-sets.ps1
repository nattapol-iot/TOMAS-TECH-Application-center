param([string]$Server = 'localhost')
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$database = 'IoTTeamCenter_CI_SetTotals_' + [Guid]::NewGuid().ToString('N')
$created = $false
$rpcFixture = Join-Path ([IO.Path]::GetTempPath()) ($database + '.sql')
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
    # Node's mssql.query uses sp_executesql, unlike sqlcmd's bare batches.
    # Exercise that boundary too: a transaction must balance in every RPC call.
    $migration = Get-Content database/migrations/061_estimate_summary_cost_multiplier.sql -Raw
    $rpc = (($migration -split '(?im)^\s*GO\s*$' | Where-Object { $_.Trim() }) | ForEach-Object {
        "EXEC sys.sp_executesql N'" + $_.Replace("'", "''") + "';`nGO"
    }) -join "`n"
    $fixture = Get-Content tests/integration/estimate-summary-sets.sql -Raw
    $fixture.Replace(':r database/migrations/061_estimate_summary_cost_multiplier.sql', $rpc) |
        Set-Content -LiteralPath $rpcFixture -Encoding utf8
    & sqlcmd -S $Server -E -C -I -b -d $database -i $rpcFixture
    if ($LASTEXITCODE -ne 0) { throw 'Summary Set regression failed.' }
} finally {
    if (Test-Path -LiteralPath $rpcFixture) { Remove-Item -LiteralPath $rpcFixture }
    if ($created -and $database -match '^IoTTeamCenter_CI_SetTotals_[a-f0-9]{32}$') {
        & sqlcmd -S $Server -E -C -b -Q "DROP DATABASE [$database];"
        if ($LASTEXITCODE -ne 0) { Write-Warning "Could not remove test database $database." }
    }
    Pop-Location
}
