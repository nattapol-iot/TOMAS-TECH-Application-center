SET XACT_ABORT ON;
SET NOCOUNT ON;
GO

IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 5)
    THROW 51030, 'Migration 005 has already been applied.', 1;

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 4)
    THROW 51031, 'Migration 004 must be applied before migration 005.', 1;
GO

BEGIN TRANSACTION;
GO

CREATE OR ALTER TRIGGER dbo.trg_estimate_revisions_append_only
ON dbo.estimate_revisions
INSTEAD OF UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    THROW 51032, 'Estimate revision snapshots are append-only.', 1;
END;
GO

CREATE OR ALTER TRIGGER dbo.trg_cost_items_current_revision_only
ON dbo.cost_items
AFTER UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (
        SELECT 1
        FROM deleted d
        INNER JOIN dbo.estimates e ON e.id = d.estimate_id
        WHERE d.revision <> e.revision
    ) OR EXISTS (
        SELECT 1
        FROM inserted i
        INNER JOIN dbo.estimates e ON e.id = i.estimate_id
        WHERE i.revision <> e.revision
    )
        THROW 51033, 'Historical cost items cannot be changed.', 1;
END;
GO

CREATE OR ALTER TRIGGER dbo.trg_manhour_lines_current_revision_only
ON dbo.manhour_lines
AFTER UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (
        SELECT 1
        FROM deleted d
        INNER JOIN dbo.estimates e ON e.id = d.estimate_id
        WHERE d.revision <> e.revision
    ) OR EXISTS (
        SELECT 1
        FROM inserted i
        INNER JOIN dbo.estimates e ON e.id = i.estimate_id
        WHERE i.revision <> e.revision
    )
        THROW 51034, 'Historical man-hour lines cannot be changed.', 1;
END;
GO

CREATE OR ALTER TRIGGER dbo.trg_expense_lines_current_revision_only
ON dbo.expense_lines
AFTER UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (
        SELECT 1
        FROM deleted d
        INNER JOIN dbo.estimates e ON e.id = d.estimate_id
        WHERE d.revision <> e.revision
    ) OR EXISTS (
        SELECT 1
        FROM inserted i
        INNER JOIN dbo.estimates e ON e.id = i.estimate_id
        WHERE i.revision <> e.revision
    )
        THROW 51035, 'Historical expense lines cannot be changed.', 1;
END;
GO

CREATE OR ALTER TRIGGER dbo.trg_other_cost_lines_current_revision_only
ON dbo.other_cost_lines
AFTER UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (
        SELECT 1
        FROM deleted d
        INNER JOIN dbo.estimates e ON e.id = d.estimate_id
        WHERE d.revision <> e.revision
    ) OR EXISTS (
        SELECT 1
        FROM inserted i
        INNER JOIN dbo.estimates e ON e.id = i.estimate_id
        WHERE i.revision <> e.revision
    )
        THROW 51036, 'Historical other-cost lines cannot be changed.', 1;
END;
GO

INSERT INTO dbo.schema_versions(version, name)
VALUES (5, N'Append-only estimate revisions and immutable historical cost lines');

COMMIT TRANSACTION;
GO
