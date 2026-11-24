-- Migration 131: when the app first saw a purchase request ordered (task doc 6.2, owner decision 5 of 2026-11-24).
--
-- The project page's Cost tab draws bought cost over time: requested by the request's date, ordered by the date of its
-- purchase order. The ERP does not hand the app a PO date, so the date the app first saw the order stands in for it:
-- dbo.mat_prs.erp_po_seen_at for a request ordered as a whole (a PO number, or Converted to PO), and
-- dbo.mat_pr_lines.erp_ordered_at for a Request List line the ERP reports ORDERED. Requests already ordered take the
-- last time the app heard from the ERP about them (or their last change) once, here.
--
-- To undo: database/rollback/131_purchase_order_seen.rollback.sql

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 130)
    THROW 51131, 'Migration 130 must be applied before migration 131.', 1;
GO

BEGIN TRANSACTION;

IF COL_LENGTH(N'dbo.mat_prs', N'erp_po_seen_at') IS NULL
    ALTER TABLE dbo.mat_prs ADD erp_po_seen_at datetimeoffset(0) NULL;
IF COL_LENGTH(N'dbo.mat_pr_lines', N'erp_ordered_at') IS NULL
    ALTER TABLE dbo.mat_pr_lines ADD erp_ordered_at datetimeoffset(0) NULL;

COMMIT TRANSACTION;
GO

UPDATE dbo.mat_prs SET erp_po_seen_at = COALESCE(erp_synced_at, updated_at)
WHERE erp_po_seen_at IS NULL AND (erp_po_ref IS NOT NULL OR status = N'Converted to PO');
GO

UPDATE l SET l.erp_ordered_at = COALESCE(pr.erp_synced_at, pr.updated_at)
FROM dbo.mat_pr_lines l INNER JOIN dbo.mat_prs pr ON pr.id = l.pr_id
WHERE l.erp_ordered_at IS NULL AND l.erp_line_status = N'ORDERED';
GO

-- mat_pr_lines takes column-level updates (migration 115); the ERP sync writes this one too. mat_prs has table-level UPDATE.
IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL
    GRANT UPDATE (erp_ordered_at) ON OBJECT::dbo.mat_pr_lines TO [iot_team_app_role];
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 131)
    INSERT dbo.schema_versions(version, name)
    VALUES (131, N'Purchase order seen');
GO
