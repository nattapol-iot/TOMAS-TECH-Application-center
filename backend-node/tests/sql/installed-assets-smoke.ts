// Prints a T-SQL batch that runs the Installed Base route's own statements against a real schema:
//   node --import tsx tests/sql/installed-assets-smoke.ts > smoke.sql
//   sqlcmd -S <server> -d <database> -b -i smoke.sql
// Used by scripts/Test-SqlSmokeLocalDb.ps1 on a private LocalDB instance. Each statement is
// the exported constant the route sends, with its parameters declared, so a typo in a column, a
// join or a filter fails here instead of in production.
import {
  CABINET_DELETE_SQL, CABINET_FOR_UPDATE_SQL, CABINET_INSERT_SQL, CABINET_REFERENCES_SQL, CABINET_UPDATE_SQL, CABINETS_SQL,
  DETAIL_FOR_UPDATE_SQL, DETAIL_SQL, EVENT_INSERT_SQL, EVENTS_SQL, INSERT_SQL, LIST_SQL, REFERENCES_SQL, UPDATE_SQL,
} from "../../src/routes/installed-assets.js";

const sqlText = (statement: string) => statement.replaceAll("'", "''");
const ASSET_PARAMS = `@customer bigint, @customer_site bigint, @cabinet bigint, @project bigint, @monitor_site bigint, @monitor_program bigint,
    @category nvarchar(20), @name nvarchar(200), @manufacturer nvarchar(150), @model nvarchar(150), @serial nvarchar(150), @location nvarchar(300),
    @ip nvarchar(100), @firmware nvarchar(100), @repository nvarchar(100), @installed_on date, @warranty_until date, @status nvarchar(20),
    @replaced_by bigint, @notes nvarchar(2000), @actor bigint`;
const CABINET_PARAMS = "@customer bigint, @customer_site bigint, @name nvarchar(200), @location nvarchar(300), @notes nvarchar(1000), @actor bigint";

const declare = `
DECLARE @customer bigint, @customer_site bigint, @cabinet bigint = NULL, @other_customer bigint, @project bigint = NULL, @monitor_site bigint, @monitor_program bigint,
  @replaced_by bigint = NULL, @asset bigint = NULL, @id bigint, @actor bigint,
  @category nvarchar(20) = N'Gateway', @name nvarchar(200) = N'Edge Gateway Line 3', @manufacturer nvarchar(150) = N'Advantech',
  @model nvarchar(150) = N'ECU-1251', @serial nvarchar(150) = N'SN-001', @location nvarchar(300) = N'MDB 2F',
  @ip nvarchar(100) = N'10.0.0.5', @firmware nvarchar(100) = N'1.0.0', @repository nvarchar(100) = N'fts-plc-collect-data',
  @installed_on date = '2026-01-15', @warranty_until date = '2026-11-01', @status nvarchar(20) = N'Active', @notes nvarchar(2000) = N'',
  @search nvarchar(200) = NULL, @warranty nvarchar(20) = NULL, @today date = '2026-10-12', @offset int = 0, @page_size int = 50,
  @kind nvarchar(20), @summary nvarchar(500), @details nvarchar(max), @sort nvarchar(20) = N'location',
  @expected_no nvarchar(20), @deleted_no nvarchar(20), @second bigint;`;

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
INSERT dbo.customers (code, name, created_by, updated_by) VALUES (N'SMOKE2', N'Other Customer', @actor, @actor);
SET @other_customer = SCOPE_IDENTITY();
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
-- A cabinet of this customer at this site, through the route's own statements.
DECLARE @cabinet_refs TABLE (customer_ok int, site_ok int);
INSERT @cabinet_refs EXEC sp_executesql N'${sqlText(CABINET_REFERENCES_SQL)}', N'@customer bigint, @customer_site bigint', @customer, @customer_site;
${check("cabinet references accepted", "(SELECT customer_ok + site_ok FROM @cabinet_refs) = 2")}
DECLARE @cabinet_inserted TABLE (id bigint);
INSERT @cabinet_inserted EXEC sp_executesql N'${sqlText(CABINET_INSERT_SQL)}', N'${CABINET_PARAMS}',
  @customer, @customer_site, N'MDB-01', N'Building A 2F', N'', @actor;
