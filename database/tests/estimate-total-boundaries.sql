:on error exit
SET NOCOUNT ON;
SET XACT_ABORT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;

DECLARE @fixture_database sysname=DB_NAME();
IF NOT (
       (LEFT(@fixture_database,LEN(N'IoTTeamCenter_CostBoundaryCI_'))=N'IoTTeamCenter_CostBoundaryCI_' AND LEN(@fixture_database)=LEN(N'IoTTeamCenter_CostBoundaryCI_')+32)
    OR (LEFT(@fixture_database,LEN(N'IoTTeamCenter_CostUpgradeCI_'))=N'IoTTeamCenter_CostUpgradeCI_' AND LEN(@fixture_database)=LEN(N'IoTTeamCenter_CostUpgradeCI_')+32)
    OR (LEFT(@fixture_database,LEN(N'IoTTeamCenter_CostFreshCI_'))=N'IoTTeamCenter_CostFreshCI_' AND LEN(@fixture_database)=LEN(N'IoTTeamCenter_CostFreshCI_')+32)
) OR RIGHT(@fixture_database,32) COLLATE Latin1_General_100_BIN2 LIKE N'%[^0-9a-f]%'
    THROW 51919, 'Estimate total boundary fixture refuses to run outside its exact synthetic CI database names.', 1;

BEGIN TRANSACTION;
GO

IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NULL
    CREATE ROLE [iot_team_app_role];
GO

-- Reapply 042 inside the fixture transaction so both the upgrade idempotency
-- and the conditional least-privilege grant are exercised.
:r database/migrations/042_estimate_total_guard.sql

DECLARE @admin_role bigint=(SELECT id FROM dbo.roles WHERE code=N'Admin');
IF @admin_role IS NULL THROW 51920, 'Boundary fixture requires the seeded Admin role.', 1;
INSERT dbo.users(entra_object_id,email,name,role_id,department)
VALUES(N'estimate-total-boundary-admin',N'estimate-total-boundary@test.invalid',N'TEST ONLY Aggregate Boundary Admin',@admin_role,N'Engineering');
DECLARE @admin bigint=SCOPE_IDENTITY();

INSERT dbo.customers(code, name, created_by, updated_by)
VALUES(N'TOTAL-BOUNDARY-CI', N'TEST ONLY aggregate boundary customer', @admin, @admin);
DECLARE @customer bigint = SCOPE_IDENTITY();

DECLARE @cases TABLE(code nvarchar(20) PRIMARY KEY, contingency decimal(9,4) NOT NULL);
INSERT @cases(code, contingency)
VALUES (N'BELOW',0),(N'ATMAX',0),(N'DIRECTOVER',0),(N'ZERO',0),(N'OVERHEADOVER',0),(N'FINALOVER',0),(N'CONTOVER',100);

INSERT dbo.inquiries(inquiry_no,inquiry_date,customer_id,project_name,project_type,estimate_owner_id,due_date,priority,status,created_by,updated_by)
SELECT N'TB-' + code,CONVERT(date,'20990101'),@customer,N'TEST ONLY ' + code,N'IoT',@admin,CONVERT(date,'20990102'),N'Normal',N'Estimating',@admin,@admin
FROM @cases;

INSERT dbo.estimates(estimate_no,inquiry_id,customer_id,project_name,project_type,owner_id,created_date,due_date,status,contingency_rate,created_by,updated_by)
SELECT N'TB-' + cases.code,inquiry.id,@customer,N'TEST ONLY ' + cases.code,N'IoT',@admin,CONVERT(date,'20990101'),CONVERT(date,'20990102'),N'Draft',cases.contingency,@admin,@admin
FROM @cases cases
INNER JOIN dbo.inquiries inquiry ON inquiry.inquiry_no = N'TB-' + cases.code;

