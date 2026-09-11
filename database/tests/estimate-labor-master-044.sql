/*
  Acceptance fixture for migration 044 — reusable labor rate masters and labor packages.

  Run against a DISPOSABLE database only. It writes real rows and rolls every one of
  them back; it must never be pointed at Team Test or production.

      sqllocaldb create LaborMasterCheck -s
      sqlcmd -S "(localdb)\LaborMasterCheck" -E -b -C -i database/scripts/020_deploy_fresh_database.sql -v DatabaseName="LaborMasterCheck"
      sqlcmd -S "(localdb)\LaborMasterCheck" -E -b -C -d LaborMasterCheck -i database/migrations/044_estimate_labor_masters.sql
      sqlcmd -S "(localdb)\LaborMasterCheck" -E -b -C -d LaborMasterCheck -i database/tests/estimate-labor-master-044.sql
      sqllocaldb delete LaborMasterCheck

  The question it answers: can an Engineering Manager change a rate master without
  repricing or invalidating an estimate that was already priced from it?

  Two implementation notes, both forced by SQL Server rather than chosen:

  * sqlcmd leaves QUOTED_IDENTIFIER off, which the filtered indexes and computed
    columns on these tables reject, so the migrations' SET block is repeated here.
  * failures accumulate in a scalar nvarchar, not a table variable. The deliberate
    rejections at the end can doom the transaction, and a doomed transaction cannot
    write to any log — including tempdb's — but scalar assignment still works.
*/

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET ARITHABORT ON;
SET NUMERIC_ROUNDABORT OFF;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 44
               AND name = N'Reusable labor rate masters and estimate labor packages')
    THROW 51460, 'Apply migration 044 before this fixture.', 1;
GO

BEGIN TRANSACTION;
GO

DECLARE @failures nvarchar(max) = N'';
DECLARE @failureCount int = 0;

/* Every deliberate rejection is listed before anything can go wrong, so the loop
   at the end only ever reads this table variable. */
