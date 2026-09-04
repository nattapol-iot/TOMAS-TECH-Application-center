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

IF OBJECT_ID(N'dbo.schema_versions', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.schema_versions (
        version int NOT NULL CONSTRAINT PK_schema_versions PRIMARY KEY,
        name nvarchar(200) NOT NULL,
        applied_at datetimeoffset(0) NOT NULL CONSTRAINT DF_schema_versions_applied_at DEFAULT SYSUTCDATETIME()
    );
END;
GO

IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 1)
    THROW 51000, 'Migration 001 has already been applied.', 1;
GO

BEGIN TRANSACTION;

CREATE TABLE dbo.document_sequences (
    document_type varchar(20) NOT NULL,
    period_key char(6) NOT NULL,
    last_number int NOT NULL,
    updated_at datetimeoffset(0) NOT NULL CONSTRAINT DF_document_sequences_updated_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_document_sequences PRIMARY KEY (document_type, period_key),
    CONSTRAINT CK_document_sequences_last_number CHECK (last_number > 0)
);

CREATE TABLE dbo.roles (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_roles PRIMARY KEY,
    code nvarchar(50) NOT NULL CONSTRAINT UQ_roles_code UNIQUE,
    name nvarchar(100) NOT NULL,
    description nvarchar(500) NOT NULL CONSTRAINT DF_roles_description DEFAULT N'',
    is_active bit NOT NULL CONSTRAINT DF_roles_is_active DEFAULT 1
);

CREATE TABLE dbo.permissions (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_permissions PRIMARY KEY,
    code nvarchar(100) NOT NULL CONSTRAINT UQ_permissions_code UNIQUE,
    description nvarchar(500) NOT NULL CONSTRAINT DF_permissions_description DEFAULT N''
);

CREATE TABLE dbo.role_permissions (
    role_id bigint NOT NULL,
    permission_id bigint NOT NULL,
    CONSTRAINT PK_role_permissions PRIMARY KEY (role_id, permission_id),
    CONSTRAINT FK_role_permissions_role FOREIGN KEY (role_id) REFERENCES dbo.roles(id),
    CONSTRAINT FK_role_permissions_permission FOREIGN KEY (permission_id) REFERENCES dbo.permissions(id)
);

CREATE TABLE dbo.users (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_users PRIMARY KEY,
    entra_object_id nvarchar(64) NOT NULL CONSTRAINT UQ_users_entra_object_id UNIQUE,
    email nvarchar(256) NOT NULL CONSTRAINT UQ_users_email UNIQUE,
    name nvarchar(200) NOT NULL,
    initials nvarchar(10) NOT NULL CONSTRAINT DF_users_initials DEFAULT N'',
    role_id bigint NOT NULL,
    department nvarchar(100) NOT NULL CONSTRAINT DF_users_department DEFAULT N'',
    level nvarchar(100) NOT NULL CONSTRAINT DF_users_level DEFAULT N'',
    is_active bit NOT NULL CONSTRAINT DF_users_is_active DEFAULT 1,
    created_at datetimeoffset(0) NOT NULL CONSTRAINT DF_users_created_at DEFAULT SYSUTCDATETIME(),
    updated_at datetimeoffset(0) NOT NULL CONSTRAINT DF_users_updated_at DEFAULT SYSUTCDATETIME(),
    deleted_at datetimeoffset(0) NULL,
    row_version rowversion NOT NULL,
    CONSTRAINT FK_users_role FOREIGN KEY (role_id) REFERENCES dbo.roles(id)
);

CREATE TABLE dbo.customers (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_customers PRIMARY KEY,
    code nvarchar(30) NOT NULL CONSTRAINT UQ_customers_code UNIQUE,
    name nvarchar(300) NOT NULL,
    contact nvarchar(200) NOT NULL CONSTRAINT DF_customers_contact DEFAULT N'',
    email nvarchar(256) NOT NULL CONSTRAINT DF_customers_email DEFAULT N'',
    phone nvarchar(100) NOT NULL CONSTRAINT DF_customers_phone DEFAULT N'',
    industry nvarchar(200) NOT NULL CONSTRAINT DF_customers_industry DEFAULT N'',
    site nvarchar(300) NOT NULL CONSTRAINT DF_customers_site DEFAULT N'',
    is_active bit NOT NULL CONSTRAINT DF_customers_is_active DEFAULT 1,
    created_by bigint NOT NULL,
    updated_by bigint NOT NULL,
    created_at datetimeoffset(0) NOT NULL CONSTRAINT DF_customers_created_at DEFAULT SYSUTCDATETIME(),
    updated_at datetimeoffset(0) NOT NULL CONSTRAINT DF_customers_updated_at DEFAULT SYSUTCDATETIME(),
    deleted_at datetimeoffset(0) NULL,
    row_version rowversion NOT NULL,
    CONSTRAINT FK_customers_created_by FOREIGN KEY (created_by) REFERENCES dbo.users(id),
    CONSTRAINT FK_customers_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.users(id)
);

