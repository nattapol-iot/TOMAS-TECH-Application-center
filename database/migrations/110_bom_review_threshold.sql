-- Migration 110: a BOM at or over a threshold is released by a second person.
--
-- A BOM of THB 955,000 was generated and released by the same person within a minute (bug 4 of the
-- owner's list, 2026-11-20). From this release the API refuses a release by the person who generated
-- the BOM when its budget is at or over a threshold; another approver releases it.
--
-- The threshold is one figure for the company, kept here so it can be changed without a release:
--
--   UPDATE dbo.procurement_settings SET bom_review_threshold = 250000, updated_at = SYSUTCDATETIME() WHERE id = 1;
--
-- It starts at THB 100,000. Zero means every BOM needs a second person. Nothing existing changes:
-- BOMs already released stay released. Running this again changes nothing.
--
-- To undo: database/rollback/110_bom_review_threshold.rollback.sql

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 109)
    THROW 51110, 'Migration 109 must be applied before migration 110.', 1;
GO

BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.procurement_settings', N'U') IS NULL
    CREATE TABLE dbo.procurement_settings (
        id                   int               NOT NULL CONSTRAINT PK_procurement_settings PRIMARY KEY CONSTRAINT CK_procurement_settings_single CHECK (id = 1),
        bom_review_threshold decimal(19,4)     NOT NULL CONSTRAINT DF_procurement_settings_bom_review DEFAULT 100000
                                                        CONSTRAINT CK_procurement_settings_bom_review CHECK (bom_review_threshold >= 0),
        updated_at           datetimeoffset(0) NOT NULL CONSTRAINT DF_procurement_settings_updated_at DEFAULT SYSUTCDATETIME()
    );

IF NOT EXISTS (SELECT 1 FROM dbo.procurement_settings WHERE id = 1)
    INSERT dbo.procurement_settings(id) VALUES (1);

IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL
    GRANT SELECT ON OBJECT::dbo.procurement_settings TO [iot_team_app_role];

COMMIT TRANSACTION;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 110)
    INSERT dbo.schema_versions(version, name)
    VALUES (110, N'BOM review threshold');
GO
