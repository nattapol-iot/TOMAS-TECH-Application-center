:on error exit
SET NOCOUNT ON;
SET XACT_ABORT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;

-- Before migration 108 runs a second time (scripts/Test-ProcurementLocalDb.ps1): the legacy estimate gets two Outsource
-- lines. One is already on its released BOM the old way, as a hidden SVC line; the other is not on the BOM at all, as on a
-- BOM generated while only material was copied. 108 must then show the first and add the second, both as OUT.
DECLARE @fixture_database sysname=DB_NAME();
IF LEFT(@fixture_database,LEN(N'IoTTeamCenter_ProcCI_'))<>N'IoTTeamCenter_ProcCI_'
   OR LEN(@fixture_database)<>LEN(N'IoTTeamCenter_ProcCI_')+32
   OR RIGHT(@fixture_database,32) COLLATE Latin1_General_100_BIN2 LIKE N'%[^0-9a-f]%'
    THROW 51980, 'The BOM outsource fixture refuses to run outside its synthetic CI database.', 1;
IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version=108)
    THROW 51981, 'Migration 108 is not recorded.', 1;

DECLARE @bom bigint=(SELECT id FROM dbo.boms WHERE bom_no=N'BOM-PC-LEGACY');
DECLARE @estimate bigint=(SELECT estimate_id FROM dbo.boms WHERE id=@bom);
DECLARE @requester bigint=(SELECT id FROM dbo.users WHERE name=N'Requester' AND email LIKE N'procurement-ci-%');
DECLARE @admin bigint=(SELECT created_by FROM dbo.boms WHERE id=@bom);
IF @bom IS NULL OR @estimate IS NULL OR @requester IS NULL
    THROW 51982, 'The legacy BOM fixture is missing.', 1;
IF EXISTS (SELECT 1 FROM dbo.bom_lines WHERE bom_id=@bom AND section_code=N'OUT')
    THROW 51983, 'The legacy BOM already has outsource lines.', 1;

INSERT dbo.cost_items(estimate_id,revision,category_code,category,module,item_code,description,qty,unit,unit_cost,price_source,owner_id,status,created_by,updated_by)
VALUES(@estimate,0,'07',N'Outsource',N'Install',N'OUT-01',N'Panel wiring subcontract',1,N'lot',12000,N'Manual',@requester,N'Ready',@admin,@admin),
      (@estimate,0,'07',N'Outsource',N'Install',N'OUT-02',N'Site installation crew',5,N'day',3000,N'Manual',@requester,N'Ready',@admin,@admin);

INSERT dbo.bom_lines(bom_id,section_code,sort_order,item_id,estimate_line_id,description,qty_required,unit,est_unit_cost,owner_id,non_stock,created_by,updated_by)
SELECT @bom,N'SVC',(SELECT MAX(sort_order)+1 FROM dbo.bom_lines WHERE bom_id=@bom),NULL,ci.id,ci.description,ci.qty,ci.unit,ci.unit_cost,@requester,1,@admin,@admin
FROM dbo.cost_items ci WHERE ci.estimate_id=@estimate AND ci.item_code=N'OUT-01';
