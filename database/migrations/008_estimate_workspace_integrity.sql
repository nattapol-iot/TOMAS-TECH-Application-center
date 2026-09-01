SET XACT_ABORT ON;
SET NOCOUNT ON;
GO

IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 8)
    THROW 51110, 'Migration 008 has already been applied.', 1;

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 7)
    THROW 51111, 'Migration 007 must be applied before migration 008.', 1;
GO

BEGIN TRANSACTION;
GO

-- Every mutable estimate line must belong to the estimate's current revision.
-- Request-revision code must therefore advance dbo.estimates.revision while it
-- holds the estimate lock, then clone the old lines into that new revision in
-- the same transaction. Historical and speculative future inserts are rejected.
CREATE OR ALTER TRIGGER dbo.trg_cost_items_current_revision_only
ON dbo.cost_items
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;

    IF EXISTS (
        SELECT 1
        FROM inserted i
        INNER JOIN dbo.estimates e ON e.id = i.estimate_id
        WHERE i.revision <> e.revision
    ) OR EXISTS (
        SELECT 1
        FROM deleted d
        INNER JOIN dbo.estimates e ON e.id = d.estimate_id
        WHERE d.revision <> e.revision
    )
        THROW 51112, 'Cost items can be inserted or changed only in the current estimate revision.', 1;
END;
GO

CREATE OR ALTER TRIGGER dbo.trg_manhour_lines_current_revision_only
ON dbo.manhour_lines
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;

    IF EXISTS (
        SELECT 1
        FROM inserted i
        INNER JOIN dbo.estimates e ON e.id = i.estimate_id
        WHERE i.revision <> e.revision
    ) OR EXISTS (
        SELECT 1
        FROM deleted d
        INNER JOIN dbo.estimates e ON e.id = d.estimate_id
        WHERE d.revision <> e.revision
    )
        THROW 51113, 'Man-hour lines can be inserted or changed only in the current estimate revision.', 1;
END;
GO

CREATE OR ALTER TRIGGER dbo.trg_expense_lines_current_revision_only
ON dbo.expense_lines
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;

    IF EXISTS (
        SELECT 1
        FROM inserted i
        INNER JOIN dbo.estimates e ON e.id = i.estimate_id
        WHERE i.revision <> e.revision
    ) OR EXISTS (
        SELECT 1
        FROM deleted d
        INNER JOIN dbo.estimates e ON e.id = d.estimate_id
        WHERE d.revision <> e.revision
    )
        THROW 51114, 'Expense lines can be inserted or changed only in the current estimate revision.', 1;
END;
GO

CREATE OR ALTER TRIGGER dbo.trg_other_cost_lines_current_revision_only
ON dbo.other_cost_lines
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;

    IF EXISTS (
        SELECT 1
        FROM inserted i
        INNER JOIN dbo.estimates e ON e.id = i.estimate_id
        WHERE i.revision <> e.revision
    ) OR EXISTS (
        SELECT 1
        FROM deleted d
        INNER JOIN dbo.estimates e ON e.id = d.estimate_id
        WHERE d.revision <> e.revision
    )
        THROW 51115, 'Other-cost lines can be inserted or changed only in the current estimate revision.', 1;
END;
GO

