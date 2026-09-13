SET XACT_ABORT ON;
SET NOCOUNT ON;
GO
IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version=45)
    THROW 51450, 'Migration 045 has already been applied.', 1;
IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version=44)
    THROW 51451, 'Migration 044 is required before 045.', 1;
BEGIN TRANSACTION;
ALTER TABLE dbo.cost_items ADD sort_order int NOT NULL CONSTRAINT DF_cost_items_sort_order DEFAULT (2147483647);
ALTER TABLE dbo.manhour_lines ADD sort_order int NOT NULL CONSTRAINT DF_manhour_lines_sort_order DEFAULT (2147483647);
ALTER TABLE dbo.expense_lines ADD sort_order int NOT NULL CONSTRAINT DF_expense_lines_sort_order DEFAULT (2147483647);
ALTER TABLE dbo.other_cost_lines ADD sort_order int NOT NULL CONSTRAINT DF_other_cost_lines_sort_order DEFAULT (2147483647);
INSERT dbo.schema_versions(version,name) VALUES(45,N'Shared estimate module and cost line ordering');
COMMIT TRANSACTION;
GO
