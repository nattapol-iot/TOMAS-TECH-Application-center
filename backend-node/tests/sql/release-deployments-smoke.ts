// Prints a T-SQL batch that runs the release deployment statements against a real schema, inside one
// transaction that is rolled back. Run by scripts/Test-SqlSmokeLocalDb.ps1 on a private LocalDB.
import {
  DEPLOYMENT_APPROVE_SQL, DEPLOYMENT_INSERT_SQL, DEPLOYMENT_SELECT, PROGRAM_STATE_SQL,
} from "../../src/routes/release-deployments.js";
import { CLAIM_COMMANDS_SQL, COMMAND_RESULT_SQL } from "../../src/routes/site-monitor.js";
import { EXPIRE_COMMANDS_SQL } from "../../src/site-monitor.js";

const q = (text: string) => `N'${text.replaceAll("'", "''")}'`;
const check = (label: string, condition: string) =>
  `IF NOT (${condition}) THROW 51999, N'Smoke check failed: ${label.replaceAll("'", "''")}', 1;`;
const expectError = (label: string, statement: string, numbers: number[]) => `
BEGIN TRY
  ${statement}
  THROW 51999, N'Smoke check failed: ${label.replaceAll("'", "''")} was accepted', 1;
END TRY
BEGIN CATCH
  IF ERROR_NUMBER() NOT IN (${numbers.join(", ")}) THROW;
END CATCH;`;

const insertParams = `N'@program bigint, @agent bigint, @repository nvarchar(100), @tag nvarchar(100), @release_name nvarchar(200),
  @asset_name nvarchar(255), @asset_size bigint, @sha256 char(64), @storage_key nvarchar(500), @note nvarchar(1000), @actor bigint,
  @previous_version nvarchar(100)'`;
const insert = (actor: string, tag: string) => `
DELETE FROM @new;
INSERT @new EXEC sp_executesql ${q(DEPLOYMENT_INSERT_SQL)}, ${insertParams},
  @program, @agent, N'fts-plc-collect-data', N'${tag}', N'Release ${tag}', N'collector.zip', 1024, @sha, N'monitor-deployments/x/collector.zip',
  N'', ${actor}, N'1.0.0';
SELECT @deployment = id FROM @new;`;
const approve = (actor: string) => `
DELETE FROM @commandOut;
INSERT @commandOut EXEC sp_executesql ${q(DEPLOYMENT_APPROVE_SQL)},
  N'@id bigint, @agent bigint, @program bigint, @actor bigint, @note nvarchar(1000)', @deployment, @agent, @program, ${actor}, N'ok';
SELECT @command = id FROM @commandOut;`;
const claim = `
DELETE FROM @claimed;
INSERT @claimed EXEC sp_executesql ${q(CLAIM_COMMANDS_SQL)}, N'@agent bigint', @agent;`;
const result = (success: number, rolledBack: number, version: string) => `
DELETE FROM @resultOut;
INSERT @resultOut EXEC sp_executesql ${q(COMMAND_RESULT_SQL)},
  N'@id bigint, @agent bigint, @success bit, @rolled_back bit, @version nvarchar(100), @message nvarchar(1000)',
  @command, @agent, ${success}, ${rolledBack}, ${version}, N'agent says';`;

