-- Migration 074: a purchase requisition an engineer can fill in at scale, with lines that do not match the estimate.
--
-- The company ERP raises the purchase orders and holds the stock, so a PR here is the engineer's request and the
-- approval of its cost. Three things stopped that:
--   * every PR line needed a supplier, which the engineer rarely knows; Purchasing chooses it at Purchasing Review,
--     so supplier_id may now be empty until then;
--   * a line had to be the exact estimate item. A line is now one of three kinds:
--       Planned     the BOM line's own item (the only kind before this migration),
--       Substitute  another make or model bought in place of a BOM line, charged to that line's module,
--       Unplanned   an item the estimate does not have, charged to a module of the same BOM (no BOM line);
--   * nothing recorded which module's budget a line spends. budget_module now does, and covered_qty records how much
--     of its BOM line a Planned or Substitute line covers (a substitute's own quantity can be in another unit).
-- mat_prs.erp_po_ref holds the ERP purchase order number(s) once Purchasing has ordered.
--
-- Existing lines are all Planned: covered_qty is their quantity and budget_module their BOM line's estimate module.
-- PO lines keep their composite key to the PR line; that key is rebuilt around the now nullable columns.

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version=74 AND name<>N'Flexible purchase requisition lines')
    THROW 51741, 'Schema version 074 is already used by another migration.', 1;
IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version=73)
    THROW 51742, 'Apply migration 073 before migration 074.', 1;

-- The Node runner executes each GO batch with sp_executesql. Keep BEGIN/COMMIT
-- in the same call; statements that reference the new columns compile separately.
BEGIN TRY
BEGIN TRANSACTION;
IF COL_LENGTH(N'dbo.mat_prs', N'erp_po_ref') IS NULL
    ALTER TABLE dbo.mat_prs ADD erp_po_ref nvarchar(200) NULL;
IF COL_LENGTH(N'dbo.mat_pr_lines', N'line_type') IS NULL
    ALTER TABLE dbo.mat_pr_lines ADD line_type nvarchar(20) NOT NULL CONSTRAINT DF_mat_pr_lines_line_type DEFAULT N'Planned';
IF COL_LENGTH(N'dbo.mat_pr_lines', N'budget_module') IS NULL
    ALTER TABLE dbo.mat_pr_lines ADD budget_module nvarchar(200) NULL;
IF COL_LENGTH(N'dbo.mat_pr_lines', N'covered_qty') IS NULL
    ALTER TABLE dbo.mat_pr_lines ADD covered_qty decimal(19,4) NULL;
IF COL_LENGTH(N'dbo.mat_pr_lines', N'brand') IS NULL
    ALTER TABLE dbo.mat_pr_lines ADD brand nvarchar(200) NOT NULL CONSTRAINT DF_mat_pr_lines_brand DEFAULT N'';

