-- Migration 080: cabinets in the installed base, and asset numbers that follow the live register.
--
-- Equipment is installed in a customer's cabinets (control panels, MDBs, racks), so the installed base
-- reads customer -> cabinet -> equipment. A cabinet belongs to one customer and optionally one of its
-- sites; an asset may sit in one cabinet of its own customer.
--
-- Asset numbers were derived from the identity, so a deleted asset left a hole forever: delete
-- AST-000001, register again, and the new one was AST-000002. The number is now its own sequence,
-- the next one is the highest number still in use + 1, and it is unique among live assets only. A
-- deleted asset keeps its number on its record and history, and that number may be issued again.
-- Existing assets keep the number they already have (it may be on a label in the field).

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET ARITHABORT ON;
SET NUMERIC_ROUNDABORT OFF;
GO

IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 80 AND name <> N'Installed base cabinets and asset numbering')
    THROW 51801, 'Schema version 080 is already used by another migration.', 1;
IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 79)
    THROW 51802, 'Apply migration 079 before migration 080.', 1;
GO

BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.installed_cabinets', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.installed_cabinets (
        id               bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_installed_cabinets PRIMARY KEY,
        customer_id      bigint            NOT NULL CONSTRAINT FK_installed_cabinets_customer REFERENCES dbo.customers(id),
        customer_site_id bigint            NULL CONSTRAINT FK_installed_cabinets_customer_site REFERENCES dbo.customer_sites(id),
        name             nvarchar(200)     NOT NULL,
        location_detail  nvarchar(300)     NOT NULL CONSTRAINT DF_installed_cabinets_location DEFAULT N'',
        notes            nvarchar(1000)    NOT NULL CONSTRAINT DF_installed_cabinets_notes DEFAULT N'',
        created_by       bigint            NOT NULL CONSTRAINT FK_installed_cabinets_created_by REFERENCES dbo.users(id),
        created_at       datetimeoffset(0) NOT NULL CONSTRAINT DF_installed_cabinets_created_at DEFAULT SYSUTCDATETIME(),
        updated_by       bigint            NOT NULL CONSTRAINT FK_installed_cabinets_updated_by REFERENCES dbo.users(id),
        updated_at       datetimeoffset(0) NOT NULL CONSTRAINT DF_installed_cabinets_updated_at DEFAULT SYSUTCDATETIME(),
        deleted_at       datetimeoffset(0) NULL,
        row_version      rowversion        NOT NULL,
        CONSTRAINT CK_installed_cabinets_name CHECK (LEN(LTRIM(RTRIM(name))) > 0)
    );
    -- A customer does not have two live cabinets with the same name.
    CREATE UNIQUE INDEX UQ_installed_cabinets_name ON dbo.installed_cabinets(customer_id, name) WHERE deleted_at IS NULL;
END;

IF COL_LENGTH(N'dbo.installed_assets', N'cabinet_id') IS NULL
    ALTER TABLE dbo.installed_assets ADD cabinet_id bigint NULL
        CONSTRAINT FK_installed_assets_cabinet REFERENCES dbo.installed_cabinets(id);

IF COL_LENGTH(N'dbo.installed_assets', N'asset_seq') IS NULL
    ALTER TABLE dbo.installed_assets ADD asset_seq int NULL;

COMMIT TRANSACTION;
GO

BEGIN TRANSACTION;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_installed_assets_cabinet' AND object_id = OBJECT_ID(N'dbo.installed_assets'))
    CREATE INDEX IX_installed_assets_cabinet ON dbo.installed_assets(cabinet_id) WHERE cabinet_id IS NOT NULL AND deleted_at IS NULL;

-- Keep every existing number: the sequence starts as the identity the number was derived from.
UPDATE dbo.installed_assets SET asset_seq = CONVERT(int, id) WHERE asset_seq IS NULL;
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.installed_assets') AND name = N'asset_seq' AND is_nullable = 1)
    ALTER TABLE dbo.installed_assets ALTER COLUMN asset_seq int NOT NULL;

IF EXISTS (SELECT 1 FROM sys.computed_columns WHERE object_id = OBJECT_ID(N'dbo.installed_assets') AND name = N'asset_no'
           AND definition NOT LIKE N'%asset_seq%')
BEGIN
    IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ_installed_assets_no' AND object_id = OBJECT_ID(N'dbo.installed_assets'))
        DROP INDEX UQ_installed_assets_no ON dbo.installed_assets;
    ALTER TABLE dbo.installed_assets DROP COLUMN asset_no;
    ALTER TABLE dbo.installed_assets ADD asset_no AS
        CONVERT(nvarchar(20), CONCAT(N'AST-', RIGHT(CONCAT(N'000000', CONVERT(nvarchar(20), asset_seq)), 6))) PERSISTED;
END;

COMMIT TRANSACTION;
GO

BEGIN TRANSACTION;

-- Unique among live assets; the insert takes MAX(asset_seq) + 1 under a range lock on this index.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ_installed_assets_seq' AND object_id = OBJECT_ID(N'dbo.installed_assets'))
    CREATE UNIQUE INDEX UQ_installed_assets_seq ON dbo.installed_assets(asset_seq) WHERE deleted_at IS NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_installed_assets_no' AND object_id = OBJECT_ID(N'dbo.installed_assets'))
    CREATE INDEX IX_installed_assets_no ON dbo.installed_assets(asset_no);

IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL
    GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.installed_cabinets TO [iot_team_app_role];

COMMIT TRANSACTION;
GO

-- Record the version last.
IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 80)
    INSERT dbo.schema_versions(version, name)
    VALUES (80, N'Installed base cabinets and asset numbering');
GO