DECLARE @below bigint=(SELECT id FROM dbo.estimates WHERE estimate_no=N'TB-BELOW');
DECLARE @atmax bigint=(SELECT id FROM dbo.estimates WHERE estimate_no=N'TB-ATMAX');
DECLARE @directover bigint=(SELECT id FROM dbo.estimates WHERE estimate_no=N'TB-DIRECTOVER');
DECLARE @zero bigint=(SELECT id FROM dbo.estimates WHERE estimate_no=N'TB-ZERO');
DECLARE @overheadover bigint=(SELECT id FROM dbo.estimates WHERE estimate_no=N'TB-OVERHEADOVER');
DECLARE @finalover bigint=(SELECT id FROM dbo.estimates WHERE estimate_no=N'TB-FINALOVER');
DECLARE @contover bigint=(SELECT id FROM dbo.estimates WHERE estimate_no=N'TB-CONTOVER');

INSERT dbo.cost_items(estimate_id,revision,category_code,category,subcategory,module,item_code,description,brand,model,unit,qty,unit_cost,price_source,owner_id,status,created_by,updated_by)
VALUES
(@below,0,'01',N'Hardware',N'',N'TEST',N'TB-BELOW-1',N'TEST ONLY below maximum',N'',N'',N'Lot',1,999999999999999.9998,N'Test',@admin,N'Draft',@admin,@admin),
(@atmax,0,'01',N'Hardware',N'',N'TEST',N'TB-ATMAX-1',N'TEST ONLY exact maximum',N'',N'',N'Lot',1,999999999999999.9999,N'Test',@admin,N'Draft',@admin,@admin),
(@directover,0,'01',N'Hardware',N'',N'TEST',N'TB-DIRECT-1',N'TEST ONLY aggregate part one',N'',N'',N'Lot',1,600000000000000.0000,N'Test',@admin,N'Draft',@admin,@admin),
(@directover,0,'01',N'Hardware',N'',N'TEST',N'TB-DIRECT-2',N'TEST ONLY aggregate part two',N'',N'',N'Lot',1,600000000000000.0000,N'Test',@admin,N'Draft',@admin,@admin),
(@contover,0,'01',N'Hardware',N'',N'TEST',N'TB-CONT-1',N'TEST ONLY contingency overflow',N'',N'',N'Lot',1,600000000000000.0000,N'Test',@admin,N'Draft',@admin,@admin);

DECLARE @policy_version int=COALESCE((SELECT MAX(policy_version) FROM dbo.overhead_policies),0);
INSERT dbo.overhead_policies(policy_version,monthly_budget,normal_direct_hours,effective_from,reason,created_by)
VALUES
(@policy_version+1,0,1,CONVERT(date,'20980101'),N'TEST ONLY zero overhead',@admin),
(@policy_version+2,999999999999999.9999,1,CONVERT(date,'20980102'),N'TEST ONLY overhead overflow',@admin),
(@policy_version+3,400000000000000.0000,1,CONVERT(date,'20980103'),N'TEST ONLY final total overflow',@admin);

DECLARE @zero_policy bigint=(SELECT id FROM dbo.overhead_policies WHERE policy_version=@policy_version+1);
DECLARE @high_policy bigint=(SELECT id FROM dbo.overhead_policies WHERE policy_version=@policy_version+2);
DECLARE @final_policy bigint=(SELECT id FROM dbo.overhead_policies WHERE policy_version=@policy_version+3);

INSERT dbo.manhour_lines(estimate_id,revision,package,activity,department,level,cost_type,provider,engineers,man_days,hours_per_day,daily_rate,owner_id,created_by,updated_by)
VALUES
(@zero,0,N'TEST',N'Zero overhead',N'Engineering',N'Engineer',N'Engineering',N'Internal',1,1,8,0,@admin,@admin,@admin),
(@overheadover,0,N'TEST',N'Overhead overflow',N'Engineering',N'Engineer',N'Engineering',N'Internal',2,1,1,0,@admin,@admin,@admin),
(@finalover,0,N'TEST',N'Final overflow',N'Engineering',N'Engineer',N'Engineering',N'Internal',1,1,1,600000000000000.0000,@admin,@admin,@admin);