CREATE TABLE dbo.suppliers (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_suppliers PRIMARY KEY,
    code nvarchar(30) NOT NULL CONSTRAINT UQ_suppliers_code UNIQUE,
    name nvarchar(300) NOT NULL,
    category nvarchar(100) NOT NULL CONSTRAINT DF_suppliers_category DEFAULT N'General',
    contact nvarchar(200) NOT NULL CONSTRAINT DF_suppliers_contact DEFAULT N'',
    email nvarchar(256) NOT NULL CONSTRAINT DF_suppliers_email DEFAULT N'',
    phone nvarchar(100) NOT NULL CONSTRAINT DF_suppliers_phone DEFAULT N'',
    brands_json nvarchar(max) NOT NULL CONSTRAINT DF_suppliers_brands DEFAULT N'[]',
    is_active bit NOT NULL CONSTRAINT DF_suppliers_is_active DEFAULT 1,
    created_by bigint NOT NULL,
    updated_by bigint NOT NULL,
    created_at datetimeoffset(0) NOT NULL CONSTRAINT DF_suppliers_created_at DEFAULT SYSUTCDATETIME(),
    updated_at datetimeoffset(0) NOT NULL CONSTRAINT DF_suppliers_updated_at DEFAULT SYSUTCDATETIME(),
    deleted_at datetimeoffset(0) NULL,
    row_version rowversion NOT NULL,
    CONSTRAINT CK_suppliers_brands_json CHECK (ISJSON(brands_json) = 1),
    CONSTRAINT FK_suppliers_created_by FOREIGN KEY (created_by) REFERENCES dbo.users(id),
    CONSTRAINT FK_suppliers_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.users(id)
);

CREATE TABLE dbo.engineering_rates (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_engineering_rates PRIMARY KEY,
    level nvarchar(100) NOT NULL,
    department nvarchar(100) NOT NULL,
    engineering_hourly decimal(19,4) NOT NULL,
    engineering_daily decimal(19,4) NOT NULL,
    installation_hourly decimal(19,4) NOT NULL,
    installation_daily decimal(19,4) NOT NULL,
    effective_from date NOT NULL,
    effective_to date NULL,
    is_active bit NOT NULL CONSTRAINT DF_engineering_rates_is_active DEFAULT 1,
    created_by bigint NOT NULL,
    created_at datetimeoffset(0) NOT NULL CONSTRAINT DF_engineering_rates_created_at DEFAULT SYSUTCDATETIME(),
    row_version rowversion NOT NULL,
    CONSTRAINT CK_engineering_rates_nonnegative CHECK (
        engineering_hourly >= 0 AND engineering_daily >= 0 AND installation_hourly >= 0 AND installation_daily >= 0),
    CONSTRAINT CK_engineering_rates_date_range CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CONSTRAINT FK_engineering_rates_created_by FOREIGN KEY (created_by) REFERENCES dbo.users(id)
);
CREATE UNIQUE INDEX UX_engineering_rates_active
    ON dbo.engineering_rates(level, department, effective_from)
    WHERE is_active = 1;
CREATE INDEX IX_engineering_rates_effective_range
    ON dbo.engineering_rates(level, department, effective_from, effective_to)
    WHERE is_active = 1;

CREATE TABLE dbo.inquiries (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_inquiries PRIMARY KEY,
    inquiry_no nvarchar(30) NOT NULL CONSTRAINT UQ_inquiries_no UNIQUE,
    inquiry_date date NOT NULL,
    customer_id bigint NOT NULL,
    contact nvarchar(200) NOT NULL CONSTRAINT DF_inquiries_contact DEFAULT N'',
    project_name nvarchar(300) NOT NULL,
    project_type nvarchar(100) NOT NULL,
    rfq_no nvarchar(100) NULL,
    sales_owner nvarchar(200) NULL,
    estimate_owner_id bigint NOT NULL,
    due_date date NOT NULL,
    priority nvarchar(30) NOT NULL,
    status nvarchar(50) NOT NULL,
    progress decimal(5,2) NOT NULL CONSTRAINT DF_inquiries_progress DEFAULT 0,
    revision int NOT NULL CONSTRAINT DF_inquiries_revision DEFAULT 0,
    requirement nvarchar(max) NULL,
    background nvarchar(max) NULL,
    scope_summary nvarchar(max) NULL,
    technical nvarchar(max) NULL,
    target_delivery date NULL,
    site_location nvarchar(300) NULL,
    standard nvarchar(max) NULL,
    special nvarchar(max) NULL,
    remark nvarchar(max) NULL,
    estimate_id bigint NULL,
    created_by bigint NOT NULL,
    updated_by bigint NOT NULL,
    created_at datetimeoffset(0) NOT NULL CONSTRAINT DF_inquiries_created_at DEFAULT SYSUTCDATETIME(),
    updated_at datetimeoffset(0) NOT NULL CONSTRAINT DF_inquiries_updated_at DEFAULT SYSUTCDATETIME(),
    deleted_at datetimeoffset(0) NULL,
    row_version rowversion NOT NULL,
    CONSTRAINT CK_inquiries_progress CHECK (progress BETWEEN 0 AND 100),
    CONSTRAINT CK_inquiries_priority CHECK (priority IN (N'Low', N'Normal', N'High', N'Urgent')),
    CONSTRAINT CK_inquiries_status CHECK (status IN (N'New', N'Estimating', N'Waiting Supplier Price', N'Estimate Completed', N'Engineering Review', N'Approved', N'Cancelled')),
    CONSTRAINT FK_inquiries_customer FOREIGN KEY (customer_id) REFERENCES dbo.customers(id),
    CONSTRAINT FK_inquiries_owner FOREIGN KEY (estimate_owner_id) REFERENCES dbo.users(id),
    CONSTRAINT FK_inquiries_created_by FOREIGN KEY (created_by) REFERENCES dbo.users(id),
    CONSTRAINT FK_inquiries_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.users(id)
);
CREATE INDEX IX_inquiries_status_due ON dbo.inquiries(status, due_date) INCLUDE (customer_id, estimate_owner_id) WHERE deleted_at IS NULL;

