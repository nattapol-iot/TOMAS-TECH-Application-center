-- Migration 108: outsource lines on BOMs.
--
-- A PR starts from a BOM, and a BOM took only the material categories of its estimate (01 Hardware,
-- 02 Software, 03 Electrical, 04 Mechanical, 05 Robot). The owner said (2026-11-19) that outside
-- labour and services hired for a project are bought on a PR too: estimate category 07 Outsource.
-- From this release the API copies that category into a new BOM as section OUT. This migration
-- brings the BOMs that already exist in line:
--
--   1. Older BOMs copied every estimate category and marked the non-material lines SVC, which the
--      screens hide. Their lines of category 07 become OUT, so they show and can be requested.
--   2. BOMs generated since copied material only. Each Draft or Released BOM gets the Outsource
--      lines of the estimate revision it was generated from (the revision of the lines it holds),
--      after its last line. A superseded BOM is left as it was.
--
-- Engineering (our own hours), transportation, accommodation and other costs stay out of the BOM.
-- A BOM's module budgets now include its outsource lines, as they include its material. Nothing is
-- removed, and running this again adds nothing.

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 107)
    THROW 51108, 'Migration 107 must be applied before migration 108.', 1;
GO

BEGIN TRANSACTION;

UPDATE bl
SET bl.section_code = N'OUT'
FROM dbo.bom_lines bl
INNER JOIN dbo.cost_items ci ON ci.id = bl.estimate_line_id
WHERE bl.section_code = N'SVC'
  AND ci.category_code = N'07';

WITH bom_source AS (
    SELECT b.id AS bom_id,
           b.estimate_id,
           b.created_by,
           COALESCE((SELECT MAX(ci.revision)
                     FROM dbo.bom_lines bl
                     INNER JOIN dbo.cost_items ci ON ci.id = bl.estimate_line_id
                     WHERE bl.bom_id = b.id), e.revision) AS revision,
           COALESCE((SELECT MAX(bl.sort_order) FROM dbo.bom_lines bl WHERE bl.bom_id = b.id), 0) AS last_order
    FROM dbo.boms b
    INNER JOIN dbo.estimates e ON e.id = b.estimate_id
    WHERE b.deleted_at IS NULL
      AND b.status IN (N'Draft', N'Released')
)
INSERT dbo.bom_lines (bom_id, section_code, sort_order, item_id, estimate_line_id, description, qty_required, unit,
                      est_unit_cost, customer_supplied_qty, owner_id, non_stock, created_by, updated_by)
SELECT s.bom_id, N'OUT', s.last_order + ROW_NUMBER() OVER (PARTITION BY s.bom_id ORDER BY ci.id), NULL, ci.id,
       ci.description, ci.qty, ci.unit, ci.unit_cost, 0, ci.owner_id, 1, s.created_by, s.created_by
FROM bom_source s
INNER JOIN dbo.cost_items ci ON ci.estimate_id = s.estimate_id AND ci.revision = s.revision
WHERE ci.deleted_at IS NULL
  AND ci.qty > 0
  AND ci.category_code = N'07'
  AND NOT EXISTS (SELECT 1 FROM dbo.bom_lines existing WHERE existing.bom_id = s.bom_id AND existing.estimate_line_id = ci.id);

COMMIT TRANSACTION;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 108)
    INSERT dbo.schema_versions(version, name)
    VALUES (108, N'Outsource lines on BOMs');
GO