SELECT @cabinet = id FROM @cabinet_inserted;
-- A second live cabinet with the same name at the same customer is refused; another customer may use it.
BEGIN TRY
  EXEC sp_executesql N'${sqlText(CABINET_INSERT_SQL)}', N'${CABINET_PARAMS}', @customer, NULL, N'MDB-01', N'', N'', @actor;
  THROW 51999, N'Smoke check failed: a duplicate cabinet name was accepted', 1;
END TRY
BEGIN CATCH
  IF ERROR_NUMBER() NOT IN (2601, 2627) OR ERROR_MESSAGE() NOT LIKE N'%UQ_installed_cabinets_name%' THROW;
END CATCH;
EXEC sp_executesql N'${sqlText(CABINET_INSERT_SQL)}', N'${CABINET_PARAMS}', @other_customer, NULL, N'MDB-01', N'', N'', @actor;

-- References: a consistent set passes, a program from another site does not.
DECLARE @refs TABLE (customer_ok int, site_ok int, cabinet_ok int, project_ok int, monitor_site_ok int, program_ok int, replaced_ok int);
INSERT @refs EXEC sp_executesql N'${sqlText(REFERENCES_SQL)}',
  N'@customer bigint, @customer_site bigint, @cabinet bigint, @project bigint, @monitor_site bigint, @monitor_program bigint, @replaced_by bigint, @asset bigint',
  @customer, @customer_site, @cabinet, @project, @monitor_site, @monitor_program, @replaced_by, @asset;
${check("references accepted", "(SELECT customer_ok + site_ok + cabinet_ok + project_ok + monitor_site_ok + program_ok + replaced_ok FROM @refs) = 7")}
-- The same cabinet is not another customer's.
DELETE @refs;
INSERT @refs EXEC sp_executesql N'${sqlText(REFERENCES_SQL)}',
  N'@customer bigint, @customer_site bigint, @cabinet bigint, @project bigint, @monitor_site bigint, @monitor_program bigint, @replaced_by bigint, @asset bigint',
  @other_customer, NULL, @cabinet, NULL, NULL, NULL, NULL, NULL;
${check("a cabinet of another customer is refused", "(SELECT cabinet_ok FROM @refs) = 0")}

-- Insert, as the route does.
SET @expected_no = (SELECT CONCAT(N'AST-', RIGHT(CONCAT(N'000000', ISNULL(MAX(asset_seq), 0) + 1), 6)) FROM dbo.installed_assets WHERE deleted_at IS NULL);
DECLARE @inserted TABLE (id bigint, asset_no nvarchar(20));
INSERT @inserted EXEC sp_executesql N'${sqlText(INSERT_SQL)}', N'${ASSET_PARAMS}',
  @customer, @customer_site, @cabinet, @project, @monitor_site, @monitor_program, @category, @name, @manufacturer, @model, @serial, @location, @ip,
  @firmware, @repository, @installed_on, @warranty_until, @status, @replaced_by, @notes, @actor;
SELECT @id = id FROM @inserted;
${check("asset number is the highest live number + 1", "(SELECT asset_no FROM @inserted) = @expected_no")}
${check("asset placed in the cabinet", "(SELECT cabinet_id FROM dbo.installed_assets WHERE id = @id) = @cabinet")}

SET @kind = N'Installed'; SET @summary = N'Edge Gateway Line 3'; SET @details = N'{"status":"Active"}';
EXEC sp_executesql N'${EVENT_INSERT_SQL.replaceAll("'", "''")}',
  N'@asset bigint, @kind nvarchar(20), @summary nvarchar(500), @details nvarchar(max), @actor bigint', @id, @kind, @summary, @details, @actor;

-- The same serial from the same maker is refused.
BEGIN TRY
  EXEC sp_executesql N'${sqlText(INSERT_SQL)}', N'${ASSET_PARAMS}',
    @customer, NULL, NULL, NULL, NULL, NULL, @category, N'Duplicate', @manufacturer, @model, @serial, N'', N'', N'', N'', NULL, NULL,
    N'Active', NULL, N'', @actor;
  THROW 51999, N'Smoke check failed: a duplicate serial was accepted', 1;
END TRY
BEGIN CATCH
  IF ERROR_NUMBER() NOT IN (2601, 2627) OR ERROR_MESSAGE() NOT LIKE N'%UQ_installed_assets_serial%' THROW;
END CATCH;

