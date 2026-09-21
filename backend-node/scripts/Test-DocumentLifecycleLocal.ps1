param([Parameter(Mandatory=$true)][string]$Server)
$ErrorActionPreference = 'Stop'
if ($Server -notmatch '^(tcp:)?(localhost|127\.0\.0\.1)(,\d+|\\[A-Za-z0-9_]+)?$') { throw 'Only an explicit loopback SQL Server is allowed.' }
$repository = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$suffix = [Guid]::NewGuid().ToString('N')
$databaseName = "CodexLifecycleTest_$suffix"
$loginName = "CodexLifecycleLogin_$suffix"
$databaseCreated = $false
$loginCreated = $false
$master = New-Object System.Data.SqlClient.SqlConnection "Server=$Server;Database=master;Integrated Security=True;TrustServerCertificate=True;Connect Timeout=5"
$test = $null
function Execute-Sql($Connection, [string]$Text) {
  $command = $Connection.CreateCommand(); $command.CommandText = $Text; $command.CommandTimeout = 120
  try { [void]$command.ExecuteNonQuery() } finally { $command.Dispose() }
}
try {
  $master.Open()
  $probe = $master.CreateCommand()
  $probe.CommandText = "SELECT CAST(SERVERPROPERTY('MachineName') AS nvarchar(128)),CAST(SERVERPROPERTY('IsIntegratedSecurityOnly') AS int)"
  $reader = $probe.ExecuteReader(); [void]$reader.Read()
  if ($reader.GetString(0) -ne $env:COMPUTERNAME -or $reader.GetInt32(1) -ne 0) { throw 'A local mixed-authentication SQL instance is required.' }
  $reader.Close(); $probe.Dispose()
  Execute-Sql $master "CREATE DATABASE [$databaseName]"
  $databaseCreated = $true
  $test = New-Object System.Data.SqlClient.SqlConnection "Server=$Server;Database=$databaseName;Integrated Security=True;TrustServerCertificate=True"
  $test.Open()
  foreach ($file in (Get-ChildItem -LiteralPath (Join-Path $repository 'database/migrations') -Filter '*.sql' | Sort-Object Name)) {
    Write-Output "Applying $($file.Name)"
    # Older baseline scripts use sqlcmd's directive; ErrorActionPreference implements it here.
    $sqlText = [regex]::Replace([IO.File]::ReadAllText($file.FullName), '(?im)^:on error exit\s*$', '')
    foreach ($batch in ([regex]::Split($sqlText, '(?im)^\s*GO\s*$'))) {
      if ($batch.Trim()) { Execute-Sql $test $batch }
    }
  }
  # Rerun only this feature's migration to prove its recovery/idempotency contract.
  Execute-Sql $test ([IO.File]::ReadAllText((Join-Path $repository 'database/migrations/057_document_lifecycle.sql')))
  $password = "Lc1!$([Guid]::NewGuid().ToString('N'))$([Guid]::NewGuid().ToString('N'))"
  Execute-Sql $master "CREATE LOGIN [$loginName] WITH PASSWORD=N'$password',CHECK_POLICY=OFF"
  $loginCreated = $true
  Execute-Sql $test "CREATE USER [$loginName] FOR LOGIN [$loginName]; ALTER ROLE db_owner ADD MEMBER [$loginName];"
  $builder = New-Object System.Data.SqlClient.SqlConnectionStringBuilder
  $builder['Data Source']=$Server; $builder['Initial Catalog']=$databaseName; $builder['User ID']=$loginName; $builder['Password']=$password
  $env:LIFECYCLE_TEST_CONNECTION=$builder.ConnectionString
  $env:LIFECYCLE_TEST_DATABASE=$databaseName
  Push-Location (Join-Path $repository 'backend-node')
  try { node --import tsx tests/document-lifecycle-local-integration.mjs; if ($LASTEXITCODE -ne 0) { throw 'Local SQL integration failed.' } }
  finally { Pop-Location }
} finally {
  $env:LIFECYCLE_TEST_CONNECTION=$null; $env:LIFECYCLE_TEST_DATABASE=$null; $password=$null
  if ($test) { $test.Dispose() }
  [System.Data.SqlClient.SqlConnection]::ClearAllPools()
  # These exact random names were created above; existing databases/logins are never touched.
  if ($databaseCreated -and $databaseName -match '^CodexLifecycleTest_[a-f0-9]{32}$') {
    Execute-Sql $master "ALTER DATABASE [$databaseName] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [$databaseName];"
    Write-Output 'Temporary database removed.'
  }
  if ($loginCreated -and $loginName -match '^CodexLifecycleLogin_[a-f0-9]{32}$') { Execute-Sql $master "DROP LOGIN [$loginName]"; Write-Output 'Temporary login removed.' }
  $master.Dispose()
}
