SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF EXISTS (
    SELECT 1 FROM dbo.schema_versions
    WHERE version = 44
      AND name <> N'Reusable labor rate masters and estimate labor packages'
)
    THROW 51440, 'Schema version 044 is already used by another migration.', 1;

IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 44)
    THROW 51441, 'Migration 044 has already been applied.', 1;

IF NOT EXISTS (
    SELECT 1 FROM dbo.schema_versions
    WHERE version = 43
      AND name = N'Revision-scoped Estimate ERP cost classifications'
)
    THROW 51442, 'Apply migration 043 before migration 044.', 1;
GO

BEGIN TRANSACTION;
GO

/* ---------------------------------------------------------------------------
   Part 1 — extend the existing internal labor rate master.

   dbo.engineering_rates already carries level, department, the four hourly and
   daily rates, the effective window and the active flag. It is missing the
   fields an estimator would search on, the version chain that makes a rate
   change auditable, and the ERP category the line should default to.

   Every column here is nullable or defaulted, so existing rows stay valid and
   every existing read keeps returning what it returned before. Nothing about
   how dbo.manhour_lines.daily_rate is written or frozen changes.
   --------------------------------------------------------------------------- */

IF COL_LENGTH('dbo.engineering_rates', 'code') IS NULL
    ALTER TABLE dbo.engineering_rates ADD code nvarchar(40) NULL;

IF COL_LENGTH('dbo.engineering_rates', 'role_activity') IS NULL
    ALTER TABLE dbo.engineering_rates ADD role_activity nvarchar(150) NOT NULL
        CONSTRAINT DF_engineering_rates_role_activity DEFAULT N'';

IF COL_LENGTH('dbo.engineering_rates', 'default_erp_category') IS NULL
    ALTER TABLE dbo.engineering_rates ADD default_erp_category nvarchar(30) NULL;

IF COL_LENGTH('dbo.engineering_rates', 'version') IS NULL
    ALTER TABLE dbo.engineering_rates ADD version int NOT NULL
        CONSTRAINT DF_engineering_rates_version DEFAULT 1;

IF COL_LENGTH('dbo.engineering_rates', 'superseded_by_rate_id') IS NULL
    ALTER TABLE dbo.engineering_rates ADD superseded_by_rate_id bigint NULL;

IF COL_LENGTH('dbo.engineering_rates', 'superseded_at') IS NULL
    ALTER TABLE dbo.engineering_rates ADD superseded_at datetimeoffset(0) NULL;

IF COL_LENGTH('dbo.engineering_rates', 'notes') IS NULL
    ALTER TABLE dbo.engineering_rates ADD notes nvarchar(1000) NULL;

/* Historical rows were created before anyone could edit a rate, so they get no
   invented update stamp. Both columns stay NULL until the row is superseded or
   retired through the new endpoints. */
IF COL_LENGTH('dbo.engineering_rates', 'updated_by') IS NULL
    ALTER TABLE dbo.engineering_rates ADD updated_by bigint NULL;

IF COL_LENGTH('dbo.engineering_rates', 'updated_at') IS NULL
    ALTER TABLE dbo.engineering_rates ADD updated_at datetimeoffset(0) NULL;
GO

/* Constraints and indexes live in their own batch: SQL Server cannot reference a
   column that was added in the batch still being compiled. */

IF OBJECT_ID('dbo.CK_engineering_rates_erp_category', 'C') IS NULL
    ALTER TABLE dbo.engineering_rates ADD CONSTRAINT CK_engineering_rates_erp_category
        CHECK (default_erp_category IS NULL OR default_erp_category IN (
            N'Hardware', N'Software', N'Service', N'Installation', N'License', N'Maintenance', N'Training'
        ));

IF OBJECT_ID('dbo.CK_engineering_rates_version', 'C') IS NULL
    ALTER TABLE dbo.engineering_rates ADD CONSTRAINT CK_engineering_rates_version
        CHECK (version >= 1);

IF OBJECT_ID('dbo.CK_engineering_rates_supersede', 'C') IS NULL
    ALTER TABLE dbo.engineering_rates ADD CONSTRAINT CK_engineering_rates_supersede
        CHECK (
            (superseded_by_rate_id IS NULL AND superseded_at IS NULL)
            OR (superseded_by_rate_id IS NOT NULL AND superseded_at IS NOT NULL)
        );

IF OBJECT_ID('dbo.FK_engineering_rates_superseded_by', 'F') IS NULL
    ALTER TABLE dbo.engineering_rates ADD CONSTRAINT FK_engineering_rates_superseded_by
        FOREIGN KEY (superseded_by_rate_id) REFERENCES dbo.engineering_rates(id);

