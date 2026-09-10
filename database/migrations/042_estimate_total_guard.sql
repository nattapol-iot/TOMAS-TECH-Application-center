SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF EXISTS (
    SELECT 1 FROM dbo.schema_versions
    WHERE version = 42
      AND name <> N'Guard estimate aggregates within supported decimal precision'
)
    THROW 51421, 'Schema version 042 is already used by another migration.', 1;

IF NOT EXISTS (
    SELECT 1 FROM dbo.schema_versions
    WHERE version = 41
      AND name = N'Admin-managed primary user roles with audited least-privilege writes'
)
    THROW 51422, 'Apply migration 041 before migration 042.', 1;

BEGIN TRANSACTION;
GO

CREATE OR ALTER PROCEDURE dbo.assert_estimate_totals
    @estimate_id bigint
WITH EXECUTE AS OWNER
AS
BEGIN
    SET NOCOUNT ON;

    -- Force every monetary output through the supported storage boundary.
    -- A table variable prevents an unused scalar assignment from being pruned.
    DECLARE @validated TABLE (
        material_total decimal(19,4) NULL,
        engineering_total decimal(19,4) NULL,
        outsource_total decimal(19,4) NULL,
        transportation_total decimal(19,4) NULL,
        accommodation_total decimal(19,4) NULL,
        other_total decimal(19,4) NULL,
        base_total decimal(19,4) NULL,
        internal_direct_hours decimal(38,6) NULL,
        overhead_hourly_rate decimal(19,4) NULL,
        overhead_total decimal(19,4) NULL,
        contingency_total decimal(19,4) NULL,
        total decimal(19,4) NULL
    );

    BEGIN TRY
        INSERT INTO @validated (
            material_total, engineering_total, outsource_total,
            transportation_total, accommodation_total, other_total,
            base_total, internal_direct_hours, overhead_hourly_rate, overhead_total,
            contingency_total, total
        )
        SELECT
            CONVERT(decimal(19,4), material_total),
            CONVERT(decimal(19,4), engineering_total),
            CONVERT(decimal(19,4), outsource_total),
            CONVERT(decimal(19,4), transportation_total),
            CONVERT(decimal(19,4), accommodation_total),
            CONVERT(decimal(19,4), other_total),
            CONVERT(decimal(19,4), base_total),
            CONVERT(decimal(38,6), internal_direct_hours),
            CONVERT(decimal(19,4), overhead_hourly_rate),
            CONVERT(decimal(19,4), overhead_total),
            CONVERT(decimal(19,4), contingency_total),
            CONVERT(decimal(19,4), total)
        FROM dbo.v_estimate_totals
        WHERE estimate_id = @estimate_id;
    END TRY
    BEGIN CATCH
        IF ERROR_NUMBER() = 8115
        BEGIN
            DECLARE @message nvarchar(2048) = N'Estimate '
                + CONVERT(nvarchar(20), @estimate_id)
                + N' totals exceed the supported decimal(19,4) aggregate range.';
            THROW 51420, @message, 1;
        END;
        THROW;
    END CATCH;
END;
GO

REVOKE EXECUTE ON OBJECT::dbo.assert_estimate_totals FROM [public];
IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL
    GRANT EXECUTE ON OBJECT::dbo.assert_estimate_totals TO [iot_team_app_role];
GO

DECLARE @estimate_id bigint;
DECLARE estimate_cursor CURSOR LOCAL FAST_FORWARD FOR
    SELECT id FROM dbo.estimates WHERE deleted_at IS NULL ORDER BY id;

OPEN estimate_cursor;
FETCH NEXT FROM estimate_cursor INTO @estimate_id;
WHILE @@FETCH_STATUS = 0
BEGIN
    EXEC dbo.assert_estimate_totals @estimate_id = @estimate_id;
    FETCH NEXT FROM estimate_cursor INTO @estimate_id;
END;
CLOSE estimate_cursor;
DEALLOCATE estimate_cursor;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 42)
    INSERT INTO dbo.schema_versions(version, name)
    VALUES(42, N'Guard estimate aggregates within supported decimal precision');

COMMIT TRANSACTION;
GO