EXEC sys.sp_executesql N'UPDATE dbo.mat_pr_lines SET covered_qty=qty WHERE covered_qty IS NULL;';
EXEC sys.sp_executesql N'UPDATE line SET budget_module=COALESCE(NULLIF(LTRIM(RTRIM(item.module)),N''''),N''(No module)'')
    FROM dbo.mat_pr_lines line
    LEFT JOIN dbo.bom_lines bom_line ON bom_line.id=line.bom_line_id
    LEFT JOIN dbo.cost_items item ON item.id=bom_line.estimate_line_id
    WHERE line.budget_module IS NULL;';
IF COLUMNPROPERTY(OBJECT_ID(N'dbo.mat_pr_lines'), N'covered_qty', 'AllowsNull')=1
    EXEC sys.sp_executesql N'ALTER TABLE dbo.mat_pr_lines ALTER COLUMN covered_qty decimal(19,4) NOT NULL;';
IF COLUMNPROPERTY(OBJECT_ID(N'dbo.mat_pr_lines'), N'budget_module', 'AllowsNull')=1
    EXEC sys.sp_executesql N'ALTER TABLE dbo.mat_pr_lines ALTER COLUMN budget_module nvarchar(200) NOT NULL;';

-- Supplier and BOM line become optional. Everything that names either column is dropped first and rebuilt below.
IF COLUMNPROPERTY(OBJECT_ID(N'dbo.mat_pr_lines'), N'supplier_id', 'AllowsNull')=0
   OR COLUMNPROPERTY(OBJECT_ID(N'dbo.mat_pr_lines'), N'bom_line_id', 'AllowsNull')=0
BEGIN
    IF OBJECT_ID(N'dbo.FK_mat_po_lines_pr_line', N'F') IS NOT NULL ALTER TABLE dbo.mat_po_lines DROP CONSTRAINT FK_mat_po_lines_pr_line;
    IF OBJECT_ID(N'dbo.FK_mat_pr_lines_bom_line', N'F') IS NOT NULL ALTER TABLE dbo.mat_pr_lines DROP CONSTRAINT FK_mat_pr_lines_bom_line;
    IF OBJECT_ID(N'dbo.FK_mat_pr_lines_supplier', N'F') IS NOT NULL ALTER TABLE dbo.mat_pr_lines DROP CONSTRAINT FK_mat_pr_lines_supplier;
    IF OBJECT_ID(N'dbo.UQ_mat_pr_lines_link', N'UQ') IS NOT NULL ALTER TABLE dbo.mat_pr_lines DROP CONSTRAINT UQ_mat_pr_lines_link;
    IF EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.mat_pr_lines') AND name=N'IX_mat_pr_lines_pr') DROP INDEX IX_mat_pr_lines_pr ON dbo.mat_pr_lines;
    IF EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.mat_pr_lines') AND name=N'IX_mat_pr_lines_bom') DROP INDEX IX_mat_pr_lines_bom ON dbo.mat_pr_lines;
    IF EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.mat_pr_lines') AND name=N'IX_mat_pr_lines_supplier') DROP INDEX IX_mat_pr_lines_supplier ON dbo.mat_pr_lines;
    -- Column statistics the server created on its own also hold the columns; they come back by themselves.
    DECLARE @drop_statistics nvarchar(max)=N'';
    SELECT @drop_statistics += N'DROP STATISTICS dbo.mat_pr_lines.' + QUOTENAME(stat.name) + N';'
    FROM sys.stats stat
    WHERE stat.object_id=OBJECT_ID(N'dbo.mat_pr_lines')
      AND NOT EXISTS (SELECT 1 FROM sys.indexes idx WHERE idx.object_id=stat.object_id AND idx.index_id=stat.stats_id)
      AND EXISTS (SELECT 1 FROM sys.stats_columns stat_column
                  INNER JOIN sys.columns col ON col.object_id=stat_column.object_id AND col.column_id=stat_column.column_id
                  WHERE stat_column.object_id=stat.object_id AND stat_column.stats_id=stat.stats_id AND col.name IN (N'bom_line_id', N'supplier_id'));
    IF LEN(@drop_statistics)>0 EXEC sys.sp_executesql @drop_statistics;
    ALTER TABLE dbo.mat_pr_lines ALTER COLUMN bom_line_id bigint NULL;
    ALTER TABLE dbo.mat_pr_lines ALTER COLUMN supplier_id bigint NULL;
END;

IF OBJECT_ID(N'dbo.UQ_mat_pr_lines_link', N'UQ') IS NULL
    ALTER TABLE dbo.mat_pr_lines ADD CONSTRAINT UQ_mat_pr_lines_link UNIQUE (id, pr_id, bom_line_id, supplier_id);
IF OBJECT_ID(N'dbo.FK_mat_pr_lines_bom_line', N'F') IS NULL
    ALTER TABLE dbo.mat_pr_lines WITH CHECK ADD CONSTRAINT FK_mat_pr_lines_bom_line FOREIGN KEY (bom_line_id, bom_id) REFERENCES dbo.bom_lines(id, bom_id);
IF OBJECT_ID(N'dbo.FK_mat_pr_lines_supplier', N'F') IS NULL
    ALTER TABLE dbo.mat_pr_lines WITH CHECK ADD CONSTRAINT FK_mat_pr_lines_supplier FOREIGN KEY (supplier_id) REFERENCES dbo.suppliers(id);
IF OBJECT_ID(N'dbo.FK_mat_po_lines_pr_line', N'F') IS NULL
    ALTER TABLE dbo.mat_po_lines WITH CHECK ADD CONSTRAINT FK_mat_po_lines_pr_line FOREIGN KEY (pr_line_id, pr_id, bom_line_id, supplier_id)
        REFERENCES dbo.mat_pr_lines(id, pr_id, bom_line_id, supplier_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.mat_pr_lines') AND name=N'IX_mat_pr_lines_pr')
    CREATE INDEX IX_mat_pr_lines_pr ON dbo.mat_pr_lines(pr_id) INCLUDE (bom_line_id, item_id, supplier_id, qty, unit_price);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.mat_pr_lines') AND name=N'IX_mat_pr_lines_supplier')
    CREATE INDEX IX_mat_pr_lines_supplier ON dbo.mat_pr_lines(supplier_id, item_id) INCLUDE (pr_id, qty, unit_price);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.mat_pr_lines') AND name=N'IX_mat_pr_lines_bom')
    EXEC sys.sp_executesql N'CREATE INDEX IX_mat_pr_lines_bom ON dbo.mat_pr_lines(bom_id, bom_line_id) INCLUDE (pr_id, item_id, qty, covered_qty);';
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.mat_pr_lines') AND name=N'IX_mat_pr_lines_module')
    EXEC sys.sp_executesql N'CREATE INDEX IX_mat_pr_lines_module ON dbo.mat_pr_lines(bom_id, budget_module) INCLUDE (pr_id, line_total);';

IF OBJECT_ID(N'dbo.CK_mat_pr_lines_line_type', N'C') IS NULL
    EXEC sys.sp_executesql N'ALTER TABLE dbo.mat_pr_lines WITH CHECK ADD CONSTRAINT CK_mat_pr_lines_line_type CHECK (
        (line_type IN (N''Planned'', N''Substitute'') AND bom_line_id IS NOT NULL)
        OR (line_type=N''Unplanned'' AND bom_line_id IS NULL AND covered_qty=0));';
IF OBJECT_ID(N'dbo.CK_mat_pr_lines_budget', N'C') IS NULL
    EXEC sys.sp_executesql N'ALTER TABLE dbo.mat_pr_lines WITH CHECK ADD CONSTRAINT CK_mat_pr_lines_budget CHECK (
        covered_qty>=0 AND LEN(LTRIM(RTRIM(budget_module)))>0);';

-- Only a Planned line must be its BOM line's own item; a substitute is by definition another one.
EXEC sys.sp_executesql N'
CREATE OR ALTER TRIGGER dbo.trg_mat_pr_lines_consistency
ON dbo.mat_pr_lines
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (
        SELECT 1
        FROM inserted i
        INNER JOIN dbo.bom_lines bl ON bl.id = i.bom_line_id
        WHERE i.line_type = N''Planned''
          AND ((i.item_id <> bl.item_id)
           OR (i.item_id IS NULL AND bl.item_id IS NOT NULL)
           OR (i.item_id IS NOT NULL AND bl.item_id IS NULL))
    )
        THROW 51004, ''A planned PR line must use the item from its BOM line.'', 1;
END;';

EXEC sys.sp_executesql N'
CREATE OR ALTER TRIGGER dbo.trg_bom_lines_item_consistency
ON dbo.bom_lines
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF UPDATE(item_id) AND EXISTS (
        SELECT 1
        FROM inserted i
        INNER JOIN dbo.mat_pr_lines prl ON prl.bom_line_id = i.id
        WHERE prl.line_type = N''Planned''
          AND ((i.item_id <> prl.item_id)
           OR (i.item_id IS NULL AND prl.item_id IS NOT NULL)
           OR (i.item_id IS NOT NULL AND prl.item_id IS NULL))
    )
        THROW 51005, ''A BOM line item cannot change while linked planned PR lines use a different item.'', 1;
END;';

-- Purchasing sets a line's supplier at Purchasing Review; nothing else on a PR line is ever updated.
IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL
    GRANT UPDATE (supplier_id) ON OBJECT::dbo.mat_pr_lines TO [iot_team_app_role];

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version=74)
    INSERT INTO dbo.schema_versions(version,name)
    VALUES(74,N'Flexible purchase requisition lines');

COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT>0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