-- Keep the established four-column, blocking-issue contract. Advisory checks
-- such as old prices and missing travel are intentionally not returned here:
-- the current API treats every returned row as a submission-blocking issue.
CREATE OR ALTER FUNCTION dbo.fn_estimate_validation(@estimate_id bigint)
RETURNS TABLE
AS
RETURN
(
    WITH current_estimate AS (
        SELECT id, revision
        FROM dbo.estimates
        WHERE id = @estimate_id AND deleted_at IS NULL
    ), current_cost_items AS (
        SELECT l.*
        FROM dbo.cost_items l
        INNER JOIN current_estimate e ON e.id = l.estimate_id AND e.revision = l.revision
        WHERE l.deleted_at IS NULL
    ), current_manhours AS (
        SELECT l.*
        FROM dbo.manhour_lines l
        INNER JOIN current_estimate e ON e.id = l.estimate_id AND e.revision = l.revision
        WHERE l.deleted_at IS NULL
    ), current_expenses AS (
        SELECT l.*
        FROM dbo.expense_lines l
        INNER JOIN current_estimate e ON e.id = l.estimate_id AND e.revision = l.revision
        WHERE l.deleted_at IS NULL
    ), current_other_costs AS (
        SELECT l.*
        FROM dbo.other_cost_lines l
        INNER JOIN current_estimate e ON e.id = l.estimate_id AND e.revision = l.revision
        WHERE l.deleted_at IS NULL
    )
    SELECT N'invalid_quantity' AS code,
           N'Quantity must be greater than zero.' AS message,
           N'CostItem' AS entity_type,
           l.id AS entity_id
    FROM current_cost_items l
    WHERE l.qty <= 0

    UNION ALL
    SELECT N'missing_unit_cost', N'Unit cost must be greater than zero.', N'CostItem', l.id
    FROM current_cost_items l
    WHERE l.unit_cost <= 0

    UNION ALL
    SELECT N'invalid_cost_owner', N'Every cost item must have an active engineering owner.', N'CostItem', l.id
    FROM current_cost_items l
    WHERE NOT EXISTS (
        SELECT 1
        FROM dbo.users u
        INNER JOIN dbo.roles r ON r.id = u.role_id
        WHERE u.id = l.owner_id
          AND u.is_active = 1
          AND u.deleted_at IS NULL
          AND r.code IN (N'Engineer', N'Engineering Manager', N'Admin')
    )

    UNION ALL
    SELECT N'invalid_cost_category', N'Cost category code and name must match the controlled cost structure.', N'CostItem', l.id
    FROM current_cost_items l
    WHERE NOT EXISTS (
        SELECT 1
        FROM (VALUES
            ('01', N'Hardware'), ('02', N'Software'), ('03', N'Electrical'),
            ('04', N'Mechanical'), ('05', N'Robot'), ('06', N'Engineering'),
            ('07', N'Outsource'), ('08', N'Transportation'),
            ('09', N'Accommodation'), ('10', N'Other Cost')
        ) category_map(code, name)
        WHERE category_map.code = l.category_code
          AND category_map.name = LTRIM(RTRIM(l.category))
    )

    UNION ALL
    SELECT N'duplicate_cost_item', N'Duplicate item code, model and description are not allowed in one revision.', N'CostItem', l.id
    FROM current_cost_items l
    WHERE EXISTS (
        SELECT 1
        FROM current_cost_items duplicate
        WHERE duplicate.id <> l.id
          AND LTRIM(RTRIM(duplicate.item_code)) = LTRIM(RTRIM(l.item_code))
          AND LTRIM(RTRIM(duplicate.model)) = LTRIM(RTRIM(l.model))
          AND LTRIM(RTRIM(duplicate.description)) = LTRIM(RTRIM(l.description))
    )

    UNION ALL
    SELECT N'invalid_manhour_values', N'Engineer quantity, man-days, hours per day and daily rate must be greater than zero.', N'ManhourLine', l.id
    FROM current_manhours l
    WHERE l.engineers <= 0 OR l.man_days <= 0 OR l.hours_per_day <= 0 OR l.daily_rate <= 0

    UNION ALL
    SELECT N'invalid_manhour_owner', N'Every man-hour line must have an active engineering owner.', N'ManhourLine', l.id
    FROM current_manhours l
    WHERE NOT EXISTS (
        SELECT 1
        FROM dbo.users u
        INNER JOIN dbo.roles r ON r.id = u.role_id
        WHERE u.id = l.owner_id
          AND u.is_active = 1
          AND u.deleted_at IS NULL
          AND r.code IN (N'Engineer', N'Engineering Manager', N'Admin')
    )

    UNION ALL
    SELECT N'supplier_quote_required', N'Supplier man-hour requires an active supplier and quotation number.', N'ManhourLine', l.id
    FROM current_manhours l
    WHERE l.provider = N'Supplier'
      AND (
          l.supplier_id IS NULL
          OR NULLIF(LTRIM(RTRIM(l.quotation_no)), N'') IS NULL
          OR NOT EXISTS (
              SELECT 1
              FROM dbo.suppliers s
              WHERE s.id = l.supplier_id AND s.is_active = 1 AND s.deleted_at IS NULL
          )
      )

    UNION ALL
    SELECT N'internal_rate_mismatch', N'Internal man-hour must use the effective Engineering Rate Master daily rate.', N'ManhourLine', l.id
    FROM current_manhours l
    WHERE l.provider = N'Internal'
      AND NOT EXISTS (
          SELECT 1
          FROM dbo.engineering_rates rate
          WHERE rate.level = l.level
            AND rate.department = l.department
            AND rate.is_active = 1
            AND rate.effective_from <= COALESCE(l.price_date, CONVERT(date, l.created_at))
            AND (rate.effective_to IS NULL OR rate.effective_to >= COALESCE(l.price_date, CONVERT(date, l.created_at)))
            AND l.daily_rate = CASE l.cost_type
                WHEN N'Engineering' THEN rate.engineering_daily
                WHEN N'Installation' THEN rate.installation_daily
            END
      )

    UNION ALL
    SELECT N'invalid_expense_values', N'Expense quantity and unit cost must be greater than zero.', N'ExpenseLine', l.id
    FROM current_expenses l
    WHERE l.qty <= 0 OR l.unit_cost <= 0

    UNION ALL
    SELECT N'invalid_expense_owner', N'Every expense line must have an active engineering owner.', N'ExpenseLine', l.id
    FROM current_expenses l
    WHERE NOT EXISTS (
        SELECT 1
        FROM dbo.users u
        INNER JOIN dbo.roles r ON r.id = u.role_id
        WHERE u.id = l.owner_id
          AND u.is_active = 1
          AND u.deleted_at IS NULL
          AND r.code IN (N'Engineer', N'Engineering Manager', N'Admin')
    )

    UNION ALL
    SELECT N'invalid_other_cost_values', N'Other-cost quantity and unit cost must be greater than zero.', N'OtherCostLine', l.id
    FROM current_other_costs l
    WHERE l.qty <= 0 OR l.unit_cost <= 0

    UNION ALL
    SELECT N'engineering_manhour_required', N'At least one engineering man-hour line is required.', N'Estimate', e.id
    FROM current_estimate e
    WHERE NOT EXISTS (
        SELECT 1 FROM current_manhours l WHERE l.cost_type = N'Engineering'
    )

    UNION ALL
    SELECT N'empty_estimate', N'At least one cost or effort line is required.', N'Estimate', e.id
    FROM current_estimate e
    WHERE NOT EXISTS (SELECT 1 FROM current_cost_items)
      AND NOT EXISTS (SELECT 1 FROM current_manhours)
      AND NOT EXISTS (SELECT 1 FROM current_expenses)
      AND NOT EXISTS (SELECT 1 FROM current_other_costs)
);
GO

INSERT INTO dbo.schema_versions(version, name)
VALUES (8, N'Production estimate workspace integrity and validation');

COMMIT TRANSACTION;
GO
