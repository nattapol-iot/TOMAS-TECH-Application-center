:on error exit
SET NOCOUNT ON;
SET XACT_ABORT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;

-- After migration 074 on the seeded schema-73 data (scripts/Test-ProcurementLocalDb.ps1).
DECLARE @fixture_database sysname=DB_NAME();
IF LEFT(@fixture_database,LEN(N'IoTTeamCenter_ProcCI_'))<>N'IoTTeamCenter_ProcCI_'
   OR LEN(@fixture_database)<>LEN(N'IoTTeamCenter_ProcCI_')+32
   OR RIGHT(@fixture_database,32) COLLATE Latin1_General_100_BIN2 LIKE N'%[^0-9a-f]%'
    THROW 51980, 'The procurement fixture refuses to run outside its synthetic CI database.', 1;
IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version=74 AND name=N'Flexible purchase requisition lines')
    THROW 51981, 'Migration 074 is not recorded.', 1;

-- Existing lines became Planned lines of their BOM line's module, covering exactly their quantity.
IF EXISTS (SELECT 1 FROM dbo.mat_pr_lines WHERE line_type<>N'Planned' OR covered_qty<>qty OR budget_module<>N'Panel' OR brand<>N'')
    THROW 51982, 'Existing PR lines were not backfilled as planned Panel lines covering their own quantity.', 1;
IF COLUMNPROPERTY(OBJECT_ID(N'dbo.mat_pr_lines'), N'supplier_id', 'AllowsNull')<>1 OR COLUMNPROPERTY(OBJECT_ID(N'dbo.mat_pr_lines'), N'bom_line_id', 'AllowsNull')<>1
   OR COLUMNPROPERTY(OBJECT_ID(N'dbo.mat_pr_lines'), N'budget_module', 'AllowsNull')<>0 OR COLUMNPROPERTY(OBJECT_ID(N'dbo.mat_pr_lines'), N'covered_qty', 'AllowsNull')<>0
   OR COL_LENGTH(N'dbo.mat_prs', N'erp_po_ref') IS NULL
    THROW 51983, 'PR line columns do not have the expected nullability.', 1;
-- The keys rebuilt around the nullable columns are back, enabled and trusted, and the legacy PO still points at its PR lines.
IF (SELECT COUNT(*) FROM sys.foreign_keys WHERE name IN (N'FK_mat_po_lines_pr_line', N'FK_mat_pr_lines_bom_line', N'FK_mat_pr_lines_supplier') AND is_disabled=0 AND is_not_trusted=0)<>3
   OR OBJECT_ID(N'dbo.UQ_mat_pr_lines_link', N'UQ') IS NULL
   OR (SELECT COUNT(*) FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.mat_pr_lines') AND name IN (N'IX_mat_pr_lines_pr', N'IX_mat_pr_lines_bom', N'IX_mat_pr_lines_supplier', N'IX_mat_pr_lines_module'))<>4
    THROW 51984, 'A rebuilt key or index of mat_pr_lines is missing, disabled or untrusted.', 1;
IF (SELECT COUNT(*) FROM dbo.mat_po_lines pol INNER JOIN dbo.mat_pr_lines prl ON prl.id=pol.pr_line_id AND prl.supplier_id=pol.supplier_id AND prl.bom_line_id=pol.bom_line_id)<>2
    THROW 51985, 'Legacy PO lines no longer match their PR lines.', 1;

DECLARE @pr bigint=(SELECT id FROM dbo.mat_prs WHERE pr_no=N'PR-PC-LEGACY');
DECLARE @bom bigint=(SELECT bom_id FROM dbo.mat_prs WHERE id=@pr);
DECLARE @plc_line bigint=(SELECT bl.id FROM dbo.bom_lines bl INNER JOIN dbo.mat_items i ON i.id=bl.item_id WHERE bl.bom_id=@bom AND i.item_code=N'PLC-01');

-- Allowed now: an unplanned item with no BOM line and no supplier yet, and a substitute that is not the BOM line's item.
BEGIN TRANSACTION;
INSERT dbo.mat_pr_lines(pr_id,bom_id,bom_line_id,item_id,item_code,part_no,description,supplier_id,qty,unit,unit_price,est_qty,est_unit_cost,price_source,line_type,budget_module,covered_qty)
VALUES(@pr,@bom,NULL,NULL,N'',N'BRK-1',N'Mounting bracket',NULL,4,N'pcs',100,0,0,N'Manual',N'Unplanned',N'Panel',0),
      (@pr,@bom,@plc_line,NULL,N'',N'S7-1500',N'Siemens PLC instead',NULL,1,N'pcs',12000,1,10000,N'Manual',N'Substitute',N'Panel',1);
ROLLBACK TRANSACTION;

-- Still refused: an unplanned line tied to a BOM line, a planned line that is not its BOM line's item, a line with no module.
DECLARE @case int=1, @refused bit;
WHILE @case<=3
BEGIN
    SET @refused=0;
    BEGIN TRY
        BEGIN TRANSACTION;
        IF @case=1 INSERT dbo.mat_pr_lines(pr_id,bom_id,bom_line_id,item_id,item_code,part_no,description,supplier_id,qty,unit,unit_price,est_qty,est_unit_cost,price_source,line_type,budget_module,covered_qty)
            VALUES(@pr,@bom,@plc_line,NULL,N'',N'',N'Unplanned but tied',NULL,1,N'pcs',1,0,0,N'Manual',N'Unplanned',N'Panel',0);
        IF @case=2 INSERT dbo.mat_pr_lines(pr_id,bom_id,bom_line_id,item_id,item_code,part_no,description,supplier_id,qty,unit,unit_price,est_qty,est_unit_cost,price_source,line_type,budget_module,covered_qty)
            VALUES(@pr,@bom,@plc_line,NULL,N'PLC-01',N'',N'Planned without its item',NULL,1,N'pcs',1,1,10000,N'Manual',N'Planned',N'Panel',1);
        IF @case=3 INSERT dbo.mat_pr_lines(pr_id,bom_id,bom_line_id,item_id,item_code,part_no,description,supplier_id,qty,unit,unit_price,est_qty,est_unit_cost,price_source,line_type,budget_module,covered_qty)
            VALUES(@pr,@bom,NULL,NULL,N'',N'',N'No module',NULL,1,N'pcs',1,0,0,N'Manual',N'Unplanned',N' ',0);
        ROLLBACK TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT>0 ROLLBACK TRANSACTION;
        SET @refused=1;
    END CATCH;
    IF @refused=0 BEGIN DECLARE @message nvarchar(200)=CONCAT(N'A PR line that migration 074 must refuse was accepted (case ',@case,N').'); THROW 51986, @message, 1; END;
    SET @case+=1;
END;
PRINT 'procurement-074 fixture: backfill, nullability, rebuilt keys, line kinds and the planned-item trigger hold.';
GO