CREATE TABLE dbo.estimates (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_estimates PRIMARY KEY,
    estimate_no nvarchar(30) NOT NULL CONSTRAINT UQ_estimates_no UNIQUE,
    inquiry_id bigint NOT NULL CONSTRAINT UQ_estimates_inquiry UNIQUE,
    customer_id bigint NOT NULL,
    project_name nvarchar(300) NOT NULL,
    project_type nvarchar(100) NOT NULL,
    owner_id bigint NOT NULL,
    revision int NOT NULL CONSTRAINT DF_estimates_revision DEFAULT 0,
    created_date date NOT NULL,
    due_date date NOT NULL,
    status nvarchar(50) NOT NULL,
    progress decimal(5,2) NOT NULL CONSTRAINT DF_estimates_progress DEFAULT 0,
    contingency_rate decimal(9,4) NOT NULL CONSTRAINT DF_estimates_contingency DEFAULT 0,
    locked_at datetimeoffset(0) NULL,
    locked_by bigint NULL,
    created_by bigint NOT NULL,
    updated_by bigint NOT NULL,
    created_at datetimeoffset(0) NOT NULL CONSTRAINT DF_estimates_created_at DEFAULT SYSUTCDATETIME(),
    updated_at datetimeoffset(0) NOT NULL CONSTRAINT DF_estimates_updated_at DEFAULT SYSUTCDATETIME(),
    deleted_at datetimeoffset(0) NULL,
    row_version rowversion NOT NULL,
    CONSTRAINT CK_estimates_progress CHECK (progress BETWEEN 0 AND 100),
    CONSTRAINT CK_estimates_contingency CHECK (contingency_rate BETWEEN 0 AND 100),
    CONSTRAINT CK_estimates_status CHECK (status IN (N'Draft', N'Engineering Input', N'Waiting Supplier Price', N'Estimate Completed', N'Engineering Review', N'Revision Required', N'Approved', N'Locked')),
    CONSTRAINT FK_estimates_inquiry FOREIGN KEY (inquiry_id) REFERENCES dbo.inquiries(id),
    CONSTRAINT FK_estimates_customer FOREIGN KEY (customer_id) REFERENCES dbo.customers(id),
    CONSTRAINT FK_estimates_owner FOREIGN KEY (owner_id) REFERENCES dbo.users(id),
    CONSTRAINT FK_estimates_locked_by FOREIGN KEY (locked_by) REFERENCES dbo.users(id),
    CONSTRAINT FK_estimates_created_by FOREIGN KEY (created_by) REFERENCES dbo.users(id),
    CONSTRAINT FK_estimates_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.users(id)
);
ALTER TABLE dbo.inquiries ADD CONSTRAINT FK_inquiries_estimate FOREIGN KEY (estimate_id) REFERENCES dbo.estimates(id);
CREATE INDEX IX_estimates_status_due ON dbo.estimates(status, due_date) INCLUDE (customer_id, owner_id) WHERE deleted_at IS NULL;

CREATE TABLE dbo.estimate_revisions (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_estimate_revisions PRIMARY KEY,
    estimate_id bigint NOT NULL,
    revision int NOT NULL,
    code AS (N'R' + RIGHT(N'00' + CONVERT(nvarchar(10), revision), 2)) PERSISTED,
    reason nvarchar(100) NOT NULL,
    description nvarchar(max) NOT NULL,
    created_by bigint NOT NULL,
    created_at datetimeoffset(0) NOT NULL CONSTRAINT DF_estimate_revisions_created_at DEFAULT SYSUTCDATETIME(),
    reviewed_by bigint NULL,
    reviewed_at datetimeoffset(0) NULL,
    status nvarchar(50) NOT NULL,
    total decimal(19,4) NOT NULL CONSTRAINT DF_estimate_revisions_total DEFAULT 0,
    CONSTRAINT UQ_estimate_revisions UNIQUE (estimate_id, revision),
    CONSTRAINT FK_estimate_revisions_estimate FOREIGN KEY (estimate_id) REFERENCES dbo.estimates(id),
    CONSTRAINT FK_estimate_revisions_created_by FOREIGN KEY (created_by) REFERENCES dbo.users(id),
    CONSTRAINT FK_estimate_revisions_reviewed_by FOREIGN KEY (reviewed_by) REFERENCES dbo.users(id)
);

CREATE TABLE dbo.estimate_assignments (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_estimate_assignments PRIMARY KEY,
    estimate_id bigint NOT NULL,
    section nvarchar(100) NOT NULL,
    owner_id bigint NOT NULL,
    support_id bigint NULL,
    due_date date NOT NULL,
    status nvarchar(50) NOT NULL,
    progress decimal(5,2) NOT NULL CONSTRAINT DF_estimate_assignments_progress DEFAULT 0,
    comment nvarchar(max) NULL,
    row_version rowversion NOT NULL,
    CONSTRAINT UQ_estimate_assignments UNIQUE (estimate_id, section),
    CONSTRAINT FK_estimate_assignments_estimate FOREIGN KEY (estimate_id) REFERENCES dbo.estimates(id),
    CONSTRAINT FK_estimate_assignments_owner FOREIGN KEY (owner_id) REFERENCES dbo.users(id),
    CONSTRAINT FK_estimate_assignments_support FOREIGN KEY (support_id) REFERENCES dbo.users(id)
);

