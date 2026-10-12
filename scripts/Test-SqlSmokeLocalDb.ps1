[CmdletBinding()]
param()
# Runs the API's own SQL on a private LocalDB instance, never on a shared server:
#   1. every migration on a fresh database (database/scripts/020_deploy_fresh_database.sql),
#   2. each backend-node/tests/sql/*-smoke.ts prints a route's statements with their parameters
#      declared, inside one transaction that is rolled back, and the batch must pass its checks,
#   3. the instance is deleted whatever happens.
# Works in Windows PowerShell 5.1 and PowerShell 7.
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$suffix = [Guid]::NewGuid().ToString('N')
$instanceName = 'IoTSmoke_' + $suffix.Substring(0,16)
$databaseName = 'IoTTeamCenter_Smoke_' + $suffix
$serverName = '(localdb)\' + $instanceName
$created = $false
$batches = @()

function Invoke-Sql {
  param([string[]]$SqlArguments)
  $output = @(& sqlcmd.exe -S $serverName -E -C -I -b -f 65001 -l 30 @SqlArguments)
  if($LASTEXITCODE -ne 0) {
    $output | Select-Object -Last 20 | ForEach-Object { Write-Host "  sqlcmd: $_" }
    throw "SQL smoke failed at ($($SqlArguments -join ' ')): $LASTEXITCODE"
  }
  $output
}

Push-Location -LiteralPath $repoRoot
try {
  & SqlLocalDB.exe create $instanceName -s | Out-Null
  if($LASTEXITCODE -ne 0) { throw 'Could not create the private LocalDB instance.' }
  $created = $true
  Invoke-Sql -SqlArguments @('-i','database/scripts/020_deploy_fresh_database.sql','-v',"DatabaseName=$databaseName") | Out-Null
  $smokes = Get-ChildItem -LiteralPath (Join-Path $repoRoot 'backend-node/tests/sql') -Filter '*-smoke.ts' | Sort-Object Name
  foreach($smoke in $smokes) {
    Push-Location -LiteralPath (Join-Path $repoRoot 'backend-node')
    try {
      $text = & node --import tsx ("tests/sql/" + $smoke.Name)
      if($LASTEXITCODE -ne 0) { throw "Could not generate $($smoke.Name)." }
    } finally { Pop-Location }
    $path = Join-Path ([IO.Path]::GetTempPath()) ('iot-smoke-' + $suffix + '-' + $smoke.BaseName + '.sql')
    $batches += $path
    [IO.File]::WriteAllText($path, ($text -join "`n"), (New-Object Text.UTF8Encoding $false))
    $result = Invoke-Sql -SqlArguments @('-d',$databaseName,'-i',$path)
    $result | Where-Object { $_ -like '*smoke passed*' } | ForEach-Object { Write-Output $_ }
  }
}
finally {
  Pop-Location
  if($created) {
    & SqlLocalDB.exe stop $instanceName | Out-Null
    & SqlLocalDB.exe delete $instanceName | Out-Null
  }
  foreach($path in $batches) { if(Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path } }
}
