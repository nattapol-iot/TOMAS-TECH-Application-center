// Prints a T-SQL batch that runs the Installed Base route's own statements against a real schema:
//   node --import tsx tests/sql/installed-assets-smoke.ts > smoke.sql
//   sqlcmd -S <server> -d <database> -b -i smoke.sql
// Used by scripts/Test-SqlSmokeLocalDb.ps1 on a private LocalDB instance. Each statement is
// the exported constant the route sends, with its parameters declared, so a typo in a column, a
// join or a filter fails here instead of in production.
import {
  DETAIL_FOR_UPDATE_SQL, DETAIL_SQL, EVENT_INSERT_SQL, EVENTS_SQL, INSERT_SQL, LIST_SQL, REFERENCES_SQL, UPDATE_SQL,
} from "../../src/routes/installed-assets.js";

const declare = `
DECLARE @customer bigint, @customer_site bigint, @project bigint = NULL, @monitor_site bigint, @monitor_program bigint,
  @replaced_by bigint = NULL, @asset bigint = NULL, @id bigint, @actor bigint,
  @category nvarchar(20) = N'Gateway', @name nvarchar(200) = N'Edge Gateway Line 3', @manufacturer nvarchar(150) = N'Advantech',
  @model nvarchar(150) = N'ECU-1251', @serial nvarchar(150) = N'SN-001', @location nvarchar(300) = N'MDB 2F',
  @ip nvarchar(100) = N'10.0.0.5', @firmware nvarchar(100) = N'1.0.0', @repository nvarchar(100) = N'fts-plc-collect-data',
  @installed_on date = '2026-01-15', @warranty_until date = '2026-11-01', @status nvarchar(20) = N'Active', @notes nvarchar(2000) = N'',
  @search nvarchar(200) = NULL, @warranty nvarchar(20) = NULL, @today date = '2026-10-12', @offset int = 0, @page_size int = 50,
  @kind nvarchar(20), @summary nvarchar(500), @details nvarchar(max);`;

const fixture = `
SELECT TOP (1) @actor = id FROM dbo.users WHERE deleted_at IS NULL ORDER BY id;
IF @actor IS NULL
BEGIN
  INSERT dbo.users (entra_object_id, email, name, role_id, department)
  SELECT CONVERT(nvarchar(64), NEWID()), N'smoke@tomastc.com', N'Smoke Tester', id, N'IoT' FROM dbo.roles WHERE code = N'Admin';
  SET @actor = SCOPE_IDENTITY();
END;
INSERT dbo.customers (code, name, created_by, updated_by) VALUES (N'SMOKE', N'Smoke Customer', @actor, @actor);
SET @customer = SCOPE_IDENTITY();
INSERT dbo.customer_sites (customer_id, code, name, created_by, updated_by) VALUES (@customer, N'S1', N'Rayong plant', @actor, @actor);
SET @customer_site = SCOPE_IDENTITY();
INSERT dbo.monitor_sites (name, created_by) VALUES (N'Smoke Site', @actor);
SET @monitor_site = SCOPE_IDENTITY();
INSERT dbo.monitor_agents (site_id, name, key_hash, key_hint, created_by) VALUES (@monitor_site, N'PC-1', REPLICATE(N'a', 64), N'abcd', @actor);
INSERT dbo.monitor_programs (agent_id, program_key, name, reported_at) VALUES (SCOPE_IDENTITY(), N'collector', N'Collector', SYSUTCDATETIME());
SET @monitor_program = SCOPE_IDENTITY();`;

const check = (label: string, condition: string) =>
  `IF NOT (${condition}) THROW 51999, N'Smoke check failed: ${label.replaceAll("'", "''")}', 1;`;

