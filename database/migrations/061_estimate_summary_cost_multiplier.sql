SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO
IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version=61 AND name<>N'Summary set quantities multiply totals without changing components')
    THROW 51611, 'Schema version 061 is already used by another migration.', 1;
IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version=60)
    THROW 51612, 'Apply migration 060 before migration 061.', 1;
BEGIN TRANSACTION;
GO
IF COL_LENGTH(N'dbo.estimate_module_details', N'cost_multiplier') IS NULL
    ALTER TABLE dbo.estimate_module_details ADD cost_multiplier decimal(19,4) NOT NULL
        CONSTRAINT DF_estimate_module_cost_multiplier DEFAULT(1)
        CONSTRAINT CK_estimate_module_cost_multiplier CHECK(cost_multiplier>0);
GO
-- Old summary quantities were presentation-only. Adopt them only for editable,
-- current revisions; submitted/approved and historical revision amounts stay fixed.
IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version=61)
BEGIN
    UPDATE d SET cost_multiplier=d.quantity
    FROM dbo.estimate_module_details d
    INNER JOIN dbo.estimates e ON e.id=d.estimate_id AND e.revision=d.revision
    WHERE e.deleted_at IS NULL AND e.status IN(N'Draft',N'Engineering Input',N'Engineering Review',N'Revision Required')
      AND d.module_key LIKE N'erp:category:[0-9][0-9]:%';
END;
GO
CREATE OR ALTER VIEW dbo.v_estimate_cost_amounts
AS
SELECT ci.id,ci.estimate_id,ci.revision,ci.category_code,
    CONVERT(decimal(19,4),ci.line_total*COALESCE(d.cost_multiplier,1)) amount
FROM dbo.cost_items ci
LEFT JOIN dbo.estimate_module_details d ON d.estimate_id=ci.estimate_id AND d.revision=ci.revision
    AND d.module_key=CONCAT(N'erp:category:',ci.category_code,N':',LTRIM(RTRIM(ci.module))) COLLATE Latin1_General_100_BIN2
    AND NULLIF(LTRIM(RTRIM(ci.module)),N'') IS NOT NULL
