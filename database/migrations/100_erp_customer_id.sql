-- Migration 100: ERP customers are keyed by customer_id.
--
-- The ERP team answered on 2026-11-04 (section 10.7 of their MCP document): customer_code is unique and always filled, but
-- it can be edited, so the key is customer_id. Migration 099 keyed dbo.erp_customers and the app's link on customer_code,
-- so a code edited in the ERP would have looked like a new customer.
--
-- customers.erp_customer_id becomes the link. customers.erp_customer_code stays as the ERP code people see; every read
-- keeps it current. dbo.erp_customers is rebuilt keyed on customer_id, and the customer register is read again in full
-- the next time a customer screen opens. Customers linked under 099 keep their link: each takes the id of the ERP record
-- that carries its code (erp-master-sync.ts, reconcile), without being matched again.
--
-- It also lets Edit project give a project registered under the placeholder (PJ000000) its ERP number, once: the app role
-- gains UPDATE on projects.project_no.

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 99)
    THROW 52000, 'Migration 099 must be applied before migration 100.', 1;
GO

BEGIN TRANSACTION;

IF COL_LENGTH(N'dbo.customers', N'erp_customer_id') IS NULL
    ALTER TABLE dbo.customers ADD erp_customer_id nvarchar(50) NULL;

IF COL_LENGTH(N'dbo.erp_customers', N'customer_id') IS NULL
BEGIN
    -- Rows keyed by code cannot be re-keyed here: only the ERP knows each id. The next read brings them back.
    DROP TABLE IF EXISTS dbo.erp_customers;
    CREATE TABLE dbo.erp_customers (
        customer_id nvarchar(50) NOT NULL CONSTRAINT PK_erp_customers PRIMARY KEY,
        customer_code nvarchar(50) NOT NULL CONSTRAINT DF_erp_customers_customer_code DEFAULT N'',
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
        -- The customer_id of the record this one was merged into.
        merged_into nvarchar(50) NULL,
        erp_updated_at nvarchar(40) NULL,
        content_hash char(64) NOT NULL,
        match_state nvarchar(10) NOT NULL CONSTRAINT DF_erp_customers_match_state DEFAULT N'PENDING',
        review_ids nvarchar(400) NULL,
        synced_at datetimeoffset(0) NOT NULL CONSTRAINT DF_erp_customers_synced_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_erp_customers_match_state CHECK (match_state IN (N'PENDING', N'DONE', N'REVIEW'))
    );
    -- The next customer screen to open reads the whole register again.
    UPDATE dbo.erp_master_sync
    SET updated_since = NULL, round_server_time = NULL, page_cursor = NULL, running_since = NULL, finished_at = NULL, error = NULL, last_counts = NULL
    WHERE kind = N'customers';
END;

COMMIT TRANSACTION;
GO

-- The id is the link now; a code may move from one ERP customer to another.
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_customers_erp_customer_code' AND object_id = OBJECT_ID(N'dbo.customers'))
    DROP INDEX UX_customers_erp_customer_code ON dbo.customers;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_customers_erp_customer_id' AND object_id = OBJECT_ID(N'dbo.customers'))
    CREATE UNIQUE INDEX UX_customers_erp_customer_id ON dbo.customers(erp_customer_id) WHERE erp_customer_id IS NOT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_erp_customers_match_state' AND object_id = OBJECT_ID(N'dbo.erp_customers'))
    CREATE INDEX IX_erp_customers_match_state ON dbo.erp_customers(match_state) WHERE match_state <> N'DONE';
GO

-- A project registered under the placeholder (PJ000000) takes the ERP's number in Edit project (owner decision 2026-11-06).
IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL
BEGIN
    GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.erp_customers TO [iot_team_app_role];
    GRANT UPDATE (project_no) ON OBJECT::dbo.projects TO [iot_team_app_role];
END;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 100)
    INSERT dbo.schema_versions(version, name)
    VALUES (100, N'ERP customers keyed by customer_id');
GO