const batch = `
SET NOCOUNT ON;
SET XACT_ABORT OFF;
BEGIN TRANSACTION;
DECLARE @a bigint, @b bigint, @site bigint, @agent bigint, @program bigint, @customer bigint, @asset bigint, @deployment bigint, @command bigint,
  @sha char(64) = REPLICATE('ab', 32);
DECLARE @new TABLE (id bigint);
DECLARE @commandOut TABLE (id bigint);
DECLARE @claimed TABLE (id bigint, verb nvarchar(10), program_key nvarchar(64), deployment_id bigint, asset_name nvarchar(255), asset_size bigint, sha256 char(64));
DECLARE @resultOut TABLE (updated int);

INSERT dbo.users (entra_object_id, email, name, role_id, department)
SELECT CONVERT(nvarchar(64), NEWID()), N'requester@tomastc.com', N'Requester', id, N'IoT' FROM dbo.roles WHERE code = N'Admin';
SET @a = SCOPE_IDENTITY();
INSERT dbo.users (entra_object_id, email, name, role_id, department)
SELECT CONVERT(nvarchar(64), NEWID()), N'approver@tomastc.com', N'Approver', id, N'IoT' FROM dbo.roles WHERE code = N'Admin';
SET @b = SCOPE_IDENTITY();
INSERT dbo.monitor_sites (name, created_by) VALUES (N'Deploy Smoke Site', @a); SET @site = SCOPE_IDENTITY();
INSERT dbo.monitor_agents (site_id, name, key_hash, key_hint, created_by, is_online, allows_control)
VALUES (@site, N'PC-1', REPLICATE(N'b', 64), N'abcd', @a, 1, 1); SET @agent = SCOPE_IDENTITY();
INSERT dbo.monitor_programs (agent_id, program_key, name, reported_at, version, repository)
VALUES (@agent, N'collector', N'Collector', SYSUTCDATETIME(), N'1.0.0', N'fts-plc-collect-data'); SET @program = SCOPE_IDENTITY();
INSERT dbo.customers (code, name, created_by, updated_by) VALUES (N'DSMOKE', N'Deploy Smoke', @a, @a); SET @customer = SCOPE_IDENTITY();
INSERT dbo.installed_assets (asset_seq, customer_id, monitor_site_id, monitor_program_id, category, name, firmware_version, created_by, updated_by)
VALUES ((SELECT ISNULL(MAX(asset_seq), 0) + 1 FROM dbo.installed_assets WHERE deleted_at IS NULL), @customer, @site, @program, N'Software', N'Collector service', N'1.0.0', @a, @a); SET @asset = SCOPE_IDENTITY();

-- The program state the routes check.
DECLARE @state TABLE (id bigint, name nvarchar(200), version nvarchar(100), repository nvarchar(100), removed_at datetimeoffset(0), agent_id bigint,
  agent_name nvarchar(150), is_online bit, allows_control bit, revoked_at datetimeoffset(0), site_name nvarchar(150), site_active bit);
INSERT @state EXEC sp_executesql ${q(PROGRAM_STATE_SQL)}, N'@id bigint', @program;
${check("program state read", "(SELECT repository FROM @state) = N'fts-plc-collect-data'")}

-- 1. Request, approve by someone else, deliver, succeed.
${insert("@a", "v1.1.0")}
${check("deployment pending", "(SELECT status FROM dbo.monitor_deployments WHERE id = @deployment) = N'PendingApproval'")}
${expectError("a second open deployment for the same program", `INSERT dbo.monitor_deployments (program_id, agent_id, repository, release_tag, asset_name,
  asset_size, sha256, storage_key, requested_by) VALUES (@program, @agent, N'r', N'v1.1.1', N'c.zip', 1, @sha, N'k', @a);`, [2601, 2627])}
${expectError("approval by the requester", `UPDATE dbo.monitor_deployments SET status = N'Approved', decided_by = @a, decided_at = SYSUTCDATETIME() WHERE id = @deployment;`, [547])}
${approve("@b")}
${check("deployment approved with its command", "EXISTS (SELECT 1 FROM dbo.monitor_deployments WHERE id = @deployment AND status = N'Approved' AND command_id = @command AND decided_by = @b)")}
${expectError("a manual command while an update is in flight", `INSERT dbo.monitor_commands (agent_id, program_id, verb, requested_by) VALUES (@agent, @program, N'Restart', @a);`, [2601, 2627])}
${expectError("an Update command without a deployment", `INSERT dbo.monitor_commands (agent_id, program_id, verb, requested_by) VALUES (@agent, @program, N'Update', @a);`, [547, 2601, 2627])}
${claim}
${check("claimed command carries the release", "(SELECT COUNT(*) FROM @claimed WHERE verb = N'Update' AND deployment_id = @deployment AND sha256 = @sha AND asset_size = 1024) = 1")}
${check("deployment delivered", "(SELECT status FROM dbo.monitor_deployments WHERE id = @deployment) = N'Delivered'")}
${result(1, 0, "N'1.1.0'")}
${check("result recorded", "(SELECT updated FROM @resultOut) = 1")}
${check("deployment succeeded", "EXISTS (SELECT 1 FROM dbo.monitor_deployments WHERE id = @deployment AND status = N'Succeeded' AND new_version = N'1.1.0')")}
${check("program version updated", "(SELECT version FROM dbo.monitor_programs WHERE id = @program) = N'1.1.0'")}
${check("linked asset updated", "(SELECT firmware_version FROM dbo.installed_assets WHERE id = @asset) = N'1.1.0'")}
${check("asset timeline has the deployment", "EXISTS (SELECT 1 FROM dbo.installed_asset_events WHERE asset_id = @asset AND kind = N'Deployed' AND summary LIKE N'1.0.0 → 1.1.0%' AND ISJSON(details) = 1)")}

-- 2. A failed update that the agent rolled back.
${insert("@a", "v1.2.0")}
${approve("@b")}
${claim}
${result(0, 1, "N'1.1.0'")}
${check("rolled back", "EXISTS (SELECT 1 FROM dbo.monitor_deployments WHERE id = @deployment AND status = N'RolledBack' AND new_version IS NULL)")}
${check("version untouched after a rollback", "(SELECT firmware_version FROM dbo.installed_assets WHERE id = @asset) = N'1.1.0'")}

-- 3. An approved update the machine never picked up expires with its command.
${insert("@a", "v1.3.0")}
${approve("@b")}
UPDATE dbo.monitor_commands SET requested_at = DATEADD(hour, -1, SYSUTCDATETIME()) WHERE id = @command;
EXEC sp_executesql ${q(EXPIRE_COMMANDS_SQL)};
${check("expired with the command", "(SELECT status FROM dbo.monitor_deployments WHERE id = @deployment) = N'Expired'")}

-- The list the screen reads.
EXEC sp_executesql ${q(`${DEPLOYMENT_SELECT} WHERE (@site IS NULL OR s.id = @site) ORDER BY d.requested_at DESC;`)}, N'@site bigint', @site;

ROLLBACK TRANSACTION;
PRINT N'Release deployment SQL smoke passed.';
`;

process.stdout.write(batch);
