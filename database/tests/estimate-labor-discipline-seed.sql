:on error exit
SET NOCOUNT ON;
SET XACT_ABORT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;

-- Lines as they exist before migration 070, for scripts/Test-EstimateDisciplineLocalDb.ps1.
-- Runs only in that script's generated database.
DECLARE @fixture_database sysname=DB_NAME();
IF LEFT(@fixture_database,LEN(N'IoTTeamCenter_DisciplineUpgradeCI_'))<>N'IoTTeamCenter_DisciplineUpgradeCI_'
   OR LEN(@fixture_database)<>LEN(N'IoTTeamCenter_DisciplineUpgradeCI_')+32
   OR RIGHT(@fixture_database,32) COLLATE Latin1_General_100_BIN2 LIKE N'%[^0-9a-f]%'
    THROW 51970, 'The discipline seed refuses to run outside its synthetic CI database.', 1;
IF (SELECT MAX(version) FROM dbo.schema_versions)<>69
    THROW 51971, 'The discipline seed expects a schema 69 database.', 1;

DECLARE @admin_role bigint=(SELECT id FROM dbo.roles WHERE code=N'Admin');
INSERT dbo.users(entra_object_id,email,name,role_id,department)
VALUES(N'discipline-ci-admin',N'discipline-ci@test.invalid',N'TEST ONLY Discipline Admin',@admin_role,N'Engineering');
DECLARE @admin bigint=SCOPE_IDENTITY();
INSERT dbo.customers(code,name,created_by,updated_by) VALUES(N'DISCIPLINE-CI',N'TEST ONLY discipline customer',@admin,@admin);
DECLARE @customer bigint=SCOPE_IDENTITY();
INSERT dbo.inquiries(inquiry_no,inquiry_date,customer_id,project_name,project_type,estimate_owner_id,due_date,priority,status,created_by,updated_by)
VALUES(N'DC-1',CONVERT(date,'20990101'),@customer,N'TEST ONLY discipline',N'IoT',@admin,CONVERT(date,'20990102'),N'Normal',N'Estimating',@admin,@admin);
DECLARE @inquiry bigint=SCOPE_IDENTITY();
INSERT dbo.estimates(estimate_no,inquiry_id,customer_id,project_name,project_type,owner_id,created_date,due_date,status,contingency_rate,created_by,updated_by)
VALUES(N'DC-1',@inquiry,@customer,N'TEST ONLY discipline',N'IoT',@admin,CONVERT(date,'20990101'),CONVERT(date,'20990102'),N'Draft',0,@admin,@admin);
DECLARE @estimate bigint=SCOPE_IDENTITY();

-- Revision 0 becomes history once the estimate moves to revision 1.
INSERT dbo.manhour_lines(estimate_id,revision,package,activity,department,level,cost_type,provider,engineers,man_days,hours_per_day,daily_rate,owner_id,created_by,updated_by)
VALUES(@estimate,0,N'PKG-OLD',N'DC history',N'Software',N'Engineer',N'Engineering',N'Internal',1,1,8,1000,@admin,@admin,@admin);
UPDATE dbo.estimates SET revision=1 WHERE id=@estimate;

INSERT dbo.manhour_lines(estimate_id,revision,package,activity,department,level,cost_type,provider,engineers,man_days,hours_per_day,daily_rate,owner_id,created_by,updated_by)
VALUES
(@estimate,1,N'PKG-MIX',N'DC software',N'Software',N'Engineer',N'Engineering',N'Internal',1,1,8,1000,@admin,@admin,@admin),
(@estimate,1,N'PKG-MIX',N'DC electrical',N' electrical ',N'Engineer',N'Engineering',N'Internal',1,1,8,1000,@admin,@admin,@admin),
(@estimate,1,N'PKG-SITE',N'DC installation',N'IoT Engineer Dept.',N'Engineer',N'Installation',N'Internal',1,1,8,1000,@admin,@admin,@admin),
(@estimate,1,N'PKG-IOT',N'DC unplaced',N'IoT Engineer Dept.',N'Engineer',N'Engineering',N'Internal',1,1,8,1000,@admin,@admin,@admin),
(@estimate,1,N'PKG-M',N'DC mechanical',N'MECHANICAL',N'Engineer',N'Engineering',N'Internal',1,1,8,1000,@admin,@admin,@admin);

INSERT dbo.expense_lines(estimate_id,revision,package,expense_type,description,cost_type,qty,unit,unit_cost,owner_id,created_by,updated_by)
VALUES
(@estimate,1,N'PKG-SITE',N'Accommodation',N'DC hotel',N'Installation',1,N'Night',100,@admin,@admin,@admin),
(@estimate,1,N'PKG-M',N'Travel',N'DC mechanical trip',N'Engineering',1,N'Trip',100,@admin,@admin,@admin),
(@estimate,1,N'PKG-MIX',N'Travel',N'DC mixed trip',N'Engineering',1,N'Trip',100,@admin,@admin,@admin),
(@estimate,1,N'PKG-NONE',N'Per Diem',N'DC no labor',N'Engineering',1,N'Day',100,@admin,@admin,@admin);
GO
