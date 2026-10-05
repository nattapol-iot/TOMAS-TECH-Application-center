[CmdletBinding()]
param()
# Proves the switch off sa on a private LocalDB instance, never on a shared server:
#   1. every migration on a fresh database with no application role (how production got its schema),
#   2. a login and 010_application_login.sql, which replays every migration's grant (how a host
#      switches), then the 080 production baseline,
#   3. SQL Server itself, impersonating that login, answers HAS_PERMS_BY_NAME for every object,
#      operation and updated column the Node API uses (node scripts/app-role-grants.mjs --usage).
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$suffix = [Guid]::NewGuid().ToString('N')
$instanceName = 'IoTGrants_' + $suffix.Substring(0,16)
$databaseName = 'IoTTeamCenter_Grants_' + $suffix
$serverName = '(localdb)\' + $instanceName
$appLogin = 'iot_team_app_check'
$checkPath = Join-Path ([IO.Path]::GetTempPath()) ('iot-grants-' + $suffix + '.sql')
$created = $false
function Invoke-GrantSql {
 param([string[]]$SqlArguments)
 $output = @(& sqlcmd.exe -S $serverName -E -C -I -b -f 65001 -l 30 @SqlArguments)
 if($LASTEXITCODE -ne 0) {
   $output | Select-Object -Last 15 | ForEach-Object { Write-Host "  sqlcmd: $_" }
   throw "Application role grant check failed at a SQL step ($($SqlArguments -join ' ')): $LASTEXITCODE"
 }
 $output
}
Push-Location -LiteralPath $repoRoot
try {
 & SqlLocalDB.exe create $instanceName -s | Out-Null
 if($LASTEXITCODE -ne 0) { throw 'Could not create the private LocalDB instance.' }
 $created = $true
 Invoke-GrantSql -SqlArguments @('-i','database/scripts/020_deploy_fresh_database.sql','-v',"DatabaseName=$databaseName") | Out-Null

 # A throwaway password for a throwaway instance; it is never printed.
 $password = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(24)) + 'a1!'
 Invoke-GrantSql -SqlArguments @('-d','master','-Q',"CREATE LOGIN [$appLogin] WITH PASSWORD = N'$password', CHECK_POLICY = OFF;") | Out-Null
 Invoke-GrantSql -SqlArguments @('-i','database/scripts/010_application_login.sql','-v',"DatabaseName=$databaseName","AppLogin=$appLogin") | Out-Null
 # The release gate the runbook requires after a SQL-login change must pass on the same role.
 # It also wants an active administrator with a real-looking identity, which a fresh database lacks.
 Invoke-GrantSql -SqlArguments @('-d',$databaseName,'-Q',"INSERT dbo.users(entra_object_id,email,name,role_id) SELECT CONVERT(nvarchar(64),NEWID()),N'grant-check-admin@tomastc.com',N'Grant check administrator',id FROM dbo.roles WHERE code=N'Admin';") | Out-Null
 Invoke-GrantSql -SqlArguments @('-i','database/scripts/080_verify_production_baseline.sql','-v',"DatabaseName=$databaseName","AppLogin=$appLogin") | Out-Null
 Write-Output '080_verify_production_baseline.sql passed.'

 $usage = & node scripts/app-role-grants.mjs --usage | ConvertFrom-Json
 if($LASTEXITCODE -ne 0) { throw 'Could not read the API usage.' }
 $needs = foreach($item in $usage) {
   foreach($operation in $item.operations) {
     if($operation -eq 'UPDATE' -and $item.updateColumns.Count -gt 0) {
       foreach($column in $item.updateColumns) { "(N'dbo.$($item.object)',N'UPDATE',N'$column')" }
     } else { "(N'dbo.$($item.object)',N'$operation',NULL)" }
   }
 }
 $check = @(
   'SET NOCOUNT ON;',
   "EXECUTE AS USER = N'$appLogin';",
   'SELECT need.object_name + N'' '' + need.permission_name + COALESCE(N'' ('' + need.column_name + N'')'', N'''')',
   'FROM (VALUES',
   ($needs -join ",`n"),
   ') need(object_name, permission_name, column_name)',
   'WHERE COALESCE(CASE WHEN need.column_name IS NULL THEN HAS_PERMS_BY_NAME(need.object_name, N''OBJECT'', need.permission_name)',
   '                    ELSE HAS_PERMS_BY_NAME(need.object_name, N''OBJECT'', need.permission_name, need.column_name, N''COLUMN'') END, 0) <> 1',
   'ORDER BY 1;',
   'REVERT;'
 ) -join "`n"
 [IO.File]::WriteAllText($checkPath, $check, [Text.UTF8Encoding]::new($false))
 $missing = @(Invoke-GrantSql -SqlArguments @('-d',$databaseName,'-h','-1','-W','-i',$checkPath) | Where-Object { $_ -and $_.Trim() })
 Write-Output ("Checked {0} permissions for {1} objects as {2}." -f @($needs).Count, @($usage).Count, $appLogin)
 if($missing.Count -gt 0) {
   Write-Output 'Missing for the application login:'
   $missing | ForEach-Object { Write-Output "  $_" }
   throw "$($missing.Count) permission(s) missing."
 }
 Write-Output 'The application login holds every permission the API uses.'

 # First TMT ID sign-in, as the application login: link a registered person, never move an
 # account linked to someone else, never create one for an unknown email.
 $linking = @(
   'SET NOCOUNT ON;',
   "INSERT dbo.users(entra_object_id,email,name,role_id) SELECT NULL,N'registered@tomastc.com',N'Registered',id FROM dbo.roles WHERE code=N'Engineer';",
   "INSERT dbo.users(entra_object_id,email,name,role_id) SELECT N'11111111-1111-4111-8111-111111111111',N'linked@tomastc.com',N'Linked',id FROM dbo.roles WHERE code=N'Engineer';",
   "EXECUTE AS USER = N'$appLogin';",
   "EXEC dbo.link_registered_sign_in @object_id=N'22222222-2222-4222-8222-222222222222', @email=N'registered@tomastc.com';",
   "EXEC dbo.link_registered_sign_in @object_id=N'33333333-3333-4333-8333-333333333333', @email=N'linked@tomastc.com';",
   "EXEC dbo.link_registered_sign_in @object_id=N'44444444-4444-4444-8444-444444444444', @email=N'unknown@tomastc.com';",
   'REVERT;',
   "SELECT CASE WHEN (SELECT entra_object_id FROM dbo.users WHERE email=N'registered@tomastc.com')=N'22222222-2222-4222-8222-222222222222' THEN 'ok' ELSE 'registered person not linked' END",
   "UNION ALL SELECT CASE WHEN (SELECT entra_object_id FROM dbo.users WHERE email=N'linked@tomastc.com')=N'11111111-1111-4111-8111-111111111111' THEN 'ok' ELSE 'linked account was moved' END",
   "UNION ALL SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM dbo.users WHERE email=N'unknown@tomastc.com' OR entra_object_id IN (N'33333333-3333-4333-8333-333333333333',N'44444444-4444-4444-8444-444444444444')) THEN 'ok' ELSE 'an account was created or moved' END;"
 ) -join "`n"
 [IO.File]::WriteAllText($checkPath, $linking, [Text.UTF8Encoding]::new($false))
 $problems = @(Invoke-GrantSql -SqlArguments @('-d',$databaseName,'-h','-1','-W','-i',$checkPath) | Where-Object { $_ -and $_.Trim() -and $_.Trim() -ne 'ok' })
 if($problems.Count -gt 0) { throw "First sign-in linking: $($problems -join '; ')" }
 Write-Output 'First sign-in linking works as the application login and never moves or creates an account.'
}
finally {
 if($created) {
   if($instanceName -notmatch '^IoTGrants_[a-f0-9]{16}$' -or $databaseName -notmatch '^IoTTeamCenter_Grants_[a-f0-9]{32}$') { throw 'Refusing cleanup outside the generated instance.' }
   # LocalDB keeps database files in the user profile; deleting the instance alone leaves them behind.
   & sqlcmd.exe -S $serverName -E -C -b -d master -Q "IF DB_ID(N'$databaseName') IS NOT NULL BEGIN ALTER DATABASE [$databaseName] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [$databaseName]; END;" | Out-Null
   & SqlLocalDB.exe stop $instanceName | Out-Null
   & SqlLocalDB.exe delete $instanceName | Out-Null
 }
 if(Test-Path -LiteralPath $checkPath) { Remove-Item -LiteralPath $checkPath }
 Pop-Location
}
