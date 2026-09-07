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

IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 13)
    THROW 51160, 'Migration 013 has already been applied.', 1;
IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 12)
    THROW 51161, 'Migration 012 must be applied before migration 013.', 1;

CREATE TABLE dbo.supplier_quotations (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_supplier_quotations PRIMARY KEY,
    quotation_no nvarchar(30) NOT NULL CONSTRAINT UQ_supplier_quotations_no UNIQUE,
    supplier_reference nvarchar(200) NOT NULL CONSTRAINT DF_supplier_quotations_reference DEFAULT N'',
    supplier_id bigint NOT NULL,
    received_date date NOT NULL,
    valid_until date NOT NULL,
    inquiry_id bigint NULL,
    currency char(3) NOT NULL,
    amount decimal(19,4) NOT NULL,
    status nvarchar(30) NOT NULL CONSTRAINT DF_supplier_quotations_status DEFAULT N'Active',
    file_name nvarchar(500) NOT NULL,
    content_type nvarchar(200) NOT NULL,
    size_bytes bigint NOT NULL,
    storage_key nvarchar(1000) NOT NULL CONSTRAINT UQ_supplier_quotations_storage UNIQUE,
    sha256 char(64) NOT NULL,
    uploaded_by bigint NOT NULL,
    uploaded_at datetimeoffset(0) NOT NULL CONSTRAINT DF_supplier_quotations_uploaded_at DEFAULT SYSUTCDATETIME(),
    row_version rowversion NOT NULL,
    CONSTRAINT CK_supplier_quotations_dates CHECK (valid_until >= received_date),
    CONSTRAINT CK_supplier_quotations_amount CHECK (amount > 0),
    CONSTRAINT CK_supplier_quotations_currency CHECK (currency IN ('THB', 'JPY', 'USD', 'EUR')),
    CONSTRAINT CK_supplier_quotations_status CHECK (status IN (N'Active', N'Superseded')),
    CONSTRAINT CK_supplier_quotations_file CHECK (size_bytes > 0 AND LEN(file_name) > 0 AND LEN(storage_key) > 0 AND LEN(sha256) = 64),
    CONSTRAINT FK_supplier_quotations_supplier FOREIGN KEY (supplier_id) REFERENCES dbo.suppliers(id),
    CONSTRAINT FK_supplier_quotations_inquiry FOREIGN KEY (inquiry_id) REFERENCES dbo.inquiries(id),
    CONSTRAINT FK_supplier_quotations_uploaded_by FOREIGN KEY (uploaded_by) REFERENCES dbo.users(id)
);

CREATE INDEX IX_supplier_quotations_supplier_date ON dbo.supplier_quotations(supplier_id, received_date DESC)
    INCLUDE (quotation_no, supplier_reference, valid_until, currency, amount, status);
CREATE INDEX IX_supplier_quotations_inquiry ON dbo.supplier_quotations(inquiry_id, received_date DESC)
    WHERE inquiry_id IS NOT NULL;

IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL
BEGIN
    GRANT SELECT, INSERT ON OBJECT::dbo.supplier_quotations TO [iot_team_app_role];
END;

INSERT INTO dbo.schema_versions(version, name)
VALUES (13, N'Supplier quotation document registry and secure attachments');

COMMIT TRANSACTION;
GO