DECLARE @checks TABLE (ordinal int IDENTITY(1,1) NOT NULL, assertion nvarchar(200) NOT NULL, statement nvarchar(max) NOT NULL);
INSERT @checks(assertion, statement) VALUES
 (N'an hourly package line without hours is rejected',
  N'INSERT dbo.labor_package_lines(package_id,sort_order,activity,department,level,cost_type,provider,rate_basis,default_engineers,default_man_days,default_hours,default_hours_per_day,reference_daily_rate) VALUES(@p,11,N''x'',N''Engineering'',N''Middle Engineer'',N''Engineering'',N''Internal'',N''Hourly'',1,1,NULL,8,0);'),
 (N'a daily package line carrying hours is rejected',
  N'INSERT dbo.labor_package_lines(package_id,sort_order,activity,department,level,cost_type,provider,rate_basis,default_engineers,default_man_days,default_hours,default_hours_per_day,reference_daily_rate) VALUES(@p,12,N''x'',N''Engineering'',N''Middle Engineer'',N''Engineering'',N''Internal'',N''Daily'',1,1,8,8,0);'),
 (N'a supplier package line without a reference rate is rejected',
  N'INSERT dbo.labor_package_lines(package_id,sort_order,activity,department,level,cost_type,provider,rate_basis,default_engineers,default_man_days,default_hours_per_day,reference_daily_rate) VALUES(@p,13,N''x'',N''Engineering'',N''Middle Engineer'',N''Engineering'',N''Supplier'',N''Daily'',1,1,8,0);'),
 (N'zero effort on a package line is rejected',
  N'INSERT dbo.labor_package_lines(package_id,sort_order,activity,department,level,cost_type,provider,rate_basis,default_engineers,default_man_days,default_hours_per_day,reference_daily_rate) VALUES(@p,14,N''x'',N''Engineering'',N''Middle Engineer'',N''Engineering'',N''Internal'',N''Daily'',0,1,8,0);'),
 (N'more than 24 hours in a day is rejected',
  N'INSERT dbo.labor_package_lines(package_id,sort_order,activity,department,level,cost_type,provider,rate_basis,default_engineers,default_man_days,default_hours_per_day,reference_daily_rate) VALUES(@p,15,N''x'',N''Engineering'',N''Middle Engineer'',N''Engineering'',N''Internal'',N''Daily'',1,1,25,0);'),
 (N'an unknown ERP category is rejected on a package line',
  N'INSERT dbo.labor_package_lines(package_id,sort_order,activity,department,level,cost_type,provider,rate_basis,default_engineers,default_man_days,default_hours_per_day,reference_daily_rate,default_erp_category) VALUES(@p,16,N''x'',N''Engineering'',N''Middle Engineer'',N''Engineering'',N''Internal'',N''Daily'',1,1,8,0,N''Consumables'');'),
 (N'Unmapped is rejected as a package line default',
  N'INSERT dbo.labor_package_lines(package_id,sort_order,activity,department,level,cost_type,provider,rate_basis,default_engineers,default_man_days,default_hours_per_day,reference_daily_rate,default_erp_category) VALUES(@p,17,N''x'',N''Engineering'',N''Middle Engineer'',N''Engineering'',N''Internal'',N''Daily'',1,1,8,0,N''Unmapped'');'),
 (N'an unknown cost type is rejected on a package',
  N'INSERT dbo.labor_packages(code,name,cost_type,created_by,updated_by) VALUES(N''LP-BAD-1'',N''x'',N''Commissioning'',@m,@m);'),
 (N'an unknown status is rejected on a package',
  N'INSERT dbo.labor_packages(code,name,cost_type,status,created_by,updated_by) VALUES(N''LP-BAD-2'',N''x'',N''Engineering'',N''Published'',@m,@m);'),
 (N'a retired package without a retired_at stamp is rejected',
  N'INSERT dbo.labor_packages(code,name,cost_type,status,created_by,updated_by) VALUES(N''LP-BAD-3'',N''x'',N''Engineering'',N''Retired'',@m,@m);'),
 (N'a duplicate package code is rejected',
  N'INSERT dbo.labor_packages(code,name,cost_type,created_by,updated_by) VALUES(N''LP-COMM'',N''x'',N''Engineering'',@m,@m);'),
 (N'an unknown ERP category is rejected on a rate master',
  N'INSERT dbo.engineering_rates(level,department,engineering_hourly,engineering_daily,installation_hourly,installation_daily,effective_from,created_by,default_erp_category) VALUES(N''Fixture Level'',N''Fixture Dept'',1,1,1,1,''2026-01-01'',@m,N''Consumables'');'),
 (N'a half-linked supersede chain is rejected',
  N'INSERT dbo.engineering_rates(level,department,engineering_hourly,engineering_daily,installation_hourly,installation_daily,effective_from,created_by,superseded_by_rate_id) VALUES(N''Fixture Level 2'',N''Fixture Dept'',1,1,1,1,''2026-01-01'',@m,@r);'),
 -- Last, because a THROW inside a trigger dooms the transaction beyond savepoint recovery.
 (N'an overlapping active rate period is rejected',
  N'INSERT dbo.engineering_rates(level,department,engineering_hourly,engineering_daily,installation_hourly,installation_daily,effective_from,created_by) VALUES(N''Middle Engineer'',N''Engineering'',1,1,1,1,''2026-03-10'',@m);');

/* ── fixture ─────────────────────────────────────────────────────────────── */

DECLARE @engineer bigint, @manager bigint, @customer bigint, @inquiry bigint, @estimate bigint;

INSERT dbo.users(email, name, role_id, is_active)
VALUES(N'labor.fixture.engineer@example.invalid', N'Fixture Engineer',
       (SELECT id FROM dbo.roles WHERE code = N'Engineer'), 1);
SET @engineer = SCOPE_IDENTITY();

INSERT dbo.users(email, name, role_id, is_active)
VALUES(N'labor.fixture.manager@example.invalid', N'Fixture Manager',
       (SELECT id FROM dbo.roles WHERE code = N'Engineering Manager'), 1);
SET @manager = SCOPE_IDENTITY();

INSERT dbo.customers(code, name, created_by, updated_by)
VALUES(N'LABORFIX', N'Labor Fixture Customer', @manager, @manager);
SET @customer = SCOPE_IDENTITY();

INSERT dbo.inquiries(inquiry_no, inquiry_date, customer_id, project_name, project_type,
                     estimate_owner_id, due_date, priority, status, created_by, updated_by)
