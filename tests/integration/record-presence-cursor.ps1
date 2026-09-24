[CmdletBinding()]
param(
    [string] $Server = 'localhost',
    # Written by tests/record-presence.integration.test.mjs from the route module itself,
    # so this runs the SQL the API runs rather than a copy that could drift from it.
    [Parameter(Mandatory)] [string] $SqlDirectory
)

# Proves the one property of the live Estimate view that no unit test can: under
# READ_COMMITTED_SNAPSHOT -- how production databases are created -- a write whose
# transaction is still open when a beat runs is reported by the NEXT beat, never lost.
# It also shows the obvious alternative, handing back @@DBTS, loses that same write, so
# a pass here means the scenario really exercised the hazard.

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$database = 'IoTTeamCenter_CI_Presence_' + [Guid]::NewGuid().ToString('N')
$scratch = Join-Path ([IO.Path]::GetTempPath()) $database
New-Item -ItemType Directory -Path $scratch | Out-Null
$created = $false
$writer = $null

function Invoke-SqlText {
    param([Parameter(Mandatory)][string] $Text, [string] $Database = $script:database)
    $file = Join-Path $script:scratch ([Guid]::NewGuid().ToString('N') + '.sql')
    Set-Content -LiteralPath $file -Value ("SET NOCOUNT ON;`n" + $Text) -Encoding utf8
    $output = & sqlcmd -S $script:Server -E -C -I -b -d $Database -h -1 -W -s '|' -i $file
    if ($LASTEXITCODE -ne 0) { throw "sqlcmd failed:`n$($output -join "`n")`n--- query ---`n$Text" }
    # The leading comma keeps a one-row answer an array; PowerShell unrolls it otherwise.
    return ,@($output | Where-Object { $_ -and $_.Trim() -and $_ -notmatch '^\(\d+ rows? affected\)$' })
}

function Assert-That([bool] $Condition, [string] $Message) {
    if (-not $Condition) { throw "ASSERTION FAILED: $Message" }
    Write-Host "  ok  $Message"
}

$changes = Get-Content -LiteralPath (Join-Path $SqlDirectory 'estimate-changes.sql') -Raw
$beatSql = Get-Content -LiteralPath (Join-Path $SqlDirectory 'presence-beat-estimate.sql') -Raw

# One beat's answer, in the terms the route reads it: live, next cursor, changed, who.
function Get-Beat([long] $Estimate, [long] $Actor, [string] $Since) {
    $rows = Invoke-SqlText ("DECLARE @entity bigint=$Estimate, @actor bigint=$Actor, @type nvarchar(30)=N'Estimate', " +
        "@window int=45, @since varbinary(8)=$Since;`n" + $changes)
    $head = $rows[0].Split('|')
    return [pscustomobject]@{ Live = $head[0]; Next = $head[1]; Changed = [int]$head[2]; Rest = @($rows | Select-Object -Skip 1) }
}

Push-Location $repo
try {
    & sqlcmd -S $Server -E -C -b -Q "CREATE DATABASE [$database];"
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the isolated test database.' }
    $created = $true
    Invoke-SqlText -Database master ("ALTER DATABASE [$database] SET READ_COMMITTED_SNAPSHOT ON WITH ROLLBACK IMMEDIATE;" +
        " ALTER DATABASE [$database] SET ALLOW_SNAPSHOT_ISOLATION ON;") | Out-Null

    foreach ($file in Get-ChildItem database/migrations/*.sql | Sort-Object Name) {
        if ([int]$file.Name.Substring(0, 3) -gt 61) { continue }
        & sqlcmd -S $Server -E -C -I -b -d $database -i $file.FullName | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "Migration failed: $($file.Name)" }
    }
    # The production runner sends each GO batch through sp_executesql: take 062 that way,
    # twice, because a runner that retries a partial failure replays it.
    $migration = Get-Content database/migrations/062_record_presence.sql -Raw
    $rpc = (($migration -split '(?im)^\s*GO\s*$' | Where-Object { $_.Trim() }) | ForEach-Object {
        "EXEC sys.sp_executesql N'" + $_.Replace("'", "''") + "';`nGO"
    }) -join "`n"
    $rpcFile = Join-Path $scratch '062-rpc.sql'
    Set-Content -LiteralPath $rpcFile -Value $rpc -Encoding utf8
    foreach ($pass in 1, 2) {
        & sqlcmd -S $Server -E -C -I -b -d $database -i $rpcFile | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "Migration 062 failed through sp_executesql (pass $pass)." }
    }
    Write-Host 'Migration 062'
    Assert-That ((Invoke-SqlText 'SELECT COUNT_BIG(*) FROM dbo.schema_versions WHERE version=62;')[0] -eq '1') 'applies through sp_executesql and replays cleanly'

    $seed = Invoke-SqlText @"
INSERT dbo.users(email,name,role_id) SELECT N'presence-a@ci.invalid',N'Presence A',id FROM dbo.roles WHERE code=N'Admin';
DECLARE @a bigint=SCOPE_IDENTITY();
INSERT dbo.users(email,name,role_id) SELECT N'presence-b@ci.invalid',N'Presence, B.',id FROM dbo.roles WHERE code=N'Admin';
DECLARE @b bigint=SCOPE_IDENTITY();
INSERT dbo.customers(code,name,created_by,updated_by) VALUES(N'PRS',N'Presence',@a,@a);
DECLARE @customer bigint=SCOPE_IDENTITY();
INSERT dbo.inquiries(inquiry_no,inquiry_date,customer_id,project_name,project_type,estimate_owner_id,due_date,priority,status,created_by,updated_by)
VALUES(N'INQ-PRS-1',GETDATE(),@customer,N'Presence',N'IoT',@a,GETDATE(),N'Normal',N'New',@a,@a);
DECLARE @inquiry bigint=SCOPE_IDENTITY();
INSERT dbo.estimates(estimate_no,inquiry_id,customer_id,project_name,project_type,owner_id,revision,created_date,due_date,status,created_by,updated_by)
VALUES(N'EST-PRS-1',@inquiry,@customer,N'Presence',N'IoT',@a,0,GETDATE(),GETDATE(),N'Draft',@a,@a);
DECLARE @estimate bigint=SCOPE_IDENTITY();
INSERT dbo.cost_items(estimate_id,revision,category_code,category,module,item_code,description,qty,unit,unit_cost,price_source,owner_id,status,created_by,updated_by)
VALUES(@estimate,0,'01',N'Hardware',N'Main',N'PLC-01',N'Controller',1,N'Pcs',100,N'Historical',@a,N'Active',@a,@a);
DECLARE @item bigint=SCOPE_IDENTITY();
SELECT @a, @b, @estimate, @item;
"@
    $ids = $seed[0].Split('|')
    $a = [long]$ids[0]; $b = [long]$ids[1]; $estimate = [long]$ids[2]; $item = [long]$ids[3]

    Write-Host 'Workspace read'
    $workspace = Invoke-SqlText "DECLARE @id bigint=$estimate; DECLARE @sync_cursor binary(8) = MIN_ACTIVE_ROWVERSION(); SELECT @sync_cursor sync_cursor, e.id FROM dbo.estimates e WHERE e.id=@id;"
    Assert-That ($workspace[0] -match '^0x[0-9A-F]{16}\|') 'hands out a cursor alongside the header row'

    Write-Host 'Change window'
    $start = Get-Beat $estimate $a '0xFFFFFFFFFFFFFFFF'
    Assert-That ($start.Live -eq '1' -and $start.Changed -eq 0) 'a first beat with no cursor reports nothing and names a starting point'

    # B edits the line and holds the transaction open across A's next beat.
    $hold = Join-Path $scratch 'hold.sql'
    Set-Content -LiteralPath $hold -Encoding utf8 -Value @"
SET NOCOUNT ON;
BEGIN TRANSACTION;
UPDATE dbo.cost_items SET qty=qty+1, updated_by=$b WHERE id=$item;
WAITFOR DELAY '00:00:08';
COMMIT TRANSACTION;
"@
    $writer = Start-Process -FilePath sqlcmd -PassThru -NoNewWindow -RedirectStandardOutput (Join-Path $scratch 'hold.out') `
        -ArgumentList @('-S', $Server, '-E', '-C', '-I', '-b', '-d', $database, '-i', $hold)
    Start-Sleep -Seconds 3

    $during = Get-Beat $estimate $a $start.Next
    Assert-That ($during.Changed -eq 0) 'an uncommitted write is not reported while its transaction is open'
    # What a high-water-mark implementation would have handed back at this same moment.
    $naive = (Invoke-SqlText 'SELECT CONVERT(binary(8), @@DBTS);')[0]

    $writer.WaitForExit()
    # ExitCode reads back null from Start-Process unless its handle was taken before exit,
    # so ask the database whether the write landed instead.
    $landed = (Invoke-SqlText "SELECT CONVERT(int, qty) FROM dbo.cost_items WHERE id=$item;")[0]
    if ($landed -ne '2') { Write-Host (Get-Content -LiteralPath (Join-Path $scratch 'hold.out') -Raw -ErrorAction SilentlyContinue) }
    Assert-That ($landed -eq '2') 'the held write commits'

    $after = Get-Beat $estimate $a $during.Next
    Assert-That ($after.Changed -ge 1) 'the next beat reports the write that committed after the previous one'
    # The changed-by rows are "id|name"; viewer rows carry more columns after the name.
    Assert-That (($after.Rest -join "`n") -match "(?m)^$b\|Presence, B\.$") 'and names who made it, a comma in the name included'

    $lost = Invoke-SqlText "SELECT COUNT_BIG(*) FROM dbo.cost_items WHERE estimate_id=$estimate AND row_version > $naive;"
    Assert-That ($lost[0] -eq '0') 'handing back @@DBTS instead would have lost that write for good'

    $quiet = Get-Beat $estimate $a $after.Next
    Assert-That ($quiet.Changed -eq 0) 'consecutive windows meet: nothing is counted twice'

    Invoke-SqlText "UPDATE dbo.cost_items SET deleted_at=SYSUTCDATETIME(), updated_by=$b WHERE id=$item;" | Out-Null
    $removed = Get-Beat $estimate $a $quiet.Next
    Assert-That ($removed.Changed -ge 1) 'a removal is a change like any other'

    Write-Host 'Presence'
    Invoke-SqlText ("DECLARE @type nvarchar(30)=N'Estimate', @entity bigint=$estimate, @actor bigint=$b, @key nvarchar(60)=N'cost:$item', @prune int=300;`n" + $beatSql) | Out-Null
    $seen = Get-Beat $estimate $a $removed.Next
    Assert-That (($seen.Rest -join "`n") -match "(?m)^$b\|Presence, B\.\|cost:$item\|") 'a colleague sees who is here and which line they have open'
    $self = Get-Beat $estimate $b $removed.Next
    Assert-That (-not (($self.Rest -join "`n") -match "(?m)^$b\|")) 'nobody is listed as a viewer of their own screen'
    Invoke-SqlText ("DECLARE @type nvarchar(30)=N'Estimate', @entity bigint=987654321, @actor bigint=$b, @key nvarchar(60)=NULL, @prune int=300;`n" + $beatSql) | Out-Null
    Assert-That ((Invoke-SqlText 'SELECT COUNT_BIG(*) FROM dbo.record_presence WHERE entity_id=987654321;')[0] -eq '0') 'a beat for a record that does not exist leaves nothing behind'
    $missing = Get-Beat 987654321 $a '0xFFFFFFFFFFFFFFFF'
    Assert-That ($missing.Live -eq '0') 'and the change feed says the record is gone'

    Write-Output 'Record presence cursor semantics passed'
} finally {
    if ($writer -and -not $writer.HasExited) { $writer.Kill() }
    if ($created -and $database -match '^IoTTeamCenter_CI_Presence_[a-f0-9]{32}$') {
        & sqlcmd -S $Server -E -C -b -Q "ALTER DATABASE [$database] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [$database];" | Out-Null
        if ($LASTEXITCODE -ne 0) { Write-Warning "Could not remove test database $database." }
    }
    Remove-Item -LiteralPath $scratch -Recurse -Force -ErrorAction SilentlyContinue
    Pop-Location
}