IF OBJECT_ID('dbo.FK_engineering_rates_updated_by', 'F') IS NULL
    ALTER TABLE dbo.engineering_rates ADD CONSTRAINT FK_engineering_rates_updated_by
        FOREIGN KEY (updated_by) REFERENCES dbo.users(id);

/* A code is optional, so uniqueness is filtered. This deliberately does not join
   the (level, department, effective_from) uniqueness that already exists: a code
   names the rate role, and a superseded chain shares neither. */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_engineering_rates_code' AND object_id = OBJECT_ID('dbo.engineering_rates'))
    CREATE UNIQUE INDEX UX_engineering_rates_code
        ON dbo.engineering_rates(code, effective_from)
        WHERE code IS NOT NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_engineering_rates_search' AND object_id = OBJECT_ID('dbo.engineering_rates'))
    CREATE INDEX IX_engineering_rates_search
        ON dbo.engineering_rates(department, level, effective_from)
        INCLUDE (code, role_activity, engineering_hourly, engineering_daily,
                 installation_hourly, installation_daily, effective_to, is_active,
                 default_erp_category, version);
GO

/* ---------------------------------------------------------------------------
   Part 2 — reusable labor work packages.

   dbo.module_templates is the same idea for material cost and cannot serve
   labor: its lines carry item code, brand, model, supplier and a per-module
   quantity, and its apply path writes dbo.cost_items. A labor line needs
   activity, engineer level, cost type, provider and an effort default, and its
   apply path writes dbo.manhour_lines. Lifecycle, status vocabulary, revision
   counter and soft-deleted lines are copied from module_templates on purpose,
   so both libraries behave the same way for the people using them.
   --------------------------------------------------------------------------- */

IF OBJECT_ID('dbo.labor_packages', 'U') IS NULL
CREATE TABLE dbo.labor_packages (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_labor_packages PRIMARY KEY,
    code nvarchar(40) NOT NULL,
    name nvarchar(200) NOT NULL,
    cost_type nvarchar(30) NOT NULL,
    department nvarchar(100) NOT NULL CONSTRAINT DF_labor_packages_department DEFAULT N'',
    project_type nvarchar(50) NOT NULL CONSTRAINT DF_labor_packages_project_type DEFAULT N'',
    description nvarchar(1000) NOT NULL CONSTRAINT DF_labor_packages_description DEFAULT N'',
    status nvarchar(20) NOT NULL CONSTRAINT DF_labor_packages_status DEFAULT N'Draft',
    revision int NOT NULL CONSTRAINT DF_labor_packages_revision DEFAULT 1,
    created_by bigint NOT NULL,
    updated_by bigint NOT NULL,
    created_at datetimeoffset(0) NOT NULL CONSTRAINT DF_labor_packages_created_at DEFAULT SYSUTCDATETIME(),
    updated_at datetimeoffset(0) NOT NULL CONSTRAINT DF_labor_packages_updated_at DEFAULT SYSUTCDATETIME(),
    retired_at datetimeoffset(0) NULL,
    row_version rowversion NOT NULL,
    CONSTRAINT UQ_labor_packages_code UNIQUE (code),
    CONSTRAINT CK_labor_packages_status CHECK (status IN (N'Draft', N'Active', N'Retired')),
    CONSTRAINT CK_labor_packages_cost_type CHECK (cost_type IN (N'Engineering', N'Installation')),
    CONSTRAINT CK_labor_packages_revision CHECK (revision >= 1),
    CONSTRAINT CK_labor_packages_retired CHECK (
        (status = N'Retired' AND retired_at IS NOT NULL) OR (status <> N'Retired' AND retired_at IS NULL)),
    CONSTRAINT FK_labor_packages_created_by FOREIGN KEY (created_by) REFERENCES dbo.users(id),
    CONSTRAINT FK_labor_packages_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.users(id)
);

/* One line carries everything dbo.manhour_lines needs except the money.

   rate_id is provenance only — which master row the author was looking at. The
   apply step always re-resolves the live effective rate, exactly as the
   hand-typed man-hour endpoint does, so a package can never inject a stale or
   invented price into an estimate.

   reference_daily_rate is what a Supplier line proposes and what an Internal
   line showed when the package was written. It is a display and supplier-quote
   value, never the authority for an internal line.

   rate_basis = N'Hourly' means the effort was authored in hours:
       man_days = round(default_hours / default_hours_per_day, 2)
   because dbo.manhour_lines.man_days is decimal(9,2) and cost is
   engineers * man_days * daily_rate. hours_per_day is reporting metadata, not a
   cost factor, so the conversion has to be done and stored explicitly. */
