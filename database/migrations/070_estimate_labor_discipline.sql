-- Migration 070: every labor and site-expense line names its discipline.
--
-- The labor sheet was grouped only by cost type (Engineering / Installation) and a typed work-package
-- name, so electrical, software and mechanical effort ran together, and each discipline's travel,
-- hotel and per diem sat wherever someone had typed it. The discipline is now a column on both
-- ledgers: Electrical, Mechanical, Software, or Installation (installation and service work).
--
-- Installation is the discipline of exactly the lines whose cost type is Installation, so the two
-- columns can never disagree. NULL means "not classified yet": lines written before this migration
-- that no rule can place, and lines written by an older API, stay readable and editable.
--
-- Backfill touches the current revision only. Earlier revisions are frozen by
-- trg_manhour_lines_current_revision_only / trg_expense_lines_current_revision_only, and they are
-- never shown on the labor sheet. No amount changes, so the totals guard is unaffected.

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version=70 AND name<>N'Estimate labor and site expense disciplines')
    THROW 51701, 'Schema version 070 is already used by another migration.', 1;
IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version=69)
    THROW 51702, 'Apply migration 069 before migration 070.', 1;

-- The Node runner executes each GO batch with sp_executesql. Keep BEGIN/COMMIT
-- in the same call; statements that reference the new columns compile separately.
BEGIN TRY
BEGIN TRANSACTION;
IF COL_LENGTH(N'dbo.manhour_lines', N'discipline') IS NULL
    ALTER TABLE dbo.manhour_lines ADD discipline nvarchar(20) NULL;
IF COL_LENGTH(N'dbo.expense_lines', N'discipline') IS NULL
    ALTER TABLE dbo.expense_lines ADD discipline nvarchar(20) NULL;

-- A discipline the rule can read off the line: Installation work, or an internal rate whose
-- department is literally the discipline (the same text the ERP labor rule already matches).
EXEC sys.sp_executesql N'UPDATE line SET discipline=CASE
        WHEN line.cost_type=N''Installation'' THEN N''Installation''
        WHEN LOWER(LTRIM(RTRIM(line.department)))=N''electrical'' THEN N''Electrical''
        WHEN LOWER(LTRIM(RTRIM(line.department)))=N''mechanical'' THEN N''Mechanical''
        WHEN LOWER(LTRIM(RTRIM(line.department)))=N''software'' THEN N''Software'' END
    FROM dbo.manhour_lines line
    INNER JOIN dbo.estimates e ON e.id=line.estimate_id AND e.revision=line.revision
    WHERE line.discipline IS NULL AND line.deleted_at IS NULL;';

-- An expense follows the one discipline its work package is staffed with; a package that mixes
-- disciplines, or has no labor, stays unclassified for a person to decide.
EXEC sys.sp_executesql N'UPDATE expense SET discipline=CASE
        WHEN expense.cost_type=N''Installation'' THEN N''Installation''
        ELSE (SELECT MIN(labor.discipline) FROM dbo.manhour_lines labor
              WHERE labor.estimate_id=expense.estimate_id AND labor.revision=expense.revision AND labor.deleted_at IS NULL
                AND labor.cost_type=expense.cost_type AND labor.package=expense.package AND labor.discipline IS NOT NULL
              HAVING COUNT(DISTINCT labor.discipline)=1) END
    FROM dbo.expense_lines expense
    INNER JOIN dbo.estimates e ON e.id=expense.estimate_id AND e.revision=expense.revision
    WHERE expense.discipline IS NULL AND expense.deleted_at IS NULL;';

IF OBJECT_ID(N'dbo.CK_manhour_lines_discipline', N'C') IS NULL
    EXEC sys.sp_executesql N'ALTER TABLE dbo.manhour_lines WITH CHECK ADD CONSTRAINT CK_manhour_lines_discipline CHECK (
        discipline IS NULL
        OR (discipline=N''Installation'' AND cost_type=N''Installation'')
        OR (discipline IN (N''Electrical'',N''Mechanical'',N''Software'') AND cost_type=N''Engineering''));';
IF OBJECT_ID(N'dbo.CK_expense_lines_discipline', N'C') IS NULL
    EXEC sys.sp_executesql N'ALTER TABLE dbo.expense_lines WITH CHECK ADD CONSTRAINT CK_expense_lines_discipline CHECK (
        discipline IS NULL
        OR (discipline=N''Installation'' AND cost_type=N''Installation'')
        OR (discipline IN (N''Electrical'',N''Mechanical'',N''Software'') AND cost_type=N''Engineering''));';

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version=70)
    INSERT INTO dbo.schema_versions(version,name)
    VALUES(70,N'Estimate labor and site expense disciplines');

COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT>0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
