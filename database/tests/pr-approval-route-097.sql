:on error exit
SET NOCOUNT ON;
SET XACT_ABORT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;

-- Before migration 097 runs a second time (scripts/Test-ProcurementLocalDb.ps1): the final approver gets an account, and a
-- PR waits on the Engineering Manager role as the earlier route left it. 097 must then seed the route and give that step to them.
DECLARE @fixture_database sysname=DB_NAME();
IF LEFT(@fixture_database,LEN(N'IoTTeamCenter_ProcCI_'))<>N'IoTTeamCenter_ProcCI_'
   OR LEN(@fixture_database)<>LEN(N'IoTTeamCenter_ProcCI_')+32
   OR RIGHT(@fixture_database,32) COLLATE Latin1_General_100_BIN2 LIKE N'%[^0-9a-f]%'
    THROW 51980, 'The PR route fixture refuses to run outside its synthetic CI database.', 1;
IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version=97) OR EXISTS (SELECT 1 FROM dbo.pr_approval_settings)
    THROW 51981, 'Migration 097 is not recorded, or a final approver is already set.', 1;

INSERT dbo.users(entra_object_id,email,name,role_id,department)
SELECT N'procurement-ci-final',N'nattapol.p@tomastc.com',N'Final Approver',r.id,N'IoT Engineer Dept.' FROM dbo.roles r WHERE r.code=N'Admin';
DECLARE @requester bigint=(SELECT id FROM dbo.users WHERE name=N'Requester' AND email LIKE N'procurement-ci-%');
DECLARE @bom bigint=(SELECT id FROM dbo.boms WHERE bom_no=N'BOM-PC-LEGACY');
INSERT dbo.mat_prs(pr_no,project_id,bom_id,requested_by,priority,required_date,status,created_by,updated_by)
SELECT N'PR-PC-ROUTE',b.project_id,b.id,@requester,N'Normal',CONVERT(date,'20990301'),N'In Approval',@requester,@requester FROM dbo.boms b WHERE b.id=@bom;
DECLARE @pr bigint=SCOPE_IDENTITY();
INSERT dbo.mat_pr_approval_steps(pr_id,sequence,name,approver_role,approver_id,status,decision,acted_at)
VALUES(@pr,1,N'Submitted by Requester',NULL,@requester,N'Completed',N'Submitted',SYSUTCDATETIME()),
      (@pr,2,N'Project Manager Approval',N'Engineering Manager',NULL,N'Current',NULL,NULL),
      (@pr,3,N'Sent to ERP',NULL,NULL,N'Pending',NULL,NULL);
