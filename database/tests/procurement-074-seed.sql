:on error exit
SET NOCOUNT ON;
SET XACT_ABORT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;

-- Procurement data as it exists before migration 074, for scripts/Test-ProcurementLocalDb.ps1.
-- Runs only in that script's generated database.
DECLARE @fixture_database sysname=DB_NAME();
IF LEFT(@fixture_database,LEN(N'IoTTeamCenter_ProcCI_'))<>N'IoTTeamCenter_ProcCI_'
   OR LEN(@fixture_database)<>LEN(N'IoTTeamCenter_ProcCI_')+32
   OR RIGHT(@fixture_database,32) COLLATE Latin1_General_100_BIN2 LIKE N'%[^0-9a-f]%'
    THROW 51970, 'The procurement seed refuses to run outside its synthetic CI database.', 1;
IF (SELECT MAX(version) FROM dbo.schema_versions)<>73
    THROW 51971, 'The procurement seed expects a schema 73 database.', 1;

-- People: the API test signs in as each of them by name.
INSERT dbo.users(entra_object_id,email,name,role_id,department)
SELECT N'procurement-ci-'+v.name,N'procurement-ci-'+v.name+N'@test.invalid',v.name,r.id,N'IoT Engineer Dept.'
FROM (VALUES(N'Requester',N'Engineer'),(N'PM',N'Project Manager'),(N'Buyer',N'Purchasing'),(N'EM',N'Engineering Manager'),(N'Admin',N'Admin')) v(name,role)
INNER JOIN dbo.roles r ON r.code=v.role;
DECLARE @requester bigint=(SELECT id FROM dbo.users WHERE name=N'Requester' AND email LIKE N'procurement-ci-%');
DECLARE @pm bigint=(SELECT id FROM dbo.users WHERE name=N'PM' AND email LIKE N'procurement-ci-%');
DECLARE @admin bigint=(SELECT id FROM dbo.users WHERE name=N'Admin' AND email LIKE N'procurement-ci-%');

INSERT dbo.customers(code,name,created_by,updated_by) VALUES(N'PROC-CI',N'TEST ONLY procurement customer',@admin,@admin);
DECLARE @customer bigint=SCOPE_IDENTITY();
INSERT dbo.suppliers(code,name,created_by,updated_by) VALUES(N'PROC-S1',N'TEST ONLY supplier one',@admin,@admin),(N'PROC-S2',N'TEST ONLY supplier two',@admin,@admin);
DECLARE @supplier bigint=(SELECT id FROM dbo.suppliers WHERE code=N'PROC-S1');
INSERT dbo.mat_items(item_code,description,unit,created_by,updated_by) VALUES(N'PLC-01',N'TEST ONLY PLC',N'pcs',@admin,@admin);
DECLARE @plc_item bigint=SCOPE_IDENTITY();

-- Two projects, each with its own approved estimate: LEGACY holds pre-074 PRs and POs, FRESH is left for the API flow.
DECLARE @project_code nvarchar(10), @estimate bigint, @inquiry bigint, @project bigint;
DECLARE projects CURSOR LOCAL FAST_FORWARD FOR SELECT code FROM (VALUES(N'LEGACY'),(N'FRESH')) v(code);
OPEN projects; FETCH NEXT FROM projects INTO @project_code;
WHILE @@FETCH_STATUS=0
BEGIN
    INSERT dbo.inquiries(inquiry_no,inquiry_date,customer_id,project_name,project_type,estimate_owner_id,due_date,priority,status,created_by,updated_by)
    VALUES(N'PC-'+@project_code,CONVERT(date,'20990101'),@customer,N'TEST ONLY '+@project_code,N'IoT',@requester,CONVERT(date,'20990102'),N'Normal',N'Approved',@admin,@admin);
    SET @inquiry=SCOPE_IDENTITY();
    INSERT dbo.estimates(estimate_no,inquiry_id,customer_id,project_name,project_type,owner_id,created_date,due_date,status,contingency_rate,created_by,updated_by)
    VALUES(N'PC-'+@project_code,@inquiry,@customer,N'TEST ONLY '+@project_code,N'IoT',@requester,CONVERT(date,'20990101'),CONVERT(date,'20990102'),N'Draft',0,@admin,@admin);
    SET @estimate=SCOPE_IDENTITY();
    -- Panel 2 x 10,000 + 100 m x 50 = 25,000; Software 30,000; Site labour (category 06) never enters a BOM.
    INSERT dbo.cost_items(estimate_id,revision,category_code,category,module,item_code,description,qty,unit,unit_cost,price_source,owner_id,status,created_by,updated_by)
    VALUES(@estimate,0,'01',N'Hardware',N'Panel',N'PLC-01',N'PLC controller',2,N'pcs',10000,N'Manual',@requester,N'Ready',@admin,@admin),
          (@estimate,0,'03',N'Electrical',N'Panel',N'CBL-01',N'Control cable',100,N'm',50,N'Manual',@requester,N'Ready',@admin,@admin),
          (@estimate,0,'02',N'Software',N'Software',N'SCADA-LIC',N'SCADA licence',1,N'set',30000,N'Manual',@requester,N'Ready',@admin,@admin),
          (@estimate,0,'06',N'Engineering',N'Site',N'ENG-01',N'Commissioning engineer',10,N'day',5000,N'Manual',@requester,N'Ready',@admin,@admin);
    UPDATE dbo.estimates SET status=N'Approved' WHERE id=@estimate;
    INSERT dbo.projects(project_no,name,customer_id,project_type,status,manager_id,lead_engineer_id,inquiry_id,estimate_id,po_no,po_date,start_date,target_delivery,folder_path,created_by,updated_by)
    VALUES(N'PC-'+@project_code,N'TEST ONLY '+@project_code,@customer,N'IoT',N'Planning',@pm,@requester,@inquiry,@estimate,N'CUST-PO',CONVERT(date,'20990101'),CONVERT(date,'20990101'),CONVERT(date,'20991231'),N'',@admin,@admin);
    SET @project=SCOPE_IDENTITY();
    INSERT dbo.project_members(project_id,user_id,role_on_project,created_by) VALUES(@project,@requester,N'Engineer',@admin);
    FETCH NEXT FROM projects INTO @project_code;
