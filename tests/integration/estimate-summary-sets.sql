-- Run only in a fresh disposable database after migrations 001-060.
SET NOCOUNT ON;
SET XACT_ABORT ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET ARITHABORT ON;
SET NUMERIC_ROUNDABORT OFF;
IF DB_NAME() NOT LIKE N'IoTTeamCenter_CI_SetTotals[_]%'
    THROW 51000, 'Summary Set fixture requires its own CI database.', 1;

INSERT dbo.users(email,name,role_id)
SELECT N'set-test@ci.invalid',N'Set test',id FROM dbo.roles WHERE code=N'Admin';
DECLARE @actor bigint=SCOPE_IDENTITY();
INSERT dbo.customers(code,name,created_by,updated_by) VALUES(N'SET-TEST',N'Set test',@actor,@actor);
DECLARE @customer bigint=SCOPE_IDENTITY();
INSERT dbo.inquiries(inquiry_no,inquiry_date,customer_id,project_name,project_type,estimate_owner_id,due_date,priority,status,created_by,updated_by)
VALUES(N'INQ-SET-1',GETDATE(),@customer,N'Set test',N'IoT',@actor,GETDATE(),N'Normal',N'New',@actor,@actor),
      (N'INQ-SET-2',GETDATE(),@customer,N'Frozen test',N'IoT',@actor,GETDATE(),N'Normal',N'New',@actor,@actor);
INSERT dbo.estimates(estimate_no,inquiry_id,customer_id,project_name,project_type,owner_id,revision,created_date,due_date,status,created_by,updated_by)
SELECT REPLACE(inquiry_no,N'INQ',N'EST'),id,@customer,project_name,N'IoT',@actor,0,GETDATE(),GETDATE(),N'Draft',@actor,@actor FROM dbo.inquiries;
INSERT dbo.cost_items(estimate_id,revision,category_code,category,module,item_code,description,qty,unit,unit_cost,price_source,owner_id,status,created_by,updated_by)
SELECT e.id,0,'01',N'Hardware',m.name,m.name,m.name,5,N'Pcs',1500,N'Historical',@actor,N'Active',@actor,@actor
FROM dbo.estimates e CROSS JOIN (VALUES(N'Line A'),(N'Line B'),(N'Line C')) m(name);
INSERT dbo.estimate_module_details(estimate_id,revision,module_key,title,quantity,unit,updated_by)
SELECT id,0,N'erp:category:01:Line A',N'Line A',3,N'Set',@actor FROM dbo.estimates;
-- This original module quantity is already represented in its child quantities.
INSERT dbo.estimate_module_details(estimate_id,revision,module_key,title,quantity,unit,updated_by)
SELECT id,0,N'category:01:Line A',N'Line A',13,N'Set',@actor FROM dbo.estimates;
UPDATE dbo.estimates SET status=N'Approved' WHERE estimate_no=N'EST-SET-2';
GO

:r database/migrations/061_estimate_summary_cost_multiplier.sql

DECLARE @id bigint=(SELECT id FROM dbo.estimates WHERE estimate_no=N'EST-SET-1');
IF (SELECT material_total FROM dbo.v_estimate_totals WHERE estimate_id=@id)<>37500
    THROW 51001, '3 Sets of 7500 plus two unchanged modules must total 37500.', 1;
IF EXISTS(SELECT 1 FROM dbo.cost_items WHERE qty<>5 OR unit_cost<>1500 OR line_total<>7500)
    THROW 51002, 'Set multiplier must not change component quantities or prices.', 1;
IF (SELECT total FROM dbo.v_estimate_totals WHERE estimate_id=(SELECT id FROM dbo.estimates WHERE estimate_no=N'EST-SET-2'))<>22500
    THROW 51003, 'Migration must preserve already approved totals.', 1;

UPDATE dbo.estimate_module_details SET quantity=2,cost_multiplier=2
WHERE estimate_id=@id AND module_key=N'erp:category:01:Line A';
IF (SELECT total FROM dbo.v_estimate_totals WHERE estimate_id=@id)<>30000
    THROW 51004, 'Reducing to 2 Sets must recompute from the unchanged base.', 1;
UPDATE dbo.estimate_module_details SET quantity=1,cost_multiplier=1
WHERE estimate_id=@id AND module_key=N'erp:category:01:Line A';
IF (SELECT total FROM dbo.v_estimate_totals WHERE estimate_id=@id)<>22500
    THROW 51005, 'Returning to 1 Set must restore the original amount.', 1;

-- The multiplier survives a status transition; it is not conditional on Draft.
UPDATE dbo.estimate_module_details SET quantity=3,cost_multiplier=3
WHERE estimate_id=@id AND module_key=N'erp:category:01:Line A';
UPDATE dbo.estimates SET status=N'Approved' WHERE id=@id;
IF (SELECT total FROM dbo.v_estimate_totals WHERE estimate_id=@id)<>37500
    THROW 51006, 'Approval must not change the calculated amount.', 1;
UPDATE dbo.estimates SET status=N'Draft',contingency_rate=10 WHERE id=@id;
IF (SELECT total FROM dbo.v_estimate_totals WHERE estimate_id=@id)<>41250
    THROW 51007, 'Contingency must use the multiplied total.', 1;

-- Every effective ERP source amount must reconcile with the material total.
IF (SELECT SUM(amount) FROM dbo.v_estimate_cost_amounts WHERE estimate_id=@id AND revision=0) <>
   (SELECT material_total FROM dbo.v_estimate_totals WHERE estimate_id=@id)
    THROW 51008, 'ERP sources and canonical totals must agree.', 1;
EXEC dbo.assert_estimate_totals @estimate_id=@id;
PRINT 'PASS: 1 -> 3 -> 2 -> 1 Sets, unchanged components, frozen totals, approval, contingency and reconciliation.';
GO

-- Reapplying must not backfill the frozen document or change existing factors.
:r database/migrations/061_estimate_summary_cost_multiplier.sql
IF (SELECT total FROM dbo.v_estimate_totals WHERE estimate_id=(SELECT id FROM dbo.estimates WHERE estimate_no=N'EST-SET-2'))<>22500
    THROW 51009, 'Reapplying migration changed a frozen document.', 1;
PRINT 'PASS: migration can be reapplied safely.';
