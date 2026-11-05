-- Migration 099: customers and suppliers come from the Pegasus ERP.
--
-- The ERP team shipped customers_list, customer_get and suppliers_list (answer to
-- docs/PEGASUS_ERP_CUSTOMER_SUPPLIER_SYNC_TH.md, 2026-11-05). The owner chose that every active ERP customer and
-- supplier is added to the app; an existing record is linked when one tax ID or one name matches, and an unclear match
-- waits for an Admin. The ERP forbids background jobs, so the app reads the registers when someone opens the customer
-- or supplier screens, with that person's TMT ID token, at most one round per 15 minutes for the whole app.
--
-- erp_customers and erp_suppliers hold the ERP's records as last read. customers.erp_customer_code and
-- suppliers.erp_supplier_id link an app record to one of them; the app's own code stays, because projects and
-- documents already carry it. erp_master_sync keeps where the next round starts.

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 98)
    THROW 51990, 'Migration 098 must be applied before migration 099.', 1;
GO

BEGIN TRANSACTION;

IF COL_LENGTH(N'dbo.customers', N'erp_customer_code') IS NULL
    ALTER TABLE dbo.customers ADD erp_customer_code nvarchar(50) NULL;

IF COL_LENGTH(N'dbo.suppliers', N'erp_supplier_id') IS NULL
    ALTER TABLE dbo.suppliers ADD erp_supplier_id nvarchar(50) NULL;

IF OBJECT_ID(N'dbo.erp_customers', N'U') IS NULL
    CREATE TABLE dbo.erp_customers (
        customer_code nvarchar(50) NOT NULL CONSTRAINT PK_erp_customers PRIMARY KEY,
        name_th nvarchar(300) NOT NULL CONSTRAINT DF_erp_customers_name_th DEFAULT N'',
        name_en nvarchar(300) NOT NULL CONSTRAINT DF_erp_customers_name_en DEFAULT N'',
        short_name nvarchar(100) NOT NULL CONSTRAINT DF_erp_customers_short_name DEFAULT N'',
        tax_id nvarchar(20) NOT NULL CONSTRAINT DF_erp_customers_tax_id DEFAULT N'',
        branch nvarchar(100) NOT NULL CONSTRAINT DF_erp_customers_branch DEFAULT N'',
        address nvarchar(1000) NOT NULL CONSTRAINT DF_erp_customers_address DEFAULT N'',
        province nvarchar(120) NOT NULL CONSTRAINT DF_erp_customers_province DEFAULT N'',
        postal_code nvarchar(20) NOT NULL CONSTRAINT DF_erp_customers_postal_code DEFAULT N'',
        country nvarchar(120) NOT NULL CONSTRAINT DF_erp_customers_country DEFAULT N'',
        phone nvarchar(100) NOT NULL CONSTRAINT DF_erp_customers_phone DEFAULT N'',
        email nvarchar(256) NOT NULL CONSTRAINT DF_erp_customers_email DEFAULT N'',
        website nvarchar(500) NOT NULL CONSTRAINT DF_erp_customers_website DEFAULT N'',
        is_active bit NOT NULL CONSTRAINT DF_erp_customers_is_active DEFAULT 1,
        merged_into nvarchar(50) NULL,
        erp_updated_at nvarchar(40) NULL,
        -- What the record looked like when last read, so an unchanged record is not applied again.
        content_hash char(64) NOT NULL,
        -- PENDING: read and not yet applied to the app. DONE: applied. REVIEW: an Admin chooses between review_ids.
        match_state nvarchar(10) NOT NULL CONSTRAINT DF_erp_customers_match_state DEFAULT N'PENDING',
        review_ids nvarchar(400) NULL,
        synced_at datetimeoffset(0) NOT NULL CONSTRAINT DF_erp_customers_synced_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_erp_customers_match_state CHECK (match_state IN (N'PENDING', N'DONE', N'REVIEW'))
    );