IF OBJECT_ID('dbo.labor_package_lines', 'U') IS NULL
CREATE TABLE dbo.labor_package_lines (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_labor_package_lines PRIMARY KEY,
    package_id bigint NOT NULL,
    sort_order int NOT NULL,
    activity nvarchar(300) NOT NULL,
    department nvarchar(100) NOT NULL,
    level nvarchar(100) NOT NULL,
    cost_type nvarchar(30) NOT NULL,
    provider nvarchar(30) NOT NULL CONSTRAINT DF_labor_package_lines_provider DEFAULT N'Internal',
    rate_id bigint NULL,
    rate_basis nvarchar(20) NOT NULL CONSTRAINT DF_labor_package_lines_rate_basis DEFAULT N'Daily',
    default_engineers decimal(9,2) NOT NULL CONSTRAINT DF_labor_package_lines_engineers DEFAULT 1,
    default_man_days decimal(9,2) NOT NULL CONSTRAINT DF_labor_package_lines_man_days DEFAULT 1,
    default_hours decimal(9,2) NULL,
    default_hours_per_day decimal(9,2) NOT NULL CONSTRAINT DF_labor_package_lines_hours_per_day DEFAULT 8,
    reference_daily_rate decimal(19,4) NOT NULL CONSTRAINT DF_labor_package_lines_reference_rate DEFAULT 0,
    default_erp_category nvarchar(30) NULL,
    remark nvarchar(max) NULL,
    created_at datetimeoffset(0) NOT NULL CONSTRAINT DF_labor_package_lines_created_at DEFAULT SYSUTCDATETIME(),
    deleted_at datetimeoffset(0) NULL,
    row_version rowversion NOT NULL,
    CONSTRAINT CK_labor_package_lines_sort CHECK (sort_order >= 0),
    CONSTRAINT CK_labor_package_lines_cost_type CHECK (cost_type IN (N'Engineering', N'Installation')),
    CONSTRAINT CK_labor_package_lines_provider CHECK (provider IN (N'Internal', N'Supplier')),
    CONSTRAINT CK_labor_package_lines_rate_basis CHECK (rate_basis IN (N'Daily', N'Hourly')),
    CONSTRAINT CK_labor_package_lines_effort CHECK (
        default_engineers > 0 AND default_engineers < 1000000
        AND default_man_days > 0 AND default_man_days < 1000000
        AND default_hours_per_day > 0 AND default_hours_per_day <= 24),
    CONSTRAINT CK_labor_package_lines_hours CHECK (
        (rate_basis = N'Hourly' AND default_hours IS NOT NULL AND default_hours > 0)
        OR (rate_basis = N'Daily' AND default_hours IS NULL)),
    CONSTRAINT CK_labor_package_lines_reference_rate CHECK (
        reference_daily_rate >= 0 AND reference_daily_rate < 1000000000),
    CONSTRAINT CK_labor_package_lines_supplier_rate CHECK (
        provider = N'Internal' OR reference_daily_rate > 0),
    CONSTRAINT CK_labor_package_lines_erp_category CHECK (
        default_erp_category IS NULL OR default_erp_category IN (
            N'Hardware', N'Software', N'Service', N'Installation', N'License', N'Maintenance', N'Training')),
    CONSTRAINT FK_labor_package_lines_package FOREIGN KEY (package_id) REFERENCES dbo.labor_packages(id),
    CONSTRAINT FK_labor_package_lines_rate FOREIGN KEY (rate_id) REFERENCES dbo.engineering_rates(id)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_labor_package_lines_package' AND object_id = OBJECT_ID('dbo.labor_package_lines'))
    CREATE INDEX IX_labor_package_lines_package
        ON dbo.labor_package_lines(package_id, sort_order)
        WHERE deleted_at IS NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_labor_packages_status' AND object_id = OBJECT_ID('dbo.labor_packages'))
    CREATE INDEX IX_labor_packages_status
        ON dbo.labor_packages(status, cost_type)
        INCLUDE (code, name, department);
GO

IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL
BEGIN
    GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.labor_packages TO [iot_team_app_role];
    GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.labor_package_lines TO [iot_team_app_role];
    DENY DELETE ON OBJECT::dbo.labor_packages TO [iot_team_app_role];
    DENY DELETE ON OBJECT::dbo.labor_package_lines TO [iot_team_app_role];
END;

INSERT INTO dbo.schema_versions(version, name)
VALUES(44, N'Reusable labor rate masters and estimate labor packages');

COMMIT TRANSACTION;
GO
