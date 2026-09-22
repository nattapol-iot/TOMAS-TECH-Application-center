-- Migration 060: a price source that is a link rather than a document
--
-- The Price Library reads supplier quotation lines, and until now every one of them
-- needed a stored document behind it. That is exactly right for a quotation and
-- impossible for a price read off a vendor's public page, so a quotation row now
-- declares which kind of source it is.
--
-- A document-backed row is held to precisely the integrity it had before: a name, a
-- positive size, a storage key and a 64-character hash. A web reference carries a URL
-- instead and stores no file at all, which is why the file columns become nullable
-- and the unique key over storage_key becomes a filtered index — SQL Server's UNIQUE
-- constraint admits only one NULL, so a second file-less row would collide with the
-- first.
--
-- Every existing row is a document: the default backfills them and they satisfy the
-- Document branch of the new constraint unchanged.
--
-- Four GO-separated batches, because a column cannot be referenced in the batch that
-- adds it, and the version is recorded last so the runner retries a partial failure.

-- ── Batch 1: declare the source kind and where a link would live ────────────
SET XACT_ABORT ON;
SET NOCOUNT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.supplier_quotations') AND name = N'source_kind'
)
    ALTER TABLE dbo.supplier_quotations
        ADD source_kind nvarchar(20) NOT NULL
            CONSTRAINT DF_supplier_quotations_source_kind DEFAULT N'Document';

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.supplier_quotations') AND name = N'source_url'
)
    ALTER TABLE dbo.supplier_quotations
        ADD source_url nvarchar(1000) NOT NULL
            CONSTRAINT DF_supplier_quotations_source_url DEFAULT N'';

COMMIT;
GO

-- ── Batch 2: the stored file becomes optional, for a web reference only ─────
SET XACT_ABORT ON;
SET NOCOUNT ON;
BEGIN TRANSACTION;

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_supplier_quotations_file')
    ALTER TABLE dbo.supplier_quotations DROP CONSTRAINT CK_supplier_quotations_file;

-- The unique key has to go before the column it covers can be altered, and it comes
-- back as an index filtered to the rows that actually store a file.
IF EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = N'UQ_supplier_quotations_storage')
    ALTER TABLE dbo.supplier_quotations DROP CONSTRAINT UQ_supplier_quotations_storage;

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.supplier_quotations')
    AND name = N'storage_key' AND is_nullable = 0)
    ALTER TABLE dbo.supplier_quotations ALTER COLUMN storage_key nvarchar(1000) NULL;

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.supplier_quotations')
    AND name = N'file_name' AND is_nullable = 0)
    ALTER TABLE dbo.supplier_quotations ALTER COLUMN file_name nvarchar(500) NULL;

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.supplier_quotations')
    AND name = N'content_type' AND is_nullable = 0)
    ALTER TABLE dbo.supplier_quotations ALTER COLUMN content_type nvarchar(200) NULL;

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.supplier_quotations')
    AND name = N'size_bytes' AND is_nullable = 0)
    ALTER TABLE dbo.supplier_quotations ALTER COLUMN size_bytes bigint NULL;

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.supplier_quotations')
    AND name = N'sha256' AND is_nullable = 0)
    ALTER TABLE dbo.supplier_quotations ALTER COLUMN sha256 char(64) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ_supplier_quotations_storage'
    AND object_id = OBJECT_ID('dbo.supplier_quotations'))
    CREATE UNIQUE INDEX UQ_supplier_quotations_storage
        ON dbo.supplier_quotations(storage_key) WHERE storage_key IS NOT NULL;

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_supplier_quotations_source_kind')
    ALTER TABLE dbo.supplier_quotations
        ADD CONSTRAINT CK_supplier_quotations_source_kind
            CHECK (source_kind IN (N'Document', N'WebReference'));

-- One row cannot be both: a document has a file and no link, a reference has a link
-- and no file. Neither can be nothing at all.
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_supplier_quotations_source')
    ALTER TABLE dbo.supplier_quotations
        ADD CONSTRAINT CK_supplier_quotations_source CHECK (
            (source_kind = N'Document'
                AND size_bytes > 0 AND LEN(file_name) > 0
                AND LEN(storage_key) > 0 AND LEN(sha256) = 64
                AND source_url = N'')
            OR (source_kind = N'WebReference'
                AND storage_key IS NULL AND file_name IS NULL AND content_type IS NULL
                AND size_bytes IS NULL AND sha256 IS NULL
                AND LEN(source_url) > 0));

COMMIT;
GO

-- ── Batch 3: a reference is cited, so the register can be searched by its link ──
SET XACT_ABORT ON;
SET NOCOUNT ON;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_supplier_quotations_source_kind'
    AND object_id = OBJECT_ID('dbo.supplier_quotations'))
    CREATE INDEX IX_supplier_quotations_source_kind
        ON dbo.supplier_quotations(source_kind, received_date DESC)
        INCLUDE (quotation_no, supplier_id, source_url);
GO

-- ── Batch 4: record the version last ────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 60)
    INSERT dbo.schema_versions(version, name)
    VALUES (60, N'Price sources that cite a link instead of a stored document');
