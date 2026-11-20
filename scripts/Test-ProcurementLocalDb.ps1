[CmdletBinding()]
param()

# Migrations 074 (flexible purchase requisition lines) and 090 (Pegasus ERP link) and the PR API on a private LocalDB instance:
# schema 73 with legacy PRs and POs -> 074 applied twice -> backfill, keys and line-kind checks -> 075..latest (090, 096 and 097
# twice) -> the PR flow through the real routes (substitute, unplanned, module budget, sending to a stand-in ERP, its PO, a
# 1,000-line PR, the department and final approver route) -> a fresh deployment through the latest migration.
# Nothing outside the generated instance is touched.

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$localDbCommand = (Get-Command SqlLocalDB.exe -ErrorAction Stop).Source
$sqlCommand = (Get-Command sqlcmd.exe -ErrorAction Stop).Source
$testSuffix = [Guid]::NewGuid().ToString('N')
$instanceName = 'IoTProcCI_' + $testSuffix.Substring(0, 16)
$serverName = '(localdb)\' + $instanceName
$upgradeDatabase = 'IoTTeamCenter_ProcCI_' + $testSuffix
$freshDatabase = 'IoTTeamCenter_ProcFreshCI_' + $testSuffix
$seed = Join-Path $repoRoot 'database/tests/procurement-074-seed.sql'
$fixture = Join-Path $repoRoot 'database/tests/procurement-074.sql'
$migration = Join-Path $repoRoot 'database/migrations/074_flexible_purchase_requisition_lines.sql'
$erpMigration = Join-Path $repoRoot 'database/migrations/090_pegasus_erp_purchase_requests.sql'
$draftEditMigration = Join-Path $repoRoot 'database/migrations/096_draft_pr_line_edit.sql'
$routeMigration = Join-Path $repoRoot 'database/migrations/097_pr_approval_route.sql'
$routeFixture = Join-Path $repoRoot 'database/tests/pr-approval-route-097.sql'
$outsourceMigration = Join-Path $repoRoot 'database/migrations/108_bom_outsource_lines.sql'
$outsourceFixture = Join-Path $repoRoot 'database/tests/bom-outsource-108.sql'
$revisionMigration = Join-Path $repoRoot 'database/migrations/109_bom_revision_zero_based.sql'
$requestListMigration = Join-Path $repoRoot 'database/migrations/111_erp_request_list.sql'
$requestListRollback = Join-Path $repoRoot 'database/rollback/111_erp_request_list.rollback.sql'
$lineGrantsMigration = Join-Path $repoRoot 'database/migrations/112_request_list_line_grants.sql'
$lineGrantsRollback = Join-Path $repoRoot 'database/rollback/112_request_list_line_grants.rollback.sql'
$unitsMigration = Join-Path $repoRoot 'database/migrations/113_purchase_units.sql'
$unitsRollback = Join-Path $repoRoot 'database/rollback/113_purchase_units.rollback.sql'
$numbersMigration = Join-Path $repoRoot 'database/migrations/114_request_numbers.sql'
$numbersRollback = Join-Path $repoRoot 'database/rollback/114_request_numbers.rollback.sql'
$formMigration = Join-Path $repoRoot 'database/migrations/115_pr_line_form_fields.sql'
$formRollback = Join-Path $repoRoot 'database/rollback/115_pr_line_form_fields.rollback.sql'
$baselineFile = Join-Path ([IO.Path]::GetTempPath()) ('iot-procurement-baseline-' + $testSuffix + '.sql')
$instanceCreated = $false

function Invoke-TestSql {
    param([string[]]$SqlArguments)
    & $sqlCommand -S $serverName -E -C -I -b -f 65001 -l 20 @SqlArguments
    if ($LASTEXITCODE -ne 0) { throw "Isolated SQL check failed with exit code $LASTEXITCODE." }
}

