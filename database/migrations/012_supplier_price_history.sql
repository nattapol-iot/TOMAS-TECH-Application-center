:on error exit
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET NUMERIC_ROUNDABORT OFF;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 12)
    THROW 51150, 'Migration 012 has already been applied.', 1;
IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 11)
    THROW 51151, 'Migration 011 must be applied before migration 012.', 1;

CREATE TABLE dbo.supplier_price_history (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_supplier_price_history PRIMARY KEY,
    source_key nvarchar(300) NOT NULL CONSTRAINT UQ_supplier_price_history_source_key UNIQUE,
    project_number nvarchar(100) NOT NULL,
    project_name nvarchar(300) NOT NULL,
    customer_name nvarchar(300) NOT NULL CONSTRAINT DF_supplier_price_history_customer DEFAULT N'',
    line_number int NOT NULL,
    category_code char(2) NOT NULL CONSTRAINT DF_supplier_price_history_category_code DEFAULT '03',
    category nvarchar(100) NOT NULL CONSTRAINT DF_supplier_price_history_category DEFAULT N'Electrical',
    module nvarchar(200) NOT NULL CONSTRAINT DF_supplier_price_history_module DEFAULT N'Historical Purchase',
    item_code nvarchar(100) NOT NULL,
    description nvarchar(500) NOT NULL,
    brand nvarchar(100) NOT NULL CONSTRAINT DF_supplier_price_history_brand DEFAULT N'',
    supplier_id bigint NULL,
    supplier_name nvarchar(300) NOT NULL,
    quantity decimal(19,4) NOT NULL,
    unit nvarchar(50) NOT NULL,
    quote_unit_price decimal(19,4) NOT NULL,
    actual_unit_cost decimal(19,4) NOT NULL,
    actual_line_cost decimal(19,4) NOT NULL,
    lead_time_days int NOT NULL CONSTRAINT DF_supplier_price_history_lead_time DEFAULT 0,
    quotation_number nvarchar(200) NOT NULL CONSTRAINT DF_supplier_price_history_quote DEFAULT N'',
    quotation_date date NULL,
    purchase_order_number nvarchar(100) NOT NULL,
    purchase_order_status nvarchar(100) NOT NULL CONSTRAINT DF_supplier_price_history_po_status DEFAULT N'',
    remark nvarchar(max) NOT NULL CONSTRAINT DF_supplier_price_history_remark DEFAULT N'',
    source_workbook nvarchar(260) NOT NULL,
    source_quotation_file nvarchar(260) NULL,
    import_batch nvarchar(100) NOT NULL,
    imported_by bigint NOT NULL,
    imported_at datetimeoffset(0) NOT NULL CONSTRAINT DF_supplier_price_history_imported_at DEFAULT SYSUTCDATETIME(),
    row_version rowversion NOT NULL,
    CONSTRAINT CK_supplier_price_history_values CHECK (line_number > 0 AND category_code LIKE '[0-9][0-9]' AND quantity > 0 AND quote_unit_price >= 0 AND actual_unit_cost >= 0 AND actual_line_cost >= 0 AND lead_time_days >= 0),
    CONSTRAINT FK_supplier_price_history_supplier FOREIGN KEY (supplier_id) REFERENCES dbo.suppliers(id),
    CONSTRAINT FK_supplier_price_history_imported_by FOREIGN KEY (imported_by) REFERENCES dbo.users(id)
);

CREATE INDEX IX_supplier_price_history_item_date ON dbo.supplier_price_history(item_code, quotation_date DESC, imported_at DESC)
    INCLUDE (description, brand, supplier_id, supplier_name, actual_unit_cost, unit, quotation_number, purchase_order_number);
CREATE INDEX IX_supplier_price_history_supplier_date ON dbo.supplier_price_history(supplier_id, quotation_date DESC, imported_at DESC)
    INCLUDE (item_code, description, actual_unit_cost, unit, project_number, purchase_order_number);

IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL
    GRANT SELECT ON OBJECT::dbo.supplier_price_history TO [iot_team_app_role];

INSERT INTO dbo.schema_versions(version, name)
VALUES (12, N'Audited supplier quotation and historical purchase price ledger');

COMMIT TRANSACTION;
GO