INSERT dbo.estimate_overhead_snapshots(estimate_id,revision,policy_id,policy_version,method,monthly_budget,normal_direct_hours,hourly_rate,effective_from,reason,applied_by)
SELECT @zero,0,id,policy_version,method,monthly_budget,normal_direct_hours,hourly_rate,effective_from,reason,@admin FROM dbo.overhead_policies WHERE id=@zero_policy
UNION ALL
SELECT @overheadover,0,id,policy_version,method,monthly_budget,normal_direct_hours,hourly_rate,effective_from,reason,@admin FROM dbo.overhead_policies WHERE id=@high_policy
UNION ALL
SELECT @finalover,0,id,policy_version,method,monthly_budget,normal_direct_hours,hourly_rate,effective_from,reason,@admin FROM dbo.overhead_policies WHERE id=@final_policy;

EXEC dbo.assert_estimate_totals @estimate_id=@below;
EXEC dbo.assert_estimate_totals @estimate_id=@atmax;
EXEC dbo.assert_estimate_totals @estimate_id=@zero;

IF NOT EXISTS (SELECT 1 FROM dbo.v_estimate_totals WHERE estimate_id=@below AND total=999999999999999.9998)
    THROW 51921, 'The just-below decimal(19,4) boundary did not remain exact.', 1;
IF NOT EXISTS (SELECT 1 FROM dbo.v_estimate_totals WHERE estimate_id=@atmax AND total=999999999999999.9999)
    THROW 51922, 'The exact decimal(19,4) boundary did not remain exact.', 1;
IF NOT EXISTS (SELECT 1 FROM dbo.v_estimate_totals WHERE estimate_id=@zero AND overhead_state=N'Zero' AND overhead_total=0)
    THROW 51923, 'Explicit zero overhead was not preserved.', 1;
IF NOT EXISTS (SELECT 1 FROM dbo.v_estimate_totals WHERE estimate_id=@below AND overhead_state=N'Missing' AND overhead_total IS NULL)
    THROW 51924, 'Missing overhead was hidden as a numeric zero.', 1;

CREATE USER [estimate_total_guard_test] WITHOUT LOGIN;
ALTER ROLE [iot_team_app_role] ADD MEMBER [estimate_total_guard_test];
EXECUTE AS USER=N'estimate_total_guard_test';
IF COALESCE(HAS_PERMS_BY_NAME(N'dbo.assert_estimate_totals',N'OBJECT',N'EXECUTE'),0)<>1
BEGIN
    REVERT;
    THROW 51927, 'The restricted application role cannot execute the aggregate guard.', 1;
END;
EXEC dbo.assert_estimate_totals @estimate_id=@below;
REVERT;

DECLARE @expected_failures TABLE(estimate_id bigint PRIMARY KEY);
INSERT @expected_failures VALUES(@directover),(@overheadover),(@finalover),(@contover);
-- Expected arithmetic failures must remain statement-scoped so one fixture
-- transaction can verify every independent boundary before rolling back.
SET XACT_ABORT OFF;
DECLARE @failed_id bigint;
DECLARE failed_cursor CURSOR LOCAL FAST_FORWARD FOR SELECT estimate_id FROM @expected_failures ORDER BY estimate_id;
OPEN failed_cursor;
FETCH NEXT FROM failed_cursor INTO @failed_id;
WHILE @@FETCH_STATUS=0
BEGIN
    BEGIN TRY
        EXEC dbo.assert_estimate_totals @estimate_id=@failed_id;
        THROW 51925, 'Expected aggregate boundary failure was not raised.', 1;
    END TRY
    BEGIN CATCH
        IF ERROR_NUMBER()<>51420 THROW;
        IF ERROR_MESSAGE() NOT LIKE N'%' + CONVERT(nvarchar(20),@failed_id) + N'%'
            THROW 51926, 'Aggregate boundary error omitted the offending estimate identity.', 1;
    END CATCH;
    FETCH NEXT FROM failed_cursor INTO @failed_id;
END;
CLOSE failed_cursor;
DEALLOCATE failed_cursor;

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version=42 AND name=N'Guard estimate aggregates within supported decimal precision')
    THROW 51928, 'Migration 042 identity is missing.', 1;

ROLLBACK TRANSACTION;
PRINT N'Estimate total boundary fixture passed.';
