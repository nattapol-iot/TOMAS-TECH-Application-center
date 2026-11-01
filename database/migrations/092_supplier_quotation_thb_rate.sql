-- Migration 092: a supplier quotation in JPY, USD or EUR carries the THB rate it is costed at.
--
-- A cost line has no currency column, so until now only THB quotation lines could reach an
-- estimate: the item type-ahead skipped every foreign line rather than land a yen price as baht.
-- The person who files the quotation now states what one unit of its currency is in baht, and
-- the type-ahead and "add lines from a quotation" convert with that rate. NULL on a THB
-- quotation, and on an older foreign one until somebody enters its rate.

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 91)
    THROW 51920, 'Migration 091 must be applied before migration 092.', 1;
GO

BEGIN TRANSACTION;

IF COL_LENGTH(N'dbo.supplier_quotations', N'thb_rate') IS NULL
    ALTER TABLE dbo.supplier_quotations ADD thb_rate decimal(19,6) NULL;

COMMIT TRANSACTION;
GO

IF OBJECT_ID(N'dbo.CK_supplier_quotations_thb_rate', N'C') IS NULL
    EXEC(N'ALTER TABLE dbo.supplier_quotations ADD CONSTRAINT CK_supplier_quotations_thb_rate
        CHECK (thb_rate IS NULL OR (currency <> ''THB'' AND thb_rate > 0 AND thb_rate <= 100000));');
GO

IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL
    GRANT UPDATE (thb_rate) ON OBJECT::dbo.supplier_quotations TO [iot_team_app_role];
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 92)
    INSERT dbo.schema_versions(version, name)
    VALUES (92, N'THB rate on a supplier quotation');
GO