Push-Location -LiteralPath $repoRoot
try {
    & $localDbCommand create $instanceName -s
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the private LocalDB instance.' }
    $instanceCreated = $true

    $baselineLines = @(':on error exit', ':r database/scripts/000_create_database.sql')
    $baselineMigrations = Get-ChildItem -LiteralPath (Join-Path $repoRoot 'database/migrations') -File |
        Where-Object { $_.Name -match '^\d{3}_[A-Za-z0-9_]+\.sql$' -and [int]$_.Name.Substring(0, 3) -le 73 } |
        Sort-Object Name
    foreach ($baselineMigration in $baselineMigrations) {
        $baselineLines += @('USE [$(DatabaseName)];', 'GO', (':r database/migrations/' + $baselineMigration.Name))
    }
    $baselineLines += @("IF (SELECT MAX(version) FROM dbo.schema_versions) <> 73 THROW 51999, 'Expected schema073 baseline.', 1;", 'GO')
    [IO.File]::WriteAllText($baselineFile, ($baselineLines -join "`n"), [Text.UTF8Encoding]::new($false))

    Write-Output 'Checking migration 073 -> 074 with legacy PRs and POs, and repeat application.'
    Invoke-TestSql -SqlArguments @('-i', $baselineFile, '-v', "DatabaseName=$upgradeDatabase")
    Invoke-TestSql -SqlArguments @('-d', $upgradeDatabase, '-i', $seed)
    Invoke-TestSql -SqlArguments @('-d', $upgradeDatabase, '-i', $migration)
    Invoke-TestSql -SqlArguments @('-d', $upgradeDatabase, '-i', $migration)
    Invoke-TestSql -SqlArguments @('-d', $upgradeDatabase, '-i', $fixture)

    Write-Output 'Applying 075 through the latest migration (090 and 096 twice) to the upgraded database.'
    $laterMigrations = Get-ChildItem -LiteralPath (Join-Path $repoRoot 'database/migrations') -File |
        Where-Object { $_.Name -match '^\d{3}_[A-Za-z0-9_]+\.sql$' -and [int]$_.Name.Substring(0, 3) -ge 75 } |
        Sort-Object Name
    foreach ($laterMigration in $laterMigrations) { Invoke-TestSql -SqlArguments @('-d', $upgradeDatabase, '-i', $laterMigration.FullName) }
    Invoke-TestSql -SqlArguments @('-d', $upgradeDatabase, '-i', $erpMigration)
    Invoke-TestSql -SqlArguments @('-d', $upgradeDatabase, '-Q', "IF OBJECT_ID(N'dbo.user_oidc_tokens',N'U') IS NULL OR COL_LENGTH(N'dbo.mat_prs',N'erp_ref') IS NULL OR OBJECT_ID(N'dbo.CK_mat_prs_erp_status',N'C') IS NULL OR NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version=90) THROW 51999, 'Migration 090 is missing its table, columns, check or version.', 1;")
    Invoke-TestSql -SqlArguments @('-d', $upgradeDatabase, '-i', $draftEditMigration)
    Invoke-TestSql -SqlArguments @('-d', $upgradeDatabase, '-Q', "IF OBJECT_ID(N'dbo.trg_mat_pr_lines_draft_delete',N'TR') IS NULL OR NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version=96) THROW 51999, 'Migration 096 is missing its trigger or version.', 1;")
    # 097 seeds nobody here (no company accounts). Run again once the final approver has one, it seeds them and moves a PR
    # waiting on the Engineering Manager role to them; the route is then removed so the API test starts on the earlier route.
    Write-Output 'Checking migration 097 again after the final approver gets an account.'
    Invoke-TestSql -SqlArguments @('-d', $upgradeDatabase, '-i', $routeFixture)
    Invoke-TestSql -SqlArguments @('-d', $upgradeDatabase, '-i', $routeMigration)
    Invoke-TestSql -SqlArguments @('-d', $upgradeDatabase, '-Q', "DECLARE @final bigint=(SELECT id FROM dbo.users WHERE email=N'nattapol.p@tomastc.com'); IF NOT EXISTS (SELECT 1 FROM dbo.pr_approval_settings WHERE id=1 AND final_approver_id=@final) OR NOT EXISTS (SELECT 1 FROM dbo.mat_pr_approval_steps s JOIN dbo.mat_prs pr ON pr.id=s.pr_id WHERE pr.pr_no=N'PR-PC-ROUTE' AND s.sequence=2 AND s.name=N'Final Approval' AND s.approver_id=@final AND s.approver_role IS NULL AND s.status=N'Current') OR EXISTS (SELECT 1 FROM dbo.pr_department_approvers) OR COL_LENGTH(N'dbo.mat_pr_approval_steps',N'final_may_decide') IS NULL OR NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version=97) THROW 51999, 'Migration 097 did not seed the final approver or move the waiting step.', 1; DELETE dbo.pr_approval_settings; UPDATE dbo.mat_prs SET deleted_at=SYSUTCDATETIME() WHERE pr_no=N'PR-PC-ROUTE';")

    # 108 found no outsource lines the first time. Give the legacy estimate two (one already on its BOM as a hidden SVC line,
    # one not on the BOM), run 108 twice more: both are OUT lines of the BOM, once each, and the engineering line stays hidden.
    Write-Output 'Checking migration 108 again after the legacy estimate gets outsource lines.'
    Invoke-TestSql -SqlArguments @('-d', $upgradeDatabase, '-i', $outsourceFixture)
    Invoke-TestSql -SqlArguments @('-d', $upgradeDatabase, '-i', $outsourceMigration)
    Invoke-TestSql -SqlArguments @('-d', $upgradeDatabase, '-i', $outsourceMigration)
    Invoke-TestSql -SqlArguments @('-d', $upgradeDatabase, '-Q', "DECLARE @bom bigint=(SELECT id FROM dbo.boms WHERE bom_no=N'BOM-PC-LEGACY'); IF (SELECT COUNT(*) FROM dbo.bom_lines bl JOIN dbo.cost_items ci ON ci.id=bl.estimate_line_id WHERE bl.bom_id=@bom AND bl.section_code=N'OUT' AND ci.item_code IN(N'OUT-01',N'OUT-02'))<>2 OR (SELECT COUNT(*) FROM dbo.bom_lines WHERE bom_id=@bom AND section_code=N'OUT')<>2 OR NOT EXISTS (SELECT 1 FROM dbo.bom_lines bl JOIN dbo.cost_items ci ON ci.id=bl.estimate_line_id WHERE bl.bom_id=@bom AND ci.item_code=N'ENG-01' AND bl.section_code=N'SVC') OR EXISTS (SELECT 1 FROM dbo.bom_lines bl JOIN dbo.cost_items ci ON ci.id=bl.estimate_line_id WHERE bl.bom_id=@bom AND ci.item_code=N'OUT-02' AND (bl.non_stock<>1 OR bl.item_id IS NOT NULL OR bl.qty_required<>5 OR bl.est_unit_cost<>3000)) THROW 51999, 'Migration 108 did not show the old outsource line and add the missing one, once each.', 1;")

    # 109 moved the legacy BOM (seeded at revision 1) to revision 0. Run again, it must stay there.
    Write-Output 'Checking migration 109 again: BOM revisions count from zero, once.'
    Invoke-TestSql -SqlArguments @('-d', $upgradeDatabase, '-i', $revisionMigration)
    Invoke-TestSql -SqlArguments @('-d', $upgradeDatabase, '-Q', "IF (SELECT revision FROM dbo.boms WHERE bom_no=N'BOM-PC-LEGACY')<>0 OR EXISTS (SELECT 1 FROM dbo.boms b WHERE NOT EXISTS (SELECT 1 FROM dbo.boms z WHERE z.bom_no=b.bom_no AND z.revision=0)) OR NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version=109) THROW 51999, 'Migration 109 did not leave every BOM number with a revision 0, or its version is missing.', 1;")

    # 111 marked the legacy PRs the ERP already holds as PR and added the Request List columns and the orders table.
    # Its rollback script takes them away again, and 111 puts them back: both are run here so neither is untested SQL.
    # 112 only grants the app role the new line columns. Rollbacks go newest first: 111's refuses while 112 is applied.
    Write-Output 'Checking migrations 111 to 115 again, their rollback scripts (newest first), and all five once more.'
    # 115 added the PR-Form line fields and part lines. A legacy line is given a field and made a part of another line of its
    # request first, so the rollback is run on data it must take away.
    $formCheck = "IF COL_LENGTH(N'dbo.mat_pr_lines',N'material') IS NULL OR COL_LENGTH(N'dbo.mat_pr_lines',N'need_by') IS NULL OR COL_LENGTH(N'dbo.mat_pr_lines',N'parent_line_id') IS NULL OR OBJECT_ID(N'dbo.FK_mat_pr_lines_parent',N'F') IS NULL OR OBJECT_ID(N'dbo.CK_mat_pr_lines_form_fields',N'C') IS NULL OR NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'UX_mat_pr_lines_id_pr') OR NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version=115) THROW 51999, 'Migration 115 is missing part of its change.', 1;"
    Invoke-TestSql -SqlArguments @('-d', $upgradeDatabase, '-i', $formMigration)
    Invoke-TestSql -SqlArguments @('-d', $upgradeDatabase, '-Q', $formCheck)
    Invoke-TestSql -SqlArguments @('-d', $upgradeDatabase, '-Q', "DECLARE @pr bigint=(SELECT TOP(1) pr_id FROM dbo.mat_pr_lines GROUP BY pr_id HAVING COUNT(*)>1 ORDER BY pr_id); IF @pr IS NULL THROW 51999, 'No legacy request has two lines to make a part.', 1; UPDATE dbo.mat_pr_lines SET material=N'SS400', parent_line_id=(SELECT MIN(id) FROM dbo.mat_pr_lines WHERE pr_id=@pr) WHERE id=(SELECT MAX(id) FROM dbo.mat_pr_lines WHERE pr_id=@pr); IF @@ROWCOUNT<>1 THROW 51999, 'The legacy part was not set.', 1;")
    Invoke-TestSql -SqlArguments @('-d', $upgradeDatabase, '-i', $formRollback)
    Invoke-TestSql -SqlArguments @('-d', $upgradeDatabase, '-Q', "IF COL_LENGTH(N'dbo.mat_pr_lines',N'material') IS NOT NULL OR COL_LENGTH(N'dbo.mat_pr_lines',N'parent_line_id') IS NOT NULL OR OBJECT_ID(N'dbo.FK_mat_pr_lines_parent',N'F') IS NOT NULL OR EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'UX_mat_pr_lines_id_pr') OR EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version=115) OR (SELECT COUNT(*) FROM dbo.mat_pr_lines)=0 THROW 51999, 'The rollback of 115 left something behind or removed lines.', 1;")
    Invoke-TestSql -SqlArguments @('-d', $upgradeDatabase, '-i', $formRollback)
    $numbersCheck = "IF COL_LENGTH(N'dbo.mat_prs',N'pr_no')<>100 OR COL_LENGTH(N'dbo.mat_prs',N'over_budget_reason') IS NULL OR OBJECT_ID(N'dbo.UQ_mat_prs_no',N'UQ') IS NULL OR NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_mat_prs_project_status') OR NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version=114) THROW 51999, 'Migration 114 did not widen pr_no to 50 characters, add the reason, keep the unique number or record its version.', 1;"
    Invoke-TestSql -SqlArguments @('-d', $upgradeDatabase, '-i', $numbersMigration)
    Invoke-TestSql -SqlArguments @('-d', $upgradeDatabase, '-Q', $numbersCheck)
    Invoke-TestSql -SqlArguments @('-d', $upgradeDatabase, '-i', $numbersRollback)
    Invoke-TestSql -SqlArguments @('-d', $upgradeDatabase, '-Q', "IF COL_LENGTH(N'dbo.mat_prs',N'pr_no')<>60 OR COL_LENGTH(N'dbo.mat_prs',N'over_budget_reason') IS NOT NULL OR OBJECT_ID(N'dbo.UQ_mat_prs_no',N'UQ') IS NULL OR NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_mat_prs_project_status') OR NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_mat_prs_bom_status') OR EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version=114) OR (SELECT COUNT(*) FROM dbo.mat_prs)=0 THROW 51999, 'The rollback of 114 did not put pr_no back to 30 characters with its unique number and indexes, or took the requests with it.', 1;")
    Invoke-TestSql -SqlArguments @('-d', $upgradeDatabase, '-i', $numbersRollback)
    $unitsCheck = "IF OBJECT_ID(N'dbo.project_purchase_units',N'U') IS NULL OR COL_LENGTH(N'dbo.mat_prs',N'unit_id') IS NULL OR OBJECT_ID(N'dbo.FK_mat_prs_unit',N'F') IS NULL OR NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'UX_project_purchase_units_drawing') OR NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'UX_project_purchase_units_general') OR NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version=113) THROW 51999, 'Migration 113 is missing its table, the unit column, its key, an index or its version.', 1;"
    Invoke-TestSql -SqlArguments @('-d', $upgradeDatabase, '-i', $unitsMigration)
    Invoke-TestSql -SqlArguments @('-d', $upgradeDatabase, '-Q', $unitsCheck)
    Invoke-TestSql -SqlArguments @('-d', $upgradeDatabase, '-i', $unitsRollback)
    Invoke-TestSql -SqlArguments @('-d', $upgradeDatabase, '-Q', "IF OBJECT_ID(N'dbo.project_purchase_units',N'U') IS NOT NULL OR COL_LENGTH(N'dbo.mat_prs',N'unit_id') IS NOT NULL OR EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version=113) OR (SELECT COUNT(*) FROM dbo.mat_prs)=0 THROW 51999, 'The rollback of 113 left something behind, or took the requests with it.', 1;")
    Invoke-TestSql -SqlArguments @('-d', $upgradeDatabase, '-i', $unitsRollback)
    $requestListCheck = "IF COL_LENGTH(N'dbo.mat_prs',N'erp_target') IS NULL OR COL_LENGTH(N'dbo.mat_prs',N'erp_cancel_pending') IS NULL OR COL_LENGTH(N'dbo.mat_pr_lines',N'erp_line_ref') IS NULL OR COL_LENGTH(N'dbo.mat_pr_lines',N'erp_line_url') IS NULL OR OBJECT_ID(N'dbo.mat_pr_line_erp_orders',N'U') IS NULL OR OBJECT_ID(N'dbo.CK_mat_pr_lines_erp_line_status',N'C') IS NULL OR OBJECT_ID(N'dbo.CK_mat_prs_erp_target',N'C') IS NULL OR NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'UX_mat_pr_lines_erp_line_ref') OR EXISTS (SELECT 1 FROM dbo.mat_prs WHERE erp_pr_no IS NOT NULL AND erp_target IS NULL) OR NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version=111) THROW 51999, 'Migration 111 is missing a column, the orders table, a check, the index, the PR mark or its version.', 1;"
    Invoke-TestSql -SqlArguments @('-d', $upgradeDatabase, '-i', $requestListMigration)
    Invoke-TestSql -SqlArguments @('-d', $upgradeDatabase, '-Q', $requestListCheck)
    Invoke-TestSql -SqlArguments @('-d', $upgradeDatabase, '-i', $lineGrantsMigration)
    Invoke-TestSql -SqlArguments @('-d', $upgradeDatabase, '-i', $lineGrantsRollback)
    Invoke-TestSql -SqlArguments @('-d', $upgradeDatabase, '-Q', "IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version=112) THROW 51999, 'The rollback of 112 left its version.', 1;")
    Invoke-TestSql -SqlArguments @('-d', $upgradeDatabase, '-i', $requestListRollback)
    Invoke-TestSql -SqlArguments @('-d', $upgradeDatabase, '-Q', "IF COL_LENGTH(N'dbo.mat_prs',N'erp_target') IS NOT NULL OR COL_LENGTH(N'dbo.mat_pr_lines',N'erp_line_ref') IS NOT NULL OR OBJECT_ID(N'dbo.mat_pr_line_erp_orders',N'U') IS NOT NULL OR EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version=111) OR (SELECT COUNT(*) FROM dbo.mat_prs)=0 THROW 51999, 'The rollback of 111 left something behind, or took the requests with it.', 1;")
    Invoke-TestSql -SqlArguments @('-d', $upgradeDatabase, '-i', $requestListRollback)
    Invoke-TestSql -SqlArguments @('-d', $upgradeDatabase, '-i', $requestListMigration)
    Invoke-TestSql -SqlArguments @('-d', $upgradeDatabase, '-Q', $requestListCheck)
    Invoke-TestSql -SqlArguments @('-d', $upgradeDatabase, '-i', $lineGrantsMigration)
    Invoke-TestSql -SqlArguments @('-d', $upgradeDatabase, '-Q', "IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version=112) THROW 51999, 'Migration 112 did not record its version.', 1;")
    Invoke-TestSql -SqlArguments @('-d', $upgradeDatabase, '-i', $unitsMigration)
    Invoke-TestSql -SqlArguments @('-d', $upgradeDatabase, '-Q', $unitsCheck)
    Invoke-TestSql -SqlArguments @('-d', $upgradeDatabase, '-i', $numbersMigration)
    Invoke-TestSql -SqlArguments @('-d', $upgradeDatabase, '-Q', $numbersCheck)
    Invoke-TestSql -SqlArguments @('-d', $upgradeDatabase, '-i', $formMigration)
    Invoke-TestSql -SqlArguments @('-d', $upgradeDatabase, '-i', $formMigration)
    Invoke-TestSql -SqlArguments @('-d', $upgradeDatabase, '-Q', $formCheck)

    Write-Output 'Checking the PR API on the upgraded database.'
    $env:PROCUREMENT_TEST_SERVER = $serverName
    $env:PROCUREMENT_TEST_DATABASE = $upgradeDatabase
    & node --import ./backend-node/node_modules/tsx/dist/loader.mjs backend-node/tests/procurement-integration.ts
    if ($LASTEXITCODE -ne 0) { throw 'Procurement API / SQL integration failed.' }

    $freshRunner = Get-Content -LiteralPath 'database/scripts/020_deploy_fresh_database.sql' -Raw
    if ($freshRunner -match '090_pegasus_erp_purchase_requests\.sql') {
        Write-Output 'Checking full fresh deployment through 090.'
        Invoke-TestSql -SqlArguments @('-i', 'database/scripts/020_deploy_fresh_database.sql', '-v', "DatabaseName=$freshDatabase")
        Invoke-TestSql -SqlArguments @('-d', $freshDatabase, '-Q', "IF COL_LENGTH(N'dbo.mat_pr_lines',N'line_type') IS NULL OR COLUMNPROPERTY(OBJECT_ID(N'dbo.mat_pr_lines'),N'supplier_id','AllowsNull')<>1 OR OBJECT_ID(N'dbo.CK_mat_pr_lines_line_type',N'C') IS NULL OR OBJECT_ID(N'dbo.FK_mat_po_lines_pr_line',N'F') IS NULL OR NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version=74) OR COL_LENGTH(N'dbo.mat_prs',N'erp_pr_no') IS NULL OR NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version=90) THROW 51999, 'Fresh deployment is missing the 074 or 090 columns, keys or version.', 1;")
    }
    else { throw '020_deploy_fresh_database.sql does not run 090.' }
    Write-Output 'PASS: private LocalDB upgrade with legacy PRs, repeat application, backfill, keys, line kinds, the ERP link and the PR API.'
}
finally {
    Remove-Item Env:PROCUREMENT_TEST_SERVER -ErrorAction SilentlyContinue
    Remove-Item Env:PROCUREMENT_TEST_DATABASE -ErrorAction SilentlyContinue
    if ($instanceCreated) {
        foreach ($testDatabase in @($upgradeDatabase, $freshDatabase)) {
            if ($testDatabase -notmatch '^IoTTeamCenter_Proc(?:Fresh)?CI_[a-f0-9]{32}$' -or $instanceName -notmatch '^IoTProcCI_[a-f0-9]{16}$') {
                throw 'Refusing cleanup outside this generated test scope.'
            }
            Invoke-TestSql -SqlArguments @('-d', 'master', '-Q', "IF DB_ID(N'$testDatabase') IS NOT NULL BEGIN ALTER DATABASE [$testDatabase] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [$testDatabase]; END;")
        }
        & $localDbCommand stop $instanceName
        if ($LASTEXITCODE -ne 0) { throw "Could not stop owned test instance $instanceName." }
        & $localDbCommand delete $instanceName
        if ($LASTEXITCODE -ne 0) { throw "Could not remove owned test instance $instanceName." }
    }
    if (Test-Path -LiteralPath $baselineFile) { Remove-Item -LiteralPath $baselineFile }
    Pop-Location
}
