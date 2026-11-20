-- Migration 115: the PR-Form's line fields on a request line, and lines that are part of another line.
--
-- The team's Excel PR-Form carries, for every line, what the material is, its surface treatment, a
-- detail, how many go into one set, when the line is needed, and a link to its drawing or quotation.
-- A row with only a part number under a line is a part of that line (valves under their manifold).
-- The owner chose (2026-11-20) to keep that on the request itself, as the form does, not in the BOM or
-- the estimate.
--
--   mat_pr_lines.material, treatment, detail   free text as on the form ("SS400", "Zinc", "t=3").
--   mat_pr_lines.qty_per_set                   quantity in one set; qty stays what is bought.
--   mat_pr_lines.need_by                        when this line is needed, if earlier than the request.
--   mat_pr_lines.attachment_url                 a drawing or quotation link (http or https only).
--   mat_pr_lines.parent_line_id                 the line of the same request this line is a part of.
--                                               One level only: a part has no parts (checked by the API).
--
-- A part is still a line of its own: it has its quantity and price and is bought like any other.
-- The API writes parent_line_id right after it writes the lines, so the role may update that column.
--
-- Running this again changes nothing.
--
-- To undo: database/rollback/115_pr_line_form_fields.rollback.sql

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 114)
    THROW 51115, 'Migration 114 must be applied before migration 115.', 1;
GO

BEGIN TRANSACTION;

IF COL_LENGTH(N'dbo.mat_pr_lines', N'material') IS NULL ALTER TABLE dbo.mat_pr_lines ADD material nvarchar(200) NULL;
IF COL_LENGTH(N'dbo.mat_pr_lines', N'treatment') IS NULL ALTER TABLE dbo.mat_pr_lines ADD treatment nvarchar(200) NULL;
IF COL_LENGTH(N'dbo.mat_pr_lines', N'detail') IS NULL ALTER TABLE dbo.mat_pr_lines ADD detail nvarchar(500) NULL;
IF COL_LENGTH(N'dbo.mat_pr_lines', N'qty_per_set') IS NULL ALTER TABLE dbo.mat_pr_lines ADD qty_per_set decimal(19,4) NULL;
IF COL_LENGTH(N'dbo.mat_pr_lines', N'need_by') IS NULL ALTER TABLE dbo.mat_pr_lines ADD need_by date NULL;
IF COL_LENGTH(N'dbo.mat_pr_lines', N'attachment_url') IS NULL ALTER TABLE dbo.mat_pr_lines ADD attachment_url nvarchar(500) NULL;
IF COL_LENGTH(N'dbo.mat_pr_lines', N'parent_line_id') IS NULL ALTER TABLE dbo.mat_pr_lines ADD parent_line_id bigint NULL;

COMMIT TRANSACTION;
GO

-- A part belongs to a line of the same request: the key (id, pr_id) lets the foreign key say so.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_mat_pr_lines_id_pr' AND object_id = OBJECT_ID(N'dbo.mat_pr_lines'))
    CREATE UNIQUE INDEX UX_mat_pr_lines_id_pr ON dbo.mat_pr_lines(id, pr_id);
GO

IF OBJECT_ID(N'dbo.FK_mat_pr_lines_parent', N'F') IS NULL
    ALTER TABLE dbo.mat_pr_lines WITH CHECK ADD CONSTRAINT FK_mat_pr_lines_parent FOREIGN KEY (parent_line_id, pr_id) REFERENCES dbo.mat_pr_lines(id, pr_id);
GO

IF OBJECT_ID(N'dbo.CK_mat_pr_lines_form_fields', N'C') IS NULL
    EXEC sys.sp_executesql N'ALTER TABLE dbo.mat_pr_lines WITH CHECK ADD CONSTRAINT CK_mat_pr_lines_form_fields CHECK (
        (parent_line_id IS NULL OR parent_line_id <> id)
        AND (qty_per_set IS NULL OR qty_per_set > 0)
        AND (attachment_url IS NULL OR attachment_url LIKE N''http://%'' OR attachment_url LIKE N''https://%''));';
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_mat_pr_lines_parent' AND object_id = OBJECT_ID(N'dbo.mat_pr_lines'))
    CREATE INDEX IX_mat_pr_lines_parent ON dbo.mat_pr_lines(parent_line_id) WHERE parent_line_id IS NOT NULL;
GO

IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL
    GRANT UPDATE (parent_line_id) ON OBJECT::dbo.mat_pr_lines TO [iot_team_app_role];
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 115)
    INSERT dbo.schema_versions(version, name)
    VALUES (115, N'PR line form fields and part lines');
GO