-- List: the page and both facets, with filters on and off.
EXEC sp_executesql N'${sqlText(LIST_SQL)}',
  N'@customer bigint, @customer_site bigint, @cabinet bigint, @sort nvarchar(20), @project bigint, @monitor_site bigint, @monitor_program bigint,
    @search nvarchar(200), @warranty nvarchar(20), @today date, @category nvarchar(20), @status nvarchar(20), @offset int, @page_size int',
  @customer, NULL, @cabinet, @sort, NULL, NULL, NULL, N'MDB', N'expiring', @today, NULL, NULL, @offset, @page_size;
EXEC sp_executesql N'${sqlText(LIST_SQL)}',
  N'@customer bigint, @customer_site bigint, @cabinet bigint, @sort nvarchar(20), @project bigint, @monitor_site bigint, @monitor_program bigint,
    @search nvarchar(200), @warranty nvarchar(20), @today date, @category nvarchar(20), @status nvarchar(20), @offset int, @page_size int',
  NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, @today, NULL, NULL, @offset, @page_size;

-- Cabinets with their counts, and the locked read the edit and delete use.
EXEC sp_executesql N'${sqlText(CABINETS_SQL)}', N'@cabinet bigint', NULL;
DECLARE @cabinet_state TABLE (customer_id bigint, customer_site_id bigint, name nvarchar(200), row_version binary(8), asset_count bigint, other_site_count bigint);
INSERT @cabinet_state EXEC sp_executesql N'${sqlText(CABINET_FOR_UPDATE_SQL)}', N'@id bigint, @customer_site bigint', @cabinet, @customer_site;
${check("cabinet counts its equipment", "(SELECT asset_count FROM @cabinet_state) = 1 AND (SELECT other_site_count FROM @cabinet_state) = 0")}
EXEC sp_executesql N'${sqlText(CABINET_UPDATE_SQL)}', N'${CABINET_PARAMS}, @id bigint',
  @customer, @customer_site, N'MDB-01A', N'Building A 2F', N'renamed', @actor, @cabinet;
${check("cabinet renamed", "(SELECT name FROM dbo.installed_cabinets WHERE id = @cabinet) = N'MDB-01A'")}

-- Detail, the locked read, and the timeline.
EXEC sp_executesql N'${sqlText(DETAIL_SQL)}', N'@id bigint', @id;
EXEC sp_executesql N'${sqlText(DETAIL_FOR_UPDATE_SQL)}', N'@id bigint', @id;
EXEC sp_executesql N'${sqlText(EVENTS_SQL)}', N'@id bigint', @id;

-- Update.
SET @firmware = N'1.1.0'; SET @status = N'Faulty';
EXEC sp_executesql N'${sqlText(UPDATE_SQL)}', N'${ASSET_PARAMS}, @id bigint',
  @customer, @customer_site, @cabinet, @project, @monitor_site, @monitor_program, @category, @name, @manufacturer, @model, @serial, @location, @ip,
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

-- Delete the newest asset, register again: the number is issued again rather than skipped.
SELECT @deleted_no = asset_no FROM dbo.installed_assets WHERE id = @id;
${check("the smoke asset holds the highest live number", "@deleted_no = (SELECT MAX(asset_no) FROM dbo.installed_assets WHERE deleted_at IS NULL)")}
UPDATE dbo.installed_assets SET deleted_at = SYSUTCDATETIME() WHERE id = @id;
DELETE @inserted;
INSERT @inserted EXEC sp_executesql N'${sqlText(INSERT_SQL)}', N'${ASSET_PARAMS}',
  @customer, NULL, NULL, NULL, NULL, NULL, @category, N'Re-registered', @manufacturer, @model, N'SN-002', N'', N'', N'', N'', NULL, NULL,
  N'Active', NULL, N'', @actor;
SELECT @second = id FROM @inserted;
${check("a freed number is issued again", "(SELECT asset_no FROM @inserted) = @deleted_no")}

-- An empty cabinet can be withdrawn; the delete statement is the route's.
UPDATE dbo.installed_assets SET cabinet_id = NULL WHERE cabinet_id = @cabinet;
EXEC sp_executesql N'${sqlText(CABINET_DELETE_SQL)}', N'@id bigint, @actor bigint', @cabinet, @actor;
${check("cabinet withdrawn", "(SELECT deleted_at FROM dbo.installed_cabinets WHERE id = @cabinet) IS NOT NULL")}

ROLLBACK TRANSACTION;
PRINT N'Installed Base SQL smoke passed.';
`;

process.stdout.write(batch);
