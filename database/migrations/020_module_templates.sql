:on error exit
SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET ARITHABORT ON;
SET NUMERIC_ROUNDABORT OFF;
IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version=20) RETURN;
IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version=19)
    THROW 51200, 'Migration 019 is required.', 1;
BEGIN TRANSACTION;

-- A reusable group of equipment that an engineer can drop into an estimate.
-- dbo.boms cannot serve this: it requires a project_id and an estimate_id, so it
-- describes the bill for work already won, not a library entry.
CREATE TABLE dbo.module_templates (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_module_templates PRIMARY KEY,
    code nvarchar(40) NOT NULL,
    name nvarchar(200) NOT NULL,
    category_code char(2) NOT NULL,
    project_type nvarchar(50) NOT NULL CONSTRAINT DF_module_templates_project_type DEFAULT N'',
    description nvarchar(1000) NOT NULL CONSTRAINT DF_module_templates_description DEFAULT N'',
    status nvarchar(20) NOT NULL CONSTRAINT DF_module_templates_status DEFAULT N'Active',
    revision int NOT NULL CONSTRAINT DF_module_templates_revision DEFAULT 1,
    created_by bigint NOT NULL,
    updated_by bigint NOT NULL,
    created_at datetimeoffset(0) NOT NULL CONSTRAINT DF_module_templates_created_at DEFAULT SYSUTCDATETIME(),
    updated_at datetimeoffset(0) NOT NULL CONSTRAINT DF_module_templates_updated_at DEFAULT SYSUTCDATETIME(),
    retired_at datetimeoffset(0) NULL,
    row_version rowversion NOT NULL,
    CONSTRAINT UQ_module_templates_code UNIQUE (code),
    CONSTRAINT CK_module_templates_status CHECK (status IN (N'Draft', N'Active', N'Retired')),
    CONSTRAINT CK_module_templates_revision CHECK (revision >= 1),
    CONSTRAINT CK_module_templates_category CHECK (category_code IN ('01','02','03','04','05','06','07','08','09','10')),
    CONSTRAINT CK_module_templates_retired CHECK ((status = N'Retired' AND retired_at IS NOT NULL) OR (status <> N'Retired' AND retired_at IS NULL)),
    CONSTRAINT FK_module_templates_created_by FOREIGN KEY (created_by) REFERENCES dbo.users(id),
    CONSTRAINT FK_module_templates_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.users(id)
);

-- One line carries everything dbo.cost_items needs, except the quantity, which is
-- per module so that "three of this module" is a multiplication and not a re-entry.
-- The price is a reference with the date it was true; the apply step decides whether
-- to trust it. Nothing here is a live price.
CREATE TABLE dbo.module_template_lines (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_module_template_lines PRIMARY KEY,
    template_id bigint NOT NULL,
    sort_order int NOT NULL,
    category_code char(2) NOT NULL,
    subcategory nvarchar(100) NOT NULL CONSTRAINT DF_module_template_lines_subcategory DEFAULT N'',
    item_code nvarchar(100) NOT NULL,
    description nvarchar(500) NOT NULL,
    brand nvarchar(100) NOT NULL CONSTRAINT DF_module_template_lines_brand DEFAULT N'',
    model nvarchar(200) NOT NULL CONSTRAINT DF_module_template_lines_model DEFAULT N'',
    specification nvarchar(max) NULL,
    supplier_id bigint NULL,
    qty_per_module decimal(19,4) NOT NULL,
    unit nvarchar(50) NOT NULL,
    ref_unit_cost decimal(19,4) NOT NULL CONSTRAINT DF_module_template_lines_cost DEFAULT 0,
    ref_price_source nvarchar(100) NOT NULL CONSTRAINT DF_module_template_lines_price_source DEFAULT N'',
    ref_price_date date NULL,
    remark nvarchar(max) NULL,
    created_at datetimeoffset(0) NOT NULL CONSTRAINT DF_module_template_lines_created_at DEFAULT SYSUTCDATETIME(),
    deleted_at datetimeoffset(0) NULL,
    row_version rowversion NOT NULL,
    CONSTRAINT CK_module_template_lines_qty CHECK (qty_per_module > 0 AND qty_per_module < 1000000000),
    CONSTRAINT CK_module_template_lines_cost CHECK (ref_unit_cost >= 0 AND ref_unit_cost < 1000000000),
    CONSTRAINT CK_module_template_lines_sort CHECK (sort_order >= 0),
    CONSTRAINT CK_module_template_lines_category CHECK (category_code IN ('01','02','03','04','05','06','07','08','09','10')),
    CONSTRAINT FK_module_template_lines_template FOREIGN KEY (template_id) REFERENCES dbo.module_templates(id),
    CONSTRAINT FK_module_template_lines_supplier FOREIGN KEY (supplier_id) REFERENCES dbo.suppliers(id)
);

CREATE INDEX IX_module_template_lines_template ON dbo.module_template_lines(template_id, sort_order) WHERE deleted_at IS NULL;
CREATE INDEX IX_module_templates_status ON dbo.module_templates(status, category_code) INCLUDE (code, name);

IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL
BEGIN
 GRANT SELECT,INSERT,UPDATE ON dbo.module_templates TO iot_team_app_role;
 GRANT SELECT,INSERT,UPDATE ON dbo.module_template_lines TO iot_team_app_role;
END;

INSERT dbo.schema_versions(version,name) VALUES(20,N'Master module templates for estimate cost');
COMMIT;