CREATE TABLE dbo.cost_items (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_cost_items PRIMARY KEY,
    estimate_id bigint NOT NULL,
    revision int NOT NULL,
    category_code char(2) NOT NULL,
    category nvarchar(100) NOT NULL,
    subcategory nvarchar(100) NOT NULL CONSTRAINT DF_cost_items_subcategory DEFAULT N'',
    module nvarchar(200) NOT NULL,
    item_code nvarchar(100) NOT NULL,
    description nvarchar(500) NOT NULL,
    brand nvarchar(100) NOT NULL CONSTRAINT DF_cost_items_brand DEFAULT N'',
    model nvarchar(200) NOT NULL CONSTRAINT DF_cost_items_model DEFAULT N'',
    specification nvarchar(max) NULL,
    supplier_id bigint NULL,
    qty decimal(19,4) NOT NULL,
    unit nvarchar(50) NOT NULL,
    unit_cost decimal(19,4) NOT NULL,
    price_source nvarchar(100) NOT NULL,
    reference_no nvarchar(200) NULL,
    reference_project nvarchar(200) NULL,
    price_date date NULL,
    remark nvarchar(max) NULL,
    owner_id bigint NOT NULL,
    status nvarchar(50) NOT NULL,
    created_by bigint NOT NULL,
    updated_by bigint NOT NULL,
    created_at datetimeoffset(0) NOT NULL CONSTRAINT DF_cost_items_created_at DEFAULT SYSUTCDATETIME(),
    updated_at datetimeoffset(0) NOT NULL CONSTRAINT DF_cost_items_updated_at DEFAULT SYSUTCDATETIME(),
    deleted_at datetimeoffset(0) NULL,
    row_version rowversion NOT NULL,
    line_total AS (CONVERT(decimal(19,4), qty * unit_cost)) PERSISTED,
    CONSTRAINT CK_cost_items_qty CHECK (qty > 0),
    CONSTRAINT CK_cost_items_cost CHECK (unit_cost >= 0),
    CONSTRAINT CK_cost_items_category_code CHECK (category_code IN ('01','02','03','04','05','06','07','08','09','10')),
    CONSTRAINT FK_cost_items_estimate FOREIGN KEY (estimate_id) REFERENCES dbo.estimates(id),
    CONSTRAINT FK_cost_items_supplier FOREIGN KEY (supplier_id) REFERENCES dbo.suppliers(id),
    CONSTRAINT FK_cost_items_owner FOREIGN KEY (owner_id) REFERENCES dbo.users(id),
    CONSTRAINT FK_cost_items_created_by FOREIGN KEY (created_by) REFERENCES dbo.users(id),
    CONSTRAINT FK_cost_items_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.users(id)
);
CREATE UNIQUE INDEX UX_cost_items_code ON dbo.cost_items(estimate_id, revision, item_code) WHERE deleted_at IS NULL;
CREATE INDEX IX_cost_items_estimate_revision
    ON dbo.cost_items(estimate_id, revision, deleted_at)
    INCLUDE (category_code, line_total, status, supplier_id, owner_id);
CREATE INDEX IX_cost_items_supplier
    ON dbo.cost_items(supplier_id)
    INCLUDE (estimate_id, revision, deleted_at)
    WHERE supplier_id IS NOT NULL;
CREATE INDEX IX_cost_items_owner
    ON dbo.cost_items(owner_id)
    INCLUDE (estimate_id, revision, deleted_at);

CREATE TABLE dbo.manhour_lines (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_manhour_lines PRIMARY KEY,
    estimate_id bigint NOT NULL,
    revision int NOT NULL,
    package nvarchar(200) NOT NULL,
    activity nvarchar(300) NOT NULL,
    department nvarchar(100) NOT NULL,
    level nvarchar(100) NOT NULL,
    cost_type nvarchar(30) NOT NULL,
    provider nvarchar(30) NOT NULL,
    supplier_id bigint NULL,
    quotation_no nvarchar(100) NULL,
    price_date date NULL,
    engineers decimal(9,2) NOT NULL,
    man_days decimal(9,2) NOT NULL,
    hours_per_day decimal(9,2) NOT NULL,
    daily_rate decimal(19,4) NOT NULL,
    owner_id bigint NOT NULL,
    remark nvarchar(max) NULL,
    created_by bigint NOT NULL,
    updated_by bigint NOT NULL,
    created_at datetimeoffset(0) NOT NULL CONSTRAINT DF_manhour_lines_created_at DEFAULT SYSUTCDATETIME(),
    updated_at datetimeoffset(0) NOT NULL CONSTRAINT DF_manhour_lines_updated_at DEFAULT SYSUTCDATETIME(),
    deleted_at datetimeoffset(0) NULL,
    row_version rowversion NOT NULL,
    line_cost AS (CONVERT(decimal(19,4), engineers * man_days * daily_rate)) PERSISTED,
    CONSTRAINT CK_manhour_lines_values CHECK (engineers > 0 AND man_days > 0 AND hours_per_day > 0 AND daily_rate >= 0),
    CONSTRAINT CK_manhour_lines_cost_type CHECK (cost_type IN (N'Engineering', N'Installation')),
    CONSTRAINT CK_manhour_lines_provider CHECK (provider IN (N'Internal', N'Supplier')),
    CONSTRAINT CK_manhour_lines_supplier CHECK (provider = N'Internal' OR (supplier_id IS NOT NULL AND quotation_no IS NOT NULL)),
    CONSTRAINT FK_manhour_lines_estimate FOREIGN KEY (estimate_id) REFERENCES dbo.estimates(id),
    CONSTRAINT FK_manhour_lines_supplier FOREIGN KEY (supplier_id) REFERENCES dbo.suppliers(id),
    CONSTRAINT FK_manhour_lines_owner FOREIGN KEY (owner_id) REFERENCES dbo.users(id),
    CONSTRAINT FK_manhour_lines_created_by FOREIGN KEY (created_by) REFERENCES dbo.users(id),
    CONSTRAINT FK_manhour_lines_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.users(id)
);
CREATE INDEX IX_manhour_lines_estimate_revision
    ON dbo.manhour_lines(estimate_id, revision, deleted_at)
    INCLUDE (cost_type, provider, line_cost, supplier_id, owner_id);