END;
CLOSE projects; DEALLOCATE projects;

-- LEGACY: a released BOM generated the old way (labour copied in as an SVC line), and a PR already turned into an in-app PO.
DECLARE @legacy bigint=(SELECT id FROM dbo.projects WHERE project_no=N'PC-LEGACY');
DECLARE @legacy_estimate bigint=(SELECT estimate_id FROM dbo.projects WHERE id=@legacy);
INSERT dbo.boms(bom_no,revision,project_id,estimate_id,status,created_by,updated_by) VALUES(N'BOM-PC-LEGACY',1,@legacy,@legacy_estimate,N'Released',@admin,@admin);
DECLARE @bom bigint=SCOPE_IDENTITY();
INSERT dbo.bom_lines(bom_id,section_code,sort_order,item_id,estimate_line_id,description,qty_required,unit,est_unit_cost,owner_id,non_stock,created_by,updated_by)
SELECT @bom,CASE ci.category_code WHEN '01' THEN N'HW.STD' WHEN '02' THEN N'SW' WHEN '03' THEN N'HW.EL' ELSE N'SVC' END,ROW_NUMBER() OVER(ORDER BY ci.id),mi.id,ci.id,ci.description,ci.qty,ci.unit,ci.unit_cost,
       @requester,CASE WHEN mi.id IS NULL THEN 1 ELSE 0 END,@admin,@admin
FROM dbo.cost_items ci LEFT JOIN dbo.mat_items mi ON mi.item_code=ci.item_code WHERE ci.estimate_id=@legacy_estimate;
DECLARE @plc_line bigint=(SELECT bl.id FROM dbo.bom_lines bl WHERE bl.bom_id=@bom AND bl.item_id=@plc_item);
DECLARE @cable_line bigint=(SELECT bl.id FROM dbo.bom_lines bl INNER JOIN dbo.cost_items ci ON ci.id=bl.estimate_line_id WHERE bl.bom_id=@bom AND ci.item_code=N'CBL-01');

INSERT dbo.mat_prs(pr_no,project_id,bom_id,requested_by,priority,required_date,status,created_by,updated_by)
VALUES(N'PR-PC-LEGACY',@legacy,@bom,@requester,N'Normal',CONVERT(date,'20990201'),N'Converted to PO',@requester,@requester);
DECLARE @pr bigint=SCOPE_IDENTITY();
INSERT dbo.mat_pr_lines(pr_id,bom_id,bom_line_id,item_id,item_code,part_no,description,supplier_id,qty,unit,unit_price,est_qty,est_unit_cost,price_source)
VALUES(@pr,@bom,@plc_line,@plc_item,N'PLC-01',N'',N'PLC controller',@supplier,1,N'pcs',9000,2,10000,N'Price Library'),
      (@pr,@bom,@cable_line,NULL,N'CBL-01',N'',N'Control cable',@supplier,60,N'm',50,100,50,N'Price Library');
INSERT dbo.mat_pos(po_no,pr_id,project_id,supplier_id,order_date,status,created_by,updated_by)
VALUES(N'PO-PC-LEGACY',@pr,@legacy,@supplier,CONVERT(date,'20990202'),N'Ordered',@admin,@admin);
DECLARE @po bigint=SCOPE_IDENTITY();
INSERT dbo.mat_po_lines(po_id,pr_id,supplier_id,pr_line_id,bom_line_id,item_id,qty,unit_price)
SELECT @po,l.pr_id,l.supplier_id,l.id,l.bom_line_id,l.item_id,l.qty,l.unit_price FROM dbo.mat_pr_lines l WHERE l.pr_id=@pr;
GO