const batch = `
SET NOCOUNT ON;
-- XACT_ABORT stays off: the expected constraint errors below must leave the transaction usable.
SET XACT_ABORT OFF;
BEGIN TRANSACTION;
${declare}
${fixture}

-- References: a consistent set passes, a program from another site does not.
DECLARE @refs TABLE (customer_ok int, site_ok int, project_ok int, monitor_site_ok int, program_ok int, replaced_ok int);
INSERT @refs EXEC sp_executesql N'${REFERENCES_SQL.replaceAll("'", "''")}',
  N'@customer bigint, @customer_site bigint, @project bigint, @monitor_site bigint, @monitor_program bigint, @replaced_by bigint, @asset bigint',
  @customer, @customer_site, @project, @monitor_site, @monitor_program, @replaced_by, @asset;
${check("references accepted", "(SELECT customer_ok + site_ok + project_ok + monitor_site_ok + program_ok + replaced_ok FROM @refs) = 6")}

-- Insert, as the route does.
DECLARE @inserted TABLE (id bigint, asset_no nvarchar(20));
INSERT @inserted EXEC sp_executesql N'${INSERT_SQL.replaceAll("'", "''")}',
  N'@customer bigint, @customer_site bigint, @project bigint, @monitor_site bigint, @monitor_program bigint, @category nvarchar(20),
    @name nvarchar(200), @manufacturer nvarchar(150), @model nvarchar(150), @serial nvarchar(150), @location nvarchar(300), @ip nvarchar(100),
    @firmware nvarchar(100), @repository nvarchar(100), @installed_on date, @warranty_until date, @status nvarchar(20), @replaced_by bigint,
    @notes nvarchar(2000), @actor bigint',
  @customer, @customer_site, @project, @monitor_site, @monitor_program, @category, @name, @manufacturer, @model, @serial, @location, @ip,
  @firmware, @repository, @installed_on, @warranty_until, @status, @replaced_by, @notes, @actor;
SELECT @id = id FROM @inserted;
${check("asset number derived from the identity", "(SELECT asset_no FROM @inserted) = CONCAT(N'AST-', RIGHT(CONCAT(N'000000', @id), 6))")}

SET @kind = N'Installed'; SET @summary = N'Edge Gateway Line 3'; SET @details = N'{"status":"Active"}';
EXEC sp_executesql N'${EVENT_INSERT_SQL.replaceAll("'", "''")}',
  N'@asset bigint, @kind nvarchar(20), @summary nvarchar(500), @details nvarchar(max), @actor bigint', @id, @kind, @summary, @details, @actor;

-- The same serial from the same maker is refused.
BEGIN TRY
  EXEC sp_executesql N'${INSERT_SQL.replaceAll("'", "''")}',
    N'@customer bigint, @customer_site bigint, @project bigint, @monitor_site bigint, @monitor_program bigint, @category nvarchar(20),
      @name nvarchar(200), @manufacturer nvarchar(150), @model nvarchar(150), @serial nvarchar(150), @location nvarchar(300), @ip nvarchar(100),
      @firmware nvarchar(100), @repository nvarchar(100), @installed_on date, @warranty_until date, @status nvarchar(20), @replaced_by bigint,
      @notes nvarchar(2000), @actor bigint',
    @customer, NULL, NULL, NULL, NULL, @category, N'Duplicate', @manufacturer, @model, @serial, N'', N'', N'', N'', NULL, NULL,
    N'Active', NULL, N'', @actor;
  THROW 51999, N'Smoke check failed: a duplicate serial was accepted', 1;
END TRY
BEGIN CATCH
  IF ERROR_NUMBER() NOT IN (2601, 2627) THROW;
END CATCH;

-- List: the page and both facets, with filters on and off.
EXEC sp_executesql N'${LIST_SQL.replaceAll("'", "''")}',
  N'@customer bigint, @customer_site bigint, @project bigint, @monitor_site bigint, @monitor_program bigint, @search nvarchar(200),
    @warranty nvarchar(20), @today date, @category nvarchar(20), @status nvarchar(20), @offset int, @page_size int',
  @customer, NULL, NULL, NULL, NULL, N'MDB', N'expiring', @today, NULL, NULL, @offset, @page_size;

-- Detail, the locked read, and the timeline.
EXEC sp_executesql N'${DETAIL_SQL.replaceAll("'", "''")}', N'@id bigint', @id;
EXEC sp_executesql N'${DETAIL_FOR_UPDATE_SQL.replaceAll("'", "''")}', N'@id bigint', @id;
EXEC sp_executesql N'${EVENTS_SQL.replaceAll("'", "''")}', N'@id bigint', @id;

-- Update.
SET @firmware = N'1.1.0'; SET @status = N'Faulty';
EXEC sp_executesql N'${UPDATE_SQL.replaceAll("'", "''")}',
  N'@customer bigint, @customer_site bigint, @project bigint, @monitor_site bigint, @monitor_program bigint, @category nvarchar(20),
    @name nvarchar(200), @manufacturer nvarchar(150), @model nvarchar(150), @serial nvarchar(150), @location nvarchar(300), @ip nvarchar(100),
    @firmware nvarchar(100), @repository nvarchar(100), @installed_on date, @warranty_until date, @status nvarchar(20), @replaced_by bigint,
    @notes nvarchar(2000), @actor bigint, @id bigint',
  @customer, @customer_site, @project, @monitor_site, @monitor_program, @category, @name, @manufacturer, @model, @serial, @location, @ip,
  @firmware, @repository, @installed_on, @warranty_until, @status, @replaced_by, @notes, @actor, @id;
${check("update applied", "(SELECT firmware_version FROM dbo.installed_assets WHERE id = @id) = N'1.1.0'")}

-- A warranty before the installation date is refused by the table itself.
BEGIN TRY
  UPDATE dbo.installed_assets SET warranty_until = '2025-01-01' WHERE id = @id;
  THROW 51999, N'Smoke check failed: a warranty before installation was accepted', 1;
END TRY
BEGIN CATCH
  IF ERROR_NUMBER() <> 547 THROW;
END CATCH;

ROLLBACK TRANSACTION;
PRINT N'Installed Base SQL smoke passed.';
`;

process.stdout.write(batch);
