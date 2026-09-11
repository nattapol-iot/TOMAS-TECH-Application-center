:on error exit
-- Negative-control fixture for the Team Test schema 39 -> 42 rehearsal.
--
-- Seeds one live Estimate whose aggregate exceeds decimal(19,4) on a database that
-- has reached schema 41 but not 42. Migration 042 walks every live estimate through
-- dbo.assert_estimate_totals, so applying it afterwards must abort with 51420 and
-- leave neither schema version 42 nor a partially created procedure behind.
--
-- Runs only against the disposable LocalDB database created by
-- scripts/Test-TeamTestUpgrade39To42LocalDb.ps1.
SET NOCOUNT ON;
SET XACT_ABORT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;

DECLARE @fixture_database sysname = DB_NAME();
IF LEFT(@fixture_database, LEN(N'IoTTeamCenter_Blocker3942CI_')) <> N'IoTTeamCenter_Blocker3942CI_'
   OR LEN(@fixture_database) <> LEN(N'IoTTeamCenter_Blocker3942CI_') + 32
   OR RIGHT(@fixture_database, 32) COLLATE Latin1_General_100_BIN2 LIKE N'%[^0-9a-f]%'
    THROW 51960, 'Schema 39-42 blocker fixture refuses to run outside its exact synthetic CI database name.', 1;

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 41)
   OR EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 42)
    THROW 51961, 'Blocker fixture requires a through-041 database before migration 042.', 1;

IF OBJECT_ID(N'dbo.assert_estimate_totals', N'P') IS NOT NULL
    THROW 51962, 'Blocker fixture requires a database where migration 042 has not created its procedure yet.', 1;

DECLARE @admin_role bigint = (SELECT id FROM dbo.roles WHERE code = N'Admin');
IF @admin_role IS NULL THROW 51963, 'Blocker fixture requires the seeded Admin role.', 1;

BEGIN TRANSACTION;

INSERT dbo.users(entra_object_id, email, name, role_id, department)
VALUES(N'schema-3942-blocker-admin', N'schema-3942-blocker@test.invalid', N'TEST ONLY Schema 39-42 Blocker Admin', @admin_role, N'Engineering');
DECLARE @admin bigint = SCOPE_IDENTITY();

INSERT dbo.customers(code, name, created_by, updated_by)
VALUES(N'SCHEMA-3942-CI', N'TEST ONLY schema 39-42 blocker customer', @admin, @admin);
DECLARE @customer bigint = SCOPE_IDENTITY();

INSERT dbo.inquiries(inquiry_no, inquiry_date, customer_id, project_name, project_type, estimate_owner_id, due_date, priority, status, created_by, updated_by)
VALUES(N'SC3942-BLOCK', CONVERT(date, '20990101'), @customer, N'TEST ONLY schema 39-42 overflow', N'IoT', @admin, CONVERT(date, '20990102'), N'Normal', N'Estimating', @admin, @admin);
DECLARE @inquiry bigint = SCOPE_IDENTITY();

INSERT dbo.estimates(estimate_no, inquiry_id, customer_id, project_name, project_type, owner_id, created_date, due_date, status, contingency_rate, created_by, updated_by)
VALUES(N'SC3942-BLOCK', @inquiry, @customer, N'TEST ONLY schema 39-42 overflow', N'IoT', @admin, CONVERT(date, '20990101'), CONVERT(date, '20990102'), N'Draft', 0, @admin, @admin);
DECLARE @estimate bigint = SCOPE_IDENTITY();

-- Each line is inside decimal(19,4); their sum is not.
INSERT dbo.cost_items(estimate_id, revision, category_code, category, subcategory, module, item_code, description, brand, model, unit, qty, unit_cost, price_source, owner_id, status, created_by, updated_by)
VALUES
(@estimate, 0, '01', N'Hardware', N'', N'TEST', N'SC3942-BLOCK-1', N'TEST ONLY aggregate part one', N'', N'', N'Lot', 1, 600000000000000.0000, N'Test', @admin, N'Draft', @admin, @admin),
(@estimate, 0, '01', N'Hardware', N'', N'TEST', N'SC3942-BLOCK-2', N'TEST ONLY aggregate part two', N'', N'', N'Lot', 1, 600000000000000.0000, N'Test', @admin, N'Draft', @admin, @admin);

COMMIT TRANSACTION;
PRINT N'Schema 39-42 blocker fixture created one overflowing live Estimate.';