IF OBJECT_ID(N'dbo.erp_suppliers', N'U') IS NULL
    CREATE TABLE dbo.erp_suppliers (
        supplier_id nvarchar(50) NOT NULL CONSTRAINT PK_erp_suppliers PRIMARY KEY,
        supplier_code nvarchar(50) NOT NULL CONSTRAINT DF_erp_suppliers_supplier_code DEFAULT N'',
        name_th nvarchar(300) NOT NULL CONSTRAINT DF_erp_suppliers_name_th DEFAULT N'',
        name_en nvarchar(300) NOT NULL CONSTRAINT DF_erp_suppliers_name_en DEFAULT N'',
        tax_id nvarchar(20) NOT NULL CONSTRAINT DF_erp_suppliers_tax_id DEFAULT N'',
        branch nvarchar(100) NOT NULL CONSTRAINT DF_erp_suppliers_branch DEFAULT N'',
        address nvarchar(1000) NOT NULL CONSTRAINT DF_erp_suppliers_address DEFAULT N'',
        province nvarchar(120) NOT NULL CONSTRAINT DF_erp_suppliers_province DEFAULT N'',
        postal_code nvarchar(20) NOT NULL CONSTRAINT DF_erp_suppliers_postal_code DEFAULT N'',
        country nvarchar(120) NOT NULL CONSTRAINT DF_erp_suppliers_country DEFAULT N'',
        phone nvarchar(100) NOT NULL CONSTRAINT DF_erp_suppliers_phone DEFAULT N'',
        email nvarchar(256) NOT NULL CONSTRAINT DF_erp_suppliers_email DEFAULT N'',
        website nvarchar(500) NOT NULL CONSTRAINT DF_erp_suppliers_website DEFAULT N'',
        contact_name nvarchar(200) NOT NULL CONSTRAINT DF_erp_suppliers_contact_name DEFAULT N'',
        approval_status nvarchar(30) NOT NULL CONSTRAINT DF_erp_suppliers_approval_status DEFAULT N'',
        is_active bit NOT NULL CONSTRAINT DF_erp_suppliers_is_active DEFAULT 1,
        merged_into nvarchar(50) NULL,
        erp_updated_at nvarchar(40) NULL,
        content_hash char(64) NOT NULL,
        match_state nvarchar(10) NOT NULL CONSTRAINT DF_erp_suppliers_match_state DEFAULT N'PENDING',
        review_ids nvarchar(400) NULL,
        synced_at datetimeoffset(0) NOT NULL CONSTRAINT DF_erp_suppliers_synced_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_erp_suppliers_match_state CHECK (match_state IN (N'PENDING', N'DONE', N'REVIEW'))
    );

IF OBJECT_ID(N'dbo.erp_master_sync', N'U') IS NULL
    CREATE TABLE dbo.erp_master_sync (
        kind nvarchar(20) NOT NULL CONSTRAINT PK_erp_master_sync PRIMARY KEY,
        -- The ERP's server_time from the first page of the last complete round, sent back as updated_since.
        updated_since nvarchar(40) NULL,
        -- A round that stopped part-way: its server_time and the cursor of the next page.
        round_server_time nvarchar(40) NULL,
        page_cursor nvarchar(1000) NULL,
        running_since datetimeoffset(0) NULL,
        finished_at datetimeoffset(0) NULL,
        attempted_at datetimeoffset(0) NULL,
        attempted_by bigint NULL,
        -- Why the last attempt failed; cleared when a page is read.
        error nvarchar(500) NULL,
        last_counts nvarchar(400) NULL,
        CONSTRAINT FK_erp_master_sync_attempted_by FOREIGN KEY (attempted_by) REFERENCES dbo.users(id),
        CONSTRAINT CK_erp_master_sync_kind CHECK (kind IN (N'customers', N'suppliers')),
        CONSTRAINT CK_erp_master_sync_counts CHECK (last_counts IS NULL OR ISJSON(last_counts) = 1)
    );

IF NOT EXISTS (SELECT 1 FROM dbo.erp_master_sync WHERE kind = N'customers')
    INSERT dbo.erp_master_sync(kind) VALUES (N'customers');
IF NOT EXISTS (SELECT 1 FROM dbo.erp_master_sync WHERE kind = N'suppliers')
    INSERT dbo.erp_master_sync(kind) VALUES (N'suppliers');

COMMIT TRANSACTION;
GO

-- One app record per ERP record.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_customers_erp_customer_code' AND object_id = OBJECT_ID(N'dbo.customers'))
    CREATE UNIQUE INDEX UX_customers_erp_customer_code ON dbo.customers(erp_customer_code) WHERE erp_customer_code IS NOT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_suppliers_erp_supplier_id' AND object_id = OBJECT_ID(N'dbo.suppliers'))
    CREATE UNIQUE INDEX UX_suppliers_erp_supplier_id ON dbo.suppliers(erp_supplier_id) WHERE erp_supplier_id IS NOT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_erp_customers_match_state' AND object_id = OBJECT_ID(N'dbo.erp_customers'))
    CREATE INDEX IX_erp_customers_match_state ON dbo.erp_customers(match_state) WHERE match_state <> N'DONE';
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_erp_suppliers_match_state' AND object_id = OBJECT_ID(N'dbo.erp_suppliers'))
    CREATE INDEX IX_erp_suppliers_match_state ON dbo.erp_suppliers(match_state) WHERE match_state <> N'DONE';
GO

IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL
BEGIN
    GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.erp_customers TO [iot_team_app_role];
    GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.erp_suppliers TO [iot_team_app_role];
    GRANT SELECT, UPDATE ON OBJECT::dbo.erp_master_sync TO [iot_team_app_role];
END;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 99)
    INSERT dbo.schema_versions(version, name)
    VALUES (99, N'Customers and suppliers from the Pegasus ERP');
GO