CREATE INDEX IX_manhour_lines_supplier
    ON dbo.manhour_lines(supplier_id)
    INCLUDE (estimate_id, revision, deleted_at)
    WHERE supplier_id IS NOT NULL;
CREATE INDEX IX_manhour_lines_owner
    ON dbo.manhour_lines(owner_id)
    INCLUDE (estimate_id, revision, deleted_at);

CREATE TABLE dbo.expense_lines (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_expense_lines PRIMARY KEY,
    estimate_id bigint NOT NULL,
    revision int NOT NULL,
    package nvarchar(200) NOT NULL,
    expense_type nvarchar(100) NOT NULL,
    description nvarchar(500) NOT NULL,
    cost_type nvarchar(30) NOT NULL,
    supplier_id bigint NULL,
    reference_no nvarchar(200) NULL,
    qty decimal(19,4) NOT NULL,
    unit nvarchar(50) NOT NULL,
    unit_cost decimal(19,4) NOT NULL,
    owner_id bigint NOT NULL,
    remark nvarchar(max) NULL,
    created_by bigint NOT NULL,
    updated_by bigint NOT NULL,
    created_at datetimeoffset(0) NOT NULL CONSTRAINT DF_expense_lines_created_at DEFAULT SYSUTCDATETIME(),
    updated_at datetimeoffset(0) NOT NULL CONSTRAINT DF_expense_lines_updated_at DEFAULT SYSUTCDATETIME(),
    deleted_at datetimeoffset(0) NULL,
    row_version rowversion NOT NULL,
    line_total AS (CONVERT(decimal(19,4), qty * unit_cost)) PERSISTED,
    CONSTRAINT CK_expense_lines_values CHECK (qty > 0 AND unit_cost >= 0),
    CONSTRAINT FK_expense_lines_estimate FOREIGN KEY (estimate_id) REFERENCES dbo.estimates(id),
    CONSTRAINT FK_expense_lines_supplier FOREIGN KEY (supplier_id) REFERENCES dbo.suppliers(id),
    CONSTRAINT FK_expense_lines_owner FOREIGN KEY (owner_id) REFERENCES dbo.users(id),
    CONSTRAINT FK_expense_lines_created_by FOREIGN KEY (created_by) REFERENCES dbo.users(id),
    CONSTRAINT FK_expense_lines_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.users(id)
);
CREATE INDEX IX_expense_lines_estimate_revision
    ON dbo.expense_lines(estimate_id, revision, deleted_at)
    INCLUDE (expense_type, line_total, supplier_id, owner_id);
CREATE INDEX IX_expense_lines_supplier
    ON dbo.expense_lines(supplier_id)
    INCLUDE (estimate_id, revision, deleted_at)
    WHERE supplier_id IS NOT NULL;
CREATE INDEX IX_expense_lines_owner
    ON dbo.expense_lines(owner_id)
    INCLUDE (estimate_id, revision, deleted_at);

CREATE TABLE dbo.other_cost_lines (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_other_cost_lines PRIMARY KEY,
    estimate_id bigint NOT NULL,
    revision int NOT NULL,
    category nvarchar(100) NOT NULL,
    description nvarchar(500) NOT NULL,
    qty decimal(19,4) NOT NULL,
    unit nvarchar(50) NOT NULL,
    unit_cost decimal(19,4) NOT NULL,
    remark nvarchar(max) NULL,
    created_by bigint NOT NULL,
    updated_by bigint NOT NULL,
    deleted_at datetimeoffset(0) NULL,
    row_version rowversion NOT NULL,
    line_total AS (CONVERT(decimal(19,4), qty * unit_cost)) PERSISTED,
    CONSTRAINT CK_other_cost_lines_values CHECK (qty > 0 AND unit_cost >= 0),
    CONSTRAINT CK_other_cost_lines_category CHECK (category IN (N'Outsource', N'Transportation', N'Accommodation', N'Other Cost')),
    CONSTRAINT FK_other_cost_lines_estimate FOREIGN KEY (estimate_id) REFERENCES dbo.estimates(id),
    CONSTRAINT FK_other_cost_lines_created_by FOREIGN KEY (created_by) REFERENCES dbo.users(id),
    CONSTRAINT FK_other_cost_lines_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.users(id)
);
CREATE INDEX IX_other_cost_lines_estimate_revision
    ON dbo.other_cost_lines(estimate_id, revision, deleted_at)
    INCLUDE (category, line_total);

