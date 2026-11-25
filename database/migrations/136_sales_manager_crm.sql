-- Migration 136: the Sales Manager uses the CRM (owner 2026-11-25).
--
-- Migration 053 granted the CRM to role codes N'Sales' and N'Manager', which no migration ever created, so the Sales
-- Manager role (migration 016) held no CRM permission at all: no CRM menu and no My Work. It now holds what a Sales
-- Engineer holds - deals, activities and contacts, the deal value, and sending a deal for estimating - plus the deals of
-- its own department (crm.read.team), as an Engineering Manager has. The app already treats a Sales Manager as the head
-- of a department (team activity review, dashboard, sales KPI, the inquiry team queue).
-- Company-wide reading (crm.read.all) stays with Management and Admin, and the CRM settings (crm.configure) with Admin.
--
-- To undo: database/rollback/136_sales_manager_crm.rollback.sql

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 136 AND name <> N'Sales Manager CRM')
    THROW 51361, 'Schema version 136 is already used by another migration.', 1;
IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 135)
    THROW 51362, 'Migration 135 must be applied before migration 136.', 1;
GO

BEGIN TRANSACTION;

INSERT dbo.role_permissions(role_id, permission_id)
SELECT r.id, p.id
FROM dbo.roles r
CROSS JOIN dbo.permissions p
WHERE r.code = N'Sales Manager'
  AND p.code IN (N'crm.read', N'crm.write', N'crm.activity.write', N'crm.contact.write', N'crm.commercial.read', N'crm.convert', N'crm.read.team')
  AND NOT EXISTS (SELECT 1 FROM dbo.role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 136)
    INSERT dbo.schema_versions(version, name)
    VALUES (136, N'Sales Manager CRM');

COMMIT TRANSACTION;
GO
