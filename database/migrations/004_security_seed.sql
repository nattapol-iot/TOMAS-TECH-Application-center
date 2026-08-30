SET XACT_ABORT ON;
SET NOCOUNT ON;
GO

IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 4)
    THROW 51000, 'Migration 004 has already been applied.', 1;
GO

BEGIN TRANSACTION;

INSERT INTO dbo.roles(code, name, description)
VALUES
    (N'Engineer', N'Engineer', N'Prepare estimates and update assigned work'),
    (N'Project Manager', N'Project Manager', N'Own project plan and schedule commitments'),
    (N'Engineering Manager', N'Engineering Manager', N'Approve engineering estimates and rates'),
    (N'Purchasing', N'Purchasing', N'Purchase requisitions and purchase orders'),
    (N'Warehouse', N'Warehouse', N'Receiving, picking and material issues'),
    (N'Inventory Controller', N'Inventory Controller', N'Stock master and stock adjustments'),
    (N'Sales Engineer', N'Sales Engineer', N'Create inquiries and monitor estimates'),
    (N'Admin', N'Administrator', N'System administration and all business permissions'),
    (N'Viewer', N'Viewer', N'Read-only access');

INSERT INTO dbo.permissions(code, description)
VALUES
    (N'inquiry.read', N'Read inquiries'),
    (N'inquiry.write', N'Create and update inquiries'),
    (N'estimate.read', N'Read engineering estimates'),
    (N'estimate.write', N'Create and update unlocked engineering estimates'),
    (N'estimate.approve', N'Approve or request revision of an estimate'),
    (N'project.read', N'Read projects'),
    (N'project.write', N'Create and update projects'),
    (N'schedule.read', N'Read project schedules'),
    (N'schedule.plan', N'Edit the plan lane and baselines'),
    (N'schedule.progress', N'Update owned progress rows'),
    (N'procurement.read', N'Read BOM, PR and PO documents'),
    (N'procurement.request', N'Create and submit purchase requisitions'),
    (N'procurement.approve', N'Decide procurement approvals'),
    (N'procurement.order', N'Create purchase orders'),
    (N'inventory.read', N'Read stock and ledger'),
    (N'inventory.receive', N'Confirm goods receipt'),
    (N'inventory.issue', N'Pick and issue material'),
    (N'inventory.adjust', N'Approve stock adjustments'),
    (N'master.read', N'Read master data'),
    (N'master.write', N'Manage master data'),
    (N'audit.read', N'Read immutable audit logs'),
    (N'report.read', N'Run reports and exports');

;WITH grants(role_code, permission_code) AS (
    SELECT N'Viewer', code FROM dbo.permissions WHERE code IN (
        N'inquiry.read', N'estimate.read', N'project.read', N'schedule.read', N'procurement.read', N'inventory.read', N'master.read', N'report.read')
    UNION ALL SELECT N'Sales Engineer', code FROM dbo.permissions WHERE code IN (N'inquiry.read', N'inquiry.write', N'estimate.read', N'project.read', N'master.read', N'report.read')
    UNION ALL SELECT N'Engineer', code FROM dbo.permissions WHERE code IN (N'inquiry.read', N'estimate.read', N'estimate.write', N'project.read', N'schedule.read', N'schedule.progress', N'procurement.read', N'procurement.request', N'inventory.read', N'master.read', N'report.read')
    UNION ALL SELECT N'Project Manager', code FROM dbo.permissions WHERE code IN (N'inquiry.read', N'estimate.read', N'project.read', N'project.write', N'schedule.read', N'schedule.plan', N'schedule.progress', N'procurement.read', N'procurement.approve', N'inventory.read', N'master.read', N'report.read')
    UNION ALL SELECT N'Engineering Manager', code FROM dbo.permissions WHERE code IN (N'inquiry.read', N'estimate.read', N'estimate.write', N'estimate.approve', N'project.read', N'project.write', N'schedule.read', N'schedule.plan', N'procurement.read', N'procurement.approve', N'inventory.read', N'master.read', N'master.write', N'audit.read', N'report.read')
    UNION ALL SELECT N'Purchasing', code FROM dbo.permissions WHERE code IN (N'inquiry.read', N'estimate.read', N'project.read', N'procurement.read', N'procurement.request', N'procurement.approve', N'procurement.order', N'inventory.read', N'master.read', N'report.read')
    UNION ALL SELECT N'Warehouse', code FROM dbo.permissions WHERE code IN (N'project.read', N'procurement.read', N'inventory.read', N'inventory.receive', N'inventory.issue', N'master.read', N'report.read')
    UNION ALL SELECT N'Inventory Controller', code FROM dbo.permissions WHERE code IN (N'project.read', N'procurement.read', N'procurement.approve', N'inventory.read', N'inventory.receive', N'inventory.issue', N'inventory.adjust', N'master.read', N'master.write', N'audit.read', N'report.read')
    UNION ALL SELECT N'Admin', code FROM dbo.permissions
)
INSERT INTO dbo.role_permissions(role_id, permission_id)
SELECT DISTINCT r.id, p.id
FROM grants g
INNER JOIN dbo.roles r ON r.code = g.role_code
INNER JOIN dbo.permissions p ON p.code = g.permission_code;

INSERT INTO dbo.schema_versions(version, name) VALUES (4, N'Production RBAC roles and permissions');
COMMIT TRANSACTION;
GO
