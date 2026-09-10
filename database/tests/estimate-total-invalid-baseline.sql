:on error exit
SET NOCOUNT ON;
SET XACT_ABORT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;

DECLARE @fixture_database sysname=DB_NAME();
IF LEFT(@fixture_database,LEN(N'IoTTeamCenter_CostPreflightCI_'))<>N'IoTTeamCenter_CostPreflightCI_'
   OR LEN(@fixture_database)<>LEN(N'IoTTeamCenter_CostPreflightCI_')+32
   OR RIGHT(@fixture_database,32) COLLATE Latin1_General_100_BIN2 LIKE N'%[^0-9a-f]%'
    THROW 51929, 'Invalid-baseline fixture refuses to run outside its exact synthetic CI database name.', 1;

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version=41)
   OR EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version=42)
    THROW 51930, 'Invalid-baseline fixture requires a through-041 database before migration 042.', 1;

DECLARE @admin_role bigint=(SELECT id FROM dbo.roles WHERE code=N'Admin');
IF @admin_role IS NULL THROW 51931, 'Invalid-baseline fixture requires the seeded Admin role.', 1;

BEGIN TRANSACTION;

INSERT dbo.users(entra_object_id,email,name,role_id,department)
VALUES(N'estimate-total-preflight-admin',N'estimate-total-preflight@test.invalid',N'TEST ONLY Aggregate Preflight Admin',@admin_role,N'Engineering');
DECLARE @admin bigint=SCOPE_IDENTITY();

INSERT dbo.customers(code,name,created_by,updated_by)
VALUES(N'TOTAL-PREFLIGHT-CI',N'TEST ONLY aggregate preflight customer',@admin,@admin);
DECLARE @customer bigint=SCOPE_IDENTITY();

INSERT dbo.inquiries(inquiry_no,inquiry_date,customer_id,project_name,project_type,estimate_owner_id,due_date,priority,status,created_by,updated_by)
VALUES(N'TB-PREFLIGHT',CONVERT(date,'20990101'),@customer,N'TEST ONLY invalid aggregate preflight',N'IoT',@admin,CONVERT(date,'20990102'),N'Normal',N'Estimating',@admin,@admin);
DECLARE @inquiry bigint=SCOPE_IDENTITY();

INSERT dbo.estimates(estimate_no,inquiry_id,customer_id,project_name,project_type,owner_id,created_date,due_date,status,contingency_rate,created_by,updated_by)
VALUES(N'TB-PREFLIGHT',@inquiry,@customer,N'TEST ONLY invalid aggregate preflight',N'IoT',@admin,CONVERT(date,'20990101'),CONVERT(date,'20990102'),N'Draft',0,@admin,@admin);
DECLARE @estimate bigint=SCOPE_IDENTITY();

INSERT dbo.cost_items(estimate_id,revision,category_code,category,subcategory,module,item_code,description,brand,model,unit,qty,unit_cost,price_source,owner_id,status,created_by,updated_by)
VALUES
(@estimate,0,'01',N'Hardware',N'',N'TEST',N'TB-PREFLIGHT-1',N'TEST ONLY aggregate part one',N'',N'',N'Lot',1,600000000000000.0000,N'Test',@admin,N'Draft',@admin,@admin),
(@estimate,0,'01',N'Hardware',N'',N'TEST',N'TB-PREFLIGHT-2',N'TEST ONLY aggregate part two',N'',N'',N'Lot',1,600000000000000.0000,N'Test',@admin,N'Draft',@admin,@admin);

COMMIT TRANSACTION;
PRINT N'Invalid estimate total baseline fixture created.';