VALUES(N'INQ-LABORFIX-044', '2026-01-05', @customer, N'Labor fixture project', N'Automation',
       @engineer, '2026-03-31', N'Normal', N'Estimating', @manager, @manager);
SET @inquiry = SCOPE_IDENTITY();

INSERT dbo.estimates(estimate_no, inquiry_id, customer_id, project_name, project_type, owner_id,
                     created_date, due_date, status, created_by, updated_by)
VALUES(N'EST-LABORFIX-044', @inquiry, @customer, N'Labor fixture project', N'Automation', @engineer,
       '2026-01-05', '2026-03-31', N'Engineering Input', @manager, @manager);
SET @estimate = SCOPE_IDENTITY();

/* The incumbent rate: open-ended, exactly the shape a rate created before this
   migration has, so the test exercises the real upgrade case. */
DECLARE @incumbent bigint;
INSERT dbo.engineering_rates(level, department, engineering_hourly, engineering_daily,
                             installation_hourly, installation_daily, effective_from, effective_to,
                             created_by, code, role_activity, default_erp_category)
VALUES(N'Middle Engineer', N'Engineering', 625, 5000, 500, 4000, '2026-01-01', NULL,
       @manager, N'ENG-MID', N'Commissioning', N'Service');
SET @incumbent = SCOPE_IDENTITY();

/* A man-hour line priced from it, the way the API writes one: daily_rate copied
   from the master's engineering_daily and frozen on the row. */
DECLARE @line bigint;
INSERT dbo.manhour_lines(estimate_id, revision, package, activity, department, level, cost_type,
                         provider, price_date, engineers, man_days, hours_per_day, daily_rate,
                         owner_id, created_by, updated_by)
VALUES(@estimate, 0, N'Commissioning', N'Site commissioning', N'Engineering', N'Middle Engineer',
       N'Engineering', N'Internal', '2026-02-10', 2, 1.25, 8, 5000, @engineer, @engineer, @engineer);
SET @line = SCOPE_IDENTITY();

DECLARE @rate_before decimal(19,4) = (SELECT daily_rate FROM dbo.manhour_lines WHERE id = @line);
DECLARE @cost_before decimal(19,4) = (SELECT line_cost FROM dbo.manhour_lines WHERE id = @line);
DECLARE @engineering_before decimal(19,4) = (SELECT engineering_total FROM dbo.v_estimate_totals WHERE estimate_id = @estimate);

IF EXISTS (SELECT 1 FROM dbo.fn_estimate_validation(@estimate) WHERE code = N'internal_rate_mismatch')
    SELECT @failureCount += 1, @failures += N'- baseline line does not validate against its own master rate' + CHAR(10);

/* ── the supersede, exactly as the API performs it ───────────────────────── */

DECLARE @successor_from date = '2026-03-01';
DECLARE @successor bigint;

-- 1. Close the incumbent the day before the successor starts.
UPDATE dbo.engineering_rates
SET effective_to = DATEADD(day, -1, @successor_from), updated_by = @manager, updated_at = SYSUTCDATETIME()
WHERE id = @incumbent;

-- 2. Insert the successor. tr_engineering_rates_no_overlap would reject this if
--    step 1 had not run first, which is why the order is fixed in the route.
INSERT dbo.engineering_rates(level, department, engineering_hourly, engineering_daily,
                             installation_hourly, installation_daily, effective_from, effective_to,
                             created_by, updated_by, updated_at, code, role_activity,
                             default_erp_category, version)
VALUES(N'Middle Engineer', N'Engineering', 700, 5600, 560, 4480, @successor_from, NULL,
       @manager, @manager, SYSUTCDATETIME(), N'ENG-MID', N'Commissioning', N'Service',
       (SELECT version + 1 FROM dbo.engineering_rates WHERE id = @incumbent));
SET @successor = SCOPE_IDENTITY();

-- 3. Link the chain.
UPDATE dbo.engineering_rates
SET superseded_by_rate_id = @successor, superseded_at = SYSUTCDATETIME()
WHERE id = @incumbent;

/* ── the assertions that matter ──────────────────────────────────────────── */

DECLARE @rate_after decimal(19,4) = (SELECT daily_rate FROM dbo.manhour_lines WHERE id = @line);
DECLARE @cost_after decimal(19,4) = (SELECT line_cost FROM dbo.manhour_lines WHERE id = @line);
DECLARE @engineering_after decimal(19,4) = (SELECT engineering_total FROM dbo.v_estimate_totals WHERE estimate_id = @estimate);