CREATE TABLE dbo.projects (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_projects PRIMARY KEY,
    project_no nvarchar(30) NOT NULL CONSTRAINT UQ_projects_no UNIQUE,
    name nvarchar(300) NOT NULL,
    customer_id bigint NOT NULL,
    project_type nvarchar(100) NOT NULL,
    status nvarchar(50) NOT NULL,
    manager_id bigint NOT NULL,
    lead_engineer_id bigint NOT NULL,
    inquiry_id bigint NOT NULL,
    estimate_id bigint NOT NULL CONSTRAINT UQ_projects_estimate UNIQUE,
    po_no nvarchar(100) NOT NULL,
    po_date date NOT NULL,
    start_date date NOT NULL,
    target_delivery date NOT NULL,
    actual_delivery date NULL,
    progress decimal(5,2) NOT NULL CONSTRAINT DF_projects_progress DEFAULT 0,
    site nvarchar(300) NOT NULL CONSTRAINT DF_projects_site DEFAULT N'',
    remark nvarchar(max) NULL,
    folder_path nvarchar(1000) NOT NULL,
    created_by bigint NOT NULL,
    updated_by bigint NOT NULL,
    created_at datetimeoffset(0) NOT NULL CONSTRAINT DF_projects_created_at DEFAULT SYSUTCDATETIME(),
    updated_at datetimeoffset(0) NOT NULL CONSTRAINT DF_projects_updated_at DEFAULT SYSUTCDATETIME(),
    deleted_at datetimeoffset(0) NULL,
    row_version rowversion NOT NULL,
    CONSTRAINT CK_projects_status CHECK (status IN (N'Planning', N'Design', N'Development', N'Installation', N'Commissioning', N'Handover', N'Closed', N'On Hold')),
    CONSTRAINT CK_projects_progress CHECK (progress BETWEEN 0 AND 100),
    CONSTRAINT FK_projects_customer FOREIGN KEY (customer_id) REFERENCES dbo.customers(id),
    CONSTRAINT FK_projects_manager FOREIGN KEY (manager_id) REFERENCES dbo.users(id),
    CONSTRAINT FK_projects_lead FOREIGN KEY (lead_engineer_id) REFERENCES dbo.users(id),
    CONSTRAINT FK_projects_inquiry FOREIGN KEY (inquiry_id) REFERENCES dbo.inquiries(id),
    CONSTRAINT FK_projects_estimate FOREIGN KEY (estimate_id) REFERENCES dbo.estimates(id),
    CONSTRAINT FK_projects_created_by FOREIGN KEY (created_by) REFERENCES dbo.users(id),
    CONSTRAINT FK_projects_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.users(id)
);
CREATE INDEX IX_projects_status_delivery ON dbo.projects(status, target_delivery) INCLUDE (customer_id, manager_id) WHERE deleted_at IS NULL;

CREATE TABLE dbo.project_members (
    project_id bigint NOT NULL,
    user_id bigint NOT NULL,
    role_on_project nvarchar(100) NOT NULL,
    created_by bigint NOT NULL,
    created_at datetimeoffset(0) NOT NULL CONSTRAINT DF_project_members_created_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_project_members PRIMARY KEY (project_id, user_id),
    CONSTRAINT FK_project_members_project FOREIGN KEY (project_id) REFERENCES dbo.projects(id),
    CONSTRAINT FK_project_members_user FOREIGN KEY (user_id) REFERENCES dbo.users(id),
    CONSTRAINT FK_project_members_created_by FOREIGN KEY (created_by) REFERENCES dbo.users(id)
);

CREATE TABLE dbo.project_folders (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_project_folders PRIMARY KEY,
    project_id bigint NOT NULL,
    folder_code char(2) NOT NULL,
    name nvarchar(200) NOT NULL,
    storage_key nvarchar(1000) NOT NULL CONSTRAINT DF_project_folders_storage_key DEFAULT N'',
    created_by bigint NOT NULL,
    created_at datetimeoffset(0) NOT NULL CONSTRAINT DF_project_folders_created_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_project_folders UNIQUE (project_id, folder_code),
    CONSTRAINT FK_project_folders_project FOREIGN KEY (project_id) REFERENCES dbo.projects(id),
    CONSTRAINT FK_project_folders_created_by FOREIGN KEY (created_by) REFERENCES dbo.users(id)
);

CREATE TABLE dbo.audit_log (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_audit_log PRIMARY KEY,
    actor_id bigint NOT NULL,
    entity_type nvarchar(50) NOT NULL,
    entity_id bigint NOT NULL,
    entity_no nvarchar(50) NOT NULL CONSTRAINT DF_audit_log_entity_no DEFAULT N'',
    action nvarchar(100) NOT NULL,
    before_json nvarchar(max) NULL,
    after_json nvarchar(max) NULL,
    reason nvarchar(max) NULL,
    correlation_id uniqueidentifier NOT NULL CONSTRAINT DF_audit_log_correlation DEFAULT NEWID(),
    occurred_at datetimeoffset(0) NOT NULL CONSTRAINT DF_audit_log_occurred_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_audit_log_before_json CHECK (before_json IS NULL OR ISJSON(before_json) = 1),
    CONSTRAINT CK_audit_log_after_json CHECK (after_json IS NULL OR ISJSON(after_json) = 1),
    CONSTRAINT FK_audit_log_actor FOREIGN KEY (actor_id) REFERENCES dbo.users(id)
);
CREATE INDEX IX_audit_log_entity ON dbo.audit_log(entity_type, entity_id, occurred_at DESC);
CREATE INDEX IX_audit_log_actor ON dbo.audit_log(actor_id, occurred_at DESC);
GO

CREATE OR ALTER PROCEDURE dbo.issue_document_number
    @document_type varchar(20),
    @issue_date date,
    @document_number nvarchar(30) OUTPUT