WHERE ci.deleted_at IS NULL;
GO
CREATE OR ALTER VIEW dbo.v_estimate_totals
AS
WITH material AS (
    SELECT estimate_id, revision,
           SUM(CASE WHEN category_code IN ('01','02','03','04','05') THEN amount ELSE 0 END) AS material_total,
           SUM(CASE WHEN category_code = '07' THEN amount ELSE 0 END) AS outsource_total,
           SUM(CASE WHEN category_code = '08' THEN amount ELSE 0 END) AS transportation_total,
           SUM(CASE WHEN category_code = '09' THEN amount ELSE 0 END) AS accommodation_total,
           SUM(CASE WHEN category_code IN ('06','10') THEN amount ELSE 0 END) AS other_total
    FROM dbo.v_estimate_cost_amounts GROUP BY estimate_id, revision
), effort AS (
    SELECT estimate_id, revision, SUM(line_cost) AS engineering_total,
           SUM(CASE WHEN provider=N'Internal' THEN engineers*man_days*hours_per_day ELSE 0 END) AS internal_direct_hours
    FROM dbo.manhour_lines WHERE deleted_at IS NULL GROUP BY estimate_id, revision
), expense AS (
    SELECT estimate_id, revision,
           SUM(CASE WHEN expense_type IN (N'Travel',N'Transportation') THEN line_total ELSE 0 END) AS transportation_expense,
           SUM(CASE WHEN expense_type IN (N'Accommodation',N'Per Diem') THEN line_total ELSE 0 END) AS accommodation_expense,
           SUM(CASE WHEN expense_type NOT IN (N'Travel',N'Transportation',N'Accommodation',N'Per Diem') THEN line_total ELSE 0 END) AS other_expense
    FROM dbo.expense_lines WHERE deleted_at IS NULL GROUP BY estimate_id, revision
), other_cost AS (
    SELECT estimate_id, revision,
           SUM(CASE WHEN category=N'Outsource' THEN line_total ELSE 0 END) AS outsource_total,
           SUM(CASE WHEN category=N'Transportation' THEN line_total ELSE 0 END) AS transportation_total,
           SUM(CASE WHEN category=N'Accommodation' THEN line_total ELSE 0 END) AS accommodation_total,
           SUM(CASE WHEN category NOT IN (N'Outsource',N'Transportation',N'Accommodation') THEN line_total ELSE 0 END) AS other_total
    FROM dbo.other_cost_lines WHERE deleted_at IS NULL GROUP BY estimate_id, revision
), base AS (
    SELECT e.id estimate_id,
           COALESCE(m.material_total,0) material_total,
           COALESCE(f.engineering_total,0) engineering_total,
           COALESCE(m.outsource_total,0)+COALESCE(o.outsource_total,0) outsource_total,
           COALESCE(m.transportation_total,0)+COALESCE(x.transportation_expense,0)+COALESCE(o.transportation_total,0) transportation_total,
           COALESCE(m.accommodation_total,0)+COALESCE(x.accommodation_expense,0)+COALESCE(o.accommodation_total,0) accommodation_total,
           COALESCE(m.other_total,0)+COALESCE(x.other_expense,0)+COALESCE(o.other_total,0) other_total,
           COALESCE(f.internal_direct_hours,0) internal_direct_hours,e.contingency_rate,
           snapshot.policy_id,snapshot.policy_version,snapshot.hourly_rate,snapshot.monthly_budget overhead_monthly_budget
    FROM dbo.estimates e
    LEFT JOIN material m ON m.estimate_id=e.id AND m.revision=e.revision
    LEFT JOIN effort f ON f.estimate_id=e.id AND f.revision=e.revision
    LEFT JOIN expense x ON x.estimate_id=e.id AND x.revision=e.revision
    LEFT JOIN other_cost o ON o.estimate_id=e.id AND o.revision=e.revision
    LEFT JOIN dbo.estimate_overhead_snapshots snapshot ON snapshot.estimate_id=e.id AND snapshot.revision=e.revision
    WHERE e.deleted_at IS NULL
), calculated AS (
    SELECT *,CONVERT(decimal(19,4),material_total+engineering_total+outsource_total+transportation_total+accommodation_total+other_total) base_total,
      CASE WHEN policy_id IS NULL THEN NULL ELSE CONVERT(decimal(19,4),ROUND(internal_direct_hours*hourly_rate,4)) END overhead_total
    FROM base
)
SELECT estimate_id,material_total,engineering_total,outsource_total,transportation_total,accommodation_total,other_total,
       base_total,internal_direct_hours,policy_id overhead_policy_id,policy_version overhead_policy_version,
       CASE WHEN policy_id IS NULL THEN N'Missing' WHEN overhead_monthly_budget=0 THEN N'Zero' ELSE N'Applied' END overhead_state,
       hourly_rate overhead_hourly_rate,overhead_total,
       CONVERT(decimal(19,4),ROUND(base_total*contingency_rate/100.0,0)) contingency_total,
       CONVERT(decimal(19,4),base_total+COALESCE(overhead_total,0)+ROUND(base_total*contingency_rate/100.0,0)) total
FROM calculated;
GO
-- Run the same aggregate guard used by writes before accepting this migration.
DECLARE @estimate_id bigint;
DECLARE estimates CURSOR LOCAL FAST_FORWARD FOR SELECT id FROM dbo.estimates WHERE deleted_at IS NULL;
OPEN estimates;
FETCH NEXT FROM estimates INTO @estimate_id;
WHILE @@FETCH_STATUS=0
BEGIN
    EXEC dbo.assert_estimate_totals @estimate_id=@estimate_id;
    FETCH NEXT FROM estimates INTO @estimate_id;
END;
CLOSE estimates;
DEALLOCATE estimates;
IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL
    GRANT SELECT ON OBJECT::dbo.v_estimate_cost_amounts TO [iot_team_app_role];
IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version=61)
    INSERT INTO dbo.schema_versions(version,name)
    VALUES(61,N'Summary set quantities multiply totals without changing components');
COMMIT TRANSACTION;
GO