IF @rate_after <> @rate_before
    SELECT @failureCount += 1, @failures += CONCAT(N'- a saved line daily_rate moved: was ', @rate_before, N', now ', @rate_after, CHAR(10));

IF @cost_after <> @cost_before
    SELECT @failureCount += 1, @failures += CONCAT(N'- a saved line cost moved: was ', @cost_before, N', now ', @cost_after, CHAR(10));

IF @engineering_after <> @engineering_before
    SELECT @failureCount += 1, @failures += CONCAT(N'- the estimate engineering total moved: was ', @engineering_before, N', now ', @engineering_after, CHAR(10));

/* The one that a naive in-place edit would break: the saved line must still match
   an active master rate covering its own price_date, or submission starts failing
   422 on estimates nobody touched. */
IF EXISTS (SELECT 1 FROM dbo.fn_estimate_validation(@estimate) WHERE code = N'internal_rate_mismatch')
    SELECT @failureCount += 1, @failures += N'- a saved line stopped validating after its rate was superseded' + CHAR(10);

IF (SELECT version FROM dbo.engineering_rates WHERE id = @successor) <> 2
    SELECT @failureCount += 1, @failures += N'- the successor does not carry version 2' + CHAR(10);

IF (SELECT effective_to FROM dbo.engineering_rates WHERE id = @incumbent) <> '2026-02-28'
    SELECT @failureCount += 1, @failures += CONCAT(N'- the incumbent did not close the day before the successor: ',
        CONVERT(nvarchar(20), (SELECT effective_to FROM dbo.engineering_rates WHERE id = @incumbent)), CHAR(10));

IF NOT EXISTS (SELECT 1 FROM dbo.engineering_rates WHERE id = @incumbent AND is_active = 1)
    SELECT @failureCount += 1, @failures += N'- the superseded incumbent is no longer active over its own history' + CHAR(10);

IF NOT EXISTS (SELECT 1 FROM dbo.engineering_rates WHERE id = @incumbent AND superseded_by_rate_id = @successor AND superseded_at IS NOT NULL)
    SELECT @failureCount += 1, @failures += N'- the supersede chain is not linked' + CHAR(10);

/* What each date now resolves to — the lookup the API uses. */
DECLARE @resolved_old decimal(19,4) = (
    SELECT TOP(1) engineering_daily FROM dbo.engineering_rates
    WHERE level = N'Middle Engineer' AND department = N'Engineering' AND is_active = 1
      AND effective_from <= '2026-02-10' AND (effective_to IS NULL OR effective_to >= '2026-02-10')
    ORDER BY effective_from DESC, id DESC);
DECLARE @resolved_new decimal(19,4) = (
    SELECT TOP(1) engineering_daily FROM dbo.engineering_rates
    WHERE level = N'Middle Engineer' AND department = N'Engineering' AND is_active = 1
      AND effective_from <= '2026-03-15' AND (effective_to IS NULL OR effective_to >= '2026-03-15')
    ORDER BY effective_from DESC, id DESC);

IF @resolved_old <> 5000
    SELECT @failureCount += 1, @failures += CONCAT(N'- a date inside the old window resolves ', @resolved_old, N' instead of 5000', CHAR(10));
IF @resolved_new <> 5600
    SELECT @failureCount += 1, @failures += CONCAT(N'- a date after the change resolves ', @resolved_new, N' instead of 5600', CHAR(10));

/* A new line dated after the change picks up the new rate, and both validate. */
INSERT dbo.manhour_lines(estimate_id, revision, package, activity, department, level, cost_type,
                         provider, price_date, engineers, man_days, hours_per_day, daily_rate,
                         owner_id, created_by, updated_by)
VALUES(@estimate, 0, N'Commissioning', N'Hot commissioning', N'Engineering', N'Middle Engineer',
       N'Engineering', N'Internal', '2026-03-15', 1, 2, 8, 5600, @engineer, @engineer, @engineer);

