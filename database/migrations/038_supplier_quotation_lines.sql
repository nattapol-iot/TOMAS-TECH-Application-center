-- Migration 038: supplier_quotation_lines
-- Stores individual line items extracted from supplier quotation PDFs.
-- These feed directly into the Price Library as a third source (alongside
-- Estimate cost_items and historical_pr_imports).

BEGIN TRANSACTION;

-- Add tax_id to suppliers for reliable deduplication during PDF import.
-- Column is nullable so existing rows remain valid without backfill.
ALTER TABLE dbo.suppliers
    ADD tax_id nvarchar(20) NOT NULL CONSTRAINT DF_suppliers_tax_id DEFAULT N'';

-- Line items extracted (manually reviewed) from each supplier quotation PDF
CREATE TABLE dbo.supplier_quotation_lines (
    id              bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_supplier_quotation_lines PRIMARY KEY,
    quotation_id    bigint NOT NULL CONSTRAINT FK_sql_quotation FOREIGN KEY REFERENCES dbo.supplier_quotations(id),
    line_no         int NOT NULL,                        -- 1-based display order
    item_code       nvarchar(200) NOT NULL CONSTRAINT DF_sql_item_code DEFAULT N'',
    description     nvarchar(500) NOT NULL,
    brand           nvarchar(100) NOT NULL CONSTRAINT DF_sql_brand DEFAULT N'',
    model           nvarchar(200) NOT NULL CONSTRAINT DF_sql_model DEFAULT N'',
    qty             decimal(19,4) NOT NULL CONSTRAINT DF_sql_qty DEFAULT 1,
    unit            nvarchar(50)  NOT NULL CONSTRAINT DF_sql_unit DEFAULT N'EA',
    unit_price      decimal(19,4) NOT NULL CONSTRAINT DF_sql_unit_price DEFAULT 0,
    line_total      AS (CONVERT(decimal(19,4), qty * unit_price)) PERSISTED,
    currency        char(3) NOT NULL CONSTRAINT DF_sql_currency DEFAULT N'THB',
    remark          nvarchar(max) NULL,
    created_by      bigint NOT NULL CONSTRAINT FK_sql_created_by FOREIGN KEY REFERENCES dbo.users(id),
    created_at      datetimeoffset(0) NOT NULL CONSTRAINT DF_sql_created_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_sql_qty CHECK (qty > 0),
    CONSTRAINT CK_sql_price CHECK (unit_price >= 0),
    CONSTRAINT CK_sql_currency CHECK (currency IN ('THB','JPY','USD','EUR')),
    CONSTRAINT UQ_sql_quotation_line UNIQUE (quotation_id, line_no)
);

CREATE INDEX IX_sql_quotation ON dbo.supplier_quotation_lines (quotation_id);
GO

-- Immutable: lines are replaced wholesale (delete+reinsert) not updated in-place.
-- This trigger blocks UPDATE so callers must DELETE+INSERT instead.
GO

CREATE TRIGGER tr_supplier_quotation_lines_no_update
ON dbo.supplier_quotation_lines AFTER UPDATE AS
BEGIN
    RAISERROR('supplier_quotation_lines rows are immutable; delete and re-insert to correct.', 16, 1);
    ROLLBACK;
END;
GO

INSERT INTO dbo.schema_versions (version, name) VALUES (38, N'supplier_quotation_lines');

COMMIT;