AS
BEGIN
    SET XACT_ABORT ON;
    SET NOCOUNT ON;

    IF @issue_date IS NULL
        THROW 51010, 'Issue date is required.', 1;

    SET @document_type = UPPER(LTRIM(RTRIM(@document_type)));
    IF @document_type IS NULL OR @document_type = ''
        THROW 51011, 'Document type is required.', 1;

    DECLARE @initial_trancount int = @@TRANCOUNT;
    DECLARE @started_transaction bit = 0;
    DECLARE @savepoint_created bit = 0;
    DECLARE @period_key char(6) = CONVERT(char(6), @issue_date, 112);
    DECLARE @next int;

    BEGIN TRY
        IF @initial_trancount = 0
        BEGIN
            SET @started_transaction = 1;
            BEGIN TRANSACTION;
        END
        ELSE
        BEGIN
            SAVE TRANSACTION issue_document_number_savepoint;
            SET @savepoint_created = 1;
        END;

        UPDATE dbo.document_sequences WITH (UPDLOCK, HOLDLOCK)
           SET @next = last_number = last_number + 1,
               updated_at = SYSUTCDATETIME()
         WHERE document_type = @document_type AND period_key = @period_key;

        IF @@ROWCOUNT = 0
        BEGIN
            SET @next = 1;
            INSERT INTO dbo.document_sequences(document_type, period_key, last_number)
            VALUES (@document_type, @period_key, @next);
        END;

        IF @next > 9999
            THROW 51012, 'Monthly document sequence has exceeded 9999.', 1;

        DECLARE @yy char(2) = RIGHT(CONVERT(char(4), YEAR(@issue_date)), 2);
        DECLARE @mm char(2) = RIGHT(N'0' + CONVERT(varchar(2), MONTH(@issue_date)), 2);

        -- Every sequence is monthly, so the rendered number must include the month.
        -- In particular this prevents PJ numbers from colliding when a new month starts.
        SET @document_number = CONVERT(nvarchar(20), @document_type) + N'-' + @yy + @mm + N'-' + RIGHT(N'0000' + CONVERT(nvarchar(10), @next), 4);

        IF @started_transaction = 1
            COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @started_transaction = 1 AND XACT_STATE() <> 0
            ROLLBACK TRANSACTION;
        ELSE IF @savepoint_created = 1 AND XACT_STATE() = 1
            ROLLBACK TRANSACTION issue_document_number_savepoint;

        THROW;
    END CATCH;
END;
GO

CREATE OR ALTER VIEW dbo.v_estimate_totals
AS
WITH material AS (
    SELECT estimate_id, revision,
           SUM(CASE WHEN category_code IN ('01','02','03','04','05') THEN line_total ELSE 0 END) AS material_total,
           SUM(CASE WHEN category_code = '07' THEN line_total ELSE 0 END) AS outsource_total,
           SUM(CASE WHEN category_code = '08' THEN line_total ELSE 0 END) AS transportation_total,
           SUM(CASE WHEN category_code = '09' THEN line_total ELSE 0 END) AS accommodation_total,
           SUM(CASE WHEN category_code IN ('06','10') THEN line_total ELSE 0 END) AS other_total
    FROM dbo.cost_items WHERE deleted_at IS NULL GROUP BY estimate_id, revision
), effort AS (
    SELECT estimate_id, revision,
           SUM(line_cost) AS engineering_total
    FROM dbo.manhour_lines WHERE deleted_at IS NULL GROUP BY estimate_id, revision
), expense AS (
    SELECT estimate_id, revision,
           SUM(line_total) AS expense_total,
           SUM(CASE WHEN expense_type IN (N'Travel', N'Transportation') THEN line_total ELSE 0 END) AS transportation_expense,
           SUM(CASE WHEN expense_type IN (N'Accommodation', N'Per Diem') THEN line_total ELSE 0 END) AS accommodation_expense,
           SUM(CASE WHEN expense_type NOT IN (N'Travel', N'Transportation', N'Accommodation', N'Per Diem') THEN line_total ELSE 0 END) AS other_expense
    FROM dbo.expense_lines WHERE deleted_at IS NULL GROUP BY estimate_id, revision
), other_cost AS (
    SELECT estimate_id, revision,
           SUM(CASE WHEN category = N'Outsource' THEN line_total ELSE 0 END) AS outsource_total,
           SUM(CASE WHEN category = N'Transportation' THEN line_total ELSE 0 END) AS transportation_total,
           SUM(CASE WHEN category = N'Accommodation' THEN line_total ELSE 0 END) AS accommodation_total,
           SUM(CASE WHEN category NOT IN (N'Outsource', N'Transportation', N'Accommodation') THEN line_total ELSE 0 END) AS other_total
    FROM dbo.other_cost_lines WHERE deleted_at IS NULL GROUP BY estimate_id, revision
), base AS (
    SELECT e.id AS estimate_id,
           COALESCE(m.material_total, 0) AS material_total,
           COALESCE(f.engineering_total, 0) AS engineering_total,
           COALESCE(m.outsource_total, 0) + COALESCE(o.outsource_total, 0) AS outsource_total,
           COALESCE(m.transportation_total, 0) + COALESCE(x.transportation_expense, 0) + COALESCE(o.transportation_total, 0) AS transportation_total,
           COALESCE(m.accommodation_total, 0) + COALESCE(x.accommodation_expense, 0) + COALESCE(o.accommodation_total, 0) AS accommodation_total,
           COALESCE(m.other_total, 0) + COALESCE(x.other_expense, 0) + COALESCE(o.other_total, 0) AS other_total,
           e.contingency_rate
    FROM dbo.estimates e
    LEFT JOIN material m ON m.estimate_id = e.id AND m.revision = e.revision
    LEFT JOIN effort f ON f.estimate_id = e.id AND f.revision = e.revision
    LEFT JOIN expense x ON x.estimate_id = e.id AND x.revision = e.revision
    LEFT JOIN other_cost o ON o.estimate_id = e.id AND o.revision = e.revision
    WHERE e.deleted_at IS NULL
)
SELECT estimate_id, material_total, engineering_total, outsource_total, transportation_total, accommodation_total, other_total,
       CONVERT(decimal(19,4), material_total + engineering_total + outsource_total + transportation_total + accommodation_total + other_total) AS base_total,
       CONVERT(decimal(19,4), ROUND((material_total + engineering_total + outsource_total + transportation_total + accommodation_total + other_total) * contingency_rate / 100.0, 0)) AS contingency_total,
       CONVERT(decimal(19,4), (material_total + engineering_total + outsource_total + transportation_total + accommodation_total + other_total)
           + ROUND((material_total + engineering_total + outsource_total + transportation_total + accommodation_total + other_total) * contingency_rate / 100.0, 0)) AS total