IF EXISTS (SELECT 1 FROM dbo.fn_estimate_validation(@estimate) WHERE code = N'internal_rate_mismatch')
    SELECT @failureCount += 1, @failures += CONCAT(N'- old and new lines do not validate side by side: ',
        (SELECT TOP(1) message FROM dbo.fn_estimate_validation(@estimate) WHERE code = N'internal_rate_mismatch'), CHAR(10));

/* ── inactive master: why the API refuses to deactivate ──────────────────── */

/* Deactivating a rate is deliberately not exposed by the API, because it is the
   one change that does invalidate saved lines. Prove that here, so the reason
   the endpoint refuses it is recorded rather than merely asserted in prose. */
UPDATE dbo.engineering_rates SET is_active = 0 WHERE id = @incumbent;

IF (SELECT daily_rate FROM dbo.manhour_lines WHERE id = @line) <> @rate_before
    SELECT @failureCount += 1, @failures += N'- deactivating a rate changed a saved line amount' + CHAR(10);

IF NOT EXISTS (SELECT 1 FROM dbo.fn_estimate_validation(@estimate) WHERE code = N'internal_rate_mismatch')
    SELECT @failureCount += 1, @failures += N'- deactivating a rate did not raise internal_rate_mismatch, so the API refusal has no basis' + CHAR(10);

UPDATE dbo.engineering_rates SET is_active = 1 WHERE id = @incumbent;

IF EXISTS (SELECT 1 FROM dbo.fn_estimate_validation(@estimate) WHERE code = N'internal_rate_mismatch')
    SELECT @failureCount += 1, @failures += N'- reactivating the rate did not restore validity' + CHAR(10);

/* ── labor package storage and ERP seeding ───────────────────────────────── */

DECLARE @package bigint;
INSERT dbo.labor_packages(code, name, cost_type, department, description, status, created_by, updated_by)
VALUES(N'LP-COMM', N'Commissioning', N'Engineering', N'Engineering', N'Fixture package', N'Active', @manager, @manager);
SET @package = SCOPE_IDENTITY();

INSERT dbo.labor_package_lines(package_id, sort_order, activity, department, level, cost_type, provider,
                               rate_id, rate_basis, default_engineers, default_man_days, default_hours,
                               default_hours_per_day, reference_daily_rate, default_erp_category)
VALUES(@package, 0, N'Site commissioning', N'Engineering', N'Middle Engineer', N'Engineering', N'Internal',
       @incumbent, N'Hourly', 2, 1.25, 10, 8, 5000, N'Service');

IF (SELECT COUNT(*) FROM dbo.labor_package_lines WHERE package_id = @package AND deleted_at IS NULL) <> 1
    SELECT @failureCount += 1, @failures += N'- the labor package line was not stored' + CHAR(10);

/* rate_id is provenance only, so a superseded rate must not orphan the line. */
IF NOT EXISTS (SELECT 1 FROM dbo.labor_package_lines l
               INNER JOIN dbo.engineering_rates r ON r.id = l.rate_id
               WHERE l.package_id = @package AND r.superseded_by_rate_id IS NOT NULL)
    SELECT @failureCount += 1, @failures += N'- the package line lost its rate provenance' + CHAR(10);

/* An ERP mapping seeded at apply time, exactly as the apply endpoint writes one. */
INSERT dbo.estimate_erp_mappings(estimate_id, revision, source_type, source_id, erp_category, created_by, updated_by)
SELECT @estimate, 0, N'ManhourLine', @line, N'Service', @manager, @manager
WHERE NOT EXISTS (SELECT 1 FROM dbo.estimate_erp_mappings m
                  WHERE m.estimate_id = @estimate AND m.revision = 0
                    AND m.source_type = N'ManhourLine' AND m.source_id = @line);

IF NOT EXISTS (SELECT 1 FROM dbo.estimate_erp_mappings
               WHERE estimate_id = @estimate AND source_type = N'ManhourLine' AND source_id = @line AND erp_category = N'Service')
    SELECT @failureCount += 1, @failures += N'- the ERP category could not be seeded for a man-hour line' + CHAR(10);

/* The same statement run again must not add or change anything, which is what
   protects a category the estimator chose by hand. */
INSERT dbo.estimate_erp_mappings(estimate_id, revision, source_type, source_id, erp_category, created_by, updated_by)
SELECT @estimate, 0, N'ManhourLine', @line, N'Installation', @manager, @manager
WHERE NOT EXISTS (SELECT 1 FROM dbo.estimate_erp_mappings m
                  WHERE m.estimate_id = @estimate AND m.revision = 0
                    AND m.source_type = N'ManhourLine' AND m.source_id = @line);

