# Test-only transport for the Windows-integrated, disposable LocalDB fixture.
# No application credential or external server is accepted.
$ErrorActionPreference = 'Stop'
if($env:CRM_TEST_SERVER -notmatch '^\(localdb\)\\IoTCrmCI_[a-f0-9]{16}$' -or $env:CRM_TEST_DATABASE -notmatch '^IoTTeamCenter_CrmCI_[a-f0-9]{32}$') { throw 'CRM bridge requires the generated private test database.' }
$connection = [System.Data.SqlClient.SqlConnection]::new("Server=$($env:CRM_TEST_SERVER);Database=$($env:CRM_TEST_DATABASE);Integrated Security=True;TrustServerCertificate=True")
$connection.Open()
try {
 while($null -ne ($line = [Console]::ReadLine())) {
  $command=$null
  try {
   $inputMessage=ConvertFrom-Json -InputObject $line -AsHashtable
   $command=$connection.CreateCommand();$command.CommandText=$inputMessage.sql;$command.CommandTimeout=30
   if($inputMessage.procedure) { $command.CommandType=[System.Data.CommandType]::StoredProcedure }
   foreach($entry in $inputMessage.parameters.GetEnumerator()) {
    $spec=$entry.Value
    $parameter=$command.Parameters.Add('@'+$entry.Key,[System.Data.SqlDbType]::$($spec.type))
    if($spec.length) { $parameter.Size=[int]$spec.length }
    if($spec.output) { $parameter.Direction=[System.Data.ParameterDirection]::InputOutput }
    if($spec.ContainsKey('binary')) { $parameter.Value=[Convert]::FromBase64String($spec.binary) }
    elseif($null -eq $spec.value) { $parameter.Value=[DBNull]::Value }
    elseif($spec.type -eq 'DateTimeOffset') { $parameter.Value=if($spec.value -is [DateTime]) { [DateTimeOffset]::new($spec.value) } else { [DateTimeOffset]::Parse($spec.value,[Globalization.CultureInfo]::InvariantCulture) } }
    elseif($spec.type -in @('Date','DateTime','DateTime2','SmallDateTime')) { $parameter.Value=if($spec.value -is [DateTime]) { $spec.value } else { [DateTime]::Parse($spec.value,[Globalization.CultureInfo]::InvariantCulture) } }
    else { $parameter.Value=$spec.value }
   }
   $sets=[System.Collections.Generic.List[object]]::new()
   $reader=$command.ExecuteReader()
   try {
    do {
     $rows=[System.Collections.Generic.List[object]]::new()
     while($reader.Read()) {
      $row=@{}
      for($i=0;$i -lt $reader.FieldCount;$i++) {
       $value=$reader.GetValue($i)
       if($value -is [DBNull]) { $value=$null }
       elseif($value -is [byte[]]) { $value=@{__binary=[Convert]::ToBase64String($value)} }
       elseif($value -is [DateTime]) { $value=@{__date=[DateTime]::SpecifyKind($value,[DateTimeKind]::Utc).ToString('o',[Globalization.CultureInfo]::InvariantCulture)} }
       elseif($value -is [DateTimeOffset]) { $value=@{__date=$value.ToString('o',[Globalization.CultureInfo]::InvariantCulture)} }
       $row[$reader.GetName($i)]=$value
      }
      $rows.Add($row)
     }
     if($reader.FieldCount -gt 0) { $sets.Add(@($rows.ToArray())) }
    }while($reader.NextResult())
   }finally { $reader.Close() }
   $output=@{}
   foreach($parameter in $command.Parameters) { if($parameter.Direction -ne [System.Data.ParameterDirection]::Input) { $output[$parameter.ParameterName.TrimStart('@')]=$parameter.Value } }
   [Console]::WriteLine((ConvertTo-Json -Depth 40 -Compress -InputObject @{recordsets=@($sets.ToArray());output=$output}))
  }catch { [Console]::WriteLine((ConvertTo-Json -Compress -InputObject @{error=$_.Exception.ToString()})) }
  finally { if($command) { $command.Dispose() } }
 }
}finally { $connection.Dispose() }
