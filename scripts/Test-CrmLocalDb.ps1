[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$suffix = [Guid]::NewGuid().ToString('N')
$instanceName = 'IoTCrmCI_' + $suffix.Substring(0,16)
$databaseName = 'IoTTeamCenter_CrmCI_' + $suffix
$serverName = '(localdb)\' + $instanceName
$batchPath = Join-Path ([IO.Path]::GetTempPath()) ('iot-crm-' + $suffix + '.sql')
$created = $false
function Invoke-CrmSql {
 param([string[]]$SqlArguments)
 & sqlcmd.exe -S $serverName -E -C -I -b -f 65001 -l 20 @SqlArguments
 if($LASTEXITCODE -ne 0) { throw "CRM isolated SQL check failed: $LASTEXITCODE" }
}
Push-Location -LiteralPath $repoRoot
try {
 & SqlLocalDB.exe create $instanceName -s
 if($LASTEXITCODE -ne 0) { throw 'Could not create isolated CRM test instance.' }
 $created = $true
 $lines=@(':on error exit',':r database/scripts/000_create_database.sql')
 foreach($migration in (Get-ChildItem -LiteralPath 'database/migrations' -Filter '*.sql' | Where-Object { $_.Name -match '^\d{3}_' -and [int]$_.Name.Substring(0,3) -le 53 } | Sort-Object Name)) {
   $lines+=@('USE [$(DatabaseName)];','GO',(':r database/migrations/'+$migration.Name))
 }
 [IO.File]::WriteAllText($batchPath,($lines -join "`n"),[Text.UTF8Encoding]::new($false))
 Invoke-CrmSql -SqlArguments @('-i',$batchPath,'-v',"DatabaseName=$databaseName")
 Invoke-CrmSql -SqlArguments @('-d',$databaseName,'-i','database/migrations/053_crm.sql')
 Invoke-CrmSql -SqlArguments @('-d',$databaseName,'-i','database/tests/crm-053.sql')
 $env:CRM_TEST_SERVER=$serverName
 $env:CRM_TEST_DATABASE=$databaseName
 & node --import ./backend-node/node_modules/tsx/dist/loader.mjs backend-node/tests/crm-sql-integration.ts
 if($LASTEXITCODE -ne 0) { throw 'CRM API / SQL integration failed.' }
}
finally {
 if($created) {
   if($instanceName -notmatch '^IoTCrmCI_[a-f0-9]{16}$' -or $databaseName -notmatch '^IoTTeamCenter_CrmCI_[a-f0-9]{32}$') { throw 'Refusing cleanup outside generated CRM test scope.' }
   Invoke-CrmSql -SqlArguments @('-d','master','-Q',"IF DB_ID(N'$databaseName') IS NOT NULL BEGIN ALTER DATABASE [$databaseName] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [$databaseName]; END;")
   & SqlLocalDB.exe stop $instanceName
   & SqlLocalDB.exe delete $instanceName
 }
 if(Test-Path -LiteralPath $batchPath) { Remove-Item -LiteralPath $batchPath }
 Remove-Item Env:CRM_TEST_SERVER -ErrorAction SilentlyContinue
 Remove-Item Env:CRM_TEST_DATABASE -ErrorAction SilentlyContinue
 Pop-Location
}