IF (SELECT COUNT(*) FROM dbo.estimate_erp_mappings WHERE estimate_id = @estimate AND source_type = N'ManhourLine' AND source_id = @line) <> 1
    OR (SELECT TOP(1) erp_category FROM dbo.estimate_erp_mappings WHERE estimate_id = @estimate AND source_type = N'ManhourLine' AND source_id = @line) <> N'Service'
    SELECT @failureCount += 1, @failures += N'- re-seeding overwrote an existing ERP mapping' + CHAR(10);

/* ── deliberate rejections ───────────────────────────────────────────────── */

/* XACT_ABORT has to come off here: with it on, a constraint violation dooms the
   whole transaction and a savepoint cannot bring it back. */
SET XACT_ABORT OFF;

DECLARE @ordinal int, @assertion nvarchar(200), @statement nvarchar(max), @evaluated int = 0;
DECLARE rejected CURSOR LOCAL FAST_FORWARD FOR SELECT ordinal, assertion, statement FROM @checks ORDER BY ordinal;
OPEN rejected;
FETCH NEXT FROM rejected INTO @ordinal, @assertion, @statement;
WHILE @@FETCH_STATUS = 0
BEGIN
    IF XACT_STATE() = -1
        SELECT @failureCount += 1, @failures += CONCAT(N'- not evaluated (transaction doomed by an earlier check): ', @assertion, CHAR(10));
    ELSE
    BEGIN
        BEGIN TRY
            SAVE TRANSACTION labor_check;
            EXEC sys.sp_executesql @statement,
                 N'@p bigint, @m bigint, @r bigint', @p = @package, @m = @manager, @r = @incumbent;
            ROLLBACK TRANSACTION labor_check;
            SELECT @failureCount += 1, @failures += CONCAT(N'- accepted a write it should have rejected: ', @assertion, CHAR(10));
        END TRY
        BEGIN CATCH
            IF XACT_STATE() <> -1 ROLLBACK TRANSACTION labor_check;
            SET @evaluated += 1;
        END CATCH;
    END;
    FETCH NEXT FROM rejected INTO @ordinal, @assertion, @statement;
END;
CLOSE rejected;
DEALLOCATE rejected;

IF @evaluated <> (SELECT COUNT(*) FROM @checks)
    SELECT @failureCount += 1, @failures += CONCAT(N'- only ', @evaluated, N' of ',
        (SELECT COUNT(*) FROM @checks), N' rejection checks were evaluated', CHAR(10));

/* ── verdict ─────────────────────────────────────────────────────────────── */

IF @failureCount > 0
BEGIN
    PRINT CONCAT(N'FAIL - ', @failureCount, N' assertion(s):');
    PRINT @failures;
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW 51461, 'Labor master fixture assertions failed; see the printed list.', 1;
END;

PRINT CONCAT(N'PASS - ', @evaluated, N' rejection checks plus the rate-freeze, validity, resolution, ERP-seeding and package-storage assertions.');
PRINT CONCAT(N'  saved line daily_rate before/after supersede : ', @rate_before, N' / ', @rate_after);
PRINT CONCAT(N'  saved line cost before/after supersede       : ', @cost_before, N' / ', @cost_after);
PRINT CONCAT(N'  estimate engineering total before/after      : ', @engineering_before, N' / ', @engineering_after);
PRINT CONCAT(N'  rate resolved on 2026-02-10 / 2026-03-15     : ', @resolved_old, N' / ', @resolved_new);

/* Every row this fixture created is discarded. */
IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
GO

SET XACT_ABORT ON;
GO

IF EXISTS (SELECT 1 FROM dbo.users WHERE email LIKE N'labor.fixture.%@example.invalid')
    OR EXISTS (SELECT 1 FROM dbo.labor_packages WHERE code = N'LP-COMM')
    OR EXISTS (SELECT 1 FROM dbo.engineering_rates WHERE code = N'ENG-MID')
    THROW 51462, 'The labor master fixture left rows behind; investigate before trusting this run.', 1;

PRINT N'Rollback verified: the fixture left no rows behind.';
GO