FROM base;
GO

CREATE OR ALTER FUNCTION dbo.fn_estimate_validation(@estimate_id bigint)
RETURNS TABLE
AS
RETURN
(
    SELECT N'invalid_quantity' AS code, N'Quantity must be greater than zero.' AS message, N'CostItem' AS entity_type, l.id AS entity_id
      FROM dbo.cost_items l
      INNER JOIN dbo.estimates e ON e.id = l.estimate_id AND e.revision = l.revision
     WHERE e.id = @estimate_id AND e.deleted_at IS NULL AND l.deleted_at IS NULL AND l.qty <= 0
    UNION ALL
    SELECT N'missing_unit_cost', N'Unit cost is required.', N'CostItem', l.id
      FROM dbo.cost_items l
      INNER JOIN dbo.estimates e ON e.id = l.estimate_id AND e.revision = l.revision
     WHERE e.id = @estimate_id AND e.deleted_at IS NULL AND l.deleted_at IS NULL AND l.unit_cost <= 0
    UNION ALL
    SELECT N'missing_owner', N'Owner is required.', N'CostItem', l.id
      FROM dbo.cost_items l
      INNER JOIN dbo.estimates e ON e.id = l.estimate_id AND e.revision = l.revision
     WHERE e.id = @estimate_id AND e.deleted_at IS NULL AND l.deleted_at IS NULL AND l.owner_id IS NULL
    UNION ALL
    SELECT N'supplier_quote_required', N'Supplier man-hour requires a supplier and quotation number.', N'ManhourLine', l.id
      FROM dbo.manhour_lines l
      INNER JOIN dbo.estimates e ON e.id = l.estimate_id AND e.revision = l.revision
     WHERE e.id = @estimate_id AND e.deleted_at IS NULL AND l.deleted_at IS NULL
       AND l.provider = N'Supplier' AND (l.supplier_id IS NULL OR l.quotation_no IS NULL)
    UNION ALL
    SELECT N'empty_estimate', N'At least one cost or effort line is required.', N'Estimate', @estimate_id
      FROM dbo.estimates e
     WHERE e.id = @estimate_id AND e.deleted_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM dbo.cost_items l WHERE l.estimate_id = e.id AND l.revision = e.revision AND l.deleted_at IS NULL)
       AND NOT EXISTS (SELECT 1 FROM dbo.manhour_lines l WHERE l.estimate_id = e.id AND l.revision = e.revision AND l.deleted_at IS NULL)
       AND NOT EXISTS (SELECT 1 FROM dbo.expense_lines l WHERE l.estimate_id = e.id AND l.revision = e.revision AND l.deleted_at IS NULL)
       AND NOT EXISTS (SELECT 1 FROM dbo.other_cost_lines l WHERE l.estimate_id = e.id AND l.revision = e.revision AND l.deleted_at IS NULL)
);
GO

CREATE OR ALTER TRIGGER dbo.tr_engineering_rates_no_overlap
ON dbo.engineering_rates
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    -- HOLDLOCK gives this overlap check serializable range semantics. The
    -- supporting filtered index keeps the protected range narrow in practice.
    IF EXISTS (
        SELECT 1
          FROM inserted i
          INNER JOIN dbo.engineering_rates r WITH (UPDLOCK, HOLDLOCK, INDEX(IX_engineering_rates_effective_range))
             ON r.id <> i.id
            AND r.is_active = 1
            AND r.level = i.level
            AND r.department = i.department
            AND r.effective_from <= ISNULL(i.effective_to, CONVERT(date, '99991231', 112))
            AND i.effective_from <= ISNULL(r.effective_to, CONVERT(date, '99991231', 112))
         WHERE i.is_active = 1
    )
    BEGIN
        THROW 51020, 'Active engineering rate periods for the same level and department cannot overlap.', 1;
    END;
END;
GO

BEGIN TRY
    IF XACT_STATE() <> 1
        THROW 51021, 'Migration 001 cannot be completed because its transaction is not committable.', 1;

    -- Record the version only after every required procedure, view, function,
    -- trigger and supporting table/index has been created successfully.
    INSERT INTO dbo.schema_versions(version, name)
    VALUES (1, N'Core identity, inquiry, estimate and project schema');

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;

    THROW;
END CATCH;
GO
